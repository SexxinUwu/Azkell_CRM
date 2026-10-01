const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectOddVouchers() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '82.39.109.226',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: 'azkell_tenant_marsisa',
        port: process.env.DB_PORT || 3306
    });

    const [rows] = await conn.query("SELECT id, id_remoto, correlativo, fecha, viaje, vehiculo, galones, importe FROM marsisa_combustible_vales WHERE id IN (295816, 295817, 295829, 295815, 293442, 293443)");
    console.log("Vouchers inspeccionados:");
    console.table(rows);

    // Let's also check date range of all vouchers in marsisa_combustible_vales
    const [minMax] = await conn.query("SELECT MIN(fecha) as min_fecha, MAX(fecha) as max_fecha, COUNT(*) as total FROM marsisa_combustible_vales");
    console.log("\nMin y Max fecha en marsisa_combustible_vales:", minMax);

    // Let's check how many vouchers have date >= '2026-09-24'
    const [sepCount] = await conn.query("SELECT COUNT(*) as cnt FROM marsisa_combustible_vales WHERE fecha >= '2026-09-24 00:00:00'");
    console.log("\nVales >= 2026-09-24:", sepCount[0].cnt);

    const [sepVales] = await conn.query("SELECT id, fecha, correlativo, viaje, vehiculo, tipo_combustible FROM marsisa_combustible_vales WHERE fecha >= '2026-09-24 00:00:00' ORDER BY fecha DESC LIMIT 10");
    console.table(sepVales);

    await conn.end();
}

inspectOddVouchers();
