const mysql = require('mysql2/promise');
(async () => {
    const c = await mysql.createConnection({ host: '82.39.109.226', user: 'root', password: process.env.SCRIPTS_DB_ROOT_PASSWORD, database: 'azkell_fleet', port: 3306 });
    const [rows] = await c.query("SHOW CREATE TABLE fleetrun");
    console.log(rows[0]['Create Table']);
    process.exit(0);
})();
