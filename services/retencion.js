// Retención del IGV (3 %) de las compras: SOLO la bandera por empresa.
// Marsisa no es agente de retención, así que nace apagada. Si la empresa llega a designarse agente, se enciende en Tesorería › Detracciones › Configuración;
// el cálculo de la retención (base, descuento al pagar, constancia) todavía NO está implementado: mientras no exista, esta bandera no cambia ningún flujo.
const CLAVE = 'retencion_3_activa';
const NOTA = 'La retención del 3 % del IGV solo aplica si SUNAT designó a la empresa como agente de retención. Esta opción solo deja la marca: el cálculo de la retención aún no está implementado y no cambia ningún pago ni orden.';

/** ¿La empresa está marcada como agente de retención? `p`: pool con promesas. Cualquier falla de lectura cuenta como apagada. */
async function retencionActiva(p) {
    try {
        const [r] = await p.query('SELECT valor FROM configuracion_erp WHERE clave = ? LIMIT 1', [CLAVE]);
        return !!r.length && ['1', 'true', 'si', 'sí'].includes(String(r[0].valor || '').trim().toLowerCase());
    } catch (e) { return false; }
}

async function guardarRetencion(p, activa) {
    await p.query('INSERT INTO configuracion_erp (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', [CLAVE, activa ? '1' : '0']);
}

module.exports = { CLAVE, NOTA, retencionActiva, guardarRetencion };
