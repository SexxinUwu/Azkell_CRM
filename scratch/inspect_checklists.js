require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function check() {
    try {
        const pool = getTenantPool('azkell_tenant_marsisa').promise();
        
        const [repRows] = await pool.query(`
            SELECT id, folio, placa_tracto, placa_remolque, procedencia, conductor 
            FROM reportes_fallas 
            ORDER BY id DESC LIMIT 10
        `);
        console.log('--- reportes_fallas sample ---');
        console.log(repRows);

        const [placasSample] = await pool.query(`
            SELECT placa, cliente, marca, tipo, sub_tipo 
            FROM placas 
            LIMIT 15
        `);
        console.log('--- placas sample ---');
        console.log(placasSample);

        const [distEmpresas] = await pool.query(`
            SELECT DISTINCT cliente 
            FROM placas
        `);
        console.log('--- distinct clientes in placas ---');
        console.log(distEmpresas);

        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
check();
