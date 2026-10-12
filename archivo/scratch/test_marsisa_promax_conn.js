const mysql = require('mysql2/promise');

async function testConnection() {
    const config = {
        host: process.env.REMOTE_FUEL_HOST || '168.231.98.23',
        user: process.env.REMOTE_FUEL_USER || 'prov_combustible',
        password: process.env.REMOTE_FUEL_PASSWORD || '32f2dc8b2b27fc021c81674c04c2326e',
        database: 'marsisa_promax',
        connectTimeout: 15000
    };

    console.log(`Intentando conectar a ${config.host} / BD: ${config.database} con usuario ${config.user}...`);

    try {
        const conn = await mysql.createConnection(config);
        console.log('✅ Conexión establecida exitosamente con marsisa_promax!');

        // Listar tablas y vistas
        const [tables] = await conn.query('SHOW FULL TABLES');
        console.log('\nTablas y Vistas disponibles en marsisa_promax:');
        console.table(tables);

        // Contar vales en vw_combustible_vale si existe
        try {
            const [vales] = await conn.query('SELECT COUNT(*) as count FROM vw_combustible_vale');
            console.log(`\n✅ vw_combustible_vale: ${vales[0].count} registros encontrados.`);
        } catch (e) {
            console.log('Error consultando vw_combustible_vale:', e.message);
        }

        // Consultar últimos vales
        try {
            const [rows] = await conn.query('SELECT * FROM vw_combustible_vale ORDER BY fecha DESC LIMIT 3');
            console.log('\nÚltimos 3 vales:', rows);
        } catch (e) {
            console.log('Error leyendo registros de vw_combustible_vale:', e.message);
        }

        // Verificar vistas de viajes si existen
        try {
            const [ov] = await conn.query('SELECT COUNT(*) as count FROM vw_ordenes_viaje');
            console.log(`\n✅ vw_ordenes_viaje: ${ov[0].count} registros encontrados.`);
        } catch (e) {
            console.log('Nota sobre vw_ordenes_viaje:', e.message);
        }

        await conn.end();
    } catch (err) {
        console.error('❌ Error conectando a marsisa_promax:', err.message);
    }
}

testConnection();
