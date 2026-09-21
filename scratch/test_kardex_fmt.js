require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function testKardex() {
    const pool = getTenantPool('azkell_tenant_marsisa').promise();
    const [rows] = await pool.query(
        "SELECT stock_regularizado, DATE_FORMAT(fecha_regularizacion, '%Y-%m-%d %H:%i:%s') AS fecha_regularizacion FROM inventario WHERE id = 'INV-0001'"
    );
    console.log('Returned data from DB query:', rows[0]);
    process.exit(0);
}

testKardex();
