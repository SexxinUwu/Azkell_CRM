const mysql = require('mysql2');

const rawPool = mysql.createPool({
    host: '82.39.109.226',
    user: 'root',
    password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
    database: 'azkell_tenant_rosymarperu',
    port: 3306
});

function getDb(req) {
    const d = (req && req.db) ? req.db : rawPool;
    if (!d) return null;
    return (typeof d.promise === 'function') ? d.promise() : d;
}

(async () => {
    const req = { db: rawPool, tenantSlug: 'rosymarperu' };
    const tdb = getDb(req);
    const placa = 'CFS755';

    console.log('Testing estado-actual for placa:', placa);
    const [unidadRows] = await tdb.query(
        "SELECT * FROM placas WHERE placa COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci LIMIT 1",
        [placa]
    );
    const unidad = unidadRows[0] || { placa };

    const [inspRows] = await tdb.query(
        "SELECT * FROM neumaticos_inspecciones WHERE placa COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci ORDER BY fecha_inspeccion DESC, created_at DESC LIMIT 1",
        [placa]
    );

    console.log('Unidad:', unidad);
    console.log('Ultima Insp:', inspRows[0] || null);

    if (inspRows.length > 0) {
        const [detalles] = await tdb.query(
            "SELECT * FROM neumaticos_inspecciones_det WHERE id_inspeccion COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci ORDER BY CAST(posicion AS UNSIGNED) ASC, posicion ASC",
            [inspRows[0].id_inspeccion]
        );
        console.log('Detalles llantas count:', detalles.length);
    } else {
        console.log('No inspections for CFS755 yet (returns ok:true, posiciones: [])');
    }

    console.log('Test completed successfully!');
    rawPool.end();
})();
