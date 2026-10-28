// Costo total de una OT: despachos de almacén, trabajos, entradas de servicio, materiales y repuestos.
// Lo usan GET /ordenes-trabajo (routes/taller.js) y los reportes del asistente: un solo cálculo.
// Va dentro de una consulta que tiene la tabla ordenes_trabajo con alias o.
const COSTO_OT_SQL = `ROUND(
    COALESCE((
        SELECT SUM(s.total_pen) 
        FROM salidas_inv s 
        WHERE (s.ticket_ot = o.ticket_entrada OR s.ticket_ot = o.id_ot) 
          AND LOWER(s.estado) = 'despachado'
    ), 0) +
    COALESCE((
        SELECT SUM(COALESCE(t.costo, 0) + COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.detalles_json, '$.costo')) AS DECIMAL(10,2)), 0))
        FROM trabajos_ot t 
        WHERE (t.ticket_visita = o.ticket_entrada OR t.ticket_visita = o.id_ot)
    ), 0) +
    COALESCE((
        SELECT SUM(e.total_pen)
        FROM entradas_inv e
        WHERE (e.ot_id = o.ticket_entrada OR e.ot_id = o.id_ot)
          AND LOWER(e.tipo_orden) = 'orden de servicio'
          AND e.ot_servicio_agregado = 1
          AND e.estado NOT IN ('Anulado', 'Anulada')
    ), 0) +
    COALESCE((
        SELECT SUM(COALESCE(m.costo_total, m.cantidad * m.costo_unit, 0))
        FROM ot_materiales m
        WHERE (m.ticket_ot = o.ticket_entrada OR m.ticket_ot = o.id_ot)
          AND LOWER(m.estado) = 'despachado'
    ), 0) +
    COALESCE((
        SELECT SUM(COALESCE(tr.total, tr.cantidad * tr.precio_unitario, 0))
        FROM trabajos_ot_repuestos tr
        WHERE (tr.id_ot = o.ticket_entrada OR tr.id_ot = o.id_ot)
    ), 0)
, 2)`;

module.exports = { COSTO_OT_SQL };
