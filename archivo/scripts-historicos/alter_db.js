require('dotenv').config();
const mysql = require('mysql2');
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});
db.query("ALTER TABLE inventario MODIFY tipo VARCHAR(50);", (err, result) => {
    if (err) console.error(err);
    else console.log("Success altering table:", result);
    process.exit();
});
