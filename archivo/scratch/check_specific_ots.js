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

    const [ots] = await pool.query("SELECT id_ot, ticket_entrada, placa, estado, id_rampa, fecha_ingreso, detalles_json FROM ordenes_trabajo WHERE placa IN ('AHG801', 'BTX997', 'BTJ985', 'ATM717', 'CJJ736', 'ATO970') ORDER BY id_ot DESC");
    console.log('=== OTs de estas placas ===');
    for (const o of ots) {
        console.log(`OT: ${o.id_ot}, Placa: ${o.placa}, Estado: ${o.estado}, id_rampa: ${o.id_rampa}, fecha_ingreso: ${o.fecha_ingreso}`);
        try {
            const det = typeof o.detalles_json === 'string' ? JSON.parse(o.detalles_json) : o.detalles_json;
            console.log('  detalles_json:', {
                id_reporte_falla: det.id_reporte_falla,
                folio_reporte: det.folio_reporte,
                rampa: det.rampa,
                id_rampa: det.id_rampa,
                motivo: det.motivo
            });
        } catch(e) {}
    }

    const [rampas] = await pool.query("SELECT id, rampa, placa, obs, fecha_ingreso, estado FROM taller_rampas WHERE placa IN ('AHG801', 'BTX997', 'BTJ985', 'ATM717', 'CJJ736', 'ATO970') AND estado != 'Liberado'");
    console.log('=== RAMPAS ACTIVAS ===');
    console.log(rampas);

    await pool.end();
}

main().catch(console.error);
