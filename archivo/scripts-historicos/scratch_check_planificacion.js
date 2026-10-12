const mysql = require('mysql2/promise');

(async () => {
    const c = await mysql.createConnection({
        host: '82.39.109.226',
        user: 'root',
        password: process.env.SCRIPTS_DB_ROOT_PASSWORD,
        port: 3306,
        database: 'azkell_tenant_rosymarperu'
    });

    // Check requerimientos_planificacion table
    try {
        const [cols] = await c.query('SHOW COLUMNS FROM requerimientos_planificacion');
        console.log('TABLE: requerimientos_planificacion');
        cols.forEach(r => console.log(' ', r.Field, r.Type, 'NULL:', r.Null, 'Default:', r.Default));
    } catch(e) {
        console.log('requerimientos_planificacion not found:', e.message);
    }

    // Check fleetrun table for 'fecha' NOT NULL
    try {
        const [cols] = await c.query('SHOW COLUMNS FROM fleetrun');
        console.log('\nTABLE: fleetrun');
        const fechaCols = cols.filter(r => r.Field === 'fecha' || r.Field.includes('fecha'));
        fechaCols.forEach(r => console.log(' ', r.Field, r.Type, 'NULL:', r.Null, 'Default:', r.Default));
    } catch(e) {
        console.log('fleetrun not found:', e.message);
    }

    await c.end();
})();
