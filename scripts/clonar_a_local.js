// Copia las bases del servidor a tu MySQL local para probar sin tocar producción.
//
//   node scripts/clonar_a_local.js                       → copia azkell_master y azkell_tenant_marsisa
//   node scripts/clonar_a_local.js azkell_tenant_trahesa → otra empresa (además de azkell_master)
//   --reemplazar     borra y vuelve a crear la copia local si ya existe
//   --completo       copia también las bitácoras y fotos pesadas (por defecto solo su estructura)
//   --sin-usuarios   no crea los usuarios de prueba
//
// SEGURIDAD: del servidor real solo LEE (SELECT y SHOW CREATE). Escribe únicamente en tu MySQL local y se niega a
// correr si el destino no es localhost o si coincide con el servidor de origen.
//
// Origen: el .env (DB_HOST, DB_USER, DB_PASSWORD, DB_PORT).
// Destino: LOCAL_DB_HOST (localhost), LOCAL_DB_USER (root), LOCAL_DB_PASSWORD, LOCAL_DB_PORT (3306), desde .env.local o el entorno.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const bases = args.filter(a => !a.startsWith('--'));
const REEMPLAZAR = flags.has('--reemplazar');
const COMPLETO = flags.has('--completo');
const USUARIOS = !flags.has('--sin-usuarios');
const TENANTS = bases.length ? bases : ['azkell_tenant_marsisa'];
const BASES = ['azkell_master', ...TENANTS];

// Tablas cuyo contenido NO se copia (pesadas o con destinatarios, llaves o sesiones que podrían actuar en el mundo real)
const SIN_DATOS = new Set([
  'sesiones_activas', 'push_suscripciones', 'webhooks', 'webhook_envios', 'api_keys', 'integraciones_api',
  'notificaciones_envios', 'notificaciones_reglas', 'oc_approval_tokens',
  ...(COMPLETO ? [] : ['log_auditoria', 'auditoria', 'seg_unidades_registros', 'seg_unidades_fotos']),
]);

const origen = { host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, port: Number(process.env.DB_PORT) || 3306 };
const destino = {
  host: process.env.LOCAL_DB_HOST || 'localhost', user: process.env.LOCAL_DB_USER || 'root',
  password: process.env.LOCAL_DB_PASSWORD || '', port: Number(process.env.LOCAL_DB_PORT) || 3306,
};

