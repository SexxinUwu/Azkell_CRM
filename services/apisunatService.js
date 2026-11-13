/**
 * SERVICIO OFICIAL DE INTEGRACIÓN APISUNAT
 * Provee métodos para emisión, consulta, PDF y sincronización con https://back.apisunat.com
 */

const BASE_URL_PRODUCCION = 'https://back.apisunat.com';

// Ambiente de prueba (beta): solo con SUNAT_GRE_AMBIENTE=beta. Sin esa variable todo va a producción, como antes.
function ambienteBeta() {
    return String(process.env.SUNAT_GRE_AMBIENTE || '').trim().toLowerCase() === 'beta';
}

// Host de APISUNAT según el ambiente. En beta, nunca cae a producción si falta la URL de prueba.
function baseUrl() {
    if (!ambienteBeta()) return BASE_URL_PRODUCCION;
    const url = String(process.env.APISUNAT_PRUEBA_URL || '').trim().replace(/\/+$/, '');
    if (!url) throw new Error('Falta APISUNAT_PRUEBA_URL para el ambiente de prueba.');
    return url;
}

// En beta, las credenciales son solo las de prueba (nunca las de producción guardadas en la base).
function conAmbiente(creds) {
    if (!ambienteBeta()) return creds;
    return {
        ...creds,
        persona_id: String(process.env.APISUNAT_PRUEBA_PERSONA_ID || '').trim(),
        persona_token: String(process.env.APISUNAT_PRUEBA_PERSONA_TOKEN || '').trim(),
        modo: 'prueba'
    };
}

class ApisunatService {

    /**
     * Obtiene las credenciales de APISUNAT guardadas en BD o usa los valores predeterminados
     */
    static async getCredenciales(dbConn) {
        const defaults = {
            persona_id: process.env.APISUNAT_PERSONA_ID || '',
            persona_token: process.env.APISUNAT_PERSONA_TOKEN || '',
            ruc_emisor: '20609532484',
            razon_social: 'YOGUI TRANSPORT S.A.C.',
            modo: 'produccion'
        };

        if (!dbConn) return conAmbiente(defaults);

        try {
            const [rows] = await dbConn.query(
                "SELECT clave, valor FROM integraciones_api WHERE clave IN ('apisunat_persona_id', 'apisunat_persona_token', 'apisunat_ruc_emisor', 'apisunat_razon_social', 'apisunat_modo', 'sunat_ruc_emisor')"
            );

            const map = {};
            (rows || []).forEach(r => { map[r.clave] = r.valor; });

            return conAmbiente({
                persona_id: (map.apisunat_persona_id || defaults.persona_id).trim(),
                persona_token: (map.apisunat_persona_token || defaults.persona_token).trim(),
                ruc_emisor: (map.apisunat_ruc_emisor || map.sunat_ruc_emisor || defaults.ruc_emisor).trim(),
                razon_social: (map.apisunat_razon_social || defaults.razon_social).trim(),
                modo: (map.apisunat_modo || defaults.modo).trim()
            });
        } catch (e) {
            console.warn("[APISUNAT] Error leyendo integraciones_api, usando defaults:", e.message);
            return conAmbiente(defaults);
        }
    }

