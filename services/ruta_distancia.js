'use strict';
/**
 * Distancia y tiempo entre dos distritos del Perú, sin costo y sin clave:
 *   1. Ubica cada distrito con Nominatim (OpenStreetMap). Solo se envía el nombre del distrito, nunca la dirección del cliente.
 *   2. Calcula la ruta por carretera con OSRM.
 *   3. Si OSRM falla, estima con la línea recta x 1.3 y lo marca como aproximado.
 * Opcional: con USAR_GOOGLE_MAPS=1 y GOOGLE_MAPS_API_KEY (con facturación activa) usa Google Routes, y si falla vuelve a lo gratuito.
 */
const UA = 'AzkellFleet/1.0 (ordenes de servicio)';
const MARGEN_CAMION = 1.25; // OSRM calcula tiempos de auto; el camión tarda más

const coordCache = new Map();
const rutaCache = new Map();
let cola = Promise.resolve();
let ultimoNominatim = 0;

const esperar = ms => new Promise(r => setTimeout(r, ms));

async function pedirJson(url, opts = {}, ms = 12000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
        const r = await fetch(url, { ...opts, signal: ctl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'es', ...(opts.headers || {}) } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
    } finally { clearTimeout(t); }
}

/** Nominatim pide máximo 1 consulta por segundo: se hacen en fila. */
function ubicar(texto) {
    const clave = texto.trim().toUpperCase();
    if (coordCache.has(clave)) return Promise.resolve(coordCache.get(clave));
    const tarea = cola.then(async () => {
        if (coordCache.has(clave)) return coordCache.get(clave);
        const falta = 1100 - (Date.now() - ultimoNominatim);
        if (falta > 0) await esperar(falta);
        ultimoNominatim = Date.now();
        const j = await pedirJson('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=pe&q=' + encodeURIComponent(texto));
        const p = Array.isArray(j) && j[0] ? { lat: Number(j[0].lat), lon: Number(j[0].lon) } : null;
        if (p) coordCache.set(clave, p);
        return p;
    });
    cola = tarea.catch(() => {});
    return tarea;
}

function rectaKm(a, b) {
    const rad = x => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
}

async function porGoogle(origen, destino) {
    const j = await pedirJson('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration' },
        body: JSON.stringify({ origin: { address: origen }, destination: { address: destino }, travelMode: 'DRIVE', regionCode: 'PE', languageCode: 'es' }),
    });
    const r = j.routes && j.routes[0];
    if (!r) throw new Error('Google sin ruta');
    return { km: Math.round(r.distanceMeters / 1000), horas: Math.round((parseInt(r.duration, 10) / 3600) * MARGEN_CAMION * 10) / 10, metodo: 'google' };
}

/**
 * @param {string} origen  «Distrito, Provincia, Departamento»
 * @param {string} destino «Distrito, Provincia, Departamento»
 * @returns {Promise<{km:number, horas:number, metodo:'osrm'|'recta'|'google'}|null>}
 */
async function distanciaEntre(origen, destino) {
    const clave = `${origen}|${destino}`.toUpperCase();
    if (rutaCache.has(clave)) return rutaCache.get(clave);
    let res = null;
    if (process.env.USAR_GOOGLE_MAPS === '1' && process.env.GOOGLE_MAPS_API_KEY) {
        try { res = await porGoogle(`${origen}, Perú`, `${destino}, Perú`); } catch (e) { console.warn('Google Routes falló, se usa OSRM:', e.message); }
    }
    if (!res) {
        const [a, b] = [await ubicar(`${origen}, Perú`), await ubicar(`${destino}, Perú`)];
        if (!a || !b) return null;
        try {
            const j = await pedirJson(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`);
            const r = j.routes && j.routes[0];
            if (!r) throw new Error('OSRM sin ruta');
            res = { km: Math.round(r.distance / 1000), horas: Math.round((r.duration / 3600) * MARGEN_CAMION * 10) / 10, metodo: 'osrm' };
        } catch (e) {
            console.warn('OSRM falló, se estima en línea recta:', e.message);
            const km = Math.round(rectaKm(a, b) * 1.3);
            res = { km, horas: Math.round((km / 50) * 10) / 10, metodo: 'recta' };
        }
    }
    // Lo aproximado no se guarda, para reintentar con la ruta real la próxima vez
    if (res.metodo !== 'recta') rutaCache.set(clave, res);
    return res;
}

module.exports = { distanciaEntre };
