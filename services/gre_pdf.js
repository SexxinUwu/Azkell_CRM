// PDF propio de la representación impresa de la GRE Transportista (tipo 31), con plantilla configurable por empresa.
// El documento se arma con HTML + CSS y se convierte a PDF con el Chromium del servidor (services/ot_pdf.js), igual que el PDF de la OT.
// Datos: el UBL que se envió a APISUNAT (gre_guias.datos_json), de modo que el PDF coincide con el XML. Si no hay UBL, se usan las columnas de gre_guias.
// QR: SUNAT entrega la URL del QR (…/descargaqr?hashqr=…) dentro del CDR (cac:DocumentReference/cbc:DocumentDescription); aquí se lee de ese CDR.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const QRCode = require('qrcode');
const { htmlAPdf } = require('./ot_pdf');

// ───────────────────────── Plantilla ─────────────────────────
const CLAVE_PLANTILLA = 'gre_pdf_plantilla';

const PLANTILLA_BASE = {
    version: 1,
    logo_url: '',
    acento: '#0071e3',
    nombre_comercial: '', direccion: '', telefono: '', correo: '', web: '',
    // Bloques que se muestran en el documento
    bloques: { estado: true, cliente: true, ruta: true, partes: true, vehiculos: true, conductor: true, relacionados: true, observaciones: true, qr: true },
    // Columnas y datos extra
    columnas: { unidad: true, peso_linea: false, placa_carreta: true, tuc: true, licencia: true, viaje: false, servicio: false },
    pie: '', notas: '',
};

const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const bool = (v, defecto) => (typeof v === 'boolean' ? v : defecto);

/** Mezcla lo guardado con los valores por defecto y limpia cada campo: nunca devuelve algo que rompa el documento */
function normalizarPlantilla(crudo) {
    let p = crudo;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = {}; } }
    if (!p || typeof p !== 'object') p = {};
    const base = PLANTILLA_BASE;
    const bloques = {};
    for (const k of Object.keys(base.bloques)) bloques[k] = bool(p.bloques && p.bloques[k], base.bloques[k]);
    const columnas = {};
    for (const k of Object.keys(base.columnas)) columnas[k] = bool(p.columnas && p.columnas[k], base.columnas[k]);
    return {
        version: 1,
        logo_url: texto(p.logo_url, 600),
        acento: /^#[0-9a-fA-F]{6}$/.test(String(p.acento || '')) ? String(p.acento).toLowerCase() : base.acento,
        nombre_comercial: texto(p.nombre_comercial, 120), direccion: texto(p.direccion, 220),
        telefono: texto(p.telefono, 60), correo: texto(p.correo, 120), web: texto(p.web, 120),
        bloques, columnas,
        pie: texto(p.pie, 300), notas: texto(p.notas, 600),
    };
}

// ───────────────────────── Catálogos pequeños ─────────────────────────
const UNIDADES = { KGM: 'Kilogramos', TNE: 'Toneladas', NIU: 'Unidades', BE: 'Fardos', BX: 'Cajas', ZZ: 'Servicio', LTR: 'Litros', GLL: 'Galones', MTR: 'Metros' };

let ubigeos = null;
/** Código de ubigeo → «Departamento - Provincia - Distrito» (catálogo INEI que ya usa la app) */
function nombreUbigeo(codigo) {
    const c = String(codigo || '').trim();
    if (!c) return '';
    if (!ubigeos) {
        ubigeos = new Map();
        for (const ruta of [path.join(__dirname, '..', 'src', 'modules', 'operaciones', 'ubigeos.json')]) {
            try {
                for (const [cod, dist, prov, dep] of JSON.parse(fs.readFileSync(ruta, 'utf8'))) ubigeos.set(cod, `${dep} - ${prov} - ${dist}`);
                break;
            } catch (e) { /* sin catálogo: se muestra solo el código */ }
        }
    }
    return ubigeos.get(c) || '';
}

// ───────────────────────── Modelo del documento ─────────────────────────
const txt = n => {
    if (n == null) return '';
    if (typeof n === 'object') return n._text != null ? String(n._text) : '';
    return String(n);
};
const lista = x => (x == null ? [] : Array.isArray(x) ? x : [x]);
const en = (o, ...ruta) => ruta.reduce((a, k) => (a == null ? undefined : a[k]), o);
const numero = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

