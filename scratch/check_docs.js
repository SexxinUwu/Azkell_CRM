const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkDocs() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306
    });

    const [docsY] = await conn.query('SELECT COUNT(*) as c FROM `azkell_tenant_yoguitransport`.`documentos_flota`');
    console.log('documentos_flota in yogui:', docsY[0].c);

    if (docsY[0].c > 0) {
        const [docs] = await conn.query('SELECT placa, tipo_documento, numero_documento, fecha_vencimiento, archivo_url FROM `azkell_tenant_yoguitransport`.`documentos_flota`');
        console.table(docs);
    }

    const [cfgFlota] = await conn.query('SELECT COUNT(*) as c FROM `azkell_tenant_yoguitransport`.`configuracion_flota`');
    console.log('configuracion_flota in yogui:', cfgFlota[0].c);

    await conn.end();
}

checkDocs().catch(console.error);
