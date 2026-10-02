const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectTables() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306
    });

    console.log('=== COUNT IN YOGUI TRANSPORT ===');
    const [cntPlacasY] = await conn.query('SELECT COUNT(*) as c FROM `azkell_tenant_yoguitransport`.`placas`');
    console.log('placas in yogui:', cntPlacasY[0].c);

    const [cntVehicY] = await conn.query('SELECT COUNT(*) as c FROM `azkell_tenant_yoguitransport`.`vehiculos_flota`');
    console.log('vehiculos_flota in yogui:', cntVehicY[0].c);

    const [cntDispY] = await conn.query('SELECT COUNT(*) as c FROM `azkell_tenant_yoguitransport`.`flota_disponibilidad`');
    console.log('flota_disponibilidad in yogui:', cntDispY[0].c);

    console.log('\n=== COUNT IN MARSISA ===');
    const [cntPlacasM] = await conn.query('SELECT COUNT(*) as c FROM `azkell_tenant_marsisa`.`placas`');
    console.log('placas in marsisa:', cntPlacasM[0].c);

    const [cntVehicM] = await conn.query('SELECT COUNT(*) as c FROM `azkell_tenant_marsisa`.`vehiculos_flota`');
    console.log('vehiculos_flota in marsisa:', cntVehicM[0].c);

    const [cntDispM] = await conn.query('SELECT COUNT(*) as c FROM `azkell_tenant_marsisa`.`flota_disponibilidad`');
    console.log('flota_disponibilidad in marsisa:', cntDispM[0].c);

    console.log('\n=== PLACAS COLUMNS ===');
    const [colsPlacasY] = await conn.query('SHOW COLUMNS FROM `azkell_tenant_yoguitransport`.`placas`');
    console.log('placas cols:', colsPlacasY.map(c => c.Field));

    console.log('\n=== SAMPLE PLACAS IN YOGUI ===');
    const [samplePlacas] = await conn.query('SELECT * FROM `azkell_tenant_yoguitransport`.`placas` LIMIT 3');
    console.log(samplePlacas);

    console.log('\n=== VEHICULOS_FLOTA COLS ===');
    const [colsVehicY] = await conn.query('SHOW COLUMNS FROM `azkell_tenant_yoguitransport`.`vehiculos_flota`');
    console.log('vehiculos_flota cols:', colsVehicY.map(c => c.Field));

    console.log('\n=== SAMPLE VEHICULOS_FLOTA IN YOGUI ===');
    const [sampleVehic] = await conn.query('SELECT * FROM `azkell_tenant_yoguitransport`.`vehiculos_flota` LIMIT 3');
    console.log(sampleVehic);

    await conn.end();
}

inspectTables().catch(console.error);
