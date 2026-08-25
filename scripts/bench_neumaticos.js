require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkNeu() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: Number(process.env.DB_PORT) || 3306,
        database: 'azkell_tenant_marsisa',
        ssl: (process.env.DB_HOST && (process.env.DB_HOST.includes('railway') || process.env.DB_HOST.includes('aiven') || process.env.DB_SSL === 'true')) ? { rejectUnauthorized: false } : undefined
    });

    console.log('--- Indexes on neumaticos_inspecciones ---');
    const [i1] = await conn.query('SHOW INDEX FROM neumaticos_inspecciones');
    console.table(i1.map(i => ({ Key_name: i.Key_name, Column: i.Column_name })));

    console.log('--- Indexes on neumaticos_inspecciones_det ---');
    const [i2] = await conn.query('SHOW INDEX FROM neumaticos_inspecciones_det');
    console.table(i2.map(i => ({ Key_name: i.Key_name, Column: i.Column_name })));

    console.log('--- Counts ---');
    const [c1] = await conn.query('SELECT COUNT(*) as inspCount FROM neumaticos_inspecciones');
    const [c2] = await conn.query('SELECT COUNT(*) as detCount FROM neumaticos_inspecciones_det');
    const [c3] = await conn.query('SELECT COUNT(*) as placasCount FROM placas');
    console.log({ inspCount: c1[0].inspCount, detCount: c2[0].detCount, placasCount: c3[0].placasCount });

    // Test timing of current query in /analisis
    console.time('Current listado query');
    const [listado] = await conn.query(`
        SELECT 
            p.placa,
            p.cliente as dueno,
            p.marca as marca_unidad,
            p.tipo as tipo_unidad,
            p.motora,
            last_i.id_inspeccion,
            last_i.fecha_inspeccion,
            last_i.km_vehiculo,
            last_i.fecha_proxima,
            DATEDIFF(last_i.fecha_proxima, CURDATE()) as dias_restantes,
            (SELECT COUNT(*) FROM neumaticos_inspecciones_det d WHERE d.id_inspeccion COLLATE utf8mb4_unicode_ci = last_i.id_inspeccion COLLATE utf8mb4_unicode_ci) as total_llantas,
            (SELECT COUNT(*) FROM neumaticos_inspecciones_det d WHERE d.id_inspeccion COLLATE utf8mb4_unicode_ci = last_i.id_inspeccion COLLATE utf8mb4_unicode_ci AND (d.alerta_cambio = 1 OR d.remanente_promedio <= 4.0)) as total_criticas
        FROM placas p
        LEFT JOIN (
            SELECT i1.id_inspeccion, i1.placa, i1.fecha_inspeccion, i1.km_vehiculo, i1.fecha_proxima
            FROM neumaticos_inspecciones i1
            INNER JOIN (
                SELECT placa, MAX(fecha_inspeccion) as max_fecha
                FROM neumaticos_inspecciones
                GROUP BY placa
            ) i2 ON i1.placa COLLATE utf8mb4_unicode_ci = i2.placa COLLATE utf8mb4_unicode_ci AND i1.fecha_inspeccion = i2.max_fecha
        ) last_i ON p.placa COLLATE utf8mb4_unicode_ci = last_i.placa COLLATE utf8mb4_unicode_ci
        WHERE UPPER(TRIM(COALESCE(p.en_uso, 'SI'))) != 'NO'
        ORDER BY 
            CASE WHEN last_i.fecha_inspeccion IS NULL THEN 0 ELSE 1 END ASC,
            last_i.fecha_inspeccion DESC
    `);
    console.timeEnd('Current listado query');
    console.log('Listado rows:', listado.length);

    await conn.end();
}
checkNeu();
