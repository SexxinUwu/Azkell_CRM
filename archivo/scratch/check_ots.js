require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function test() {
    const pool = getTenantPool('azkell_tenant_marsisa').promise();
    const [ots] = await pool.query(`
        SELECT placa, estado, COUNT(*) as cnt 
        FROM ordenes_trabajo 
        GROUP BY placa, estado
    `);
    console.log('OTs por placa y estado:', ots);
    process.exit(0);
}

test();
