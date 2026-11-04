// Datos en vivo de UNA unidad desde Wialon (solo lectura): posición con dirección, velocidad, estado del motor, km y horas.
// Lo usa el asistente de IA. Misma lógica de enlace placa ↔ unidad que el mapa (services/wialon_placas.js).
const { crearResolutorPlacas } = require('./wialon_placas');

const URL_POR_DEFECTO = 'https://hst-api.wialon.us/wialon/ajax.html';
const limpiarPlaca = s => String(s || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

const consulta = (db, sql, params) => new Promise((resolve) => db.query(sql, params, (err, rows) => resolve(err ? [] : rows)));

async function credenciales(db) {
  const leer = async (clave) => {
    const r = await consulta(db, 'SELECT valor FROM integraciones_api WHERE clave = ? LIMIT 1', [clave]);
    return r[0]?.valor ? String(r[0].valor).trim() : '';
  };
  const [token, url] = await Promise.all([leer('wialon_token'), leer('wialon_url')]);
  return { token: token || process.env.WIALON_TOKEN || '', baseUrl: url || URL_POR_DEFECTO };
}

const aLima = (seg) => new Date(seg * 1000).toLocaleString('es-PE', {
  timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

/**
 * Posición y contadores de la unidad de una placa. Devuelve { ok:false, error } si no se pudo (nunca lanza).
 * Resultado: placa, ubicacion (dirección), lat, lng, velocidad_kmh, motor, km, horas, ultima_posicion, hace_minutos, mapa.
 */
async function datosGpsUnidad(db, placaTexto) {
  const placa = limpiarPlaca(placaTexto);
  if (placa.length < 5) return { ok: false, error: 'No entendí la placa. Pídele que la repita completa (por ejemplo BSS899).' };

  const { token, baseUrl } = await credenciales(db);
  if (!token) return { ok: false, error: 'El GPS (Wialon) no está configurado en esta empresa.' };

  let sid = null;
  try {
    const login = await (await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token }))}`, { signal: AbortSignal.timeout(8000) })).json();
    if (!login?.eid) return { ok: false, error: 'No se pudo conectar con Wialon. Revisa el token en Sistema > Integraciones.' };
    sid = login.eid;

    const busqueda = { spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' }, force: 1, flags: 9221, from: 0, to: 0 };
    const datos = await (await fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(busqueda))}&sid=${sid}`, { signal: AbortSignal.timeout(10000) })).json();
    const unidades = Array.isArray(datos?.items) ? datos.items : [];

    const filasPlacas = await consulta(db, 'SELECT placa, wialon_name FROM placas', []);
    const resolver = crearResolutorPlacas(filasPlacas);
    const unidad = unidades.find(u => resolver(String(u.nm || '')).placa === placa);
    if (!unidad) return { ok: false, error: `No encontré la placa ${placa} en el GPS. Puede estar sin equipo GPS o con otro nombre en Wialon.` };

    const pos = unidad.pos || null;
    const km = unidad.cnm_km ? Math.round(unidad.cnm_km) : null;
    const horas = unidad.cneh ? Math.round(unidad.cneh) : null;
    const salida = { ok: true, placa, nombre_en_gps: String(unidad.nm || ''), km_gps: km, horas_motor: horas };
    if (!pos || !pos.y || !pos.x) return { ...salida, ubicacion: 'Sin posición reciente en el GPS' };

    const velocidad = Number(pos.s) || 0;
    const p = unidad.lmsg?.p || {};
    const encendido = velocidad > 3 || p.io_1 === 1 || p.io_239 === 1 || p.acc === 1 || p.ign === 1 || (Number(p.can_rpm) || 0) > 400;
    const motor = velocidad > 3 ? 'en marcha' : encendido ? 'encendido y detenido (ralentí)' : 'apagado y detenido';

    let direccion = '';
    if (login.gis_sid) {
      try {
        const host = new URL(baseUrl).hostname;
        const coords = encodeURIComponent(JSON.stringify([{ lat: pos.y, lon: pos.x }]));
        const geo = await (await fetch(`https://geocode-maps.wialon.com/${host}/gis_geocode?coords=${coords}&flags=1255211008&gis_sid=${login.gis_sid}`, { signal: AbortSignal.timeout(5000) })).json();
        if (Array.isArray(geo) && typeof geo[0] === 'string') direccion = geo[0].trim();
      } catch { /* sin dirección: se da solo la coordenada */ }
    }

    const hace = pos.t ? Math.max(0, Math.round((Date.now() / 1000 - Number(pos.t)) / 60)) : null;
    return {
      ...salida,
      ubicacion: direccion || 'Dirección no disponible',
      lat: Number(pos.y), lng: Number(pos.x),
      velocidad_kmh: Math.round(velocidad),
      motor,
      ultima_posicion: pos.t ? aLima(Number(pos.t)) : null,
      hace_minutos: hace,
      mapa: `https://www.google.com/maps?q=${pos.y},${pos.x}`,
    };
  } catch (err) {
    console.warn('[asistente] Wialon:', err.name === 'TimeoutError' ? 'tiempo agotado' : err.message);
    return { ok: false, error: 'Wialon no respondió a tiempo. Intenta de nuevo en un momento.' };
  } finally {
    if (sid) fetch(`${baseUrl}?svc=core/logout&params=%7B%7D&sid=${sid}`).catch(() => { });
  }
}

module.exports = { datosGpsUnidad, limpiarPlaca, credenciales };
