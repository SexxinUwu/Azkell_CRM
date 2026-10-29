// Notificaciones unificadas: canales, reglas por evento, prueba manual e historial.
const express = require('express');
const notif = require('../services/notificaciones');
const eventos = require('../services/notificaciones_eventos');
const { audit, actorFrom, diff } = require('../services/auditoria');

function leerClaves(db, claves) {
  return new Promise(resolve => {
    db.query('SELECT clave, valor FROM configuracion_erp WHERE clave IN (?)', [claves], (err, filas) => {
      const m = {};
      (filas || []).forEach(f => { m[f.clave] = f.valor; });
      resolve(m);
    });
  });
}

// Remitente de los correos: vive en la configuración de correo de la empresa
function leerRemitente(db) {
  return new Promise(resolve => {
    db.query('SELECT id, from_name, from_email FROM configuracion_email ORDER BY id DESC LIMIT 1', (err, filas) => {
      const f = (!err && filas && filas[0]) || {};
      resolve({ remitente_id: f.id || null, from_name: f.from_name || '', from_email: f.from_email || '' });
    });
  });
}

function guardarRemitente(db, nombre, correo) {
  return new Promise((resolve, reject) => {
    db.query('SELECT id FROM configuracion_email ORDER BY id DESC LIMIT 1', (err, filas) => {
      if (err) return reject(err);
      const fin = e => e ? reject(e) : resolve();
      if (filas && filas[0]) db.query('UPDATE configuracion_email SET from_name = ?, from_email = ? WHERE id = ?', [nombre, correo, filas[0].id], fin);
      else db.query('INSERT INTO configuracion_email (from_name, from_email) VALUES (?, ?)', [nombre, correo], fin);
    });
  });
}

function guardarClave(db, clave, valor) {
  return new Promise((resolve, reject) => {
    db.query('INSERT INTO configuracion_erp (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = ?', [clave, valor, valor],
      err => err ? reject(err) : resolve());
  });
}

