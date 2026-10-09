const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkInspecciones() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'azkell_tenant_marsisa',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
    });

    const [insp] = await conn.query('SELECT count(*) as c FROM inspecciones');
    console.log('Total inspecciones:', insp[0].c);
    
    const [recentInsp] = await conn.query('SELECT id, placa, fecha_ingreso, cliente, tecnico, km_tablero, id_ot, tipo_inspeccion FROM inspecciones ORDER BY id DESC LIMIT 10');
    console.log('Recent Inspecciones:', recentInsp);

    // Let's check if there are other tables with fallas or backlog or status_flota
    const [statusFlota] = await conn.query('SELECT * FROM status_flota LIMIT 5');
    console.log('Status flota:', statusFlota);

    const [placasCount] = await conn.query('SELECT count(*) as c FROM placas');
    console.log('Total placas:', placasCount[0].c);

    await conn.end();
}

checkInspecciones().catch(console.error);
