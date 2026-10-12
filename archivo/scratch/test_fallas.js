require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function testFallas() {
    const pool = getTenantPool('azkell_tenant_marsisa').promise();
    const [rows] = await pool.query(`
        SELECT id, folio, fecha_reporte, placa_tracto, placa_remolque, conductor, estado, ots_generadas_json 
        FROM reportes_fallas 
        ORDER BY id DESC LIMIT 10
    `);
    console.log(rows);
    process.exit(0);
}

testFallas();
