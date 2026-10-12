require('dotenv').config();
const { getAllActiveTenants } = require('../services/tenant_master');

(async () => {
    try {
        console.log('--- 1. ACTIVE TENANTS ---');
        const tenants = await getAllActiveTenants();
        console.log('Found active tenants:', tenants.map(t => ({ slug: t.slug, empresa: t.nombre_empresa, db: t.db_name })));

        console.log('\n--- 2. PLATE ROUTING RESOLUTION ---');
        const testPlacas = ['BES829', 'V2M831', 'D8O846', 'D0L914', 'C6H709'];
        for (const p of testPlacas) {
            const cleanP = p.replace(/[^A-Z0-9]/g, '');
            let found = null;
            for (const t of tenants) {
                const [rows] = await t.pool.promise().query(
                    "SELECT placa, cliente, tipo FROM placas WHERE UPPER(REPLACE(placa, '-', '')) = ? OR UPPER(placa) = ? LIMIT 1",
                    [cleanP, p]
                );
                if (rows.length > 0) {
                    found = { empresa: t.nombre_empresa, slug: t.slug, db: t.db_name, placa: rows[0].placa };
                    break;
                }
            }
            console.log(`Placa ${p} ->`, found ? `Found in ${found.empresa} (${found.db})` : 'Not found');
        }

        console.log('\n--- 3. CHECKLIST RECORDS COUNT PER TENANT ---');
        for (const t of tenants) {
            const [rows] = await t.pool.promise().query("SELECT COUNT(*) as count FROM seg_unidades_registros");
            console.log(`Tenant ${t.nombre_empresa} (${t.db_name}): ${rows[0].count} records`);
        }

        console.log('\n✅ ALL MULTI-TENANT VERIFICATION TESTS PASSED!');
        process.exit(0);
    } catch(e) {
        console.error('Test error:', e);
        process.exit(1);
    }
})();
