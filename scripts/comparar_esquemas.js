// Compara la estructura (solo information_schema, sin datos) de las bases de cada empresa.
// Uso: node comparar_esquemas.js <raiz-proyecto> <carpeta-salida>
const path = require('path');
const fs = require('fs');
const ROOT = process.argv[2];
const OUT = process.argv[3];
require(path.join(ROOT, 'node_modules/dotenv')).config({ path: path.join(ROOT, '.env') });
const mysql = require(path.join(ROOT, 'node_modules/mysql2/promise'));

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || 3306),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  const master = process.env.MASTER_DB_NAME || 'azkell_master';
  const [emp] = await conn.query(`SELECT slug, nombre_empresa, db_name, estado FROM \`${master}\`.empresas ORDER BY id`);
  const [dbs] = await conn.query(`SELECT SCHEMA_NAME FROM information_schema.SCHEMATA`);
  const existentes = new Set(dbs.map(d => d.SCHEMA_NAME));
  const [ver] = await conn.query('SELECT VERSION() v, @@lower_case_table_names lc');

  const esquemas = {};
  for (const e of emp) {
    if (!existentes.has(e.db_name)) { esquemas[e.db_name] = null; continue; }
    const [tablas] = await conn.query(
      `SELECT TABLE_NAME t, TABLE_TYPE tipo, ENGINE motor, TABLE_COLLATION col, TABLE_ROWS filas
       FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`, [e.db_name]);
    const [cols] = await conn.query(
      `SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE tipo, IS_NULLABLE nul, COLUMN_DEFAULT def, COLUMN_KEY k, EXTRA x
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`, [e.db_name]);
    const [idx] = await conn.query(
      `SELECT TABLE_NAME t, INDEX_NAME i, NON_UNIQUE nu, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cs
       FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE`, [e.db_name]);
    const [fks] = await conn.query(
      `SELECT TABLE_NAME t, CONSTRAINT_NAME n, COLUMN_NAME c, REFERENCED_TABLE_NAME rt, REFERENCED_COLUMN_NAME rc
       FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [e.db_name]);
    const s = {};
    for (const t of tablas) s[t.t] = { tipo: t.tipo, motor: t.motor, col: t.col, filas: t.filas, cols: {}, idx: {}, fks: [] };
    for (const c of cols) if (s[c.t]) s[c.t].cols[c.c] = `${c.tipo}${c.nul === 'NO' ? ' NOT NULL' : ''}${c.def !== null ? ' DEFAULT ' + c.def : ''}${c.x ? ' ' + c.x : ''}`;
    for (const i of idx) if (s[i.t]) s[i.t].idx[i.i] = `${i.nu ? '' : 'UNIQUE '}(${i.cs})`;
    for (const f of fks) if (s[f.t]) s[f.t].fks.push(`${f.c} → ${f.rt}.${f.rc}`);
    esquemas[e.db_name] = s;
  }
  await conn.end();
  fs.writeFileSync(path.join(OUT, 'esquemas.json'), JSON.stringify({ version: ver[0], empresas: emp, esquemas }, null, 1));

  // ── Resumen ──
  const bases = emp.map(e => e.db_name).filter(d => esquemas[d]);
  const todasTablas = new Set(bases.flatMap(d => Object.keys(esquemas[d])));
  console.log(`MySQL ${ver[0].v} · lower_case_table_names=${ver[0].lc}`);
  console.log('Empresas:'); emp.forEach(e => console.log(`  ${e.slug.padEnd(16)} ${e.db_name.padEnd(32)} ${e.estado}${esquemas[e.db_name] ? ` · ${Object.keys(esquemas[e.db_name]).length} tablas` : ' · ⚠ la base no existe'}`));
  let comunes = 0, difTablas = [], difCols = 0, difTipo = 0;
  const detalle = [];
  for (const t of [...todasTablas].sort()) {
    const en = bases.filter(d => esquemas[d][t]);
    if (en.length !== bases.length) { difTablas.push(`${t} (solo en: ${en.map(d => d.replace('azkell_tenant_', '')).join(', ')})`); continue; }
    comunes++;
    const allCols = new Set(en.flatMap(d => Object.keys(esquemas[d][t].cols)));
    for (const c of allCols) {
      const defs = en.map(d => esquemas[d][t].cols[c]);
      if (defs.some(x => x === undefined)) { difCols++; detalle.push(`${t}.${c}: falta en ${en.filter(d => !esquemas[d][t].cols[c]).map(d => d.replace('azkell_tenant_', '')).join(', ')}`); }
      else if (new Set(defs).size > 1) { difTipo++; detalle.push(`${t}.${c}: distinto → ${en.map((d, i) => d.replace('azkell_tenant_', '') + ': ' + defs[i]).join(' | ')}`); }
    }
  }
  const vistas = [...todasTablas].filter(t => bases.some(d => esquemas[d][t] && esquemas[d][t].tipo === 'VIEW'));
  const fksTot = bases.reduce((a, d) => a + Object.values(esquemas[d]).reduce((b, t) => b + t.fks.length, 0), 0);
  const sinPk = [...todasTablas].filter(t => bases.some(d => esquemas[d][t] && esquemas[d][t].tipo !== 'VIEW' && !esquemas[d][t].idx.PRIMARY));
  console.log(`\nTablas en total: ${todasTablas.size} · en todas las empresas: ${comunes} · solo en algunas: ${difTablas.length}`);
  console.log(`Vistas: ${vistas.length} · Llaves foráneas: ${fksTot} · Tablas sin llave primaria: ${sinPk.length}`);
  console.log(`Columnas que faltan en alguna empresa: ${difCols} · Columnas con definición distinta: ${difTipo}`);
  fs.writeFileSync(path.join(OUT, 'diferencias.txt'),
    ['TABLAS SOLO EN ALGUNAS EMPRESAS', ...difTablas, '', 'VISTAS', ...vistas, '', 'SIN LLAVE PRIMARIA', ...sinPk, '', 'COLUMNAS', ...detalle].join('\n'));
})().catch(e => { console.error('Error:', e.code || '', e.message); process.exit(1); });