/**
 * Datos del documento a partir de una fila de gre_guias (+ el UBL enviado). `extra`: { estado, prueba } cuando se conocen más al día.
 */
function modeloDesdeFila(fila, extra = {}) {
    let ubl = null;
    try { ubl = fila.datos_json ? JSON.parse(fila.datos_json) : null; } catch (e) { ubl = null; }
    if (ubl && !ubl['cbc:ID']) ubl = null; // formato antiguo (no UBL)

    const fechaDe = v => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : '');
    const m = {
        tipo: '31', numero: fila.numero_completo || '', emision: fechaDe(fila.fecha_emision), hora: '', traslado: fechaDe(fila.fecha_traslado),
        emisor: { ruc: fila.transportista_ruc || fila.emisor_ruc || '', razon: fila.transportista_nombre || '', direccion: '' },
        remitente: { doc: fila.remitente_ruc || '', nombre: fila.remitente_nombre || '' },
        destinatario: { doc: fila.destinatario_doc || '', nombre: fila.destinatario_nombre || '' },
        partida: { ubigeo: fila.partida_ubigeo || '', direccion: fila.partida_direccion || '' },
        llegada: { ubigeo: fila.llegada_ubigeo || '', direccion: fila.llegada_direccion || '' },
        peso: numero(fila.peso_kg), unidadPeso: 'KGM', mtc: '',
        vehiculos: [], conductores: [], lineas: [], relacionados: [],
        estado: String(extra.estado || fila.apisunat_status || '').toUpperCase(),
        prueba: extra.prueba != null ? !!extra.prueba : String(fila.modo_emision || '') === 'prueba',
        viaje: fila.viaje || '', servicio: fila.orden_servicio_codigo || '', ejemplo: !!extra.ejemplo,
    };

    if (ubl) {
        const envio = ubl['cac:Shipment'] || {};
        const etapa = envio['cac:ShipmentStage'] || {};
        const emisor = en(ubl, 'cac:DespatchSupplierParty', 'cac:Party') || {};
        const dest = en(ubl, 'cac:DeliveryCustomerParty', 'cac:Party') || {};
        const entrega = envio['cac:Delivery'] || {};
        const despacho = entrega['cac:Despatch'] || {};
        m.numero = txt(ubl['cbc:ID']) || m.numero;
        m.emision = txt(ubl['cbc:IssueDate']) || m.emision;
        m.hora = txt(ubl['cbc:IssueTime']);
        m.tipo = txt(ubl['cbc:DespatchAdviceTypeCode']) || '31';
        m.emisor = {
            ruc: txt(en(emisor, 'cac:PartyIdentification', 'cbc:ID')) || m.emisor.ruc,
            razon: txt(en(emisor, 'cac:PartyLegalEntity', 'cbc:RegistrationName')) || m.emisor.razon,
            direccion: txt(en(emisor, 'cac:PartyLegalEntity', 'cac:RegistrationAddress', 'cac:AddressLine', 'cbc:Line')),
        };
        m.destinatario = { doc: txt(en(dest, 'cac:PartyIdentification', 'cbc:ID')) || m.destinatario.doc, nombre: txt(en(dest, 'cac:PartyLegalEntity', 'cbc:RegistrationName')) || m.destinatario.nombre };
        m.remitente = {
            doc: txt(en(despacho, 'cac:DespatchParty', 'cac:PartyIdentification', 'cbc:ID')) || m.remitente.doc,
            nombre: txt(en(despacho, 'cac:DespatchParty', 'cac:PartyLegalEntity', 'cbc:RegistrationName')) || m.remitente.nombre,
        };
        m.partida = { ubigeo: txt(en(despacho, 'cac:DespatchAddress', 'cbc:ID')) || m.partida.ubigeo, direccion: txt(en(despacho, 'cac:DespatchAddress', 'cac:AddressLine', 'cbc:Line')) || m.partida.direccion };
        m.llegada = { ubigeo: txt(en(entrega, 'cac:DeliveryAddress', 'cbc:ID')) || m.llegada.ubigeo, direccion: txt(en(entrega, 'cac:DeliveryAddress', 'cac:AddressLine', 'cbc:Line')) || m.llegada.direccion };
        m.traslado = txt(en(etapa, 'cac:TransitPeriod', 'cbc:StartDate')) || m.traslado;
        m.peso = numero(txt(envio['cbc:GrossWeightMeasure'])) || m.peso;
        m.unidadPeso = (envio['cbc:GrossWeightMeasure'] && envio['cbc:GrossWeightMeasure']._attributes && envio['cbc:GrossWeightMeasure']._attributes.unitCode) || 'KGM';
        m.mtc = txt(en(etapa, 'cac:CarrierParty', 'cac:PartyLegalEntity', 'cbc:CompanyID'));
        lista(etapa['cac:DriverPerson']).forEach((c, i) => m.conductores.push({
            rol: txt(c['cbc:JobTitle']) || (i === 0 ? 'Principal' : 'Secundario'),
            doc: txt(c['cbc:ID']), tipoDoc: (c['cbc:ID'] && c['cbc:ID']._attributes && c['cbc:ID']._attributes.schemeID) === '1' ? 'DNI' : 'Doc.',
            nombres: txt(c['cbc:FirstName']), apellidos: txt(c['cbc:FamilyName']), licencia: txt(en(c, 'cac:IdentityDocumentReference', 'cbc:ID')),
        }));
        const equipo = en(envio, 'cac:TransportHandlingUnit', 'cac:TransportEquipment');
        const vehiculo = (e, rol) => ({ rol, placa: txt(e['cbc:ID']), tuc: txt(en(e, 'cac:ApplicableTransportMeans', 'cbc:RegistrationNationalityID')), autorizacion: txt(en(e, 'cac:ShipmentDocumentReference', 'cbc:ID')) });
        if (equipo) {
            m.vehiculos.push(vehiculo(equipo, 'Tracto'));
            lista(equipo['cac:AttachedTransportEquipment']).forEach(e => m.vehiculos.push(vehiculo(e, 'Carreta')));
        }
        lista(ubl['cac:DespatchLine']).forEach((l, i) => m.lineas.push({
            n: txt(l['cbc:ID']) || String(i + 1), descripcion: txt(en(l, 'cac:Item', 'cbc:Description')),
            cantidad: numero(txt(l['cbc:DeliveredQuantity'])), unidad: (l['cbc:DeliveredQuantity'] && l['cbc:DeliveredQuantity']._attributes && l['cbc:DeliveredQuantity']._attributes.unitCode) || 'NIU',
            codigo: txt(en(l, 'cac:Item', 'cac:SellersItemIdentification', 'cbc:ID')),
        }));
        lista(ubl['cac:AdditionalDocumentReference']).forEach(d => m.relacionados.push({
            tipo: txt(d['cbc:DocumentTypeCode']) || '09', numero: txt(d['cbc:ID']), ruc: txt(en(d, 'cac:IssuerParty', 'cac:PartyIdentification', 'cbc:ID')),
        }));
    } else {
        // Sin UBL: columnas de la fila
        if (fila.placa) m.vehiculos.push({ rol: 'Tracto', placa: fila.placa, tuc: '', autorizacion: '' });
        if (fila.placa_carreta) m.vehiculos.push({ rol: 'Carreta', placa: fila.placa_carreta, tuc: '', autorizacion: '' });
        if (fila.conductor_nombre) m.conductores.push({ rol: 'Principal', doc: fila.conductor_doc || '', tipoDoc: 'DNI', nombres: fila.conductor_nombre, apellidos: '', licencia: fila.licencia || '' });
        let items = [];
        try { items = JSON.parse(fila.items_json || '[]'); } catch (e) { items = []; }
        items.forEach((it, i) => m.lineas.push({ n: String(i + 1), descripcion: it.descripcion || '', cantidad: numero(it.cantidad), unidad: it.unidad_medida || it.unidad || 'NIU', codigo: '' }));
    }
    return m;
}

