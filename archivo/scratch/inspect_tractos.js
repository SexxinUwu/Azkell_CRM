const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectTractos() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'fleet_db',
        port: process.env.DB_PORT || 3306
    });

    const [motoras] = await conn.query("SELECT placa, marca, modelo_uts, nro_motor, configuracion FROM placas WHERE motora = 'Motora' OR tipo LIKE '%Tracto%' OR tipo LIKE '%Camion%' LIMIT 20");
    console.log("Muestra de vehículos con motor en 'placas':", motoras);

    // Revisar si en los vales remotos de combustible nos viene vehiculo_marca o vehiculo_modelo
    const [valesSample] = await conn.query("SELECT DISTINCT vehiculo, vehiculo_marca, vehiculo_modelo FROM combustible_vales WHERE vehiculo_marca IS NOT NULL AND vehiculo_marca != '' LIMIT 15");
    console.log("Marcas y modelos en combustible_vales:", valesSample);

    await conn.end();
}

inspectTractos().catch(console.error);
