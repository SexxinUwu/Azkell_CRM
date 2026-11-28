// Detracciones (SPOT): reportes de Tesorería y cruce con el SIRE de compras. Solo lectura sobre los datos que el sistema ya guarda
// (entradas_inv y sire_comprobantes); no llama a SUNAT.
const { calcular, r2, num } = require('./detraccion');

// Estados de la orden desde los que la detracción ya se puede depositar (la orden fue aprobada o se pagó)
const ESTADOS_PAGABLES = new Set(['aprobado', 'autorizado', 'pago parcial', 'procesado', 'pagado', 'recibido', 'finalizado']);
const EXCLUIDA = /anul|rechaz/i;
const fechaValida = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

/** DEPOSITADA (con constancia) · PENDIENTE (orden aprobada o procesada sin constancia) · POR_APROBAR (la orden aún no se aprueba) */
function estadoDetraccion(fila) {
    if (fila.detraccion_constancia) return 'DEPOSITADA';
    return ESTADOS_PAGABLES.has(String(fila.estado || '').trim().toLowerCase()) ? 'PENDIENTE' : 'POR_APROBAR';
}

/**
 * Listado de detracciones de las órdenes de compra, con resumen por estado, proveedor y mes.
 * filtros: { desde, hasta, proveedor (id), estado (DEPOSITADA|PENDIENTE|POR_APROBAR), por ('orden'|'deposito') }
 * `p` es un pool con promesas.
 */
