const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectBBN894() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '82.39.109.226',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: 'azkell_tenant_marsisa',
        port: process.env.DB_PORT || 3306
    });

    console.log("=== Vales de BBN894 en marsisa_combustible_vales ===");
    const [rows] = await conn.query("SELECT id, correlativo, fecha, viaje, vehiculo, tipo_combustible, galones, kilometraje, importe FROM marsisa_combustible_vales WHERE vehiculo = 'BBN894' ORDER BY fecha ASC");
    console.table(rows);

    await conn.end();
}

inspectBBN894();
