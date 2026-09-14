const mysql = require('mysql2/promise');
require('dotenv').config();

const dbName = 'azkell_tenant_yoguitransport';

async function inspect() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: dbName,
        port: process.env.DB_PORT || 3306
    });

    console.log('=== OS ===');
    const [os] = await conn.query('SELECT * FROM operaciones_ordenes_servicio');
    console.table(os.map(r => ({ id: r.id, codigo_orden: r.codigo_orden, viaje_asignado: r.viaje_asignado, cliente_nombre: r.cliente_nombre })));

    console.log('=== OS RUTAS ===');
    const [rutas] = await conn.query('SELECT * FROM operaciones_ordenes_servicio_rutas');
    console.log(rutas);

    console.log('=== OS DOCS ===');
    const [docs] = await conn.query('SELECT * FROM operaciones_ordenes_servicio_docs');
    console.log(docs);

    console.log('=== TESORERIA CUENTAS ===');
    const [hasTc] = await conn.query("SHOW TABLES LIKE 'tesoreria_cuentas'");
    if (hasTc.length > 0) {
        const [tc] = await conn.query('SELECT id, orden_servicio, numero_viaje, cliente, estado_servicio FROM tesoreria_cuentas');
        console.table(tc);
    }

    console.log('=== CAJA CHICA / CAJAS ===');
    const [tablesCaja] = await conn.query("SHOW TABLES LIKE '%caja%'");
    console.log('Caja tables:', tablesCaja);
    for (const t of tablesCaja) {
        const tName = Object.values(t)[0];
        const [rows] = await conn.query(`SELECT * FROM \`${tName}\``);
        console.log(`Table ${tName}:`, rows.length, 'rows');
        if (rows.length > 0) console.table(rows);
    }

    console.log('=== LIQUIDACION / GASTOS ===');
    const [tablesLiq] = await conn.query("SHOW TABLES LIKE '%liquidac%'");
    console.log('Liquidacion tables:', tablesLiq);
    for (const t of tablesLiq) {
        const tName = Object.values(t)[0];
        const [rows] = await conn.query(`SELECT * FROM \`${tName}\``);
        console.log(`Table ${tName}:`, rows.length, 'rows');
        if (rows.length > 0) console.table(rows);
    }

    console.log('=== ORDENES DE VIAJE ===');
    const [tablesOV] = await conn.query("SHOW TABLES LIKE '%ordenes_viaje%'");
    console.log('OV tables:', tablesOV);
    for (const t of tablesOV) {
        const tName = Object.values(t)[0];
        const [rows] = await conn.query(`SELECT * FROM \`${tName}\``);
        console.log(`Table ${tName}:`, rows.length, 'rows');
        if (rows.length > 0) console.table(rows);
    }

    await conn.end();
}

inspect().catch(console.error);
