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
        console.log('--- Checking DB:', d);
        try {
            const [orphans] = await pool.promise().query(
                `SELECT r.id, r.oc_id, r.fecha_recepcion 
                 FROM ${d}.recepciones_oc r 
                 LEFT JOIN ${d}.entradas_inv e ON e.id = r.oc_id 
                 WHERE e.id IS NULL`
            );
            console.log(`Found ${orphans.length} orphan recepciones_oc in ${d}:`, orphans);
            if (orphans.length > 0) {
                const orphanIds = orphans.map(o => o.id);
                const [delDet] = await pool.promise().query(
                    `DELETE FROM ${d}.detalle_recepciones_oc WHERE recepcion_id IN (${orphanIds.join(',')})`
                );
                const [delRec] = await pool.promise().query(
                    `DELETE FROM ${d}.recepciones_oc WHERE id IN (${orphanIds.join(',')})`
                );
                console.log(`Cleaned up orphan recepciones in ${d}: deleted ${delDet.affectedRows} details and ${delRec.affectedRows} headers.`);
            }
        } catch(e) {
            console.error('Error on', d, e.message);
        }
    }
    process.exit(0);
})();
