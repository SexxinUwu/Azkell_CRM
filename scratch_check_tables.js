require('dotenv').config();
const { getTenantPool } = require('./services/tenant_master');

async function checkTables() {
    try {
        const poolRosymar = getTenantPool('azkell_tenant_rosymarperu');
        const [placasRows] = await poolRosymar.promise().query('SELECT COUNT(*) AS cnt FROM placas');
        console.log('📊 azkell_tenant_rosymarperu.placas count:', placasRows[0].cnt);

        try {
            const [vehFlotaRows] = await poolRosymar.promise().query('SELECT COUNT(*) AS cnt FROM vehiculos_flota');
            console.log('📊 azkell_tenant_rosymarperu.vehiculos_flota count:', vehFlotaRows[0].cnt);
        } catch(e) {
            console.log('📊 azkell_tenant_rosymarperu.vehiculos_flota error:', e.message);
        }

        const [samplePlacas] = await poolRosymar.promise().query('SELECT placa, cliente, marca, modelo_uts, tipo FROM placas LIMIT 5');
        console.log('📋 Muestra de placas en Rosymar:', JSON.stringify(samplePlacas, null, 2));

        process.exit(0);
    } catch(e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

checkTables();