// ───────────────────────── QR (URL de SUNAT dentro del CDR) ─────────────────────────
/** Primer archivo de un ZIP (lo mínimo para leer el CDR sin dependencias: directorio central + inflate) */
function primerArchivoZip(buf) {
    let fin = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
    if (fin < 0) throw new Error('ZIP inválido');
    const cd = buf.readUInt32LE(fin + 16);
    if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error('ZIP inválido');
    const metodo = buf.readUInt16LE(cd + 10);
    const tamComp = buf.readUInt32LE(cd + 20);
    const local = buf.readUInt32LE(cd + 42);
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('ZIP inválido');
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const datos = buf.subarray(ini, ini + tamComp);
    return metodo === 8 ? zlib.inflateRawSync(datos) : datos;
}

const cacheQr = new Map();
/** URL del QR que SUNAT dejó en el CDR (el CDR no cambia, así que se guarda en memoria). null si no se pudo leer. */
async function urlQrDeCdr(cdrUrl) {
    if (!cdrUrl) return null;
    if (cacheQr.has(cdrUrl)) return cacheQr.get(cdrUrl);
    try {
        const res = await fetch(cdrUrl, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return null;
        const xml = primerArchivoZip(Buffer.from(await res.arrayBuffer())).toString('utf8');
        const m = /<cbc:DocumentDescription>\s*([^<]*hashqr=[^<]*?)\s*<\/cbc:DocumentDescription>/.exec(xml);
        const url = m ? m[1].replace(/&amp;/g, '&') : null;
        if (url) cacheQr.set(cdrUrl, url);
        return url;
    } catch (e) {
        return null;
    }
}

async function qrDataUrl(contenido) {
    return QRCode.toDataURL(contenido, { errorCorrectionLevel: 'L', margin: 1, width: 420, color: { dark: '#1d1d1f', light: '#ffffff' } });
}

// ───────────────────────── Logo y fuentes (todo embebido: el Chromium del PDF no sale a internet) ─────────────────────────
async function logoDataUrl(url, leerS3) {
    const u = String(url || '').trim();
    if (!u) return '';
    // data: solo con una imagen en base64 bien formada (el valor se inserta tal cual en el HTML)
    if (u.startsWith('data:')) return /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(u) ? u : '';
    try {
        // Solo https y hosts públicos: la URL la escribe un administrador, pero el servidor no debe poder leer direcciones internas
        const host = new URL(u).hostname.toLowerCase();
        if (new URL(u).protocol !== 'https:' || host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':') || /\.(local|internal|lan)$/.test(host)) return '';
        let enlace = u;
        if (leerS3) enlace = (await leerS3(u)) || u;
        const res = await fetch(enlace, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return '';
        const tipo = String(res.headers.get('content-type') || '').split(';')[0];
        if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(tipo)) return '';
        const b = Buffer.from(await res.arrayBuffer());
        if (b.length > 2 * 1024 * 1024) return '';
        return `data:${tipo};base64,${b.toString('base64')}`;
    } catch (e) {
        return '';
    }
}

