// Costo por placa y margen por viaje (solo lectura).
// Costo por placa del periodo = combustible (vales) + repuestos (salidas a OT) + mano de obra (trabajos OT) + viáticos.
// Viáticos = gastos rendidos de liquidación de sus viajes + egresos de caja de la placa que no pertenecen a un viaje
//            (el anticipo de un viaje ya se cuenta como gasto rendido; contarlo otra vez duplicaría el costo).
// Margen del viaje = flete pactado (órdenes de servicio) − gastos de ruta (gastos rendidos del viaje).
// `pdb` es el pool con API de promesas del tenant actual.

const limpiarPlaca = s => String(s || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
const num = v => Number(v) || 0;

async function rentabilidadPeriodo(pdb, desde, hasta) {
    const porPlaca = new Map();
    const fila = placa => {
        if (!porPlaca.has(placa)) porPlaca.set(placa, { placa, combustible: 0, repuestos: 0, mano_obra: 0, viaticos: 0, total: 0 });
        return porPlaca.get(placa);
    };

    const [comb] = await pdb.query(
        `SELECT ov.placa_tracto AS placa, SUM(cv.importe) AS total
         FROM combustible_vales cv
         JOIN operaciones_ordenes_viaje ov ON UPPER(TRIM(ov.viaje)) = UPPER(TRIM(cv.viaje))
         WHERE DATE(cv.fecha) BETWEEN ? AND ? AND UPPER(cv.estado) NOT LIKE '%ANUL%'
         GROUP BY ov.placa_tracto`,
        [desde, hasta]
    );
    comb.forEach(r => { fila(limpiarPlaca(r.placa)).combustible += num(r.total); });

    const [rep] = await pdb.query(
        `SELECT o.placa AS placa, SUM(s.total_pen) AS total
         FROM salidas_inv s
         JOIN ordenes_trabajo o ON (s.ticket_ot = o.ticket_entrada OR s.ticket_ot = o.id_ot)
         WHERE DATE(s.fecha) BETWEEN ? AND ? AND UPPER(s.estado) <> 'ANULADO'
         GROUP BY o.placa`,
        [desde, hasta]
    );
    rep.forEach(r => { fila(limpiarPlaca(r.placa)).repuestos += num(r.total); });

    const [mo] = await pdb.query(
        `SELECT placa, SUM(costo) AS total FROM trabajos_ot
         WHERE DATE(fecha_trabajo) BETWEEN ? AND ?
         GROUP BY placa`,
        [desde, hasta]
    );
    mo.forEach(r => { fila(limpiarPlaca(r.placa)).mano_obra += num(r.total); });

    const [liqPlaca] = await pdb.query(
        `SELECT ov.placa_tracto AS placa, SUM(l.importe) AS total
         FROM tesoreria_liquidaciones_gastos l
         JOIN operaciones_ordenes_viaje ov ON UPPER(TRIM(ov.viaje)) = UPPER(TRIM(l.orden_viaje))
         WHERE DATE(l.fecha) BETWEEN ? AND ? AND UPPER(l.estado) <> 'RECHAZADO'
         GROUP BY ov.placa_tracto`,
        [desde, hasta]
    );
    liqPlaca.forEach(r => { fila(limpiarPlaca(r.placa)).viaticos += num(r.total); });

    const [cajaPlaca] = await pdb.query(
        `SELECT placa, SUM(importe_total) AS total
         FROM tesoreria_caja
         WHERE tipo_movimiento = 'EGRESO' AND UPPER(estado) NOT LIKE '%ANUL%'
           AND (orden_viaje IS NULL OR TRIM(orden_viaje) = '')
           AND DATE(fecha) BETWEEN ? AND ?
         GROUP BY placa`,
        [desde, hasta]
    );
    cajaPlaca.forEach(r => { fila(limpiarPlaca(r.placa)).viaticos += num(r.total); });

    porPlaca.forEach(f => {
        f.total = +(f.combustible + f.repuestos + f.mano_obra + f.viaticos).toFixed(2);
        ['combustible', 'repuestos', 'mano_obra', 'viaticos'].forEach(k => { f[k] = +f[k].toFixed(2); });
    });

    // Margen por viaje del periodo
    const [viajes] = await pdb.query(
        `SELECT ov.viaje, ov.placa_tracto AS placa, DATE(ov.fecha_viaje) AS fecha
         FROM operaciones_ordenes_viaje ov
         WHERE DATE(ov.fecha_viaje) BETWEEN ? AND ? AND UPPER(ov.estado) <> 'ANULADO'`,
        [desde, hasta]
    );
    const [flete] = await pdb.query(
        `SELECT UPPER(TRIM(os.viaje_asignado)) AS viaje, SUM(os.costo_flete) AS total
         FROM operaciones_ordenes_servicio os
         JOIN operaciones_ordenes_viaje ov ON UPPER(TRIM(ov.viaje)) = UPPER(TRIM(os.viaje_asignado))
         WHERE DATE(ov.fecha_viaje) BETWEEN ? AND ?
         GROUP BY UPPER(TRIM(os.viaje_asignado))`,
        [desde, hasta]
    );
    const [gastosViaje] = await pdb.query(
        `SELECT UPPER(TRIM(l.orden_viaje)) AS viaje, SUM(l.importe) AS total
         FROM tesoreria_liquidaciones_gastos l
         JOIN operaciones_ordenes_viaje ov ON UPPER(TRIM(ov.viaje)) = UPPER(TRIM(l.orden_viaje))
         WHERE DATE(ov.fecha_viaje) BETWEEN ? AND ? AND UPPER(l.estado) <> 'RECHAZADO'
         GROUP BY UPPER(TRIM(l.orden_viaje))`,
        [desde, hasta]
    );
    const fleteDe = new Map(flete.map(r => [String(r.viaje), num(r.total)]));
    const gastosDe = new Map(gastosViaje.map(r => [String(r.viaje), num(r.total)]));
    const viajesOut = viajes.map(v => {
        const clave = String(v.viaje || '').trim().toUpperCase();
        const f = fleteDe.get(clave) || 0;
        const g = gastosDe.get(clave) || 0;
        return { viaje: v.viaje, placa: limpiarPlaca(v.placa), fecha: v.fecha, flete: +f.toFixed(2), gastos_ruta: +g.toFixed(2), margen: +(f - g).toFixed(2) };
    });

    return {
        desde, hasta,
        por_placa: [...porPlaca.values()].sort((a, b) => b.total - a.total),
        viajes: viajesOut,
    };
}

module.exports = { rentabilidadPeriodo };
