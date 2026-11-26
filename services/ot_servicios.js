// Servicios de terceros de una OT: una orden de servicio que se creó con OT se asigna sola a esa OT en cuanto se aprueba,
// y desde ese momento su costo suma en la OT (el costo de la OT cuenta las OC de servicio con ot_servicio_agregado = 1).
// Si la orden no tiene OT no se hace nada: el usuario la asigna a mano desde la pestaña Servicios de la OT.
const { audit: auditar } = require('./auditoria');

const OT_ANULADA = ['anulada', 'anulado'];

/**
 * @param tdb pool de la empresa (con o sin .promise())
 * @param {string} id código de la orden (ENT-2026-00123)
 * @param {object} actor quién aprobó, para la auditoría ({ userName } o lo que devuelve actorFrom)
 * @returns {Promise<null | { asignada: boolean, ot: string, otCerrada?: boolean, motivo?: string }>}
 *   null = no aplica (no es orden de servicio, no tiene OT o ya estaba asignada)
 */
async function asignarServicioAOT(tdb, id, actor) {
    try {
        const p = typeof tdb.promise === 'function' ? tdb.promise() : tdb;
        const [filas] = await p.query('SELECT tipo_orden, ot_id, ot_servicio_agregado FROM entradas_inv WHERE id = ? LIMIT 1', [id]);
        const e = filas && filas[0];
        if (!e || String(e.tipo_orden || '').toLowerCase() !== 'orden de servicio') return null;
        const ot = String(e.ot_id || '').trim();
        if (!ot || Number(e.ot_servicio_agregado) === 1) return null;

        const [ots] = await p.query('SELECT estado FROM ordenes_trabajo WHERE id_ot = ? OR ticket_entrada = ? LIMIT 1', [ot, ot]);
        if (!ots || !ots[0]) return { asignada: false, ot, motivo: `No se encontró la OT ${ot}; asigna el servicio a mano.` };
        const estadoOT = String(ots[0].estado || '').toLowerCase();
        if (OT_ANULADA.includes(estadoOT)) return { asignada: false, ot, motivo: `La OT ${ot} está anulada; asigna el servicio a otra OT.` };

        const [r] = await p.query(
            "UPDATE entradas_inv SET ot_servicio_agregado = 1 WHERE id = ? AND ot_id = ? AND ot_servicio_agregado = 0 AND LOWER(tipo_orden) = 'orden de servicio'",
            [id, ot]);
        if (r.affectedRows !== 1) return null;
        const otCerrada = ['finalizado', 'finalizada', 'cerrada', 'cerrado'].includes(estadoOT);
        auditar(tdb, actor || {}, {
            action: 'UPDATE', entity: 'warehouse-entry', entityId: id,
            summary: `Al aprobarse, el servicio ${id} se asignó automáticamente a la OT ${ot}${otCerrada ? ' (la OT ya estaba cerrada)' : ''}`,
            changes: { ot_servicio_agregado: { from: 0, to: 1 } },
        });
        return { asignada: true, ot, otCerrada };
    } catch (err) {
        console.error('[asignar servicio a OT]', id, err.message);
        return null;
    }
}

module.exports = { asignarServicioAOT };
