require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

pool.query('TRUNCATE TABLE mant_insp_templates', (err) => {
    if (err) console.error("Error truncating table:", err);
    else console.log("Table mant_insp_templates is now empty.");
    process.exit(0);
});
