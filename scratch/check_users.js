const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: 'azkell_tenant_marsisa'
        });
        const [desc] = await conn.query('DESCRIBE usuarios');
        console.log('Describe usuarios:', desc);
        const [users] = await conn.query('SELECT * FROM usuarios');
        console.log('Users in marsisa:', users);
        await conn.end();
    } catch(err) {
        console.error(err);
    }
})();
