require('dotenv').config();
const mysql = require('mysql2/promise');

async function testParse() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

  const conn = await mysql.createConnection({ host, user, password, port, database: 'azkell_tenant_marsisa' });
  const [intg] = await conn.query("SELECT clave, valor FROM integraciones_api WHERE clave IN ('wialon_token', 'wialon_url')");
  let token = intg.find(r => r.clave === 'wialon_token')?.valor?.trim();
  let baseUrl = 'https://hst-api.wialon.us/wialon/ajax.html';

  const loginRes = await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token }))}`);
  const { eid: sid } = await loginRes.json();

  const targetResourceId = 401601721;
  const targetTemplateId = 17;
  const unitId = 400204686; // BDA828

  // Viaje 2026-00001169: 10 de octubre a 13 de octubre
  const fromUnix = Math.floor(new Date('2026-10-10T15:27:00.000Z').getTime() / 1000);
  const toUnix = Math.floor(new Date('2026-10-13T20:01:00.000Z').getTime() / 1000);

  const execParams = {
    reportResourceId: targetResourceId,
    reportTemplateId: targetTemplateId,
    reportObjectId: unitId,
    reportObjectSecId: 0,
    interval: { from: fromUnix, to: toUnix, flags: 0 }
  };

  const execRes = await fetch(`${baseUrl}?svc=report/exec_report&params=${encodeURIComponent(JSON.stringify(execParams))}&sid=${sid}`);
  const execData = await execRes.json();

  console.log('Tables:', JSON.stringify(execData.reportResult?.tables?.map(t => ({ name: t.name, label: t.label, header: t.header, total: t.total })), null, 2));
  console.log('Stats:', execData.reportResult?.stats);

  await fetch(`${baseUrl}?svc=report/cleanup_result&params=%7B%7D&sid=${sid}`).catch(() => {});
  await conn.end();
}

testParse().catch(console.error);
