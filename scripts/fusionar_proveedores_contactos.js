// 2026-11-11: fusiona los proveedores con el mismo RUC en una empresa (con contactos). Simula; con --aplicar respalda (JSON) y escribe en una transacción por empresa.
// Cada duplicado pasa sus contactos, cuentas, marcas y referencias al sobreviviente (el de más movimiento; a igualdad, el de menor id) y se borra.
// Uso: node scripts/fusionar_proveedores_contactos.js [--solo slug] [--aplicar]
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const fs = require('fs');
const APLICAR = process.argv.includes('--aplicar');
const solo = process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1] : null;
const DIR = 'C:/Users/teffa/Documents/respaldos-azkell';

(async () => {
  const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD = '', DB_SSL } = process.env;
  for (const slug of ['marsisa', 'rosymarperu', 'yoguitransport', 'trahesa']) {
    if (solo && solo !== slug) continue;
    const c = await mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: DB_USER, password: DB_PASSWORD, database: 'azkell_tenant_' + slug, ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
    const [dups] = await c.query("SELECT REPLACE(numero_documento,' ','') doc FROM proveedores_inv WHERE numero_documento IS NOT NULL AND TRIM(numero_documento)<>'' GROUP BY 1 HAVING COUNT(*)>1");
    console.log(`${slug}: ${dups.length} documentos repetidos`);
    const respaldo = [];
    if (APLICAR) await c.beginTransaction();
    try {
      for (const { doc } of dups) {
        const [filas] = await c.query(`SELECT p.*, (SELECT COUNT(*) FROM entradas_inv e WHERE e.proveedor_id=p.id OR e.proveedor_nombre=p.nombre) uso FROM proveedores_inv p WHERE REPLACE(p.numero_documento,' ','')=? ORDER BY uso DESC, p.id`, [doc]);
        const S = filas[0];
        for (const D of filas.slice(1)) {
          const cnt = async (sql, a) => (await c.query(sql, a))[0][0].n;
          const nEnt = await cnt('SELECT COUNT(*) n FROM entradas_inv WHERE proveedor_id=?', [D.id]);
          const nCon = await cnt('SELECT COUNT(*) n FROM proveedor_contactos WHERE proveedor_id=?', [D.id]);
          const nCta = await cnt('SELECT COUNT(*) n FROM proveedor_cuentas_bancarias WHERE proveedor_id=?', [D.id]);
          const nNc = await cnt('SELECT COUNT(*) n FROM compras_notas_credito WHERE proveedor_id=?', [D.id]);
          const nInv = await cnt('SELECT COUNT(*) n FROM inventario WHERE proveedor_id=?', [D.id]);
          console.log(`  ${S.id} (${S.nombre}) <- ${D.id}: OC ${nEnt}, contactos ${nCon}, cuentas ${nCta}, NC ${nNc}, inventario ${nInv}`);
          if (!APLICAR) continue;
          respaldo.push({ sobreviviente: S.id, duplicado: D, contactos: (await c.query('SELECT * FROM proveedor_contactos WHERE proveedor_id=?', [D.id]))[0], cuentas: (await c.query('SELECT * FROM proveedor_cuentas_bancarias WHERE proveedor_id=?', [D.id]))[0] });
          const igual = async (sql, a, esperado, txt) => { const [r] = await c.query(sql, a); if (r.affectedRows !== esperado) throw new Error(`${slug} ${D.id} ${txt}: ${r.affectedRows} != ${esperado}`); };
          if (nEnt) await igual('UPDATE entradas_inv SET proveedor_id=?, proveedor_nombre=? WHERE proveedor_id=?', [S.id, S.nombre, D.id], nEnt, 'entradas');
          if (nNc) await igual('UPDATE compras_notas_credito SET proveedor_id=?, proveedor_nombre=? WHERE proveedor_id=?', [S.id, S.nombre, D.id], nNc, 'NC');
          if (nInv) await igual('UPDATE inventario SET proveedor_id=? WHERE proveedor_id=?', [S.id, D.id], nInv, 'inventario');
          if (nCon) await igual('UPDATE proveedor_contactos SET proveedor_id=?, principal=0 WHERE proveedor_id=?', [S.id, D.id], nCon, 'contactos');
          if (nCta) await igual('UPDATE proveedor_cuentas_bancarias SET proveedor_id=? WHERE proveedor_id=?', [S.id, D.id], nCta, 'cuentas');
          await c.query('DELETE FROM proveedor_marcas_inv WHERE proveedor_id=?', [D.id]);
          await igual('DELETE FROM proveedores_inv WHERE id=?', [D.id], 1, 'borrado');
        }
      }
      if (APLICAR) {
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFileSync(`${DIR}/fusion_contactos_${slug}_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(respaldo, null, 1));
        await c.commit(); console.log(`  ${slug} OK`);
      }
    } catch (e) { if (APLICAR) await c.rollback(); throw e; }
    await c.end();
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
