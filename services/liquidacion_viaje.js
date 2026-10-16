// Liquidación de viajes: un viaje FINALIZADO pasa a LIQUIDADO cuando su saldo cuadra
// (depósitos de caja menos devoluciones, contra los gastos rendidos). Si deja de cuadrar, vuelve a FINALIZADO.
// `pdb` es el pool con API de promesas del tenant actual (el mismo que usan tesorería y operaciones).

const TOLERANCIA = 0.01;

async function recalcularLiquidacionViaje(pdb, orden) {
    const viaje = String(orden || '').trim();
    if (!pdb || !viaje) return null;

    const [viajes] = await pdb.query(
        'SELECT estado FROM operaciones_ordenes_viaje WHERE UPPER(TRIM(viaje)) = UPPER(?) LIMIT 1',
        [viaje]
    );
    if (!viajes.length) return null;
    const estado = String(viajes[0].estado || '').toUpperCase();
    if (estado !== 'FINALIZADO' && estado !== 'LIQUIDADO') return null;

    const [cajas] = await pdb.query(
        `SELECT tipo_movimiento, SUM(importe_total) AS total
         FROM tesoreria_caja
         WHERE UPPER(TRIM(orden_viaje)) = UPPER(?) AND UPPER(estado) != 'ANULADO'
         GROUP BY tipo_movimiento`,
        [viaje]
    );
    let depositado = 0;
    let devuelto = 0;
    cajas.forEach(c => {
        const t = parseFloat(c.total || 0);
        if (c.tipo_movimiento === 'INGRESO') devuelto += t;
        else depositado += t;
    });

    const [gastos] = await pdb.query(
        `SELECT SUM(importe) AS total_gastos FROM tesoreria_liquidaciones_gastos
         WHERE UPPER(TRIM(orden_viaje)) = UPPER(?) AND estado != 'RECHAZADO'`,
        [viaje]
    );
    const rendido = parseFloat((gastos && gastos[0] && gastos[0].total_gastos) || 0);

    // Sin ningún movimiento de dinero no hay nada que liquidar: el viaje se queda como está
    if (depositado === 0 && devuelto === 0 && rendido === 0) return estado;

    const diferencia = (depositado - devuelto) - rendido;
    const cuadrado = Math.abs(diferencia) <= TOLERANCIA;

    if (cuadrado && estado === 'FINALIZADO') {
        await pdb.query("UPDATE operaciones_ordenes_viaje SET estado = 'LIQUIDADO' WHERE UPPER(TRIM(viaje)) = UPPER(?) AND estado = 'FINALIZADO'", [viaje]);
        return 'LIQUIDADO';
    }
    if (!cuadrado && estado === 'LIQUIDADO') {
        await pdb.query("UPDATE operaciones_ordenes_viaje SET estado = 'FINALIZADO' WHERE UPPER(TRIM(viaje)) = UPPER(?) AND estado = 'LIQUIDADO'", [viaje]);
        return 'FINALIZADO';
    }
    return estado;
}

module.exports = { recalcularLiquidacionViaje };
