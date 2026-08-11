/**
 * Script para limpiar los registros importados con fecha=hoy (2026-08-11)
 * que en realidad eran planes iniciales (km_actual=0 o km_actual muy diferente al GPS actual).
 * Los registros con fecha 2026-08-11 Y km_actual=0 se consideran plan inicial,
 * se les quita la fecha para que queden como NULL.
 */
const mysql = require('mysql2/promise');

(async () => {
    const dbs = ['azkell_tenant_rosymarperu', 'azkell_tenant_marsisa'];
    for (const db of dbs) {
        const c = await mysql.createConnection({
            host: '82.39.109.226',
            user: 'root',
            password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
            port: 3306,
            database: db
        });

        // Ver cuántos registros tienen fecha=hoy Y km_actual=0 (plan inicial mal importado)
        const [check] = await c.query(
            `SELECT COUNT(*) as cnt FROM fleetrun WHERE fecha = '2026-08-11' AND (km_actual = 0 OR km_actual IS NULL)`
        );
        console.log(`${db}: registros a limpiar = ${check[0].cnt}`);

        if (check[0].cnt > 0) {
            const [result] = await c.query(
                `UPDATE fleetrun SET fecha = NULL WHERE fecha = '2026-08-11' AND (km_actual = 0 OR km_actual IS NULL)`
            );
            console.log(`${db}: ${result.affectedRows} registros actualizados -> fecha=NULL`);
        }

        await c.end();
    }
    console.log('Listo.');
})();
