// 2026-11-10: los reportes de fallas creados por "NICON" pasan a figurar a nombre de NIXON PEREZ PEREZ. Simula; con --aplicar escribe.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const APLICAR = process.argv.includes('--aplicar');
(async () => {
  const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD = '', DB_SSL } = process.env;
  const c = await mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: DB_USER, password: DB_PASSWORD, database: 'azkell_tenant_marsisa', ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  try {
    const [f] = await c.query("SELECT id, folio, creado_por, DATE(creado_en) creado FROM reportes_fallas WHERE UPPER(TRIM(creado_por)) = 'NICON'");
    console.log(JSON.stringify(f));
    if (!APLICAR) return;
    await c.beginTransaction();
    const [r] = await c.query("UPDATE reportes_fallas SET creado_por = 'NIXON PEREZ PEREZ' WHERE UPPER(TRIM(creado_por)) = 'NICON'");
    if (r.affectedRows !== f.length) { await c.rollback(); throw new Error('conteo distinto ' + r.affectedRows); }
    await c.commit(); console.log('OK', r.affectedRows);
  } finally { await c.end(); }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
