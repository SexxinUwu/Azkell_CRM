const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306,
        database: 'azkell_tenant_marsisa'
    });

    const [rows] = await conn.query(`SELECT * FROM vehiculos_flota WHERE placa LIKE '%BTV%' OR placa LIKE '%CFA%'`);
    console.log('Vehiculos flota:', rows);

    const [placasRows] = await conn.query(`SELECT * FROM placas WHERE placa LIKE '%BTV%' OR placa LIKE '%CFA%'`);
    console.log('Placas table:', placasRows);

    await conn.end();
}
run().catch(console.error);
