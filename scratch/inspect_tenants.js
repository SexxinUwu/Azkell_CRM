const mysql = require('mysql2/promise');

(async () => {
    const pool = mysql.createPool({
        host: '82.39.109.226',
        user: 'root',
        password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
        port: 3306
    });

    const dbs = ['azkell_fleet', 'azkell_tenant_marsisa', 'azkell_tenant_rosymarperu'];
    for (const dbName of dbs) {
        console.log('\n========================================');
        console.log('DATABASE:', dbName);
        console.log('========================================');
        try {
            const [tables] = await pool.query(`SHOW TABLES FROM ${dbName}`);
            const tableNames = tables.map(t => Object.values(t)[0]);
            console.log('Tables has neumaticos_inspecciones:', tableNames.includes('neumaticos_inspecciones'));
            console.log('Tables has neumaticos_inspecciones_det:', tableNames.includes('neumaticos_inspecciones_det'));

            if (tableNames.includes('neumaticos_inspecciones')) {
                const [c1] = await pool.query(`DESCRIBE ${dbName}.neumaticos_inspecciones`);
                console.log('neumaticos_inspecciones cols:', c1.map(c => c.Field + ' (' + c.Type + ')').join(', '));
            }
            if (tableNames.includes('neumaticos_inspecciones_det')) {
                const [c2] = await pool.query(`DESCRIBE ${dbName}.neumaticos_inspecciones_det`);
                console.log('neumaticos_inspecciones_det cols:', c2.map(c => c.Field + ' (' + c.Type + ' ' + (c.Extra||'') + ')').join(', '));
            }
        } catch(e) {
            console.error('Error on', dbName, e.message);
        }
    }
    pool.end();
})();
