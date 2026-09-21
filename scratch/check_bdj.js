require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function test() {
    const pool = getTenantPool('azkell_tenant_marsisa').promise();
    const [r1] = await pool.query("SELECT * FROM placas WHERE placa LIKE '%BDJ%' OR placa LIKE '%BHV%'");
    console.log('Placas BDJ / BHV:', r1);
    process.exit(0);
}

test();
