/**
 * services/webhooks.js — Webhooks salientes de la API (Sistema › API y desarrolladores).
 *
 *  - Catálogo: solo los eventos que ya existen en services/notificaciones.js (EVENTOS). Ver docs/api-webhooks.md.
 *  - Cada webhook tiene URL, eventos y un secreto propio. Cada envío va firmado con HMAC-SHA256:
 *      X-Azkell-Firma: t=<unix>,v1=<hex(HMAC_SHA256(secreto, "<t>." + cuerpo))>
 *  - Reintentos limitados: 3 intentos en total (0 s, 30 s, 5 min). Solo se reintenta ante red, tiempo agotado,
 *    408, 429 y 5xx; un 4xx o una redirección se marca FALLIDO de inmediato.
 *  - Cada intento queda en webhook_envios (estado, intentos, código HTTP, error).
 *  - emitir() nunca lanza: un webhook caído no debe tumbar la operación que lo origina.
 */
const crypto = require('crypto');
const { EVENTOS } = require('./notificaciones');

const EVENTOS_WEBHOOK = ['oc_aprobacion', 'oc_pagar', 'oc_voucher', 'ot_fin_rampa', 'checklist_critico', 'flota_vencimiento'];
const CATALOGO = EVENTOS_WEBHOOK.map(evento => ({
  evento,
  titulo: (EVENTOS.find(e => e.evento === evento) || {}).titulo || evento,
}));

const MAX_INTENTOS = 3;
const ESPERAS_MS = [30 * 1000, 5 * 60 * 1000]; // espera antes del 2.º y del 3.er intento
const TIMEOUT_MS = 10 * 1000;
const TOLERANCIA_FIRMA_S = 300;
const PERMITIR_LOCAL = process.env.WEBHOOKS_PERMITIR_LOCAL === '1'; // solo para pruebas en desarrollo

const ahoraSql = (d = new Date()) => d.toISOString().slice(0, 19).replace('T', ' ');
const pool = db => (typeof db.promise === 'function' ? db.promise() : db);
const esperar = ms => new Promise(r => setTimeout(r, ms));

// Tablas creadas una vez por base de empresa (cada tenant tiene su propia base), como services/push.js
const tablasListas = new WeakSet();
async function asegurarTablas(db) {
  if (tablasListas.has(db)) return;
  const p = pool(db);
  await p.query(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(120) NOT NULL,
      url VARCHAR(500) NOT NULL,
      secreto VARCHAR(80) NOT NULL,
      eventos TEXT NOT NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      creado_por VARCHAR(120) NULL,
      creado_en DATETIME NULL,
      ultimo_envio DATETIME NULL,
      ultimo_estado VARCHAR(12) NULL,
      KEY idx_webhooks_activo (activo)
    )`);
  await p.query(`
    CREATE TABLE IF NOT EXISTS webhook_envios (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      webhook_id INT NOT NULL,
      evento VARCHAR(60) NOT NULL,
      cuerpo MEDIUMTEXT NOT NULL,
      estado VARCHAR(12) NOT NULL,
      intentos TINYINT NOT NULL DEFAULT 0,
      codigo_http INT NULL,
      error VARCHAR(300) NULL,
      creado_en DATETIME NOT NULL,
      entregado_en DATETIME NULL,
      KEY idx_wh_envios_webhook (webhook_id, creado_en),
      KEY idx_wh_envios_evento (evento, creado_en)
    )`);
  tablasListas.add(db);
}

// ── Validaciones ─────────────────────────────────────────────────────────────
/** Devuelve un mensaje de error, o null si la URL sirve. */
function validarUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return 'La URL no es válida.'; }
  if (u.username || u.password) return 'La URL no debe llevar usuario ni contraseña.';
  if (!PERMITIR_LOCAL && u.protocol !== 'https:') return 'La URL debe empezar con https://';
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'La URL debe ser http o https.';
  const host = u.hostname;
  const interna = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(host)
    || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (interna && !PERMITIR_LOCAL) return 'La URL no puede apuntar a una dirección interna.';
  return null;
}

/** Valida y normaliza la lista de eventos. Devuelve { eventos } o { error }. */
function validarEventos(lista) {
  if (!Array.isArray(lista) || !lista.length) return { error: 'Elige al menos un evento.' };
  const limpios = [...new Set(lista.map(String))];
  const desconocido = limpios.find(e => !EVENTOS_WEBHOOK.includes(e));
  if (desconocido) return { error: `Evento no disponible: ${desconocido}.` };
  return { eventos: limpios };
}

// ── Firma ────────────────────────────────────────────────────────────────────
function firmar(secreto, t, cuerpo) {
  return crypto.createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex');
}

/** Para el receptor: comprueba la cabecera X-Azkell-Firma. Devuelve true si la firma es válida y no caducó. */
function verificarFirma(secreto, cabecera, cuerpo, { ahoraS = Math.floor(Date.now() / 1000), tolerancia = TOLERANCIA_FIRMA_S } = {}) {
  const partes = Object.fromEntries(String(cabecera || '').split(',').map(p => p.trim().split('=')));
  const t = Number(partes.t);
  if (!t || Math.abs(ahoraS - t) > tolerancia || !partes.v1) return false;
  const esperada = Buffer.from(firmar(secreto, t, cuerpo), 'hex');
  const recibida = Buffer.from(partes.v1, 'hex');
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

// ── Gestión (llamada desde routes/api-gateway.js) ───────────────────────────
const mascara = secreto => `whsec_••••${String(secreto).slice(-4)}`;

function filaAWebhook(f) {
  let eventos = [];
  try { eventos = JSON.parse(f.eventos || '[]'); } catch { eventos = []; }
  return {
    id: f.id, nombre: f.nombre, url: f.url, eventos, activo: !!f.activo,
    secreto_pista: mascara(f.secreto), creado_por: f.creado_por, creado_en: f.creado_en,
    ultimo_envio: f.ultimo_envio, ultimo_estado: f.ultimo_estado,
  };
}

async function listar(db) {
  await asegurarTablas(db);
  const [filas] = await pool(db).query('SELECT * FROM webhooks ORDER BY id DESC');
  return filas.map(filaAWebhook);
}

/** Crea el webhook. El secreto se devuelve solo en esta respuesta. */
async function crear(db, { nombre, url, eventos }, autor) {
  await asegurarTablas(db);
  const secreto = 'whsec_' + crypto.randomBytes(24).toString('hex');
  const [r] = await pool(db).query(
    'INSERT INTO webhooks (nombre, url, secreto, eventos, activo, creado_por, creado_en) VALUES (?, ?, ?, ?, 1, ?, ?)',
    [nombre, url, secreto, JSON.stringify(eventos), autor || null, ahoraSql()]);
  return { id: r.insertId, secreto };
}

/** Cambia los campos indicados. Devuelve false si el webhook no existe. */
async function actualizar(db, id, cambios) {
  await asegurarTablas(db);
  const [existentes] = await pool(db).query('SELECT id FROM webhooks WHERE id = ? LIMIT 1', [id]);
  if (!existentes.length) return false;
  const sets = [], params = [];
  if (cambios.nombre !== undefined) { sets.push('nombre = ?'); params.push(cambios.nombre); }
  if (cambios.url !== undefined) { sets.push('url = ?'); params.push(cambios.url); }
  if (cambios.eventos !== undefined) { sets.push('eventos = ?'); params.push(JSON.stringify(cambios.eventos)); }
  if (cambios.activo !== undefined) { sets.push('activo = ?'); params.push(cambios.activo ? 1 : 0); }
  if (sets.length) await pool(db).query(`UPDATE webhooks SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  return true;
}

