const mysql = require('mysql2');
const c = mysql.createConnection({
    host: '82.39.109.226',
    user: 'root',
    password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
    database: 'azkell_fleet'
});
c.query('SHOW TRIGGERS', (err, res) => {
    if (err) console.error(err);
    else console.log(res);
    c.end();
});
