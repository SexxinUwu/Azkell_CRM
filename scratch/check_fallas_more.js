const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkMore() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'azkell_tenant_marsisa',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
    });

    try {
        const [cols] = await conn.query('SHOW COLUMNS FROM reportes_fallas');
        console.log('reportes_fallas cols:', cols.map(c => c.Field));
        const [rows] = await conn.query('SELECT * FROM reportes_fallas LIMIT 5');
        console.log('reportes_fallas count:', rows.length, 'sample:', rows[0]);
    } catch (e) {
        console.log('reportes_fallas err:', e.message);
    }

    try {
        const [cols] = await conn.query('SHOW COLUMNS FROM mant_incidencias_ruta');
        console.log('mant_incidencias_ruta cols:', cols.map(c => c.Field));
        const [rows] = await conn.query('SELECT * FROM mant_incidencias_ruta LIMIT 5');
        console.log('mant_incidencias_ruta count:', rows.length, 'sample:', rows[0]);
    } catch (e) {
        console.log('mant_incidencias_ruta err:', e.message);
    }

    try {
        const [blCount] = await conn.query('SELECT count(*) as count FROM ot_backlog');
        console.log('ot_backlog total count:', blCount[0].count);
        const [rows] = await conn.query('SELECT * FROM ot_backlog LIMIT 5');
        console.log('ot_backlog rows:', rows);
    } catch (e) {
        console.log('ot_backlog err:', e.message);
    }

    try {
        const [otCount] = await conn.query('SELECT estado, count(*) as c FROM ordenes_trabajo GROUP BY estado');
        console.log('OTs por estado:', otCount);
    } catch (e) {
        console.log('OT count error:', e.message);
    }

    await conn.end();
}

checkMore().catch(console.error);
