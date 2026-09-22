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

    const [desc] = await pool.query("DESCRIBE ordenes_trabajo");
    console.log('=== COLUMNAS ORDENES_TRABAJO ===');
    console.log(desc.map(d => d.Field).join(', '));

    const [ots] = await pool.query("SELECT id_ot, ticket_entrada, placa, estado, fecha_ingreso, detalles_json FROM ordenes_trabajo ORDER BY id_ot DESC LIMIT 10");
    console.log('=== ULTIMAS ORDENES DE TRABAJO ===');
    console.log(JSON.stringify(ots, null, 2));

    const [fallas] = await pool.query("SELECT id, placa, rampa, ots_generadas_json, estado, fecha_ingreso FROM reporte_fallas ORDER BY id DESC LIMIT 5");
    console.log('=== ULTIMOS REPORTES DE FALLAS ===');
    console.log(JSON.stringify(fallas, null, 2));

    await pool.end();
}

main().catch(console.error);
