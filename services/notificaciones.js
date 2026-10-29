/**
 * services/notificaciones.js — Servicio unificado de notificaciones (WhatsApp, correo, SMS).
 *
 *  - Cada canal es un adaptador: WhatsApp (Evolution API, services/whatsappService.js),
 *    correo (Amazon SES o SMTP de la empresa) y SMS (Twilio o Infobip).
 *  - enviar(): envía por un canal y deja constancia en notificaciones_envios. Nunca lanza error:
 *    un fallo de notificación no debe tumbar la operación que la origina.
 *  - disparar(): envía un evento según su regla (canales y destinatarios) configurada en la pantalla.
 *
 * Credenciales: nunca en la base. Van en el .env (EVOLUTION_*, AWS_*, TWILIO_*, INFOBIP_*).
 */
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const nodemailer = require('nodemailer');

const push = require('./push');

const CANALES = ['whatsapp', 'email', 'sms', 'push'];

/** Pantalla que abre el aviso al tocarlo en el teléfono (canal push) */
const URL_EVENTO = {
  oc_aprobacion: '/app/gerencia/aprobaciones-oc',
  oc_pagar: '/app/tesoreria/pago-requerimientos',
  oc_voucher: '/app/almacen/entradas',
};

/** Eventos del ERP que pueden disparar una notificación, con su canal por defecto */
const EVENTOS = [
  { evento: 'oc_aprobacion', titulo: 'Aprobación de orden de compra', detalle: 'Aviso adicional cuando hay una OC por aprobar (correo, WhatsApp o avisos en el teléfono). Al aprobador ya le llega el WhatsApp con el enlace para aprobar, y no se le repite.', canales: ['whatsapp'], destinatarios: process.env.GERENCIA_WHATSAPP || '' },
  { evento: 'oc_pagar', titulo: 'Orden de compra aprobada: pagar', detalle: 'Avisa a Tesorería cuando una OC queda aprobada, con el monto y la cuenta del proveedor. Llega a todos los usuarios con permiso de Tesorería; los destinatarios adicionales son opcionales.', canales: ['push'], destinatarios: '' },
  { evento: 'oc_voucher', titulo: 'Comprobante de pago de OC', detalle: 'Avisa a Almacén cuando Tesorería registra el pago de una OC. Llega a todos los usuarios con permiso de Almacén; los destinatarios adicionales son opcionales.', canales: ['push'], destinatarios: '' },
  { evento: 'flota_vencimiento', titulo: 'Vencimiento de documentos de flota', detalle: 'Avisa a operaciones de documentos por vencer.', canales: ['email', 'whatsapp'], destinatarios: '' },
  { evento: 'ot_fin_rampa', titulo: 'Fin de OT o salida de rampa', detalle: 'Avisa a operaciones cuando una unidad sale de taller.', canales: ['whatsapp'], destinatarios: '' },
  { evento: 'checklist_critico', titulo: 'Alerta crítica de checklist', detalle: 'Avisa de fallas críticas detectadas por un conductor.', canales: ['sms', 'whatsapp'], destinatarios: '' },
];

const esEmail = d => d.includes('@');
const soloDigitos = d => String(d).replace(/\D/g, '');

function aPeru(numero) {
  const d = soloDigitos(numero);
  if (!d) return '';
  return d.length === 9 ? '51' + d : d;
}

