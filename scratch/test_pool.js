const mysql = require('mysql2');

const pool = mysql.createPool({
    host: '82.39.109.226',
    user: 'root',
    password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
    database: 'azkell_tenant_rosymarperu',
    port: 3306
});

(async () => {
    console.log('Testing callback pool with await pool.query:');
    try {
        const res = await pool.query('SELECT 1 as val');
        console.log('Type of res:', typeof res, res ? res.constructor.name : 'null');
        console.log('res is Array?', Array.isArray(res));
        const [rows] = res;
        console.log('rows:', rows);
    } catch(e) {
        console.error('Error on await pool.query:', e);
    }

    console.log('\nTesting with pool.promise().query:');
    try {
        const [rows] = await pool.promise().query('SELECT 1 as val');
        console.log('rows with pool.promise():', rows);
    } catch(e) {
        console.error('Error on pool.promise().query:', e);
    }

    pool.end();
})();
