const mysql = require('mysql2');
const c = mysql.createConnection({
    host: '82.39.109.226',
    user: 'root',
    password: process.env.SCRIPTS_DB_ROOT_PASSWORD,
    database: 'azkell_fleet'
});
c.query('SHOW TRIGGERS', (err, res) => {
    if (err) console.error(err);
    else console.log(res);
    c.end();
});
