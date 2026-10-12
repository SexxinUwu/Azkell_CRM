const mysql = require('mysql2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'azkell_fleet',
    port: process.env.DB_PORT || 3306,
    connectionLimit: 2
});

pool.query('DESCRIBE placas', (err, cols) => {
    if (err) {
        console.log('Error:', err.message);
    } else {
        console.log('Columnas de placas:', cols.map(c => c.Field));
    }
    pool.query('SELECT placa, soat_vencimiento, soat_venc, revision_tecnica, rt_vencimiento, citv_vencimiento FROM placas LIMIT 2', (err2, rows) => {
        if (!err2) console.log('Sample rows:', rows);
        else console.log('Sample err:', err2.message);
        process.exit(0);
    });
});
