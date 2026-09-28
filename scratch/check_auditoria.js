const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'azkell_tenant_marsisa'
    });
    const [rows] = await conn.query('SELECT * FROM auditoria WHERE idAuditoria >= 3000 ORDER BY idAuditoria DESC LIMIT 20');
    console.log('Auditoria rows >= 3000:', rows);
    await conn.end();
})();
