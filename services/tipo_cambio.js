// Tipo de cambio oficial de SUNAT (venta), consultado a apis.net.pe y guardado en caché por día (fecha de Lima).
const URL_SUNAT = 'https://api.apis.net.pe/v1/tipo-cambio-sunat';
const TIMEOUT_MS = 7000;

let cache = null; // { dia, dato }

const diaLima = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

/** Devuelve { venta, compra, fecha, origen } del día. Lanza error si SUNAT no responde o no trae venta. */
async function tipoCambioSunat(fetchImpl = global.fetch) {
    const hoy = diaLima();
    if (cache && cache.dia === hoy) return cache.dato;
    const r = await fetchImpl(URL_SUNAT, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) throw new Error(`SUNAT respondió ${r.status}`);
    const j = await r.json();
    const venta = Number(j.venta);
    if (!(venta > 0)) throw new Error('SUNAT no trajo el tipo de cambio de venta');
    const dato = { venta, compra: Number(j.compra) || null, fecha: j.fecha || hoy, origen: 'SUNAT' };
    cache = { dia: hoy, dato };
    return dato;
}

module.exports = { tipoCambioSunat, diaLima };
