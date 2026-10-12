const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
});

(async () => {
    const [cabecera] = await pool.promise().query(
        `SELECT * FROM azkell_tenant_marsisa.entradas_inv WHERE id = 'ENT-2026-00123' OR id = '123' OR id = 123`
    );
    console.log('Cabecera:', cabecera);

    const [detalles] = await pool.promise().query(
        `SELECT * FROM azkell_tenant_marsisa.detalle_entradas_inv WHERE entrada_id = 'ENT-2026-00123' OR entrada_id = '123' OR entrada_id = 123`
    );
    console.log('Detalles:', detalles);
    process.exit(0);
})();
