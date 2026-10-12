require('dotenv').config();
const mysql = require('mysql2/promise');

async function test() {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'azkell_tenant_marsisa',
            port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
        });

        const [tables] = await pool.query("SHOW TABLES");
        console.log('Tables in DB:', tables.map(t => Object.values(t)[0]));

        const [countOT] = await pool.query("SELECT COUNT(*) AS c FROM ordenes_trabajo");
        console.log('ordenes_trabajo count:', countOT[0].c);

        const [countInsp] = await pool.query("SELECT COUNT(*) AS c FROM inspecciones");
        console.log('inspecciones count:', countInsp[0].c);

        const [countBk] = await pool.query("SELECT COUNT(*) AS c FROM ot_backlog");
        console.log('ot_backlog count:', countBk[0].c);

        const [colsOT] = await pool.query("SHOW COLUMNS FROM ordenes_trabajo");
        console.log('ordenes_trabajo columns:', colsOT.map(c => c.Field));

        const [colsInsp] = await pool.query("SHOW COLUMNS FROM inspecciones");
        console.log('inspecciones columns:', colsInsp.map(c => c.Field));

        await pool.end();
    } catch(e) {
        console.error('Error:', e.message);
    }
}
test();
