const mysql = require('mysql2');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || '82.39.109.226';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_SSL = process.env.DB_HOST && (process.env.DB_HOST.includes('railway') || process.env.DB_HOST.includes('aiven') || process.env.DB_SSL === 'true') ? { rejectUnauthorized: false } : undefined;

const conn = mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    port: DB_PORT,
    ssl: DB_SSL
});

conn.connect(async (err) => {
    if (err) { console.error('Error:', err.message); process.exit(1); }

    const tables = ['placas', 'clientes', 'usuarios', 'ordenes_trabajo', 'inventario', 'conductores', 'inspecciones', 'seguridad'];
    console.log('📊 VERIFICACIÓN DE CONTEO DE REGISTROS POR TABLA:');
    console.log('---------------------------------------------------------');

    for (const table of tables) {
        await new Promise((resolve) => {
            conn.query(`SELECT COUNT(*) AS total FROM \`azkell_tenant_marsisa\`.\`${table}\``, (err1, r1) => {
                const countMarsisa = r1 && r1[0] ? r1[0].total : 'N/A';
                conn.query(`SELECT COUNT(*) AS total FROM \`azkell_fleet\`.\`${table}\``, (err2, r2) => {
                    const countFleet = r2 && r2[0] ? r2[0].total : 'N/A';
                    console.log(`Tabla [${table.padEnd(20)}]: azkell_fleet (${countFleet}) ===> azkell_tenant_marsisa (${countMarsisa})`);
                    resolve();
                });
            });
        });
    }

    console.log('---------------------------------------------------------');
    console.log('✅ Verificación completada con éxito.');
    conn.end();
});
