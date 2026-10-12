const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectInfoSchema() {
    const remoteConn = await mysql.createConnection({
        host: process.env.REMOTE_FUEL_HOST,
        user: process.env.REMOTE_FUEL_USER,
        password: process.env.REMOTE_FUEL_PASSWORD,
        database: process.env.REMOTE_FUEL_DATABASE_2
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
