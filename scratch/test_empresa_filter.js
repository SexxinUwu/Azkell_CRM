require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function testFilter() {
    try {
        const pool = getTenantPool('azkell_tenant_marsisa').promise();
        
        const [rows] = await pool.query(`
            SELECT rf.id, rf.folio, rf.placa_tracto, rf.placa_remolque,
                   p1.cliente AS emp_tracto,
                   p2.cliente AS emp_remolque
            FROM reportes_fallas rf
            LEFT JOIN placas p1 ON rf.placa_tracto = p1.placa
            LEFT JOIN placas p2 ON rf.placa_remolque = p2.placa
            ORDER BY rf.id DESC
        `);

        console.log(`Total reportes: ${rows.length}`);
        const countByEmp = {};
        rows.forEach(r => {
            const emp = r.emp_tracto || r.emp_remolque || 'SIN EMPRESA';
            countByEmp[emp] = (countByEmp[emp] || 0) + 1;
        });
        console.log('Reportes agrupados por empresa:', countByEmp);

        const yogui = rows.filter(r => (r.emp_tracto && r.emp_tracto.includes('YOGUI')) || (r.emp_remolque && r.emp_remolque.includes('YOGUI')));
        console.log('Reportes de YOGUI:', yogui.length, yogui.slice(0, 5));

        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
testFilter();
