require('dotenv').config();
const mysql = require('mysql2/promise');

async function testPlacasViajes() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

  const conn = await mysql.createConnection({ host, user, password, port, database: 'azkell_tenant_marsisa' });

  const [placasOV] = await conn.query(`
    SELECT DISTINCT placa, COUNT(*) as cant 
    FROM operaciones_ordenes_viaje 
    WHERE placa IS NOT NULL AND placa != '' 
    GROUP BY placa 
    ORDER BY cant DESC
    LIMIT 30
  `);
  console.log('Placas en operaciones_ordenes_viaje:', placasOV);

  const [placasVales] = await conn.query(`
    SELECT DISTINCT placa, COUNT(*) as cant 
    FROM operaciones_combustible_vales 
    WHERE placa IS NOT NULL AND placa != '' 
    GROUP BY placa 
    ORDER BY cant DESC
    LIMIT 10
  `);
  console.log('Placas en operaciones_combustible_vales:', placasVales);

  await conn.end();
}

testPlacasViajes().catch(console.error);
