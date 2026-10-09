require('dotenv').config();
const mysql = require('mysql2/promise');

async function test() {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'azkell_tenant_marsisa',
            port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
        });

        const [ots] = await pool.query("SELECT * FROM ordenes_trabajo ORDER BY id_ot DESC LIMIT 5");
        console.log('OTs found:', ots.length);
        if (ots.length) console.log('OT sample:', { id: ots[0].id_ot, placa: ots[0].placa, estado: ots[0].estado, supervisor: ots[0].supervisor });

        const [backlogs] = await pool.query("SELECT * FROM ot_backlog ORDER BY backlog_id DESC LIMIT 5");
        console.log('Backlogs found:', backlogs.length);
        if (backlogs.length) console.log('Backlog sample:', { id: backlogs[0].backlog_id, placa: backlogs[0].placa, tema: backlogs[0].tema, estado: backlogs[0].estado });

        const [fallas] = await pool.query("SELECT * FROM reportes_fallas ORDER BY id DESC LIMIT 5");
        console.log('Fallas found:', fallas.length);
        if (fallas.length) console.log('Falla sample:', { id: fallas[0].id, folio: fallas[0].folio, placa_tracto: fallas[0].placa_tracto, estado: fallas[0].estado });

        await pool.end();
    } catch(e) {
        console.error('Error:', e.message);
    }
}
test();
