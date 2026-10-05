require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function testJoinQuery() {
    try {
        const pool = getTenantPool('azkell_tenant_marsisa').promise();
        
        const sql = `
            SELECT rf.id, rf.folio, rf.placa_tracto, rf.placa_remolque,
                   COALESCE(p1.cliente, '') AS empresa_tracto,
                   COALESCE(p2.cliente, '') AS empresa_remolque,
                   COALESCE(NULLIF(p1.cliente, ''), NULLIF(p2.cliente, ''), '') AS empresa
            FROM reportes_fallas rf
            LEFT JOIN placas p1 ON REPLACE(REPLACE(rf.placa_tracto, '-', ''), ' ', '') = REPLACE(REPLACE(p1.placa, '-', ''), ' ', '')
            LEFT JOIN placas p2 ON REPLACE(REPLACE(rf.placa_remolque, '-', ''), ' ', '') = REPLACE(REPLACE(p2.placa, '-', ''), ' ', '')
            ORDER BY rf.id DESC
        `;

        const [rows] = await pool.query(sql);
        console.log(`Query returned ${rows.length} rows.`);
        
        const counts = {};
        rows.forEach(r => {
            const emp = r.empresa || 'SIN_EMPRESA';
            counts[emp] = (counts[emp] || 0) + 1;
        });
        console.log('Result counts by empresa:', counts);
        console.log('First 3 rows:', rows.slice(0, 3));

        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
testJoinQuery();
