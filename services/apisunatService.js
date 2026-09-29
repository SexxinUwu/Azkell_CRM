/**
 * SERVICIO OFICIAL DE INTEGRACIÓN APISUNAT
 * Provee métodos para emisión, consulta, PDF y sincronización con https://back.apisunat.com
 */

const BASE_URL = 'https://back.apisunat.com';

class ApisunatService {

    /**
     * Obtiene las credenciales de APISUNAT guardadas en BD o usa los valores predeterminados
     */
    static async getCredenciales(dbConn) {
        const defaults = {
            persona_id: '6ab586529196160021bb3224',
            persona_token: 'PRD_U98dbhFf4LSo9ZtoJmssGtIXVUdd7a5dIehcSmbGrcrVUlW61eMwiCk01ATA5AV1',
            ruc_emisor: '20609532484',
            razon_social: 'YOGUI TRANSPORT S.A.C.',
            modo: 'produccion'
        };

        if (!dbConn) return defaults;

        try {
            const [rows] = await dbConn.query(
                "SELECT clave, valor FROM integraciones_api WHERE clave IN ('apisunat_persona_id', 'apisunat_persona_token', 'apisunat_ruc_emisor', 'apisunat_razon_social', 'apisunat_modo', 'sunat_ruc_emisor')"
            );

            const map = {};
            (rows || []).forEach(r => { map[r.clave] = r.valor; });

            return {
                persona_id: (map.apisunat_persona_id || defaults.persona_id).trim(),
                persona_token: (map.apisunat_persona_token || defaults.persona_token).trim(),
                ruc_emisor: (map.apisunat_ruc_emisor || map.sunat_ruc_emisor || defaults.ruc_emisor).trim(),
                razon_social: (map.apisunat_razon_social || defaults.razon_social).trim(),
                modo: (map.apisunat_modo || defaults.modo).trim()
            };
        } catch (e) {
            console.warn("[APISUNAT] Error leyendo integraciones_api, usando defaults:", e.message);
            return defaults;
        }
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
    static async lastDocument({ personaId, personaToken, type, serie }) {
        try {
            const resp = await fetch(`${BASE_URL}/personas/lastDocument`, {
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
    static async sendBill({ personaId, personaToken, fileName, documentBody, customerEmail }) {
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
            const resp = await fetch(`${BASE_URL}/personas/v1/sendBill`, {
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
    static async getById(documentId) {
        try {
            if (!documentId) return { ok: false, error: "documentId requerido." };

            const resp = await fetch(`${BASE_URL}/documents/${encodeURIComponent(documentId)}/getById`, {
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
    static getPdfUrl(documentId, fileName, format = 'A4') {
        if (!documentId || !fileName) return null;
        const cleanFile = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
        return `${BASE_URL}/documents/${encodeURIComponent(documentId)}/getPDF/${encodeURIComponent(format)}/${encodeURIComponent(cleanFile)}`;
    }

    /**
     * Anula un documento previamente emitido
     */
    static async voidBill({ personaId, personaToken, documentId, reason }) {
        try {
            const resp = await fetch(`${BASE_URL}/personas/v1/voidBill`, {
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
                licencia: (data.conductor_licencia || 'Q00000000').trim()
            };
        }

        // Documentos Relacionados (GRE remitente vinculada)
        if (data.gre_relacionada_numero && String(data.gre_relacionada_numero).trim()) {
            datosEnvio.documentosRelacionados = [
                {
                    tipoDoc: "09",
                    numDoc: String(data.gre_relacionada_numero).trim()
                }
            ];
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
