/**
 * services/auditoria.js — Registro de auditoría (tabla audit_logs).
 *
 *  - audit(db, actor, entrada): guarda un evento. Nunca interrumpe la petición: si falla, solo registra el error.
 *  - diff(antes, despues, campos): devuelve solo los campos que cambiaron, como { campo: { from, to } }.
 *  - actorFrom(req): identidad de la sesión (nunca del cuerpo de la petición).
 *  - rangoLima(desde, hasta): inicio y fin de los días en hora de Perú, convertidos a UTC para la consulta.
 *
 * Las fechas se guardan en UTC. Perú está en UTC-5 todo el año, sin horario de verano.
 */

const OFFSET_LIMA_H = 5;
const LIMITE_RESUMEN = 300;
// Nunca se guardan secretos en los cambios, aunque un módulo los pase por error
const CAMPO_SECRETO = /pass|clave|token|secret|totp|hash|firma/i;

/** Identidad de la sesión: de req.user (JWT), no del cuerpo de la petición */
function actorFrom(req) {
  const u = (req && req.user) || {};
  const ipCruda = (req && (req.headers && req.headers['x-forwarded-for'])) || (req && req.ip) || '';
  return {
    userId: u.id ?? u.usuario_id ?? null,
    userName: String(u.nombre || u.correo || 'Sistema').slice(0, 120),
    ip: String(ipCruda).split(',')[0].trim().slice(0, 45) || null,
  };
}

/** Valor comparable: fechas en ISO, textos recortados, listas ordenadas, vacío = null */
function normalizar(v) {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  if (Array.isArray(v)) return v.map(normalizar).filter(x => x !== null).map(x => JSON.stringify(x)).sort().map(x => JSON.parse(x));
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const t = String(v).trim();
  return t === '' ? null : t;
}

/** Solo los campos que cambiaron: { campo: { from, to } }. Sin cambios, devuelve {}. */
function diff(antes, despues, campos) {
  const out = {};
  for (const c of campos || []) {
    if (CAMPO_SECRETO.test(c)) continue;
    const a = normalizar((antes || {})[c]);
    const b = normalizar((despues || {})[c]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out[c] = { from: a, to: b };
  }
  return out;
}

/** Quita secretos de un objeto de cambios, por si un módulo los pasa sin querer */
function sinSecretos(cambios) {
  const limpio = {};
  for (const [k, v] of Object.entries(cambios || {})) if (!CAMPO_SECRETO.test(k)) limpio[k] = v;
  return limpio;
}

/** "AAAA-MM-DD" en hora de Lima → 'AAAA-MM-DD HH:mm:ss' en UTC; desde incluido, hasta incluido */
function rangoLima(desde, hasta) {
  const fmt = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const dia = s => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const d = dia(desde), h = dia(hasta);
  return {
    desde: d === null ? null : fmt(d + OFFSET_LIMA_H * 3600000),
    // Fin exclusivo: inicio del día siguiente en Lima
    hastaExclusivo: h === null ? null : fmt(h + 86400000 + OFFSET_LIMA_H * 3600000),
  };
}

/**
 * Registra un evento. `entrada` = { action, entity, entityId, summary, changes }.
 * Devuelve una promesa que nunca se rechaza: un fallo de auditoría no debe tumbar la operación.
 */
function audit(db, actor, entrada) {
  return new Promise(resolve => {
    if (!db || !entrada) return resolve(false);
    const cambios = entrada.changes && Object.keys(entrada.changes).length ? sinSecretos(entrada.changes) : null;
    const ahoraUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const fin = err => {
      if (err) console.error('⚠️ Auditoría no guardada:', err.message);
      resolve(!err);
    };
    const sql = `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, summary, changes, ip, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      actor?.userId ?? null,
      String(actor?.userName || 'Sistema').slice(0, 120),
      String(entrada.action || 'ACCION').slice(0, 40),
      String(entrada.entity || 'general').slice(0, 40),
      entrada.entityId == null ? null : String(entrada.entityId).slice(0, 80),
      String(entrada.summary || '').slice(0, LIMITE_RESUMEN),
      cambios ? JSON.stringify(cambios) : null,
      actor?.ip ?? null,
      ahoraUtc,
    ];
    // Pool de callbacks (tiene .promise()) o pool de promesas (mysql2/promise): cada uno con su forma
    if (typeof db.promise === 'function') db.query(sql, params, fin);
    else db.query(sql, params).then(() => fin(null), fin);
  });
}

module.exports = { audit, diff, actorFrom, rangoLima, sinSecretos, LIMITE_RESUMEN };