async function reporte(p, filtros = {}) {
    const por = filtros.por === 'deposito' ? 'deposito' : 'orden';
    const desde = fechaValida(filtros.desde); const hasta = fechaValida(filtros.hasta);
    const cond = ['e.detraccion_codigo IS NOT NULL', 'COALESCE(e.detraccion_monto_pen, 0) > 0', "UPPER(COALESCE(e.estado, '')) NOT LIKE 'ANUL%'", "UPPER(COALESCE(e.estado, '')) NOT LIKE 'RECHAZ%'"];
    const par = [];
    // Por fecha de depósito solo cuentan las que ya se depositaron
    const campoFecha = por === 'deposito' ? 'DATE(e.detraccion_pagada_en)' : 'DATE(e.fecha)';
    if (por === 'deposito') cond.push('e.detraccion_pagada_en IS NOT NULL');
    if (desde) { cond.push(`${campoFecha} >= ?`); par.push(desde); }
    if (hasta) { cond.push(`${campoFecha} <= ?`); par.push(hasta); }
    const [filas] = await p.query(
        `SELECT e.id, DATE_FORMAT(e.fecha, '%Y-%m-%d') AS fecha, e.proveedor_id, e.proveedor_nombre, pv.numero_documento AS ruc, e.documento_referencia, e.moneda, e.tipo_cambio, e.total_pen, e.estado,
                e.detraccion_codigo, e.detraccion_pct, e.detraccion_tc, e.detraccion_monto_pen, e.detraccion_constancia,
                DATE_FORMAT(e.detraccion_pagada_en, '%Y-%m-%d') AS detraccion_pagada_en
         FROM entradas_inv e
         LEFT JOIN proveedores_inv pv ON CAST(pv.id AS CHAR) = CAST(e.proveedor_id AS CHAR)
         WHERE ${cond.join(' AND ')} ORDER BY e.fecha DESC, e.id DESC LIMIT 20000`, par);
    // El catálogo se lee aparte: sus textos usan otra collation que entradas_inv y no se pueden unir en SQL
    const [tiposRows] = await p.query('SELECT codigo, descripcion, monto_minimo FROM detraccion_tipos');
    const tipos = new Map(tiposRows.map(t => [String(t.codigo), t]));

    const todas = filas.map(f => {
        const usd = String(f.moneda || '').toUpperCase() === 'USD';
        const tcOrden = num(f.tipo_cambio) || 1;
        const totalPen = num(f.total_pen);
        const totalOrigen = usd ? r2(totalPen / tcOrden) : r2(totalPen);
        const pct = num(f.detraccion_pct);
        const montoPen = num(f.detraccion_monto_pen);
        const montoOrigen = usd ? r2(totalOrigen * pct / 100) : montoPen;
        const estadoDet = estadoDetraccion(f);
        return {
            id: f.id, fecha: f.fecha, proveedor_id: f.proveedor_id, proveedor: f.proveedor_nombre || '(sin proveedor)', ruc: f.ruc || null,
            factura: f.documento_referencia || null, moneda: usd ? 'USD' : 'PEN', total_origen: totalOrigen, total_pen: r2(totalPen),
            estado_orden: f.estado, codigo: f.detraccion_codigo, tipo: (tipos.get(String(f.detraccion_codigo)) || {}).descripcion || null, pct, tc: f.detraccion_tc == null ? null : num(f.detraccion_tc),
            monto_pen: montoPen, monto_origen: montoOrigen, neto_origen: r2(totalOrigen - montoOrigen),
            estado: estadoDet, constancia: f.detraccion_constancia || null, depositada_en: f.detraccion_pagada_en || null,
        };
    });

    // Proveedores del rango (antes de filtrar por proveedor o estado) para el selector de la pantalla
    const mapaProv = new Map();
    for (const f of todas) if (!mapaProv.has(f.proveedor_id || f.proveedor)) mapaProv.set(f.proveedor_id || f.proveedor, { value: f.proveedor_id || '', label: f.proveedor });
    const proveedores = [...mapaProv.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));

    const prov = String(filtros.proveedor || '').trim();
    const est = String(filtros.estado || '').trim().toUpperCase();
    const datos = todas.filter(f => (!prov || f.proveedor_id === prov) && (!est || f.estado === est));

    const vacio = () => ({ n: 0, monto_pen: 0 });
    const resumen = { pendiente: vacio(), depositada: vacio(), por_aprobar: vacio(), total: vacio() };
    const clave = { PENDIENTE: 'pendiente', DEPOSITADA: 'depositada', POR_APROBAR: 'por_aprobar' };
    const porProv = new Map(); const porMes = new Map();
    for (const f of datos) {
        for (const k of [clave[f.estado], 'total']) { resumen[k].n += 1; resumen[k].monto_pen = r2(resumen[k].monto_pen + f.monto_pen); }
        const kp = f.proveedor_id || f.proveedor;
        const gp = porProv.get(kp) || { proveedor_id: f.proveedor_id, proveedor: f.proveedor, ruc: f.ruc, n: 0, pendiente_pen: 0, depositada_pen: 0, por_aprobar_pen: 0, total_pen: 0 };
        gp.n += 1; gp.total_pen = r2(gp.total_pen + f.monto_pen);
        gp[`${clave[f.estado]}_pen`] = r2(gp[`${clave[f.estado]}_pen`] + f.monto_pen);
        porProv.set(kp, gp);
        const mes = String((por === 'deposito' && f.depositada_en) || f.fecha || '').slice(0, 7) || 'sin fecha';
        const gm = porMes.get(mes) || { mes, n: 0, pendiente_pen: 0, depositada_pen: 0, por_aprobar_pen: 0, total_pen: 0 };
        gm.n += 1; gm.total_pen = r2(gm.total_pen + f.monto_pen);
        gm[`${clave[f.estado]}_pen`] = r2(gm[`${clave[f.estado]}_pen`] + f.monto_pen);
        porMes.set(mes, gm);
    }
    return {
        datos, proveedores, resumen,
        por_proveedor: [...porProv.values()].sort((a, b) => b.total_pen - a.total_pen),
        por_mes: [...porMes.values()].sort((a, b) => (a.mes < b.mes ? 1 : -1)),
    };
}


