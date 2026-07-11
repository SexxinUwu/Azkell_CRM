const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'db.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening db:', err.message);
        return;
    }
    db.all("SELECT * FROM mantenimiento_kits", (err, rows) => {
        if (err) {
            console.error('Error querying db:', err.message);
        } else {
            console.log('mantenimiento_kits row count:', rows.length);
            console.log(rows);
        }
        db.close();
    });
});
