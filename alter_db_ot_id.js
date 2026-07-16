const mysql = require('mysql2');
require('dotenv').config({path: 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/.env'});
const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
pool.query('ALTER TABLE entradas_inv ADD COLUMN ot_id VARCHAR(50) NULL', (err, results) => {
    if (err) {
        console.error('Error altering MySQL (maybe it exists):', err.message);
    } else {
        console.log('Successfully added ot_id to entradas_inv in MySQL');
    }
    pool.end();
});
