require('dotenv').config();
const mysql = require('mysql2/promise');

async function testIndexesAndOptimizedQuery() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT) || 3306,
        database: 'azkell_tenant_rosymarperu'
    });

    console.log("Verificando / Creando índices...");
    try {
        await conn.query("CREATE INDEX idx_neu_insp_placa_fecha ON neumaticos_inspecciones (placa, fecha_inspeccion)");
    } catch(e) { console.log('Index 1 ya existe o mensaje:', e.message); }
    
    try {
        await conn.query("CREATE INDEX idx_neu_det_insp ON neumaticos_inspecciones_det (id_inspeccion)");
    } catch(e) { console.log('Index 2 ya existe o mensaje:', e.message); }

    try {
        await conn.query("CREATE INDEX idx_placas_placa ON placas (placa)");
    } catch(e) { console.log('Index 3 ya existe o mensaje:', e.message); }

    console.time('⚡ Consulta Ultra Optimizada');
    const [rows] = await conn.query(`
        SELECT 
            d.id,
            i.id_inspeccion,
            i.fecha_inspeccion,
            i.placa,
            i.km_vehiculo as km,
            d.posicion,
            d.marca,
            d.medida,
            d.modelo,
            d.r1,
            d.r2,
            d.r3,
            d.r4,
            d.remanente_promedio,
            d.presion_ant,
            d.presion_actual,
            d.estado,
            d.accion,
            d.rot,
            d.observaciones,
            d.foto1,
            d.foto2,
            d.foto3,
            d.alerta_cambio,
            p.cliente as dueno,
            p.marca as marca_unidad,
            p.tipo as tipo_unidad,
            p.motora
        FROM (
            SELECT i1.id_inspeccion, i1.placa, i1.fecha_inspeccion, i1.km_vehiculo
            FROM neumaticos_inspecciones i1
            WHERE (i1.placa, i1.fecha_inspeccion) IN (
                SELECT placa, MAX(fecha_inspeccion)
                FROM neumaticos_inspecciones
                GROUP BY placa
            )
        ) i
        INNER JOIN neumaticos_inspecciones_det d ON d.id_inspeccion = i.id_inspeccion
        LEFT JOIN placas p ON p.placa = i.placa
        ORDER BY i.placa ASC, CAST(d.posicion AS UNSIGNED) ASC, d.posicion ASC
    `);
    console.timeEnd('⚡ Consulta Ultra Optimizada');
    console.log(`Filas retornadas: ${rows.length}`);

    await conn.end();
}

testIndexesAndOptimizedQuery();
