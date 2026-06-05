const jwt = require('jsonwebtoken');
// Generate a fake JWT if needed, or we just test the DB directly.
const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    connectionLimit: 10
});

const registroId = 'TEST-123';
const exitosos = [{ key: 'test/key1.jpg', fase: 'salida' }];
const bucket = 'azkell-fleet-storage-939903246652-us-east-2-an';
const region = 'us-east-2';

db.query(
    'SELECT COALESCE(MAX(orden), 0) AS maxOrden FROM seg_unidades_fotos WHERE registro_id = ?',
    [registroId],
    (errDb, rows) => {
        if (errDb) { console.error('DB_ERR', errDb); return process.exit(1); }
        let orden = (rows && rows[0]) ? rows[0].maxOrden : 0;
        
        const values = [];
        exitosos.forEach(ex => {
            orden++;
            const fullUrl = `https://${bucket}.s3.${region}.amazonaws.com/${ex.key}`;
            values.push([registroId, ex.fase || 'salida', fullUrl, orden]);
        });

        console.log("VALUES:", values);

        db.query(
            'INSERT INTO seg_unidades_fotos (registro_id, tipo, url, orden) VALUES ?',
            [values],
            (err2) => {
                if (err2) { console.error('INSERT_ERR', err2); return process.exit(1); }
                console.log('SUCCESS');
                process.exit(0);
            }
        );
    }
);
