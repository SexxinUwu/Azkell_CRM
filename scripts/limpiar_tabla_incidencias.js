require('dotenv').config();
const mysql = require('mysql2');

const conn = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT) || 3306,
    ssl: (process.env.DB_HOST && (process.env.DB_HOST.includes('railway') || process.env.DB_HOST.includes('aiven') || process.env.DB_SSL === 'true')) ? { rejectUnauthorized: false } : undefined
});

conn.query("SHOW DATABASES LIKE 'azkell_tenant_%'", async (err, dbs) => {
    if (err) {
        console.error('Error listando bases de datos:', err);
        conn.end();
        process.exit(1);
    }
    for (const d of dbs) {
        const dbName = Object.values(d)[0];
        await new Promise((resolve) => {
            conn.query(`TRUNCATE TABLE \`${dbName}\`.\`mant_incidencias_ruta\``, (errT) => {
                if (errT) {
                    console.error(`Error limpiando ${dbName}:`, errT.message);
                } else {
                    console.log(`✅ Tabla mant_incidencias_ruta vaciada en: ${dbName}`);
                }
                resolve();
            });
        });
    }
    conn.end(() => {
        console.log('✅ Operación de limpieza finalizada con éxito.');
        process.exit(0);
    });
});
