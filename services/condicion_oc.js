// Condición de pago de la orden de compra y fecha de vencimiento de la cuenta por pagar.
// Sin condición → "Al contado" con 0 días. Crédito sin días → 30 días.
// Al contado vence el mismo día de la recepción; a crédito, la recepción + los días.

const CONDICION_CONTADO = 'Al contado';
const CONDICION_CREDITO = 'Crédito';
const DIAS_CREDITO_POR_DEFECTO = 30;

function normalizarCondicion(b) {
    const entrada = String(b && b.condicion_pago || '').trim().toLowerCase();
    if (entrada !== CONDICION_CREDITO.toLowerCase()) {
        return { condicion_pago: CONDICION_CONTADO, dias_credito: 0 };
    }
    const dias = parseInt(b.dias_credito, 10);
    return { condicion_pago: CONDICION_CREDITO, dias_credito: Number.isFinite(dias) && dias > 0 ? dias : DIAS_CREDITO_POR_DEFECTO };
}

// fechaRecepcion: 'AAAA-MM-DD' (o con hora). Devuelve 'AAAA-MM-DD'.
function fechaVencimiento(fechaRecepcion, condicion, diasCredito) {
    const base = String(fechaRecepcion || '').slice(0, 10);
    const m = base.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const dias = condicion === CONDICION_CREDITO ? (parseInt(diasCredito, 10) || DIAS_CREDITO_POR_DEFECTO) : 0;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + dias));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

module.exports = { normalizarCondicion, fechaVencimiento, CONDICION_CONTADO, CONDICION_CREDITO };
