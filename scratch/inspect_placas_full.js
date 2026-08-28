const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectPlacasFull() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'fleet_db',
        port: process.env.DB_PORT || 3306
    });

    const [cols] = await conn.query("DESCRIBE placas");
    console.log("Columnas de placas:", cols.map(c => c.Field));

    const [sample] = await conn.query("SELECT * FROM placas LIMIT 5");
    console.log("Muestra completa de placas:", sample);

    const [motoresMatriz] = await conn.query("SELECT DISTINCT motor FROM combustible_matriz_d2");
    console.log("Motores en combustible_matriz_d2:", motoresMatriz);

    await conn.end();
}

inspectPlacasFull().catch(console.error);
