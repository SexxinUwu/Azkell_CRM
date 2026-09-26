const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
});

(async () => {
    try {
        const [delResult] = await pool.promise().query(
            `DELETE FROM azkell_tenant_marsisa.tesoreria_caja 
             WHERE id IN (1, 2, 3) AND importe_total = 1000.00`
        );
        console.log('Deleted test movements from marsisa tesoreria_caja:', delResult.affectedRows);

        const [remaining] = await pool.promise().query(
            `SELECT id, fecha, importe_total, motivo, descripcion, observacion, estado 
             FROM azkell_tenant_marsisa.tesoreria_caja`
        );
        console.log('Remaining tesoreria_caja rows:');
        console.table(remaining);
    } catch(err) {
        console.error('Error deleting test movements:', err);
    }
    process.exit(0);
})();
