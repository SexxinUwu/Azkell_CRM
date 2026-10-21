require('dotenv').config();
const mysql = require('mysql2/promise');

async function test() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

  const conn = await mysql.createConnection({
    host, user, password, port, database: 'azkell_master'
  });

  const [cols] = await conn.query('DESCRIBE empresas');
  console.log('Columnas de empresas:', cols.map(c => c.Field));

  const [rows] = await conn.query('SELECT * FROM empresas');
  console.log('Empresas:', rows.map(r => ({ ...r, wialon_token: r.wialon_token ? '[PRESENTE]' : '[VACIO]' })));

  await conn.end();
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
