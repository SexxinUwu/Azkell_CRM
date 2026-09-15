require('dotenv').config();
const path = require('path');
const { getTenantPool } = require(path.join(__dirname, '../services/tenant_master'));

(async () => {
    try {
        const pool = getTenantPool('azkell_tenant_marsisa').promise();
        const [tables] = await pool.query("SHOW TABLES LIKE '%combustible%'");
        console.log('Tablas combustible en marsisa:');
        for (let t of tables) {
            const tName = Object.values(t)[0];
            try {
                const [c] = await pool.query('SELECT COUNT(*) as count FROM ' + tName);
                console.log(tName, '=> total rows:', c[0].count);
            } catch(err) {
                console.log(tName, 'error:', err.message);
            }
        }
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
})();