async function eliminar(db, id) {
  await asegurarTablas(db);
  await pool(db).query('DELETE FROM webhook_envios WHERE webhook_id = ?', [id]);
  const [r] = await pool(db).query('DELETE FROM webhooks WHERE id = ?', [id]);
  return r.affectedRows;
}

async function historial(db, webhookId, limite = 50) {
  await asegurarTablas(db);
  const [filas] = await pool(db).query(
    'SELECT id, evento, estado, intentos, codigo_http, error, creado_en, entregado_en FROM webhook_envios WHERE webhook_id = ? ORDER BY id DESC LIMIT ?',
    [webhookId, Math.min(Number(limite) || 50, 200)]);
  return filas;
}

// ── Emisión y entrega ───────────────────────────────────────────────────────
/** ¿Hay algún webhook activo suscrito a este evento? */
async function haySuscriptores(db, evento) {
  try {
    const activos = await activosCon(db, evento);
    return activos.length > 0;
  } catch (e) {
    console.error('[Webhooks] suscriptores:', e.message);
    return false;
  }
}

async function activosCon(db, evento) {
  await asegurarTablas(db);
  const [filas] = await pool(db).query('SELECT * FROM webhooks WHERE activo = 1');
  return filas.map(filaAWebhook).filter(w => w.eventos.includes(evento));
}

/** ¿Ya hubo envíos de este evento desde `desde`? Sirve para no repetir avisos diarios. */
async function hayEnvioDesde(db, evento, desde) {
  await asegurarTablas(db);
  const [filas] = await pool(db).query('SELECT 1 FROM webhook_envios WHERE evento = ? AND creado_en >= ? LIMIT 1', [evento, ahoraSql(desde)]);
  return !!(filas && filas.length);
}

/**
 * Emite un evento a los webhooks suscritos. Nunca lanza.
 * `datos`: objeto con la información del evento (sin secretos ni datos bancarios completos).
 */
async function emitir(db, evento, datos = {}) {
  if (!EVENTOS_WEBHOOK.includes(evento)) return { encolados: 0, motivo: 'evento no soportado' };
  try {
    if (!db) return { encolados: 0, motivo: 'sin base de datos' };
    const destinos = await activosCon(db, evento);
    if (!destinos.length) return { encolados: 0, motivo: 'sin suscriptores' };
    const cuerpo = JSON.stringify({ id: 'evt_' + crypto.randomUUID(), evento, version: 1, creado_en: new Date().toISOString(), datos });
    const ids = [];
    for (const w of destinos) ids.push(await insertarEnvio(db, w.id, evento, cuerpo));
    // Entrega en segundo plano: el proceso de origen no espera a un receptor lento
    for (const id of ids) entregar(db, id).catch(e => console.error('[Webhooks] entrega:', e.message));
    return { encolados: ids.length };
  } catch (e) {
    console.error(`[Webhooks] ${evento}:`, e.message);
    return { encolados: 0, error: e.message };
  }
}

