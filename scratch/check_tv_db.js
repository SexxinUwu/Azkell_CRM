const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspect() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'azkell_tenant_marsisa',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
    });

    console.log('--- TABLES IN DB ---');
    const [tables] = await conn.query('SHOW TABLES');
    console.log(tables.map(t => Object.values(t)[0]));

    console.log('\n--- ORDENES DE TRABAJO COLUMNS ---');
    try {
        const [otCols] = await conn.query('SHOW COLUMNS FROM ordenes_trabajo');
        console.log(otCols.map(c => c.Field));
        const [ots] = await conn.query('SELECT * FROM ordenes_trabajo ORDER BY id_ot DESC LIMIT 3');
        console.log('Sample OT:', ots[0]);
    } catch (e) {
        console.log('OT Error:', e.message);
    }

    console.log('\n--- BACKLOG TABLES / COLUMNS ---');
    try {
        const [blCols] = await conn.query('SHOW COLUMNS FROM ot_backlog');
        console.log('ot_backlog cols:', blCols.map(c => c.Field));
        const [bls] = await conn.query('SELECT * FROM ot_backlog LIMIT 3');
        console.log('Sample Backlog:', bls[0]);
    } catch (e) {
        console.log('Backlog ot_backlog error:', e.message);
    }

    console.log('\n--- INSPECCIONES / FALLAS COLUMNS ---');
    try {
        const [inspCols] = await conn.query('SHOW COLUMNS FROM inspecciones');
        console.log('inspecciones cols:', inspCols.map(c => c.Field));
        const [insps] = await conn.query('SELECT * FROM inspecciones ORDER BY id DESC LIMIT 3');
        console.log('Sample Inspeccion:', insps[0]);
    } catch (e) {
        console.log('Inspecciones error:', e.message);
    }

    await conn.end();
}

inspect().catch(console.error);
