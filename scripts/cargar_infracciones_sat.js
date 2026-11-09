// Carga el catálogo de infracciones de tránsito (DS 016-2009-MTC) y de transporte de carga de Lima (Ordenanza 1682),
// tomado de las tablas oficiales del SAT (sat.gob.pe, "Tabla de infracciones", UIT 2026 = S/ 5,500).
// Por defecto solo simula; con --aplicar escribe, una transacción por empresa. Repetirlo actualiza, no duplica.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const filas = require('./datos_infracciones_sat.json');
const APLICAR = process.argv.includes('--aplicar');
const TENANTS = ['marsisa', 'rosymarperu', 'yoguitransport', 'trahesa'].map(s => `azkell_tenant_${s}`);
const UIT = '5500';

(async () => {
  const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD = '', DB_SSL } = process.env;
  console.log(`${filas.length} infracciones a cargar en ${TENANTS.length} empresas${APLICAR ? '' : ' (simulación)'}`);
  for (const db of TENANTS) {
    const c = await mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: DB_USER, password: DB_PASSWORD, database: db, ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
    const [[{ n }]] = await c.query('SELECT COUNT(*) n FROM papeletas_infracciones');
    const [uit] = await c.query("SELECT valor FROM papeletas_config WHERE clave = 'uit_valor'");
    console.log(`\n== ${db}: infracciones ${n}; UIT ${uit.length ? uit[0].valor : 'sin definir'}`);
    if (!APLICAR) { await c.end(); continue; }
    await c.beginTransaction();
    try {
      for (const f of filas) {
        await c.query(`INSERT INTO papeletas_infracciones (entidad_codigo, codigo, descripcion, gravedad, puntos, multa_uit, multa_soles, medida, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
          ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), gravedad = VALUES(gravedad), puntos = VALUES(puntos), multa_uit = VALUES(multa_uit), multa_soles = VALUES(multa_soles), medida = VALUES(medida)`,
        [f.entidad_codigo, f.codigo, f.descripcion, f.gravedad, f.puntos, f.multa_uit, f.multa_soles, f.medida]);
      }
      if (!uit.length || !uit[0].valor) await c.query("INSERT INTO papeletas_config (clave, valor) VALUES ('uit_valor', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [UIT]);
      const [[{ d }]] = await c.query('SELECT COUNT(*) d FROM papeletas_infracciones');
      if (Number(d) !== Number(n) + filas.length && Number(n) === 0) throw new Error(`Conteo distinto: esperadas ${filas.length}, hay ${d}`);
      await c.commit(); console.log(`  OK: ahora hay ${d} infracciones`);
    } catch (e) { await c.rollback(); console.log('  ROLLBACK:', e.message); }
    await c.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
