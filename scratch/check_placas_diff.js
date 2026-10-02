const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkPlacasDiff() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306
    });

    const [yoguiPlacas] = await conn.query('SELECT placa, cliente, marca, modelo_uts, tipo, configuracion FROM `azkell_tenant_yoguitransport`.`placas`');
    console.log('=== 9 PLACAS EN YOGUI ===');
    console.table(yoguiPlacas);

    const [marsisaPlacas] = await conn.query('SELECT placa FROM `azkell_tenant_marsisa`.`placas`');
    const marsisaSet = new Set(marsisaPlacas.map(p => (p.placa || '').toUpperCase().trim()));

    console.log('=== COMPARACIÓN CON MARSISA (placas) ===');
    yoguiPlacas.forEach(p => {
        const existe = marsisaSet.has((p.placa || '').toUpperCase().trim());
        console.log(`Placa ${p.placa}: ${existe ? 'YA EXISTE en Marsisa' : 'NUEVA (se copiará)'}`);
    });

    const [yoguiVehic] = await conn.query('SELECT placa, empresa, marca, modelo, tc_constancia FROM `azkell_tenant_yoguitransport`.`vehiculos_flota`');
    console.log('\n=== 8 VEHICULOS EN YOGUI ===');
    console.table(yoguiVehic);

    const [marsisaVehic] = await conn.query('SELECT placa FROM `azkell_tenant_marsisa`.`vehiculos_flota`');
    const marsisaVehicSet = new Set(marsisaVehic.map(p => (p.placa || '').toUpperCase().trim()));

    console.log('=== COMPARACIÓN CON MARSISA (vehiculos_flota) ===');
    yoguiVehic.forEach(v => {
        const existe = marsisaVehicSet.has((v.placa || '').toUpperCase().trim());
        console.log(`Vehiculo ${v.placa}: ${existe ? 'YA EXISTE en Marsisa' : 'NUEVO (se copiará)'}`);
    });

    await conn.end();
}

checkPlacasDiff().catch(console.error);
