const mysql = require('mysql2/promise');
require('dotenv').config();

const REMOTE_CONFIG = {
    host: process.env.REMOTE_FUEL_HOST || '168.231.98.23',
    user: process.env.REMOTE_FUEL_USER || 'prov_combustible',
    password: process.env.REMOTE_FUEL_PASSWORD || '32f2dc8b2b27fc021c81674c04c2326e',
    database: process.env.REMOTE_FUEL_DATABASE || 'marsisadb_prod',
    connectTimeout: 15000
};

async function main() {
    const conn = await mysql.createConnection(REMOTE_CONFIG);

    try {
        const [privs] = await conn.query("SELECT TABLE_SCHEMA, TABLE_NAME, PRIVILEGE_TYPE FROM information_schema.TABLE_PRIVILEGES WHERE GRANTEE LIKE '%prov_combustible%'");
        console.log("Privilegios de prov_combustible:", privs);
    } catch(e) {
        console.log("Error privileges:", e.message);
    }

    try {
        const [allTables] = await conn.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'marsisadb_prod'");
        console.log("Todas las tablas/vistas en marsisadb_prod:", allTables.map(t => t.TABLE_NAME));
    } catch(e) {
        console.log("Error tables:", e.message);
    }

    await conn.end();
}

main().catch(console.error);
