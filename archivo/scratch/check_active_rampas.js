const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkActiveRampas() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: 'azkell_tenant_marsisa',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
    });

    const [rows] = await conn.query("SELECT * FROM taller_rampas WHERE estado != 'Liberado' ORDER BY rampa ASC");
    console.log('Active Rampas count (estado != Liberado):', rows.length);
    console.log('Rows:', rows);

    const [allRecent] = await conn.query("SELECT * FROM taller_rampas ORDER BY id DESC LIMIT 10");
    console.log('Recent 10 rampas in DB:', allRecent);

    await conn.end();
}

checkActiveRampas().catch(console.error);
