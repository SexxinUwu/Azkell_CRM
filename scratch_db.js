const mysql = require('mysql2');
require('dotenv').config({ path: __dirname + '/.env' });

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    connectionLimit: 10
});

db.query('SELECT * FROM seg_unidades_registros ORDER BY created_at DESC LIMIT 1', (err, rows) => {
    if (err) { console.error('Error fetching registros:', err); process.exit(1); }
    console.log('ÚLTIMO REGISTRO:', rows);
    if (!rows || !rows.length) {
        console.log('No registros found.');
        process.exit(0);
    }

    const regId = rows[0].id;
    db.query('SELECT * FROM seg_unidades_fotos WHERE registro_id = ?', [regId], (err2, fotosRows) => {
        if (err2) { console.error('Error fetching fotos:', err2); process.exit(1); }
        console.log(`FOTOS PARA ${regId}:`, fotosRows);
        
        db.query('SELECT * FROM seg_unidades_fotos ORDER BY created_at DESC LIMIT 5', (err3, allFotos) => {
             console.log('ÚLTIMAS 5 FOTOS EN LA TABLA:', allFotos);
             process.exit(0);
        });
    });
});
