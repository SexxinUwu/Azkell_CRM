const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
});

(async () => {
    const [rows] = await pool.promise().query(
        `SELECT * FROM azkell_tenant_marsisa.entradas_inv WHERE id IN (120, 121, 122, 123)`
    );
    console.log('entradas_inv in marsisa:');
    console.log(rows.map(r => ({ id: r.id, fecha: r.fecha, total_pen: r.total_pen, estado: r.estado, motivo: r.motivo_solicitud || r.motivo })));
    process.exit(0);
})();
