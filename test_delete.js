const fetch = require('node-fetch'); // we'll use native fetch below
const mysql = require('mysql2/promise');

(async () => {
    const c = await mysql.createConnection({ host: '82.39.109.226', user: 'root', password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU', database: 'azkell_fleet', port: 3306 });
    const [rows] = await c.query("SELECT idRegistro FROM fleetrun LIMIT 2");
    if (rows.length < 2) return console.log("Not enough rows");
    
    const id1 = rows[0].idRegistro;
    const id2 = rows[1].idRegistro;
    console.log("Will try to delete:", [id1, id2]);
    
    // Test the mock server from before (I need to start it first)
    // Actually I can just test connection.query with an array of two elements
    const mysqlCb = require('mysql2');
    const pool = mysqlCb.createPool({ host: '82.39.109.226', user: 'root', password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU', database: 'azkell_fleet', port: 3306 });
    
    const ids = [id1, id2];
    const sql = `DELETE FROM fleetrun WHERE idRegistro IN (?)`;
    pool.getConnection((err, connection) => {
        connection.query(sql, [ids], (errDelete, res) => {
            console.log("Delete 2 ids result:", res, errDelete);
            process.exit(0);
        });
    });
})();
