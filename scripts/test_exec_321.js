require('dotenv').config();
const mysql = require('mysql2/promise');

async function testExec321() {
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

        const loginRes = await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token }))}`);
        const loginData = await loginRes.json();
        const sid = loginData.eid;

        // Buscar una unidad para probar (ej. BEQ886)
        const unitParams = {
            spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*BEQ886*', sortType: 'sys_name' },
            force: 1, flags: 1, from: 0, to: 1
        };
        const unitRes = await fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(unitParams))}&sid=${sid}`);
        const unitData = await unitRes.json();
        const unitId = unitData.items[0].id;

        console.log(`Unidad probada: ${unitData.items[0].nm} (ID: ${unitId})`);

        // Ejecutar Informe 84 ("3.2.1 Informe: Viajes - Unidad CAN") para los últimos 3 días
        const now = Math.floor(Date.now() / 1000);
        const fromUnix = now - (3 * 86400);

        const execParams = {
            reportResourceId: 400097667,
            reportTemplateId: 84,
            reportObjectId: unitId,
            reportObjectSecId: 0,
            interval: { from: fromUnix, to: now, flags: 0 }
        };

        const execRes = await fetch(`${baseUrl}?svc=report/exec_report&params=${encodeURIComponent(JSON.stringify(execParams))}&sid=${sid}`);
        const execData = await execRes.json();

        console.log('\n================ RESULTADO DE EJECUCIÓN INFORME 3.2.1 ================');
        console.log('Stats (Estadísticas Resumen):', JSON.stringify(execData.reportResult?.stats, null, 2));
        console.log('\nTablas del Informe Resultante:', JSON.stringify(execData.reportResult?.tables, null, 2));

        // Si hay tablas, traer los encabezados y filas
        if (execData.reportResult?.tables && execData.reportResult.tables.length > 0) {
            for (let tIdx = 0; tIdx < execData.reportResult.tables.length; tIdx++) {
                const tbl = execData.reportResult.tables[tIdx];
                console.log(`\n--- TABLA ${tIdx}: ${tbl.name} (${tbl.label}) - Total Filas: ${tbl.rows} ---`);
                console.log('Columnas / Headers:', tbl.header);

                // Obtener primeras 3 filas
                if (tbl.rows > 0) {
                    const rowParams = {
                        tableIndex: tIdx,
                        config: {
                            type: 'range',
                            data: { from: 0, to: Math.min(tbl.rows - 1, 2), level: 0 }
                        }
                    };
                    const rowRes = await fetch(`${baseUrl}?svc=report/get_result_rows&params=${encodeURIComponent(JSON.stringify(rowParams))}&sid=${sid}`);
                    const rowData = await rowRes.json();
                    console.log('Muestra de datos:', JSON.stringify(rowData, null, 2));
                }
            }
        }

        await fetch(`${baseUrl}?svc=core/logout&params=%7B%7D&sid=${sid}`).catch(() => {});
    } catch (err) {
        console.error('Error:', err);
    }
}

testExec321();
