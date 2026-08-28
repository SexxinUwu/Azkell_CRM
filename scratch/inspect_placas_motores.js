const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectPlacasCols() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'fleet_db',
        port: process.env.DB_PORT || 3306
    });

    console.log("=== Columnas de la tabla 'placas' ===");
    const [cols] = await conn.query("DESCRIBE placas");
    console.log(cols.map(c => `${c.Field} (${c.Type})`));

    console.log("\n=== Muestra de registros en 'placas' con motor / modelo / marca ===");
    const [sample] = await conn.query("SELECT placa, marca, modelo, motor, numero_motor, tipo, sub_tipo FROM placas LIMIT 10");
    console.log(sample);

    console.log("\n=== Valores distintos de motor en 'combustible_matriz_d2' ===");
    const [matrizMotores] = await conn.query("SELECT DISTINCT motor FROM combustible_matriz_d2");
    console.log(matrizMotores);

    await conn.end();
}

inspectPlacasCols().catch(console.error);
