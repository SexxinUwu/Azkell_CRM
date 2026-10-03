const { getTenantPool } = require('../services/tenant_master');

(async () => {
    const pool = getTenantPool('azkell_tenant_marsisa');
    const [empRows] = await pool.promise().query('SELECT cliente, COUNT(*) as cnt FROM placas GROUP BY cliente');
    console.log('--- EMPRESAS EN PLACAS (MARSISA DB) ---');
    console.table(empRows);

    const [regStats] = await pool.promise().query(`
        SELECT 
            COUNT(*) as total, 
            SUM(CASE WHEN estado = 'en_ruta' THEN 1 ELSE 0 END) as en_ruta, 
            SUM(CASE WHEN estado = 'completado' THEN 1 ELSE 0 END) as comp, 
            SUM(CASE WHEN salida_has_alert = 1 OR retorno_has_alert = 1 THEN 1 ELSE 0 END) as alertas 
        FROM seg_unidades_registros
    `);
    console.log('\n--- REGISTROS EN GARITA (MARSISA DB) ---');
    console.table(regStats);
    process.exit(0);
})();
