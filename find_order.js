const path = require('path');
const projectRoot = 'C:\\Users\\teffa\\OneDrive\\Escritorio\\Azkell_CRM\\Azkell_CRM';
require(path.join(projectRoot, 'node_modules', 'dotenv')).config({ path: path.join(projectRoot, '.env') });
const mysql = require(path.join(projectRoot, 'node_modules', 'mysql2', 'promise'));

async function inspectFull() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: 'azkell_tenant_marsisa'
  });

  const [row] = await conn.query("SELECT * FROM entradas_inv WHERE id = 'ENT-2026-00324'");
  console.log('Full row in entradas_inv:', row[0]);

  // Check if ot_id exists
  if (row[0].ot_id) {
    console.log('OT ID:', row[0].ot_id);
    const [otRows] = await conn.query("SELECT * FROM ordenes_trabajo WHERE id = ? OR folio = ?", [row[0].ot_id, row[0].ot_id]);
    console.log('Related OT:', otRows);
  }

  // Check if there are records in tesoreria / pagos / cuentas_por_pagar
  const [tables] = await conn.query("SHOW TABLES");
  const tableNames = tables.map(t => Object.values(t)[0]);
  for (const t of tableNames) {
    if (/pago|tesoreria|cuenta|gasto|egreso/i.test(t)) {
      try {
        const [matching] = await conn.query(`SELECT * FROM \`${t}\` WHERE entrada_id = 'ENT-2026-00324' OR oc_id = 'ENT-2026-00324' OR codigo_orden = 'ENT-2026-00324' OR referencia LIKE '%ENT-2026-00324%' OR descripcion LIKE '%ENT-2026-00324%' LIMIT 5`);
        if (matching.length > 0) {
          console.log(`Related in ${t}:`, matching);
        }
      } catch (e) {}
    }
  }

  await conn.end();
}

inspectFull();