// ───────────────────────── Cruce con el SIRE de compras ─────────────────────────
const sinCeros = v => String(v || '').replace(/\D/g, '').replace(/^0+/, '');
/** «F001-00012345» → { serie: 'F001', n: '12345' } (igual que el cruce de compras de Contabilidad) */
function partes(t) {
    const s = String(t || '').toUpperCase();
    const m = /([A-Z0-9]{4})\s*[-–]\s*0*(\d+)/.exec(s);
    return m ? { serie: m[1], n: m[2] } : { serie: '', n: sinCeros(s) };
}
/** ¿La columna «Detracción» del SIRE dice algo? Devuelve { marca, monto } (monto solo si viene un número mayor que 0) */
function marcaSire(raw) {
    const t = String(raw ?? '').trim();
    if (!t || /^(0+([.,]0+)?|no|n|-|nulo|null)$/i.test(t)) return { marca: false, monto: null };
    const n = Number(t.replace(/,/g, ''));
    return { marca: true, monto: Number.isFinite(n) && n > 0 ? n : null };
}
const NIVEL = { alta: 3, media: 2, info: 1, ok: 0 };
const TOL_TOTAL = 0.05;     // diferencia aceptada en el total por redondeo
const TOL_DETRACCION = 1;   // la detracción se redondea al sol

const LIMITACIONES = [
    'El SIRE de compras no siempre informa la detracción: si la columna viene vacía, solo se compara por documento y total; la detracción se recalcula con el total del SIRE y el porcentaje de la orden.',
    'Si una factura de servicio no tiene detracción registrada en la orden, no se puede saber con el SIRE si le correspondía (depende del tipo de servicio).',
    'El cruce solo usa los períodos del SIRE que ya se cargaron en Contabilidad › SIRE; no consulta SUNAT.',
    '«Factura sin orden» compara solo con órdenes de compra: puede estar registrada como vale de combustible, caja o nota de crédito.',
];

/**
 * Cruza las órdenes de compra con los comprobantes de COMPRAS del SIRE ya guardados.
 * filtros: { desde, hasta } (fecha de la orden y fecha de emisión del comprobante). `p`: pool con promesas.
 */
