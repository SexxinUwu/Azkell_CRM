// Genera (NO ejecuta) el SQL que iguala la estructura de las bases de todas las empresas.
// Regla: se ensancha, nunca se recorta. Casos especiales decididos en docs/fase1-esquema.md.
// Uso: node generar_igualacion.js <raiz-proyecto> <carpeta-salida> [host port user pass]
//   Sin host/port/user/pass usa las variables DB_* del .env del proyecto.
const path = require('path');
const fs = require('fs');
const ROOT = process.argv[2];
const OUT = process.argv[3];
require(path.join(ROOT, 'node_modules/dotenv')).config({ path: path.join(ROOT, '.env'), quiet: true });
const mysql = require(path.join(ROOT, 'node_modules/mysql2/promise'));

const [, , , , H, P, U, W] = process.argv;
const cfg = H
  ? { host: H, port: +P, user: U, password: W || '' }
  : { host: process.env.DB_HOST, port: +process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined };

// Casos decididos (docs/fase1-esquema.md)
const FORZADO = {
  'inventario.anaquel': 'varchar(50)',
  'trabajos_ot.fecha_trabajo': 'datetime',
  'tipos_mantenimiento.frecuencia_horas': 'decimal(10,2)',
  'tipos_mantenimiento.frecuencia_km': 'decimal(10,2)',
};
// Se dejan como están en cada empresa
const NO_TOCAR = new Set([
  'tesoreria_cuentas.comision_porcentaje', // valor por defecto propio de cada empresa
  'tesoreria_cuentas.credito_dias',        // ídem
]);
// Columnas basura que init_db.js metió en fleetrun (copiadas de la tabla de secuencias).
// `modulo` es obligatoria y única: bloquea toda importación de Fleetrun en modo estricto.
// No se copian a las demás; se quitan donde existen (solo si la tabla está vacía).
const QUITAR = { fleetrun: ['modulo', 'prefijo', 'ultimo_numero'] };
// Índices únicos que sí se agregan donde faltan (el código ya cuenta con ellos y no hay repetidos)
const UNICOS_PERMITIDOS = new Set(['checklist_config_sistemas.uk_unidad_sys']);

