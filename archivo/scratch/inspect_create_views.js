const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectViews() {
    const remoteConn = await mysql.createConnection({
        host: process.env.REMOTE_FUEL_HOST || '168.231.98.23',
        user: process.env.REMOTE_FUEL_USER || 'prov_combustible',
        password: process.env.REMOTE_FUEL_PASSWORD || '32f2dc8b2b27fc021c81674c04c2326e',
        database: process.env.REMOTE_FUEL_DATABASE || 'marsisadb_prod'
    });

    console.log("=== SHOW CREATE VIEW vw_combustible_orden_viaje ===");
    try {
        const [viewOv] = await remoteConn.query("SHOW CREATE VIEW vw_combustible_orden_viaje");
        console.log(viewOv[0]['Create View']);
    } catch(e) {
        console.log("Error al consultar CREATE VIEW ov:", e.message);
    }

    console.log("\n=== SHOW CREATE VIEW vw_combustible_vale ===");
    try {
        const [viewVale] = await remoteConn.query("SHOW CREATE VIEW vw_combustible_vale");
        console.log(viewVale[0]['Create View']);
    } catch(e) {
        console.log("Error al consultar CREATE VIEW vale:", e.message);
    }

    // Buscar si el usuario prov_combustible tiene acceso a otras bases de datos en 168.231.98.23
    try {
        const [dbs] = await remoteConn.query("SHOW DATABASES");
        console.log("\nBases de datos visibles para prov_combustible:", dbs.map(d => d.Database));
    } catch(e) {
        console.log("Error SHOW DATABASES:", e.message);
    }

    await remoteConn.end();
}

inspectViews().catch(console.error);
