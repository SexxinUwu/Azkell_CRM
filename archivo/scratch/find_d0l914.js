const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { getTenantPool } = require(path.join(__dirname, '../services/tenant_master'));

(async () => {
    const tenants = ['azkell_tenant_marsisa', 'azkell_tenant_rosymarperu', 'azkell_tenant_yoguitransport', 'azkell_tenant_trahesa', 'azkell_fleet'];
    for (const t of tenants) {
        try {
            const pool = getTenantPool(t).promise();
            const [v] = await pool.query("SELECT * FROM vehiculos_flota WHERE REPLACE(placa, '-', '') LIKE '%D0L914%' OR REPLACE(placa, '-', '') LIKE '%DOL914%'");
            if (v.length > 0) {
                console.log('Encontrado en tenant:', t, v);
            }
            const [p] = await pool.query("SELECT * FROM placas WHERE REPLACE(placa, '-', '') LIKE '%D0L914%' OR REPLACE(placa, '-', '') LIKE '%DOL914%'");
            if (p.length > 0) {
                console.log('Encontrada placa en tenant:', t, p);
            }
        } catch(e) {
            console.error('Error in tenant:', t, e.message);
        }
    }
    process.exit(0);
})();
