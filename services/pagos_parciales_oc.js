// Pagos parciales de órdenes de compra (entradas_inv) con detracción (SPOT). Migración 57.
//   CUOTA   : la orden se paga en varios pagos que suman el total. La detracción de TODA la factura se deposita una sola vez,
//             en el primer pago que no sea adelanto; los siguientes son netos, sin detracción.
//   ENTREGA : el proveedor factura por partes; cada pago lleva la detracción proporcional a su parte (el pago que completa la
//             orden lleva el resto, para que la suma sea exacta). No se mezcla con cuotas ni con adelantos.
//   ADELANTO: pago a cuenta antes de la factura. Se registra sin detracción y se descuenta del saldo.
//             NOTA (pendiente del contador): cómo se calcula la detracción de un adelanto. No se inventó ningún criterio.
// Todo el pago (fila del pago, estado de la orden y egresos de Caja) va en una sola transacción con la orden bloqueada.
const detraccionOc = require('./detraccion');
const { equivalenciaOC } = require('./tesoreria_motivos_oc');

const r2 = detraccionOc.r2;
const TIPOS = ['CUOTA', 'ENTREGA', 'ADELANTO'];
const EPS = 0.004;
const esUsdTxt = t => /D[OÓ]L|USD|US\$/i.test(String(t || ''));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

/** Importe de la orden en su moneda (en dólares: total en soles ÷ T.C., como la pantalla de pago) */
function importeDeOrden(oc) {
    const tc = num(oc.tipo_cambio), total = num(oc.total_pen);
    return esUsdTxt(oc.moneda) && tc > 0 ? r2(total / tc) : r2(total);
}

/** Detracción de la orden: { codigo, pct, pen, origen (en la moneda de la orden) } o null si no lleva */
function detraccionDeOrden(oc, importe) {
    if (!oc.detraccion_codigo || !(num(oc.detraccion_monto_pen) > 0)) return null;
    const pct = num(oc.detraccion_pct), pen = num(oc.detraccion_monto_pen);
    return { codigo: oc.detraccion_codigo, pct, pen, origen: esUsdTxt(oc.moneda) ? r2(importe * pct / 100) : pen };
}

function resumirPagos(oc, filas) {
    const importe = importeDeOrden(oc);
    const pagado = r2(filas.reduce((a, f) => a + num(f.parte), 0));
    const modoFila = filas.find(f => f.tipo !== 'ADELANTO');
    return {
        importe, pagado, saldo: r2(Math.max(0, importe - pagado)),
        modo: modoFila ? modoFila.tipo : null,
        hayAdelantos: filas.some(f => f.tipo === 'ADELANTO'),
        detDepositadoPen: r2(filas.reduce((a, f) => a + num(f.detraccion_pen), 0)),
        detDepositadoOrigen: r2(filas.reduce((a, f) => a + num(f.detraccion_origen), 0)),
        pagos: filas.map(f => ({
            numero: f.numero, tipo: f.tipo, fecha: f.creado_en, parte: num(f.parte), neto: num(f.neto),
            detraccion_pen: num(f.detraccion_pen), detraccion_constancia: f.detraccion_constancia || null,
            numero_operacion: f.numero_operacion || '', factura_ref: f.factura_ref || '', usuario: f.usuario || '',
        })),
    };
}

/** ¿La orden ya tiene pagos parciales propios (no los de caja chica)? */
async function tienePagos(db, id) {
    const [r] = await db.query('SELECT 1 FROM entradas_inv_pagos WHERE entrada_id = ? LIMIT 1', [id]);
    return r.length > 0;
}

/** Resumen de pagos de varias órdenes: { [id]: resumen } solo para las que tienen pagos parciales */
async function resumenPorOrdenes(db, ocs) {
    const ids = ocs.map(o => o.id);
    if (!ids.length) return {};
    const [filas] = await db.query('SELECT * FROM entradas_inv_pagos WHERE entrada_id IN (?) ORDER BY entrada_id, numero', [ids]).catch(() => [[]]);
    const por = {};
    for (const f of filas) (por[f.entrada_id] = por[f.entrada_id] || []).push(f);
    const out = {};
    for (const oc of ocs) if (por[oc.id]) out[oc.id] = resumirPagos(oc, por[oc.id]);
    return out;
}

const fallo = (status, codigo, mensaje) => Object.assign(new Error(mensaje), { status, codigo });

/**
 * Registra un pago parcial. ctx: { db (pool con promesas), id, b (cuerpo), usuario, voucherUrl, numeroConstancia, cuentaOrigen,
 *   cuentaDestino, tipo ('CUOTA'|'ENTREGA'|'ADELANTO'), saldoCompleto (true: paga todo el saldo) }
 * Devuelve { numero, tipo, parte, neto, detraccion_pen, estado, saldo, oc, moneda }. Lanza Error con .status y .codigo.
 */
