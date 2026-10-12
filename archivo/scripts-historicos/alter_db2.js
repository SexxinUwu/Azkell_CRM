require('dotenv').config();
const mysql = require('mysql2');

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
});

const query = `
ALTER TABLE vehiculos_flota 
    DROP COLUMN soat_constancia, 
    DROP COLUMN matpel_emision, 
    DROP COLUMN sc_emision,
    ADD COLUMN tc_constancia VARCHAR(50) AFTER tc_vencimiento,
    ADD COLUMN boni_emision DATE AFTER rt_vencimiento,
    ADD COLUMN ext_emision DATE AFTER fum_vencimiento;
`;

db.query(query, (err, result) => {
    if (err && err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
         console.error('Error:', err);
    } else {
         console.log('Table altered successfully or already altered.');
    }
    db.end();
});
