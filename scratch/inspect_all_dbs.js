require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: parseInt(process.env.DB_PORT) || 3306
    });

    const [dbs] = await pool.query("SHOW DATABASES");
    console.log('Databases:', dbs.map(d => Object.values(d)[0]));

    for (const d of dbs.map(d => Object.values(d)[0])) {
        try {
            const [ots] = await pool.query(`SELECT id_ot, ticket_entrada, placa, detalles_json FROM \`${d}\`.ordenes_trabajo WHERE id_ot = 'OT-2026-0467' OR ticket_entrada = 'OT-2026-0467' LIMIT 5`);
            if (ots && ots.length) {
                console.log(`=== FOUND OT IN DATABASE ${d} ===`, JSON.stringify(ots, null, 2));
            }
        } catch(e) {}
    }

    await pool.end();
}

main().catch(console.error);