    /**
     * Configuración de APISUNAT de UNA empresa (la base de la empresa de la petición), tal como se guarda en Sistema › Integraciones.
     * Las pantallas nuevas de guías usan solo esto: sin credenciales en variables de entorno ni en el código.
     * modo 'prueba' envía a la dirección de pruebas (con las credenciales de prueba si existen); 'produccion' envía a APISUNAT real.
     * `bloqueo` trae el motivo por el que no se puede emitir (o null).
     */
    static async getConfigEmpresa(dbConn) {
        const claves = ['apisunat_modo', 'apisunat_persona_id', 'apisunat_persona_token', 'apisunat_prueba_persona_id', 'apisunat_prueba_persona_token',
            'apisunat_prueba_url', 'apisunat_ruc_emisor', 'sunat_ruc_emisor', 'apisunat_razon_social', 'apisunat_registro_mtc', 'apisunat_autorizacion_mtc', 'apisunat_serie_grt', 'apisunat_serie_gre'];
        const [rows] = await dbConn.promise().query('SELECT clave, valor FROM integraciones_api WHERE clave IN (?)', [claves]).catch(() => [[]]);
        const m = {};
        (rows || []).forEach(r => { m[r.clave] = String(r.valor || '').trim(); });
        const modo = m.apisunat_modo === 'produccion' ? 'produccion' : 'prueba';
        const prueba = modo === 'prueba';
        const persona_id = (prueba && m.apisunat_prueba_persona_id && m.apisunat_prueba_persona_token) ? m.apisunat_prueba_persona_id : (m.apisunat_persona_id || '');
        const persona_token = (prueba && m.apisunat_prueba_persona_id && m.apisunat_prueba_persona_token) ? m.apisunat_prueba_persona_token : (m.apisunat_persona_token || '');
        const base_url = prueba ? String(m.apisunat_prueba_url || process.env.APISUNAT_PRUEBA_URL || BASE_URL_PRODUCCION).trim().replace(/\/+$/, '') : BASE_URL_PRODUCCION;
        const cfg = {
            modo, persona_id, persona_token, base_url,
            ruc_emisor: m.apisunat_ruc_emisor || m.sunat_ruc_emisor || '', razon_social: m.apisunat_razon_social || '',
            registro_mtc: (m.apisunat_registro_mtc || '').toUpperCase(), autorizacion_mtc: m.apisunat_autorizacion_mtc || '',
            serie_grt: (m.apisunat_serie_grt || 'V001').toUpperCase(), serie_gre: (m.apisunat_serie_gre || 'T001').toUpperCase(),
            bloqueo: null,
        };
        if (String(process.env.SUNAT_EMISION_DESHABILITADA || '').trim() === '1') cfg.bloqueo = 'La emisión de guías está deshabilitada en el servidor.';
        else if (!cfg.persona_id || !cfg.persona_token) cfg.bloqueo = 'Falta configurar APISUNAT de esta empresa en Sistema › Integraciones.';
        else if (!/^\d{11}$/.test(cfg.ruc_emisor) || !cfg.razon_social) cfg.bloqueo = 'Falta el RUC y la razón social de la empresa en la configuración de APISUNAT (Sistema › Integraciones).';
        return cfg;
    }

    /**
     * Lo que ve el navegador de la configuración: nunca el token.
     */
    static resumenConfig(cfg) {
        return { modo: cfg.modo, lista: !cfg.bloqueo, motivo: cfg.bloqueo, ruc_emisor: cfg.ruc_emisor, razon_social: cfg.razon_social, serie_grt: cfg.serie_grt, serie_gre: cfg.serie_gre, registro_mtc: cfg.registro_mtc };
    }

    /**
     * Guarda las credenciales de APISUNAT en integraciones_api
     */
    static async saveCredenciales(dbConn, { persona_id, persona_token, ruc_emisor, razon_social, modo }) {
        if (!dbConn) throw new Error("No hay conexión a la base de datos.");
        
        const toSave = {
            apisunat_persona_id: (persona_id || '').trim(),
            apisunat_persona_token: (persona_token || '').trim(),
            apisunat_ruc_emisor: (ruc_emisor || '').trim(),
            apisunat_razon_social: (razon_social || '').trim(),
            apisunat_modo: (modo || 'produccion').trim()
        };

        for (const [clave, valor] of Object.entries(toSave)) {
            if (valor) {
                await dbConn.query(
                    "INSERT INTO integraciones_api (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = ?",
                    [clave, valor, valor]
                );
            }
        }
        return { ok: true, message: "Credenciales de APISUNAT actualizadas." };
    }

