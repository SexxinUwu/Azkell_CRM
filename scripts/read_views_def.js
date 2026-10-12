const mysql = require('mysql2/promise');
require('dotenv').config();

const REMOTE_CONFIG = {
    host: process.env.REMOTE_FUEL_HOST,
    user: process.env.REMOTE_FUEL_USER,
    password: process.env.REMOTE_FUEL_PASSWORD,
    database: process.env.REMOTE_FUEL_DATABASE_2,
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
