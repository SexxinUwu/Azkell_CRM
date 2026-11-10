// 2026-11-10: ADF994 es de Marsisa alquilada a Trahesa (en ambas bases); B7T980 y BKK994 son de Trahesa y se copian a la base de Marsisa.
// Por defecto solo simula; con --aplicar escribe, una transacción por base, comprobando los conteos.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const APLICAR = process.argv.includes('--aplicar');
const NO_COPIAR = new Set(['placa', 'tipo', 'propiedad', 'empresa', 'fecha_entrega', 'anio', 'marca', 'modelo', 'color', 'chasis', 'wialon_name', 'created_at', 'updated_at']);
const key = p => String(p).replace(/[^A-Z0-9]/gi, '').toUpperCase();
const norm = v => (v instanceof Date ? v.toISOString().slice(0, 10) : (v == null || v === '' ? null : String(v)));
(async () => {
  const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD = '', DB_SSL } = process.env;
  const cx = db => mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: DB_USER, password: DB_PASSWORD, database: db, ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  const M = await cx('azkell_tenant_marsisa'), T = await cx('azkell_tenant_trahesa');
  try {
    const Q = "WHERE REPLACE(UPPER(placa),'-','') = ?";
    const [[tAdf]] = await T.query(`SELECT * FROM vehiculos_flota ${Q}`, ['ADF994']);
    const [[mAdf]] = await M.query(`SELECT * FROM vehiculos_flota ${Q}`, ['ADF994']);
    const cols = Object.keys(tAdf).filter(c => !NO_COPIAR.has(c));
    const dif = cols.filter(c => norm(tAdf[c]) !== null && norm(tAdf[c]) !== norm(mAdf[c]));
    const copiar = new Date(tAdf.updated_at) >= new Date(mAdf.updated_at) && dif.length;
    console.log('ADF994 documentos que difieren:', dif.filter(x => !/_url$/.test(x)).map(x => `${x} ${norm(mAdf[x]) ?? '—'} → ${norm(tAdf[x])}`).join('; '), '| Trahesa más reciente:', new Date(tAdf.updated_at) >= new Date(mAdf.updated_at));
    const [mc] = await M.query('SHOW COLUMNS FROM vehiculos_flota'); const mcols = new Set(mc.map(x => x.Field));
    const nuevas = [];
    for (const p of ['B7T980', 'BKK994']) {
      const [[t]] = await T.query(`SELECT * FROM vehiculos_flota ${Q}`, [p]);
      const [[m]] = await M.query(`SELECT placa FROM vehiculos_flota ${Q}`, [p]);
      if (!t) throw new Error(p + ' no está en Trahesa'); if (m) throw new Error(p + ' ya existe en Marsisa');
      const fila = {}; for (const [k, v] of Object.entries(t)) if (mcols.has(k) && k !== 'id') fila[k] = v;
      nuevas.push(fila);
    }
    console.log('Filas nuevas en Marsisa:', nuevas.map(f => f.placa).join(', '));
    if (!APLICAR) { console.log('(simulación: no se escribió nada)'); return; }

    await T.beginTransaction();
    try {
      const [a] = await T.query("UPDATE placas SET cliente='MARSISA S.A.C.', alquilada_a='TRAHESA S.A.C.', docs_responsable='ARRENDATARIA' WHERE REPLACE(UPPER(placa),'-','')='ADF994'");
      const [b] = await T.query("UPDATE vehiculos_flota SET empresa='MARSISA S.A.C.' WHERE REPLACE(UPPER(placa),'-','')='ADF994'");
      if (a.affectedRows !== 1 || b.affectedRows !== 1) throw new Error('Trahesa: conteo distinto');
      await T.commit(); console.log('Trahesa OK');
    } catch (e) { await T.rollback(); throw e; }

    await M.beginTransaction();
    try {
      const [a] = await M.query("UPDATE placas SET cliente='MARSISA S.A.C.', alquilada_a='TRAHESA S.A.C.', docs_responsable='ARRENDATARIA' WHERE REPLACE(UPPER(placa),'-','')='ADF994'");
      const [b] = await M.query("UPDATE vehiculos_flota SET empresa='MARSISA S.A.C.' WHERE REPLACE(UPPER(placa),'-','')='ADF994'");
      if (a.affectedRows !== 1 || b.affectedRows !== 1) throw new Error('Marsisa: conteo distinto en ADF994');
      if (copiar) {
        const [r] = await M.query(`UPDATE vehiculos_flota SET ${dif.map(x => `\`${x}\`=?`).join(', ')} WHERE placa=?`, [...dif.map(x => tAdf[x]), mAdf.placa]);
        if (r.affectedRows !== 1) throw new Error('Marsisa: documentos ADF994');
      }
      for (const f of nuevas) {
        const ks = Object.keys(f);
        const [r] = await M.query(`INSERT INTO vehiculos_flota (${ks.map(k => `\`${k}\``).join(',')}) VALUES (${ks.map(() => '?').join(',')})`, ks.map(k => f[k]));
        if (r.affectedRows !== 1) throw new Error('Marsisa: insert ' + f.placa);
      }
      await M.commit(); console.log('Marsisa OK: ADF994 + 2 filas nuevas');
    } catch (e) { await M.rollback(); throw e; }
  } finally { await M.end(); await T.end(); }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