let cssFuentes = null;
function fuentes() {
    if (cssFuentes !== null) return cssFuentes;
    const carpeta = path.join(__dirname, '..', 'node_modules', '@fontsource', 'inter', 'files');
    const partes = [];
    for (const peso of [400, 500, 600, 700]) {
        try {
            const b64 = fs.readFileSync(path.join(carpeta, `inter-latin-${peso}-normal.woff2`)).toString('base64');
            partes.push(`@font-face{font-family:'Inter';font-weight:${peso};font-style:normal;src:url(data:font/woff2;base64,${b64}) format('woff2');}`);
        } catch (e) { /* sin la fuente: se usa la del sistema */ }
    }
    cssFuentes = partes.join('');
    return cssFuentes;
}

// ───────────────────────── HTML ─────────────────────────
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = f => (/^\d{4}-\d{2}-\d{2}/.test(String(f || '')) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : esc(f || '—'));
const nf = (n, dec = 3) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dec });
const pesoTexto = (n, u) => `${nf(n, 3)} ${u === 'TNE' ? 't' : 'kg'}`;

function estadoPastilla(m) {
    if (m.estado === 'ACEPTADO') return { clase: 'ok', texto: 'Aceptada por SUNAT' };
    if (m.estado === 'RECHAZADO' || m.estado === 'EXCEPCION') return { clase: 'mal', texto: 'Rechazada por SUNAT' };
    return { clase: 'pend', texto: 'Pendiente de validación' };
}

