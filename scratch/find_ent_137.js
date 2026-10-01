const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectOrder() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '82.39.109.226',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'azkell_fleet',
        port: process.env.DB_PORT || 3306
    });

    // Check databases
    const [dbs] = await conn.query("SHOW DATABASES LIKE 'azkell%'");
    console.log("Databases:", dbs);

    for (const row of dbs) {
        const dbName = Object.values(row)[0];
        try {
            await conn.query(`USE \`${dbName}\``);
            const [rows] = await conn.query("SELECT id, fecha, proveedor_nombre, estado, estado_factura, url_voucher, url_cotizacion, url_factura, numero_operacion FROM entradas_inv WHERE id LIKE '%137%' OR id = 'ENT-2026-00137'");
            if (rows.length > 0) {
                console.log(`\nEncontrado en BD [${dbName}]:`, rows);
            }
        } catch (e) {
            // ignore
        }
    }

    await conn.end();
}

inspectOrder();
