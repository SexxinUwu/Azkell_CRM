const mysql = require('mysql2/promise');
require('dotenv').config();

async function testWialon() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: 'azkell_tenant_marsisa',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
    });

    const [tokenRows] = await conn.query("SELECT valor FROM integraciones_api WHERE clave = 'wialon_token' LIMIT 1");
    const token = (tokenRows && tokenRows[0] && tokenRows[0].valor) ? tokenRows[0].valor.trim() : process.env.WIALON_TOKEN;
    console.log('Wialon Token found:', !!token, token ? token.substring(0, 10) + '...' : 'none');

    const [urlRows] = await conn.query("SELECT valor FROM integraciones_api WHERE clave = 'wialon_url' LIMIT 1");
    const baseUrl = (urlRows && urlRows[0] && urlRows[0].valor) ? urlRows[0].valor.trim() : 'https://hst-api.wialon.us/wialon/ajax.html';
    console.log('Wialon Base URL:', baseUrl);

    if (token) {
        const loginUrl = `${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({token}))}`;
        const loginRes = await fetch(loginUrl);
        const loginData = await loginRes.json();
        console.log('Wialon Login success:', !!loginData.eid);

        if (loginData.eid) {
            const sid = loginData.eid;
            const searchParams = { "spec": { "itemsType": "avl_unit", "propName": "sys_name", "propValueMask": "*", "sortType": "sys_name" }, "force": 1, "flags": 9221, "from": 0, "to": 0 };
            const groupParams = { "spec": { "itemsType": "avl_unit_group", "propName": "sys_name", "propValueMask": "*", "sortType": "sys_name" }, "force": 1, "flags": 1, "from": 0, "to": 0 };

            const [searchRes, groupRes] = await Promise.all([
                fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(searchParams))}&sid=${sid}`),
                fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(groupParams))}&sid=${sid}`)
            ]);

            const searchData = await searchRes.json();
            const groupData = await groupRes.json();

            console.log('Total Units fetched from Wialon:', searchData.items ? searchData.items.length : 0);
            console.log('Total Groups fetched from Wialon:', groupData.items ? groupData.items.length : 0);
            if (searchData.items && searchData.items.length > 0) {
                const sample = searchData.items[0];
                console.log('Sample Unit:', { id: sample.id, nm: sample.nm, pos: sample.pos });
            }
        }
    }

    await conn.end();
}

testWialon().catch(console.error);
