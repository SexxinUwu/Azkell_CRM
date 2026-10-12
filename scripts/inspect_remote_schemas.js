const mysql = require('mysql2/promise');
require('dotenv').config();

const REMOTE_CONFIG = {
    host: process.env.REMOTE_FUEL_HOST,
    user: process.env.REMOTE_FUEL_USER,
    password: process.env.REMOTE_FUEL_PASSWORD,
    database: process.env.REMOTE_FUEL_DATABASE_2,
    connectTimeout: 15000
};

async function main() {
    const conn = await mysql.createConnection(REMOTE_CONFIG);

    try {
        const [dbs] = await conn.query("SHOW DATABASES");
        console.log("Bases de datos en 168.231.98.23:", dbs);
    } catch(e) {
        console.log("Error SHOW DATABASES:", e.message);
    }

    // Probar si podemos leer tablas del sistema principal de marsisa
    const testTables = [
        'orden_viaje', 'viaje', 'viajes', 'despacho', 'despachos', 
        'guia_remision', 'orden_servicio', 'monitoreo_viaje', 'ruta', 'rutas',
        'vw_orden_viaje', 'vw_viajes', 'vw_monitoreo', 'vw_despacho'
    ];

    for (const t of testTables) {
        try {
            const [rows] = await conn.query(`SELECT * FROM \`${t}\` LIMIT 1`);
            console.log(`✅ Tabla ${t} EXISTE y es accesible:`, Object.keys(rows[0] || {}));
        } catch(e) {
            // No existe o no tiene permisos
        }
    }

    // Probar en otras bases de datos si existen permisos
    try {
        const [dbs] = await conn.query("SHOW SCHEMAS");
        console.log("Schemas:", dbs);
    } catch(e) {}

    await conn.end();
}

main().catch(console.error);
