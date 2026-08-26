require('dotenv').config();
const mysql = require('mysql2/promise');

async function testPayloadSize() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT) || 3306,
        database: 'azkell_tenant_rosymarperu'
    });

    const [rows] = await conn.query(`
        SELECT 
            LENGTH(foto1) as f1,
            LENGTH(foto2) as f2,
            LENGTH(foto3) as f3
        FROM neumaticos_inspecciones_det
        WHERE foto1 IS NOT NULL OR foto2 IS NOT NULL OR foto3 IS NOT NULL
        LIMIT 10
    `);
    console.log("Tamaños de fotos en BD:", rows);

    console.time("Query SIN base64 de fotos");
    const [fastRows] = await conn.query(`
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
            (d.foto1 IS NOT NULL AND d.foto1 != '') as tiene_foto1,
            (d.foto2 IS NOT NULL AND d.foto2 != '') as tiene_foto2,
            (d.foto3 IS NOT NULL AND d.foto3 != '') as tiene_foto3,
            d.alerta_cambio
        FROM neumaticos_inspecciones_det d
    `);
    console.timeEnd("Query SIN base64 de fotos");
    console.log("Filas:", fastRows.length);

    await conn.end();
}
testPayloadSize();
