// 2026-11-11: fusiona proveedores con el mismo RUC (Marsisa). Simula por defecto; con --aplicar respalda y escribe en una transacción.
// Cada grupo: [sobreviviente, [duplicados]]. Las OC, notas de crédito, inventario, cuentas y marcas pasan al sobreviviente;
// los datos que le falten (teléfono, razón social, correo, dirección) se completan con los del duplicado.
// El asesor de cada duplicado se guarda en respaldos-azkell/proveedores_asesores_<fecha>.json para sembrar la tabla de contactos.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const APLICAR = process.argv.includes('--aplicar');
const SLUG = 'marsisa';
const GRUPOS = [
  ['PROV-0091', ['PROV-0060']], ['PROV-0110', ['PROV-0034']], ['PROV-0117', ['PROV-0019']], ['PROV-0121', ['PROV-0022']],
  ['PROV-0150', ['PROV-0007']], ['PROV-0093', ['PROV-0128']], ['PROV-0090', ['PROV-0141']], ['PROV-0151', ['PROV-0164']],
  ['PROV-0162', ['PROV-0157']], ['PROV-0125', ['PROV-0016']], ['PROV-0077', ['PROV-0056']], ['PROV-0107', ['PROV-0106']],
  ['PROV-0062', ['PROV-0063']], ['PROV-0050', ['PROV-0051']],
];
const RELLENAR = ['razon_social', 'telefono', 'email', 'direccion'];

