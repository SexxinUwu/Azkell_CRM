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
        const [views] = await conn.query("SELECT TABLE_NAME, VIEW_DEFINITION FROM information_schema.VIEWS WHERE TABLE_SCHEMA = 'marsisadb_prod'");
        views.forEach(v => {
            console.log(`\n================= VISTA: ${v.TABLE_NAME} =================`);
            console.log(v.VIEW_DEFINITION);
        });
    } catch(e) {
        console.log("Error leyendo information_schema.VIEWS:", e.message);
    }

    await conn.end();
}

main().catch(console.error);
