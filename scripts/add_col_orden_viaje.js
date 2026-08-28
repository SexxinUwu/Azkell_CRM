const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || ''
    });

    const [dbs] = await conn.query("SHOW DATABASES LIKE 'azkell%'");
    for (const d of dbs) {
        const dbName = Object.values(d)[0];
        try {
            await conn.query(`USE \`${dbName}\``);
            const [tables] = await conn.query("SHOW TABLES LIKE '%reportes_fallas%'");
            for (const t of tables) {
                const tableName = Object.values(t)[0];
                const [cols] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE 'orden_viaje'`);
                if (cols.length === 0) {
                    await conn.query(`ALTER TABLE \`${tableName}\` ADD COLUMN orden_viaje VARCHAR(60) DEFAULT NULL AFTER folio`);
                    console.log(`✅ [${dbName}] Columna orden_viaje agregada a ${tableName}`);
                } else {
                    console.log(`ℹ️ [${dbName}] Columna orden_viaje ya existía en ${tableName}`);
                }
            }
        } catch(e) {
            console.warn(`Error en DB ${dbName}:`, e.message);
        }
    }

    await conn.end();
}

main().catch(console.error);
