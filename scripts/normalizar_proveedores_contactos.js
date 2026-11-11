// 2026-11-11: pasa los proveedores al modelo "una empresa, varios contactos".
//  1) Crea el contacto de cada proveedor sin contactos: el asesor que estaba en "nombre" (o en la línea "Contacto: ..." de observaciones) con el teléfono y correo.
//  2) Pone la razón social como "nombre" y actualiza el texto del proveedor en órdenes de compra, entradas y notas de crédito.
//  3) Agrega como contactos a los asesores de los duplicados ya fusionados (JSON de respaldos-azkell).
// Simula por defecto; con --aplicar respalda (JSON) y escribe en una transacción por empresa. Uso: node scripts/normalizar_proveedores_contactos.js [--solo slug] [--aplicar]
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const fs = require('fs');
const APLICAR = process.argv.includes('--aplicar');
const solo = process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1] : null;
const DIR = 'C:/Users/teffa/Documents/respaldos-azkell';
const FECHA = new Date().toISOString().slice(0, 10);
const EMPRESA = /(S\.?A\.?C?\.?|E\.?I\.?R\.?L\.?|S\.?R\.?L\.?|SOCIEDAD|EMPRESA)\s*$|S\.A\.C|E\.I\.R\.L|S\.R\.L/i;
const norm = s => String(s ?? '').trim().replace(/\s+/g, ' ');
const igual = (a, b) => norm(a).toUpperCase() === norm(b).toUpperCase();

(async () => {
  const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD = '', DB_SSL } = process.env;
  let asesoresFusion = [];
  try { asesoresFusion = JSON.parse(fs.readFileSync(`${DIR}/proveedores_asesores_${FECHA}.json`, 'utf8')); } catch { /* sin JSON */ }
  for (const slug of ['marsisa', 'rosymarperu', 'yoguitransport', 'trahesa']) {
    if (solo && solo !== slug) continue;
    const c = await mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: DB_USER, password: DB_PASSWORD, database: 'azkell_tenant_' + slug, ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
    const [provs] = await c.query('SELECT * FROM proveedores_inv ORDER BY id');
    const [conts] = await c.query('SELECT proveedor_id, COUNT(*) n FROM proveedor_contactos GROUP BY proveedor_id');
    const conN = new Map(conts.map(x => [x.proveedor_id, x.n]));
    const nuevos = [], renombres = [], obsLimpias = [];
    for (const p of provs) {
      const empresa = norm(p.razon_social);
      const linea = String(p.observaciones ?? '').split('\n').find(l => l.startsWith('Contacto: '));
      let asesor = linea ? norm(linea.slice(10)) : (empresa && !igual(empresa, p.nombre) ? norm(p.nombre) : '');
      if (EMPRESA.test(asesor)) asesor = ''; // un nombre de empresa no es un asesor
      if (!conN.get(p.id) && (asesor || norm(p.telefono) || norm(p.email))) {
        nuevos.push([p.id, asesor || 'Contacto general', null, norm(p.telefono) || null, norm(p.email) || null, 1]);
      }
      if (empresa && !igual(empresa, p.nombre)) renombres.push({ id: p.id, antes: p.nombre, despues: empresa });
      if (linea) obsLimpias.push({ id: p.id, obs: p.observaciones.split('\n').filter(l => !l.startsWith('Contacto: ')).join('\n').trim() || null });
    }
    // asesores de los duplicados fusionados
    const extra = [];
    for (const f of asesoresFusion) {
      if (slug !== 'marsisa') continue;
      const d = f.duplicado, s = provs.find(p => p.id === f.sobreviviente);
      if (!s) continue;
      const empresa = norm(f.empresa);
      const nombre = igual(d.nombre, empresa) || EMPRESA.test(d.nombre) ? 'Contacto general' : norm(d.nombre);
      const mismoTel = nuevos.find(n => n[0] === s.id && norm(d.telefono) && n[3] === norm(d.telefono));
      if (mismoTel && mismoTel[1] === 'Contacto general' && nombre !== 'Contacto general') { mismoTel[1] = nombre; continue; }
      const yaEsta = [...nuevos, ...extra].some(n => n[0] === s.id && (igual(n[1], nombre) || (norm(d.telefono) && n[3] === norm(d.telefono))));
      if (yaEsta || (nombre === 'Contacto general' && !norm(d.telefono))) continue;
      extra.push([s.id, nombre, null, norm(d.telefono) || null, norm(d.email) || null, 0]);
    }
    // un solo principal por proveedor
    const todos = [...nuevos, ...extra];
    const vistos = new Set();
    for (const n of todos) { if (n[5] && vistos.has(n[0])) n[5] = 0; if (n[5]) vistos.add(n[0]); }
    console.log(`${slug}: contactos nuevos ${todos.length} (fusionados ${extra.length}), nombres a razón social ${renombres.length}, observaciones a limpiar ${obsLimpias.length}`);
    if (!APLICAR) { for (const r of renombres.slice(0, 5)) console.log('  nombre:', r.antes, '->', r.despues); for (const n of todos.slice(0, 5)) console.log('  contacto:', n.join(' | ')); await c.end(); continue; }

    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(`${DIR}/normalizar_prov_${slug}_${FECHA}.json`, JSON.stringify({ proveedores: provs, contactos_previos: conts }, null, 1));
    await c.beginTransaction();
    try {
      if (todos.length) {
        const [r] = await c.query('INSERT INTO proveedor_contactos (proveedor_id,nombre,cargo,telefono,email,principal) VALUES ?', [todos]);
        if (r.affectedRows !== todos.length) throw new Error('contactos: conteo distinto');
      }
      for (const r of renombres) {
        await c.query('UPDATE proveedores_inv SET nombre=? WHERE id=?', [r.despues, r.id]);
        await c.query('UPDATE entradas_inv SET proveedor_nombre=? WHERE proveedor_id=? OR proveedor_nombre=?', [r.despues, r.id, r.antes]);
        await c.query('UPDATE ordenes_compra SET proveedor_nombre=? WHERE proveedor_nombre=?', [r.despues, r.antes]);
        await c.query('UPDATE compras_notas_credito SET proveedor_nombre=? WHERE proveedor_id=?', [r.despues, r.id]);
      }
      for (const o of obsLimpias) await c.query('UPDATE proveedores_inv SET observaciones=? WHERE id=?', [o.obs, o.id]);
      await c.commit(); console.log(`  ${slug} OK`);
    } catch (e) { await c.rollback(); throw e; }
    await c.end();
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
