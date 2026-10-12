const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspect() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306
    });

    console.log('--- TABLES IN yoguitransport ---');
    const [tablesY] = await conn.query("SHOW TABLES FROM `azkell_tenant_yoguitransport` LIKE '%placa%'");
    console.log('placa tables in yogui:', tablesY);

    const [tablesV] = await conn.query("SHOW TABLES FROM `azkell_tenant_yoguitransport` LIKE '%vehic%'");
    console.log('vehic tables in yogui:', tablesV);

    const [tablesF] = await conn.query("SHOW TABLES FROM `azkell_tenant_yoguitransport` LIKE '%flota%'");
    console.log('flota tables in yogui:', tablesF);

    const [tablesAll] = await conn.query("SHOW TABLES FROM `azkell_tenant_yoguitransport`");
    console.log('All tables in yogui:', tablesAll.map(t => Object.values(t)[0]));

    await conn.end();
}

inspect().catch(console.error);
