const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkDatabases() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
    });

    const [dbs] = await conn.query('SHOW DATABASES');
    console.log('Databases:', dbs.map(d => Object.values(d)[0]));

    for (const d of dbs) {
        const dbName = Object.values(d)[0];
        if (dbName.startsWith('azkell')) {
            try {
                const [r1] = await conn.query(`SELECT count(*) as c FROM \`${dbName}\`.ordenes_trabajo`);
                console.log(`[${dbName}] ordenes_trabajo:`, r1[0].c);
            } catch(e){}
            try {
                const [r2] = await conn.query(`SELECT count(*) as c FROM \`${dbName}\`.reportes_fallas`);
                console.log(`[${dbName}] reportes_fallas:`, r2[0].c);
            } catch(e){}
            try {
                const [r3] = await conn.query(`SELECT count(*) as c FROM \`${dbName}\`.inspecciones`);
                console.log(`[${dbName}] inspecciones:`, r3[0].c);
            } catch(e){}
            try {
                const [r4] = await conn.query(`SELECT count(*) as c FROM \`${dbName}\`.ot_backlog`);
                console.log(`[${dbName}] ot_backlog:`, r4[0].c);
            } catch(e){}
        }
    }

    await conn.end();
}

checkDatabases().catch(console.error);