const CSS = acento => `
:root{--acento:${acento};--ink:#1d1d1f;--ink2:#6e6e73;--linea:#e5e5ea;--fondo:#f5f5f7;--ok:#1f8f4e;--aviso:#c76a00;--mal:#d70015}
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{font-family:'Inter',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:var(--ink);font-size:8.6pt;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-feature-settings:'tnum' 1,'cv11' 1}
.hoja{width:210mm;padding:2mm 14mm 4mm;position:relative}
.cab{display:grid;grid-template-columns:1fr 74mm;gap:7mm;align-items:stretch}
.marca{display:flex;gap:4mm;align-items:center}
.marca img{max-height:19mm;max-width:46mm;object-fit:contain;border-radius:3mm}
.marca .nom{font-size:13pt;font-weight:700;letter-spacing:-.01em;line-height:1.15}
.marca .raz{color:var(--ink2);font-size:8pt;margin-top:.6mm}
.marca .dato{color:var(--ink2);font-size:7.6pt;margin-top:1.2mm;line-height:1.45}
.folio{background:var(--acento);color:#fff;border-radius:5mm;padding:4.6mm 5mm;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:1.2mm}
.folio .ruc{font-size:9.4pt;font-weight:700;color:#fff;letter-spacing:.02em}
.folio .tit{font-size:9.4pt;font-weight:700;color:#fff;letter-spacing:.03em;line-height:1.3}
.folio .num{font-size:15pt;font-weight:700;color:#fff;letter-spacing:.01em;margin-top:.6mm}
.fila-estado{display:flex;gap:2.4mm;margin:4.6mm 0 0;flex-wrap:wrap}
.pastilla{display:inline-flex;align-items:center;gap:1.6mm;border-radius:99px;padding:1mm 3.2mm;font-size:7.4pt;font-weight:600}
.pastilla::before{content:'';width:1.7mm;height:1.7mm;border-radius:50%;background:currentColor}
.pastilla.ok{background:#e4f6ec;color:var(--ok)}.pastilla.pend{background:#eeeef0;color:var(--ink2)}.pastilla.mal{background:#fde8ea;color:var(--mal)}.pastilla.prueba{background:#fff1de;color:var(--aviso)}
.sec{margin-top:4.4mm}
.et{font-size:6.6pt;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--ink2);margin:0 0 1.6mm 1mm}
.tarj{background:var(--fondo);border-radius:4mm;padding:3.4mm 4mm;break-inside:avoid}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:3mm}.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}
.k{color:var(--ink2);font-size:7pt}.v{font-weight:600;font-size:8.8pt}.v.m{font-variant-numeric:tabular-nums}
.par{display:grid;grid-template-columns:1fr auto;gap:2mm;padding:.9mm 0}.par+.par{border-top:.2mm solid var(--linea)}
.par .k{align-self:center}.par .v{text-align:right}
.punto .tt{font-weight:700;font-size:9.2pt;margin-bottom:.6mm}.punto .dd{color:var(--ink2);font-size:7.8pt}.punto .uu{margin-top:1.4mm;font-size:7.2pt;color:var(--ink2)}
.ruta{display:grid;grid-template-columns:1fr 8mm 1fr;align-items:center;gap:1.5mm}
.flecha{width:7mm;height:7mm;border-radius:50%;background:var(--acento);color:#fff;display:flex;align-items:center;justify-content:center;font-size:9pt;font-weight:700}
table{width:100%;border-collapse:collapse}
thead{display:table-header-group}
th{font-size:6.6pt;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2);text-align:left;padding:0 2mm 1.6mm;border-bottom:.35mm solid var(--ink)}
td{padding:2mm;border-bottom:.2mm solid var(--linea);vertical-align:top}
tr{break-inside:avoid}
.d{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tot{display:flex;justify-content:flex-end;gap:3mm;align-items:baseline;margin-top:2.2mm;padding-right:2mm}
.tot .n{font-size:12pt;font-weight:700;letter-spacing:-.01em}
.chips{display:flex;flex-wrap:wrap;gap:2mm}
.chip{background:var(--fondo);border-radius:99px;padding:1.2mm 3.4mm;font-size:7.8pt}.chip b{font-weight:700}
.placa{display:inline-block;border:.35mm solid var(--ink);border-radius:1.6mm;padding:.2mm 2mm;font-weight:700;letter-spacing:.08em;font-size:8.6pt;background:#fff}
.pie{display:grid;grid-template-columns:36mm 1fr;gap:5mm;align-items:center;margin-top:5mm;break-inside:avoid}
.qr{background:var(--fondo);border-radius:4mm;padding:2.6mm;text-align:center}
.qr img{width:100%;display:block;border-radius:1.4mm}
.qr .nota{font-size:6.4pt;color:var(--ink2);margin-top:1.2mm;line-height:1.3}
.qr.vacio{padding:6mm 3mm;color:var(--ink2);font-size:7pt}
.leyenda{font-weight:600;font-size:8pt}.leyenda small{display:block;font-weight:400;color:var(--ink2);font-size:7.2pt;margin-top:1mm;line-height:1.5}
.marca-agua{position:fixed;left:0;right:0;top:112mm;text-align:center;transform:rotate(-26deg);font-size:96pt;font-weight:800;letter-spacing:.06em;color:rgba(199,106,0,.075);pointer-events:none;z-index:0}
.fuera{position:relative;z-index:1}
`;

