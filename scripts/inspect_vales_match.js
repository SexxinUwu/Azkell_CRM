const mysql = require('mysql2/promise');
require('dotenv').config();

const REMOTE_CONFIG = {
    host: process.env.REMOTE_FUEL_HOST || '168.231.98.23',
    user: process.env.REMOTE_FUEL_USER || 'prov_combustible',
    password: process.env.REMOTE_FUEL_PASSWORD || '32f2dc8b2b27fc021c81674c04c2326e',
    database: process.env.REMOTE_FUEL_DATABASE || 'marsisadb_prod',
    connectTimeout: 15000
};

async function main() {
    const conn = await mysql.createConnection(REMOTE_CONFIG);

    // 1. Buscar en vw_combustible_vale por viaje_numero o placa CFC770 o conductor
    const [vales] = await conn.query("SELECT * FROM vw_combustible_vale WHERE viaje_numero LIKE '%952%' OR placa = 'CFC770' OR conductor_nombre LIKE '%GEISON%' ORDER BY fecha DESC LIMIT 10");
    console.log("Vales encontrados para viaje 952 / CFC770 / GEISON:", vales);

    // 2. Ver cómo vienen los números de viaje en vw_combustible_vale vs vw_combustible_orden_viaje
    const [sampleVales] = await conn.query("SELECT serie, numero, viaje_numero, viaje_rutas, placa, fecha FROM vw_combustible_vale WHERE viaje_rutas IS NOT NULL AND viaje_rutas != '' ORDER BY fecha DESC LIMIT 10");
    console.log("\nMuestra de viajes y rutas en vw_combustible_vale:", sampleVales);

    // 3. Ver cómo vienen los números de viaje en vw_combustible_orden_viaje
    const [sampleOV] = await conn.query("SELECT id_viaje, viaje, fecha_viaje, conductor, placa_vehiculo, placa_remolque FROM vw_combustible_orden_viaje ORDER BY fecha_viaje DESC LIMIT 10");
    console.log("\nMuestra de viajes en vw_combustible_orden_viaje:", sampleOV);

    await conn.end();
}

main().catch(console.error);
