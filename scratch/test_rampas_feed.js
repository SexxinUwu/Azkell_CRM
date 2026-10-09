const mysql = require('mysql2/promise');
require('dotenv').config();

async function testRampasFeed() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: 'azkell_tenant_marsisa',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
    });

    const [rows] = await conn.query(`
        SELECT id, rampa, placa, km, conductor, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs, estado, creado_en
        FROM taller_rampas
        WHERE estado != 'Liberado' AND (fecha_liberado IS NULL OR estado = 'Activo')
        ORDER BY rampa ASC, hora_salida ASC, id DESC
    `);

    const rampasList = rows.map(r => {
        let hIngreso = r.hora_ingreso || '-';
        if (hIngreso && typeof hIngreso === 'string' && hIngreso.length > 5) hIngreso = hIngreso.substring(0, 5);
        let hSalida = r.hora_salida || '-';
        if (hSalida && typeof hSalida === 'string' && hSalida.length > 5) hSalida = hSalida.substring(0, 5);

        let obsClean = (r.obs || 'Mantenimiento en rampa').split('\n').filter(Boolean).slice(0, 2).join(' • ');

        return {
            id: r.id,
            rampa: r.rampa ? `Rampa ${r.rampa}` : 'Rampa General',
            rampa_num: r.rampa || 1,
            placa: r.placa || 'S/P',
            conductor: r.conductor || 'Asignado a taller',
            km: r.km ? `${Number(r.km).toLocaleString('es-PE')} km` : '-',
            hora_ingreso: hIngreso,
            hora_salida: hSalida,
            fecha_salida: r.fecha_salida,
            situacion: r.situacion || 'En atención',
            trabajo: obsClean || 'Revisión y mantenimiento'
        };
    });

    console.log('Total rampas activas:', rampasList.length);
    console.log('Sample parsed rampa:', rampasList[0]);

    await conn.end();
}

testRampasFeed().catch(console.error);
