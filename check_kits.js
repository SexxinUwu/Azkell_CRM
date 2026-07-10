const mysql = require('mysql2/promise');
const dbConfig = { host: '82.39.109.226', user: 'root', password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU', database: 'azkell_fleet', port: 3306 };
async function test() {
    try {
        const con = await mysql.createConnection(dbConfig);
        const [rows] = await con.query('DESCRIBE mantenimiento_kits');
        console.log(rows);
        await con.end();
    } catch(e) { console.error(e); }
}
test();
