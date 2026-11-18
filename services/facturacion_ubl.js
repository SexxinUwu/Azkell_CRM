// Facturación electrónica: cálculos y documento UBL 2.1 (formato JSON de APISUNAT, nodos cbc:/cac: con _text) para
// factura (01), boleta (03) y nota de crédito (07). La estructura sigue el estándar de SUNAT; se valida emitiendo primero en modo Prueba.

const IGV_PCT = 18;
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = v => Math.round((num(v) + Number.EPSILON) * 100) / 100;

/** Totales a partir de líneas con valor unitario SIN IGV */
function calcular(items, { afectoIgv = true, detraccionPct = 0, tipoCambio = 1, moneda = 'PEN' } = {}) {
    const lineas = items.map(it => {
        const base = r2(num(it.cantidad || 1) * num(it.valor_unitario));
        // El IGV sale del valor sin redondear: así un flete que incluye IGV (p. ej. S/ 5,000) vuelve a sumar exactamente S/ 5,000.00
        const igv = afectoIgv ? r2(num(it.cantidad || 1) * num(it.valor_unitario) * IGV_PCT / 100) : 0;
        return { ...it, base, igv };
    });
    const base = r2(lineas.reduce((s, l) => s + l.base, 0));
    const igv = r2(lineas.reduce((s, l) => s + l.igv, 0));
    const total = r2(base + igv);
    // La detracción siempre es en soles y se redondea al sol (como en las facturas que emite SUNAT)
    const totalSoles = String(moneda).toUpperCase() === 'USD' ? r2(total * (num(tipoCambio) || 1)) : total;
    const detraccion = num(detraccionPct) > 0 ? Math.round(totalSoles * num(detraccionPct) / 100) : 0;
    const neto = String(moneda).toUpperCase() === 'USD' ? total : r2(total - detraccion);
    return { lineas, base, igv, total, detraccion, neto_pendiente: neto };
}