/** HTML completo del documento. `rec`: { logo, qr: {dataUrl, esPrueba, esEjemplo} | null } */
function construirHtml(m, plantilla, rec = {}) {
    const p = plantilla;
    const b = p.bloques;
    const c = p.columnas;
    const st = estadoPastilla(m);
    const nombre = p.nombre_comercial || m.emisor.razon;
    const direccion = p.direccion || m.emisor.direccion;
    const contacto = [p.telefono && `Tel. ${esc(p.telefono)}`, p.correo && esc(p.correo), p.web && esc(p.web)].filter(Boolean).join(' · ');
    const nomUbi = u => nombreUbigeo(u);
    const rotulo = m.tipo === '09' ? 'REMITENTE' : 'TRANSPORTISTA';

    const lineasHtml = m.lineas.map((l, i) => `
        <tr><td style="width:7mm;color:var(--ink2)">${esc(l.n || i + 1)}</td>
        <td>${esc(l.descripcion)}</td>
        ${c.unidad ? `<td>${esc(UNIDADES[l.unidad] || l.unidad)}</td>` : ''}
        <td class="d">${esc(nf(l.cantidad, 3))}</td>
        ${c.peso_linea ? `<td class="d">${['KGM', 'TNE'].includes(l.unidad) ? esc(pesoTexto(l.unidad === 'TNE' ? l.cantidad * 1000 : l.cantidad, 'KGM')) : '—'}</td>` : ''}</tr>`).join('');

    const vehiculosHtml = m.vehiculos.filter(v => c.placa_carreta || v.rol !== 'Carreta').map(v => `
        <div class="par"><div class="k">${esc(v.rol)}</div><div class="v"><span class="placa">${esc(v.placa)}</span></div></div>
        ${c.tuc && v.tuc ? `<div class="par"><div class="k">TUC / CHV</div><div class="v m">${esc(v.tuc)}</div></div>` : ''}
        ${c.tuc && v.autorizacion ? `<div class="par"><div class="k">Autorización especial</div><div class="v m">${esc(v.autorizacion)}</div></div>` : ''}`).join('');

    const conductoresHtml = m.conductores.map(d => `
        <div class="par"><div class="k">${esc(d.rol)}</div><div class="v">${esc([d.nombres, d.apellidos].filter(Boolean).join(' '))}</div></div>
        <div class="par"><div class="k">${esc(d.tipoDoc)}</div><div class="v m">${esc(d.doc)}</div></div>
        ${c.licencia && d.licencia ? `<div class="par"><div class="k">Licencia</div><div class="v m">${esc(d.licencia)}</div></div>` : ''}`).join('');

    const internas = [c.viaje && m.viaje ? `<div class="par"><div class="k">Viaje</div><div class="v m">${esc(m.viaje)}</div></div>` : '', c.servicio && m.servicio ? `<div class="par"><div class="k">Servicio</div><div class="v m">${esc(m.servicio)}</div></div>` : ''].join('');

    const relacionadosHtml = m.relacionados.map(r => `<span class="chip">GRE Remitente <b>${esc(r.numero)}</b>${r.ruc ? ` · RUC ${esc(r.ruc)}` : ''}</span>`).join('');

    let qrHtml = '';
    if (b.qr) {
        if (rec.qr && rec.qr.dataUrl) {
            qrHtml = `<div class="qr"><img src="${rec.qr.dataUrl}" alt="QR"><div class="nota">${rec.qr.esEjemplo ? 'QR de ejemplo' : rec.qr.esPrueba ? 'QR de prueba' : 'Verifica esta guía en SUNAT'}</div></div>`;
        } else {
            qrHtml = `<div class="qr vacio">El QR de SUNAT estará disponible cuando la guía sea aceptada.</div>`;
        }
    }

    const marcaAgua = m.ejemplo ? 'EJEMPLO' : m.prueba ? 'PRUEBA' : '';

    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(m.numero)}</title><style>${fuentes()}${CSS(p.acento)}</style></head><body>
