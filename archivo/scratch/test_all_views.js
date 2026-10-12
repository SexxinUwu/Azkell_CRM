const mysql = require('mysql2/promise');

async function testAllViews() {
    const config = {
        host: process.env.REMOTE_FUEL_HOST,
        user: process.env.REMOTE_FUEL_USER,
        password: process.env.REMOTE_FUEL_PASSWORD,
        database: 'marsisa_promax',
        connectTimeout: 15000
    };

    const conn = await mysql.createConnection(config);
    console.log('Conectado a marsisa_promax.');

    const viewsToCheck = [
        'vw_combustible_vale',
        'vw_combustible_estacion',
        'vw_combustible_orden_viaje',
        'vw_combustible_orden_viaje_ruta',
        'vw_combustible_compra_externa',
        'vw_combustible_compra_externa_detalle',
        'vw_combustible_periodo_sincronizacion',
        'vw_combustible_rendimiento'
    ];

    for (const v of viewsToCheck) {
        try {
            const [res] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${v}\``);
            console.log(`✅ [${v}]: ${res[0].cnt} registros`);
        } catch (e) {
            console.error(`❌ [${v}]: ${e.message}`);
        }
    }

    await conn.end();
}

testAllViews();
