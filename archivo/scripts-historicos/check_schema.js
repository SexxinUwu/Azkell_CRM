const mysql = require('mysql2');
const c = mysql.createConnection({
    host: '82.39.109.226',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'azkell_fleet'
});
c.query('SHOW TRIGGERS', (err, res) => {
    if (err) console.error(err);
    else console.log(res);
    c.end();
});