${marcaAgua ? `<div class="marca-agua">${marcaAgua}</div>` : ''}
<div class="hoja fuera">
  <div class="cab">
    <div class="marca">
      ${rec.logo ? `<img src="${rec.logo}" alt="">` : ''}
      <div>
        <div class="nom">${esc(nombre)}</div>
        ${p.nombre_comercial && m.emisor.razon && p.nombre_comercial !== m.emisor.razon ? `<div class="raz">${esc(m.emisor.razon)}</div>` : ''}
        <div class="dato">${direccion ? `${esc(direccion)}<br>` : ''}${contacto}</div>
      </div>
    </div>
    <div class="folio">
      <div class="ruc">RUC ${esc(m.emisor.ruc)}</div>
      <div class="tit">GUÍA DE REMISIÓN ELECTRÓNICA<br>${rotulo}</div>
      <div class="num">${esc(m.numero)}</div>
    </div>
  </div>

  ${b.estado ? `<div class="fila-estado"><span class="pastilla ${st.clase}">${st.texto}</span>${m.prueba || m.ejemplo ? `<span class="pastilla prueba">${m.ejemplo ? 'Documento de ejemplo' : 'Documento de prueba · sin validez tributaria'}</span>` : ''}</div>` : ''}

  <div class="sec g3">
    <div class="tarj"><div class="par"><div class="k">Fecha de emisión</div><div class="v m">${fecha(m.emision)}</div></div>
      <div class="par"><div class="k">Inicio del traslado</div><div class="v m">${fecha(m.traslado)}</div></div></div>
    <div class="tarj"><div class="par"><div class="k">Registro MTC</div><div class="v m">${esc(m.mtc || '—')}</div></div>
      <div class="par"><div class="k">Peso bruto total</div><div class="v m">${esc(pesoTexto(m.peso, m.unidadPeso))}</div></div></div>
    ${b.cliente || internas ? `<div class="tarj">${b.cliente ? `<div class="par"><div class="k">Cliente</div><div class="v" style="font-size:7.6pt">${esc(m.remitente.nombre || '—')}</div></div>` : ''}${internas}</div>` : '<div></div>'}
  </div>

  ${b.ruta ? `<div class="sec"><div class="et">Traslado</div><div class="ruta">
    <div class="tarj punto"><div class="k">Punto de partida</div><div class="tt">${esc(m.partida.direccion || '—')}</div><div class="uu">${esc([m.partida.ubigeo, nomUbi(m.partida.ubigeo)].filter(Boolean).join(' · '))}</div></div>
    <div class="flecha">→</div>
    <div class="tarj punto"><div class="k">Punto de llegada</div><div class="tt">${esc(m.llegada.direccion || '—')}</div><div class="uu">${esc([m.llegada.ubigeo, nomUbi(m.llegada.ubigeo)].filter(Boolean).join(' · '))}</div></div>
  </div></div>` : ''}

  ${b.partes ? `<div class="sec g2">
    <div><div class="et">Remitente</div><div class="tarj"><div class="v">${esc(m.remitente.nombre || '—')}</div><div class="k" style="margin-top:.8mm">RUC ${esc(m.remitente.doc || '—')}</div></div></div>
    <div><div class="et">Destinatario</div><div class="tarj"><div class="v">${esc(m.destinatario.nombre || '—')}</div><div class="k" style="margin-top:.8mm">${m.destinatario.doc.length === 8 ? 'DNI' : 'RUC'} ${esc(m.destinatario.doc || '—')}</div></div></div>
  </div>` : ''}

  ${b.vehiculos || b.conductor ? `<div class="sec g2">
    ${b.vehiculos ? `<div><div class="et">Vehículos</div><div class="tarj">${vehiculosHtml || '<div class="k">Sin datos</div>'}</div></div>` : '<div></div>'}
    ${b.conductor ? `<div><div class="et">Conductor</div><div class="tarj">${conductoresHtml || '<div class="k">Sin datos</div>'}</div></div>` : '<div></div>'}
  </div>` : ''}

  <div class="sec"><div class="et">Bienes por transportar</div>
    <table><thead><tr><th>#</th><th>Descripción</th>${c.unidad ? '<th>Unidad</th>' : ''}<th class="d">Cantidad</th>${c.peso_linea ? '<th class="d">Peso</th>' : ''}</tr></thead>
    <tbody>${lineasHtml || '<tr><td colspan="5" class="k">Sin ítems</td></tr>'}</tbody></table>
    <div class="tot"><span class="k">Peso bruto total</span><span class="n">${esc(pesoTexto(m.peso, m.unidadPeso))}</span></div>
  </div>

  ${b.relacionados && relacionadosHtml ? `<div class="sec"><div class="et">Documentos relacionados</div><div class="chips">${relacionadosHtml}</div></div>` : ''}

  ${b.observaciones && p.notas ? `<div class="sec"><div class="et">Observaciones</div><div class="tarj">${esc(p.notas).replace(/\n/g, '<br>')}</div></div>` : ''}

  <div class="pie">
    ${b.qr ? qrHtml : '<div></div>'}
    <div class="leyenda">Representación impresa de la Guía de Remisión Electrónica
      <small>${p.pie ? `${esc(p.pie)}<br>` : ''}Emitida el ${fecha(m.emision)}${m.hora ? ` ${esc(m.hora.slice(0, 5))}` : ''} · ${esc(m.emisor.razon)} · RUC ${esc(m.emisor.ruc)}</small></div>
  </div>
