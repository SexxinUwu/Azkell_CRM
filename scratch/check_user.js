const mysql = require('mysql2');
const pool = mysql.createPool({
    host: '82.39.109.226',
    user: 'root',
    password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
    database: 'azkell_tenant_marsisa',
    port: 3306
});

pool.query("SELECT idUsuario, nombre, rol, rol_id, permisos_json FROM usuarios WHERE nombre LIKE '%Daniel%'", (err, rows) => {
    if (err) console.error('Error:', err);
    else console.log('Daniel:', JSON.stringify(rows, null, 2));
    pool.end();
});
