const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { getTenantPool } = require(path.join(__dirname, '../services/tenant_master'));

(async () => {
    try {
        const tdb = getTenantPool('azkell_tenant_yoguitransport').promise();
        const [vf] = await tdb.query("SELECT * FROM vehiculos_flota WHERE placa LIKE '%D8O846%'");
        console.log('VEHICULOS_FLOTA:');
        console.log(JSON.stringify(vf, null, 2));
        
        const [docs] = await tdb.query("SELECT * FROM documentos_flota WHERE placa LIKE '%D8O846%'");
        console.log('DOCUMENTOS_FLOTA:');
        console.log(JSON.stringify(docs, null, 2));
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
