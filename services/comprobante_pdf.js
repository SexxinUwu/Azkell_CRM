// PDF propio de la representación impresa de factura, boleta y nota de crédito electrónicas, con la plantilla de la empresa (la misma de las guías:
// logo, color, datos de la empresa, marca de agua y pie). Se arma con HTML + CSS y se convierte a PDF con el Chromium del servidor.
// Datos: la fila de facturacion_comprobantes y sus líneas. QR: contenido estándar de SUNAT para comprobantes. Hash: DigestValue del XML firmado.
const G = require('./gre_pdf');
const { htmlAPdf } = require('./ot_pdf');
const { montoEnLetras } = require('./facturacion_ubl');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = f => (/^\d{4}-\d{2}-\d{2}/.test(String(f || '')) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—');
const nf = (n, dec = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const nfLibre = (n, min = 2, max = 4) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
const UNIDADES = { ZZ: 'Servicio', NIU: 'Unidad', KGM: 'Kilogramos', TNE: 'Toneladas', BX: 'Cajas', LTR: 'Litros', GLL: 'Galones', MTR: 'Metros' };
const TITULOS = { '01': 'FACTURA ELECTRÓNICA', '03': 'BOLETA DE VENTA ELECTRÓNICA', '07': 'NOTA DE CRÉDITO ELECTRÓNICA' };

// ───────────────────────── Plantilla (propia de los comprobantes; la de las guías es otra) ─────────────────────────
const CLAVE_PLANTILLA = 'comprobante_pdf_plantilla';
const BLOQUES_BASE = { estado: true, detraccion: true, credito: true, observaciones: true, qr: true, hash: true };
const COLUMNAS_BASE = { unidad: true, valor_unit: true, orden_compra: true };
const bool = (v, defecto) => (typeof v === 'boolean' ? v : defecto);

/** Marca y textos comunes (logo, color, datos de la empresa, marca de agua, pie) como en las guías; los bloques y columnas son los de los comprobantes */
function normalizarPlantilla(crudo) {
    let p = crudo;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = {}; } }
    if (!p || typeof p !== 'object') p = {};
    const comun = G.normalizarPlantilla(p);
    const bloques = {}; for (const k of Object.keys(BLOQUES_BASE)) bloques[k] = bool(p.bloques && p.bloques[k], BLOQUES_BASE[k]);
    const columnas = {}; for (const k of Object.keys(COLUMNAS_BASE)) columnas[k] = bool(p.columnas && p.columnas[k], COLUMNAS_BASE[k]);
    return { ...comun, bloques, columnas };
}

