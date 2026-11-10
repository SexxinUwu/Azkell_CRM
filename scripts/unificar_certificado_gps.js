// 2026-11-10: "Certificado Instalación de GPS" pasa a ser "Certificado GPS" (mismo concepto). Simula; con --aplicar escribe.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const APLICAR = process.argv.includes('--aplicar');
(async () => {
  const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD = '', DB_SSL } = process.env;
  for (const s of ['marsisa', 'rosymarperu', 'yoguitransport', 'trahesa']) {
    const c = await mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: DB_USER, password: DB_PASSWORD, database: 'azkell_tenant_' + s, ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
    try {
      const [f] = await c.query("SELECT id, placa, tipo_documento, fecha_vencimiento FROM documentos_flota WHERE tipo_documento = 'Certificado Instalación de GPS'");
      console.log(s, JSON.stringify(f));
      if (!APLICAR || !f.length) continue;
      await c.beginTransaction();
      const [r] = await c.query("UPDATE documentos_flota SET tipo_documento = 'Certificado GPS' WHERE tipo_documento = 'Certificado Instalación de GPS'");
      if (r.affectedRows !== f.length) { await c.rollback(); throw new Error('conteo distinto'); }
      await c.commit(); console.log(s, 'OK', r.affectedRows);
    } finally { await c.end(); }
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
