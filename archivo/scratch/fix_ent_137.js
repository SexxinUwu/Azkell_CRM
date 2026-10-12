const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixOrder137() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '82.39.109.226',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: 'azkell_tenant_marsisa',
        port: process.env.DB_PORT || 3306
    });

    console.log("Revisando ENT-2026-00137 en azkell_tenant_marsisa...");
    const [rows] = await conn.query("SELECT id, estado, estado_factura, url_voucher, numero_operacion FROM entradas_inv WHERE id = 'ENT-2026-00137'");
    console.log("Antes:", rows[0]);

    // Check tesoreria_caja
    const [caja] = await conn.query("SELECT * FROM tesoreria_caja WHERE descripcion LIKE '%ENT-2026-00137%' OR observacion LIKE '%ENT-2026-00137%'");
    console.log("En tesoreria_caja:", caja);

    // Update entradas_inv to Registrado and numero_operacion = NULL
    await conn.query("UPDATE entradas_inv SET estado = 'Registrado', numero_operacion = NULL, url_voucher = NULL WHERE id = 'ENT-2026-00137'");

    if (caja.length > 0) {
        await conn.query("UPDATE tesoreria_caja SET voucher_url = NULL, numero_constancia_deposito = NULL WHERE descripcion LIKE '%ENT-2026-00137%' OR observacion LIKE '%ENT-2026-00137%'");
    }

    const [rowsAfter] = await conn.query("SELECT id, estado, estado_factura, url_voucher, numero_operacion FROM entradas_inv WHERE id = 'ENT-2026-00137'");
    console.log("Después:", rowsAfter[0]);

    await conn.end();
}

fixOrder137();
