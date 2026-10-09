const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectRampas() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: 'azkell_tenant_marsisa',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
    });

    console.log('--- TALLER RAMPAS ---');
    try {
        const [cols] = await conn.query('SHOW COLUMNS FROM taller_rampas');
        console.log('Cols:', cols.map(c => c.Field));
        const [rows] = await conn.query('SELECT * FROM taller_rampas');
        console.log('Rows count:', rows.length);
        console.log('Sample rows:', rows.slice(0, 8));
    } catch (e) {
        console.log('taller_rampas error:', e.message);
    }

    console.log('\n--- OTs EN RAMPA / EN ATENCIÓN ---');
    try {
        const [ots] = await conn.query(`
            SELECT ticket_entrada, id_ot, placa, estado, id_rampa, fecha_ingreso, fecha_hora_salida, detalles_json
            FROM ordenes_trabajo
            WHERE id_rampa IS NOT NULL OR detalles_json LIKE '%rampa%' OR estado = 'En Proceso'
            ORDER BY id_ot DESC
            LIMIT 10
        `);
        console.log('OTs en rampa count:', ots.length);
        ots.forEach(o => {
            let d = {};
            try { d = typeof o.detalles_json === 'string' ? JSON.parse(o.detalles_json) : (o.detalles_json || {}); } catch(e){}
            console.log(`OT: ${o.id_ot} | Placa: ${o.placa} | Rampa: ${o.id_rampa} / ${d.rampa_origen} | Estado: ${o.estado} | Salida: ${o.fecha_hora_salida || d.fecha_hora_salida || d.fecha_salida_estimada}`);
        });
    } catch (e) {
        console.log('OT rampa error:', e.message);
    }

    await conn.end();
}

inspectRampas().catch(console.error);
