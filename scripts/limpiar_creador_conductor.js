// 2026-11-10: quita la etiqueta "(Conductor)" que algunos reportes de fallas traen pegada al nombre de quien los creó. Simula; con --aplicar escribe.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const APLICAR = process.argv.includes('--aplicar');
(async () => {
  const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD = '', DB_SSL } = process.env;
  for (const s of ['marsisa', 'rosymarperu', 'yoguitransport', 'trahesa']) {
    const c = await mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: DB_USER, password: DB_PASSWORD, database: 'azkell_tenant_' + s, ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
    try {
      const [f] = await c.query("SELECT id, folio, creado_por FROM reportes_fallas WHERE creado_por LIKE '% (Conductor)'");
      console.log(s, JSON.stringify(f));
      if (!APLICAR || !f.length) continue;
      await c.beginTransaction();
      const [r] = await c.query("UPDATE reportes_fallas SET creado_por = TRIM(REPLACE(creado_por, ' (Conductor)', '')) WHERE creado_por LIKE '% (Conductor)'");
      if (r.affectedRows !== f.length) { await c.rollback(); throw new Error('conteo distinto'); }
      await c.commit(); console.log(s, 'OK', r.affectedRows);
    } finally { await c.end(); }
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
