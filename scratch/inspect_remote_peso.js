const mysql = require('mysql2/promise');
require('dotenv').config();
async function run() {
    const conn = await mysql.createConnection({
        host: process.env.REMOTE_FUEL_HOST || '168.231.98.23',
        user: process.env.REMOTE_FUEL_USER || 'prov_combustible',
        password: process.env.REMOTE_FUEL_PASSWORD || '32f2dc8b2b27fc021c81674c04c2326e',
        database: process.env.REMOTE_FUEL_DATABASE || 'marsisadb_prod'
    });
    const [views] = await conn.query('SHOW TABLES');
    for (const v of views) {
        const name = Object.values(v)[0];
        const [cols] = await conn.query(`DESCRIBE \`${name}\``);
        console.log(`=== ${name} ===`);
        console.log(cols.map(c => c.Field).join(', '));
    }

    // Consultar una muestra de vw_combustible_vale con peso != 0 y != null
    const [valesConPeso] = await conn.query("SELECT id, fecha, viaje_numero, serie, numero, peso, galones FROM vw_combustible_vale WHERE peso IS NOT NULL AND peso > 0 LIMIT 5");
    console.log("\n=== Muestra de vales con peso en vw_combustible_vale ===");
    console.log(valesConPeso);

    // Consultar una muestra de vw_combustible_rendimiento
    try {
        const [rendRows] = await conn.query("SELECT * FROM vw_combustible_rendimiento LIMIT 3");
        console.log("\n=== Muestra de vw_combustible_rendimiento ===");
        console.log(rendRows);
    } catch(e) {
        console.log("Error consultando rendimiento:", e.message);
    }

    await conn.end();
}
run().catch(console.error);
