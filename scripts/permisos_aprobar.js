// 2026-11-11: nueva acción «Aprobar» (a) en los módulos de aprobación. Para no cortar a nadie:
//  - quien hoy puede editar o crear en Aprobación de O/C o de Caja recibe a=1 en ese módulo (rol y permisos propios del usuario);
//  - los roles de Tesorería reciben Notas de crédito (leer, crear, editar) y Aprobar.
// Simula por defecto; con --aplicar respalda (JSON) y escribe en una transacción por empresa. Uso: node scripts/permisos_aprobar.js [--solo slug] [--aplicar]
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const fs = require('fs');
const APLICAR = process.argv.includes('--aplicar');
const solo = process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1] : null;
const DIR = 'C:/Users/teffa/Documents/respaldos-azkell';
const MODS_APROBAR = ['gerencia_aprobaciones_oc', 'gerencia_aprobaciones_caja'];
const ES_TESORERIA = n => /^tesorer[ií]a$/i.test(String(n).trim());
const on = v => v === 1 || v === true || v === '1';
const leer = v => { try { const p = typeof v === 'string' ? JSON.parse(v || '{}') : v; return p && typeof p === 'object' ? p : {}; } catch { return {}; } };

/** Devuelve el JSON nuevo y qué cambió (null si no hay cambios) */
function ajustar(permisos, tesoreria) {
  const p = JSON.parse(JSON.stringify(permisos));
  const cambios = [];
  for (const m of MODS_APROBAR) {
    const v = p[m];
    if (v && typeof v === 'object' && (on(v.e) || on(v.c)) && !on(v.a)) { v.a = 1; cambios.push(`${m}.aprobar`); }
  }
  if (tesoreria) {
    const nc = p.tesoreria_nc && typeof p.tesoreria_nc === 'object' ? p.tesoreria_nc : {};
    const nuevo = { l: 1, c: 1, e: 1, d: on(nc.d) ? 1 : 0, a: 1 };
    if (JSON.stringify({ l: on(nc.l) ? 1 : 0, c: on(nc.c) ? 1 : 0, e: on(nc.e) ? 1 : 0, d: on(nc.d) ? 1 : 0, a: on(nc.a) ? 1 : 0 }) !== JSON.stringify(nuevo)) { p.tesoreria_nc = { ...nc, ...nuevo }; cambios.push('tesoreria_nc (leer, crear, editar, aprobar)'); }
  }
  return { json: JSON.stringify(p), cambios };
}

(async () => {
  const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD = '', DB_SSL } = process.env;
  for (const slug of ['marsisa', 'rosymarperu', 'yoguitransport', 'trahesa']) {
    if (solo && solo !== slug) continue;
    const c = await mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: DB_USER, password: DB_PASSWORD, database: 'azkell_tenant_' + slug, ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
    const [roles] = await c.query('SELECT id, nombre, es_admin, permisos_json FROM roles');
    const [usuarios] = await c.query('SELECT idUsuario, nombre, correo, rol_id, permisos_json FROM usuarios');
    const pendientes = [];
    for (const r of roles) {
      if (r.es_admin) continue;
      const a = ajustar(leer(r.permisos_json), ES_TESORERIA(r.nombre));
      if (a.cambios.length) pendientes.push({ tabla: 'roles', id: r.id, etiqueta: `rol ${r.nombre}`, antes: r.permisos_json, despues: a.json, cambios: a.cambios });
    }
    for (const u of usuarios) {
      const a = ajustar(leer(u.permisos_json), false);
      if (a.cambios.length) pendientes.push({ tabla: 'usuarios', id: u.idUsuario, etiqueta: `usuario ${u.nombre || u.correo}`, antes: u.permisos_json, despues: a.json, cambios: a.cambios });
    }
    console.log(`${slug}: ${pendientes.length} cambios`);
    for (const p of pendientes) console.log(`  ${p.etiqueta}: ${p.cambios.join(', ')}`);
    if (!APLICAR || !pendientes.length) { await c.end(); continue; }
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(`${DIR}/permisos_aprobar_${slug}_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(pendientes.map(p => ({ tabla: p.tabla, id: p.id, antes: p.antes })), null, 1));
    await c.beginTransaction();
    try {
      for (const p of pendientes) {
        const sql = p.tabla === 'roles' ? 'UPDATE roles SET permisos_json=? WHERE id=?' : 'UPDATE usuarios SET permisos_json=? WHERE idUsuario=?';
        const [r] = await c.query(sql, [p.despues, p.id]);
        if (r.affectedRows !== 1) throw new Error(`${p.etiqueta}: ${r.affectedRows} filas`);
      }
      await c.commit(); console.log(`  ${slug} OK`);
    } catch (e) { await c.rollback(); throw e; }
    await c.end();
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
