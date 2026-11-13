// Lee una Guía de Remisión Electrónica (GRE) de SUNAT que nos entrega un cliente y devuelve los datos para que la persona los revise.
// - XML (UBL 2.1 DespatchAdvice): se lee directo, es exacto.
// - Imagen o PDF: se lee con Gemini (visión); puede equivocarse, por eso nunca se guarda sin revisión.
// No guarda nada. Si la IA no está configurada o no responde, el módulo sigue funcionando con el registro manual.
const MODELOS = (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL.trim() || 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.8-flash')
    .split(',').map(m => m.trim()).filter(Boolean);

const aviso = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

// ───────────────────────── utilidades ─────────────────────────
const texto = (v, max = 300) => { const t = v == null ? '' : String(v).trim(); return t && t.toLowerCase() !== 'null' ? t.slice(0, max) : null; };
const soloDigitos = v => { const d = String(v ?? '').replace(/\D/g, ''); return d || null; };
const fechaISO = v => { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? '')); if (m) return `${m[1]}-${m[2]}-${m[3]}`; const n = /(\d{2})[\/-](\d{2})[\/-](\d{4})/.exec(String(v ?? '')); return n ? `${n[3]}-${n[2]}-${n[1]}` : null; };
const numero = v => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(/,(\d{1,2})$/, '.$1').replace(/,/g, '')); return Number.isFinite(n) ? n : null; };

/** Dígito verificador del RUC (módulo 11) */
function rucValido(ruc) {
    if (!/^\d{11}$/.test(ruc || '')) return false;
    const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const suma = pesos.reduce((s, p, i) => s + p * Number(ruc[i]), 0);
    const dv = (11 - (suma % 11)) % 10;
    return dv === Number(ruc[10]);
}

/** «T001-00000123» → { serie, numero, completo } */
function separarSerie(v) {
    const m = /^\s*([A-Za-z0-9]{3,4})\s*[-–]\s*0*(\d{1,8})\s*$/.exec(String(v ?? ''));
    if (!m) return { serie: null, numero: null, completo: null };
    const serie = m[1].toUpperCase();
    return { serie, numero: m[2], completo: `${serie}-${m[2].padStart(8, '0')}` };
}

/** Pasa el peso a kilos según la unidad (KGM/kg o TNE/toneladas) */
function aKilos(peso, unidad) {
    const n = numero(peso);
    if (n == null) return null;
    const u = String(unidad || '').toUpperCase();
    return Math.round((/TNE|TON|^T$|TN/.test(u) ? n * 1000 : n) * 100) / 100;
}

// ───────────────────────── XML (UBL 2.1) ─────────────────────────
const unesc = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const sinCdata = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const lim = s => unesc(sinCdata(String(s ?? '')).trim());
const bloque = (xml, nombre) => { const m = new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`).exec(xml); return m ? m[1] : ''; };
const bloques = (xml, nombre) => [...xml.matchAll(new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`, 'g'))].map(m => m[1]);
const valor = (xml, nombre) => { const m = new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`).exec(xml || ''); return m ? (lim(m[1]) || null) : null; };
const atributo = (xml, nombre, attr) => { const m = new RegExp(`<${nombre}\\s[^>]*${attr}="([^"]*)"`).exec(xml || ''); return m ? m[1] : null; };

function parteDe(xml) {
    return {
        doc: valor(bloque(xml, 'cac:PartyIdentification'), 'cbc:ID'),
        nombre: valor(bloque(xml, 'cac:PartyLegalEntity'), 'cbc:RegistrationName') || valor(bloque(xml, 'cac:PartyName'), 'cbc:Name'),
    };
}
const direccionDe = xml => bloques(xml, 'cac:AddressLine').map(b => valor(b, 'cbc:Line')).filter(Boolean).join(' ') || null;

