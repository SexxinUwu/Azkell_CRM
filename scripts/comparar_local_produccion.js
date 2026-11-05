// Compara la base local (.env.local) con producción (.env) de cada empresa: tablas, columnas y migraciones.
// SOLO LEE: information_schema y la tabla _prisma_migrations. No escribe en ninguna base.
//
//   node scripts/comparar_local_produccion.js
//
// Sale con código 0 si la estructura coincide, 1 si hay diferencias. Los datos (filas) no se comparan:
// la copia local es una foto de producción, y los datos de prueba no se envían a producción.
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

const env = dotenv.parse(fs.readFileSync(path.join(ROOT, '.env')));
const envLocal = fs.existsSync(path.join(ROOT, '.env.local')) ? dotenv.parse(fs.readFileSync(path.join(ROOT, '.env.local'))) : {};

const conectar = (cfg) => mysql.createConnection({
  host: cfg.host, port: Number(cfg.port || 3306), user: cfg.user, password: cfg.password || '',
  ssl: cfg.ssl === 'true' ? { rejectUnauthorized: false } : undefined,
});
const produccion = { host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, ssl: env.DB_SSL };
const local = { host: envLocal.LOCAL_DB_HOST || envLocal.DB_HOST || 'localhost', port: envLocal.LOCAL_DB_PORT || envLocal.DB_PORT,
  user: envLocal.LOCAL_DB_USER || envLocal.DB_USER, password: envLocal.LOCAL_DB_PASSWORD || envLocal.DB_PASSWORD, ssl: '' };
const MASTER = env.MASTER_DB_NAME || 'azkell_master';

async function estructura(conn, db) {
  const [tablas] = await conn.query("SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'", [db]);
  const [cols] = await conn.query(
    'SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE ty, IS_NULLABLE n, COLUMN_DEFAULT d, EXTRA e FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?', [db]);
  const [mig] = await conn.query("SELECT COUNT(*) k FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = '_prisma_migrations'", [db]);
  const aplicadas = new Set();
  if (mig[0].k) {
    const [m] = await conn.query('SELECT migration_name n FROM `' + db + '`._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    m.forEach(x => aplicadas.add(x.n));
  }
  return {
    tablas: new Set(tablas.map(x => x.t)),
    columnas: new Map(cols.map(x => [`${x.t}.${x.c}`, `${x.ty}|null=${x.n}|def=${x.d}|${x.e}`])),
    aplicadas,
  };
}

(async () => {
  const cp = await conectar(produccion);
  const cl = await conectar(local);
  const [emp] = await cp.query(`SELECT slug, db_name FROM \`${MASTER}\`.empresas ORDER BY id`);
  const bases = [MASTER, ...emp.map(e => e.db_name)];
  const pendientesRepo = fs.readdirSync(path.join(ROOT, 'prisma', 'schema', 'migrations')).filter(n => /^\d+_/.test(n)).sort();

  let diferencias = 0;
  console.log(`Producción: ${produccion.host}  |  Local: ${local.host}`);
  for (const db of bases) {
    const [[existeP]] = await cp.query('SELECT COUNT(*) k FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [db]);
    const [[existeL]] = await cl.query('SELECT COUNT(*) k FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [db]);
    console.log(`\n== ${db}`);
    if (!existeL.k) { console.log('  ✗ no existe en local'); diferencias++; continue; }
    if (!existeP.k) { console.log('  ✗ no existe en producción'); diferencias++; continue; }
    const p = await estructura(cp, db);
    const l = await estructura(cl, db);
    const soloP = [...p.tablas].filter(t => !l.tablas.has(t));
    const soloL = [...l.tablas].filter(t => !p.tablas.has(t));
    const colsSoloP = [...p.columnas.keys()].filter(k => !l.columnas.has(k) && p.tablas.has(k.split('.')[0]) && l.tablas.has(k.split('.')[0]));
    const colsSoloL = [...l.columnas.keys()].filter(k => !p.columnas.has(k) && p.tablas.has(k.split('.')[0]) && l.tablas.has(k.split('.')[0]));
    const colsDistintas = [...p.columnas.keys()].filter(k => l.columnas.has(k) && l.columnas.get(k) !== p.columnas.get(k));
    // La maestra tiene sus propias migraciones (prisma/master): aquí solo se comparan tablas y columnas
    const migs = db === MASTER ? [] : pendientesRepo;
    const pendP = migs.filter(m => !p.aplicadas.has(m));
    const pendL = migs.filter(m => !l.aplicadas.has(m));
    const bloque = [];
    if (soloP.length) bloque.push(`  tablas solo en producción: ${soloP.join(', ')}`);
    if (soloL.length) bloque.push(`  tablas solo en local: ${soloL.join(', ')}`);
    if (colsSoloP.length) bloque.push(`  columnas solo en producción: ${colsSoloP.join(', ')}`);
    if (colsSoloL.length) bloque.push(`  columnas solo en local: ${colsSoloL.join(', ')}`);
    if (colsDistintas.length) bloque.push(`  columnas con distinto tipo o nulidad: ${colsDistintas.join(', ')}`);
    if (pendP.length) bloque.push(`  migraciones del repo sin aplicar en producción: ${pendP.join(', ')}`);
    if (pendL.length) bloque.push(`  migraciones del repo sin aplicar en local: ${pendL.join(', ')}`);
    if (bloque.length) { diferencias++; console.log(bloque.join('\n')); }
    else console.log(`  ✓ igual: ${p.tablas.size} tablas, ${p.columnas.size} columnas${db === MASTER ? '' : `, ${p.aplicadas.size} migraciones aplicadas`}`);
  }
  console.log(diferencias ? `\nHay diferencias en ${diferencias} base(s).` : '\nEstructura y migraciones iguales en todas las bases.');
  await cp.end(); await cl.end();
  process.exit(diferencias ? 1 : 0);
})().catch(e => { console.error('Error:', e.code || e.message); process.exit(2); });
