// Consulta de RUC en SUNAT (vía apis.net.pe, el mismo proveedor del tipo de cambio). Caché de una hora por RUC.
const URL_RUC = 'https://api.apis.net.pe/v1/ruc?numero=';
const TIMEOUT_MS = 7000;
const VIGENCIA_MS = 60 * 60 * 1000;

const cache = new Map(); // ruc -> { hasta, dato }

/** RUC de 11 dígitos con el dígito verificador correcto (módulo 11) */
function rucValido(ruc) {
    if (!/^(10|15|17|20)\d{9}$/.test(ruc)) return false;
    const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const suma = pesos.reduce((s, p, i) => s + p * Number(ruc[i]), 0);
    const digito = 11 - (suma % 11);
    return Number(ruc[10]) === (digito === 10 ? 0 : digito === 11 ? 1 : digito);
}

const limpio = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const sinGuion = v => { const t = limpio(v); return t === '-' ? '' : t; };

/** Devuelve { ruc, razon_social, direccion, estado, condicion, distrito, provincia, departamento }. Lanza error si no se puede consultar. */
async function consultarRuc(ruc, fetchImpl = global.fetch) {
    if (!rucValido(ruc)) { const e = new Error('El RUC no es válido. Revisa los 11 dígitos.'); e.status = 400; throw e; }
    const guardado = cache.get(ruc);
    if (guardado && guardado.hasta > Date.now()) return guardado.dato;

    const r = await fetchImpl(URL_RUC + ruc, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (r.status === 404 || r.status === 422) { const e = new Error('SUNAT no encontró ese RUC.'); e.status = 404; throw e; }
    if (!r.ok) throw new Error(`SUNAT respondió ${r.status}`);
    const j = await r.json();
    const razon = limpio(j.nombre || j.razonSocial);
    if (!razon) { const e = new Error('SUNAT no encontró ese RUC.'); e.status = 404; throw e; }

    const distrito = sinGuion(j.distrito), provincia = sinGuion(j.provincia), departamento = sinGuion(j.departamento);
    const calle = sinGuion(j.direccion);
    // "Calle, Distrito, Provincia" (sin repetir la provincia cuando coincide con el departamento)
    const direccion = [calle, distrito, provincia, departamento && departamento !== provincia ? departamento : ''].filter(Boolean).join(', ');
    const dato = { ruc, razon_social: razon, direccion, estado: limpio(j.estado), condicion: limpio(j.condicion), distrito, provincia, departamento };
    cache.set(ruc, { hasta: Date.now() + VIGENCIA_MS, dato });
    return dato;
}

module.exports = { consultarRuc, rucValido };
