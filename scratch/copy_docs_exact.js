const mysql = require('mysql2/promise');
require('dotenv').config();

async function copyDocsExact() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306
    });

    const [docsY] = await conn.query('SELECT * FROM `azkell_tenant_yoguitransport`.`documentos_flota`');
    let inserted = 0;
    for (const d of docsY) {
        const [exists] = await conn.query(
            'SELECT 1 FROM `azkell_tenant_marsisa`.`documentos_flota` WHERE UPPER(TRIM(placa)) = UPPER(TRIM(?)) AND UPPER(TRIM(tipo_documento)) = UPPER(TRIM(?))',
            [d.placa, d.tipo_documento]
        );
        if (!exists.length) {
            const newId = `DOC-${Date.now()}-${Math.floor(Math.random()*10000)}`;
            await conn.query(`
                INSERT INTO \`azkell_tenant_marsisa\`.\`documentos_flota\`
                (id, placa, tipo_documento, entidad, nro_constancia, fecha_emision, fecha_vencimiento, pago, asesor, observaciones, usuario)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                newId,
                d.placa,
                d.tipo_documento,
                d.entidad || null,
                d.nro_constancia || null,
                d.fecha_emision || null,
                d.fecha_vencimiento || null,
                d.pago || null,
                d.asesor || null,
                d.observaciones || '',
                d.usuario || 'migracion'
            ]);
            inserted++;
        }
    }
    console.log(`✅ [documentos_flota] Insertados en Marsisa: ${inserted}`);

    await conn.end();
}

copyDocsExact().catch(console.error);
