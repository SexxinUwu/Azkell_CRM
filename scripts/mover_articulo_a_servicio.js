// Pasa un artículo creado por error (por ejemplo un servicio registrado como artículo) al catálogo de servicios.
// Hace lo mismo que el servidor cuando se cambia el Tipo a "Servicio" (routes/almacen.js, PUT /inventario/:id):
// genera un código SERV-NNNN nuevo, marca tipo y unidad como Servicio y actualiza las tablas que lo referencian.
//
// Uso:  node scripts/mover_articulo_a_servicio.js <empresa> <INV-xxxx>            → solo muestra qué haría
//       node scripts/mover_articulo_a_servicio.js <empresa> <INV-xxxx> --aplicar  → lo hace, dentro de una transacción
// <empresa>: nombre de la base del cliente (por ejemplo azkell_tenant_marsisa)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const [base, id, ...flags] = process.argv.slice(2);
const aplicar = flags.includes('--aplicar');
if (!base || !id || !/^[A-Za-z0-9_]+$/.test(base) || !/^INV-\d+$/.test(id)) {
  console.log('Uso: node scripts/mover_articulo_a_servicio.js <base> <INV-xxxx> [--aplicar]');
  process.exit(1);
}

(async () => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS || process.env.DB_PASSWORD, port: process.env.DB_PORT || 3306, database: base, connectTimeout: 10000 });
  try {
    const [[art]] = await c.query('SELECT id, articulo, descripcion, familia, tipo, unidad, almacen, activo FROM inventario WHERE id = ?', [id]);
    if (!art) { console.log(`No existe ${id} en ${base}.`); return; }
    console.log('Artículo:', JSON.stringify(art));

    // Todas las tablas que guardan el código del artículo
    const [cols] = await c.query("SELECT table_name AS t, column_name AS col FROM information_schema.columns WHERE table_schema = ? AND column_name IN ('inventario_id') AND table_name <> 'inventario'", [base]);
    const refs = [];
    for (const { t, col } of cols) {
      const [[{ n }]] = await c.query(`SELECT COUNT(*) AS n FROM \`${t}\` WHERE \`${col}\` = ?`, [id]);
      refs.push({ t, col, n });
    }
    console.log('Referencias:', JSON.stringify(refs.filter(r => r.n > 0)), '(tablas revisadas:', refs.map(r => r.t).join(', ') + ')');

    const [[ult]] = await c.query("SELECT id FROM inventario WHERE id LIKE 'SERV-%' ORDER BY CAST(SUBSTRING_INDEX(id, '-', -1) AS UNSIGNED) DESC LIMIT 1");
    const nuevo = 'SERV-' + String((ult ? parseInt(ult.id.split('-').pop(), 10) : 0) + 1).padStart(4, '0');
    console.log(`Plan: ${id} → ${nuevo} · tipo "Servicio" · unidad "Servicio" · familia (vacía: la que tenía era la de llantas por defecto) · almacén sin cambios`);
    if (!aplicar) { console.log('\nCorrida en seco: no se cambió nada. Agrega --aplicar para hacerlo.'); return; }

    await c.beginTransaction();
    await c.query("UPDATE inventario SET id = ?, tipo = 'Servicio', unidad = 'Servicio', familia = NULL WHERE id = ?", [nuevo, id]);
    for (const r of refs.filter(x => x.n > 0)) {
      // Los datos de llanta vacíos que el formulario crea por la familia NEUMATICOS por defecto no tienen sentido en un servicio: se borran
      if (r.t === 'neumaticos_articulo') {
        const [del] = await c.query('DELETE FROM neumaticos_articulo WHERE inventario_id = ? AND medida IS NULL AND modelo IS NULL AND cocada_inicial IS NULL', [id]);
        if (del.affectedRows) { console.log('Se borró la fila vacía de datos de llanta.'); continue; }
      }
      await c.query(`UPDATE \`${r.t}\` SET \`${r.col}\` = ? WHERE \`${r.col}\` = ?`, [nuevo, id]);
    }
    await c.commit();
    const [[despues]] = await c.query('SELECT id, articulo, familia, tipo, unidad, almacen, activo FROM inventario WHERE id = ?', [nuevo]);
    const [[quedan]] = await c.query('SELECT COUNT(*) AS n FROM inventario WHERE id = ?', [id]);
    console.log('Hecho. Ahora:', JSON.stringify(despues), '| con el código viejo quedan:', quedan.n);
  } catch (e) {
    try { await c.rollback(); } catch { /* sin transacción */ }
    console.error('FALLÓ (se deshizo todo):', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
