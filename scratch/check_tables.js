require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkTables() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

  const conn = await mysql.createConnection({ host, user, password, port, database: 'azkell_tenant_marsisa' });

  const [tables] = await conn.query('SHOW TABLES');
  const tNames = tables.map(r => Object.values(r)[0]);
  console.log('Tablas con viaje, orden o combustible:');
  console.log(tNames.filter(t => /viaje|orden|combustible|vale/i.test(t)));

  await conn.end();
}

checkTables().catch(console.error);
