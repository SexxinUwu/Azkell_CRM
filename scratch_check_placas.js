require('dotenv').config();
const { getTenantPool } = require('./services/tenant_master');

async function checkPlacas() {
    try {
        const poolRosymar = getTenantPool('azkell_tenant_rosymarperu');
        const [rowsRosymar] = await poolRosymar.promise().query('SELECT COUNT(*) AS total FROM placas');
        console.log('📊 Total placas en azkell_tenant_rosymarperu:', rowsRosymar[0].total);

        const poolMarsisa = getTenantPool('azkell_tenant_marsisa');
        const [rowsMarsisa] = await poolMarsisa.promise().query('SELECT COUNT(*) AS total FROM placas');
        console.log('📊 Total placas en azkell_tenant_marsisa:', rowsMarsisa[0].total);

        process.exit(0);
    } catch(e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

checkPlacas();
