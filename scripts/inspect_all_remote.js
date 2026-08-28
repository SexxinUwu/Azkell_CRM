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
    const [tables] = await conn.query("SHOW FULL TABLES");
    console.log("Todas las tablas/vistas en marsisadb_prod:", tables);

    // Buscar si hay vistas con 'guia', 'despacho', 'orden', 'flete', 'monitoreo', 'servicio', 'carga', 'transporte'
    for (const t of tables) {
        const name = Object.values(t)[0];
        console.log(" - " + name);
    }

    // Buscar en todas las vistas si alguna contiene 'LIMA - LA MERCED' o la palabra 'LA MERCED' o el id_viaje 2646
    for (const t of tables) {
        const name = Object.values(t)[0];
        try {
            const [cols] = await conn.query(`DESCRIBE \`${name}\``);
            const colNames = cols.map(c => c.Field);
            console.log(`Tabla/Vista [${name}]:`, colNames);

            // Probar buscar 2646
            const [rows] = await conn.query(`SELECT * FROM \`${name}\` LIMIT 3`);
            console.log(`Ejemplo datos de ${name}:`, rows[0]);
        } catch(e) {
            console.log(`Error leyendo ${name}:`, e.message);
        }
    }

    await conn.end();
}

main().catch(console.error);
