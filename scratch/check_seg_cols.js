const mysql = require('mysql2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbs = ['azkell_fleet', 'azkell_tenant_marsisa', 'azkell_tenant_rosymarperu'];

dbs.forEach(dbname => {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: dbname,
        port: process.env.DB_PORT || 3306,
        connectionLimit: 2
    });

    pool.query('DESCRIBE seg_unidades_registros', (err, cols) => {
        if (err) {
            console.log(`[${dbname}] Error:`, err.message);
        } else {
            console.log(`[${dbname}] Columnas:`, cols.map(c => c.Field));
        }
    });
});