/** Registra el intento en el historial. Nunca lanza. */
function registrar(db, { canal, destino, evento, asunto, estado, error, ref }) {
  return new Promise(resolve => {
    if (!db) return resolve(false);
    const ahora = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const sql = `INSERT INTO notificaciones_envios (canal, destinatario, evento, asunto, estado, error, proveedor_ref, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [canal, String(destino).slice(0, 160), evento || null, asunto ? String(asunto).slice(0, 200) : null,
      estado, error ? String(error).slice(0, 300) : null, ref ? String(ref).slice(0, 120) : null, ahora];
    const fin = err => { if (err) console.error('⚠️ Historial de notificaciones no guardado:', err.message); resolve(!err); };
    if (typeof db.promise === 'function') db.query(sql, params, fin);
    else db.query(sql, params).then(() => fin(null), fin);
  });
}

// ── Canal WhatsApp (Evolution API) ─────────────────────────────────────────
async function estadoWhatsapp(instancia) {
  const base = (process.env.EVOLUTION_API_URL || 'http://82.39.109.226:8085').replace(/\/$/, '');
  const key = process.env.EVOLUTION_API_KEY || 'AZKELL_ERP_WA_SECRET_2026';
  const inst = instancia || process.env.EVOLUTION_INSTANCE || 'marsisa_bot';
  try {
    const r = await fetch(`${base}/instance/connectionState/${encodeURIComponent(inst)}`, { headers: { apikey: key } });
    if (!r.ok) return { configurado: true, instancia: inst, estado: 'error', detalle: `HTTP ${r.status}` };
    const j = await r.json();
    const state = j?.instance?.state || j?.state || 'desconocido';
    return { configurado: true, instancia: inst, estado: state === 'open' ? 'conectado' : 'desconectado', raw: state };
  } catch (e) {
    return { configurado: true, instancia: inst, estado: 'error', detalle: e.message };
  }
}

async function enviarWhatsapp(destino, texto, instancia) {
  const numero = aPeru(destino);
  if (!numero) throw new Error('Número de WhatsApp inválido');
  const base = (process.env.EVOLUTION_API_URL || 'http://82.39.109.226:8085').replace(/\/$/, '');
  const key = process.env.EVOLUTION_API_KEY || 'AZKELL_ERP_WA_SECRET_2026';
  const inst = instancia || process.env.EVOLUTION_INSTANCE || 'marsisa_bot';
  const r = await fetch(`${base}/message/sendText/${encodeURIComponent(inst)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify({ number: numero, text: texto }),
  });
  if (!r.ok) throw new Error(`Evolution HTTP ${r.status}`);
  const j = await r.json().catch(() => ({}));
  return j?.key?.id || null;
}

// ── Canal correo: Amazon SES (API) o SMTP de la empresa ──────────────────
async function configCorreo(db) {
  const filas = await new Promise(resolve => {
    db.query('SELECT * FROM configuracion_email ORDER BY id DESC LIMIT 1', (err, r) => resolve(err ? [] : r));
  });
  const f = (filas && filas[0]) || {};
  return {
    proveedor: await proveedorCorreo(db),
    from_name: f.from_name || 'Azkell ERP',
    from_email: f.from_email || f.smtp_user || '',
    smtp: { host: f.smtp_host, port: Number(f.smtp_port) || 587, secure: !!f.smtp_secure, user: f.smtp_user, pass: f.smtp_pass },
  };
}

function proveedorCorreo(db) {
  return new Promise(resolve => {
    db.query("SELECT valor FROM configuracion_erp WHERE clave = 'notif_email_proveedor'", (err, r) => {
      resolve(!err && r && r[0] ? r[0].valor : 'ses');
    });
  });
}

async function enviarCorreo(db, destino, asunto, texto) {
  const c = await configCorreo(db);
  if (!c.from_email) throw new Error('Falta el correo del remitente (Configuración de correo)');
  if (c.proveedor === 'smtp') {
    if (!c.smtp.host) throw new Error('Falta el servidor SMTP');
    const t = nodemailer.createTransport({ host: c.smtp.host, port: c.smtp.port, secure: c.smtp.secure, auth: c.smtp.user ? { user: c.smtp.user, pass: c.smtp.pass } : undefined });
    const info = await t.sendMail({ from: `"${c.from_name}" <${c.from_email}>`, to: destino, subject: asunto, text: texto });
    return info.messageId || null;
  }
  const region = process.env.AWS_REGION;
  if (!region) throw new Error('Falta AWS_REGION en el .env');
  const ses = new SESv2Client({ region });
  const out = await ses.send(new SendEmailCommand({
    FromEmailAddress: `${c.from_name} <${c.from_email}>`,
    Destination: { ToAddresses: [destino] },
    Content: { Simple: { Subject: { Data: asunto, Charset: 'UTF-8' }, Body: { Text: { Data: texto, Charset: 'UTF-8' } } } },
  }));
  return out.MessageId || null;
}

// ── Canal SMS: Twilio o Infobip (credenciales en el .env) ──────────────────
async function proveedorSms(db) {
  return new Promise(resolve => {
    db.query("SELECT clave, valor FROM configuracion_erp WHERE clave IN ('notif_sms_proveedor','notif_sms_activo')", (err, r) => {
      const m = {};
      (r || []).forEach(x => { m[x.clave] = x.valor; });
      resolve({ proveedor: m.notif_sms_proveedor || 'twilio', activo: m.notif_sms_activo === '1' });
    });
  });
}

async function enviarSms(db, destino, texto) {
  const { proveedor } = await proveedorSms(db);
  const numero = '+' + aPeru(destino);
  if (proveedor === 'twilio') {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;
    if (!sid || !token || !from) throw new Error('Faltan credenciales de Twilio en el .env');
    const body = new URLSearchParams({ To: numero, From: from, Body: texto });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || `Twilio HTTP ${r.status}`);
    return j.sid || null;
  }
  if (proveedor === 'infobip') {
    const { INFOBIP_API_KEY: key, INFOBIP_BASE_URL: base, INFOBIP_SENDER: sender } = process.env;
    if (!key || !base || !sender) throw new Error('Faltan credenciales de Infobip en el .env');
    const r = await fetch(`${base.replace(/\/$/, '')}/sms/2/text/advanced`, {
      method: 'POST', headers: { Authorization: `App ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ messages: [{ from: sender, destinations: [{ to: numero }], text: texto }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.requestError?.serviceException?.text || `Infobip HTTP ${r.status}`);
    return j.messages?.[0]?.messageId || null;
  }
  throw new Error(`Proveedor de SMS no soportado: ${proveedor}`);
}

// ── Envío único y disparo por evento ───────────────────────────────────────
/** Envía por un canal y deja constancia. Devuelve { ok, ref?, error? }. Nunca lanza. */
async function enviar(db, { canal, destino, asunto, texto, evento }) {
  try {
    if (!CANALES.includes(canal)) throw new Error('Canal no válido');
    if (!destino) throw new Error('Falta el destinatario');
    let ref = null;
    if (canal === 'whatsapp') ref = await enviarWhatsapp(destino, texto);
    if (canal === 'email') ref = await enviarCorreo(db, destino, asunto || 'Notificación del ERP', texto);
    if (canal === 'sms') ref = await enviarSms(db, destino, texto);
    if (canal === 'push') {
      // En el canal push el destinatario es un correo: se envía a todos sus teléfonos con las notificaciones activadas
      const enviados = await push.enviarA(db, destino, { titulo: asunto || 'Azkell Fleet', cuerpo: texto, url: URL_EVENTO[evento] || '/app', tag: `${evento}:${destino}` });
      if (!enviados) throw new Error('Sin dispositivo con notificaciones activadas');
      ref = `push:${enviados}`;
    }
    await registrar(db, { canal, destino, evento, asunto, estado: 'ENVIADO', ref });
    return { ok: true, ref };
  } catch (e) {
    await registrar(db, { canal, destino, evento, asunto, estado: 'FALLIDO', error: e.message });
    return { ok: false, error: e.message };
  }
}

/** Reglas guardadas por evento (o los valores por defecto si aún no hay regla) */
function reglasDe(db) {
  return new Promise(resolve => {
    db.query('SELECT evento, activo, canales, destinatarios FROM notificaciones_reglas', (err, filas) => {
      const guardadas = {};
      (filas || []).forEach(f => { guardadas[f.evento] = f; });
      resolve(EVENTOS.map(e => {
        const g = guardadas[e.evento];
        return g
          ? { evento: e.evento, titulo: e.titulo, detalle: e.detalle, activo: !!g.activo, canales: g.canales ? g.canales.split(',') : [], destinatarios: g.destinatarios }
          : { evento: e.evento, titulo: e.titulo, detalle: e.detalle, activo: false, canales: e.canales, destinatarios: e.destinatarios };
      }));
    });
  });
}

/** Dispara un evento según su regla. Cada destinatario recibe por los canales que le corresponden. */
/** ¿El SMS está listo? Activado en la pantalla y con credenciales del proveedor elegido en el .env */
async function smsConfigurado(db) {
  const { proveedor, activo } = await proveedorSms(db);
  if (!activo) return false;
  if (proveedor === 'twilio') return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
  if (proveedor === 'infobip') return !!(process.env.INFOBIP_API_KEY && process.env.INFOBIP_BASE_URL && process.env.INFOBIP_SENDER);
  return false;
}

// ── Destinatarios automáticos del canal «Teléfono (app)» ─────────────────────
// Quién recibe cada aviso lo decide el permiso del usuario (rol + permisos propios), igual que el inicio de sesión.
const PERMISO_AVISO = {
  oc_aprobacion: { modulos: ['gerencia_aprobaciones_oc'], accion: 'e' },   // aprobadores (Gerencia)
  oc_pagar: { modulos: ['tesoreria_pagos', 'tesoreria_caja'], accion: 'l' }, // Tesorería
  oc_voucher: { modulos: ['ent_inv', 'rec_compras'], accion: 'l' },          // Almacén / logística
};

function permisosDe(u) {
  const aJson = (v) => { try { return typeof v === 'string' ? JSON.parse(v || '{}') : (v || {}); } catch (_) { return {}; } };
  const rol = aJson(u.rol_permisos);
  const propios = aJson(u.permisos_json);
  const merged = { ...rol };
  for (const k of Object.keys(propios)) {
    if (!merged[k]) merged[k] = propios[k];
    else if (typeof propios[k] === 'object' && typeof merged[k] === 'object') merged[k] = { ...merged[k], ...propios[k] };
  }
  return merged;
}

function tienePermiso(permisos, modulo, accion) {
  const v = permisos[modulo];
  if (v === true) return true;
  return !!(v && typeof v === 'object' && v[accion]);
}

/** Correos (en minúsculas) de los usuarios activos con el permiso del evento. El administrador cuenta con todos. */
async function correosConPermiso(db, evento) {
  const cfg = PERMISO_AVISO[evento];
  if (!cfg) return [];
  const filas = await new Promise((resolve, reject) => db.query(
    `SELECT u.correo, u.estado, u.permisos_json, u.rol_id, r.permisos_json AS rol_permisos, r.es_admin
       FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id`,
    (err, rows) => (err ? reject(err) : resolve(rows || []))));
  const correos = new Set();
  for (const u of filas) {
    if (!u.correo || String(u.estado || '').toLowerCase() === 'inactivo') continue;
    const permisos = permisosDe(u);
    const admin = String(u.correo).toLowerCase() === 'admin@azkell.com' || !!u.es_admin || permisos.admin === true;
    if (admin || cfg.modulos.some(m => tienePermiso(permisos, m, cfg.accion))) correos.add(String(u.correo).toLowerCase());
  }
  return [...correos];
}

/**
 * Dispara un evento según su regla (canales y destinatarios de la pantalla).
 * `excluir`: destinatarios que ya recibieron este aviso por otra vía (evita mensajes dobles).
 * El SMS es secundario: si no está configurado, se omite sin ensuciar el historial.
 */
async function disparar(db, evento, { asunto, texto, excluir = [] }) {
  const regla = (await reglasDe(db)).find(r => r.evento === evento);
  if (!regla || !regla.activo) return { enviados: 0, motivo: 'regla inactiva' };
  const fuera = new Set(excluir.filter(Boolean).map(x => (esEmail(String(x)) ? String(x).toLowerCase() : aPeru(x))));
  const destinos = regla.destinatarios.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean)
    .filter(d => !fuera.has(esEmail(d) ? d.toLowerCase() : aPeru(d)));
  // Teléfono (app): los destinatarios salen de los permisos de cada usuario; lo escrito en la regla son extras
  const extras = regla.destinatarios.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean)
    .filter(d => !fuera.has(d.toLowerCase()));
  const automaticos = regla.canales.includes('push') ? await correosConPermiso(db, evento).catch(() => []) : [];
  const resultados = [];
  for (const canal of regla.canales) {
    if (canal === 'sms' && !(await smsConfigurado(db))) continue;
    const para = canal === 'push'
      ? [...new Set([...automaticos, ...extras.map(d => d.toLowerCase())])]
      : destinos.filter(d => (canal === 'email' ? esEmail(d) : !esEmail(d)));
    for (const destino of para) resultados.push(await enviar(db, { canal, destino, asunto, texto, evento }));
  }
  return { enviados: resultados.filter(r => r.ok).length, fallidos: resultados.filter(r => !r.ok).length };
}

module.exports = { CANALES, EVENTOS, estadoWhatsapp, enviar, disparar, reglasDe, proveedorSms, proveedorCorreo, smsConfigurado, aPeru, correosConPermiso };