module.exports = (db) => {
  const router = express.Router();

  // Estado de los tres canales
  router.get('/notificaciones/canales', async (req, res) => {
    const pool = req.db || db;
    try {
      const whatsapp = await notif.estadoWhatsapp();
      const correo = { proveedor: await notif.proveedorCorreo(pool) };
      const sms = await notif.proveedorSms(pool);
      const claves = await leerClaves(pool, ['notif_sms_proveedor', 'notif_sms_activo', 'notif_email_proveedor']);
      const remitente = await leerRemitente(pool);
      res.json({
        whatsapp,
        correo: { ...correo, ...remitente, proveedores: ['ses', 'smtp'] },
        sms: { proveedor: claves.notif_sms_proveedor || 'twilio', activo: claves.notif_sms_activo === '1', proveedores: ['twilio', 'infobip'] },
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Cambiar proveedor de correo o activar/proveedor de SMS (sin credenciales: esas van en el .env)
  router.put('/notificaciones/canales', async (req, res) => {
    const pool = req.db || db;
    const { correo_proveedor, sms_proveedor, sms_activo, from_name, from_email } = req.body || {};
    try {
      const antes = await leerClaves(pool, ['notif_email_proveedor', 'notif_sms_proveedor', 'notif_sms_activo']);
      const cambios = {};
      if (from_name !== undefined || from_email !== undefined) {
        const previo = await leerRemitente(pool);
        const nombre = String(from_name ?? previo.from_name).trim();
        const correo = String(from_email ?? previo.from_email).trim();
        if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return res.status(400).json({ error: 'Correo del remitente no válido' });
        await guardarRemitente(pool, nombre, correo);
        cambios.remitente = { from: `${previo.from_name} <${previo.from_email}>`, to: `${nombre} <${correo}>` };
      }
      if (correo_proveedor !== undefined) {
        if (!['ses', 'smtp'].includes(correo_proveedor)) return res.status(400).json({ error: 'Proveedor de correo no válido' });
        await guardarClave(pool, 'notif_email_proveedor', correo_proveedor);
        cambios.correo_proveedor = { from: antes.notif_email_proveedor || 'ses', to: correo_proveedor };
      }
      if (sms_proveedor !== undefined) {
        if (!['twilio', 'infobip'].includes(sms_proveedor)) return res.status(400).json({ error: 'Proveedor de SMS no válido' });
        await guardarClave(pool, 'notif_sms_proveedor', sms_proveedor);
        cambios.sms_proveedor = { from: antes.notif_sms_proveedor || 'twilio', to: sms_proveedor };
      }
      if (sms_activo !== undefined) {
        const valor = sms_activo ? '1' : '0';
        await guardarClave(pool, 'notif_sms_activo', valor);
        cambios.sms_activo = { from: antes.notif_sms_activo === '1', to: !!sms_activo };
      }
      if (Object.keys(cambios).length) {
        audit(pool, actorFrom(req), { action: 'UPDATE', entity: 'notification-channel', entityId: 'canales', summary: 'Cambió la configuración de canales de notificación', changes: cambios });
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Reglas por evento: qué canales y a quién
  router.get('/notificaciones/reglas', async (req, res) => {
    try { res.json(await notif.reglasDe(req.db || db)); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/notificaciones/reglas/:evento', (req, res) => {
    const pool = req.db || db;
    const evento = req.params.evento;
    const def = notif.EVENTOS.find(e => e.evento === evento);
    if (!def) return res.status(404).json({ error: 'Evento no existe' });
    const canales = (Array.isArray(req.body.canales) ? req.body.canales : []).filter(c => notif.CANALES.includes(c));
    const destinatarios = String(req.body.destinatarios || '').split(/[,;\s]+/).filter(Boolean).join(',');
    const activo = req.body.activo ? 1 : 0;
    notif.reglasDe(pool).then(actuales => {
      const antes = actuales.find(r => r.evento === evento) || {};
      const ahora = new Date().toISOString().slice(0, 19).replace('T', ' ');
      pool.query(
        `INSERT INTO notificaciones_reglas (evento, activo, canales, destinatarios, updated_at) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE activo = VALUES(activo), canales = VALUES(canales), destinatarios = VALUES(destinatarios), updated_at = VALUES(updated_at)`,
        [evento, activo, canales.join(','), destinatarios, ahora],
        err => {
          if (err) return res.status(500).json({ error: err.message });
          const cambios = diff(
            { activo: !!antes.activo, canales: (antes.canales || []).join(','), destinatarios: antes.destinatarios || '' },
            { activo: !!activo, canales: canales.join(','), destinatarios },
            ['activo', 'canales', 'destinatarios']);
          if (Object.keys(cambios).length) {
            audit(pool, actorFrom(req), { action: 'UPDATE', entity: 'notification-rule', entityId: evento, summary: `Editó la regla de notificación: ${def.titulo}`, changes: cambios });
          }
          res.json({ ok: true });
        });
    }).catch(e => res.status(500).json({ error: e.message }));
  });

  // Prueba manual de un canal (envía de verdad: solo al pulsar el botón)
  router.post('/notificaciones/prueba', async (req, res) => {
    const pool = req.db || db;
    const { canal, destino } = req.body || {};
    const texto = 'Prueba de notificación del ERP. Si la recibiste, el canal funciona.';
    const r = await notif.enviar(pool, { canal, destino, asunto: 'Prueba de notificación', texto, evento: 'prueba' });
    audit(pool, actorFrom(req), { action: 'SEND', entity: 'notification', entityId: canal, summary: `Envió una prueba por ${canal}`, changes: null });
    res.status(r.ok ? 200 : 400).json(r);
  });

  // Historial de envíos
  router.get('/notificaciones/historial', (req, res) => {
    const limite = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    (req.db || db).query(
      'SELECT id, canal, destinatario, evento, asunto, estado, error, created_at FROM notificaciones_envios ORDER BY created_at DESC, id DESC LIMIT ?',
      [limite],
      (err, filas) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json((filas || []).map(f => ({ ...f, created_at: f.created_at instanceof Date ? f.created_at.toISOString() : f.created_at })));
      });
  });

  // Resumen de vencimientos de flota: ver lo que se enviaría hoy (sin enviar) o enviarlo ahora
  router.get('/notificaciones/vista-previa/flota_vencimiento', async (req, res) => {
    try { res.json(await eventos.ejecutarVencimientos(req.db || db, { soloVer: true, empresa: req.tenantInfo && req.tenantInfo.nombre_empresa })); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.post('/notificaciones/ejecutar/flota_vencimiento', async (req, res) => {
    const pool = req.db || db;
    try {
      const r = await eventos.ejecutarVencimientos(pool, { forzar: true, empresa: req.tenantInfo && req.tenantInfo.nombre_empresa });
      audit(pool, actorFrom(req), { action: 'SEND', entity: 'notification', entityId: 'flota_vencimiento', summary: `Envió ahora el resumen de vencimientos de flota (${r.enviados || 0} enviados)`, changes: null });
      res.json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // QR y contactos para vincular el WhatsApp de la empresa y roles de aprobación
  router.get('/notificaciones/whatsapp/qr', async (req, res) => {
    const pool = req.db || db;
    const base = (process.env.EVOLUTION_API_URL || 'http://82.39.109.226:8085').replace(/\/$/, '');
    const key = process.env.EVOLUTION_API_KEY || 'AZKELL_ERP_WA_SECRET_2026';
    const inst = (req.tenantSlug && !['admin', 'master', 'localhost'].includes(req.tenantSlug))
      ? `${req.tenantSlug}_bot`
      : (process.env.EVOLUTION_INSTANCE || 'marsisa_bot');

    let extraInfo = {
      instance: inst,
      empresa_nombre: (req.tenantInfo && req.tenantInfo.nombre_empresa) || 'MARSISA S.A.C.',
      receptor_telefono: process.env.GERENCIA_WHATSAPP || '',
      receptor_nombre: 'Gerencia General',
      tesoreria_telefono: process.env.TESORERIA_WHATSAPP || '',
      tesoreria_nombre: 'Tesorería / Pagos',
      almacen_telefono: process.env.ALMACEN_WHATSAPP || '',
      almacen_nombre: 'Almacén / Logística',
    };

    try {
      const cfg = await leerClaves(pool, [
        'empresa_nombre', 'gerencia_whatsapp', 'aprobador_whatsapp', 'gerencia_nombre',
        'tesoreria_whatsapp', 'tesoreria_nombre', 'almacen_whatsapp', 'almacen_nombre'
      ]);
      if (cfg.empresa_nombre) extraInfo.empresa_nombre = cfg.empresa_nombre;
      if (cfg.gerencia_whatsapp || cfg.aprobador_whatsapp) extraInfo.receptor_telefono = cfg.gerencia_whatsapp || cfg.aprobador_whatsapp;
      if (cfg.gerencia_nombre) extraInfo.receptor_nombre = cfg.gerencia_nombre;
      if (cfg.tesoreria_whatsapp) extraInfo.tesoreria_telefono = cfg.tesoreria_whatsapp;
      if (cfg.tesoreria_nombre) extraInfo.tesoreria_nombre = cfg.tesoreria_nombre;
      if (cfg.almacen_whatsapp) extraInfo.almacen_telefono = cfg.almacen_whatsapp;
      if (cfg.almacen_nombre) extraInfo.almacen_nombre = cfg.almacen_nombre;
    } catch {}

    try {
      const r = await fetch(`${base}/instance/connect/${encodeURIComponent(inst)}`, { headers: { apikey: key } });
      const j = await r.json().catch(() => ({}));
      if (j?.instance?.state === 'open') {
        return res.json({ status: 'CONNECTED', conectado: true, instancia: inst, ...extraInfo });
      }
      res.json({
        status: 'DISCONNECTED',
        conectado: false,
        instancia: inst,
        qr: j.base64 || null,
        base64: j.base64 || null,
        codigo: j.code || j.pairingCode || null,
        ...extraInfo
      });
    } catch (e) {
      res.status(502).json({ error: e.message, ...extraInfo });
    }
  });

  router.post('/notificaciones/whatsapp/config-receptor', async (req, res) => {
    const pool = req.db || db;
    const { telefono, nombre, tesoreria_telefono, tesoreria_nombre, almacen_telefono, almacen_nombre } = req.body || {};
    try {
      if (telefono !== undefined) await guardarClave(pool, 'gerencia_whatsapp', String(telefono || '').trim());
      if (nombre !== undefined) await guardarClave(pool, 'gerencia_nombre', String(nombre || '').trim());
      if (tesoreria_telefono !== undefined) await guardarClave(pool, 'tesoreria_whatsapp', String(tesoreria_telefono || '').trim());
      if (tesoreria_nombre !== undefined) await guardarClave(pool, 'tesoreria_nombre', String(tesoreria_nombre || '').trim());
      if (almacen_telefono !== undefined) await guardarClave(pool, 'almacen_whatsapp', String(almacen_telefono || '').trim());
      if (almacen_nombre !== undefined) await guardarClave(pool, 'almacen_nombre', String(almacen_nombre || '').trim());

      audit(pool, actorFrom(req), {
        action: 'UPDATE',
        entity: 'whatsapp-config',
        entityId: 'receptores',
        summary: `Actualizados contactos WhatsApp: Gerencia (${nombre || telefono || '—'}), Tesorería (${tesoreria_nombre || tesoreria_telefono || '—'}), Almacén (${almacen_nombre || almacen_telefono || '—'})`,
        changes: null
      });

      res.json({ success: true, message: 'Contactos de WhatsApp guardados exitosamente.' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
