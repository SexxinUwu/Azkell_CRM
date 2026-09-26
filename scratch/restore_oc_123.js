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
        await pool.promise().query(
            `UPDATE azkell_tenant_marsisa.detalle_entradas_inv 
             SET importe = 899.99, costo_unitario = 450.00 
             WHERE entrada_id = 'ENT-2026-00123'`
        );
        await pool.promise().query(
            `UPDATE azkell_tenant_marsisa.entradas_inv 
             SET total_pen = 899.99 
             WHERE id = 'ENT-2026-00123'`
        );
        await pool.promise().query(
            `UPDATE azkell_tenant_marsisa.tesoreria_caja 
             SET importe_total = 899.99, subtotal = 899.99 
             WHERE id = 4`
        );
        console.log('✅ ENT-2026-00123 restored to S/ 899.99 for audit matching');

        const [cab] = await pool.promise().query(
            `SELECT id, total_pen FROM azkell_tenant_marsisa.entradas_inv WHERE id = 'ENT-2026-00123'`
        );
        const [det] = await pool.promise().query(
            `SELECT entrada_id, cantidad, costo_unitario, importe FROM azkell_tenant_marsisa.detalle_entradas_inv WHERE entrada_id = 'ENT-2026-00123'`
        );
        const [caja] = await pool.promise().query(
            `SELECT id, importe_total, motivo FROM azkell_tenant_marsisa.tesoreria_caja WHERE id = 4`
        );
        console.log('Cabecera:', cab);
        console.log('Detalle:', det);
        console.log('Caja:', caja);
    } catch(err) {
        console.error('Error restoring:', err);
    }
    process.exit(0);
})();
