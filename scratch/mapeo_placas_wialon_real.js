require('dotenv').config();
const mysql = require('mysql2/promise');

async function testPlacasReal() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

  // Master
  const masterConn = await mysql.createConnection({ host, user, password, port, database: 'azkell_master' });
  const [empresas] = await masterConn.query('SELECT slug, nombre_empresa, db_name FROM empresas WHERE estado = "activo"');
  await masterConn.end();

  const report = {};

  for (const emp of empresas) {
    let conn;
    try {
      conn = await mysql.createConnection({ host, user, password, port, database: emp.db_name });
    } catch (e) {
      console.log(`Error conectando a ${emp.db_name}:`, e.message);
      continue;
    }

    // Token Wialon
    const [intg] = await conn.query("SELECT clave, valor FROM integraciones_api WHERE clave IN ('wialon_token', 'wialon_url')");
    let token = '';
    let baseUrl = 'https://hst-api.wialon.us/wialon/ajax.html';
    intg.forEach(r => {
      if (r.clave === 'wialon_token') token = (r.valor || '').trim();
      if (r.clave === 'wialon_url' && r.valor) baseUrl = r.valor.trim();
    });

    // Buscar tablas de vales
    const [tables] = await conn.query("SHOW TABLES");
    const tNames = tables.map(r => Object.values(r)[0]);
    const valesTable = tNames.includes(`${emp.slug}_combustible_vales`) ? `${emp.slug}_combustible_vales` 
                     : (tNames.includes('operaciones_combustible_vales') ? 'operaciones_combustible_vales' 
                     : (tNames.includes('combustible_vales') ? 'combustible_vales' : null));

    let placasConVales = [];
    if (valesTable) {
      const [rows] = await conn.query(`
        SELECT vehiculo as placa, COUNT(DISTINCT viaje) as viajes, COUNT(*) as vales
        FROM ${valesTable}
        WHERE vehiculo IS NOT NULL AND TRIM(vehiculo) != ''
        GROUP BY vehiculo
        ORDER BY viajes DESC
      `);
      placasConVales = rows;
    }

    // Wialon units
    let wialonUnits = [];
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
          wialonUnits = (unitsData.items || []).map(u => ({ id: u.id, name: u.nm }));
        }
      } catch (err) {
        console.error('Wialon err:', err.message);
      }
    }

    // Mapeo
    const wMapClean = new Map();
    wialonUnits.forEach(u => {
      const clean = String(u.name).replace(/[^A-Z0-9]/gi, '').toUpperCase();
      wMapClean.set(clean, u.name);
    });

    const mapping = placasConVales.map(pv => {
      const cleanP = String(pv.placa).replace(/[^A-Z0-9]/gi, '').toUpperCase();
      let match = wMapClean.get(cleanP);
      if (!match) {
        for (const [wClean, rawName] of wMapClean.entries()) {
          if (wClean.includes(cleanP) || cleanP.includes(wClean)) {
            match = rawName;
            break;
          }
        }
      }
      return {
        placa: pv.placa,
        viajes: pv.viajes,
        vales: pv.vales,
        wialonName: match || 'NO ENCONTRADO EN WIALON'
      };
    });

    report[emp.slug] = {
      empresa: emp.nombre_empresa,
      db: emp.db_name,
      totalUnidadesWialon: wialonUnits.length,
      valesTable,
      totalPlacasConViajes: placasConVales.length,
      mapping: mapping.slice(0, 30)
    };

    await conn.end();
  }

  console.log(JSON.stringify(report, null, 2));
}

testPlacasReal().catch(console.error);
