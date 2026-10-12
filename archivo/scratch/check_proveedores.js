const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306
    });

    const dbs = ['azkell_fleet', 'azkell_tenant_marsisa', 'azkell_tenant_rosymarperu', 'azkell_tenant_yoguitransport', 'azkell_tenant_trahesa'];

    for (const db of dbs) {
        try {
            const [tables] = await conn.query(`SHOW TABLES FROM \`${db}\` LIKE '%proveedor%'`);
            console.log(`Tables in ${db}:`, tables);
            for (const t of tables) {
                const tableName = Object.values(t)[0];
                const [count] = await conn.query(`SELECT COUNT(*) as count FROM \`${db}\`.\`${tableName}\``);
                console.log(`  ${db}.${tableName} count:`, count[0].count);
            }
        } catch(e) {
            console.log(`Error on ${db}:`, e.message);
        }
    }

    try {
        const [createTable] = await conn.query('SHOW CREATE TABLE `azkell_tenant_marsisa`.`proveedores`');
        console.log('\nSHOW CREATE TABLE azkell_tenant_marsisa.proveedores:\n', createTable[0]['Create Table']);
    } catch(e) {
        console.log('Error showing create table proveedores:', e.message);
    }

    const [allMarsisaTables] = await conn.query('SHOW TABLES FROM `azkell_tenant_marsisa`');
    console.log('\nAll tables in azkell_tenant_marsisa:', allMarsisaTables.map(t => Object.values(t)[0]));

    await conn.end();
}
run().catch(console.error);
