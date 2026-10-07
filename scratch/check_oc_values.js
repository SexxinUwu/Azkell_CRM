const mysql = require('mysql2');
const pool = mysql.createPool({
    host: '82.39.109.226',
    user: 'root',
    password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
    database: 'azkell_tenant_marsisa',
    port: 3306
});
const pDb = pool.promise();

(async () => {
    const [rows] = await pDb.query("SELECT * FROM entradas_inv ORDER BY id DESC LIMIT 2");
    console.log('Ultimas entradas:', rows);

    const [detCols] = await pDb.query("SHOW COLUMNS FROM entradas_detalles");
    console.log('Columnas entradas_detalles:', detCols.map(c => c.Field));

    const [detRows] = await pDb.query("SELECT * FROM entradas_detalles WHERE entrada_id = ? LIMIT 5", [rows[0].id]);
    console.log('Detalles entrada:', detRows);

    pool.end();
})();
