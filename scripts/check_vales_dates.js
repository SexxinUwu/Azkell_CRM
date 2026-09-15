require('dotenv').config();
const path = require('path');
const mysql = require('mysql2/promise');
const { getTenantPool } = require(path.join(__dirname, '../services/tenant_master'));

(async () => {
    const REMOTE_CONFIG = {
        host: '168.231.98.23',
        user: 'prov_combustible',
        password: '32f2dc8b2b27fc021c81674c04c2326e',
        database: 'marsisadb_prod',
        dateStrings: true,
        timezone: 'Z'
    };

    try {
        const localConn = getTenantPool('azkell_tenant_marsisa').promise();
        const rdb = await mysql.createConnection(REMOTE_CONFIG);

        console.log('--- REMOTE VALES (Top 3) ---');
        const [rRows] = await rdb.query(
            "SELECT id, serie, numero, fecha, fl_estado, viaje_numero, placa, conductor_nombre, galones, importe FROM vw_combustible_vale ORDER BY fecha DESC LIMIT 3"
        );
        console.log(rRows);

        console.log('--- LOCAL marsisa_combustible_vales (Top 3) ---');
        const [lRows] = await localConn.query(
            "SELECT id, id_remoto, correlativo, fecha, estado, viaje, vehiculo, conductor, galones, importe FROM marsisa_combustible_vales ORDER BY fecha DESC LIMIT 3"
        );
        console.log(lRows);

        console.log('--- LOCAL combustible_vales (Top 3) ---');
        const [cRows] = await localConn.query(
            "SELECT id, id_remoto, correlativo, fecha, estado, viaje, vehiculo, conductor, galones, importe FROM combustible_vales ORDER BY fecha DESC LIMIT 3"
        );
        console.log(cRows);

        await rdb.end();
        process.exit(0);
    } catch(e) {
        console.error('Error:', e);
        process.exit(1);
    }
})();
