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
