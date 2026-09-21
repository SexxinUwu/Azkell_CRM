require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function testFinal() {
    const pool = getTenantPool('azkell_tenant_marsisa').promise();
    
    // Check total items, items with stock = 0
    const [summary] = await pool.query(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN stock_regularizado = 0 THEN 1 ELSE 0 END) as con_stock_cero,
            MIN(fecha_regularizacion) as min_fecha_reg,
            MAX(fecha_regularizacion) as max_fecha_reg
        FROM inventario
        WHERE activo = 1
    `);
    console.log('✅ Resumen de inventario en BD Marsisa:', summary[0]);
    process.exit(0);
}

testFinal();