async function registrarPago(ctx) {
    const { db, id, b, usuario, voucherUrl, numeroConstancia, cuentaOrigen, cuentaDestino } = ctx;
    const tipo = String(ctx.tipo || '').toUpperCase();
    if (!TIPOS.includes(tipo)) throw fallo(400, 'modo_pago_invalido', 'El tipo de pago no es válido (cuota, entrega o adelanto).');
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [ocRows] = await conn.query('SELECT * FROM entradas_inv WHERE id = ? FOR UPDATE', [id]);
        if (!ocRows.length) throw fallo(404, 'no_encontrada', 'Orden de Compra no encontrada');
        const oc = ocRows[0];
        const estadoOc = String(oc.estado || '').toLowerCase().trim();
        if (!['aprobado', 'autorizado', 'pago parcial'].includes(estadoOc)) throw fallo(409, 'estado_invalido', `La orden de compra no se puede pagar: su estado actual es "${oc.estado}".`);
        const [filas] = await conn.query('SELECT * FROM entradas_inv_pagos WHERE entrada_id = ? ORDER BY numero', [id]);
        if (estadoOc === 'pago parcial' && !filas.length) throw fallo(409, 'pago_parcial_caja_chica', 'Esta orden tiene un pago parcial de caja chica: el resto se paga completo, no en cuotas.');

        const ocUsd = esUsdTxt(oc.moneda);
        const pagoUsd = b.moneda ? esUsdTxt(b.moneda) : (esUsdTxt(cuentaOrigen) || (ocUsd && !/SOLES/i.test(String(cuentaOrigen || ''))));
        if (ocUsd !== !!pagoUsd) throw fallo(400, 'moneda_parcial', 'Los pagos en partes se hacen desde una cuenta en la misma moneda de la orden.');
        if (String(b.nc_aplicaciones || '').replace(/[\s[\]]/g, '')) throw fallo(400, 'nc_parcial', 'Las notas de crédito se aplican en el pago completo, no en pagos parciales.');

        const st = resumirPagos(oc, filas);
        const importe = st.importe;
        if (st.saldo <= EPS) throw fallo(409, 'sin_saldo', 'La orden no tiene saldo pendiente.');
        if (tipo === 'CUOTA' && st.modo === 'ENTREGA') throw fallo(409, 'modo_mezclado', 'Esta orden se paga por entregas con factura parcial: registra el pago como entrega.');
        if (tipo === 'ENTREGA' && st.modo === 'CUOTA') throw fallo(409, 'modo_mezclado', 'Esta orden se paga en cuotas: registra el pago como cuota.');
        if (tipo === 'ENTREGA' && st.hayAdelantos) throw fallo(409, 'adelanto_entrega', 'Una orden con adelantos no se puede pagar por entregas: la detracción del adelanto está pendiente de validación del contador.');
        if (tipo === 'ADELANTO' && st.modo) throw fallo(409, 'adelanto_tardio', 'El adelanto es un pago anterior a la factura: ya hay cuotas o entregas registradas.');

        const parte = ctx.saldoCompleto ? st.saldo : r2(num(b.parte));
        if (!(parte > 0)) throw fallo(400, 'parte_invalida', tipo === 'ENTREGA' ? 'Escribe el importe de la factura parcial.' : 'Escribe el monto a pagar.');
        if (parte > st.saldo + EPS) throw fallo(409, 'parte_excede', `El monto (${parte.toFixed(2)}) supera el saldo pendiente (${st.saldo.toFixed(2)}).`);
        const completa = parte >= st.saldo - EPS;
        if (tipo === 'ADELANTO' && completa) throw fallo(409, 'adelanto_total', 'Un adelanto no puede cubrir todo el saldo: regístralo como cuota o como pago completo.');
        const parteFinal = completa ? st.saldo : parte;

        // Detracción de este pago
        const det = detraccionDeOrden(oc, importe);
        let detPen = 0, detOrigen = 0;
        if (det && tipo === 'CUOTA' && st.detDepositadoPen <= 0) { detPen = det.pen; detOrigen = det.origen; }
        else if (det && tipo === 'ENTREGA') {
            if (completa) { detPen = Math.max(0, r2(det.pen - st.detDepositadoPen)); detOrigen = Math.max(0, r2(det.origen - st.detDepositadoOrigen)); }
            else { detPen = Math.round(det.pen * parteFinal / importe); detOrigen = ocUsd ? r2(parteFinal * det.pct / 100) : detPen; }
        }
        const constanciaDet = String(b.detraccion_constancia || '').trim().slice(0, 60);
        let cuentaDetraccion = '';
        if (detPen > 0) {
            if (!constanciaDet) throw fallo(400, 'sin_constancia_detraccion', 'Escribe el N° de constancia del depósito de la detracción.');
            const [ctaDet] = await conn.query('SELECT banco, numero_cuenta FROM proveedor_cuentas_bancarias WHERE proveedor_id = ? AND detraccion = 1 AND estado = 1 ORDER BY principal DESC, id ASC LIMIT 1', [oc.proveedor_id || '']);
            if (!ctaDet.length) throw fallo(409, 'sin_cuenta_detraccion', 'El proveedor no tiene registrada su cuenta de detracciones (Banco de la Nación). Regístrala en Almacén › Proveedores antes de pagar.');
            cuentaDetraccion = `${ctaDet[0].banco} - ${ctaDet[0].numero_cuenta}`;
        }
        const neto = r2(parteFinal - detOrigen);
        if (!(neto > EPS)) throw fallo(409, 'neto_invalido', 'El monto no cubre la detracción que se retiene en este pago: aumenta el monto.');
        const montoEnviado = num(b.monto);
        if (montoEnviado > 0 && Math.abs(montoEnviado - neto) > 0.011) throw fallo(409, 'monto_distinto', `El monto a pagar (${montoEnviado.toFixed(2)}) no coincide con el neto calculado (${neto.toFixed(2)}). Actualiza la pantalla.`);

        const numero = (filas.length ? Math.max(...filas.map(f => f.numero)) : 0) + 1;
        const facturaRef = String(b.factura_ref || '').trim().slice(0, 100) || null;
        const saldoNuevo = r2(st.saldo - parteFinal);
        const nuevoEstado = saldoNuevo <= EPS ? 'Procesado' : 'Pago parcial';
        await conn.query(
            `INSERT INTO entradas_inv_pagos (entrada_id, numero, tipo, moneda, parte, detraccion_pen, detraccion_origen, detraccion_constancia, neto, numero_operacion, cuenta_origen, factura_ref, voucher_url, usuario)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, numero, tipo, ocUsd ? 'USD' : 'PEN', parteFinal, detPen, detOrigen, detPen > 0 ? constanciaDet : null, neto, numeroConstancia || '', cuentaOrigen || '', facturaRef, voucherUrl || null, usuario]);
        const [upd] = await conn.query(
            `UPDATE entradas_inv SET estado = ?, numero_operacion = ?, cuenta_bancaria_empresa = ?, url_voucher = COALESCE(?, url_voucher), pagado_por = ?,
                cuenta_bancaria_proveedor = COALESCE(NULLIF(?, ''), cuenta_bancaria_proveedor),
                detraccion_constancia = CASE WHEN ? > 0 AND detraccion_constancia IS NULL THEN ? ELSE detraccion_constancia END,
                detraccion_pagada_en = CASE WHEN ? > 0 AND detraccion_pagada_en IS NULL THEN NOW() ELSE detraccion_pagada_en END,
                fecha_pago = CASE WHEN ? = 'Procesado' THEN NOW() ELSE fecha_pago END
             WHERE id = ? AND LOWER(TRIM(estado)) IN ('aprobado', 'autorizado', 'pago parcial')`,
            [nuevoEstado, numeroConstancia || '', cuentaOrigen || '', voucherUrl || null, usuario, cuentaDestino || '', detPen, constanciaDet, detPen, nuevoEstado, id]);
        if (upd.affectedRows !== 1) throw fallo(409, 'ya_procesada', 'La orden de compra ya fue procesada por otro pago. No se registró un nuevo egreso.');

        // Egresos de Caja: el neto al proveedor y, si corresponde, el depósito de la detracción
        const anio = String(new Date().getFullYear());
        const [maxRow] = await conn.query('SELECT numero FROM tesoreria_caja WHERE serie = ? ORDER BY id DESC LIMIT 1', [anio]);
        let siguiente = 1;
        if (maxRow[0] && maxRow[0].numero) { const m = String(maxRow[0].numero).match(/\d+$/); if (m) siguiente = parseInt(m[0], 10) + 1; }
        const eq = equivalenciaOC(oc.sub_motivo);
        let motivo = eq ? eq.motivo : null;
        if (!eq) {
            const [cat] = await conn.query("SELECT motivo FROM tesoreria_motivos_gastos WHERE estado = 'ACTIVO' AND sub_motivo = ? LIMIT 1", [oc.sub_motivo || '']).catch(() => [[]]);
            motivo = (cat && cat[0] && cat[0].motivo) || 'COMPRA / ALMACÉN';
        }
        const subCaja = eq ? eq.sub : (oc.sub_motivo || 'PAGO REQUERIMIENTO');
        const etiqueta = tipo === 'ADELANTO' ? `ADELANTO ${numero}` : tipo === 'ENTREGA' ? `ENTREGA ${numero} (factura parcial${facturaRef ? ` ${facturaRef}` : ''})` : `CUOTA ${numero}`;
        const sqlCaja = `
            INSERT INTO tesoreria_caja (
                fecha, hora, fecha_valuta, hora_valuta, numero_constancia_deposito, numero_factura, serie, numero,
                orden_viaje, conductor, ruta_viaje, placa, autoriza, motivo, centro_costo, sub_motivo, modalidad_pago, moneda,
                tipo_persona, persona, tipo_movimiento, subtotal, retencion_detraccion, importe_total, tipo_cambio, descripcion,
                tipo_comprobante, cuenta_bancaria_persona, cuenta_bancaria_empresa, voucher_url, observacion, no_aplica_liquidacion,
                estado, usuario_creacion, usuario_aprobacion, fecha_aprobacion
            ) VALUES (
                DATE(UTC_TIMESTAMP() - INTERVAL 5 HOUR), TIME(UTC_TIMESTAMP() - INTERVAL 5 HOUR), DATE(UTC_TIMESTAMP() - INTERVAL 5 HOUR), TIME(UTC_TIMESTAMP() - INTERVAL 5 HOUR),
                ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?,
                'PROVEEDOR', ?, 'EGRESO', ?, ?, ?, ?, ?,
                'ORDEN DE COMPRA', ?, ?, ?, ?, 0,
                'PROCESADO', ?, ?, NOW()
            )`;
        const modalidad = String(cuentaOrigen || '').includes('CAJA') ? 'EFECTIVO' : 'TRANSFERENCIA';
        const autoriza = oc.autoriza || oc.aprobado_por || usuario;
        const detFila = detPen > 0 ? (ocUsd ? detOrigen : detPen) : 0;
        await conn.query(sqlCaja, [
            numeroConstancia || '', oc.documento_referencia || '', anio, String(siguiente).padStart(5, '0'),
            oc.ot_id || '', oc.placa || '', autoriza, motivo, oc.centro_costo || 'CC-100', subCaja, modalidad, ocUsd ? 'DOLARES' : 'SOLES',
            oc.proveedor_nombre || 'PROVEEDOR GENERAL', r2(neto + detFila), detFila, neto, oc.tipo_cambio || 1,
            `${oc.motivo_entrada || `ORDEN DE COMPRA: ${id}`} — ${etiqueta}`,
            cuentaDestino || oc.cuenta_bancaria_proveedor || '', cuentaOrigen || 'BCP - CTA CTE SOLES', voucherUrl || null,
            `PAGO PARCIAL OC ${id} | ${etiqueta} | Parte de la orden: ${parteFinal.toFixed(2)} | Saldo: ${saldoNuevo.toFixed(2)} | N° Constancia: ${numeroConstancia || ''}${tipo === 'ADELANTO' ? ' | Adelanto sin detracción (cálculo pendiente del contador)' : ''}`,
            oc.creado_por || usuario, oc.aprobado_por || oc.autoriza || usuario,
        ]);
        if (detPen > 0) {
            await conn.query(sqlCaja, [
                constanciaDet, oc.documento_referencia || '', anio, String(siguiente + 1).padStart(5, '0'),
                oc.ot_id || '', oc.placa || '', autoriza, motivo, oc.centro_costo || 'CC-100', subCaja, 'TRANSFERENCIA', 'SOLES',
                oc.proveedor_nombre || 'PROVEEDOR GENERAL', detPen, 0, detPen, 1,
                `DETRACCIÓN ${det.pct}% (${oc.detraccion_codigo}) - OC ${id}${oc.documento_referencia ? ` - ${oc.documento_referencia}` : ''} — ${etiqueta}`,
                cuentaDetraccion, String(b.cuenta_origen_detraccion || '').trim() || cuentaOrigen || 'BCP - CTA CTE SOLES', voucherUrl || null,
                `DEPÓSITO DE DETRACCIÓN OC ${id} | ${etiqueta} | N° Constancia: ${constanciaDet}`,
                oc.creado_por || usuario, oc.aprobado_por || oc.autoriza || usuario,
            ]);
        }
        await conn.commit();
        return { numero, tipo, parte: parteFinal, neto, detraccion_pen: detPen, estado: nuevoEstado, saldo: saldoNuevo, oc, moneda: ocUsd ? 'USD' : 'PEN' };
    } catch (e) {
        try { await conn.rollback(); } catch { /* sin transacción abierta */ }
        throw e;
    } finally {
        conn.release();
    }
}

module.exports = { registrarPago, tienePagos, resumenPorOrdenes, resumirPagos, importeDeOrden, detraccionDeOrden, TIPOS };
