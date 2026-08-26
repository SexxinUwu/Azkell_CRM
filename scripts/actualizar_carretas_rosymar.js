require('dotenv').config();
const mysql = require('mysql2/promise');

const placas = [
  'BTU999', 'BTV998', 'BTV999', 'BTX996', 'BTX997', 
  'BUH993', 'BUJ976', 'BUJ985', 'BUJ994', 'BUJ995'
];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
  });

  const [dbs] = await conn.query("SHOW DATABASES LIKE '%rosymar%'");
  console.log('Bases de datos de Rosymar encontradas:', dbs.map(d => Object.values(d)[0]));

  for (const d of dbs) {
    const dbName = Object.values(d)[0];
    try {
      const [tables] = await conn.query(`SHOW TABLES FROM \`${dbName}\` LIKE 'placas'`);
      if (tables.length > 0) {
        const [res] = await conn.query(
          `UPDATE \`${dbName}\`.placas SET configuracion = 'R2' WHERE placa IN (?)`,
          [placas]
        );
        console.log(`✅ En [${dbName}]: ${res.affectedRows} filas actualizadas a R2`);

        const [verify] = await conn.query(
          `SELECT placa, tipo, sub_tipo, configuracion FROM \`${dbName}\`.placas WHERE placa IN (?)`,
          [placas]
        );
        console.table(verify);
      }
    } catch(err) {
      console.warn(`Error en ${dbName}:`, err.message);
    }
  }

  await conn.end();
}

main().catch(console.error);
