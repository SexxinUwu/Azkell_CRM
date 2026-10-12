// Completa la migración 0_baseline generada por Prisma con lo que Prisma no sabe representar,
// tomándolo de una base de empresa real (ya igualada):
//   - columnas que MySQL actualiza solas (ON UPDATE CURRENT_TIMESTAMP)
//   - columnas calculadas (GENERATED ALWAYS AS ... STORED/VIRTUAL)
//
// Uso: node scripts/prisma_baseline.js <migration.sql> <mysql-url-de-referencia>
//   La migración se genera antes con:
//   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema --script
const fs = require('fs');
const path = require('path');
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'));

const [, , ARCHIVO, URL_REF] = process.argv;

(async () => {
  const conn = await mysql.createConnection(URL_REF);
  const db = new URL(URL_REF).pathname.slice(1);
  const [cols] = await conn.query(
    `SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE ty, IS_NULLABLE n, EXTRA x, GENERATION_EXPRESSION g
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND (EXTRA LIKE '%on update%' OR (GENERATION_EXPRESSION IS NOT NULL AND GENERATION_EXPRESSION <> ''))`, [db]);
  await conn.end();

  let sql = fs.readFileSync(ARCHIVO, 'utf8');
  let onUpdate = 0, calculadas = 0;
  const noEncontradas = [];
  for (const col of cols) {
    // Bloque CREATE TABLE de la tabla
    const ini = sql.indexOf('CREATE TABLE `' + col.t + '` (');
    if (ini < 0) { noEncontradas.push(`${col.t}.${col.c}`); continue; }
    const fin = sql.indexOf(';', ini);
    const bloque = sql.slice(ini, fin);
    const re = new RegExp('^(\\s+`' + col.c + '` )([^\\n]*?)(,?)$', 'm');
    const m = bloque.match(re);
    if (!m) { noEncontradas.push(`${col.t}.${col.c}`); continue; }
    let def = m[2];
    if (col.g) {
      const tipo = /STORED/i.test(col.x) ? 'STORED' : 'VIRTUAL';
      def = `${col.ty.toUpperCase()} GENERATED ALWAYS AS (${col.g}) ${tipo}${col.n === 'YES' ? ' NULL' : ' NOT NULL'}`;
      calculadas++;
    } else if (!/ON UPDATE/i.test(def)) {
      const fsp = (def.match(/CURRENT_TIMESTAMP\((\d)\)/) || [])[1];
      def += ` ON UPDATE CURRENT_TIMESTAMP${fsp ? `(${fsp})` : ''}`;
      onUpdate++;
    }
    sql = sql.slice(0, ini) + bloque.replace(re, `$1${def}$3`) + sql.slice(fin);
  }
  const cab = '-- Migración inicial: el esquema de las bases de empresa tal como estaba el 2026-10-12 (ya igualado).\n'
    + '-- En las empresas existentes se marca como aplicada (prisma migrate resolve --applied 0_baseline);\n'
    + '-- en una empresa nueva crea todas las tablas.\n'
    + `-- Completada con scripts/prisma_baseline.js: ${onUpdate} columnas ON UPDATE CURRENT_TIMESTAMP y ${calculadas} calculadas.\n\n`;
  fs.writeFileSync(ARCHIVO, cab + sql.replace(/^-- Migración inicial[\s\S]*?\n\n/, ''));
  console.log(`ON UPDATE: ${onUpdate} · calculadas: ${calculadas}${noEncontradas.length ? ' · no encontradas: ' + noEncontradas.join(', ') : ''}`);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
