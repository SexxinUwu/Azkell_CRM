const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

db.connect((err) => {
    if (err) throw err;
    console.log('Connected to DB');

    const sql = `ALTER TABLE mantenimiento_kits ADD COLUMN modelo_vehiculo VARCHAR(100) DEFAULT 'TODOS LOS MODELOS' AFTER marca_vehiculo`;
    
    db.query(sql, (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('Column already exists');
                process.exit(0);
            }
            throw err;
        }
        console.log('Column modelo_vehiculo added successfully!');
        process.exit(0);
    });
});
