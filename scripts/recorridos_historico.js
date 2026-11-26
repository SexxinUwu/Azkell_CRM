// Guarda los recorridos de días cerrados de las unidades con GPS (tabla gps_recorrido_dia), del más reciente al más antiguo.
// Uso: node scripts/recorridos_historico.js --solo marsisa --desde 2026-01-01 [--hasta 2026-11-25] [--reparto 0/3] [--listar] [--regenerar]
// --regenerar: vuelve a calcular los días guardados con el cálculo anterior (sin odómetro ni nivel de combustible); los ya nuevos se saltan.
// Retoma solo: los días ya guardados se saltan. Va de a una consulta por vez por proceso; se puede repartir entre procesos con --reparto n/de.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2');

const arg = (n, def) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? (process.argv[i + 1] ?? true) : def; };
const slug = String(arg('solo', '')).toLowerCase();
const desde = arg('desde', '2026-01-01');
const hasta = arg('hasta', null);
const reparto = String(arg('reparto', '')).match(/^(\d+)\/(\d+)$/);
if (!slug) { console.error('Indica la empresa con --solo <slug>'); process.exit(1); }

const pool = mysql.createPool({
  host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined, database: 'azkell_tenant_' + slug, connectionLimit: 3,
});

(async () => {
  const legacy = require('../routes/legacy')(pool, () => { }, () => { });
  const t0 = Date.now();
  if (arg('listar', false)) {
    const u = await require('../services/wialon_unidades').listarUnidadesGps(pool);
    console.log(slug, u.length, 'unidades:', u.map(x => x.placa).join(' '));
    return process.exit(0);
  }
  const r = await legacy.precalcularRecorridos(slug, {
    desde, hasta: hasta || undefined, limiteMs: 48 * 3600 * 1000, regenerar: arg('regenerar', false) !== false,
    reparto: reparto ? [Number(reparto[1]), Number(reparto[2])] : undefined,
    alAvanzar: p => console.log(`[${slug}${reparto ? ' ' + reparto[0] : ''}] ${Math.round((Date.now() - t0) / 60000)} min · ${p.fecha} ${p.placa} · consultados ${p.hechos} (con datos ${p.conDatos}, ya estaban ${p.yaEstaban})`),
  });
  console.log(`[${slug}] FIN`, JSON.stringify(r), `${Math.round((Date.now() - t0) / 60000)} min`);
  process.exit(0);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
