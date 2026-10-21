require('dotenv').config();
const mysql = require('mysql2/promise');

async function testWialonTelemetriaReal() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

  const conn = await mysql.createConnection({ host, user, password, port, database: 'azkell_tenant_marsisa' });

  // 1. Obtener un viaje reciente de BDA828 con sus vales y fechas
  const [vales] = await conn.query(`
    SELECT viaje, vehiculo, fecha, kilometraje, galones 
    FROM marsisa_combustible_vales 
    WHERE vehiculo = 'BDA828' AND fecha IS NOT NULL 
    ORDER BY fecha DESC 
    LIMIT 10
  `);
  console.log('Vales recientes BDA828:', vales);

  // 2. Token Wialon
  const [intg] = await conn.query("SELECT clave, valor FROM integraciones_api WHERE clave IN ('wialon_token', 'wialon_url')");
  let token = '';
  let baseUrl = 'https://hst-api.wialon.us/wialon/ajax.html';
  intg.forEach(r => {
    if (r.clave === 'wialon_token') token = (r.valor || '').trim();
    if (r.clave === 'wialon_url' && r.valor) baseUrl = r.valor.trim();
  });

  if (!token) {
    console.log('Sin token de Wialon');
    await conn.end();
    return;
  }

  // 3. Probar llamada Wialon
  const loginRes = await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token }))}`);
  const loginData = await loginRes.json();
  const sid = loginData.eid;
  console.log('Wialon login exitoso, SID:', sid ? 'SI' : 'NO');

  // Buscar plantilla CAN
  const resParams = {
    spec: { itemsType: "avl_resource", propName: "sys_name", propValueMask: "*", sortType: "sys_name" },
    force: 1, flags: 8193, from: 0, to: 0
  };
  const resRes = await fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(resParams))}&sid=${sid}`);
  const resData = await resRes.json();
  
  let targetResourceId = null;
  let targetTemplateId = null;
  let templateName = '';

  for (const r of (resData.items || [])) {
    if (r.rep) {
      for (const rep of Object.values(r.rep)) {
        const n = (rep.n || '').toLowerCase();
        if (n.includes('3.2.1') || n.includes('viajes - unidad can')) {
          targetResourceId = r.id;
          targetTemplateId = rep.id;
          templateName = rep.n;
          break;
        }
      }
    }
    if (targetResourceId && targetTemplateId) break;
  }
  console.log('Plantilla CAN encontrada:', templateName, { targetResourceId, targetTemplateId });

  // Buscar ID de unidad BDA828
  const unitParams = {
    spec: { itemsType: "avl_unit", propName: "sys_name", propValueMask: "*BDA828*", sortType: "sys_name" },
    force: 1, flags: 1, from: 0, to: 0
  };
  const unitRes = await fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(unitParams))}&sid=${sid}`);
  const unitData = await unitRes.json();
  const unit = (unitData.items || [])[0];
  console.log('Unidad BDA828 en Wialon:', unit ? { id: unit.id, name: unit.nm } : 'NO ENCONTRADA');

  if (unit && targetResourceId && targetTemplateId && vales.length >= 2) {
    const fIni = new Date(vales[vales.length - 1].fecha);
    const fFin = new Date(vales[0].fecha);
    const fromUnix = Math.floor(fIni.getTime() / 1000);
    const toUnix = Math.floor(fFin.getTime() / 1000);
    console.log(`Consultando reporte CAN para ${unit.nm} entre ${fIni.toISOString()} y ${fFin.toISOString()}...`);

    const execParams = {
      reportResourceId: targetResourceId,
      reportTemplateId: targetTemplateId,
      reportObjectId: unit.id,
      reportObjectSecId: 0,
      interval: { from: fromUnix, to: toUnix, flags: 0 }
    };
    const execRes = await fetch(`${baseUrl}?svc=report/exec_report&params=${encodeURIComponent(JSON.stringify(execParams))}&sid=${sid}`);
    const execData = await execRes.json();
    console.log('Resultado exec_report:', execData.reportResult ? {
      tables: execData.reportResult.tables?.map(t => ({ name: t.name, label: t.label, rows: t.rows }))
    } : execData);
  }

  await conn.end();
}

testWialonTelemetriaReal().catch(console.error);
