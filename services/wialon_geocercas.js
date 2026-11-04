// Geocercas de Wialon (solo lectura) listas para dibujar en el mapa: polígonos y círculos como anillo cerrado [lng, lat].
// Cambian muy poco, así que se guardan en memoria por empresa.
const { credenciales } = require('./wialon_unidad');

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map();

const redondear = n => Math.round(n * 1e6) / 1e6;

// Wialon manda el color como ARGB (0xAARRGGBB); el mapa necesita #RRGGBB
const aHex = c => '#' + ((Number(c) >>> 0) & 0xFFFFFF).toString(16).padStart(6, '0');

function anilloCirculo(x, y, radioM) {
  const dy = radioM / 110540, dx = radioM / (111320 * Math.cos(y * Math.PI / 180));
  const anillo = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    anillo.push([redondear(x + dx * Math.cos(a)), redondear(y + dy * Math.sin(a))]);
  }
  anillo.push(anillo[0]);
  return anillo;
}

function aGeocerca(z) {
  const p = Array.isArray(z.p) ? z.p : [];
  let ring = null;
  if (z.t === 3 && p[0]) ring = anilloCirculo(p[0].x, p[0].y, Number(p[0].r || z.w) || 50);
  else if (z.t === 2 && p.length >= 3) {
    ring = p.map(q => [redondear(q.x), redondear(q.y)]);
    const a = ring[0], b = ring[ring.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) ring.push(a);
  }
  if (!ring) return null; // las líneas (t = 1) no encierran un área
  const xs = ring.map(q => q[0]), ys = ring.map(q => q[1]);
  return {
    id: `${z.rid}-${z.id}`, name: String(z.n || '').trim(), color: aHex(z.c), ring,
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
  };
}

async function consultar(db) {
  const { token, baseUrl } = await credenciales(db);
  if (!token) return { ok: false, error: 'El GPS (Wialon) no está configurado en esta empresa.' };
  const llamar = async (svc, params, sid) => (await fetch(
    `${baseUrl}?svc=${svc}&params=${encodeURIComponent(JSON.stringify(params))}${sid ? `&sid=${sid}` : ''}`,
    { signal: AbortSignal.timeout(15000) })).json();

  let sid = null;
  try {
    const login = await llamar('token/login', { token });
    if (!login?.eid) return { ok: false, error: 'No se pudo conectar con Wialon. Revisa el token en Sistema > Integraciones.' };
    sid = login.eid;
    // 0x1 básico + 0x1000 biblioteca de geocercas
    const recursos = await llamar('core/search_items', {
      spec: { itemsType: 'avl_resource', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
      force: 1, flags: 0x1001, from: 0, to: 0,
    }, sid);
    const geocercas = [];
    for (const r of recursos?.items || []) {
      const ids = Object.keys(r.zl || {}).map(Number);
      if (!ids.length) continue;
      const zonas = await llamar('resource/get_zone_data', { itemId: r.id, col: ids, flags: 0x1C }, sid);
      if (Array.isArray(zonas)) zonas.forEach(z => { const g = aGeocerca(z); if (g) geocercas.push(g); });
    }
    return { ok: true, geocercas };
  } catch (err) {
    console.warn('[geocercas] Wialon:', err.name === 'TimeoutError' ? 'tiempo agotado' : err.message);
    return { ok: false, error: 'Wialon no respondió a tiempo.' };
  } finally {
    if (sid) fetch(`${baseUrl}?svc=core/logout&params=%7B%7D&sid=${sid}`).catch(() => { });
  }
}

/** Devuelve { ok, geocercas } o { ok:false, error }. `clave` identifica a la empresa para la memoria. */
async function listarGeocercas(db, clave) {
  const hit = cache.get(clave);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.datos;
  const datos = await consultar(db);
  if (datos.ok) cache.set(clave, { t: Date.now(), datos });
  return datos;
}

module.exports = { listarGeocercas };
