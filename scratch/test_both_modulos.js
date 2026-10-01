const mysql = require('mysql2/promise');
require('dotenv').config();

async function testBothModulos() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '82.39.109.226',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: 'azkell_tenant_marsisa',
        port: process.env.DB_PORT || 3306
    });

    console.log("=== Comprobando tabla operaciones_combustible_vales vs marsisa_combustible_vales ===");
    try {
        const [opVales] = await conn.query("SELECT COUNT(*) as cnt, MIN(fecha) as minF, MAX(fecha) as maxF FROM operaciones_combustible_vales");
        console.log("operaciones_combustible_vales:", opVales[0]);

        const [sampleOp] = await conn.query("SELECT id, fecha, correlativo, viaje, vehiculo FROM operaciones_combustible_vales ORDER BY fecha DESC LIMIT 5");
        console.log("Muestra operaciones_combustible_vales:", sampleOp);
    } catch (e) {
        console.log("Error consultando operaciones_combustible_vales:", e.message);
    }

    try {
        const [combVales] = await conn.query("SELECT COUNT(*) as cnt, MIN(fecha) as minF, MAX(fecha) as maxF FROM combustible_vales");
        console.log("combustible_vales:", combVales[0]);

        const [sampleComb] = await conn.query("SELECT id, fecha, correlativo, viaje, vehiculo FROM combustible_vales ORDER BY fecha DESC LIMIT 5");
        console.log("Muestra combustible_vales:", sampleComb);
    } catch (e) {
        console.log("Error consultando combustible_vales:", e.message);
    }

    await conn.end();
}

testBothModulos();
