const mysql = require('mysql2/promise');
require('dotenv').config();

async function copyDocs() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306
    });

    const [colsDocsM] = await conn.query('SHOW COLUMNS FROM `azkell_tenant_marsisa`.`documentos_flota`');
    console.log('Marsisa docs cols:', colsDocsM);

    const [colsDocsY] = await conn.query('SHOW COLUMNS FROM `azkell_tenant_yoguitransport`.`documentos_flota`');
    console.log('Yogui docs cols:', colsDocsY);

    // Obtener los documentos de Yogui
    const [docsY] = await conn.query('SELECT * FROM `azkell_tenant_yoguitransport`.`documentos_flota`');
    console.log(`Documentos encontrados en Yogui: ${docsY.length}`);

    // Obtener max id en marsisa
    const [maxIdRow] = await conn.query('SELECT MAX(id) as max_id FROM `azkell_tenant_marsisa`.`documentos_flota`');
    let curId = (maxIdRow[0].max_id || 0);

    let inserted = 0;
    for (const doc of docsY) {
        // Verificar si ya existe en Marsisa
        const [exists] = await conn.query(
            'SELECT 1 FROM `azkell_tenant_marsisa`.`documentos_flota` WHERE UPPER(TRIM(placa)) = UPPER(TRIM(?)) AND UPPER(TRIM(tipo_documento)) = UPPER(TRIM(?))',
            [doc.placa, doc.tipo_documento]
        );

        if (!exists.length) {
            curId++;
            await conn.query(`
                INSERT INTO \`azkell_tenant_marsisa\`.\`documentos_flota\`
                (id, placa, tipo_documento, fecha_emision, fecha_vencimiento, archivo_url, notas, estado, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                curId,
                doc.placa,
                doc.tipo_documento,
                doc.fecha_emision || null,
                doc.fecha_vencimiento || null,
                doc.archivo_url || null,
                doc.notas || '',
                doc.estado || 'Activo',
                doc.created_at || new Date(),
                doc.updated_at || new Date()
            ]);
            inserted++;
        }
    }

    console.log(`✅ Documentos de flota insertados en Marsisa: ${inserted}`);

    await conn.end();
}

copyDocs().catch(console.error);