async function insertarEnvio(db, webhookId, evento, cuerpo) {
  const [r] = await pool(db).query(
    'INSERT INTO webhook_envios (webhook_id, evento, cuerpo, estado, intentos, creado_en) VALUES (?, ?, ?, ?, 0, ?)',
    [webhookId, evento, cuerpo, 'PENDIENTE', ahoraSql()]);
  return r.insertId;
}

/** Envío de prueba a un solo webhook, con un intento y sin reintentos. */
async function probar(db, webhookId) {
  await asegurarTablas(db);
  const [filas] = await pool(db).query('SELECT id FROM webhooks WHERE id = ? LIMIT 1', [webhookId]);
  if (!filas.length) return null;
  const cuerpo = JSON.stringify({ id: 'evt_' + crypto.randomUUID(), evento: 'prueba', version: 1, creado_en: new Date().toISOString(), datos: { mensaje: 'Prueba de conexión desde Azkell ERP' } });
  const envioId = await insertarEnvio(db, webhookId, 'prueba', cuerpo);
  return entregar(db, envioId, { esperas: [], intentos: 1 });
}

async function registrar(db, envioId, webhookId, { estado, intentos, codigo, error }) {
  const p = pool(db);
  const ahora = ahoraSql();
  await p.query(
    'UPDATE webhook_envios SET estado = ?, intentos = ?, codigo_http = ?, error = ?, entregado_en = ? WHERE id = ?',
    [estado, intentos, codigo ?? null, error ? String(error).slice(0, 300) : null, estado === 'ENTREGADO' ? ahora : null, envioId]);
  await p.query('UPDATE webhooks SET ultimo_envio = ?, ultimo_estado = ? WHERE id = ?', [ahora, estado, webhookId]);
}

/**
 * Entrega un envío con reintentos limitados. Devuelve 'ENTREGADO' o 'FALLIDO'.
 * Relee el webhook en cada intento: si se pausó o se eliminó, no sigue reintentando.
 */
async function entregar(db, envioId, { esperas = ESPERAS_MS, intentos: maximo = MAX_INTENTOS } = {}) {
  const p = pool(db);
  for (let intento = 1; intento <= maximo; intento++) {
    const [filas] = await p.query(
      'SELECT e.webhook_id, e.evento, e.cuerpo, w.url, w.secreto, w.activo FROM webhook_envios e JOIN webhooks w ON w.id = e.webhook_id WHERE e.id = ?',
      [envioId]);
    const f = filas && filas[0];
    if (!f) return 'FALLIDO';
    if (!f.activo) {
      await registrar(db, envioId, f.webhook_id, { estado: 'FALLIDO', intentos: intento - 1, error: 'Webhook pausado antes de entregar' });
      return 'FALLIDO';
    }

    const t = Math.floor(Date.now() / 1000);
    let codigo = null, error = null, reintentable = true;
    try {
      const r = await fetch(f.url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AzkellERP-Webhooks/1.0',
          'X-Azkell-Evento': f.evento,
          'X-Azkell-Entrega': String(envioId),
          'X-Azkell-Firma': `t=${t},v1=${firmar(f.secreto, t, f.cuerpo)}`,
        },
        body: f.cuerpo,
      });
      codigo = r.status;
      if (r.status >= 200 && r.status < 300) {
        await registrar(db, envioId, f.webhook_id, { estado: 'ENTREGADO', intentos: intento, codigo });
        return 'ENTREGADO';
      }
      reintentable = r.status >= 500 || r.status === 408 || r.status === 429;
      error = r.status >= 300 && r.status < 400 ? 'Redirección no seguida (3xx)' : `HTTP ${r.status}`;
    } catch (e) {
      error = e.name === 'TimeoutError' ? `Sin respuesta en ${TIMEOUT_MS / 1000} s` : (e.cause && e.cause.code) || e.message;
    }

    const ultimo = intento >= maximo || !reintentable;
    await registrar(db, envioId, f.webhook_id, { estado: ultimo ? 'FALLIDO' : 'PENDIENTE', intentos: intento, codigo, error });
    if (ultimo) return 'FALLIDO';
    await esperar(esperas[intento - 1] ?? esperas[esperas.length - 1] ?? 0);
  }
  return 'FALLIDO';
}

module.exports = {
  CATALOGO, EVENTOS_WEBHOOK, MAX_INTENTOS, ESPERAS_MS,
  validarUrl, validarEventos, firmar, verificarFirma,
  listar, crear, actualizar, eliminar, historial, probar,
  haySuscriptores, hayEnvioDesde, emitir, entregar, asegurarTablas,
};
