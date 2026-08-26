require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkWialonTemplates() {
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

        let token = process.env.WIALON_TOKEN || '';
        let baseUrl = process.env.WIALON_BASE_URL || 'https://hst-api.wialon.us/wialon/ajax.html';

        rows.forEach(r => {
            if (r.clave === 'wialon_token' && r.valor) token = r.valor.trim();
            if (r.clave === 'wialon_url' && r.valor) baseUrl = r.valor.trim();
        });

        console.log('Token obtenido:', token ? `PRESENTE (${token.substring(0, 10)}...)` : 'FALTANTE');
        console.log('Base URL:', baseUrl);

        if (!token) {
            console.error('No hay token configurado ni en DB ni en .env');
            return;
        }

        // Login
        const loginRes = await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token }))}`);
        const loginData = await loginRes.json();
        console.log('Login Wialon EID/SID:', loginData.eid);

        const sid = loginData.eid;
        if (!sid) {
            console.error('Error en login:', loginData);
            return;
        }

        // Buscar recursos con plantillas de informes
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

        console.log('\n================ TODOS LOS INFORMES CONFIGURADOS EN WIALON ================');
        let allTemplates = [];

        if (resData.items) {
            resData.items.forEach(r => {
                console.log(`\n📦 Recurso ID: ${r.id} | Nombre: "${r.nm}"`);
                if (r.rep) {
                    Object.values(r.rep).forEach(rep => {
                        console.log(`   📄 [ID: ${rep.id}] "${rep.n}" (Tipo de Objeto: ${rep.ct})`);
                        allTemplates.push({
                            recursoId: r.id,
                            recursoNombre: r.nm,
                            plantillaId: rep.id,
                            plantillaNombre: rep.n,
                            tipoObjeto: rep.ct,
                            tablas: (rep.tbl || []).map(t => ({ nombre: t.n, tipo: t.t, columnas: t.c }))
                        });
                        if (rep.tbl && rep.tbl.length > 0) {
                            rep.tbl.forEach((t, idx) => {
                                console.log(`       📊 Tabla ${idx + 1}: "${t.n}" (Tipo: ${t.t}, Columnas: ${t.c || ''})`);
                            });
                        }
                    });
                }
            });
        }

        console.log('\n================ RESUMEN DE TODAS LAS PLANTILLAS ================');
        allTemplates.forEach(t => {
            console.log(`- Recurso: [${t.recursoId}] ${t.recursoNombre} -> Plantilla: [${t.plantillaId}] "${t.plantillaNombre}"`);
        });

        await fetch(`${baseUrl}?svc=core/logout&params=%7B%7D&sid=${sid}`).catch(() => {});
    } catch (err) {
        console.error('Error:', err);
    }
}

checkWialonTemplates();
