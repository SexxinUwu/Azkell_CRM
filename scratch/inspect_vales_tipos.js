const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectTipos() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'fleet_db',
        port: process.env.DB_PORT || 3306
    });

    console.log("=== 1. Valores distintos en el campo 'tipo' de los vales ===");
    const [tipos] = await conn.query("SELECT tipo, COUNT(*) as cantidad FROM combustible_vales GROUP BY tipo ORDER BY cantidad DESC");
    console.log(tipos);

    console.log("\n=== 2. Muestra de vales con 'RECARGA IDA' vs 'RECARGA VUELTA' vs otros ===");
    const [muestra] = await conn.query(`
        SELECT viaje, correlativo, fecha, estacion, tipo, ruta, peso_tn, kilometraje
        FROM combustible_vales
        WHERE viaje IS NOT NULL AND viaje != ''
        LIMIT 15
    `);
    console.log(muestra);

    await conn.end();
}

inspectTipos().catch(console.error);
