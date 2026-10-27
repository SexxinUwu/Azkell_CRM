// Migración: código de fuego por empresa.
// - Tabla de configuración (letra de la empresa) y de secuencia por año (se reinicia cada año).
// - Tabla de datos del artículo "Llanta" (medida, modelo, cocada inicial) para la recepción.
// - Índice único sobre codigo_llanta: nunca dos llantas con el mismo código de fuego.
// - Los códigos vacíos pasan a NULL: varias filas vacías chocarían con el índice único.
//
// Uso: node scripts/migracion_codigo_fuego.js            → simulación (no escribe)
//      node scripts/migracion_codigo_fuego.js --aplicar  → escribe en cada base de empresa

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const raiz = path.join(__dirname, '..');
const env = {};
fs.readFileSync(path.join(raiz, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
});

// Letra inicial por empresa (base de datos del tenant)
const LETRA_POR_BASE = {
  azkell_tenant_marsisa: 'M',
  azkell_tenant_rosymarperu: 'R',
  azkell_tenant_trahesa: 'T',
  azkell_tenant_yoguitransport: 'Y',
};

const aplicar = process.argv.includes('--aplicar');

// Columnas del ciclo de la llanta; su definición se copia de la base de Marsisa (la referencia)
const COLUMNAS_CICLO = ['codigo_llanta', 'vida', 'contador_reencauches', 'costo_reencauches', 'estado_ciclo', 'almacen_id'];
const DEFINICION_MARSISA = {};

async function cargarDefinicionesMarsisa() {
  const c = await mysql.createConnection({
    host: env.DB_HOST, user: env.DB_USER, password: env.DB_PASSWORD,
    port: Number(env.DB_PORT || 3306), database: 'azkell_tenant_marsisa', ssl: env.DB_SSL === 'true' ? {} : undefined,
  });
  try {
    const [filas] = await c.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.columns
       WHERE table_schema = 'azkell_tenant_marsisa' AND table_name = 'neumaticos_hoja_vida' AND COLUMN_NAME IN (?)`,
      [COLUMNAS_CICLO]);
    for (const f of filas) {
      let def = f.COLUMN_TYPE + (f.IS_NULLABLE === 'NO' ? ' NOT NULL' : ' NULL');
      if (f.COLUMN_DEFAULT !== null) {
        const d = String(f.COLUMN_DEFAULT);
        const crudo = /^-?\d+(\.\d+)?$/.test(d) || /CURRENT_TIMESTAMP/i.test(d);
        def += ' DEFAULT ' + (crudo ? d : `'${d.replace(/'/g, "''")}'`);
      }
      DEFINICION_MARSISA[f.COLUMN_NAME] = def;
    }
  } finally {
    await c.end();
  }
}

async function existe(c, tabla) {
  const [r] = await c.query('SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [tabla]);
  return r[0].n > 0;
}
async function existeIndice(c, tabla, indice) {
  const [r] = await c.query('SELECT COUNT(*) n FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?', [tabla, indice]);
  return r[0].n > 0;
}

async function migrarBase(base) {
  const c = await mysql.createConnection({
    host: env.DB_HOST, user: env.DB_USER, password: env.DB_PASSWORD,
    port: Number(env.DB_PORT || 3306), database: base, ssl: env.DB_SSL === 'true' ? {} : undefined,
  });
  const pasos = [];
  try {
    if (!(await existe(c, 'neumaticos_hoja_vida'))) {
      console.log(`[${base}] sin neumaticos_hoja_vida: se omite`);
      return;
    }
    pasos.push(['crear neumaticos_codigo_fuego_config', `CREATE TABLE IF NOT EXISTS neumaticos_codigo_fuego_config (
      id TINYINT NOT NULL PRIMARY KEY,
      letra CHAR(1) NOT NULL,
      actualizado_por VARCHAR(150) NULL,
      actualizado_en TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`]);
    pasos.push(['fila inicial de configuración', `INSERT IGNORE INTO neumaticos_codigo_fuego_config (id, letra, actualizado_por) VALUES (1, ?, 'migración')`, [LETRA_POR_BASE[base] || 'X']]);
    pasos.push(['crear neumaticos_codigo_fuego_secuencia', `CREATE TABLE IF NOT EXISTS neumaticos_codigo_fuego_secuencia (
      anio SMALLINT NOT NULL PRIMARY KEY,
      ultimo INT NOT NULL DEFAULT 0
    )`]);
    pasos.push(['crear neumaticos_articulo', `CREATE TABLE IF NOT EXISTS neumaticos_articulo (
      inventario_id VARCHAR(20) NOT NULL PRIMARY KEY,
      medida VARCHAR(60) NULL,
      modelo VARCHAR(100) NULL,
      cocada_inicial DECIMAL(6,2) NULL,
      actualizado_en TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`]);
    // Columnas del ciclo de la llanta que las empresas más viejas no tienen (se copian de Marsisa)
    const [actuales] = await c.query('SELECT COLUMN_NAME n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?', ['neumaticos_hoja_vida']);
    const tiene = new Set(actuales.map(r => r.n));
    for (const col of COLUMNAS_CICLO) {
      if (tiene.has(col)) continue;
      const def = DEFINICION_MARSISA[col];
      if (!def) throw new Error(`[${base}] falta la columna ${col} y no hay definición de referencia`);
      pasos.push([`agregar columna ${col}`, `ALTER TABLE neumaticos_hoja_vida ADD COLUMN ${col} ${def}`]);
    }
    // Con la columna ya agregada (o existente) se revisan vacíos y repetidos; en simulación aún no existe
    if (tiene.has('codigo_llanta')) {
      const [vacios] = await c.query("SELECT COUNT(*) n FROM neumaticos_hoja_vida WHERE codigo_llanta = ''");
      pasos.push([`codigos vacíos a NULL (${vacios[0].n} filas)`, "UPDATE neumaticos_hoja_vida SET codigo_llanta = NULL WHERE codigo_llanta = ''"]);
      const [repetidos] = await c.query("SELECT COUNT(*) n FROM (SELECT codigo_llanta FROM neumaticos_hoja_vida WHERE codigo_llanta IS NOT NULL AND codigo_llanta <> '' GROUP BY codigo_llanta HAVING COUNT(*) > 1) t");
      if (repetidos[0].n > 0) throw new Error(`[${base}] hay ${repetidos[0].n} códigos de fuego repetidos: revisar antes de migrar`);
    }
    if (!(await existeIndice(c, 'neumaticos_hoja_vida', 'uq_codigo_llanta'))) {
      pasos.push(['índice único en codigo_llanta', 'ALTER TABLE neumaticos_hoja_vida ADD UNIQUE KEY uq_codigo_llanta (codigo_llanta)']);
    }

    console.log(`\n[${base}] letra ${LETRA_POR_BASE[base] || 'X'}`);
    pasos.forEach(([nombre]) => console.log('  - ' + nombre));
    if (!aplicar) return;

    for (const [nombre, sql, params] of pasos) {
      await c.query(sql, params || []);
      console.log(`  ✔ ${nombre}`);
    }
  } finally {
    await c.end();
  }
}

(async () => {
  console.log(aplicar ? 'MODO: aplicar' : 'MODO: simulación (no escribe)');
  await cargarDefinicionesMarsisa();
  for (const base of Object.keys(LETRA_POR_BASE)) {
    await migrarBase(base);
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
