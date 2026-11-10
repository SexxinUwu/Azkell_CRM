// Alinea Trahesa y Marsisa (2026-11-10): las 6 carretas son de Marsisa y están alquiladas a Trahesa, y los documentos
// más recientes de las unidades de Trahesa (base de Trahesa) pasan a la copia que tiene la base de Marsisa.
// Por defecto solo simula; con --aplicar escribe, una transacción por base, comprobando los conteos.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const APLICAR = process.argv.includes('--aplicar');
const SEIS = ['ADF996', 'ADH983', 'ADH978', 'AMV994', 'AZP978', 'AZQ973'];
const NO_COPIAR = new Set(['placa', 'tipo', 'propiedad', 'empresa', 'fecha_entrega', 'anio', 'marca', 'modelo', 'color', 'chasis', 'wialon_name', 'created_at', 'updated_at']);
const key = p => String(p).replace(/[^A-Z0-9]/gi, '').toUpperCase();
const norm = v => (v instanceof Date ? v.toISOString().slice(0, 10) : (v == null || v === '' ? null : String(v)));

(async () => {
  const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD = '', DB_SSL } = process.env;
  const cx = db => mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: DB_USER, password: DB_PASSWORD, database: db, ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  const M = await cx('azkell_tenant_marsisa'), T = await cx('azkell_tenant_trahesa');
  try {
    // ── 1. Documentos: de Trahesa a Marsisa, solo las unidades de Trahesa que están en las dos y donde la de Trahesa es la más reciente
    const [vm] = await M.query('SELECT * FROM vehiculos_flota'); const [vt] = await T.query('SELECT * FROM vehiculos_flota');
    const cols = Object.keys(vt[0]).filter(c => !NO_COPIAR.has(c));
    const mm = new Map(vm.map(r => [key(r.placa), r]));
    const cambios = [];
    for (const t of vt) {
      if (!/TRAHESA/i.test(t.empresa) && !SEIS.includes(key(t.placa))) continue;
      const m = mm.get(key(t.placa)); if (!m) continue;
      // Solo se copian datos que Trahesa tiene: un vacío en Trahesa nunca borra lo que ya hay en Marsisa
      const dif = cols.filter(c => norm(t[c]) !== null && norm(t[c]) !== norm(m[c]));
      if (!dif.length) continue;
      if (new Date(t.updated_at) < new Date(m.updated_at)) { console.log(`  OMITIDA ${t.placa}: la de Marsisa es más reciente`); continue; }
      cambios.push({ placaM: m.placa, placaT: t.placa, dif, valores: Object.fromEntries(dif.map(c => [c, t[c]])), antes: Object.fromEntries(dif.map(c => [c, norm(m[c])])) });
    }
    console.log(`Documentos a copiar a Marsisa: ${cambios.length} unidades`);
    cambios.forEach(c => console.log(`  ${c.placaM}: ${c.dif.filter(x => !/_url$/.test(x)).map(x => `${x} ${c.antes[x] ?? '—'} → ${norm(c.valores[x]) ?? '—'}`).join('; ')}${c.dif.some(x => /_url$/.test(x)) ? ' (+ archivos)' : ''}`));

    // ── 2. Las 6 carretas: dueña Marsisa, alquilada a Trahesa
    const [pm] = await M.query('SELECT placa, cliente, alquilada_a, docs_responsable FROM placas WHERE REPLACE(UPPER(placa),\'-\',\'\') IN (?)', [SEIS]);
    const [pt] = await T.query('SELECT placa, cliente, alquilada_a, docs_responsable FROM placas WHERE REPLACE(UPPER(placa),\'-\',\'\') IN (?)', [SEIS]);
    console.log('\nPlacas Marsisa (antes):', JSON.stringify(pm));
    console.log('Placas Trahesa (antes):', JSON.stringify(pt));
    if (pm.length !== 6 || pt.length !== 6) throw new Error(`Se esperaban 6 placas en cada base (Marsisa ${pm.length}, Trahesa ${pt.length})`);
    if (!APLICAR) { console.log('\n(simulación: no se escribió nada)'); return; }

    // Trahesa: las 6 pasan a ser de Marsisa, alquiladas a Trahesa
    await T.beginTransaction();
    try {
      const [a] = await T.query("UPDATE placas SET cliente = 'MARSISA S.A.C.', alquilada_a = 'TRAHESA S.A.C.', docs_responsable = 'ARRENDATARIA' WHERE REPLACE(UPPER(placa),'-','') IN (?)", [SEIS]);
      const [b] = await T.query("UPDATE vehiculos_flota SET empresa = 'MARSISA S.A.C.' WHERE REPLACE(UPPER(placa),'-','') IN (?)", [SEIS]);
      if (a.affectedRows !== 6 || b.affectedRows !== 6) throw new Error(`Trahesa: conteo distinto (placas ${a.affectedRows}, documentos ${b.affectedRows})`);
      await T.commit(); console.log('\nTrahesa OK: 6 placas y 6 filas de documentos');
    } catch (e) { await T.rollback(); throw e; }

    // Marsisa: ADF996 y ADH983 también como alquiladas a Trahesa; ADH978 con dueña Marsisa; y los documentos nuevos
    await M.beginTransaction();
    try {
      const [a] = await M.query("UPDATE placas SET cliente = 'MARSISA S.A.C.', alquilada_a = 'TRAHESA S.A.C.', docs_responsable = 'ARRENDATARIA' WHERE REPLACE(UPPER(placa),'-','') IN (?)", [SEIS]);
      if (a.affectedRows !== 6) throw new Error(`Marsisa: conteo distinto en placas (${a.affectedRows})`);
      let n = 0;
      for (const c of cambios) {
        const sets = c.dif.map(x => `\`${x}\` = ?`).join(', ');
        const [r] = await M.query(`UPDATE vehiculos_flota SET ${sets} WHERE placa = ?`, [...c.dif.map(x => c.valores[x]), c.placaM]);
        if (r.affectedRows !== 1) throw new Error(`Marsisa: ${c.placaM} no se actualizó una sola fila (${r.affectedRows})`);
        n++;
      }
      if (n !== cambios.length) throw new Error('Conteo de documentos distinto');
      await M.commit(); console.log(`Marsisa OK: 6 placas y ${n} filas de documentos`);
    } catch (e) { await M.rollback(); throw e; }
  } finally { await M.end(); await T.end(); }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
