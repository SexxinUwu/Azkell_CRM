require('dotenv').config();
const path = require('path');
const { getTenantPool } = require(path.join(__dirname, '../services/tenant_master'));

(async () => {
    try {
        const tdb = getTenantPool('azkell_tenant_marsisa').promise();
        const [rows] = await tdb.query(`
            SELECT id, id_remoto, DATE_FORMAT(fecha, '%Y-%m-%d %H:%i:%s') AS fecha, correlativo, viaje, vehiculo, conductor, galones, importe
            FROM marsisa_combustible_vales
            WHERE viaje LIKE '%993%'
            ORDER BY fecha ASC, id ASC
        `);
        console.log('Vales del viaje 993 en marsisa:');
        console.table(rows);
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
})();