function leerXml(buffer) {
    const crudo = buffer.toString('utf8');
    if (!/DespatchAdvice/.test(crudo)) throw aviso('El archivo XML no es una guía de remisión electrónica.');
    const xml = crudo.replace(/<ext:UBLExtensions[\s\S]*?<\/ext:UBLExtensions>/, '');
    const raiz = xml.replace(/<cac:Signature[\s\S]*?<\/cac:Signature>/, '');
    const id = separarSerie(valor(raiz, 'cbc:ID'));
    const codigoTipo = valor(raiz, 'cbc:DespatchAdviceTypeCode');
    const proveedor = parteDe(bloque(raiz, 'cac:DespatchSupplierParty'));
    const cliente = parteDe(bloque(raiz, 'cac:DeliveryCustomerParty'));
    const envio = bloque(raiz, 'cac:Shipment');
    const etapa = bloque(envio, 'cac:ShipmentStage');
    const transportista = parteDe(bloque(etapa, 'cac:CarrierParty'));
    const conductor = bloque(etapa, 'cac:DriverPerson');
    const llegada = bloque(bloque(envio, 'cac:Delivery'), 'cac:DeliveryAddress');
    const partida = bloque(bloque(envio, 'cac:Delivery'), 'cac:Despatch') || bloque(envio, 'cac:Despatch');
    const salida = bloque(partida, 'cac:DespatchAddress');
    const lineas = bloques(raiz, 'cac:DespatchLine').map(l => ({
        descripcion: valor(bloque(l, 'cac:Item'), 'cbc:Description'),
        cantidad: numero(valor(l, 'cbc:DeliveredQuantity')),
        unidad: atributo(l, 'cbc:DeliveredQuantity', 'unitCode'),
    }));
    const pesoXml = valor(envio, 'cbc:GrossWeightMeasure');
    const nombreConductor = [valor(conductor, 'cbc:FirstName'), valor(conductor, 'cbc:FamilyName')].filter(Boolean).join(' ');
    const placa = valor(bloque(envio, 'cac:TransportEquipment') || bloque(envio, 'cac:TransportHandlingUnit'), 'cbc:ID');
    return limpiar({
        tipo: codigoTipo === '31' ? 'TRANSPORTISTA' : 'REMITENTE',
        serie_numero: id.completo,
        fecha_emision: valor(raiz, 'cbc:IssueDate'),
        fecha_traslado: valor(bloque(etapa, 'cac:TransitPeriod'), 'cbc:StartDate'),
        remitente_ruc: proveedor.doc, remitente_nombre: proveedor.nombre,
        destinatario_doc: cliente.doc, destinatario_nombre: cliente.nombre,
        transportista_ruc: transportista.doc, transportista_nombre: transportista.nombre,
        modalidad: valor(etapa, 'cbc:TransportModeCode') === '01' ? 'PUBLICO' : valor(etapa, 'cbc:TransportModeCode') === '02' ? 'PRIVADO' : null,
        motivo: valor(envio, 'cbc:HandlingInstructions') || valor(envio, 'cbc:HandlingCode'),
        partida_ubigeo: valor(salida, 'cbc:ID'), partida_direccion: direccionDe(salida),
        llegada_ubigeo: valor(llegada, 'cbc:ID'), llegada_direccion: direccionDe(llegada),
        peso: pesoXml, unidad_peso: atributo(envio, 'cbc:GrossWeightMeasure', 'unitCode'),
        bultos: valor(envio, 'cbc:TotalTransportHandlingUnitQuantity'),
        descripcion: lineas.map(l => l.descripcion).filter(Boolean).join('; ') || null,
        items: lineas,
        observaciones: valor(raiz, 'cbc:Note'),
        placa, conductor_nombre: nombreConductor || null, conductor_doc: valor(conductor, 'cbc:ID'),
        licencia: valor(bloque(conductor, 'cac:IdentityDocumentReference'), 'cbc:ID'),
    }, 'XML', codigoTipo);
}

