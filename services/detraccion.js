// Detracción (SPOT) de las órdenes de compra: cálculo del monto y datos que se guardan en entradas_inv.
//   Base: el total de la orden con IGV (siempre es el importe de la factura; «incluido» y «+ IGV» guardan igual).
//   Monto: el % sobre el total expresado en soles, redondeado al sol (como lo calcula SUNAT en las facturas).
//   En dólares, el equivalente en US$ es el % del total (así lo muestra la factura: cuota = total − detracción en US$).
//   Solo aplica si el total en soles supera el monto mínimo del tipo.
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

/**
 * @param {object} o { moneda: 'USD'|'PEN', totalOrigen (en la moneda de la orden, con IGV), tipoCambio (de la detracción; en soles la fija en 1), pct, minimo }
 * @returns {{aplica:boolean, motivo?:string, pct, tc, base_pen, monto_pen, monto_origen, neto_origen}}
 */
function calcular({ moneda, totalOrigen, tipoCambio, pct, minimo = 0 }) {
    const usd = String(moneda || '').toUpperCase() === 'USD';
    const total = num(totalOrigen);
    const p = num(pct);
    const tc = usd ? num(tipoCambio) : 1;
    if (!(p > 0)) return { aplica: false, motivo: 'Sin porcentaje', pct: p, tc, base_pen: 0, monto_pen: 0, monto_origen: 0, neto_origen: r2(total) };
    if (usd && !(tc > 0)) return { aplica: false, motivo: 'Falta el tipo de cambio de la detracción', pct: p, tc, base_pen: 0, monto_pen: 0, monto_origen: 0, neto_origen: r2(total) };
    const basePen = r2(total * tc);
    if (!(basePen > num(minimo))) return { aplica: false, motivo: `El total (S/ ${basePen.toFixed(2)}) no supera el monto mínimo de S/ ${num(minimo).toFixed(2)}`, pct: p, tc, base_pen: basePen, monto_pen: 0, monto_origen: 0, neto_origen: r2(total) };
    const montoPen = Math.round(basePen * p / 100);
    const montoOrigen = usd ? r2(total * p / 100) : montoPen;
    return { aplica: true, pct: p, tc, base_pen: basePen, monto_pen: montoPen, monto_origen: montoOrigen, neto_origen: r2(total - montoOrigen) };
}

/** Tipos de detracción activos (catálogo) */
async function tiposActivos(db) {
    const [filas] = await db.query('SELECT id, codigo, descripcion, porcentaje, monto_minimo FROM detraccion_tipos WHERE activo = 1 ORDER BY codigo');
    return filas.map(f => ({ ...f, porcentaje: Number(f.porcentaje), monto_minimo: Number(f.monto_minimo) }));
}

/**
 * Valida y calcula la detracción que llega del formulario de la orden.
 *   entrada: { detraccion_codigo, detraccion_pct, detraccion_tc } ; totalPen y moneda: de la orden.
 * Devuelve los campos a guardar (todos null si la orden no lleva detracción). Lanza Error con .status 400 si algo no es válido.
 */
async function camposDeOrden(db, { detraccion_codigo, detraccion_pct, detraccion_tc }, { moneda, totalPen, tipoCambioOrden }) {
    const codigo = String(detraccion_codigo || '').trim();
    const vacio = { detraccion_codigo: null, detraccion_pct: null, detraccion_tc: null, detraccion_monto_pen: null };
    if (!codigo) return vacio;
    const [t] = await db.query('SELECT codigo, porcentaje, monto_minimo FROM detraccion_tipos WHERE codigo = ? AND activo = 1 LIMIT 1', [codigo]);
    if (!t.length) throw Object.assign(new Error(`El tipo de detracción ${codigo} no existe o está inactivo`), { status: 400 });
    const pct = detraccion_pct === undefined || detraccion_pct === null || detraccion_pct === '' ? Number(t[0].porcentaje) : num(detraccion_pct);
    if (!(pct > 0 && pct <= 100)) throw Object.assign(new Error('El porcentaje de la detracción no es válido'), { status: 400 });
    const usd = String(moneda || '').toUpperCase() === 'USD';
    const tc = usd ? (num(detraccion_tc) || num(tipoCambioOrden)) : 1;
    // El total de la orden está guardado en soles (total_pen); en dólares se vuelve a su importe en US$ con el tipo de cambio de la orden
    const tcOrden = num(tipoCambioOrden) || 1;
    const totalOrigen = usd ? num(totalPen) / tcOrden : num(totalPen);
    const c = calcular({ moneda, totalOrigen, tipoCambio: tc, pct, minimo: Number(t[0].monto_minimo) });
    return { detraccion_codigo: codigo, detraccion_pct: pct, detraccion_tc: usd ? tc : null, detraccion_monto_pen: c.aplica ? c.monto_pen : 0 };
}

module.exports = { calcular, tiposActivos, camposDeOrden, r2, num };
