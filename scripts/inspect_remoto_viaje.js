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
    console.log("Conectado a BD remota Marsisa");

    // 1. Ver qué tablas o vistas tienen datos del viaje 2026-00000952 o columnas relacionadas
    const [tables] = await conn.query("SHOW TABLES");
    const tableNames = tables.map(t => Object.values(t)[0]);
    console.log("Tablas en BD remota:", tableNames.filter(t => t.includes('viaje') || t.includes('orden') || t.includes('ruta') || t.includes('guia') || t.includes('monitoreo')));

    // 2. Buscar en vw_combustible_orden_viaje
    try {
        const [ovRows] = await conn.query("SELECT * FROM vw_combustible_orden_viaje WHERE viaje LIKE '%952%' OR id_viaje = 952 LIMIT 5");
        console.log("\n--- Registro en vw_combustible_orden_viaje ---");
        console.log(ovRows);
    } catch(e) {
        console.log("Error en vw_combustible_orden_viaje:", e.message);
    }

    // 3. Ver estructura de vistas/tablas de viajes disponibles
    for (const t of tableNames) {
        if (t.includes('viaje') || t.includes('ruta')) {
            try {
                const [cols] = await conn.query(`DESCRIBE \`${t}\``);
                console.log(`\nColumnas de ${t}:`, cols.map(c => c.Field));
                
                // Probar consultar el viaje 952 en esta tabla
                const colViaje = cols.find(c => c.Field.toLowerCase().includes('viaje') || c.Field.toLowerCase().includes('numero') || c.Field.toLowerCase().includes('codigo'));
                if (colViaje) {
                    const [data] = await conn.query(`SELECT * FROM \`${t}\` WHERE \`${colViaje.Field}\` LIKE '%952%' LIMIT 1`);
                    if (data.length > 0) {
                        console.log(`Encontrado en ${t}:`, data[0]);
                    }
                }
            } catch(e) {
                // Ignore view describe errors
            }
        }
    }

    await conn.end();
}

main().catch(console.error);