const ident = n => '`' + String(n).replace(/`/g, '``') + '`';
const LOTE = 1000;

function comprobarSeguridad() {
  if (!/^(localhost|127\.0\.0\.1|::1)$/i.test(destino.host)) throw new Error(`El destino debe ser localhost (es "${destino.host}"). No se copia nada.`);
  if (String(origen.host).toLowerCase() === destino.host.toLowerCase() && origen.port === destino.port) {
    throw new Error('El origen y el destino son el mismo servidor. Revisa el .env y LOCAL_DB_*. No se copia nada.');
  }
  if (!origen.host || !origen.user) throw new Error('Falta DB_HOST o DB_USER en el .env (origen).');
  if (!destino.password) throw new Error('Falta LOCAL_DB_PASSWORD (la clave de root de tu MySQL local). Ponla en .env.local.');
}

async function copiarBase(src, dst, nombre) {
  console.log(`\n== ${nombre}`);
  const [[existe]] = await dst.query('SELECT COUNT(*) n FROM information_schema.schemata WHERE schema_name = ?', [nombre]);
  if (existe.n) {
    if (!REEMPLAZAR) throw new Error(`La base local ${nombre} ya existe. Usa --reemplazar para borrarla y copiarla de nuevo.`);
    await dst.query(`DROP DATABASE ${ident(nombre)}`);
  }
  await dst.query(`CREATE DATABASE ${ident(nombre)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dst.query(`USE ${ident(nombre)}`);
  await dst.query('SET FOREIGN_KEY_CHECKS = 0');
  await dst.query("SET SESSION sql_mode = ''");

  const [tablas] = await src.query("SELECT table_name AS n, table_type AS t FROM information_schema.tables WHERE table_schema = ? ORDER BY table_type, table_name", [nombre]);
  const reales = tablas.filter(t => t.t === 'BASE TABLE').map(t => t.n);
  const vistas = tablas.filter(t => t.t === 'VIEW').map(t => t.n);

  for (const t of reales) {
    const [[fila]] = await src.query(`SHOW CREATE TABLE ${ident(nombre)}.${ident(t)}`);
    await dst.query(fila['Create Table']);
    if (SIN_DATOS.has(t)) { console.log(`  ${t.padEnd(34)} estructura (sin datos)`); continue; }
    let copiadas = 0;
    for (let desde = 0; ; desde += LOTE) {
      const [filas] = await src.query(`SELECT * FROM ${ident(nombre)}.${ident(t)} LIMIT ${LOTE} OFFSET ${desde}`);
      if (!filas.length) break;
      const cols = Object.keys(filas[0]);
      await dst.query(`INSERT INTO ${ident(t)} (${cols.map(ident).join(',')}) VALUES ?`, [filas.map(f => cols.map(c => f[c]))]);
      copiadas += filas.length;
      if (filas.length < LOTE) break;
    }
    console.log(`  ${t.padEnd(34)} ${copiadas} filas`);
  }
  for (const v of vistas) {
    try {
      const [[fila]] = await src.query(`SHOW CREATE VIEW ${ident(nombre)}.${ident(v)}`);
      await dst.query(fila['Create View'].replace(/DEFINER=`[^`]+`@`[^`]+`\s*/i, '').replace(/SQL SECURITY DEFINER/i, 'SQL SECURITY INVOKER'));
      console.log(`  ${v.padEnd(34)} vista`);
    } catch (e) { console.log(`  ${v} vista NO copiada: ${e.message}`); }
  }
  await dst.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function limpiarTenant(dst, nombre) {
  await dst.query(`USE ${ident(nombre)}`);
  // Números de WhatsApp de la empresa: vacíos, para que ninguna prueba escriba a personas reales
  await dst.query("UPDATE configuracion_erp SET valor = '' WHERE clave LIKE '%whatsapp%'").catch(() => {});
}

async function crearUsuariosPrueba(dst, nombre) {
  await dst.query(`USE ${ident(nombre)}`);
  const clave = process.env.LOCAL_TEST_PASSWORD || ('Prueba-' + crypto.randomBytes(5).toString('hex'));
  const hash = await bcrypt.hash(clave, 10);
  const [roles] = await dst.query('SELECT id, nombre, es_admin FROM roles ORDER BY id');
  const admin = roles.find(r => r.es_admin);
  const lector = roles.find(r => /lector/i.test(r.nombre)) || roles.find(r => !r.es_admin);
  const crear = async (id, correo, nombreU, rol) => {
    if (!rol) return null;
    await dst.query('DELETE FROM usuarios WHERE correo = ?', [correo]);
    await dst.query(
      "INSERT INTO usuarios (idUsuario, nombre, dni, cargo, correo, password, password_visible, rol, estado, permisos_json, rol_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [id, nombreU, '', 'Prueba local', correo, hash, '', rol.nombre, 'Activo', '{}', rol.id]);
    return { correo, rol: rol.nombre };
  };
  const creados = [
    await crear('USR-LOCAL-1', 'admin.local@prueba.test', 'ADMIN PRUEBA LOCAL', admin),
    await crear('USR-LOCAL-2', 'lectura.local@prueba.test', 'LECTURA PRUEBA LOCAL', lector),
  ].filter(Boolean);
  return { clave, creados };
}

(async () => {
  comprobarSeguridad();
  const src = await mysql.createConnection({ ...origen, dateStrings: true, multipleStatements: false, connectTimeout: 15000 });
  const dst = await mysql.createConnection({ ...destino, dateStrings: true, multipleStatements: false, connectTimeout: 15000 });
  try {
    await src.query('SET SESSION TRANSACTION READ ONLY').catch(() => {});
    console.log(`Origen : ${origen.host}:${origen.port} (solo lectura)\nDestino: ${destino.host}:${destino.port} (${destino.user})`);
    for (const b of BASES) await copiarBase(src, dst, b);
    for (const t of TENANTS) await limpiarTenant(dst, t);
    if (USUARIOS) {
      for (const t of TENANTS) {
        const r = await crearUsuariosPrueba(dst, t);
        console.log(`\nUsuarios de prueba en ${t} (clave: ${r.clave}):`);
        r.creados.forEach(u => console.log(`  ${u.correo}  —  rol ${u.rol}`));
      }
    }
    console.log('\nListo. Ahora crea el archivo .env.local (ver .env.local.example) y arranca: npm start  y  npm run dev:app');
  } finally {
    await src.end().catch(() => {});
    await dst.end().catch(() => {});
  }
})().catch(e => { console.error('\nFALLÓ:', e.message); process.exit(1); });