    /**
     * Consulta el último correlativo emitido y el número sugerido
     * @param {Object} params - { personaId, personaToken, type, serie }
     */
    static async lastDocument({ personaId, personaToken, type, serie, base }) {
        try {
            const resp = await fetch(`${base || baseUrl()}/personas/lastDocument`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    personaId,
                    personaToken,
                    type: String(type || '31'),
                    serie: String(serie || 'V001').toUpperCase()
                })
            });

            const data = await resp.json();
            if (!resp.ok) {
                return {
                    ok: false,
                    status: resp.status,
                    error: data.error?.message || data.message || data.error || `HTTP ${resp.status}`
                };
            }

            return {
                ok: true,
                personaId: data.personaId,
                production: data.production,
                type: data.type,
                serie: data.serie,
                lastNumber: data.lastNumber,
                suggestedNumber: data.suggestedNumber || '00000001'
            };
        } catch (err) {
            console.error("[APISUNAT] Error en lastDocument:", err);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Emite un comprobante o Guía de Remisión a través de APISUNAT
     * @param {Object} params - { personaId, personaToken, fileName, documentBody, customerEmail }
     */
    static async sendBill({ personaId, personaToken, fileName, documentBody, customerEmail, base }) {
        try {
            const payload = {
                personaId,
                personaToken,
                fileName,
                documentBody
            };

            if (customerEmail && customerEmail.trim()) {
                payload.customerEmail = customerEmail.trim();
            }

            console.log(`[APISUNAT] Enviando sendBill: ${fileName}...`);
            const resp = await fetch(`${base || baseUrl()}/personas/v1/sendBill`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await resp.json();
            if (!resp.ok || data.status === 'ERROR') {
                return {
                    ok: false,
                    status: data.status || 'ERROR',
                    error: data.error || data.message || `HTTP ${resp.status}`,
                    rawResponse: data
                };
            }

            return {
                ok: true,
                status: data.status, // "PENDIENTE"
                documentId: data.documentId,
                fileName
            };
        } catch (err) {
            console.error("[APISUNAT] Error en sendBill:", err);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Consulta el estado de procesamiento del comprobante y obtiene enlaces a XML / CDR
     * @param {string} documentId - ID retornado por sendBill
     */
    static async getById(documentId, base) {
        try {
            if (!documentId) return { ok: false, error: "documentId requerido." };

            const resp = await fetch(`${base || baseUrl()}/documents/${encodeURIComponent(documentId)}/getById`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            const data = await resp.json();
            if (!resp.ok) {
                return {
                    ok: false,
                    error: data.error?.message || data.message || data.error || `HTTP ${resp.status}`
                };
            }

            return {
                ok: true,
                production: data.production,
                status: data.status, // "ACEPTADO", "RECHAZADO", "EXCEPCION", "PENDIENTE"
                type: data.type,
                issueTime: data.issueTime,
                responseTime: data.responseTime,
                fileName: data.fileName,
                xml: data.xml,
                cdr: data.cdr,
                faults: data.faults || [],
                notes: data.notes || [],
                reference: data.reference
            };
        } catch (err) {
            console.error("[APISUNAT] Error en getById:", err);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Retorna la URL directa para descargar/visualizar el PDF oficial
     */
    static getPdfUrl(documentId, fileName, format = 'A4', base) {
        if (!documentId || !fileName) return null;
        const cleanFile = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
        return `${base || baseUrl()}/documents/${encodeURIComponent(documentId)}/getPDF/${encodeURIComponent(format)}/${encodeURIComponent(cleanFile)}`;
    }

    /**
     * Anula un documento previamente emitido
     */
    static async voidBill({ personaId, personaToken, documentId, reason }) {
        try {
            const resp = await fetch(`${baseUrl()}/personas/v1/voidBill`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    personaId,
                    personaToken,
                    documentId,
                    reason: (reason || 'Anulación por error en emisión').trim()
                })
            });

            const data = await resp.json();
            if (!resp.ok || data.status === 'ERROR') {
                return {
                    ok: false,
                    error: data.error || data.message || `HTTP ${resp.status}`
                };
            }

            return {
                ok: true,
                status: data.status,
                documentId: data.documentId
            };
        } catch (err) {
            console.error("[APISUNAT] Error en voidBill:", err);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Limpia un objeto recursivamente eliminando claves con valor null, undefined o string vacío
     */
    static cleanObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) {
            return obj.map(item => ApisunatService.cleanObject(item)).filter(item => item !== null && item !== undefined);
        }
        const cleaned = {};
        for (const [key, val] of Object.entries(obj)) {
            if (val === null || val === undefined || (typeof val === 'string' && val.trim() === '')) {
                continue;
            }
            if (typeof val === 'object') {
                const nested = ApisunatService.cleanObject(val);
                if (nested && Object.keys(nested).length > 0) {
                    cleaned[key] = nested;
                }
            } else {
                cleaned[key] = val;
            }
        }
        return cleaned;
    }

    /**
     * Sanitiza ubigeos para asegurar que contengan exactamente 6 dígitos numéricos
     */
    static sanitizeUbigeo(ubigeoStr, fallback = '150101') {
        if (!ubigeoStr) return fallback;
        const match = String(ubigeoStr).match(/\d{6}/);
        return match ? match[0] : fallback;
    }

    /**
     * Construye el documentBody para Guía de Remisión - Transportista (Tipo 31 / Serie V)
     */
    static buildGrtBody(data, rucEmisor, razonSocialEmisor) {
        const serie = (data.serie || 'V001').trim().toUpperCase();
        const correlativo = String(data.correlativo || 1).padStart(8, '0');
        const fechaEmision = (data.fecha_emision || new Date().toISOString()).slice(0, 10);
        const fechaTraslado = (data.fecha_traslado || data.fecha_emision || new Date().toISOString()).slice(0, 10);

        const items = (Array.isArray(data.items) && data.items.length > 0) ? data.items : [
            {
                codigo: '001',
                descripcion: data.descripcion_carga || 'CARGA GENERAL',
                cantidad: 1,
                unidad_medida: data.unidad_medida || 'KGM',
                peso_unitario: Number(data.peso_bruto_total || 1)
            }
        ];

        const datosEnvio = {
            codTraslado: data.motivo_traslado || "01",
            desTraslado: data.descripcion_motivo || "VENTA",
            indTransbordo: data.indicador_transbordo ? "1" : "0",
            fecInicioTraslado: fechaTraslado,
            pesoTotal: Number(data.peso_bruto_total || 1),
            uniMedida: data.unidad_medida || "KGM",
            modTraslado: "01", // 01 = Transporte Público
            transportista: {
                numDoc: String(rucEmisor || "20609532484").trim(),
                tipoDoc: "6",
                rznSocial: String(razonSocialEmisor || "YOGUI TRANSPORT S.A.C.").trim(),
                regMtc: (data.registro_mtc || "000000").trim()
            },
            partida: {
                ubigeo: ApisunatService.sanitizeUbigeo(data.punto_partida_ubigeo, "040104"),
                direccion: (data.punto_partida_direccion || "AV. LIBERTADORES SAN MARTIN MZA. 14 LOTE. 1B").trim()
            },
            llegada: {
                ubigeo: ApisunatService.sanitizeUbigeo(data.punto_llegada_ubigeo, "150101"),
                direccion: (data.punto_llegada_direccion || "DESTINO").trim()
            },
            remitente: {
                numDoc: String(data.remitente_ruc || "20609532484").trim(),
                tipoDoc: String(data.remitente_ruc || '').trim().length === 8 ? "1" : "6",
                rznSocial: (data.remitente_razon_social || "REMITENTE").trim()
            },
            destinatario: {
                numDoc: String(data.destinatario_ruc || "20609532484").trim(),
                tipoDoc: String(data.destinatario_ruc || '').trim().length === 8 ? "1" : "6",
                rznSocial: (data.destinatario_razon_social || "DESTINATARIO").trim()
            }
        };

        // Vehículo principal
        if (data.placa_tracto && data.placa_tracto.trim()) {
            datosEnvio.vehiculoPrincipal = {
                numPlaca: data.placa_tracto.trim().toUpperCase()
            };
        }

        // Vehículo secundario / carreta
        if (data.placa_carreta && data.placa_carreta.trim()) {
            datosEnvio.vehiculoSecundario = {
                numPlaca: data.placa_carreta.trim().toUpperCase()
            };
        }

        // Conductor
        if (data.conductor_num_doc && data.conductor_num_doc.trim()) {
            const condDoc = data.conductor_num_doc.trim();
            datosEnvio.conductor = {
                numDoc: condDoc,
                tipoDoc: (data.conductor_tipo_doc === 'DNI' || condDoc.length === 8) ? '1' : '6',
                nombres: (data.conductor_nombre || 'CONDUCTOR').trim(),
                apellidos: (data.conductor_apellidos || '').trim(),
                licencia: (data.conductor_licencia || 'Q00000000').trim()
            };
        }

        // Subcontratación
        if (data.subcontratista_ruc && String(data.subcontratista_ruc).trim()) {
            datosEnvio.indSubcontratacion = "1";
            datosEnvio.subcontratista = {
                tipoDoc: "6",
                numDoc: String(data.subcontratista_ruc).trim(),
                rznSocial: String(data.subcontratista_razon_social || '').trim()
            };
        }

        // Documentos Relacionados (GRE remitente vinculada)
        if (data.gre_relacionada_numero && String(data.gre_relacionada_numero).trim()) {
            const docRel = {
                tipoDoc: data.gre_relacionada_tipo || "09",
                numDoc: String(data.gre_relacionada_numero).trim()
            };
            const rucDoc = data.gre_relacionada_ruc || data.remitente_ruc;
            if (rucDoc && String(rucDoc).trim()) {
                docRel.numDocEmisor = String(rucDoc).trim();
                docRel.tipoDocEmisor = "6";
            }
            datosEnvio.documentosRelacionados = [docRel];
        }

        const body = {
            tipoDoc: "31",
            serie: serie,
            correlativo: correlativo,
            fechaEmision: fechaEmision,
            horaEmision: data.hora_emision || new Date().toTimeString().slice(0, 8),
            datosEnvio: datosEnvio,
            detalles: items.map((it, idx) => ({
                numItem: idx + 1,
                codItem: it.codigo || `ITM-${idx + 1}`,
                descripcion: (it.descripcion || 'CARGA GENERAL').trim(),
                cantidad: Number(it.cantidad || 1),
                uniMedida: it.unidad_medida || 'NIU'
            }))
        };

        return ApisunatService.cleanObject(body);
    }

    /**
     * documentBody de la GRE Transportista (tipo 31, versión 2.0) en formato UBL, que es lo que pide APISUNAT
     * (nodos cbc:/cac: con _text). La estructura sale del Generador JSON del portal de APISUNAT.
     * data: serie, numero (8 dígitos), fecha_emision, hora_emision, fecha_traslado, peso_bruto_total, placa_tracto, placa_carreta,
     *       tuc_tracto, aut_tracto, tuc_carreta, aut_carreta, conductor_*, remitente_*, destinatario_*, punto_*, items[], gre_relacionada_*
     */
    static buildGrtUbl(data, emisor) {
        const t = v => ({ _text: v });
        const docTipo = n => (String(n || '').length === 8 ? '1' : '6');
        const ruc = (n, v) => ({ 'cbc:ID': { _attributes: { schemeID: docTipo(n) }, _text: String(v) } });
        const kg = Math.round((Number(data.peso_bruto_total) || 0) * 1000) / 1000;
        const aut = (v) => ({ 'cbc:ID': { _attributes: { schemeID: '06' }, _text: String(v) } });

        const equipoSec = (data.placa_carreta && String(data.placa_carreta).trim()) ? [{
            'cbc:ID': t(String(data.placa_carreta).trim().toUpperCase()),
            ...(data.tuc_carreta ? { 'cac:ApplicableTransportMeans': { 'cbc:RegistrationNationalityID': t(String(data.tuc_carreta).trim()) } } : {}),
            ...(data.aut_carreta ? { 'cac:ShipmentDocumentReference': aut(String(data.aut_carreta).trim()) } : {}),
        }] : null;

        const body = {
            'cbc:UBLVersionID': t('2.1'),
            'cbc:CustomizationID': t('2.0'),
            'cbc:ID': t(`${data.serie}-${String(data.numero).padStart(8, '0')}`),
            'cbc:IssueDate': t(data.fecha_emision),
            'cbc:IssueTime': t(data.hora_emision),
            'cbc:DespatchAdviceTypeCode': t('31'),
        };
        if (data.gre_relacionada_numero) {
            body['cac:AdditionalDocumentReference'] = [{
                'cbc:ID': t(String(data.gre_relacionada_numero).trim()),
                'cbc:DocumentTypeCode': t(data.gre_relacionada_tipo || '09'),
                ...(data.gre_relacionada_ruc ? { 'cac:IssuerParty': { 'cac:PartyIdentification': ruc(data.gre_relacionada_ruc, data.gre_relacionada_ruc) } } : {}),
            }];
        }
        body['cac:DespatchSupplierParty'] = {
            'cac:Party': {
                'cac:PartyIdentification': { 'cbc:ID': { _attributes: { schemeID: '6' }, _text: String(emisor.ruc) } },
                'cac:PartyLegalEntity': {
                    'cbc:RegistrationName': t(emisor.razon_social),
                    ...(emisor.direccion ? { 'cac:RegistrationAddress': { 'cac:AddressLine': { 'cbc:Line': t(emisor.direccion) } } } : {}),
                },
            },
        };
        body['cac:DeliveryCustomerParty'] = {
            'cac:Party': {
                'cac:PartyIdentification': ruc(data.destinatario_ruc, data.destinatario_ruc),
                'cac:PartyLegalEntity': { 'cbc:RegistrationName': t(data.destinatario_razon_social) },
            },
        };
        body['cac:Shipment'] = {
            'cbc:ID': t('SUNAT_Envio'),
            'cbc:GrossWeightMeasure': { _attributes: { unitCode: data.unidad_medida || 'KGM' }, _text: kg },
            'cac:ShipmentStage': {
                'cac:TransitPeriod': { 'cbc:StartDate': t(data.fecha_traslado) },
                'cac:CarrierParty': {
                    'cac:PartyIdentification': { 'cbc:ID': { _attributes: { schemeID: '6' } } },
                    'cac:PartyLegalEntity': { 'cbc:CompanyID': t(String(data.registro_mtc).trim()) },
                },
                'cac:DriverPerson': [{
                    'cbc:ID': { _attributes: { schemeID: docTipo(data.conductor_num_doc) === '1' ? '1' : '6' }, _text: String(data.conductor_num_doc) },
                    'cbc:FirstName': t(String(data.conductor_nombre).trim()),
                    'cbc:FamilyName': t(String(data.conductor_apellidos).trim()),
                    'cbc:JobTitle': t('Principal'),
                    'cac:IdentityDocumentReference': { 'cbc:ID': t(String(data.conductor_licencia).trim()) },
                }],
            },
            'cac:Delivery': {
                'cac:DeliveryAddress': { 'cbc:ID': t(data.punto_llegada_ubigeo), 'cac:AddressLine': { 'cbc:Line': t(String(data.punto_llegada_direccion).trim()) } },
                'cac:Despatch': {
                    'cac:DespatchAddress': { 'cbc:ID': t(data.punto_partida_ubigeo), 'cac:AddressLine': { 'cbc:Line': t(String(data.punto_partida_direccion).trim()) } },
                    'cac:DespatchParty': {
                        'cac:PartyIdentification': ruc(data.remitente_ruc, data.remitente_ruc),
                        'cac:PartyLegalEntity': { 'cbc:RegistrationName': t(data.remitente_razon_social) },
                    },
                },
            },
            'cac:TransportHandlingUnit': {
                'cac:TransportEquipment': {
                    'cbc:ID': t(String(data.placa_tracto).trim().toUpperCase()),
                    ...(data.tuc_tracto ? { 'cac:ApplicableTransportMeans': { 'cbc:RegistrationNationalityID': t(String(data.tuc_tracto).trim()) } } : {}),
                    ...(equipoSec ? { 'cac:AttachedTransportEquipment': equipoSec } : {}),
                    ...(data.aut_tracto ? { 'cac:ShipmentDocumentReference': aut(String(data.aut_tracto).trim()) } : {}),
                },
            },
        };
        body['cac:DespatchLine'] = (Array.isArray(data.items) && data.items.length ? data.items : [{ descripcion: 'CARGA GENERAL', cantidad: 1, unidad_medida: 'NIU' }]).map((it, i) => ({
            'cbc:ID': t(i + 1),
            'cbc:DeliveredQuantity': { _attributes: { unitCode: it.unidad_medida || 'NIU' }, _text: Number(it.cantidad) || 1 },
            'cac:OrderLineReference': { 'cbc:LineID': t(i + 1) },
            'cac:Item': { 'cbc:Description': t(String(it.descripcion || 'CARGA GENERAL').trim()) },
        }));
        return body;
    }

    /**
     * Construye el documentBody para Guía de Remisión - Remitente (Tipo 09 / Serie T)
     */
    static buildGreBody(data, rucEmisor, razonSocialEmisor) {
        const serie = (data.serie || 'T001').trim().toUpperCase();
        const correlativo = String(data.correlativo || 1).padStart(8, '0');
        const fechaEmision = (data.fecha_emision || new Date().toISOString()).slice(0, 10);
        const fechaTraslado = (data.fecha_traslado || data.fecha_emision || new Date().toISOString()).slice(0, 10);

        const items = (Array.isArray(data.items) && data.items.length > 0) ? data.items : [
            {
                codigo: '001',
                descripcion: data.descripcion_carga || 'CARGA GENERAL',
                cantidad: 1,
                unidad_medida: data.unidad_medida || 'NIU',
                peso_unitario: Number(data.peso_bruto_total || 1)
            }
        ];

        const datosEnvio = {
            codTraslado: data.motivo_traslado || "01",
            desTraslado: data.descripcion_motivo || "VENTA",
            indTransbordo: data.indicador_transbordo ? "1" : "0",
            fecInicioTraslado: fechaTraslado,
            pesoTotal: Number(data.peso_bruto_total || 1),
            uniMedida: data.unidad_medida || "KGM",
            modTraslado: (data.modalidad_traslado === 'Privado' || data.modalidad_traslado === '02') ? "02" : "01",
            emisor: {
                numDoc: String(rucEmisor || "20609532484").trim(),
                tipoDoc: "6",
                rznSocial: String(razonSocialEmisor || "YOGUI TRANSPORT S.A.C.").trim()
            },
            destinatario: {
                numDoc: String(data.destinatario_ruc || '').trim(),
                tipoDoc: String(data.destinatario_ruc || '').trim().length === 8 ? "1" : "6",
                rznSocial: (data.destinatario_razon_social || '').trim()
            },
            partida: {
                ubigeo: ApisunatService.sanitizeUbigeo(data.punto_partida_ubigeo, "150101"),
                direccion: (data.punto_partida_direccion || "LIMA").trim()
            },
            llegada: {
                ubigeo: ApisunatService.sanitizeUbigeo(data.punto_llegada_ubigeo, "150101"),
                direccion: (data.punto_llegada_direccion || "DESTINO").trim()
            }
        };

        if (data.modalidad_traslado !== 'Privado' && data.transportista_ruc && data.transportista_ruc.trim()) {
            datosEnvio.transportista = {
                numDoc: data.transportista_ruc.trim(),
                tipoDoc: "6",
                rznSocial: (data.transportista_razon_social || '').trim(),
                regMtc: (data.registro_mtc || '').trim()
            };
        }

        if (data.placa_tracto && data.placa_tracto.trim()) {
            datosEnvio.vehiculoPrincipal = {
                numPlaca: data.placa_tracto.trim().toUpperCase()
            };
        }

        if (data.placa_carreta && data.placa_carreta.trim()) {
            datosEnvio.vehiculoSecundario = {
                numPlaca: data.placa_carreta.trim().toUpperCase()
            };
        }

        if (data.conductor_num_doc && data.conductor_num_doc.trim()) {
            const condDoc = data.conductor_num_doc.trim();
            datosEnvio.conductor = {
                numDoc: condDoc,
                tipoDoc: (data.conductor_tipo_doc === 'DNI' || condDoc.length === 8) ? '1' : '6',
                nombres: (data.conductor_nombre || '').trim(),
                licencia: (data.conductor_licencia || '').trim()
            };
        }

        const body = {
            tipoDoc: "09",
            serie: serie,
            correlativo: correlativo,
            fechaEmision: fechaEmision,
            horaEmision: data.hora_emision || new Date().toTimeString().slice(0, 8),
            datosEnvio: datosEnvio,
            detalles: items.map((it, idx) => ({
                numItem: idx + 1,
                codItem: it.codigo || `ITM-${idx + 1}`,
                descripcion: (it.descripcion || 'PRODUCTO').trim(),
                cantidad: Number(it.cantidad || 1),
                uniMedida: it.unidad_medida || 'NIU'
            }))
        };

        return ApisunatService.cleanObject(body);
    }
}

module.exports = ApisunatService;
