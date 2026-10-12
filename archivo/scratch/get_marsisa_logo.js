require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function test() {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'azkell_tenant_marsisa',
            port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
        });
        
        const [rows] = await conn.query("SELECT clave, valor FROM configuracion_erp WHERE clave IN ('empresa_nombre', 'empresa_logo')");
        console.log('Rows:', rows.map(r => ({ clave: r.clave, len: r.valor ? r.valor.length : 0, snippet: r.valor ? r.valor.substring(0, 100) : '' })));
        
        const logoRow = rows.find(r => r.clave === 'empresa_logo');
        if (logoRow && logoRow.valor) {
            let base64Data = logoRow.valor;
            if (base64Data.startsWith('data:image')) {
                base64Data = base64Data.split(',')[1];
            }
            fs.writeFileSync(path.join(__dirname, 'marsisa_logo.png'), Buffer.from(base64Data, 'base64'));
            console.log('Saved marsisa_logo.png successfully!');
        }
        await conn.end();
    } catch(e) {
        console.error('Error:', e.message);
    }
}
test();
