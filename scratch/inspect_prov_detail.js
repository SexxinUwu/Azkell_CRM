const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306
    });

    const dbs = ['azkell_tenant_marsisa', 'azkell_tenant_rosymarperu', 'azkell_tenant_yoguitransport', 'azkell_tenant_trahesa'];

    for (const db of dbs) {
        console.log(`\n=== DATABASE: ${db} ===`);
        const [prov] = await conn.query(`SELECT * FROM \`${db}\`.proveedores_inv`);
        console.log(`proveedores_inv count: ${prov.length}`);
        if (prov.length > 0 && prov.length <= 5) {
            console.log('Rows:', prov);
        }

        const [marcas] = await conn.query(`SELECT * FROM \`${db}\`.proveedor_marcas_inv`);
        console.log(`proveedor_marcas_inv count: ${marcas.length}`);
        if (marcas.length > 0) {
            console.log('Marcas:', marcas);
        }

        const [cuentas] = await conn.query(`SELECT * FROM \`${db}\`.proveedor_cuentas_bancarias`);
        console.log(`proveedor_cuentas_bancarias count: ${cuentas.length}`);
        if (cuentas.length > 0) {
            console.log('Cuentas:', cuentas);
        }

        const [estaciones] = await conn.query(`SELECT COUNT(*) as c FROM \`${db}\`.combustible_estaciones_proveedores`);
        console.log(`combustible_estaciones_proveedores count: ${estaciones[0].c}`);
    }

    await conn.end();
}
run().catch(console.error);
