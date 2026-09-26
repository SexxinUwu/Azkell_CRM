const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
});

const dbs = ['azkell_fleet', 'azkell_tenant_yoguitransport', 'azkell_tenant_marsisa', 'azkell_tenant_rosymarperu', 'azkell_tenant_trahesa'];

(async () => {
    for (const d of dbs) {
        console.log('=== DB:', d);
        try {
            const [rows] = await pool.promise().query(
                `SELECT id, fecha, importe_total, subtotal, tipo_movimiento, motivo, sub_motivo, descripcion, observacion, estado
                 FROM ${d}.tesoreria_caja 
                 ORDER BY id DESC LIMIT 10`
            );
            console.log(`Found ${rows.length} rows in ${d}.tesoreria_caja:`);
            console.table(rows);
        } catch (e) {
            console.log('Error or table not present in', d, e.message);
        }
    }
    process.exit(0);
})();
