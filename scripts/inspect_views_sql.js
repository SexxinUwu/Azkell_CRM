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
        const [v1] = await conn.query("SHOW CREATE VIEW vw_combustible_orden_viaje");
        console.log("--- SQL vw_combustible_orden_viaje ---");
        console.log(v1[0]['Create View']);
    } catch(e) {
        console.log("Error v1:", e.message);
    }

    try {
        const [v2] = await conn.query("SHOW CREATE VIEW vw_combustible_vale");
        console.log("\n--- SQL vw_combustible_vale ---");
        console.log(v2[0]['Create View']);
    } catch(e) {
        console.log("Error v2:", e.message);
    }

    await conn.end();
}

main().catch(console.error);
