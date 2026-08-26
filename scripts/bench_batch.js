require('dotenv').config();
const mysql = require('mysql2/promise');

async function testIndexOptimization() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT) || 3306,
        database: 'azkell_tenant_rosymarperu'
    });

    console.log("Creando índices específicos...");
    try { await conn.query("ALTER TABLE neumaticos_inspecciones ADD INDEX idx_placa_fecha (placa, fecha_inspeccion)"); } catch(e){}
    try { await conn.query("ALTER TABLE neumaticos_inspecciones_det ADD INDEX idx_insp_pos (id_inspeccion, posicion)"); } catch(e){}
    try { await conn.query("ALTER TABLE placas ADD INDEX idx_placa_lookup (placa)"); } catch(e){}

    console.time("1. Obtener últimas inspecciones IDs");
    const [lastInspIds] = await conn.query(`
        SELECT t1.id_inspeccion, t1.placa, t1.fecha_inspeccion, t1.km_vehiculo
        FROM neumaticos_inspecciones t1
        JOIN (
            SELECT placa, MAX(fecha_inspeccion) as max_fecha
            FROM neumaticos_inspecciones
            GROUP BY placa
        ) t2 ON t1.placa = t2.placa AND t1.fecha_inspeccion = t2.max_fecha
    `);
    console.timeEnd("1. Obtener últimas inspecciones IDs");
    console.log("Total inspecciones últimas:", lastInspIds.length);

    if (lastInspIds.length > 0) {
        const ids = lastInspIds.map(x => x.id_inspeccion);
        console.time("2. Traer detalles por IDs");
        const [detalles] = await conn.query(`
            SELECT 
                d.id,
                d.id_inspeccion,
                d.posicion,
                d.marca,
                d.medida,
                d.modelo,
                d.r1, d.r2, d.r3, d.r4,
                d.remanente_promedio,
                d.presion_ant,
                d.presion_actual,
                d.estado,
                d.accion,
                d.rot,
                d.observaciones,
                d.foto1, d.foto2, d.foto3,
                d.alerta_cambio
            FROM neumaticos_inspecciones_det d
            WHERE d.id_inspeccion IN (?)
            ORDER BY d.id_inspeccion, CAST(d.posicion AS UNSIGNED) ASC, d.posicion ASC
        `, [ids]);
        console.timeEnd("2. Traer detalles por IDs");
        console.log("Total detalles:", detalles.length);
    }

    await conn.end();
}

testIndexOptimization();
