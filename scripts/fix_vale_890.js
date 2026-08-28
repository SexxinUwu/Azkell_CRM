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
            const [tables] = await conn.query("SHOW TABLES LIKE 'combustible_vales'");
            if (tables.length > 0) {
                const [res] = await conn.query(
                    "UPDATE combustible_vales SET viaje = '2026-00000890' WHERE id = 4576 AND viaje = '2026-00000089'"
                );
                if (res.affectedRows > 0) {
                    console.log(`✅ [${dbName}] Corregido vale 4576 de 2026-00000089 a 2026-00000890`);
                }
            }
        } catch(e) {}
    }

    await conn.end();
}

main().catch(console.error);