(async () => {
  const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD = '', DB_SSL } = process.env;
  const db = 'azkell_tenant_' + SLUG;
  const c = await mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: DB_USER, password: DB_PASSWORD, database: db, ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  const ids = GRUPOS.flatMap(([s, d]) => [s, ...d]);
  const [prov] = await c.query('SELECT * FROM proveedores_inv WHERE id IN (?)', [ids]);
  const P = new Map(prov.map(p => [p.id, p]));
  for (const id of ids) if (!P.has(id)) throw new Error('No existe ' + id);
  for (const [s, ds] of GRUPOS) for (const d of ds) if ((P.get(s).numero_documento || '').trim() !== (P.get(d).numero_documento || '').trim()) throw new Error(`RUC distinto ${s} ${d}`);

  if (APLICAR) {
    const dir = 'C:/Users/teffa/Documents/respaldos-azkell'; fs.mkdirSync(dir, { recursive: true });
    const marca = new Date().toISOString().slice(0, 10);
    const bin = 'C:/Program Files/MySQL/MySQL Server 8.4/bin/mysqldump.exe';
    const base = ['-h', DB_HOST, '-P', String(DB_PORT), '-u', DB_USER, '--single-transaction', '--no-tablespaces', '--set-gtid-purged=OFF', '--skip-lock-tables', '--no-create-info', '--replace', '--skip-extended-insert'];
    const nombres = prov.map(p => p.nombre).filter(Boolean).map(n => mysql.escape(n)).join(',');
    const idsSql = ids.map(i => mysql.escape(i)).join(',');
    const env = { ...process.env, MYSQL_PWD: DB_PASSWORD };
    const volcar = (tablas, donde, arch) => { const out = execFileSync(bin, [...base, ...(DB_SSL === 'true' ? ['--ssl-mode=REQUIRED'] : []), ...(donde ? ['--where=' + donde] : []), db, ...tablas], { env, maxBuffer: 1 << 28 }); fs.writeFileSync(path.join(dir, arch), out); };
    volcar(['proveedores_inv', 'proveedor_cuentas_bancarias', 'proveedor_marcas_inv'], null, `fusion_prov_${SLUG}_${marca}_catalogo.sql`);
    volcar(['entradas_inv'], `proveedor_id IN (${idsSql}) OR proveedor_nombre IN (${nombres})`, `fusion_prov_${SLUG}_${marca}_entradas.sql`);
    volcar(['ordenes_compra'], `proveedor_nombre IN (${nombres})`, `fusion_prov_${SLUG}_${marca}_oc.sql`);
    volcar(['compras_notas_credito'], `proveedor_id IN (${idsSql})`, `fusion_prov_${SLUG}_${marca}_nc.sql`);
    volcar(['inventario'], `proveedor_id IN (${idsSql})`, `fusion_prov_${SLUG}_${marca}_inventario.sql`);
    fs.writeFileSync(path.join(dir, `proveedores_asesores_${marca}.json`), JSON.stringify(GRUPOS.flatMap(([s, ds]) => ds.map(d => ({ sobreviviente: s, ruc: P.get(d).numero_documento, empresa: P.get(s).razon_social || P.get(s).nombre, duplicado: P.get(d) }))), null, 1));
    console.log('Respaldo en', dir);
  }

  if (APLICAR) await c.beginTransaction();
  try {
    for (const [s, ds] of GRUPOS) {
      const S = P.get(s);
      for (const d of ds) {
        const D = P.get(d);
        const paso = async (txt, sql, args, esperado) => {
          const [r] = APLICAR ? await c.query(sql, args) : [{ affectedRows: '-' }];
          if (APLICAR && r.affectedRows !== esperado) throw new Error(`${s}<-${d} ${txt}: ${r.affectedRows} != ${esperado}`);
          console.log(`  ${s} <- ${d} · ${txt}: ${esperado}`);
        };
        const cnt = async (sql, args) => (await c.query(sql, args))[0][0].n;
        console.log(`${s} (${S.nombre}) <- ${d} (${D.nombre})`);
        const nEnt = await cnt('SELECT COUNT(*) n FROM entradas_inv WHERE proveedor_id=? OR proveedor_nombre=?', [d, D.nombre]);
        if (nEnt) await paso('entradas_inv', 'UPDATE entradas_inv SET proveedor_id=?, proveedor_nombre=? WHERE proveedor_id=? OR proveedor_nombre=?', [s, S.nombre, d, D.nombre], nEnt);
        const nOc = D.nombre === S.nombre ? 0 : await cnt('SELECT COUNT(*) n FROM ordenes_compra WHERE proveedor_nombre=?', [D.nombre]);
        if (nOc) await paso('ordenes_compra', 'UPDATE ordenes_compra SET proveedor_nombre=? WHERE proveedor_nombre=?', [S.nombre, D.nombre], nOc);
        const nNc = await cnt('SELECT COUNT(*) n FROM compras_notas_credito WHERE proveedor_id=?', [d]);
        if (nNc) await paso('notas de crédito', 'UPDATE compras_notas_credito SET proveedor_id=?, proveedor_nombre=? WHERE proveedor_id=?', [s, S.nombre, d], nNc);
        const nInv = await cnt('SELECT COUNT(*) n FROM inventario WHERE proveedor_id=?', [d]);
        if (nInv) await paso('inventario', 'UPDATE inventario SET proveedor_id=? WHERE proveedor_id=?', [s, d], nInv);
        // cuentas: se pasan solo las que el sobreviviente no tiene (mismo banco y número)
        const [cu] = await c.query('SELECT id FROM proveedor_cuentas_bancarias c WHERE proveedor_id=? AND NOT EXISTS (SELECT 1 FROM proveedor_cuentas_bancarias x WHERE x.proveedor_id=? AND x.banco=c.banco AND x.numero_cuenta=c.numero_cuenta)', [d, s]);
        if (cu.length) await paso('cuentas movidas', 'UPDATE proveedor_cuentas_bancarias SET proveedor_id=? WHERE id IN (?)', [s, cu.map(x => x.id)], cu.length);
        const nCd = await cnt('SELECT COUNT(*) n FROM proveedor_cuentas_bancarias WHERE proveedor_id=?', [d]);
        if (nCd) await paso('cuentas repetidas borradas', 'DELETE FROM proveedor_cuentas_bancarias WHERE proveedor_id=?', [d], nCd);
        const [ma] = await c.query('SELECT id FROM proveedor_marcas_inv m WHERE proveedor_id=? AND NOT EXISTS (SELECT 1 FROM proveedor_marcas_inv x WHERE x.proveedor_id=? AND x.marca=m.marca)', [d, s]);
        if (ma.length) await paso('marcas movidas', 'UPDATE proveedor_marcas_inv SET proveedor_id=? WHERE id IN (?)', [s, ma.map(x => x.id)], ma.length);
        const nMd = await cnt('SELECT COUNT(*) n FROM proveedor_marcas_inv WHERE proveedor_id=?', [d]);
        if (nMd) await paso('marcas repetidas borradas', 'DELETE FROM proveedor_marcas_inv WHERE proveedor_id=?', [d], nMd);
        const falta = RELLENAR.filter(k => !String(S[k] ?? '').trim() && String(D[k] ?? '').trim());
        if (falta.length) await paso('completa ' + falta.join(','), `UPDATE proveedores_inv SET ${falta.map(k => k + '=?').join(',')} WHERE id=?`, [...falta.map(k => D[k]), s], 1);
        await paso('borra duplicado', 'DELETE FROM proveedores_inv WHERE id=?', [d], 1);
      }
    }
    if (APLICAR) { await c.commit(); console.log('LISTO'); } else console.log('(simulación; usa --aplicar)');
  } catch (e) { if (APLICAR) await c.rollback(); throw e; }
  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
