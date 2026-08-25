require('dotenv').config();
const mysql = require('mysql2/promise');

async function testOptimized() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: Number(process.env.DB_PORT) || 3306,
        database: 'azkell_tenant_marsisa',
        ssl: (process.env.DB_HOST && (process.env.DB_HOST.includes('railway') || process.env.DB_HOST.includes('aiven') || process.env.DB_SSL === 'true')) ? { rejectUnauthorized: false } : undefined
    });

    console.time('⚡ Optimized query');
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
            COALESCE(det_stats.total_llantas, 0) as total_llantas,
            COALESCE(det_stats.total_criticas, 0) as total_criticas
        FROM placas p
        LEFT JOIN (
            SELECT i1.id_inspeccion, i1.placa, i1.fecha_inspeccion, i1.km_vehiculo, i1.fecha_proxima
            FROM neumaticos_inspecciones i1
            INNER JOIN (
                SELECT placa, MAX(fecha_inspeccion) as max_fecha
                FROM neumaticos_inspecciones
                GROUP BY placa
            ) i2 ON i1.placa = i2.placa AND i1.fecha_inspeccion = i2.max_fecha
        ) last_i ON p.placa = last_i.placa
        LEFT JOIN (
            SELECT 
                id_inspeccion,
                COUNT(*) as total_llantas,
                SUM(CASE WHEN alerta_cambio = 1 OR remanente_promedio <= 4.0 THEN 1 ELSE 0 END) as total_criticas
            FROM neumaticos_inspecciones_det
            GROUP BY id_inspeccion
        ) det_stats ON last_i.id_inspeccion = det_stats.id_inspeccion
        WHERE UPPER(TRIM(COALESCE(p.en_uso, 'SI'))) != 'NO'
        ORDER BY 
            CASE WHEN last_i.fecha_inspeccion IS NULL THEN 0 ELSE 1 END ASC,
            last_i.fecha_inspeccion DESC
    `);
    console.timeEnd('⚡ Optimized query');
    console.log('Returned rows:', listado.length);

    await conn.end();
}
testOptimized();
