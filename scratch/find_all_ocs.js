const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
});

(async () => {
    const [dbs] = await pool.promise().query('SHOW DATABASES');
    console.log('DATABASES:', dbs.map(d => Object.values(d)[0]));
    for (const d of dbs.map(d => Object.values(d)[0])) {
        try {
            const [rows] = await pool.promise().query(`SELECT id, fecha, total_pen, estado FROM ${d}.entradas_inv ORDER BY id DESC LIMIT 5`);
            console.log(`DB ${d} entradas_inv:`, rows);
        } catch(e) {}
    }
    process.exit(0);
})();
