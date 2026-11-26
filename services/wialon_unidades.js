// Unidades con GPS de una empresa en Wialon (solo lectura), ya vinculadas a su placa: [{ id, nombre, placa }].
// Es la misma lista y el mismo vínculo placa-unidad que usa el mapa (services/wialon_placas.js).
const { crearResolutorPlacas } = require('./wialon_placas');
const { credenciales } = require('./wialon_unidad');

const consulta = (db, sql, params) => new Promise((resolve) => db.query(sql, params, (err, rows) => resolve(err ? [] : rows)));

async function listarUnidadesGps(db) {
  const { token, baseUrl } = await credenciales(db);
  if (!token) return [];
  let sid = null;
  try {
    const login = await (await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token }))}`, { signal: AbortSignal.timeout(15000) })).json();
    if (!login || !login.eid) return [];
    sid = login.eid;
    const busqueda = { spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' }, force: 1, flags: 1, from: 0, to: 0 };
    const datos = await (await fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(busqueda))}&sid=${sid}`, { signal: AbortSignal.timeout(20000) })).json();
    const items = Array.isArray(datos && datos.items) ? datos.items : [];
    const filas = await consulta(db, 'SELECT placa, wialon_name FROM placas', []);
    const resolver = crearResolutorPlacas(filas);
    const vistas = new Set();
    const salida = [];
    for (const u of items) {
      const placa = resolver(String(u.nm || '')).placa;
      if (!placa || vistas.has(placa)) continue;
      vistas.add(placa);
      salida.push({ id: Number(u.id), nombre: String(u.nm || ''), placa });
    }
    return salida;
  } catch (e) {
    console.warn('[gps] listar unidades:', e.message);
    return [];
  } finally {
    if (sid) fetch(`${baseUrl}?svc=core/logout&params=%7B%7D&sid=${sid}`).catch(() => { });
  }
}

module.exports = { listarUnidadesGps };
