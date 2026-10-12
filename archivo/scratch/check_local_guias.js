const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkLocal() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'fleet_db',
        port: process.env.DB_PORT || 3306
    });

    console.log("=== Buscar viaje 933 en guias_remision locales ===");
    try {
        const [guias] = await conn.query("SELECT * FROM guias_remision WHERE viaje LIKE '%933%' OR numero_guia LIKE '%933%'");
        console.log("Guías encontradas:", guias);
    } catch(e) {
        console.log("Error guias:", e.message);
    }

    await conn.end();
}

checkLocal().catch(console.error);
