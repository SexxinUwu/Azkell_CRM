require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function run() {
    const dbs = ['azkell_tenant_marsisa', 'azkell_tenant_rosymarperu', 'azkell_tenant_yoguitransport', 'azkell_tenant_trahesa', 'azkell_fleet'];
    
    for (const dbName of dbs) {
        try {
            const pool = getTenantPool(dbName).promise();
            console.log(`\n🔍 Checking database: ${dbName}`);
            
            // Check if inventario exists
            const [tables] = await pool.query("SHOW TABLES LIKE 'inventario'");
            if (tables.length === 0) {
                console.log(`⚠️ Table inventario not found in ${dbName}`);
                continue;
            }
            
            // Modify fecha_regularizacion to DATETIME
            await pool.query("ALTER TABLE inventario MODIFY COLUMN fecha_regularizacion DATETIME NULL DEFAULT NULL");
            console.log(`✅ Altered fecha_regularizacion to DATETIME in ${dbName}`);

            // Count items
            const [counts] = await pool.query("SELECT COUNT(*) AS total, SUM(CASE WHEN activo=1 THEN 1 ELSE 0 END) AS activos FROM inventario");
            console.log(`📦 Inventario in ${dbName}: Total=${counts[0].total}, Activos=${counts[0].activos}`);

            // Regularizar a 0 todos los activos
            const [res] = await pool.query("UPDATE inventario SET stock_regularizado = 0, fecha_regularizacion = NOW() WHERE activo = 1");
            console.log(`🚀 Regularizados a 0 en ${dbName}: ${res.affectedRows} filas actualizadas.`);
        } catch (err) {
            console.error(`❌ Error on ${dbName}:`, err.message);
        }
    }
    process.exit(0);
}

run();
