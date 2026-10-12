const { getTenantPool } = require('../services/tenant_master');

(async () => {
    try {
        console.log('--- TEST OPERACIONES GARITA SOBRE MARSISA DB ---');
        const pool = getTenantPool('azkell_tenant_marsisa');
        const pDb = pool.promise();

        // 1. Placas y empresas
        const [placas] = await pDb.query('SELECT placa, cliente FROM placas');
        console.log(`Total placas en BD: ${placas.length}`);

        // 2. Stats
        const [stats] = await pDb.query(`
            SELECT 
                COUNT(*) as total,
                COALESCE(SUM(CASE WHEN estado = 'en_ruta' THEN 1 ELSE 0 END), 0) as en_ruta,
                COALESCE(SUM(CASE WHEN estado = 'completado' THEN 1 ELSE 0 END), 0) as completados,
                COALESCE(SUM(CASE WHEN salida_has_alert = 1 OR retorno_has_alert = 1 THEN 1 ELSE 0 END), 0) as alertas
            FROM seg_unidades_registros
        `);
        console.log('Estadísticas globales:', stats[0]);

        // 3. Últimos registros
        const [reg] = await pDb.query('SELECT id, placa_tracto, placa_carreta, conductor, estado, salida_fecha FROM seg_unidades_registros ORDER BY id DESC LIMIT 5');
        console.log('Últimos 5 registros:');
        console.table(reg);

        console.log('✅ TODO OPERANDO AL 100% SOBRE LA BD DE MARSISA');
        process.exit(0);
    } catch(e) {
        console.error('Error:', e);
        process.exit(1);
    }
})();
