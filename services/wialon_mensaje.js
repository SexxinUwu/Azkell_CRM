// Sensores de una unidad de Wialon en un instante de su recorrido (solo lectura): lo que muestra el panel "Sensors" del Track player de Wialon.
// Toma el mensaje más cercano a la hora pedida y calcula todos los sensores de la unidad (ignición, voltaje, RPM, combustible, señal…).
const { credenciales } = require('./wialon_unidad');

const SIN_VALOR = -348000;          // Wialon marca "sin lectura" con -348201.3876
const CACHE_MS = 60 * 1000;
const cache = new Map();

const llamar = async (base, svc, params, sid) => {
  const url = `${base}?svc=${svc}&params=${encodeURIComponent(JSON.stringify(params))}${sid ? `&sid=${sid}` : ''}`;
  return (await fetch(url, { signal: AbortSignal.timeout(12000) })).json();
};

/** Texto de un sensor digital: la unidad "Desactivado/Activado" da el texto del 0 y del 1 */
function textoDigital(unidad, valor) {
  const partes = String(unidad || '').split('/');
  if (partes.length === 2 && partes[0].trim() && partes[1].trim()) return valor ? partes[1].trim() : partes[0].trim();
  return valor ? 'Sí' : 'No';
}

function orden(s) {
  try { const c = JSON.parse(s.c || '{}'); return Number.isFinite(Number(c.pos)) ? Number(c.pos) : 999; } catch { return 999; }
}

/**
 * @param {object} db conexión de la empresa (para leer el token de Wialon)
 * @returns {{ok:true, mensaje:{t,lat,lng,velocidad,rumbo,satelites}, sensores:Array<{id,nombre,valor,texto,unidad}>}|{ok:false,error}}
 */
async function sensoresEnMensaje(db, unitId, t) {
  const id = Number(unitId), seg = Math.floor(Number(t));
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(seg) || seg <= 0) return { ok: false, error: 'Unidad u hora no válidas.' };
  const clave = `${id}|${Math.round(seg / 10)}`;
  const guardado = cache.get(clave);
  if (guardado && Date.now() - guardado.en < CACHE_MS) return guardado.r;

  const { token, baseUrl } = await credenciales(db);
  if (!token) return { ok: false, error: 'El GPS (Wialon) no está configurado en esta empresa.' };
  let sid = null;
  try {
    const login = await llamar(baseUrl, 'token/login', { token });
    if (!login || !login.eid) return { ok: false, error: 'No se pudo conectar con Wialon.' };
    sid = login.eid;

    const item = await llamar(baseUrl, 'core/search_item', { id, flags: 4096 }, sid);
    const sens = Object.values((item && item.item && item.item.sens) || {});

    // Mensaje más cercano a la hora pedida: primero una ventana corta y, si no hay, una más ancha.
    // calc_sensors usa el índice dentro de la lista que dejó cargada load_interval, por eso se conserva la lista completa.
    let todos = [];
    for (const ventana of [90, 900]) {
      const r = await llamar(baseUrl, 'messages/load_interval', { itemId: id, timeFrom: seg - ventana, timeTo: seg + ventana, flags: 0, flagsMask: 0xFF00, loadCount: 200 }, sid);
      todos = Array.isArray(r && r.messages) ? r.messages : [];
      if (todos.some(m => m && m.pos)) break;
    }
    let idx = -1, mejor = Infinity;
    todos.forEach((m, i) => { if (m && m.pos) { const d = Math.abs(Number(m.t) - seg); if (d < mejor) { mejor = d; idx = i; } } });
    if (idx < 0) return { ok: false, error: 'No hay mensajes de la unidad en ese momento.' };
    const msg = todos[idx];

    let valores = {};
    try {
      const r = await llamar(baseUrl, 'unit/calc_sensors', { source: '', indexFrom: idx, indexTo: idx, unitId: id, sensorId: 0 }, sid);
      valores = (Array.isArray(r) && r[0]) || {};
    } catch { valores = {}; }

    const sensores = sens.sort((a, b) => orden(a) - orden(b) || a.id - b.id).map(s => {
      const v = valores[s.id];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < SIN_VALOR) return null;
      // Digital, o cualquier sensor cuya unidad sea "Apagado/Encendido" con valor 0 o 1
      const digital = s.t === 'digital' || (/^[^/\d]+\/[^/\d]+$/.test(String(s.m || '')) && (v === 0 || v === 1));
      const redondo = Math.round(v * 100) / 100;
      return { id: s.id, nombre: String(s.n || '').trim(), valor: redondo, texto: digital ? textoDigital(s.m, v) : null, unidad: digital ? '' : String(s.m || '').trim() };
    }).filter(Boolean);

    const salida = {
      ok: true,
      mensaje: { t: Number(msg.t), lat: Number(msg.pos.y), lng: Number(msg.pos.x), velocidad: Number(msg.pos.s || 0), rumbo: Number(msg.pos.c || 0), satelites: msg.pos.sc != null ? Number(msg.pos.sc) : null },
      sensores,
    };
    cache.set(clave, { en: Date.now(), r: salida });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return salida;
  } catch (err) {
    console.warn('[gps] sensores en mensaje:', err.name === 'TimeoutError' ? 'tiempo agotado' : err.message);
    return { ok: false, error: 'Wialon no respondió a tiempo. Intenta de nuevo.' };
  } finally {
    if (sid) fetch(`${baseUrl}?svc=core/logout&params=%7B%7D&sid=${sid}`).catch(() => { });
  }
}

