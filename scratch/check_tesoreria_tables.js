const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
});

(async () => {
    const [tables] = await pool.promise().query("SHOW TABLES FROM azkell_tenant_marsisa LIKE 'tesoreria%'");
    console.log('Tesoreria tables:', tables);

    const [rows] = await pool.promise().query(
        `SELECT id, fecha, importe_total, motivo, descripcion, observacion, estado 
         FROM azkell_tenant_marsisa.tesoreria_caja`
    );
    console.log('All tesoreria_caja rows in marsisa:');
    console.table(rows);
    process.exit(0);
})();
