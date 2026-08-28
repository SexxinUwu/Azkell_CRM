const mysql = require('mysql2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbs = ['azkell_fleet', 'azkell_master', 'azkell_tenant_marsisa', 'azkell_tenant_rosymarperu'];

dbs.forEach(dbname => {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: dbname,
        port: process.env.DB_PORT || 3306,
        connectionLimit: 2
    });

    const addSalida = `ALTER TABLE seg_unidades_registros ADD COLUMN salida_observaciones TEXT DEFAULT NULL`;
    const addRetorno = `ALTER TABLE seg_unidades_registros ADD COLUMN retorno_observaciones TEXT DEFAULT NULL`;

    pool.query(addSalida, (err1) => {
        if (err1 && !err1.message.includes('Duplicate column')) {
            console.log(`[${dbname}] Salida obs error:`, err1.message);
        } else {
            console.log(`[${dbname}] OK: salida_observaciones lista`);
        }

        pool.query(addRetorno, (err2) => {
            if (err2 && !err2.message.includes('Duplicate column')) {
                console.log(`[${dbname}] Retorno obs error:`, err2.message);
            } else {
                console.log(`[${dbname}] OK: retorno_observaciones lista`);
            }
        });
    });
});