// ── Dirección de un punto (geocodificador de Wialon, el mismo que muestra su Track player) ──
const sesionGis = { gis: null, clave: '', en: 0 };
const direcciones = new Map();

async function gisSid(db, nueva) {
  const { token, baseUrl } = await credenciales(db);
  if (!token) return null;
  const clave = baseUrl + '|' + token;
  if (!nueva && sesionGis.gis && sesionGis.clave === clave && Date.now() - sesionGis.en < 10 * 60 * 1000) return { gis: sesionGis.gis, baseUrl };
  const login = await llamar(baseUrl, 'token/login', { token });
  if (!login || !login.gis_sid) return null;
  sesionGis.gis = login.gis_sid; sesionGis.clave = clave; sesionGis.en = Date.now();
  // Esta sesión solo se usó para obtener la clave del geocodificador
  fetch(`${baseUrl}?svc=core/logout&params=%7B%7D&sid=${login.eid}`).catch(() => { });
  return { gis: login.gis_sid, baseUrl };
}

/** Dirección en texto de unas coordenadas, o null si no se pudo. Se guarda en memoria por punto (a ~10 m) */
async function direccionDe(db, lat, lng) {
  const la = Number(lat), lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  const clave = `${la.toFixed(4)}|${lo.toFixed(4)}`;
  if (direcciones.has(clave)) return direcciones.get(clave);
  try {
    for (const nueva of [false, true]) {
      const g = await gisSid(db, nueva);
      if (!g) return null;
      const host = new URL(g.baseUrl).hostname;
      const coords = encodeURIComponent(JSON.stringify([{ lat: la, lon: lo }]));
      const r = await (await fetch(`https://geocode-maps.wialon.com/${host}/gis_geocode?coords=${coords}&flags=1255211008&gis_sid=${g.gis}`, { signal: AbortSignal.timeout(6000) })).json();
      if (Array.isArray(r) && typeof r[0] === 'string' && r[0].trim()) {
        const texto = r[0].trim();
        direcciones.set(clave, texto);
        if (direcciones.size > 3000) direcciones.delete(direcciones.keys().next().value);
        return texto;
      }
    }
  } catch { /* sin dirección */ }
  return null;
}

module.exports = { sensoresEnMensaje, direccionDe };