// ───────────────────────── Imagen o PDF con IA ─────────────────────────
const INSTRUCCIONES = `Eres un asistente que lee Guías de Remisión Electrónicas (GRE) de SUNAT, Perú, a partir de una foto, captura o PDF (si el PDF tiene varias páginas, usa la de la guía).
Devuelve SOLO un JSON con estas claves (usa null cuando el dato no se vea con claridad; NO inventes nada):
- tipo: REMITENTE si dice "GUÍA DE REMISIÓN ELECTRÓNICA REMITENTE" (serie tipo T001, EG01...), TRANSPORTISTA si dice "GUÍA DE REMISIÓN ELECTRÓNICA TRANSPORTISTA" (serie tipo V001, VG01...)
- serie_numero: serie y número tal como están impresos (por ejemplo T001-00000123)
- fecha_emision: AAAA-MM-DD
- fecha_traslado: fecha de inicio del traslado, AAAA-MM-DD
- remitente_ruc: RUC del remitente (11 dígitos), remitente_nombre: razón social
- destinatario_doc: RUC o DNI del destinatario, destinatario_nombre: razón social o nombre
- transportista_ruc, transportista_nombre: si la guía los trae
- modalidad: PUBLICO (transporte público) o PRIVADO (transporte privado), si se indica
- motivo: motivo del traslado (Venta, Compra, Traslado entre establecimientos, Importación, etc.)
- partida_direccion: dirección del punto de partida; partida_ubigeo: código de 6 dígitos si aparece
- llegada_direccion: dirección del punto de llegada; llegada_ubigeo: código de 6 dígitos si aparece
- peso: peso bruto total como número; unidad_peso: KGM para kilogramos o TNE para toneladas, según lo impreso
- bultos: cantidad de bultos o unidades, si aparece como total
- descripcion: resumen corto de los bienes
- items: lista de bienes [{"descripcion": "...", "cantidad": 0, "unidad": "NIU"}]
- indicador_vehiculos_conductores: SI o NO, según lo que diga "Indicador para registrar vehículos y conductores del transportista" (null si no aparece)
- observaciones: el texto de Observaciones tal como está impreso (a veces trae placas y el conductor)
- placa: placa del vehículo sin guiones, solo si está en el campo de vehículo de la guía (no la tomes de las observaciones)
- conductor_nombre, conductor_doc (DNI, solo dígitos), licencia`;

async function leerConIA(buffer, mimetype) {
    const clave = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim();
    if (!clave) throw aviso('La lectura con IA no está disponible (falta configurar GEMINI_API_KEY). Registra los datos a mano.', 503);
    const cuerpo = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: INSTRUCCIONES }, { inlineData: { mimeType: mimetype, data: buffer.toString('base64') } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    let ultimo = 'No se pudo leer la guía.';
    for (const modelo of MODELOS) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave }, body: cuerpo, signal: AbortSignal.timeout(45000),
            });
            const data = await res.json().catch(() => null);
            if (res.status === 429) { ultimo = 'La IA llegó a su límite por hoy. Intenta más tarde o registra los datos a mano.'; continue; }
            if (!res.ok) { ultimo = (data && data.error && data.error.message) ? String(data.error.message).slice(0, 160) : `Error ${res.status}`; continue; }
            const textos = ((data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || []).filter(p => p.text && !p.thought).map(p => p.text).join('');
            const json = JSON.parse(textos.replace(/^```json\s*|```$/g, '').trim());
            return limpiar(json, 'IA', null);
        } catch (e) {
            ultimo = e.name === 'TimeoutError' ? 'La IA tardó demasiado.' : (ultimo || e.message);
        }
    }
    throw aviso(ultimo, 502);
}

