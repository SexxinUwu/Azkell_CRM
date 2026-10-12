// Ejecuta un comando de migraciones de Prisma en la base de cada empresa (una base por empresa)
// y en la base maestra. La lista de empresas sale de azkell_master.empresas.
//
// Uso:
//   node scripts/prisma_empresas.js estado                 → migraciones pendientes por empresa
//   node scripts/prisma_empresas.js deploy                 → aplica las migraciones pendientes
//   node scripts/prisma_empresas.js resolver <migración>   → marca una migración como ya aplicada
//   Opcional: --solo <slug>  para trabajar con una sola empresa
//
// Conexión: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD (y MASTER_DB_NAME) del .env o del entorno.
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });
const mysql = require('mysql2/promise');

const [, , comando, migracion] = process.argv;
const solo = process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1] : null;
if (!['estado', 'deploy', 'resolver'].includes(comando) || (comando === 'resolver' && !migracion)) {
  console.error('Uso: node scripts/prisma_empresas.js estado | deploy | resolver <migración> [--solo <slug>]');
  process.exit(1);
}

const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD = '', DB_SSL } = process.env;
const MASTER = process.env.MASTER_DB_NAME || 'azkell_master';
const url = db => {
  const ssl = DB_SSL === 'true' ? '?sslaccept=accept_invalid_certs' : '';
  return `mysql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${db}${ssl}`;
};

function prisma(args, env) {
  const r = spawnSync('npx', ['prisma', ...args], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', shell: true });
  // Solo el resumen: nunca se imprime la URL (lleva la contraseña)
  const salida = `${r.stdout || ''}${r.stderr || ''}`.split('\n')
    .filter(l => l.trim() && !/mysql:\/\/|Environment variables|Prisma schema loaded|Datasource "db"|Update available|npm i|major update|pris\.ly|^[│┌└]/.test(l));
  return { ok: r.status === 0, salida };
}

function ejecutar(nombre, schemaArgs, env) {
  const args = comando === 'estado' ? ['migrate', 'status', ...schemaArgs]
    : comando === 'deploy' ? ['migrate', 'deploy', ...schemaArgs]
    : ['migrate', 'resolve', '--applied', migracion, ...schemaArgs];
  const r = prisma(args, env);
  console.log(`${r.ok ? '✓' : '✗'} ${nombre}`);
  r.salida.slice(-4).forEach(l => console.log('    ' + l.trim()));
  return r.ok;
}

(async () => {
  const conn = await mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: DB_USER, password: DB_PASSWORD,
    ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  const [empresas] = await conn.query(`SELECT slug, db_name FROM \`${MASTER}\`.empresas WHERE estado = 'activo' ORDER BY id`);
  await conn.end();

  let fallas = 0;
  if (!solo) {
    if (!ejecutar(`maestra (${MASTER})`, ['--schema', 'prisma/master/schema.prisma'], { MASTER_DATABASE_URL: url(MASTER) })) fallas++;
  }
  for (const e of empresas) {
    if (solo && e.slug !== solo) continue;
    if (!ejecutar(`${e.slug} (${e.db_name})`, [], { DATABASE_URL: url(e.db_name) })) fallas++;
  }
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error('Error:', e.code || '', e.message); process.exit(1); });
