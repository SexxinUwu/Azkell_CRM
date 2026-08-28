const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectTrip() {
    const remoteConn = await mysql.createConnection({
        host: process.env.REMOTE_FUEL_HOST || '168.231.98.23',
        user: process.env.REMOTE_FUEL_USER || 'prov_combustible',
        password: process.env.REMOTE_FUEL_PASSWORD || '32f2dc8b2b27fc021c81674c04c2326e',
        database: process.env.REMOTE_FUEL_DATABASE || 'marsisadb_prod'
    });

    console.log("=== 1. Consultar vales de viaje 933 / 2026-00000933 en vw_combustible_vale ===");
    const [vales] = await remoteConn.query(
        "SELECT id, serie, numero, viaje_numero, placa, conductor_nombre, estacion, peso, tipo, fecha FROM vw_combustible_vale WHERE viaje_numero LIKE '%933%' OR id = 933"
    );
    console.log("Vales encontrados en vw_combustible_vale:", vales);

    console.log("\n=== 2. Consultar viaje 933 en vw_combustible_orden_viaje ===");
    const [ordenViaje] = await remoteConn.query(
        "SELECT * FROM vw_combustible_orden_viaje WHERE viaje LIKE '%933%' OR id_viaje = 933"
    );
    console.log("Ordenes de viaje en vw_combustible_orden_viaje:", ordenViaje);

    console.log("\n=== 3. Listar todas las tablas y vistas en marsisadb_prod ===");
    const [tables] = await remoteConn.query("SHOW FULL TABLES");
    console.log("Tablas y vistas disponibles:", tables);

    // Buscar si hay otra vista o tabla que tenga peso
    for (const t of tables) {
        const tableName = Object.values(t)[0];
        try {
            const [cols] = await remoteConn.query(`DESCRIBE \`${tableName}\``);
            const hasPeso = cols.some(c => c.Field.toLowerCase().includes('peso'));
            const hasViaje = cols.some(c => c.Field.toLowerCase().includes('viaje'));
            if (hasPeso && hasViaje) {
                console.log(`\n-> Tabla/Vista "${tableName}" TIENE columnas de VIAJE y PESO:`, cols.map(c => c.Field));
                const [sample] = await remoteConn.query(`SELECT * FROM \`${tableName}\` WHERE ${cols.find(c => c.Field.toLowerCase().includes('viaje')).Field} LIKE '%933%' LIMIT 2`);
                console.log(`   Muestra en ${tableName}:`, sample);
            }
        } catch(e) {}
    }

    await remoteConn.end();
}

inspectTrip().catch(console.error);
