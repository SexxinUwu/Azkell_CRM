const mysql = require('mysql2/promise');

(async () => {
    const pool = mysql.createPool({
        host: '82.39.109.226',
        user: 'root',
        password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
        port: 3306
    });

    const dbs = ['azkell_fleet', 'azkell_tenant_marsisa'];
    for (const dbName of dbs) {
        console.log(`=== DB: ${dbName} ===`);
        const [tables] = await pool.query(`SHOW TABLES FROM ${dbName} LIKE '%ordenes_viaje%'`);
        console.log('Tables ordenes_viaje:', tables.map(t => Object.values(t)[0]));
        for (const t of tables) {
            const tbl = Object.values(t)[0];
            const [c] = await pool.query(`SELECT COUNT(*) as c FROM ${dbName}.${tbl}`);
            console.log(`  ${tbl}: ${c[0].c}`);
        }
    }
    await pool.end();
})();
