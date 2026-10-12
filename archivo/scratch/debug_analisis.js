const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkMarsisaVales() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '82.39.109.226',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: 'azkell_tenant_marsisa',
        port: process.env.DB_PORT || 3306
    });

    console.log("=== 1. Conteo de vales en azkell_tenant_marsisa.marsisa_combustible_vales ===");
    const [cVales] = await conn.query("SELECT COUNT(*) as total FROM marsisa_combustible_vales");
    console.log("Total vales:", cVales[0].total);

    const [cValesComb] = await conn.query("SELECT COUNT(*) as total FROM combustible_vales");
    console.log("Total vales en combustible_vales:", cValesComb[0].total);

    console.log("\n=== 2. Muestra de vales recientes en marsisa_combustible_vales ===");
    const [sample] = await conn.query("SELECT id, fecha, correlativo, viaje, vehiculo, tipo_combustible, galones, importe FROM marsisa_combustible_vales ORDER BY fecha DESC LIMIT 10");
    console.table(sample);

    console.log("\n=== 3. Conteo de órdenes de viaje en marsisa_ordenes_viaje ===");
    const [cOV] = await conn.query("SELECT COUNT(*) as total FROM marsisa_ordenes_viaje");
    console.log("Total órdenes de viaje:", cOV[0].total);

    const [sampleOV] = await conn.query("SELECT viaje, fecha_viaje, conductor, placa_tracto, ruta FROM marsisa_ordenes_viaje ORDER BY fecha_viaje DESC LIMIT 5");
    console.table(sampleOV);

    await conn.end();
}

checkMarsisaVales();
