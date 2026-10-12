const mysql = require('mysql2/promise');
require('dotenv').config();

async function runCopy() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306
    });

    console.log('=== 1. COPIANDO PLACAS DE YOGUI A MARSISA ===');
    // Obtener columnas de placas en marsisa
    const [colsPlacasM] = await conn.query('SHOW COLUMNS FROM `azkell_tenant_marsisa`.`placas`');
    const colsP = colsPlacasM.map(c => `\`${c.Field}\``).join(', ');

    const [resPlacas] = await conn.query(`
        INSERT INTO \`azkell_tenant_marsisa\`.\`placas\` (${colsP})
        SELECT ${colsP} FROM \`azkell_tenant_yoguitransport\`.\`placas\` y
        WHERE NOT EXISTS (
            SELECT 1 FROM \`azkell_tenant_marsisa\`.\`placas\` m 
            WHERE UPPER(TRIM(m.placa)) = UPPER(TRIM(y.placa))
        )
    `);
    console.log(`✅ Placas insertadas en Marsisa: ${resPlacas.affectedRows}`);

    console.log('\n=== 2. COPIANDO VEHICULOS_FLOTA DE YOGUI A MARSISA ===');
    const [colsVehicM] = await conn.query('SHOW COLUMNS FROM `azkell_tenant_marsisa`.`vehiculos_flota`');
    const colsV = colsVehicM.map(c => `\`${c.Field}\``).join(', ');

    const [resVehic] = await conn.query(`
        INSERT INTO \`azkell_tenant_marsisa\`.\`vehiculos_flota\` (${colsV})
        SELECT ${colsV} FROM \`azkell_tenant_yoguitransport\`.\`vehiculos_flota\` y
        WHERE NOT EXISTS (
            SELECT 1 FROM \`azkell_tenant_marsisa\`.\`vehiculos_flota\` m 
            WHERE UPPER(TRIM(m.placa)) = UPPER(TRIM(y.placa))
        )
    `);
    console.log(`✅ Vehículos de flota insertados en Marsisa: ${resVehic.affectedRows}`);

    console.log('\n=== 3. COPIANDO DOCUMENTOS_FLOTA DE YOGUI A MARSISA ===');
    try {
        const [colsDocsM] = await conn.query('SHOW COLUMNS FROM `azkell_tenant_marsisa`.`documentos_flota`');
        const [colsDocsY] = await conn.query('SHOW COLUMNS FROM `azkell_tenant_yoguitransport`.`documentos_flota`');
        const setY = new Set(colsDocsY.map(c => c.Field));
        const commonCols = colsDocsM.filter(c => setY.has(c.Field) && c.Field !== 'id').map(c => `\`${c.Field}\``);
        const colsD = commonCols.join(', ');

        const [resDocs] = await conn.query(`
            INSERT INTO \`azkell_tenant_marsisa\`.\`documentos_flota\` (${colsD})
            SELECT ${colsD} FROM \`azkell_tenant_yoguitransport\`.\`documentos_flota\` y
            WHERE NOT EXISTS (
                SELECT 1 FROM \`azkell_tenant_marsisa\`.\`documentos_flota\` m 
                WHERE UPPER(TRIM(m.placa)) = UPPER(TRIM(y.placa))
                  AND UPPER(TRIM(m.tipo_documento)) = UPPER(TRIM(y.tipo_documento))
            )
        `);
        console.log(`✅ Documentos de flota insertados en Marsisa: ${resDocs.affectedRows}`);
    } catch(e) {
        console.log('Nota documentos_flota:', e.message);
    }

    console.log('\n=== RESUMEN TOTAL FINAL EN MARSISA ===');
    const [finalP] = await conn.query('SELECT COUNT(*) as c FROM `azkell_tenant_marsisa`.`placas`');
    const [finalV] = await conn.query('SELECT COUNT(*) as c FROM `azkell_tenant_marsisa`.`vehiculos_flota`');
    console.log(`Total placas en Marsisa: ${finalP[0].c}`);
    console.log(`Total vehículos flota en Marsisa: ${finalV[0].c}`);

    const [nuevasPlacas] = await conn.query(`
        SELECT placa, cliente, marca, modelo_uts, tipo, configuracion 
        FROM \`azkell_tenant_marsisa\`.\`placas\` 
        WHERE placa IN ('ACE872', 'B0O835', 'BTU999', 'BUR976', 'CFS826', 'CFU749', 'D0L914', 'D8O846', 'F4X988')
    `);
    console.table(nuevasPlacas);

    await conn.end();
}

runCopy().catch(console.error);
