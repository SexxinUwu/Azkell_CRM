const mysql = require('mysql2/promise');
(async () => {
    const c = await mysql.createConnection({ host: '82.39.109.226', user: 'root', password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU', database: 'azkell_fleet', port: 3306 });
    const [rows] = await c.execute("SELECT idRegistro, fecha, placa, tipo_mp, km_actual FROM fleetrun WHERE placa='BBN894' ORDER BY tipo_mp, fecha DESC, km_actual DESC");
    console.table(rows);
    process.exit(0);
})();
