require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixTypos() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT) || 3306,
        database: 'azkell_tenant_rosymarperu'
    });

    console.log("Limpiando y estandarizando campos de incidencias en ruta...");
    
    // 1. Corregir typos de 'Concudtor', 'conductor' a 'Conductor'
    await conn.query(`
        UPDATE mant_incidencias_ruta 
        SET responsable = 'Conductor' 
        WHERE TRIM(UPPER(responsable)) IN ('CONCUDTOR', 'CONDUCTOR')
    `);

    // 2. Corregir 'FALLA MECANICA', 'Falla Mecanica' a 'Falla Mecánica'
    await conn.query(`
        UPDATE mant_incidencias_ruta 
        SET responsable = 'Falla Mecánica' 
        WHERE TRIM(UPPER(responsable)) = 'FALLA MECANICA'
    `);

    // 3. Corregir 'GARANTIA' a 'Garantía'
    await conn.query(`
        UPDATE mant_incidencias_ruta 
        SET responsable = 'Garantía' 
        WHERE TRIM(UPPER(responsable)) = 'GARANTIA'
    `);

    const [rows] = await conn.query('SELECT responsable, COUNT(*) as c FROM mant_incidencias_ruta GROUP BY responsable ORDER BY c DESC');
    console.log('Responsables corregidos y estandarizados:', rows);
    await conn.end();
}
fixTypos();