async function cruceSire(p, filtros = {}) {
    const desde = fechaValida(filtros.desde); const hasta = fechaValida(filtros.hasta);
    const [periodosRows] = await p.query("SELECT periodo, COUNT(*) AS filas FROM sire_comprobantes WHERE libro = 'COMPRAS' GROUP BY periodo ORDER BY periodo");
    const periodos = periodosRows.map(r => ({ periodo: r.periodo, filas: Number(r.filas) }));
    const cargados = new Set(periodos.map(x => x.periodo));

    const cond = ["COALESCE(e.documento_referencia, '') <> ''", "UPPER(COALESCE(e.estado, '')) NOT LIKE 'ANUL%'", "UPPER(COALESCE(e.estado, '')) NOT LIKE 'RECHAZ%'"];
    const par = [];
    if (desde) { cond.push('DATE(e.fecha) >= ?'); par.push(desde); }
    if (hasta) { cond.push('DATE(e.fecha) <= ?'); par.push(hasta); }
    const [ordenes] = await p.query(
        `SELECT e.id, DATE_FORMAT(e.fecha, '%Y-%m-%d') AS fecha, e.proveedor_nombre, pv.numero_documento AS ruc, e.documento_referencia, e.moneda, e.tipo_cambio, e.total_pen, e.estado,
                e.detraccion_codigo, e.detraccion_pct, e.detraccion_tc, e.detraccion_monto_pen
         FROM entradas_inv e
         LEFT JOIN proveedores_inv pv ON CAST(pv.id AS CHAR) = CAST(e.proveedor_id AS CHAR)
         WHERE ${cond.join(' AND ')} ORDER BY e.fecha DESC LIMIT 20000`, par);
    const [tiposRows] = await p.query('SELECT codigo, monto_minimo FROM detraccion_tipos');
    const minimos = new Map(tiposRows.map(t => [String(t.codigo), num(t.monto_minimo)]));
    const [sire] = await p.query(
        `SELECT id, periodo, DATE_FORMAT(fecha_emision, '%Y-%m-%d') AS fecha_emision, tipo_cp, serie, numero, doc_numero, razon_social, total, moneda, tipo_cambio, detraccion, estado_comp
         FROM sire_comprobantes WHERE libro = 'COMPRAS' AND COALESCE(tipo_cp, '') NOT IN ('07', '08') LIMIT 60000`);

    const indice = new Map();
    for (const s of sire) {
        const k = `${String(s.doc_numero || '').trim()}|${sinCeros(s.numero)}`;
        if (!indice.has(k)) indice.set(k, []);
        indice.get(k).push(s);
    }
    const usados = new Set();
    const filas = [];

    for (const o of ordenes) {
        const usd = String(o.moneda || '').toUpperCase() === 'USD';
        const tcOrden = num(o.tipo_cambio) || 1;
        const totalPen = num(o.total_pen);
        const totalOrigen = usd ? r2(totalPen / tcOrden) : r2(totalPen);
        const f = partes(o.documento_referencia);
        const hallazgos = [];
        const agregar = (codigo, nivel, texto) => hallazgos.push({ codigo, nivel, texto });
        const det = o.detraccion_codigo && num(o.detraccion_monto_pen) > 0
            ? { codigo: o.detraccion_codigo, pct: num(o.detraccion_pct), tc: o.detraccion_tc == null ? null : num(o.detraccion_tc), monto_pen: num(o.detraccion_monto_pen) } : null;

        const cands = f.n ? (indice.get(`${String(o.ruc || '').trim()}|${f.n}`) || []) : [];
        const s = cands.find(c => !f.serie || String(c.serie || '').toUpperCase() === f.serie) || cands[0] || null;
        if (!det && !s) continue;   // una orden sin detracción y fuera del SIRE no aporta al cruce de detracciones
        if (s) {
            usados.add(s.id);
            if (f.serie && String(s.serie || '').toUpperCase() !== f.serie) agregar('SERIE_DISTINTA', 'media', `La serie de la orden (${f.serie}) no es la del SIRE (${s.serie || '—'}).`);
            const sUsd = String(s.moneda || '').toUpperCase() === 'USD';
            if (sUsd !== usd) {
                agregar('MONEDA_DISTINTA', 'alta', `La orden está en ${usd ? 'dólares' : 'soles'} y la factura del SIRE en ${sUsd ? 'dólares' : 'soles'}.`);
            } else if (Math.abs(num(s.total) - totalOrigen) > TOL_TOTAL) {
                agregar('TOTAL_DISTINTO', 'alta', `Total de la orden ${totalOrigen.toFixed(2)} y del SIRE ${num(s.total).toFixed(2)} (${usd ? 'US$' : 'S/'}): diferencia de ${(num(s.total) - totalOrigen).toFixed(2)}.`);
            }
            const m = marcaSire(s.detraccion);
            if (m.marca && !det) agregar('SIRE_CON_DETRACCION', 'alta', 'El SIRE marca detracción en esta factura y la orden no tiene detracción registrada.');
            if (det) {
                if (m.marca && m.monto != null && Math.abs(m.monto - det.monto_pen) > TOL_DETRACCION) {
                    agregar('DETRACCION_DISTINTA', 'alta', `Detracción de la orden S/ ${det.monto_pen.toFixed(2)} y del SIRE S/ ${m.monto.toFixed(2)}.`);
                } else if (sUsd === usd) {
                    // Se recalcula con el total del SIRE y el porcentaje y T.C. guardados en la orden
                    const c = calcular({ moneda: usd ? 'USD' : 'PEN', totalOrigen: num(s.total), tipoCambio: det.tc || tcOrden, pct: det.pct, minimo: minimos.get(String(o.detraccion_codigo)) || 0 });
                    if (!c.aplica) agregar('DETRACCION_NO_APLICA', 'media', `Con el total del SIRE la detracción no aplica: ${c.motivo || 'bajo el mínimo'}.`);
                    else if (Math.abs(c.monto_pen - det.monto_pen) > TOL_DETRACCION) agregar('DETRACCION_DISTINTA', 'alta', `La orden retiene S/ ${det.monto_pen.toFixed(2)}; con el total del SIRE correspondería S/ ${c.monto_pen.toFixed(2)}.`);
                }
                if (!m.marca) agregar('SIRE_SIN_DATO_DETRACCION', 'info', 'El SIRE no informa detracción en esta factura: no se puede validar con el SIRE.');
            }
        } else if (!f.n) {
            agregar('FACTURA_ILEGIBLE', 'media', 'No se pudo leer el número de la factura en el documento de la orden.');
        } else if (!periodos.length) {
            agregar('SIN_SIRE_CARGADO', 'info', 'No hay compras del SIRE cargadas: no se puede validar.');
        } else {
            // ¿Hay SIRE cargado de la fecha de la orden en adelante? (la factura pudo declararse hasta un par de meses después)
            const mesOrden = String(o.fecha || '').slice(0, 7).replace('-', '');
            const hayPosterior = periodos.some(x => x.periodo >= mesOrden);
            if (hayPosterior) agregar('NO_EN_SIRE', det ? 'alta' : 'media', 'La factura de la orden no aparece en las compras del SIRE cargadas.');
            else agregar('SIN_SIRE_CARGADO', 'info', `El SIRE cargado no llega al período ${mesOrden}: no se puede validar.`);
        }
        const nivel = hallazgos.reduce((m, h) => (NIVEL[h.nivel] > NIVEL[m] ? h.nivel : m), 'ok');
        filas.push({
            clave: `O-${o.id}`, origen: 'ORDEN', nivel, hallazgos,
            orden: { id: o.id, fecha: o.fecha, proveedor: o.proveedor_nombre, ruc: o.ruc || null, factura: o.documento_referencia, moneda: usd ? 'USD' : 'PEN', total: totalOrigen, estado: o.estado, detraccion: det },
            sire: s ? { id: s.id, periodo: s.periodo, fecha_emision: s.fecha_emision, tipo_cp: s.tipo_cp, serie: s.serie, numero: s.numero, moneda: s.moneda, total: num(s.total), detraccion: s.detraccion || null } : null,
        });
    }

    // Facturas del SIRE del rango sin orden de compra
    for (const s of sire) {
        if (usados.has(s.id) || s.tipo_cp !== '01') continue;
        if ((desde && s.fecha_emision < desde) || (hasta && s.fecha_emision > hasta)) continue;
        const totalPen = String(s.moneda || '').toUpperCase() === 'USD' ? num(s.total) * (num(s.tipo_cambio) || 0) : num(s.total);
        const m = marcaSire(s.detraccion);
        const texto = `Factura de ${s.razon_social || s.doc_numero || 'proveedor'} sin orden de compra${m.marca ? ' (el SIRE marca detracción)' : totalPen >= 700 ? ' (supera S/ 700: podría llevar detracción)' : ''}.`;
        filas.push({
            clave: `S-${s.id}`, origen: 'SIRE', nivel: m.marca ? 'alta' : 'media', hallazgos: [{ codigo: 'SIRE_SIN_ORDEN', nivel: m.marca ? 'alta' : 'media', texto }],
            orden: null,
            sire: { id: s.id, periodo: s.periodo, fecha_emision: s.fecha_emision, tipo_cp: s.tipo_cp, serie: s.serie, numero: s.numero, moneda: s.moneda, total: num(s.total), detraccion: s.detraccion || null, proveedor: s.razon_social, ruc: s.doc_numero },
        });
    }

    const conteo = {};
    for (const f of filas) for (const h of f.hallazgos) conteo[h.codigo] = (conteo[h.codigo] || 0) + 1;
    const resumen = {
        ordenes: filas.filter(f => f.origen === 'ORDEN').length,
        con_diferencias: filas.filter(f => NIVEL[f.nivel] >= NIVEL.media).length,
        coinciden: filas.filter(f => f.origen === 'ORDEN' && f.sire && NIVEL[f.nivel] <= NIVEL.info).length,
        sin_validar: filas.filter(f => f.hallazgos.some(h => h.codigo === 'SIN_SIRE_CARGADO')).length,
        por_hallazgo: conteo,
    };
    filas.sort((a, b) => NIVEL[b.nivel] - NIVEL[a.nivel] || String((b.orden || b.sire).fecha || (b.sire && b.sire.fecha_emision) || '').localeCompare(String((a.orden || a.sire).fecha || (a.sire && a.sire.fecha_emision) || '')));
    return { datos: filas, resumen, periodos_sire: periodos, periodos_cargados: [...cargados], limitaciones: LIMITACIONES };
}

module.exports = { reporte, cruceSire, estadoDetraccion, marcaSire, partes };
