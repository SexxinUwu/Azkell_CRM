require('dotenv').config();
const mysql = require('mysql2/promise');

async function inspectPlantilla84() {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            port: Number(process.env.DB_PORT) || 3306,
            database: 'azkell_tenant_rosymarperu'
        });

        const [rows] = await conn.query("SELECT clave, valor FROM integraciones_api WHERE clave IN ('wialon_token', 'wialon_url')");
        await conn.end();

        let token = '';
        let baseUrl = 'https://hst-api.wialon.us/wialon/ajax.html';

        rows.forEach(r => {
            if (r.clave === 'wialon_token' && r.valor) token = r.valor.trim();
            if (r.clave === 'wialon_url' && r.valor) baseUrl = r.valor.trim();
        });

        // Login
        const loginRes = await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token }))}`);
        const loginData = await loginRes.json();
        const sid = loginData.eid;

        const resParams = {
            spec: {
                itemsType: 'avl_resource',
                propName: 'sys_name',
                propValueMask: '*',
                sortType: 'sys_name'
            },
            force: 1,
            flags: 8193,
            from: 0,
            to: 0
        };
        const resRes = await fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(resParams))}&sid=${sid}`);
        const resData = await resRes.json();

        const resource = resData.items.find(r => r.id === 400097667);
        const rep84 = resource.rep['84'];
        const rep67 = resource.rep['67']; // 25.Informe de Combustible
        const rep55 = resource.rep['55']; // 25.1.Informe de Combustible

        console.log('================ DETALLE INFORME 3.2.1 (ID 84) ================');
        console.log(JSON.stringify(rep84, null, 2));

        console.log('\n================ DETALLE INFORME 25 (ID 67) ================');
        console.log(JSON.stringify(rep67, null, 2));

        await fetch(`${baseUrl}?svc=core/logout&params=%7B%7D&sid=${sid}`).catch(() => {});
    } catch (err) {
        console.error('Error:', err);
    }
}

inspectPlantilla84();
