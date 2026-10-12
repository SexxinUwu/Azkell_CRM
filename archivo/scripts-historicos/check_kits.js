const mysql = require('mysql2/promise');
const dbConfig = { host: '82.39.109.226', user: 'root', password: process.env.SCRIPTS_DB_ROOT_PASSWORD, database: 'azkell_fleet', port: 3306 };
async function test() {
    try {
        const con = await mysql.createConnection(dbConfig);
        const [rows] = await con.query('DESCRIBE mantenimiento_kits');
        console.log(rows);
        await con.end();
    } catch(e) { console.error(e); }
}
test();