const q = s => '`' + s.replace(/`/g, '``') + '`';
const lit = v => "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";

function familia(t) {
  t = t.toLowerCase();
  if (/^(varchar|char)\(/.test(t) || /^enum\(/.test(t) || /^set\(/.test(t) || /text$/.test(t) || t === 'json') return 'texto';
  if (/^(tinyint|smallint|mediumint|int|bigint)/.test(t) || /^decimal/.test(t) || /^(float|double)/.test(t)) return 'numero';
  if (/^(date|datetime|timestamp)/.test(t)) return 'fecha';
  return 'otro:' + t;
}
function largoTexto(t) {
  const m = t.match(/^(?:varchar|char)\((\d+)\)/i); if (m) return +m[1];
  const e = t.match(/^(?:enum|set)\((.*)\)$/i);
  if (e) return Math.max(...[...e[1].matchAll(/'((?:[^']|'')*)'/g)].map(x => x[1].length), 1);
  return 0;
}
const RANGO_TEXTO = { text: 1, mediumtext: 2, longtext: 3, json: 3 };
const RANGO_INT = { tinyint: 1, smallint: 2, mediumint: 3, int: 4, bigint: 5 };

// Devuelve el tipo más ancho o null si no se puede decidir sin una persona
function ensanchar(tipos) {
  const u = [...new Set(tipos.map(t => t.toLowerCase()))];
  if (u.length === 1) return u[0];
  const fams = new Set(u.map(familia));
  if (fams.size > 1) return null;
  const f = [...fams][0];
  if (f === 'texto') {
    const rango = Math.max(0, ...u.map(t => RANGO_TEXTO[t] || 0));
    if (rango) return ['', 'text', 'mediumtext', 'longtext'][rango];
    return `varchar(${Math.max(...u.map(largoTexto))})`;
  }
  if (f === 'numero') {
    const dec = u.filter(t => /^decimal/.test(t));
    if (u.some(t => /^(float|double)/.test(t))) return null;
    if (dec.length) {
      let p = 0, s = 0;
      for (const t of dec) { const m = t.match(/decimal\((\d+),(\d+)\)/); p = Math.max(p, +m[1] - +m[2]); s = Math.max(s, +m[2]); }
      const enteros = u.filter(t => !/^decimal/.test(t)).length ? Math.max(p, 11) : p;
      return `decimal(${enteros + s},${s})`;
    }
    const base = u.map(t => t.match(/^[a-z]+/)[0]);
    const max = base.reduce((a, b) => (RANGO_INT[b] > RANGO_INT[a] ? b : a));
    const unsigned = u.every(t => /unsigned/.test(t)) ? ' unsigned' : '';
    return max + unsigned;
  }
  if (f === 'fecha') return u.includes('timestamp') && u.length === 1 ? 'timestamp' : 'datetime';
  return null;
}

function definicion(tipo, c, { nulo, onUpdate }) {
  const esTexto = familia(tipo) === 'texto';
  const largo = /text$/.test(tipo) || tipo === 'json';
  let d = tipo;
  if (esTexto && c.CHARACTER_SET_NAME && tipo !== 'json') d += ` CHARACTER SET ${c.CHARACTER_SET_NAME} COLLATE ${c.COLLATION_NAME}`;
  d += nulo ? ' NULL' : ' NOT NULL';
  if (c.COLUMN_DEFAULT !== null && c.COLUMN_DEFAULT !== undefined) {
    const def = c.COLUMN_DEFAULT;
    if (/DEFAULT_GENERATED/.test(c.EXTRA) && !/^'/.test(def)) d += ` DEFAULT ${largo ? '(' + def + ')' : def}`;
    else if (largo) d += ` DEFAULT (${lit(def)})`;
    else if (familia(tipo) === 'numero') d += ` DEFAULT ${def}`;
    else d += ` DEFAULT ${lit(def)}`;
  } else if (nulo) d += ' DEFAULT NULL';
  if (onUpdate) d += ' ON UPDATE CURRENT_TIMESTAMP';
  if (/auto_increment/.test(c.EXTRA)) d += ' AUTO_INCREMENT';
  if (c.COLUMN_COMMENT) d += ` COMMENT ${lit(c.COLUMN_COMMENT)}`;
  return d;
}

(async () => {
  const conn = await mysql.createConnection(cfg);
  const master = process.env.MASTER_DB_NAME || 'azkell_master';
  const [emp] = await conn.query(`SELECT slug, db_name FROM ${q(master)}.empresas ORDER BY id`);
  const bases = emp.map(e => e.db_name);

  const cols = {}, tablas = {}, crear = {};
  for (const db of bases) {
    const [t] = await conn.query(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE'`, [db]);
    tablas[db] = new Set(t.map(r => r.TABLE_NAME));
    const [c] = await conn.query(`SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME, ORDINAL_POSITION`, [db]);
    cols[db] = {};
    for (const r of c) (cols[db][r.TABLE_NAME] ||= {})[r.COLUMN_NAME] = r;
  }
  const todas = [...new Set(bases.flatMap(d => [...tablas[d]]))].sort();

  // Tablas que faltan: CREATE TABLE copiado de la empresa con más columnas en esa tabla
  const faltan = {}; bases.forEach(d => (faltan[d] = []));
  for (const t of todas) {
    const tienen = bases.filter(d => tablas[d].has(t));
    if (tienen.length === bases.length) continue;
    const donante = tienen.reduce((a, b) => (Object.keys(cols[b][t]).length > Object.keys(cols[a][t]).length ? b : a));
    const [[r]] = await conn.query(`SHOW CREATE TABLE ${q(donante)}.${q(t)}`);
    crear[t] = { donante, sql: r['Create Table'].replace(/ AUTO_INCREMENT=\d+/, '') };
    for (const d of bases) if (!tablas[d].has(t)) { faltan[d].push(t); cols[d][t] = cols[donante][t]; }
  }
  // Orden de creación: primero las tablas referenciadas por llaves foráneas
  const orden = Object.keys(crear).sort((a, b) => (crear[a].sql.includes('REFERENCES `' + b + '`') ? 1 : crear[b].sql.includes('REFERENCES `' + a + '`') ? -1 : 0));

  const sql = {}, cambios = {}, pendientes = [];
  bases.forEach(d => { sql[d] = []; cambios[d] = []; });
  for (const d of bases) for (const t of orden) if (faltan[d].includes(t)) {
    sql[d].push(`-- Tabla nueva (copiada de ${crear[t].donante})\n${crear[t].sql.replace(/^CREATE TABLE/, 'CREATE TABLE IF NOT EXISTS')};`);
    cambios[d].push(`+ tabla ${t}`);
  }

  for (const t of todas) {
    const nombres = [...new Set(bases.flatMap(d => Object.keys(cols[d][t] || {})))];
    for (const c of nombres) {
      const clave = `${t}.${c}`;
      const defs = bases.map(d => cols[d][t][c]).filter(Boolean);
      if (NO_TOCAR.has(clave)) continue;
      if ((QUITAR[t] || []).includes(c)) {
        for (const d of bases) if (cols[d][t][c]) {
          const [[{ n }]] = await conn.query(`SELECT COUNT(*) n FROM ${q(d)}.${q(t)}`);
          if (n > 0) { pendientes.push(`${d}.${clave}: no se quita, la tabla tiene ${n} filas`); continue; }
          if (c === 'modulo') sql[d].push(`ALTER TABLE ${q(t)} DROP INDEX ${q('modulo')};`);
          sql[d].push(`ALTER TABLE ${q(t)} DROP COLUMN ${q(c)};`);
          cambios[d].push(`- ${clave} (columna sobrante de init_db.js; tabla vacía)`);
        }
        continue;
      }
      const calculada = defs.find(x => /GENERATED/.test(x.EXTRA) && !/DEFAULT_GENERATED/.test(x.EXTRA));
      if (calculada) {
        // Donde es columna normal y la tabla está vacía, se convierte a calculada (como en las demás)
        for (const d of bases) {
          const x = cols[d][t][c];
          if (!x || x.EXTRA === calculada.EXTRA) continue;
          const [[{ n }]] = await conn.query(`SELECT COUNT(*) n FROM ${q(d)}.${q(t)}`);
          if (n > 0) { pendientes.push(`${d}.${clave}: columna calculada en otras empresas; aquí normal con ${n} filas`); continue; }
          const tipoSto = /STORED/.test(calculada.EXTRA) ? 'STORED' : 'VIRTUAL';
          sql[d].push(`ALTER TABLE ${q(t)} MODIFY COLUMN ${q(c)} ${calculada.COLUMN_TYPE} GENERATED ALWAYS AS (${calculada.GENERATION_EXPRESSION}) ${tipoSto};`);
          cambios[d].push(`~ ${clave}: pasa a calculada (tabla vacía)`);
        }
        continue;
      }
      const tipo = FORZADO[clave] || ensanchar(defs.map(x => x.COLUMN_TYPE));
      if (!tipo) { pendientes.push(`${clave}: tipos incompatibles ${[...new Set(defs.map(x => x.COLUMN_TYPE))].join(' / ')}`); continue; }
      const nulo = defs.some(x => x.IS_NULLABLE === 'YES');
      const onUpdate = defs.some(x => /on update/i.test(x.EXTRA));
      const modelo = defs.find(x => x.COLUMN_DEFAULT !== null) || defs[0];
      for (const d of bases) {
        const x = cols[d][t][c];
        if (!x) {
          sql[d].push(`ALTER TABLE ${q(t)} ADD COLUMN ${q(c)} ${definicion(tipo, modelo, { nulo, onUpdate })};`);
          cambios[d].push(`+ ${clave} ${tipo}`);
          continue;
        }
        if (faltan[d].includes(t)) continue; // recién creada: ya trae la definición del donante
        const igualTipo = x.COLUMN_TYPE.toLowerCase() === tipo;
        const igualNulo = (x.IS_NULLABLE === 'YES') === nulo;
        const igualUpd = /on update/i.test(x.EXTRA) === onUpdate;
        if (igualTipo && igualNulo && igualUpd) continue;
        sql[d].push(`ALTER TABLE ${q(t)} MODIFY COLUMN ${q(c)} ${definicion(tipo, x, { nulo, onUpdate })};`);
        const det = [];
        if (!igualTipo) det.push(`${x.COLUMN_TYPE} → ${tipo}`);
        if (!igualNulo) det.push('ahora admite vacío');
        if (!igualUpd) det.push('se actualiza sola al modificar');
        cambios[d].push(`~ ${clave}: ${det.join(', ')}`);
      }
    }
  }
  // ── Índices: se agregan los normales que faltan (solo aceleran) y los únicos permitidos ──
  const idx = {};
  for (const d of bases) {
    const [r] = await conn.query(
      `SELECT TABLE_NAME t, INDEX_NAME i, NON_UNIQUE nu, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cs
       FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE`, [d]);
    idx[d] = r;
  }
  const vistos = new Set();
  for (const d0 of bases) for (const ix of idx[d0]) {
    const clave = `${ix.t}.${ix.i}`;
    if (vistos.has(clave) || ix.i === 'PRIMARY' || (QUITAR[ix.t] || []).some(c => ix.cs.split(',').includes(c))) continue;
    vistos.add(clave);
    const unico = !ix.nu;
    // Las tablas recién creadas ya traen todos sus índices en el CREATE TABLE
    const tieneIdx = d => faltan[d].includes(ix.t) || idx[d].some(x => x.t === ix.t && (x.i === ix.i || x.cs === ix.cs));
    if (bases.every(tieneIdx)) continue;
    if (unico && !UNICOS_PERMITIDOS.has(clave)) {
      const faltaEn = bases.filter(d => !tieneIdx(d));
      if (faltaEn.length) pendientes.push(`índice único ${clave} (${ix.cs}) falta en ${faltaEn.map(d => d.replace('azkell_tenant_', '')).join(', ')}: no se agrega (cambiaría lo que la app acepta)`);
      continue;
    }
    for (const d of bases) {
      // Ya lo tiene (o uno con las mismas columnas con otro nombre), o la tabla se crea completa
      if (tieneIdx(d)) continue;
      const colsIdx = ix.cs.split(',').map(q).join(', ');
      sql[d].push(`ALTER TABLE ${q(ix.t)} ADD ${unico ? 'UNIQUE ' : ''}INDEX ${q(ix.i)} (${colsIdx});`);
      cambios[d].push(`+ índice ${unico ? 'único ' : ''}${clave} (${ix.cs})`);
    }
  }
  await conn.end();

  fs.mkdirSync(OUT, { recursive: true });
  for (const d of bases) {
    const cab = `-- Igualación de esquema · ${d} · generado ${new Date().toISOString()}\n-- Revisar antes de ejecutar. Requiere respaldo previo.\nUSE ${q(d)};\nSET FOREIGN_KEY_CHECKS=0;\n`;
    fs.writeFileSync(path.join(OUT, `${d}.sql`), cab + sql[d].join('\n') + '\nSET FOREIGN_KEY_CHECKS=1;\n');
  }
  const resumen = bases.map(d => `## ${d} (${cambios[d].length} cambios)\n${cambios[d].map(x => '- ' + x).join('\n')}`).join('\n\n')
    + `\n\n## Sin resolver (${pendientes.length})\n${pendientes.map(x => '- ' + x).join('\n')}\n`;
  fs.writeFileSync(path.join(OUT, 'resumen.md'), resumen);
  console.log(bases.map(d => `${d}: ${cambios[d].length} cambios`).join('\n'));
  console.log(`Sin resolver: ${pendientes.length}`);
})().catch(e => { console.error('Error:', e.code || '', e.message); process.exit(1); });
