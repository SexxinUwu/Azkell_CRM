const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306,
        database: 'azkell_tenant_marsisa'
    });

    const [tokenRows] = await conn.query("SELECT valor FROM integraciones_api WHERE clave = 'wialon_token' LIMIT 1");
    const [urlRows] = await conn.query("SELECT valor FROM integraciones_api WHERE clave = 'wialon_url' LIMIT 1");
    
    const token = (tokenRows[0] && tokenRows[0].valor) || process.env.WIALON_TOKEN;
    const baseUrl = (urlRows[0] && urlRows[0].valor) || 'https://hst-api.wialon.us/wialon/ajax.html';

    const loginRes = await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({token: token}))}`);
    const loginData = await loginRes.json();
    const sid = loginData.eid;
    const searchParams = { "spec": { "itemsType": "avl_unit", "propName": "sys_name", "propValueMask": "*", "sortType": "sys_name" }, "force": 1, "flags": 9221, "from": 0, "to": 0 };
    
    const searchRes = await fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(searchParams))}&sid=${sid}`);
    const searchData = await searchRes.json();

    console.log('All Wialon Units count:', searchData.items ? searchData.items.length : 0);
    if (searchData.items) {
        searchData.items.forEach(i => {
            console.log(`- nm: "${i.nm}" | cnm_km: ${i.cnm_km} | cneh: ${i.cneh}`);
        });
    }

    await conn.end();
}
run().catch(console.error);