</div></body></html>`;
}

// ───────────────────────── PDF ─────────────────────────
/**
 * Genera el PDF.
 * opciones: { qrUrl, qrPrueba, leerS3 } — qrUrl: contenido del QR (URL de SUNAT); leerS3: función que firma una URL de S3 para poder leer el logo.
 */
async function generarPdf(modelo, plantillaCruda, opciones = {}) {
    const plantilla = normalizarPlantilla(plantillaCruda);
    const rec = { logo: await logoDataUrl(plantilla.logo_url, opciones.leerS3), qr: null };
    if (plantilla.bloques.qr && opciones.qrUrl) {
        rec.qr = { dataUrl: await qrDataUrl(opciones.qrUrl), esPrueba: !!opciones.qrPrueba, esEjemplo: !!modelo.ejemplo };
    }
    return htmlAPdf(construirHtml(modelo, plantilla, rec), modelo.numero || 'Guia', false, false, { margenV: 9, compactar: true });
}

// ───────────────────────── Datos de ejemplo (vista previa de la plantilla) ─────────────────────────
function modeloEjemplo(plantilla) {
    return {
        tipo: '31', numero: 'V001-00000001', emision: new Date().toISOString().slice(0, 10), hora: '10:25:00', traslado: new Date().toISOString().slice(0, 10),
        emisor: { ruc: '20600066651', razon: 'TRAHESA S.A.C.', direccion: '' },
        remitente: { doc: '10024189592', nombre: 'CALLA BERNEDO JIOVANA TORIBIA' },
        destinatario: { doc: '20606104856', nombre: 'SIERRA MORADA SAC' },
        partida: { ubigeo: '211101', direccion: 'JR. HUASCAR NRO. 848 BARRIO SANTA BARBARA - JULIACA - SAN ROMAN - PUNO' },
        llegada: { ubigeo: '150118', direccion: 'AV MZ E LOTE 3A AF LA CAPITANA DE HUACHIPA - LURIGANCHO - LIMA' },
        peso: 13000, unidadPeso: 'KGM', mtc: '1557302CNG',
        vehiculos: [{ rol: 'Tracto', placa: 'ASV720', tuc: '15M23014596E', autorizacion: '152027544' }, { rol: 'Carreta', placa: 'ADF994', tuc: '15M23014597E', autorizacion: '152027544' }],
        conductores: [{ rol: 'Principal', doc: '73815086', tipoDoc: 'DNI', nombres: 'ORLANDO', apellidos: 'HUAMANI QUISPE', licencia: 'Z73815086' }],
        lineas: [{ n: '1', descripcion: 'Fardos de lana esquilada sucia de ovino tipo cooperativa', cantidad: 30, unidad: 'BE', codigo: '' }],
        relacionados: [{ tipo: '09', numero: 'EG07-00000003', ruc: '10024189592' }],
        estado: 'ACEPTADO', prueba: false, viaje: '2026-00000001', servicio: '2026-00000001', ejemplo: true,
    };
}

module.exports = {
    CLAVE_PLANTILLA, PLANTILLA_BASE, normalizarPlantilla, modeloDesdeFila, modeloEjemplo, construirHtml,
    urlQrDeCdr, generarPdf, primerArchivoZip, nombreUbigeo,
};
