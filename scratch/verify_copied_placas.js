const mysql = require('mysql2/promise');
require('dotenv').config();

async function verify() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306
    });

    const [rows] = await conn.query(`
        SELECT p.placa, p.cliente, p.marca, p.modelo_uts, p.tipo, p.configuracion, p.estado
        FROM \`azkell_tenant_marsisa\`.\`placas\` p
        WHERE p.placa IN ('ACE872', 'B0O835', 'BTU999', 'BUR976', 'CFS826', 'CFU749', 'D0L914', 'D8O846', 'F4X988')
        ORDER BY p.placa
    `);

    console.log('=== 9 PLACAS DE YOGUI EN MARSISA ===');
    console.table(rows);

    const [cntP] = await conn.query('SELECT COUNT(*) as c FROM `azkell_tenant_marsisa`.`placas`');
    const [cntV] = await conn.query('SELECT COUNT(*) as c FROM `azkell_tenant_marsisa`.`vehiculos_flota`');
    const [cntD] = await conn.query('SELECT COUNT(*) as c FROM `azkell_tenant_marsisa`.`documentos_flota`');

    console.log(`\nTotales en Marsisa:`);
    console.log(`- Placas: ${cntP[0].c}`);
    console.log(`- Vehículos de flota: ${cntV[0].c}`);
    console.log(`- Documentos de flota: ${cntD[0].c}`);

    await conn.end();
}

verify().catch(console.error);