// ── Monto en letras: «OCHENTA Y TRES MIL DOSCIENTOS SIETE Y 41/100 SOLES» ──
const UN = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE'];
const DE = ['', '', 'VEINTI', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CE = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
function bajoMil(n) {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    const c = Math.floor(n / 100); const r = n % 100; let s = CE[c];
    if (r > 0) {
        if (r <= 20) s += (s ? ' ' : '') + UN[r];
        else {
            const d = Math.floor(r / 10); const u = r % 10;
            if (d === 2) s += (s ? ' ' : '') + (u === 0 ? 'VEINTE' : 'VEINTI' + UN[u]);
            else s += (s ? ' ' : '') + DE[d] + (u ? ' Y ' + UN[u] : '');
        }
    }
    return s.trim();
}
function enteroALetras(n) {
    if (n === 0) return 'CERO';
    const mill = Math.floor(n / 1000000); const mil = Math.floor((n % 1000000) / 1000); const resto = n % 1000;
    let s = '';
    if (mill) s += (mill === 1 ? 'UN MILLON' : enteroALetras(mill) + ' MILLONES') + ' ';
    if (mil) s += (mil === 1 ? 'MIL' : bajoMil(mil).replace(/UNO$/, 'UN') + ' MIL') + ' ';
    if (resto) s += bajoMil(resto);
    return s.trim().replace(/VEINTIUNO/g, 'VEINTIUN');
}
function montoEnLetras(monto, moneda) {
    const m = r2(monto); const ent = Math.floor(m); const cent = Math.round((m - ent) * 100);
    const nombre = String(moneda).toUpperCase() === 'USD' ? 'DOLARES AMERICANOS' : 'SOLES';
    return `${enteroALetras(ent)} Y ${String(cent).padStart(2, '0')}/100 ${nombre}`;
}

const t = v => ({ _text: v });
const mon = (v, cur) => ({ _attributes: { currencyID: cur }, _text: v });

function partes(emisor, cliente) {
    return {
        'cac:AccountingSupplierParty': {
            'cac:Party': {
                'cac:PartyIdentification': { 'cbc:ID': { _attributes: { schemeID: '6' }, _text: String(emisor.ruc) } },
                'cac:PartyName': { 'cbc:Name': t(emisor.razon_social) },
                'cac:PartyLegalEntity': {
                    'cbc:RegistrationName': t(emisor.razon_social),
                    'cac:RegistrationAddress': { 'cbc:AddressTypeCode': t('0000') },
                },
            },
        },
        'cac:AccountingCustomerParty': {
            'cac:Party': {
                'cac:PartyIdentification': { 'cbc:ID': { _attributes: { schemeID: String(cliente.doc_tipo || '6') }, _text: String(cliente.doc) } },
                'cac:PartyLegalEntity': {
                    'cbc:RegistrationName': t(cliente.nombre),
                    ...(cliente.direccion ? { 'cac:RegistrationAddress': { 'cac:AddressLine': { 'cbc:Line': t(String(cliente.direccion).slice(0, 200)) } } } : {}),
                },
            },
        },
    };
}

function totalesIgv(c, cur) {
    return {
        'cac:TaxTotal': {
            'cbc:TaxAmount': mon(c.igv, cur),
            'cac:TaxSubtotal': [{
                'cbc:TaxableAmount': mon(c.base, cur),
                'cbc:TaxAmount': mon(c.igv, cur),
                'cac:TaxCategory': { 'cac:TaxScheme': { 'cbc:ID': t('1000'), 'cbc:Name': t('IGV'), 'cbc:TaxTypeCode': t('VAT') } },
            }],
        },
    };
}

function lineaUbl(l, i, cur, afecto, tag) {
    const precioConIgv = afecto ? r2(num(l.valor_unitario) * (1 + IGV_PCT / 100)) : r2(l.valor_unitario);
    return {
        'cbc:ID': t(i + 1),
        [tag === 'cn' ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity']: { _attributes: { unitCode: l.unidad || 'ZZ' }, _text: num(l.cantidad || 1) },
        'cbc:LineExtensionAmount': mon(l.base, cur),
        'cac:PricingReference': { 'cac:AlternativeConditionPrice': { 'cbc:PriceAmount': mon(precioConIgv, cur), 'cbc:PriceTypeCode': t('01') } },
        'cac:TaxTotal': {
            'cbc:TaxAmount': mon(l.igv, cur),
            'cac:TaxSubtotal': [{
                'cbc:TaxableAmount': mon(l.base, cur),
                'cbc:TaxAmount': mon(l.igv, cur),
                'cac:TaxCategory': {
                    'cbc:Percent': t(afecto ? IGV_PCT : 0),
                    'cbc:TaxExemptionReasonCode': t(afecto ? '10' : '30'),
                    'cac:TaxScheme': { 'cbc:ID': t(afecto ? '1000' : '9998'), 'cbc:Name': t(afecto ? 'IGV' : 'INA'), 'cbc:TaxTypeCode': t(afecto ? 'VAT' : 'FRE') },
                },
            }],
        },
        'cac:Item': { 'cbc:Description': t(String(l.descripcion).slice(0, 250)) },
        'cac:Price': { 'cbc:PriceAmount': mon(num(l.valor_unitario), cur) },
    };
}

/**
 * Factura o boleta.
 * d: { tipo_doc, serie, numero, fecha_emision, hora_emision, fecha_vencimiento, moneda, forma_pago, dias_credito, cliente{doc_tipo,doc,nombre,direccion},
 *      orden_compra, observacion, calculo (de calcular()), detraccion_pct, cuenta_detraccion }
 */
function buildComprobanteUbl(d, emisor) {
    const cur = d.moneda === 'USD' ? 'USD' : 'PEN';
    const c = d.calculo;
    const conDetraccion = c.detraccion > 0;
    const notas = [{ _attributes: { languageLocaleID: '1000' }, _text: montoEnLetras(c.total, cur) }];
    if (conDetraccion) notas.push({ _attributes: { languageLocaleID: '2006' }, _text: 'Operación sujeta al Sistema de Pago de Obligaciones Tributarias con el Gobierno Central - Servicios de Transporte Carga' });
    const body = {
        'cbc:UBLVersionID': t('2.1'),
        'cbc:CustomizationID': t('2.0'),
        'cbc:ID': t(`${d.serie}-${String(d.numero).padStart(8, '0')}`),
        'cbc:IssueDate': t(d.fecha_emision),
        'cbc:IssueTime': t(d.hora_emision),
        ...(d.forma_pago === 'CREDITO' && d.fecha_vencimiento ? { 'cbc:DueDate': t(d.fecha_vencimiento) } : {}),
        'cbc:InvoiceTypeCode': { _attributes: { listID: conDetraccion ? '1001' : '0101' }, _text: d.tipo_doc },
        'cbc:Note': notas,
        'cbc:DocumentCurrencyCode': t(cur),
        ...(d.orden_compra ? { 'cac:OrderReference': { 'cbc:ID': t(String(d.orden_compra).slice(0, 60)) } } : {}),
        ...partes(emisor, d.cliente),
    };
    if (conDetraccion) {
        body['cac:PaymentMeans'] = { 'cbc:ID': t('Detraccion'), 'cbc:PaymentMeansCode': t('001'), 'cac:PayeeFinancialAccount': { 'cbc:ID': t(String(d.cuenta_detraccion)) } };
    }
    const terminos = [];
    if (conDetraccion) terminos.push({ 'cbc:ID': t('Detraccion'), 'cbc:PaymentMeansID': t('027'), 'cbc:PaymentPercent': t(num(d.detraccion_pct)), 'cbc:Amount': mon(c.detraccion, 'PEN') });
    if (d.forma_pago === 'CREDITO') {
        terminos.push({ 'cbc:ID': t('FormaPago'), 'cbc:PaymentMeansID': t('Credito'), 'cbc:Amount': mon(c.neto_pendiente, cur) });
        terminos.push({ 'cbc:ID': t('FormaPago'), 'cbc:PaymentMeansID': t('Cuota001'), 'cbc:Amount': mon(c.neto_pendiente, cur), 'cbc:PaymentDueDate': t(d.fecha_vencimiento) });
    } else terminos.push({ 'cbc:ID': t('FormaPago'), 'cbc:PaymentMeansID': t('Contado') });
    body['cac:PaymentTerms'] = terminos;
    Object.assign(body, totalesIgv(c, cur));
    body['cac:LegalMonetaryTotal'] = {
        'cbc:LineExtensionAmount': mon(c.base, cur),
        'cbc:TaxInclusiveAmount': mon(c.total, cur),
        'cbc:PayableAmount': mon(c.total, cur),
    };
    body['cac:InvoiceLine'] = c.lineas.map((l, i) => lineaUbl(l, i, cur, d.afecto_igv !== false, 'inv'));
    return body;
}

/** Nota de crédito (07) que referencia una factura o boleta. d: { serie, numero, fecha_emision, hora_emision, moneda, cliente, calculo, ref_numero, ref_tipo, motivo_codigo, motivo_texto } */
function buildNotaCreditoUbl(d, emisor) {
    const cur = d.moneda === 'USD' ? 'USD' : 'PEN';
    const c = d.calculo;
    const body = {
        'cbc:UBLVersionID': t('2.1'),
        'cbc:CustomizationID': t('2.0'),
        'cbc:ID': t(`${d.serie}-${String(d.numero).padStart(8, '0')}`),
        'cbc:IssueDate': t(d.fecha_emision),
        'cbc:IssueTime': t(d.hora_emision),
        'cbc:Note': [{ _attributes: { languageLocaleID: '1000' }, _text: montoEnLetras(c.total, cur) }],
        'cbc:DocumentCurrencyCode': t(cur),
        'cac:DiscrepancyResponse': { 'cbc:ReferenceID': t(d.ref_numero), 'cbc:ResponseCode': t(d.motivo_codigo), 'cbc:Description': t(String(d.motivo_texto || '').slice(0, 250)) },
        'cac:BillingReference': { 'cac:InvoiceDocumentReference': { 'cbc:ID': t(d.ref_numero), 'cbc:DocumentTypeCode': t(d.ref_tipo) } },
        ...partes(emisor, d.cliente),
        ...totalesIgv(c, cur),
        'cac:LegalMonetaryTotal': { 'cbc:PayableAmount': mon(c.total, cur) },
        'cac:CreditNoteLine': c.lineas.map((l, i) => lineaUbl(l, i, cur, d.afecto_igv !== false, 'cn')),
    };
    return body;
}

module.exports = { IGV_PCT, calcular, montoEnLetras, buildComprobanteUbl, buildNotaCreditoUbl, r2 };
