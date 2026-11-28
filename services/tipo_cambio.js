// Tipo de cambio oficial de SUNAT (venta), consultado a apis.net.pe y guardado en caché por día (fecha de Lima).
const URL_SUNAT = 'https://api.apis.net.pe/v1/tipo-cambio-sunat';
const TIMEOUT_MS = 7000;

let cache = null; // { dia, dato }
const porFecha = new Map(); // tipo de cambio de una fecha pasada: no cambia, se guarda sin vencimiento

const diaLima = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

/** Devuelve { venta, compra, fecha, origen } del día, o de la fecha pedida (YYYY-MM-DD, la de emisión de una factura). Lanza error si SUNAT no responde o no trae venta. */
async function tipoCambioSunat(fetchImpl = global.fetch, fecha = null) {
    const hoy = diaLima();
    if (fecha) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) throw new Error('La fecha no es válida');
        if (fecha > hoy) throw new Error('La fecha de la factura no puede ser futura');
        if (fecha === hoy) return tipoCambioSunat(fetchImpl);
        if (porFecha.has(fecha)) return porFecha.get(fecha);
        const rf = await fetchImpl(`${URL_SUNAT}?fecha=${fecha}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!rf.ok) throw new Error(`SUNAT respondió ${rf.status}`);
        const jf = await rf.json();
        const ventaF = Number(jf.venta);
        if (!(ventaF > 0)) throw new Error('SUNAT no trajo el tipo de cambio de esa fecha');
        const datoF = { venta: ventaF, compra: Number(jf.compra) || null, fecha: jf.fecha || fecha, origen: 'SUNAT' };
        porFecha.set(fecha, datoF);
        return datoF;
    }
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
