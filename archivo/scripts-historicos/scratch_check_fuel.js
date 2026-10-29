const mysql = require('mysql2/promise');

(async () => {
    const pool = mysql.createPool({
        host: '82.39.109.226',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: 3306
    });
    const dbs = ['azkell_fleet', 'azkell_tenant_marsisa', 'azkell_tenant_rosymarperu'];
    for (const dbName of dbs) {
        console.log('--- DB:', dbName, '---');
        try {
            const [tables] = await pool.query("SHOW TABLES FROM " + dbName + " LIKE '%combustible%'");
            for (const t of tables) {
                const tableName = Object.values(t)[0];
                const [count] = await pool.query(`SELECT COUNT(*) as cnt FROM ${dbName}.${tableName}`);
                console.log(tableName, ':', count[0].cnt);
            }
        } catch(e) {
            console.error(e.message);
        }
    }
    await pool.end();
})();
