require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'azkell_fleet',
        port: parseInt(process.env.DB_PORT) || 3306
    });

    const [rows] = await pool.query("SELECT * FROM ordenes_trabajo WHERE detalles_json LIKE '%415488%' OR detalles_json LIKE '%415,488%' OR fecha_ingreso LIKE '%2026-09-19%' OR fecha_inicio_ot LIKE '%2026-09-19%'");
    console.log('=== Found OTs on 2026-09-19 (Count: ' + rows.length + ') ===');
    for (const r of rows) {
        console.log('ID:', r.id_ot, 'Ticket:', r.ticket_entrada, 'Placa:', r.placa);
        console.log('Detalles:', r.detalles_json);
    }

    await pool.end();
}

main().catch(console.error);
