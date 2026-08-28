const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectInfoSchema() {
    const remoteConn = await mysql.createConnection({
        host: process.env.REMOTE_FUEL_HOST || '168.231.98.23',
        user: process.env.REMOTE_FUEL_USER || 'prov_combustible',
        password: process.env.REMOTE_FUEL_PASSWORD || '32f2dc8b2b27fc021c81674c04c2326e',
        database: process.env.REMOTE_FUEL_DATABASE || 'marsisadb_prod'
    });

    const [views] = await remoteConn.query(
        "SELECT TABLE_NAME, VIEW_DEFINITION FROM information_schema.VIEWS WHERE TABLE_SCHEMA = 'marsisadb_prod'"
    );

    console.log("=== VISTAS EN INFORMATION_SCHEMA ===");
    views.forEach(v => {
        console.log(`\n--- VISTA: ${v.TABLE_NAME} ---`);
        console.log(v.VIEW_DEFINITION);
    });

    await remoteConn.end();
}

inspectInfoSchema().catch(console.error);
