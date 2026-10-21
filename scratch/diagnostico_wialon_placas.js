require('dotenv').config();
const mysql = require('mysql2/promise');

async function testWialonAndPlates() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

  // 1. Obtener empresas
  const masterConn = await mysql.createConnection({ host, user, password, port, database: 'azkell_master' });
  const [empresas] = await masterConn.query('SELECT slug, nombre_empresa, db_name FROM empresas WHERE estado = "activo"');
  await masterConn.end();

  console.log(`=== EMPRESAS ACTIVAS: ${empresas.length} ===`);

  for (const emp of empresas) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Empresa: ${emp.nombre_empresa} (${emp.slug} -> ${emp.db_name})`);
    
    let tenantConn;
    try {
      tenantConn = await mysql.createConnection({ host, user, password, port, database: emp.db_name });
    } catch (e) {
      console.log(`  [ERROR al conectar a ${emp.db_name}]: ${e.message}`);
      continue;
    }

    // Token Wialon
    const [intg] = await tenantConn.query("SELECT clave, valor FROM integraciones_api WHERE clave IN ('wialon_token', 'wialon_url')");
    let token = '';
    let baseUrl = 'https://hst-api.wialon.us/wialon/ajax.html';
    intg.forEach(r => {
      if (r.clave === 'wialon_token') token = (r.valor || '').trim();
      if (r.clave === 'wialon_url' && r.valor) baseUrl = r.valor.trim();
    });

    console.log(`  Wialon Token: ${token ? 'Configurado (' + token.substring(0, 10) + '...)' : 'NO configurado'}`);

    // Placas registradas en la tabla placas
    const [placasRows] = await tenantConn.query("SELECT placa, IFNULL(wialon_name, '') as wialon_name, IFNULL(tipo, '') as tipo FROM placas").catch(() => [[]]);
    console.log(`  Total placas en tabla 'placas': ${placasRows.length}`);

    // Placas con viajes en viajes o vales
    const [placasViajes] = await tenantConn.query(`
      SELECT DISTINCT placa, COUNT(*) as cant_viajes 
      FROM viajes 
      WHERE placa IS NOT NULL AND placa != '' 
      GROUP BY placa 
      ORDER BY cant_viajes DESC
      LIMIT 25
    `).catch(() => [[]]);

    console.log(`  Top placas con viajes (${placasViajes.length} encontradas):`);
    placasViajes.slice(0, 10).forEach(p => console.log(`    - ${p.placa}: ${p.cant_viajes} viajes`));

    // Si tiene token Wialon, consultar unidades en Wialon
    if (token) {
      try {
        const loginRes = await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token }))}`);
        const loginData = await loginRes.json();
        if (loginData.eid) {
          const sid = loginData.eid;
          const searchParams = {
            spec: { itemsType: "avl_unit", propName: "sys_name", propValueMask: "*", sortType: "sys_name" },
            force: 1, flags: 1, from: 0, to: 0
          };
          const unitsRes = await fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(searchParams))}&sid=${sid}`);
          const unitsData = await unitsRes.json();
          const items = unitsData.items || [];
          console.log(`  Unidades en Wialon: ${items.length}`);
          console.log(`  Ejemplo de nombres Wialon:`, items.slice(0, 10).map(u => u.nm));

          // Comparación contra las placas con viajes
          const wialonCleanMap = new Map();
          items.forEach(u => {
            const clean = String(u.nm).replace(/[^A-Z0-9]/gi, '').toUpperCase();
            wialonCleanMap.set(clean, u.nm);
          });

          console.log(`  Comparación de placas de viajes contra Wialon:`);
          let coincidencias = 0;
          let faltantes = 0;
          for (const pv of placasViajes) {
            const cleanPlaca = String(pv.placa).replace(/[^A-Z0-9]/gi, '').toUpperCase();
            let match = wialonCleanMap.get(cleanPlaca);
            if (!match) {
              for (const [wClean, rawName] of wialonCleanMap.entries()) {
                if (wClean.includes(cleanPlaca) || cleanPlaca.includes(wClean)) {
                  match = rawName;
                  break;
                }
              }
            }
            if (match) {
              coincidencias++;
              // console.log(`    MATCH: Placa '${pv.placa}' -> Wialon '${match}'`);
            } else {
              faltantes++;
              console.log(`    SIN MATCH: Placa '${pv.placa}' (${pv.cant_viajes} viajes) no hallada en Wialon`);
            }
          }
          console.log(`  Resumen Wialon: ${coincidencias} coincidencias, ${faltantes} sin match de ${placasViajes.length} placas top.`);
        } else {
          console.log(`  [Wialon error login]:`, loginData);
        }
      } catch (err) {
        console.log(`  [Wialon fetch error]:`, err.message);
      }
    }

    await tenantConn.end();
  }
}

testWialonAndPlates().catch(console.error);
