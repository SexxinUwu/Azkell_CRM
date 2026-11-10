// Carga el catálogo de infracciones: tránsito (DS 016-2009-MTC) y carga de Lima (Ordenanza 1682) del SAT (UIT 2026 = S/ 5,500)
// y SUTRAN (RNAT DS 017-2009-MTC Anexo 2 y RNV DS 058-2003-MTC Anexo IV). Ver datos_infracciones_sutran.js.
// Por defecto solo simula; con --aplicar escribe, una transacción por empresa. Repetirlo actualiza, no duplica.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
// Alias sin letra: así se escriben en las papeletas M20 y G18 (el SAT los publica como M20A-D y G18A-B)
const alias = [{ entidad_codigo: '', codigo: 'M20', descripcion: 'No respetar el límite máximo o mínimo de velocidad (ver M20A a M20D según el exceso)', gravedad: 'MUY_GRAVE', puntos: null, multa_uit: null, multa_soles: null, medida: null },
  { entidad_codigo: '', codigo: 'G18', descripcion: 'Conducir sin ambas manos sobre el volante o usando un dispositivo móvil (G18A y G18B)', gravedad: 'GRAVE', puntos: 30, multa_uit: 0.08, multa_soles: 440, medida: null }];
const filas = [...require('./datos_infracciones_sat.json'), ...alias, ...require('./datos_infracciones_sutran.js')];
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