// ───────────────────────── Hash del XML firmado ─────────────────────────
const cacheHash = new Map();
/** DigestValue de la firma del XML que guarda APISUNAT (es el «código hash» que va impreso). null si no se pudo leer. */
async function hashDeXml(xmlUrl) {
    if (!xmlUrl) return null;
    if (cacheHash.has(xmlUrl)) return cacheHash.get(xmlUrl);
    try {
        const res = await fetch(xmlUrl, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        const xml = (buf.length > 1 && buf[0] === 0x50 && buf[1] === 0x4b ? G.primerArchivoZip(buf) : buf).toString('utf8');
        const m = /<(?:ds:)?DigestValue>\s*([^<\s]+)\s*<\/(?:ds:)?DigestValue>/.exec(xml);
        if (m) cacheHash.set(xmlUrl, m[1]);
        return m ? m[1] : null;
    } catch (e) {
        return null;
    }
}

// ───────────────────────── Modelo del documento ─────────────────────────
/** Datos del PDF a partir de una fila de facturacion_comprobantes (con f_emision y f_vence en AAAA-MM-DD) y sus líneas */
function modeloDesdeComprobante(c, items, emisor) {
    let cuenta = '';
    try { const d = JSON.parse(c.datos_json || '{}'); const cb = d['cac:PaymentMeans'] && d['cac:PaymentMeans']['cac:PayeeFinancialAccount'] && d['cac:PaymentMeans']['cac:PayeeFinancialAccount']['cbc:ID']; cuenta = cb ? String(cb._text || '') : ''; } catch (e) { /* sin UBL guardado */ }
    const moneda = c.moneda === 'USD' ? 'USD' : 'PEN';
    const detMonto = Number(c.detraccion_monto) || 0;
    return {
        tipo: c.tipo_doc, numero: c.numero_completo, serie: c.serie, correlativo: c.numero,
        emision: c.f_emision || '', hora: c.hora_emision || '', vence: c.f_vence || '',
        emisor,
        cliente: { docTipo: c.cliente_doc_tipo, doc: c.cliente_doc, nombre: c.cliente_nombre, direccion: c.cliente_direccion || '' },
        moneda, simbolo: moneda === 'USD' ? 'US$' : 'S/',
        formaPago: c.forma_pago === 'CREDITO' ? 'CREDITO' : 'CONTADO', dias: Number(c.dias_credito) || 0,
        lineas: items.map((l, i) => ({ n: i + 1, descripcion: l.descripcion, unidad: l.unidad, cantidad: Number(l.cantidad), vu: Number(l.valor_unitario), base: Number(l.base) })),
        base: Number(c.base) || 0, igv: Number(c.igv) || 0, total: Number(c.total) || 0,
        enLetras: montoEnLetras(Number(c.total) || 0, moneda),
        detraccion: detMonto > 0 ? { pct: Number(c.detraccion_pct) || 0, monto: detMonto, cuenta } : null,
        neto: Number(c.neto_pendiente) || 0,
        ordenCompra: c.orden_compra || '', referencia: c.referencia || '', observacion: c.observacion || '',
        ref: c.tipo_doc === '07' ? { numero: c.doc_ref_numero || '', motivo: c.motivo_texto || '' } : null,
        estado: c.apisunat_status || '', prueba: c.modo_emision === 'prueba',
    };
}

function modeloEjemplo() {
    return {
        tipo: '01', numero: 'F001-00000001', serie: 'F001', correlativo: '00000001', emision: new Date().toISOString().slice(0, 10), hora: '10:25:00', vence: '',
        emisor: { ruc: '20600066651', razon: 'TRAHESA S.A.C.' },
        cliente: { docTipo: '6', doc: '20100014395', nombre: 'PRODUCTOS PARAISO DEL PERU S.A.C.', direccion: 'AV. ARGENTINA 5495, CALLAO' },
        moneda: 'PEN', simbolo: 'S/', formaPago: 'CONTADO', dias: 0,
        lineas: [{ n: 1, descripcion: 'SERVICIO DE TRANSPORTE DE CARGA JULIACA - LIMA', unidad: 'ZZ', cantidad: 1, vu: 4237.2881, base: 4237.29 }],
        base: 4237.29, igv: 762.71, total: 5000, enLetras: montoEnLetras(5000, 'PEN'),
        detraccion: { pct: 4, monto: 200, cuenta: '00042047767' }, neto: 4800, ordenCompra: '', referencia: '', observacion: '', ref: null, estado: 'ACEPTADO', prueba: false, ejemplo: true,
    };
}

// ───────────────────────── HTML ─────────────────────────
const CSS_EXTRA = `
.cli{display:grid;grid-template-columns:1.5fr 1fr;gap:3mm}
.tot2{margin-left:auto;width:76mm}
.tot2 .grande{display:flex;justify-content:space-between;align-items:baseline;padding-top:1.6mm;margin-top:.8mm;border-top:.35mm solid var(--ink)}
.tot2 .grande .n{font-size:13pt;font-weight:700;letter-spacing:-.01em}
.son{margin-top:2mm;font-size:7.6pt;color:var(--ink2)}.son b{color:var(--ink);font-weight:600}
.det .et2{font-weight:700;font-size:8.6pt;margin-bottom:1.2mm}
.hash{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:6.6pt;color:var(--ink2);word-break:break-all;margin-top:1.4mm}
`;

function estadoPastilla(m) {
    if (m.estado === 'ACEPTADO') return { clase: 'ok', texto: 'Aceptada por SUNAT' };
    if (m.estado === 'RECHAZADO' || m.estado === 'EXCEPCION') return { clase: 'mal', texto: 'Rechazada por SUNAT' };
    return { clase: 'pend', texto: 'Pendiente de validación' };
}

function construirHtml(m, plantilla, rec = {}) {
    const p = plantilla;
    const b = p.bloques;
    const c = p.columnas;
    const st = estadoPastilla(m);
    const nombre = p.nombre_comercial || m.emisor.razon;
    const contacto = [p.telefono && `Tel. ${esc(p.telefono)}`, p.correo && esc(p.correo), p.web && esc(p.web)].filter(Boolean).join(' · ');
    const titulo = TITULOS[m.tipo] || 'COMPROBANTE ELECTRÓNICO';
    const S = m.simbolo;
    const esNc = m.tipo === '07';

    const lineasHtml = m.lineas.map(l => `
        <tr><td style="width:7mm;color:var(--ink2)">${l.n}</td>
        <td>${esc(l.descripcion)}</td>
        ${c.unidad ? `<td>${esc(UNIDADES[l.unidad] || l.unidad)}</td>` : ''}
        <td class="d">${esc(nfLibre(l.cantidad, 0, 3))}</td>
        ${c.valor_unit ? `<td class="d">${esc(nfLibre(l.vu, 2, 4))}</td>` : ''}
        <td class="d">${esc(nf(l.base))}</td></tr>`).join('');

    const detHtml = m.detraccion && b.detraccion ? `
      <div class="sec"><div class="et">Información de la detracción</div><div class="tarj det">
        <div class="par"><div class="k">Leyenda</div><div class="v" style="font-size:7.8pt">Operación sujeta al Sistema de Pago de Obligaciones Tributarias</div></div>
        <div class="par"><div class="k">Bien o servicio</div><div class="v" style="font-size:7.8pt">027 · Servicio de transporte de carga</div></div>
        <div class="par"><div class="k">Medio de pago</div><div class="v" style="font-size:7.8pt">001 · Depósito en cuenta</div></div>
        <div class="par"><div class="k">N.º de cuenta Banco de la Nación</div><div class="v m">${esc(m.detraccion.cuenta || '—')}</div></div>
        <div class="par"><div class="k">Detracción ${esc(nfLibre(m.detraccion.pct, 0, 2))} %</div><div class="v m">${S} ${esc(nf(m.detraccion.monto))}</div></div>
        <div class="par"><div class="k">Monto neto pendiente de pago</div><div class="v m">${S} ${esc(nf(m.neto))}</div></div>
      </div></div>` : '';

    const creditoHtml = !esNc && b.credito && m.formaPago === 'CREDITO' ? `
      <div class="sec"><div class="et">Forma de pago: crédito</div><div class="tarj">
        <div class="par"><div class="k">Monto neto pendiente de pago</div><div class="v m">${S} ${esc(nf(m.neto))}</div></div>
        <div class="par"><div class="k">Cuota 1 · vence el ${fecha(m.vence)}</div><div class="v m">${S} ${esc(nf(m.neto))}</div></div>
      </div></div>` : '';

    let qrHtml = '';
    if (b.qr) {
        qrHtml = rec.qr && rec.qr.dataUrl
            ? `<div class="qr"><img src="${rec.qr.dataUrl}" alt="QR"><div class="nota">${m.ejemplo ? 'QR de ejemplo' : m.prueba ? 'QR de prueba' : 'Datos del comprobante'}</div></div>`
            : '<div class="qr vacio">QR no disponible</div>';
    }
    const marcaAgua = m.ejemplo ? 'EJEMPLO' : m.prueba ? 'PRUEBA' : '';
    const textoMarca = p.marca_agua ? (p.marca_agua_texto || p.nombre_comercial || String(m.emisor.razon || '').replace(/\b(S\.?\s?A\.?\s?C\.?|S\.?\s?A\.?|S\.?\s?R\.?\s?L\.?|E\.?\s?I\.?\s?R\.?\s?L\.?)\s*$/i, '').trim()) : '';
    const docEtq = m.cliente.docTipo === '6' ? 'RUC' : m.cliente.docTipo === '1' ? 'DNI' : 'Documento';
    const obs = [p.notas, m.observacion].filter(Boolean).join('\n');

    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(m.numero)}</title><style>${G.fuentes()}${G.CSS(p.acento)}${CSS_EXTRA}</style></head><body>
${marcaAgua ? `<div class="marca-agua">${marcaAgua}</div>` : ''}
${textoMarca ? `<div class="marca-fondo ${p.marca_agua_nivel}${marcaAgua ? ' baja' : ''}">${esc(textoMarca)}</div>` : ''}
<div class="hoja fuera">
  <div class="cab">
    <div class="marca${rec.logo && p.logo_tam === 'grande' ? ' lg' : rec.logo && p.logo_tam === 'mediano' ? ' md' : ''}">
      ${rec.logo ? `<img src="${rec.logo}" alt="">` : ''}
      <div>
        <div class="nom">${esc(nombre)}</div>
        ${p.nombre_comercial && m.emisor.razon && p.nombre_comercial !== m.emisor.razon ? `<div class="raz">${esc(m.emisor.razon)}</div>` : ''}
        <div class="dato">${p.direccion ? `${esc(p.direccion)}<br>` : ''}${contacto}</div>
      </div>
    </div>
    <div class="folio">
      <div class="ruc">RUC ${esc(m.emisor.ruc)}</div>
      <div class="tit">${titulo}</div>
      <div class="num">${esc(m.numero)}</div>
    </div>
  </div>

  ${b.estado ? `<div class="fila-estado"><span class="pastilla ${st.clase}">${st.texto}</span>${m.prueba || m.ejemplo ? `<span class="pastilla prueba">${m.ejemplo ? 'Documento de ejemplo' : 'Documento de prueba · sin validez tributaria'}</span>` : ''}</div>` : ''}

  <div class="sec cli">
    <div><div class="et">Cliente</div><div class="tarj"><div class="v">${esc(m.cliente.nombre || '—')}</div>
      <div class="k" style="margin-top:.8mm">${docEtq} ${esc(m.cliente.doc || '—')}</div>
      ${m.cliente.direccion ? `<div class="k" style="margin-top:.6mm">${esc(m.cliente.direccion)}</div>` : ''}</div></div>
    <div><div class="et">Datos</div><div class="tarj">
      <div class="par"><div class="k">Emisión</div><div class="v m">${fecha(m.emision)}${m.hora ? ` ${esc(m.hora.slice(0, 5))}` : ''}</div></div>
      <div class="par"><div class="k">Moneda</div><div class="v">${m.moneda === 'USD' ? 'Dólares (US$)' : 'Soles (S/)'}</div></div>
      ${esNc ? '' : `<div class="par"><div class="k">Forma de pago</div><div class="v">${m.formaPago === 'CREDITO' ? `Crédito (${m.dias} días)` : 'Contado'}</div></div>`}
      ${m.ordenCompra && c.orden_compra ? `<div class="par"><div class="k">Orden de compra</div><div class="v m">${esc(m.ordenCompra)}</div></div>` : ''}
    </div></div>
  </div>

  ${esNc && m.ref ? `<div class="sec"><div class="et">Documento que modifica</div><div class="tarj">
    <div class="par"><div class="k">Comprobante</div><div class="v m">${esc(m.ref.numero)}</div></div>
    <div class="par"><div class="k">Motivo</div><div class="v">${esc(m.ref.motivo)}</div></div></div></div>` : ''}

  <div class="sec"><div class="et">Detalle</div>
    <table><thead><tr><th>#</th><th>Descripción</th>${c.unidad ? '<th>Unidad</th>' : ''}<th class="d">Cant.</th>${c.valor_unit ? '<th class="d">Valor unit.</th>' : ''}<th class="d">Importe</th></tr></thead>
    <tbody>${lineasHtml}</tbody></table>
    <div class="tot2 tarj" style="margin-top:3mm">
      <div class="par"><div class="k">${m.igv > 0 ? 'Op. gravada' : 'Op. inafecta'}</div><div class="v m">${S} ${esc(nf(m.base))}</div></div>
      <div class="par"><div class="k">IGV 18 %</div><div class="v m">${S} ${esc(nf(m.igv))}</div></div>
      <div class="grande"><span class="k">Importe total</span><span class="n">${S} ${esc(nf(m.total))}</span></div>
    </div>
    <div class="son">SON: <b>${esc(m.enLetras)}</b></div>
  </div>

  ${detHtml}
  ${creditoHtml}

  ${b.observaciones && obs ? `<div class="sec"><div class="et">Observaciones</div><div class="tarj">${esc(obs).replace(/\n/g, '<br>')}</div></div>` : ''}

  <div class="pie">
    ${b.qr ? qrHtml : '<div></div>'}
    <div class="leyenda">Representación impresa de la ${esc(titulo.charAt(0) + titulo.slice(1).toLowerCase())}
      <small>${p.pie ? `${esc(p.pie)}<br>` : ''}Emitida el ${fecha(m.emision)}${m.hora ? ` ${esc(m.hora.slice(0, 5))}` : ''} · ${esc(m.emisor.razon)} · RUC ${esc(m.emisor.ruc)}${p.emitido_desde ? ` · Emitido desde ${esc(p.emitido_desde)}` : ''}</small>
      ${rec.hash && b.hash ? `<div class="hash">Código hash: ${esc(rec.hash)}</div>` : ''}</div>
  </div>
</div></body></html>`;
}

// ───────────────────────── PDF ─────────────────────────
/** Contenido del QR de un comprobante (formato de SUNAT): RUC|tipo|serie|número|IGV|total|fecha|tipo doc. cliente|doc. cliente| */
const contenidoQr = m => [m.emisor.ruc, m.tipo, m.serie, m.correlativo, nf(m.igv).replace(/,/g, ''), nf(m.total).replace(/,/g, ''), m.emision, m.cliente.docTipo || '0', m.cliente.doc || '-'].join('|') + '|';

/** opciones: { hash, leerS3 } — hash: DigestValue del XML; leerS3: firma la URL del logo en S3 */
async function generarPdf(modelo, plantillaCruda, opciones = {}) {
    const plantilla = normalizarPlantilla(plantillaCruda);
    const rec = { logo: await G.logoDataUrl(plantilla.logo_url, opciones.leerS3), qr: null, hash: opciones.hash || '' };
    if (plantilla.bloques.qr) rec.qr = { dataUrl: await G.qrDataUrl(contenidoQr(modelo)) };
    return htmlAPdf(construirHtml(modelo, plantilla, rec), modelo.numero || 'Comprobante', false, false, { margenV: 9, compactar: true });
}

module.exports = { CLAVE_PLANTILLA, normalizarPlantilla, modeloDesdeComprobante, modeloEjemplo, construirHtml, generarPdf, hashDeXml, contenidoQr };
