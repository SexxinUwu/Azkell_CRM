const mysql = require('mysql2/promise');
require('dotenv').config();

const dbs = ['azkell_fleet', 'azkell_tenant_marsisa', 'azkell_tenant_rosymarperu', 'azkell_tenant_yoguitransport'];

async function main() {
    for (const dbName of dbs) {
        try {
            const conn = await mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: dbName,
                port: process.env.DB_PORT || 3306
            });
            const [hasOS] = await conn.query("SHOW TABLES LIKE 'operaciones_ordenes_servicio'");
            if (hasOS.length > 0) {
                const [rows] = await conn.query("SELECT id, codigo_orden, viaje_asignado, cliente_nombre, estado_servicio FROM operaciones_ordenes_servicio");
                console.log(`=== DB: ${dbName} ===`);
                console.log('OS Count:', rows.length);
                console.table(rows);
            } else {
                console.log(`${dbName}: No tiene tabla operaciones_ordenes_servicio`);
            }
            await conn.end();
        } catch(e) {
            console.log(`${dbName} error:`, e.message);
        }
    }
}
main();
