const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectFallas() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'azkell_tenant_marsisa',
        port: process.env.DB_PORT || 3306
    });

    const [rows] = await conn.query("SELECT * FROM reportes_fallas WHERE folio = 'F-2026-0202'");
    console.log("F-2026-0202:", JSON.stringify(rows[0], null, 2));

    await conn.end();
}

inspectFallas().catch(console.error);
