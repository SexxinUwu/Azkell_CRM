const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'azkell_tenant_marsisa'
    });

    const [rows] = await conn.query("SELECT * FROM combustible_vales WHERE id = 4576 OR viaje LIKE '%89%' AND vehiculo = 'CLX861'");
    console.log("Vales encontrados:", rows);

    await conn.end();
}

main().catch(console.error);
