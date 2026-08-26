require('dotenv').config();
const mysql = require('mysql2/promise');

async function testFastUltimas() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT) || 3306,
        database: 'azkell_tenant_rosymarperu'
    });

    console.time("🚀 TIEMPO FINAL /ultimas SIN FOTOS PESADAS");
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
            (d.foto1 IS NOT NULL AND d.foto1 != '') as tiene_foto1,
            (d.foto2 IS NOT NULL AND d.foto2 != '') as tiene_foto2,
            (d.foto3 IS NOT NULL AND d.foto3 != '') as tiene_foto3,
            d.alerta_cambio,
            p.cliente as dueno,
            p.marca as marca_unidad,
            p.tipo as tipo_unidad,
            p.motora
        FROM (
            SELECT i1.id_inspeccion, i1.placa, i1.fecha_inspeccion, i1.km_vehiculo
            FROM neumaticos_inspecciones i1
            JOIN (
                SELECT placa, MAX(fecha_inspeccion) as max_fecha
                FROM neumaticos_inspecciones
                GROUP BY placa
            ) i2 ON i1.placa = i2.placa AND i1.fecha_inspeccion = i2.max_fecha
        ) i
        INNER JOIN neumaticos_inspecciones_det d ON d.id_inspeccion = i.id_inspeccion
        LEFT JOIN placas p ON p.placa = i.placa
        ORDER BY i.placa ASC, CAST(d.posicion AS UNSIGNED) ASC, d.posicion ASC
    `);
    console.timeEnd("🚀 TIEMPO FINAL /ultimas SIN FOTOS PESADAS");
    console.log("Filas obtenidas:", rows.length);

    await conn.end();
}
testFastUltimas();