// ───────────────────────── normalización y comprobaciones ─────────────────────────
/** Deja solo las claves esperadas y con el tipo correcto, y avisa de lo que parece raro (lo que lee la IA nunca se guarda sin revisión) */
function limpiar(j, fuente, codigoTipo) {
    const advertencias = [];
    const id = separarSerie(j.serie_numero);
    if (!id.completo) advertencias.push('No se pudo leer bien la serie y el número de la guía.');
    const t = String(j.tipo || '').toUpperCase();
    const tipo = codigoTipo === '31' || t.startsWith('TRANSP') ? 'TRANSPORTISTA' : (codigoTipo === '09' || t.startsWith('REMIT') ? 'REMITENTE' : null);
    const rucs = {};
    for (const [k, v] of [['remitente_ruc', j.remitente_ruc], ['transportista_ruc', j.transportista_ruc]]) {
        const d = soloDigitos(v);
        rucs[k] = d && d.length === 11 ? d : null;
        if (rucs[k] && !rucValido(rucs[k])) advertencias.push(`El RUC ${rucs[k]} no pasa la validación: revísalo.`);
        if (d && d.length !== 11) advertencias.push(`El RUC "${d}" no tiene 11 dígitos.`);
    }
    const doc = soloDigitos(j.destinatario_doc);
    if (doc && doc.length === 11 && !rucValido(doc)) advertencias.push(`El RUC ${doc} del destinatario no pasa la validación: revísalo.`);
    const peso = aKilos(j.peso, j.unidad_peso);
    if (peso == null || peso <= 0) advertencias.push('No se leyó el peso bruto total.');
    else if (peso < 5) advertencias.push(`El peso leído es muy bajo (${peso} kg): verifica la unidad (kilos o toneladas).`);
    const ubigeo = v => { const d = soloDigitos(v); return d && d.length === 6 ? d : null; };
    const items = (Array.isArray(j.items) ? j.items : []).slice(0, 60).map(i => ({ descripcion: texto(i && i.descripcion, 200), cantidad: numero(i && i.cantidad), unidad: texto(i && i.unidad, 10) })).filter(i => i.descripcion);
    const datos = {
        tipo,
        serie: id.serie, numero: id.numero, numero_completo: id.completo,
        fecha_emision: fechaISO(j.fecha_emision), fecha_traslado: fechaISO(j.fecha_traslado),
        remitente_ruc: rucs.remitente_ruc, remitente_nombre: texto(j.remitente_nombre, 200),
        destinatario_doc: doc && (doc.length === 11 || doc.length === 8) ? doc : null, destinatario_nombre: texto(j.destinatario_nombre, 200),
        transportista_ruc: rucs.transportista_ruc, transportista_nombre: texto(j.transportista_nombre, 200),
        modalidad: ['PUBLICO', 'PRIVADO'].includes(String(j.modalidad || '').toUpperCase()) ? String(j.modalidad).toUpperCase() : null,
        motivo: texto(j.motivo, 80),
        partida_ubigeo: ubigeo(j.partida_ubigeo), partida_direccion: texto(j.partida_direccion, 255),
        llegada_ubigeo: ubigeo(j.llegada_ubigeo), llegada_direccion: texto(j.llegada_direccion, 255),
        peso_kg: peso != null && peso > 0 ? peso : null,
        bultos: numero(j.bultos) != null && numero(j.bultos) > 0 ? Math.round(numero(j.bultos)) : null,
        descripcion: texto(j.descripcion, 500), items,
        observaciones: texto(j.observaciones, 1000),
        placa: texto(j.placa, 20) ? String(j.placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
        conductor_nombre: texto(j.conductor_nombre, 150), conductor_doc: soloDigitos(j.conductor_doc), licencia: texto(j.licencia, 30),
        fuente,
    };
    // Una guía de remitente que ya trae los datos de transporte (transportista, vehículo, conductor y fecha de traslado) puede eximir al transportista de emitir la suya
    // (RS 188-2010, art. 19 num. 12; la RS 108-2026 suma la fecha de inicio del traslado). El indicador impreso en la guía manda; sin él se mira si trae placa y conductor.
    const indicador = String(j.indicador_vehiculos_conductores || '').toUpperCase();
    datos.trae_transporte = !!(datos.tipo === 'REMITENTE' && datos.transportista_ruc && datos.fecha_traslado && (indicador === 'SI' || (indicador !== 'NO' && datos.placa && datos.conductor_nombre)));
    return { ...datos, advertencias };
}

/** Punto de entrada: elige el lector según el archivo */
async function leerGuia(buffer, mimetype, nombre) {
    const esXml = /xml/i.test(mimetype || '') || /\.xml$/i.test(nombre || '') || /^\s*<\?xml|^\s*<DespatchAdvice/i.test(buffer.subarray(0, 200).toString('utf8'));
    if (esXml) return leerXml(buffer);
    if (/^(image\/|application\/pdf)/.test(mimetype || '')) return leerConIA(buffer, mimetype);
    throw aviso('Sube la guía como imagen, PDF o XML.');
}

module.exports = { leerGuia, rucValido, separarSerie, limpiar };
