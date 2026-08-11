require('dotenv').config();
const { getMasterPool } = require('./services/tenant_master');

async function checkMaster() {
    try {
        const masterPool = getMasterPool();
        const [rows] = await masterPool.promise().query('SELECT * FROM empresas');
        console.log('🏢 Empresas en azkell_master:', JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch(e) {
        console.error('Error master:', e.message);
        process.exit(1);
    }
}

checkMaster();
