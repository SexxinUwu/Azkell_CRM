const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectMarsisa() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: 'azkell_tenant_marsisa',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
    });

    console.log('--- MARSISA OTs ---');
    const [ots] = await conn.query('SELECT ticket_entrada, id_ot, placa, estado, fecha_ingreso, creado_por, detalles_json FROM ordenes_trabajo ORDER BY id_ot DESC LIMIT 5');
    console.log(ots);

    console.log('\n--- MARSISA OT BACKLOG ---');
    const [bl] = await conn.query('SELECT * FROM ot_backlog ORDER BY id DESC LIMIT 5');
    console.log(bl);

    console.log('\n--- MARSISA REPORTES DE FALLAS ---');
    const [fallas] = await conn.query('SELECT id, folio, fecha_reporte, placa_tracto, placa_remolque, conductor, estado, fallas_tracto_json, fallas_remolque_json, fallas_libres_text FROM reportes_fallas ORDER BY id DESC LIMIT 5');
    console.log(fallas);

    const [fallasEstados] = await conn.query('SELECT estado, count(*) as c FROM reportes_fallas GROUP BY estado');
    console.log('\nFallas por estado:', fallasEstados);

    const [otEstados] = await conn.query('SELECT estado, count(*) as c FROM ordenes_trabajo GROUP BY estado');
    console.log('\nOTs por estado:', otEstados);

    const [blEstados] = await conn.query('SELECT estado, count(*) as c FROM ot_backlog GROUP BY estado');
    console.log('\nBacklog por estado:', blEstados);

    await conn.end();
}

inspectMarsisa().catch(console.error);
