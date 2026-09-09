const express = require('express');
const router = express.Router();
const SunatGrService = require('../services/sunatGrService');

module.exports = function(db, tenantStorage) {

    // Helper para obtener conexión tenant
    const getDb = (req) => {
        const d = (req && req.db) ? req.db : db;
        if (!d) return null;
        return (typeof d.promise === 'function') ? d.promise() : d;
    };

    // Crear tablas de Guías de Remisión si no existen
    const initTables = async (dbConn) => {
        try {
            if (!dbConn) return;
            const queryFn = typeof dbConn.query === 'function' ? dbConn.query.bind(dbConn) : null;
            if (!queryFn) return;
            await dbConn.query(`
                CREATE TABLE IF NOT EXISTS guias_remision (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    numero_guia VARCHAR(30) NOT NULL UNIQUE,
                    tipo_documento VARCHAR(10) DEFAULT '31',
                    fecha_emision DATE DEFAULT NULL,
                    fecha_traslado DATE DEFAULT NULL,
                    remitente_ruc VARCHAR(20) DEFAULT NULL,
                    remitente_razon_social VARCHAR(255) DEFAULT NULL,
                    destinatario_ruc VARCHAR(20) DEFAULT NULL,
                    destinatario_razon_social VARCHAR(255) DEFAULT NULL,
                    punto_partida_direccion TEXT DEFAULT NULL,
                    punto_partida_ubigeo VARCHAR(10) DEFAULT NULL,
                    punto_llegada_direccion TEXT DEFAULT NULL,
                    punto_llegada_ubigeo VARCHAR(10) DEFAULT NULL,
                    placa_tracto VARCHAR(20) DEFAULT NULL,
                    placa_carreta VARCHAR(20) DEFAULT NULL,
                    conductor_tipo_doc VARCHAR(10) DEFAULT 'DNI',
                    conductor_num_doc VARCHAR(20) DEFAULT NULL,
                    conductor_nombre VARCHAR(200) DEFAULT NULL,
                    conductor_licencia VARCHAR(30) DEFAULT NULL,
                    peso_bruto_total DECIMAL(12,2) DEFAULT 0,
                    unidad_medida VARCHAR(10) DEFAULT 'KGM',
                    estado_sunat VARCHAR(50) DEFAULT 'ACEPTADO',
                    codigo_respuesta_sunat VARCHAR(20) DEFAULT '0',
                    observaciones_sunat TEXT DEFAULT NULL,
                    gre_relacionada_id INT DEFAULT NULL,
                    gre_relacionada_numero VARCHAR(30) DEFAULT NULL,
                    num_ticket VARCHAR(50) DEFAULT NULL,
                    xml_hash VARCHAR(100) DEFAULT NULL,
                    modo_emision VARCHAR(20) DEFAULT 'SIMULACION',
                    motivo_traslado VARCHAR(10) DEFAULT '01',
                    datos_json LONGTEXT DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_numero_guia (numero_guia),
                    INDEX idx_placa_tracto (placa_tracto),
                    INDEX idx_fecha_emision (fecha_emision),
                    INDEX idx_gre_relacionada (gre_relacionada_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);

            // Migración defensiva en caso de que la tabla ya exista sin las nuevas columnas
            const addCols = [
                "ALTER TABLE guias_remision ADD COLUMN gre_relacionada_id INT DEFAULT NULL",
                "ALTER TABLE guias_remision ADD COLUMN gre_relacionada_numero VARCHAR(30) DEFAULT NULL",
                "ALTER TABLE guias_remision ADD COLUMN num_ticket VARCHAR(50) DEFAULT NULL",
                "ALTER TABLE guias_remision ADD COLUMN xml_hash VARCHAR(100) DEFAULT NULL",
                "ALTER TABLE guias_remision ADD COLUMN modo_emision VARCHAR(20) DEFAULT 'SIMULACION'",
                "ALTER TABLE guias_remision ADD COLUMN motivo_traslado VARCHAR(10) DEFAULT '01'",
                "ALTER TABLE guias_remision ADD COLUMN hora_emision VARCHAR(20) DEFAULT NULL",
                "ALTER TABLE guias_remision ADD COLUMN fecha_cdr DATETIME DEFAULT NULL",
                "ALTER TABLE guias_remision ADD COLUMN hora_cdr VARCHAR(20) DEFAULT NULL",
                "ALTER TABLE guias_remision ADD COLUMN descripcion_motivo VARCHAR(255) DEFAULT NULL",
                "ALTER TABLE guias_remision ADD COLUMN modalidad_traslado VARCHAR(50) DEFAULT 'Público'",
                "ALTER TABLE guias_remision ADD COLUMN indicador_transbordo TINYINT(1) DEFAULT 0",
                "ALTER TABLE guias_remision ADD COLUMN indicador_retorno_vacio TINYINT(1) DEFAULT 0",
                "ALTER TABLE guias_remision ADD COLUMN indicador_m1_l TINYINT(1) DEFAULT 0",
                "ALTER TABLE guias_remision ADD COLUMN transportista_ruc VARCHAR(20) DEFAULT NULL",
                "ALTER TABLE guias_remision ADD COLUMN transportista_razon_social VARCHAR(255) DEFAULT NULL",
                "ALTER TABLE guias_remision ADD COLUMN registro_mtc VARCHAR(50) DEFAULT NULL",
                "ALTER TABLE guias_remision ADD COLUMN volumen_m3 DECIMAL(12,3) DEFAULT NULL",
                "ALTER TABLE guias_remision ADD COLUMN xml_contenido LONGTEXT DEFAULT NULL"
            ];
            for (const sql of addCols) {
                try { await dbConn.query(sql); } catch(_) {}
            }

            await dbConn.query(`
                CREATE TABLE IF NOT EXISTS guias_remision_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guia_id INT NOT NULL,
                    item_numero INT DEFAULT 1,
                    bien_normalizado VARCHAR(10) DEFAULT 'NO',
                    codigo_bien VARCHAR(50) DEFAULT NULL,
                    codigo_sunat VARCHAR(30) DEFAULT NULL,
                    codigo_gtin VARCHAR(30) DEFAULT NULL,
                    codigo_subpartida VARCHAR(30) DEFAULT NULL,
                    codigo VARCHAR(50) DEFAULT NULL,
                    descripcion TEXT NOT NULL,
                    cantidad DECIMAL(12,2) DEFAULT 1,
                    unidad_medida VARCHAR(20) DEFAULT 'NIU',
                    peso_unitario DECIMAL(12,2) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_guia_id (guia_id),
                    FOREIGN KEY (guia_id) REFERENCES guias_remision(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);

            const addColsItems = [
                "ALTER TABLE guias_remision_items ADD COLUMN item_numero INT DEFAULT 1",
                "ALTER TABLE guias_remision_items ADD COLUMN bien_normalizado VARCHAR(10) DEFAULT 'NO'",
                "ALTER TABLE guias_remision_items ADD COLUMN codigo_bien VARCHAR(50) DEFAULT NULL",
                "ALTER TABLE guias_remision_items ADD COLUMN codigo_sunat VARCHAR(30) DEFAULT NULL",
                "ALTER TABLE guias_remision_items ADD COLUMN codigo_gtin VARCHAR(30) DEFAULT NULL",
                "ALTER TABLE guias_remision_items ADD COLUMN codigo_subpartida VARCHAR(30) DEFAULT NULL"
            ];
            for (const sql of addColsItems) {
                try { await dbConn.query(sql); } catch(_) {}
            }
        } catch (e) {
            console.error("Error inicializando tablas guias_remision:", e.message);
        }
    };

    // 1. Obtener Credenciales de SUNAT
    router.get('/credenciales-sunat', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);

            const [rows] = await dbConn.query(
                "SELECT clave, valor FROM integraciones_api WHERE clave IN ('sunat_client_id', 'sunat_client_secret', 'sunat_ruc_emisor', 'sunat_usuario_sol', 'sunat_modo_entorno')"
            );

            const creds = {
                sunat_client_id: '',
                sunat_client_secret: '',
                sunat_ruc_emisor: '',
                sunat_usuario_sol: '',
                sunat_modo_entorno: 'produccion'
            };

            rows.forEach(r => {
                creds[r.clave] = r.valor || '';
            });

            res.json({ ok: true, credenciales: creds });
        } catch (err) {
            console.error("Error obteniendo credenciales SUNAT:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 2. Guardar Credenciales de SUNAT
    router.post('/credenciales-sunat', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);
            const { sunat_client_id, sunat_client_secret, sunat_ruc_emisor, sunat_usuario_sol, sunat_clave_sol, sunat_modo_entorno } = req.body;

            const toSave = {
                sunat_client_id: (sunat_client_id || '').trim(),
                sunat_client_secret: (sunat_client_secret || '').trim(),
                sunat_ruc_emisor: (sunat_ruc_emisor || '').trim(),
                sunat_usuario_sol: (sunat_usuario_sol || '').trim(),
                sunat_modo_entorno: sunat_modo_entorno || 'produccion'
            };

            if (sunat_clave_sol && sunat_clave_sol.trim() !== '') {
                toSave.sunat_clave_sol = sunat_clave_sol.trim();
            }

            for (const [clave, valor] of Object.entries(toSave)) {
                await dbConn.query(
                    "INSERT INTO integraciones_api (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = ?",
                    [clave, valor, valor]
                );
            }

            res.json({ ok: true, message: "Credenciales de SUNAT guardadas exitosamente." });
        } catch (err) {
            console.error("Error guardando credenciales SUNAT:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 3. Listar Guías de Remisión Registradas
    router.get('/', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);

            const { desde, hasta, search, placa, tipoDoc } = req.query;

            let query = `
                SELECT 
                    g.*,
                    (SELECT COUNT(*) FROM guias_remision_items i WHERE i.guia_id = g.id) AS total_items
                FROM guias_remision g
                WHERE 1=1
            `;
            const params = [];

            if (desde) {
                query += ` AND g.fecha_emision >= ?`;
                params.push(desde);
            }
            if (hasta) {
                query += ` AND g.fecha_emision <= ?`;
                params.push(hasta);
            }
            if (placa) {
                query += ` AND (g.placa_tracto LIKE ? OR g.placa_carreta LIKE ?)`;
                params.push(`%${placa}%`, `%${placa}%`);
            }
            if (tipoDoc) {
                query += ` AND g.tipo_documento = ?`;
                params.push(tipoDoc);
            }
            if (search) {
                query += ` AND (
                    g.numero_guia LIKE ? OR 
                    g.remitente_razon_social LIKE ? OR 
                    g.destinatario_razon_social LIKE ? OR 
                    g.conductor_nombre LIKE ? OR 
                    g.punto_llegada_direccion LIKE ?
                )`;
                const term = `%${search}%`;
                params.push(term, term, term, term, term);
            }

            query += ` ORDER BY g.fecha_emision DESC, g.id DESC LIMIT 500`;

            const [guias] = await dbConn.query(query, params);

            // Obtener ítems de cada guía
            if (guias.length > 0) {
                const guiaIds = guias.map(g => g.id);
                const [items] = await dbConn.query(
                    `SELECT * FROM guias_remision_items WHERE guia_id IN (?)`,
                    [guiaIds]
                );

                const itemsMap = {};
                items.forEach(it => {
                    if (!itemsMap[it.guia_id]) itemsMap[it.guia_id] = [];
                    itemsMap[it.guia_id].push(it);
                });

                guias.forEach(g => {
                    g.items = itemsMap[g.id] || [];
                });
            }

            res.json({ ok: true, data: guias });
        } catch (err) {
            console.error("Error listando guias de remision:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 2.5 Probar generación de Token OAuth 2.0 con SUNAT
    router.post('/test-token-sunat', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);

            const [rows] = await dbConn.query(
                "SELECT clave, valor FROM integraciones_api WHERE clave IN ('sunat_client_id', 'sunat_client_secret', 'sunat_ruc_emisor', 'sunat_usuario_sol', 'sunat_clave_sol', 'sunat_modo_entorno')"
            );

            const creds = {};
            rows.forEach(r => creds[r.clave] = r.valor || '');

            if (!creds.sunat_client_id || !creds.sunat_client_secret) {
                return res.status(400).json({ ok: false, error: "Client ID y Client Secret son requeridos para conectar con la API de SUNAT." });
            }

            const tokenUrl = `https://api-seguridad.sunat.gob.pe/v1/clientessol/${encodeURIComponent(creds.sunat_client_id)}/oauth2/token/`;
            
            const scopeGre = 'https://api-cpe.sunat.gob.pe';
            const bodyParams = {
                client_id: creds.sunat_client_id,
                client_secret: creds.sunat_client_secret
            };

            if (creds.sunat_usuario_sol && creds.sunat_clave_sol && creds.sunat_ruc_emisor) {
                bodyParams.grant_type = 'password';
                bodyParams.scope = scopeGre;
                bodyParams.username = `${creds.sunat_ruc_emisor}${creds.sunat_usuario_sol}`;
                bodyParams.password = creds.sunat_clave_sol;
            } else {
                bodyParams.grant_type = 'client_credentials';
                bodyParams.scope = scopeGre;
            }

            const searchParams = new URLSearchParams(bodyParams);

            const authRes = await fetch(tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: searchParams.toString()
            });

            const authData = await authRes.json();

            if (!authRes.ok || authData.error) {
                const errMsg = authData.error_description || authData.message || authData.error || `HTTP ${authRes.status}`;
                return res.status(400).json({ ok: false, error: errMsg });
            }

            res.json({
                ok: true,
                message: "Conexión OAuth 2.0 exitosa",
                expires_in: authData.expires_in,
                token_type: authData.token_type
            });
        } catch (err) {
            console.error("Error en test-token-sunat:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 4. Consultar Guía en SUNAT (API REST GEM — /v1/contribuyente/gem)
    router.get('/consultar-sunat', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);

            const { numero, serie, correlativo, rucEmisor, tipoDoc, guardar } = req.query;
            
            // Armar número completo si vienen serie y correlativo
            let cleanNumero = '';
            let serieLimpia = (serie || '').trim().toUpperCase();
            let numLimpio = (correlativo || '').trim();

            if (numero) {
                cleanNumero = String(numero).trim().toUpperCase();
                const partes = cleanNumero.split('-');
                if (partes.length === 2) {
                    serieLimpia = partes[0];
                    numLimpio = partes[1];
                }
            } else if (serieLimpia && numLimpio) {
                cleanNumero = `${serieLimpia}-${numLimpio.padStart(8, '0')}`;
            }

            if (!cleanNumero) {
                return res.status(400).json({ ok: false, error: "Debe ingresar el número de la guía (Serie y Correlativo)." });
            }

            const cleanRuc = (rucEmisor || '').trim();
            const tipoDocumento = tipoDoc || '09'; // 09 = GRE Remitente, 31 = GRT Transportista

            // Verificar si ya existe registrada en la base de datos local
            const [existentes] = await dbConn.query(
                "SELECT * FROM guias_remision WHERE numero_guia = ? OR numero_guia = ?",
                [cleanNumero, `${serieLimpia}-${parseInt(numLimpio, 10)}`]
            );

            if (existentes.length > 0) {
                const guiaExist = existentes[0];
                const [itemsExist] = await dbConn.query("SELECT * FROM guias_remision_items WHERE guia_id = ?", [guiaExist.id]);
                return res.json({ ok: true, estado: 'ENCONTRADA', data: { ...guiaExist, items: itemsExist || [] }, origen: 'bd' });
            }

            // Obtener credenciales SUNAT
            const [rows] = await dbConn.query(
                "SELECT clave, valor FROM integraciones_api WHERE clave IN ('sunat_client_id', 'sunat_client_secret', 'sunat_ruc_emisor', 'sunat_usuario_sol', 'sunat_clave_sol', 'sunat_modo_entorno')"
            );
            const creds = {};
            rows.forEach(r => creds[r.clave] = r.valor);

            if (!creds.sunat_client_id || !creds.sunat_client_secret) {
                return res.status(400).json({ ok: false, error: "Faltan credenciales SUNAT. Configure Client ID y Client Secret en Sistema > Integraciones." });
            }

            const rucEmisorGuia = cleanRuc || creds.sunat_ruc_emisor;

            // ═══════════════════════════════════════════════════
            // PASO 1: Obtener Token OAuth 2.0 (scope: api-cpe)
            // ═══════════════════════════════════════════════════
            const tokenUrl = `https://api-seguridad.sunat.gob.pe/v1/clientessol/${encodeURIComponent(creds.sunat_client_id)}/oauth2/token/`;
            const tokenBody = {
                grant_type: 'password',
                scope: 'https://api-cpe.sunat.gob.pe',
                client_id: creds.sunat_client_id,
                client_secret: creds.sunat_client_secret,
                username: `${creds.sunat_ruc_emisor}${creds.sunat_usuario_sol}`,
                password: creds.sunat_clave_sol
            };

            console.log(`[SUNAT GRE] Solicitando token OAuth → ${tokenUrl}`);

            const authRes = await fetch(tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(tokenBody).toString()
            });

            const authData = await authRes.json().catch(() => ({}));

            if (!authRes.ok || authData.error) {
                const errMsg = authData.error_description || authData.error || `HTTP ${authRes.status}`;
                console.error(`[SUNAT GRE] Error OAuth: ${errMsg}`);
                return res.status(400).json({ ok: false, error: `Error autenticación SUNAT: ${errMsg}` });
            }

            const accessToken = authData.access_token;
            console.log(`[SUNAT GRE] Token obtenido OK. Expires: ${authData.expires_in}s`);

            // ═══════════════════════════════════════════════════
            // PASO 2: Consultar GRE vía API GEM
            // Endpoint: GET /v1/contribuyente/gem/comprobantes/{RUC}-{tipo}-{serie}-{numero}
            // Permiso requerido: GRE Emision de Comprobantes /v1/contribuyente/gem
            // ═══════════════════════════════════════════════════
            const numCpe8 = numLimpio.padStart(8, '0');
            const numCpeLimpio = parseInt(numLimpio, 10).toString();

            // Intentar múltiples endpoints y formatos de ID que SUNAT maneja en la API GEM
            const candidates = [
                {
                    url: `https://api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/${rucEmisorGuia}-${tipoDocumento}-${serieLimpia}-${numCpe8}`,
                    desc: `${rucEmisorGuia}-${tipoDocumento}-${serieLimpia}-${numCpe8}`
                },
                {
                    url: `https://api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/${rucEmisorGuia}-${tipoDocumento}-${serieLimpia}-${numCpeLimpio}`,
                    desc: `${rucEmisorGuia}-${tipoDocumento}-${serieLimpia}-${numCpeLimpio}`
                },
                {
                    url: `https://api-cpe.sunat.gob.pe/v1/contribuyente/gem/cpe/remision/guias/${tipoDocumento}-${serieLimpia}-${numCpe8}`,
                    desc: `guias/${tipoDocumento}-${serieLimpia}-${numCpe8}`
                },
                {
                    url: `https://api-cpe.sunat.gob.pe/v1/contribuyente/gem/cpe/remision/guias/${tipoDocumento}-${serieLimpia}-${numCpeLimpio}`,
                    desc: `guias/${tipoDocumento}-${serieLimpia}-${numCpeLimpio}`
                },
                {
                    url: `https://api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/envios/${rucEmisorGuia}-${tipoDocumento}-${serieLimpia}-${numCpe8}`,
                    desc: `envios/${rucEmisorGuia}-${tipoDocumento}-${serieLimpia}-${numCpe8}`
                }
            ];

            let sunatResp = null;
            let sunatJson = null;
            let lastError = null;

            for (const cand of candidates) {
                try {
                    console.log(`[SUNAT GRE] GET → ${cand.url}`);
                    const resp = await fetch(cand.url, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Accept': 'application/json'
                        }
                    });

                    const bodyText = await resp.text();
                    let json = null;
                    try { json = JSON.parse(bodyText); } catch (_) {}

                    console.log(`[SUNAT GRE] Respuesta HTTP ${resp.status} de ${cand.desc}:`, bodyText.substring(0, 300));

                    if (resp.ok && json) {
                        sunatResp = resp;
                        sunatJson = json;
                        break; // Encontró la guía
                    }

                    lastError = {
                        status: resp.status,
                        body: json || bodyText.substring(0, 300),
                        cpeId: cand.desc
                    };

                    // Si 401/403 es rechazo de credenciales/permisos a nivel general, no continuar
                    if (resp.status === 401) break;

                } catch (fetchErr) {
                    console.warn(`[SUNAT GRE] Error de red al consultar ${cand.url}:`, fetchErr.message);
                    lastError = { status: 0, body: fetchErr.message, cpeId: cand.desc };
                }
            }

            // ═══════════════════════════════════════════════════
            // PASO 3: Procesar resultado
            // ═══════════════════════════════════════════════════
            if (!sunatResp || !sunatJson) {
                // No se encontró — construir mensaje de error claro
                let mensajeError = `No se encontró la guía ${cleanNumero} en SUNAT.`;
                
                if (lastError) {
                    if (lastError.status === 401 || lastError.status === 403) {
                        mensajeError = `SUNAT denegó el acceso (${lastError.status}). ` +
                            `Verifique que su aplicación tenga habilitado "GRE Emision de Comprobantes /v1/contribuyente/gem" en Clave SOL → Credenciales API. ` +
                            `Nota: Solo puede consultar GRE emitidas por su propio RUC (${creds.sunat_ruc_emisor}), no de terceros.`;
                    } else if (lastError.status === 404) {
                        mensajeError = `La guía ${cleanNumero} no fue encontrada en SUNAT para el RUC ${rucEmisorGuia}. Verifique serie y número.`;
                    } else if (lastError.status === 405) {
                        mensajeError = `SUNAT respondió 405 (Method Not Allowed) para ${lastError.cpeId}. Este endpoint puede no soportar consulta GET.`;
                    } else if (lastError.status === 422) {
                        mensajeError = `SUNAT rechazó la consulta (422). Datos inválidos: ${JSON.stringify(lastError.body)}`;
                    }
                }

                return res.status(lastError?.status === 404 ? 404 : 400).json({
                    ok: false,
                    error: mensajeError,
                    sunatStatus: lastError?.status || 0,
                    sugerencia: 'REGISTRO_MANUAL',
                    detalleSunat: lastError?.body || null
                });
            }

            // SUNAT devolvió datos — parsear la estructura de la GRE
            const sData = sunatJson;
            const t = sData.traslado || {};
            const emi = sData.emision || {};
            const emisor = sData.emisor || {};
            const receptor = sData.receptor || {};
            const partida = (t.partida && t.partida.direccion) || {};
            const llegada = (t.llegada && t.llegada.direccion) || {};
            const vehiculos = Array.isArray(t.vehiculo) ? t.vehiculo : [];
            const tracto = vehiculos.find(v => v.desTipoVehiculo === 'Principal' || v.indTipoVehiculo === '1') || vehiculos[0] || {};
            const carreta = vehiculos.find(v => v.desTipoVehiculo !== 'Principal' && v.indTipoVehiculo !== '1') || vehiculos[1] || {};
            const conductores = Array.isArray(t.conductor) ? t.conductor : [];
            const cond = conductores[0] || {};
            const bienes = Array.isArray(t.bien) ? t.bien : (Array.isArray(sData.detalles || sData.items) ? (sData.detalles || sData.items) : []);

            const guiaData = {
                numero_guia: cleanNumero,
                tipo_documento: sData.codCpe || tipoDocumento,
                fecha_emision: (emi.fecEmision || sData.fecEmision || sData.fechaEmision || new Date().toISOString()).slice(0, 10),
                fecha_traslado: (t.fecInicioTraslado || sData.fecInicioTraslado || sData.fechaTraslado || new Date().toISOString()).slice(0, 10),
                remitente_ruc: sData.numRuc || sData.numRucRemitente || rucEmisorGuia,
                remitente_razon_social: emisor.desNombre || sData.desRazonSocialRemitente || sData.remitenteRazonSocial || '—',
                destinatario_ruc: receptor.numDocIdentidad || sData.numRucDestinatario || sData.destinatarioRuc || '—',
                destinatario_razon_social: receptor.desNombre || sData.desRazonSocialDestinatario || sData.destinatarioRazonSocial || '—',
                punto_partida_direccion: partida.desDireccion || sData.desDireccionPartida || sData.puntoPartida || '—',
                punto_partida_ubigeo: partida.codUbigeo || sData.codUbigeoPartida || sData.ubigeoPartida || '—',
                punto_llegada_direccion: llegada.desDireccion || sData.desDireccionLlegada || sData.puntoLlegada || '—',
                punto_llegada_ubigeo: llegada.codUbigeo || sData.codUbigeoLlegada || sData.ubigeoLlegada || '—',
                placa_tracto: tracto.numPlaca || sData.numPlacaVehiculo || sData.placaTracto || '—',
                placa_carreta: carreta.numPlaca || sData.numPlacaSemirremolque || sData.placaCarreta || '—',
                conductor_tipo_doc: (cond.codTipoDocIdentidad === '1' ? 'DNI' : (cond.desTipoDocIdentidad || sData.tipDocIdentidadConductor || 'DNI')),
                conductor_num_doc: cond.numDocIdentidad || sData.numDocIdentidadConductor || sData.conductorDni || '—',
                conductor_nombre: cond.desNombre || sData.desNombresConductor || sData.conductorNombre || '—',
                conductor_licencia: cond.numLicencia || sData.numLicenciaConductor || sData.conductorLicencia || '—',
                peso_bruto_total: Number(t.numPesoBruto !== undefined ? t.numPesoBruto : (sData.canPesoBrutoTotal || sData.pesoTotal || 0)),
                unidad_medida: t.codUnidadMedidaPb || sData.codUnidadMedida || 'KGM',
                estado_sunat: sData.desEstado ? sData.desEstado.toUpperCase() : 'ACEPTADO',
                codigo_respuesta_sunat: sData.codEstado || '0',
                observaciones_sunat: sData.observacion || 'Guía consultada desde API GEM SUNAT.',
                items: bienes.map(it => ({
                    codigo: it.codBien || it.codItem || it.codigo || '—',
                    descripcion: it.desBien || it.desItem || it.descripcion || '—',
                    cantidad: Number(it.numCantidad !== undefined ? it.numCantidad : (it.canItem || it.cantidad || 1)),
                    unidad_medida: it.codUniMedida || it.codUnidadMedida || it.unidadMedida || 'NIU',
                    peso_unitario: Number(it.canPesoItem || it.pesoUnitario || 0)
                }))
            };

            // Guardar en BD si se solicita
            if (guardar === 'true' || guardar === true) {
                try {
                    const [insertRes] = await dbConn.query(`
                        INSERT INTO guias_remision (
                            numero_guia, tipo_documento, fecha_emision, fecha_traslado,
                            remitente_ruc, remitente_razon_social, destinatario_ruc, destinatario_razon_social,
                            punto_partida_direccion, punto_partida_ubigeo, punto_llegada_direccion, punto_llegada_ubigeo,
                            placa_tracto, placa_carreta, conductor_tipo_doc, conductor_num_doc, conductor_nombre, conductor_licencia,
                            peso_bruto_total, unidad_medida, estado_sunat, codigo_respuesta_sunat, observaciones_sunat, datos_json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        guiaData.numero_guia, guiaData.tipo_documento, guiaData.fecha_emision, guiaData.fecha_traslado,
                        guiaData.remitente_ruc, guiaData.remitente_razon_social, guiaData.destinatario_ruc, guiaData.destinatario_razon_social,
                        guiaData.punto_partida_direccion, guiaData.punto_partida_ubigeo, guiaData.punto_llegada_direccion, guiaData.punto_llegada_ubigeo,
                        guiaData.placa_tracto, guiaData.placa_carreta, guiaData.conductor_tipo_doc, guiaData.conductor_num_doc, guiaData.conductor_nombre, guiaData.conductor_licencia,
                        guiaData.peso_bruto_total, guiaData.unidad_medida, guiaData.estado_sunat, guiaData.codigo_respuesta_sunat, guiaData.observaciones_sunat,
                        JSON.stringify(sData)
                    ]);
                    guiaData.id = insertRes.insertId;

                    if (guiaData.items && guiaData.items.length > 0) {
                        for (const item of guiaData.items) {
                            await dbConn.query(`INSERT INTO guias_remision_items (guia_id, codigo, descripcion, cantidad, unidad_medida, peso_unitario) VALUES (?, ?, ?, ?, ?, ?)`,
                                [guiaData.id, item.codigo, item.descripcion, item.cantidad, item.unidad_medida, item.peso_unitario || 0]);
                        }
                    }
                } catch (errSave) {
                    if (errSave.code === 'ER_DUP_ENTRY') {
                        console.log(`[SUNAT GRE] Guía ${cleanNumero} ya existe en BD.`);
                    } else { throw errSave; }
                }
            }

            res.json({ ok: true, estado: 'ENCONTRADA', data: guiaData, origen: 'sunat' });
        } catch (err) {
            console.error("[SUNAT GRE] Error en /consultar-sunat:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ══════════════════════════════════════════════════════════
    // PARSER UBL 2.1 OFICIAL PARA XML DESCARGADO DE SUNAT
    // ══════════════════════════════════════════════════════════
    function parseUblXml(xmlStr) {
        if (!xmlStr || typeof xmlStr !== 'string') return null;

        const getVal = (tag, str) => {
            if (!str) return '';
            const regex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/(?:[a-zA-Z0-9_]+:)?${tag}>`, 'i');
            const m = str.match(regex);
            return m ? m[1].trim() : '';
        };

        const getAttr = (tag, attr, str) => {
            if (!str) return '';
            const regex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}[^>]*\\s+${attr}=["']([^"']+)["'][^>]*>`, 'i');
            const m = str.match(regex);
            return m ? m[1].trim() : '';
        };

        const rawNumeroGuia = getVal('ID', xmlStr);
        let numero_guia = rawNumeroGuia;
        if (rawNumeroGuia && rawNumeroGuia.includes('-')) {
            const parts = rawNumeroGuia.split('-');
            const serie = parts[0].trim().toUpperCase();
            let correlativo = parts[1].trim();
            if (/^\d+$/.test(correlativo)) {
                correlativo = correlativo.padStart(8, '0');
            }
            numero_guia = `${serie}-${correlativo}`;
        }
        const fecha_emision = getVal('IssueDate', xmlStr);
        const hora_emision = getVal('IssueTime', xmlStr);
        const tipo_documento = getVal('DespatchAdviceTypeCode', xmlStr) || '09';

        // Emisor / Remitente
        const mEmisor = xmlStr.match(/<(?:\w+:)?DespatchSupplierParty[\s\S]*?<\/(?:\w+:)?DespatchSupplierParty>/i);
        const emisorBloque = mEmisor ? mEmisor[0] : '';
        const remitente_ruc = getVal('ID', emisorBloque);
        const remitente_razon_social = getVal('RegistrationName', emisorBloque);

        // Destinatario
        const mDest = xmlStr.match(/<(?:\w+:)?DeliveryCustomerParty[\s\S]*?<\/(?:\w+:)?DeliveryCustomerParty>/i);
        const destBloque = mDest ? mDest[0] : '';
        const destinatario_ruc = getVal('ID', destBloque);
        const destinatario_razon_social = getVal('RegistrationName', destBloque);

        // Shipment / Datos del Traslado
        const mShip = xmlStr.match(/<(?:\w+:)?Shipment[\s\S]*?<\/(?:\w+:)?Shipment>/i);
        const shipBloque = mShip ? mShip[0] : '';
        const motivo_traslado = getVal('HandlingCode', shipBloque) || '01';
        const descripcion_motivo = getVal('Information', shipBloque) || 'VENTA';
        const peso_bruto_total = parseFloat(getVal('GrossWeightMeasure', shipBloque) || 0);
        const unidad_medida = getAttr('GrossWeightMeasure', 'unitCode', shipBloque) || 'KGM';

        // Transportista / Carrier
        const mCarrier = shipBloque.match(/<(?:\w+:)?CarrierParty[\s\S]*?<\/(?:\w+:)?CarrierParty>/i);
        const carBloque = mCarrier ? mCarrier[0] : '';
        const transportista_ruc = getVal('ID', carBloque);
        const transportista_razon_social = getVal('RegistrationName', carBloque);
        const registro_mtc = getVal('CompanyID', carBloque);

        // Partida (OriginAddress o DespatchAddress)
        const mPartida = (shipBloque || xmlStr).match(/<(?:\w+:)?(?:OriginAddress|DespatchAddress)[\s\S]*?<\/(?:\w+:)?(?:OriginAddress|DespatchAddress)>/i);
        const partBloque = mPartida ? mPartida[0] : '';
        const punto_partida_ubigeo = getVal('ID', partBloque);
        const punto_partida_direccion = getVal('Line', partBloque) || getVal('StreetName', partBloque) || '';

        // Llegada (DeliveryAddress)
        const mLlegada = (shipBloque || xmlStr).match(/<(?:\w+:)?DeliveryAddress[\s\S]*?<\/(?:\w+:)?DeliveryAddress>/i);
        const llegBloque = mLlegada ? mLlegada[0] : '';
        const punto_llegada_ubigeo = getVal('ID', llegBloque);
        const punto_llegada_direccion = getVal('Line', llegBloque) || getVal('StreetName', llegBloque) || '';

        // Etapa de transporte / Fecha inicio
        const mStage = (shipBloque || xmlStr).match(/<(?:\w+:)?ShipmentStage[\s\S]*?<\/(?:\w+:)?ShipmentStage>/i);
        const stageBloque = mStage ? mStage[0] : '';
        const fecha_traslado = getVal('StartDate', stageBloque) || fecha_emision;
        const modalidadCode = getVal('TransportModeCode', stageBloque);
        const modalidad_traslado = modalidadCode === '02' ? 'Privado' : 'Público';

        // Limpiar comentarios XML y CDATA redundantes para análisis seguro
        const cleanXml = xmlStr.replace(/<!--[\s\S]*?-->/g, '');

        // 🚗 VEHÍCULOS (RoadTransport, TransportMeans, AttachedTransportMeans, TransportEquipment)
        let placa_tracto = '';
        let placa_carreta = '';

        // Buscar bloques explícitos RoadTransport o TransportMeans (Vehículo Principal)
        const mRoad = cleanXml.match(/<(?:\w+:)?RoadTransport[\s\S]*?<\/(?:\w+:)?RoadTransport>/i)
            || cleanXml.match(/<(?:\w+:)?TransportMeans[\s\S]*?<\/(?:\w+:)?TransportMeans>/i);
        if (mRoad) {
            placa_tracto = getVal('LicensePlateID', mRoad[0]) || getVal('ID', mRoad[0]);
        }

        // Buscar bloques AttachedTransportMeans o TransportEquipment (Vehículo Secundario / Carreta)
        const mEquip = cleanXml.match(/<(?:\w+:)?(?:AttachedTransportMeans|TransportEquipment)[\s\S]*?<\/(?:\w+:)?(?:AttachedTransportMeans|TransportEquipment)>/i);
        if (mEquip) {
            const val = getVal('LicensePlateID', mEquip[0]) || getVal('ID', mEquip[0]);
            if (val) placa_carreta = val;
        }

        // Buscar todas las placas registradas en el XML
        const plateMatches = [...cleanXml.matchAll(/<(?:\w+:)?LicensePlateID[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:\w+:)?LicensePlateID>/gi)]
            .map(m => m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim().toUpperCase())
            .filter(p => p.length >= 4 && p.length <= 12 && !p.includes('<'));

        // Si no se asignó placa principal pero se detectaron placas
        if (!placa_tracto) {
            if (plateMatches.length > 0) {
                placa_tracto = plateMatches[0];
                if (plateMatches.length > 1 && !placa_carreta) {
                    placa_carreta = plateMatches[1];
                }
            } else if (placa_carreta) {
                // Si sólo vino en mEquip pero no hay placa principal, es la principal
                placa_tracto = placa_carreta;
                placa_carreta = '';
            }
        }

        // Regla esencial: Si sólo hay una placa o placa_carreta quedó con valor mientras placa_tracto está vacía,
        // la placa DEBE pertenecer al Vehículo Principal
        if (!placa_tracto && placa_carreta) {
            placa_tracto = placa_carreta;
            placa_carreta = '';
        } else if (placa_tracto && plateMatches.length === 1) {
            // Si solo existe una placa en todo el documento, no debe haber secundaria
            placa_carreta = '';
        }

        if (placa_carreta === placa_tracto) {
            placa_carreta = '';
        }

        // 👤 CONDUCTORES (DriverPerson)
        const mDriver = cleanXml.match(/<(?:\w+:)?DriverPerson[\s\S]*?<\/(?:\w+:)?DriverPerson>/i);
        const driverBloque = mDriver ? mDriver[0] : '';
        
        let conductor_num_doc = getVal('ID', driverBloque).replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        if (!conductor_num_doc || conductor_num_doc.length < 8) {
            const mDni = cleanXml.match(/<(?:\w+:)?ID[^>]*schemeID=["']1["'][^>]*>(?:<!\[CDATA\[)?(\d{8})(?:\]\]>)?<\//i)
                || cleanXml.match(/\b(7\d{7}|4\d{7}|0\d{7}|1\d{7}|2\d{7})\b/);
            if (mDni) conductor_num_doc = (mDni[1] || mDni[0]).trim();
        }
        
        let firstName = getVal('FirstName', driverBloque).replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        let familyName = getVal('FamilyName', driverBloque).replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        let conductor_nombre = '';
        if (firstName && familyName) {
            const fNorm = firstName.toLowerCase();
            const famNorm = familyName.toLowerCase();
            if (fNorm === famNorm || fNorm.includes(famNorm)) {
                conductor_nombre = firstName;
            } else if (famNorm.includes(fNorm)) {
                conductor_nombre = familyName;
            } else {
                conductor_nombre = `${firstName} ${familyName}`;
            }
        } else {
            conductor_nombre = (firstName || familyName || getVal('Name', driverBloque) || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        }

        if (conductor_nombre) {
            const words = conductor_nombre.split(/\s+/).filter(Boolean);
            const half = Math.floor(words.length / 2);
            if (half >= 2 && words.slice(0, half).join(' ') === words.slice(half).join(' ')) {
                conductor_nombre = words.slice(0, half).join(' ');
            }
        }

        let conductor_licencia = '';
        const mLicBlock = driverBloque.match(/<(?:\w+:)?IdentityDocumentReference[\s\S]*?<\/(?:\w+:)?IdentityDocumentReference>/i);
        if (mLicBlock) {
            conductor_licencia = getVal('ID', mLicBlock[0]).replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        }
        if (!conductor_licencia) {
            const mLicMatch = cleanXml.match(/<(?:\w+:)?ID[^>]*>(?:<!\[CDATA\[)?([A-Z]\d{8})(?:\]\]>)?<\/(?:\w+:)?ID>/i)
                || cleanXml.match(/\b([A-Z]\d{8})\b/i);
            if (mLicMatch) {
                conductor_licencia = mLicMatch[1].trim().toUpperCase();
            }
        }
        conductor_licencia = conductor_licencia.replace(/<[^>]*>|<!\[CDATA\[|\]\]>/g, '').trim();

        // Observaciones / Note
        const observaciones = getVal('Note', cleanXml);

        // Ítems de la Guía
        const itemRegex = /<(?:\w+:)?DespatchLine[\s\S]*?<\/(?:\w+:)?DespatchLine>/gi;
        const items = [];
        let match;
        while ((match = itemRegex.exec(xmlStr)) !== null) {
            const itStr = match[0];
            const num = parseInt(getVal('ID', itStr), 10) || (items.length + 1);
            const cant = parseFloat(getVal('DeliveredQuantity', itStr) || 1);
            const uMed = getAttr('DeliveredQuantity', 'unitCode', itStr) || 'NIU';
            const desc = getVal('Description', itStr) || getVal('Name', itStr);
            
            const mSell = itStr.match(/<(?:\w+:)?SellersItemIdentification[\s\S]*?<\/(?:\w+:)?SellersItemIdentification>/i);
            const codBien = mSell ? getVal('ID', mSell[0]) : '';

            const mComm = itStr.match(/<(?:\w+:)?CommodityClassification[\s\S]*?<\/(?:\w+:)?CommodityClassification>/i);
            const codSunat = mComm ? getVal('ItemClassificationCode', mComm[0]) : '';

            items.push({
                item_numero: num,
                bien_normalizado: 'NO',
                codigo_bien: codBien,
                codigo_sunat: codSunat,
                codigo_gtin: '',
                codigo_subpartida: '',
                codigo: codBien || `ITM-${num}`,
                descripcion: desc,
                unidad_medida: uMed,
                cantidad: cant,
                peso_unitario: 0
            });
        }

        // Hash digital (DigestValue) para QR oficial SUNAT
        const mDigest = xmlStr.match(/<(?:\w+:)?DigestValue[^>]*>([\s\S]*?)<\/(?:\w+:)?DigestValue>/i);
        const xml_hash = mDigest ? mDigest[1].trim() : '';

        return {
            numero_guia,
            tipo_documento,
            fecha_emision,
            hora_emision,
            fecha_traslado,
            remitente_ruc,
            remitente_razon_social,
            destinatario_ruc,
            destinatario_razon_social,
            motivo_traslado,
            descripcion_motivo,
            peso_bruto_total,
            unidad_medida,
            modalidad_traslado,
            transportista_ruc,
            transportista_razon_social,
            registro_mtc,
            punto_partida_ubigeo,
            punto_partida_direccion,
            punto_llegada_ubigeo,
            punto_llegada_direccion,
            placa_tracto,
            placa_carreta,
            conductor_nombre,
            conductor_num_doc,
            conductor_licencia,
            xml_hash,
            observaciones_sunat: observaciones || 'Esta es una representación impresa sin valor tributario de la Guía de Remisión Electrónica, generada en el sistema de la SUNAT. Puede verificarla utilizando su clave SOL.',
            items
        };
    }

    // 4.1 Endpoint para parsear XML de SUNAT
    router.post('/parse-xml', async (req, res) => {
        try {
            const { xml_contenido } = req.body || {};
            if (!xml_contenido || typeof xml_contenido !== 'string') {
                return res.status(400).json({ ok: false, error: "Contenido XML no proporcionado o inválido." });
            }

            const data = parseUblXml(xml_contenido);
            if (!data || !data.numero_guia) {
                return res.status(400).json({ ok: false, error: "El archivo no tiene una estructura válida de Guía de Remisión Electrónica (DespatchAdvice UBL 2.1)." });
            }

            res.json({ ok: true, data });
        } catch (err) {
            console.error("Error parseando XML:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 4.2 Endpoint para Guardar Guía parseada de XML en el ERP
    router.post('/guardar-gre-xml', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);

            const d = req.body || {};
            if (!d.numero_guia || !d.remitente_ruc) {
                return res.status(400).json({ ok: false, error: "El número de guía y el RUC del remitente son obligatorios." });
            }

            // Normalizar numeración con 8 dígitos como exige SUNAT
            let numGuia = String(d.numero_guia).trim().toUpperCase();
            if (numGuia.includes('-')) {
                const parts = numGuia.split('-');
                const serie = parts[0].trim();
                let correlativo = parts[1].trim();
                if (/^\d+$/.test(correlativo)) correlativo = correlativo.padStart(8, '0');
                numGuia = `${serie}-${correlativo}`;
            }

            // Verificar si ya existe en la base de datos
            const [existentes] = await dbConn.query("SELECT id FROM guias_remision WHERE numero_guia = ?", [numGuia]);

            let guiaId;
            if (existentes.length > 0) {
                guiaId = existentes[0].id;
                // Actualizar registro existente
                await dbConn.query(`
                    UPDATE guias_remision SET
                        tipo_documento = ?, fecha_emision = ?, hora_emision = ?, fecha_cdr = ?, hora_cdr = ?,
                        fecha_traslado = ?, remitente_ruc = ?, remitente_razon_social = ?,
                        destinatario_ruc = ?, destinatario_razon_social = ?,
                        punto_partida_direccion = ?, punto_partida_ubigeo = ?,
                        punto_llegada_direccion = ?, punto_llegada_ubigeo = ?,
                        placa_tracto = ?, placa_carreta = ?, conductor_tipo_doc = ?, conductor_num_doc = ?,
                        conductor_nombre = ?, conductor_licencia = ?, peso_bruto_total = ?, unidad_medida = ?,
                        volumen_m3 = ?, motivo_traslado = ?, descripcion_motivo = ?, modalidad_traslado = ?,
                        transportista_ruc = ?, transportista_razon_social = ?, registro_mtc = ?,
                        xml_hash = ?, observaciones_sunat = ?, xml_contenido = ?, modo_emision = 'XML_SUNAT'
                    WHERE id = ?
                `, [
                    d.tipo_documento || '09', d.fecha_emision || null, d.hora_emision || null, d.fecha_cdr || null, d.hora_cdr || null,
                    d.fecha_traslado || d.fecha_emision || null, d.remitente_ruc, d.remitente_razon_social || '—',
                    d.destinatario_ruc || '—', d.destinatario_razon_social || '—',
                    d.punto_partida_direccion || '—', d.punto_partida_ubigeo || '',
                    d.punto_llegada_direccion || '—', d.punto_llegada_ubigeo || '',
                    d.placa_tracto || '—', d.placa_carreta || '—', d.conductor_tipo_doc || 'DNI', d.conductor_num_doc || '—',
                    d.conductor_nombre || '—', d.conductor_licencia || '—', Number(d.peso_bruto_total || 0), d.unidad_medida || 'KGM',
                    d.volumen_m3 ? Number(d.volumen_m3) : null, d.motivo_traslado || '01', d.descripcion_motivo || 'VENTA', d.modalidad_traslado || 'Público',
                    d.transportista_ruc || null, d.transportista_razon_social || null, d.registro_mtc || null,
                    d.xml_hash || null, d.observaciones_sunat || 'Guía importada desde XML oficial de SUNAT', d.xml_contenido || null,
                    guiaId
                ]);

                // Reemplazar ítems
                await dbConn.query("DELETE FROM guias_remision_items WHERE guia_id = ?", [guiaId]);
            } else {
                // Insertar nueva guía
                const [ins] = await dbConn.query(`
                    INSERT INTO guias_remision (
                        numero_guia, tipo_documento, fecha_emision, hora_emision, fecha_cdr, hora_cdr,
                        fecha_traslado, remitente_ruc, remitente_razon_social,
                        destinatario_ruc, destinatario_razon_social,
                        punto_partida_direccion, punto_partida_ubigeo,
                        punto_llegada_direccion, punto_llegada_ubigeo,
                        placa_tracto, placa_carreta, conductor_tipo_doc, conductor_num_doc,
                        conductor_nombre, conductor_licencia, peso_bruto_total, unidad_medida,
                        volumen_m3, motivo_traslado, descripcion_motivo, modalidad_traslado,
                        transportista_ruc, transportista_razon_social, registro_mtc,
                        xml_hash, observaciones_sunat, xml_contenido, modo_emision, estado_sunat
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'XML_SUNAT', 'ACEPTADO')
                `, [
                    numGuia, d.tipo_documento || '09', d.fecha_emision || null, d.hora_emision || null, d.fecha_cdr || null, d.hora_cdr || null,
                    d.fecha_traslado || d.fecha_emision || null, d.remitente_ruc, d.remitente_razon_social || '—',
                    d.destinatario_ruc || '—', d.destinatario_razon_social || '—',
                    d.punto_partida_direccion || '—', d.punto_partida_ubigeo || '',
                    d.punto_llegada_direccion || '—', d.punto_llegada_ubigeo || '',
                    d.placa_tracto || '—', d.placa_carreta || '—', d.conductor_tipo_doc || 'DNI', d.conductor_num_doc || '—',
                    d.conductor_nombre || '—', d.conductor_licencia || '—', Number(d.peso_bruto_total || 0), d.unidad_medida || 'KGM',
                    d.volumen_m3 ? Number(d.volumen_m3) : null, d.motivo_traslado || '01', d.descripcion_motivo || 'VENTA', d.modalidad_traslado || 'Público',
                    d.transportista_ruc || null, d.transportista_razon_social || null, d.registro_mtc || null,
                    d.xml_hash || null, d.observaciones_sunat || 'Guía importada desde XML oficial de SUNAT', d.xml_contenido || null
                ]);
                guiaId = ins.insertId;
            }

            // Insertar ítems
            if (d.items && Array.isArray(d.items) && d.items.length > 0) {
                for (let i = 0; i < d.items.length; i++) {
                    const it = d.items[i];
                    await dbConn.query(`
                        INSERT INTO guias_remision_items (
                            guia_id, item_numero, bien_normalizado, codigo_bien, codigo_sunat,
                            codigo_gtin, codigo_subpartida, codigo, descripcion, cantidad, unidad_medida, peso_unitario
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        guiaId, it.item_numero || (i + 1), it.bien_normalizado || 'NO',
                        it.codigo_bien || it.codigo || null, it.codigo_sunat || null,
                        it.codigo_gtin || null, it.codigo_subpartida || null,
                        it.codigo || it.codigo_bien || `ITM-${i + 1}`,
                        it.descripcion || '—', Number(it.cantidad || 1), it.unidad_medida || 'NIU',
                        Number(it.peso_unitario || 0)
                    ]);
                }
            }

            res.json({
                ok: true,
                id: guiaId,
                numero_guia: numGuia,
                message: existentes.length > 0 ? "Guía actualizada exitosamente en el ERP." : "Guía guardada exitosamente en el ERP."
            });
        } catch (err) {
            console.error("Error en guardar-gre-xml:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 4.5 Registrar GRE Manualmente (cuando la consulta SUNAT no devuelve datos detallados)
    router.post('/registrar-gre-manual', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);

            const d = req.body || {};

            if (!d.numero_guia || !d.remitente_ruc) {
                return res.status(400).json({ ok: false, error: "Número de guía y RUC del remitente son obligatorios." });
            }

            // Verificar duplicado
            const [existentes] = await dbConn.query(
                "SELECT id FROM guias_remision WHERE numero_guia = ?",
                [d.numero_guia]
            );
            if (existentes.length > 0) {
                return res.status(409).json({ ok: false, error: `La guía ${d.numero_guia} ya está registrada en el ERP con ID #${existentes[0].id}.` });
            }

            const [insertRes] = await dbConn.query(`
                INSERT INTO guias_remision (
                    numero_guia, tipo_documento, fecha_emision, fecha_traslado,
                    remitente_ruc, remitente_razon_social, destinatario_ruc, destinatario_razon_social,
                    punto_partida_direccion, punto_partida_ubigeo, punto_llegada_direccion, punto_llegada_ubigeo,
                    placa_tracto, placa_carreta, conductor_tipo_doc, conductor_num_doc, conductor_nombre, conductor_licencia,
                    peso_bruto_total, unidad_medida, estado_sunat, codigo_respuesta_sunat, observaciones_sunat, modo_emision
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL')
            `, [
                d.numero_guia, d.tipo_documento || '09', d.fecha_emision || new Date().toISOString().slice(0, 10), d.fecha_traslado || d.fecha_emision || new Date().toISOString().slice(0, 10),
                d.remitente_ruc, d.remitente_razon_social || '—', d.destinatario_ruc || '—', d.destinatario_razon_social || '—',
                d.punto_partida_direccion || '—', d.punto_partida_ubigeo || '', d.punto_llegada_direccion || '—', d.punto_llegada_ubigeo || '',
                d.placa_tracto || '—', d.placa_carreta || '—', d.conductor_tipo_doc || 'DNI', d.conductor_num_doc || '—', d.conductor_nombre || '—', d.conductor_licencia || '—',
                Number(d.peso_bruto_total || 0), d.unidad_medida || 'KGM', 'REGISTRADO MANUAL', '0', d.observaciones || 'GRE registrada manualmente desde documento del remitente.'
            ]);

            const newId = insertRes.insertId;

            // Guardar ítems si vienen
            if (d.items && Array.isArray(d.items) && d.items.length > 0) {
                for (const item of d.items) {
                    await dbConn.query(`
                        INSERT INTO guias_remision_items (guia_id, codigo, descripcion, cantidad, unidad_medida, peso_unitario)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, [newId, item.codigo || '001', item.descripcion || '—', Number(item.cantidad || 1), item.unidad_medida || 'NIU', Number(item.peso_unitario || 0)]);
                }
            }

            res.json({ ok: true, message: `GRE ${d.numero_guia} registrada exitosamente en el ERP.`, id: newId });
        } catch (err) {
            console.error("[GRE Manual] Error:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 5. Buscar GREs disponibles en base de datos local para precargar al emitir GRT
    router.get('/buscar-gre', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);

            const term = (req.query.q || '').trim();
            let query = `
                SELECT id, numero_guia, tipo_documento, fecha_emision, remitente_razon_social, remitente_ruc,
                       destinatario_razon_social, destinatario_ruc, punto_partida_direccion, punto_partida_ubigeo,
                       punto_llegada_direccion, punto_llegada_ubigeo, peso_bruto_total, unidad_medida,
                       placa_tracto, placa_carreta, conductor_nombre, conductor_num_doc
                FROM guias_remision
                WHERE (tipo_documento = '09' OR numero_guia LIKE 'T%' OR numero_guia LIKE '09%')
            `;
            const params = [];

            if (term) {
                query += ` AND (numero_guia LIKE ? OR remitente_razon_social LIKE ? OR remitente_ruc LIKE ?)`;
                params.push(`%${term}%`, `%${term}%`, `%${term}%`);
            }

            query += ` ORDER BY id DESC LIMIT 50`;

            const [rows] = await dbConn.query(query, params);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error("Error buscando GREs para emitir GRT:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 6. Obtener Siguiente Correlativo GRT (Transportista Serie V001)
    router.get('/siguiente-correlativo', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);

            const serie = (req.query.serie || 'V001').trim().toUpperCase();
            const [rows] = await dbConn.query(
                "SELECT numero_guia FROM guias_remision WHERE tipo_documento = '31' AND numero_guia LIKE ? ORDER BY id DESC LIMIT 1",
                [`${serie}-%`]
            );

            let correlativo = 1;
            if (rows.length > 0) {
                const parts = rows[0].numero_guia.split('-');
                if (parts.length === 2) {
                    const num = parseInt(parts[1], 10);
                    if (!isNaN(num)) correlativo = num + 1;
                }
            }

            res.json({
                ok: true,
                serie,
                correlativo,
                numero_sugerido: `${serie}-${String(correlativo).padStart(8, '0')}`
            });
        } catch (err) {
            console.error("Error obteniendo correlativo GRT:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 7. Emitir GRT (Transportista) con opción Simulación o Envío Real a SUNAT
    router.post('/emitir-grt', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);

            const grtData = req.body || {};
            const modo = grtData.modo_emision || 'SIMULACION'; // SIMULACION o PRODUCCION

            // Obtener credenciales SUNAT
            const [rowsCreds] = await dbConn.query(
                "SELECT clave, valor FROM integraciones_api WHERE clave IN ('sunat_client_id', 'sunat_client_secret', 'sunat_ruc_emisor', 'sunat_usuario_sol', 'sunat_clave_sol', 'sunat_modo_entorno')"
            );
            const creds = {};
            rowsCreds.forEach(r => creds[r.clave] = r.valor || '');

            // Determinar serie y correlativo si no vienen dados
            const serie = (grtData.serie || 'V001').trim().toUpperCase();
            let correlativo = grtData.correlativo;

            if (!correlativo) {
                const [lastGrt] = await dbConn.query(
                    "SELECT numero_guia FROM guias_remision WHERE tipo_documento = '31' AND numero_guia LIKE ? ORDER BY id DESC LIMIT 1",
                    [`${serie}-%`]
                );
                correlativo = 1;
                if (lastGrt.length > 0) {
                    const parts = lastGrt[0].numero_guia.split('-');
                    if (parts.length === 2) {
                        const num = parseInt(parts[1], 10);
                        if (!isNaN(num)) correlativo = num + 1;
                    }
                }
            }

            grtData.serie = serie;
            grtData.correlativo = correlativo;

            // Procesar emisión a través de SunatGrService
            const emisionRes = await SunatGrService.emitirGrt(grtData, creds, modo);

            if (!emisionRes.ok) {
                return res.status(400).json({
                    ok: false,
                    error: emisionRes.error || "No se pudo emitir la Guía ante SUNAT.",
                    detalle: emisionRes.detalle
                });
            }

            const numeroGuiaCompleto = emisionRes.numero_guia;

            // Guardar en la base de datos de guías de remisión
            const [insertRes] = await dbConn.query(`
                INSERT INTO guias_remision (
                    numero_guia, tipo_documento, fecha_emision, fecha_traslado,
                    remitente_ruc, remitente_razon_social, destinatario_ruc, destinatario_razon_social,
                    punto_partida_direccion, punto_partida_ubigeo, punto_llegada_direccion, punto_llegada_ubigeo,
                    placa_tracto, placa_carreta, conductor_tipo_doc, conductor_num_doc, conductor_nombre, conductor_licencia,
                    peso_bruto_total, unidad_medida, estado_sunat, codigo_respuesta_sunat, observaciones_sunat,
                    gre_relacionada_id, gre_relacionada_numero, num_ticket, xml_hash, modo_emision, motivo_traslado,
                    datos_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                numeroGuiaCompleto,
                '31', // Transportista
                grtData.fecha_emision || new Date().toISOString().slice(0, 10),
                grtData.fecha_traslado || new Date().toISOString().slice(0, 10),
                grtData.remitente_ruc || null,
                grtData.remitente_razon_social || null,
                grtData.destinatario_ruc || null,
                grtData.destinatario_razon_social || null,
                grtData.punto_partida_direccion || null,
                grtData.punto_partida_ubigeo || null,
                grtData.punto_llegada_direccion || null,
                grtData.punto_llegada_ubigeo || null,
                (grtData.placa_tracto || '').trim().toUpperCase() || null,
                (grtData.placa_carreta || '').trim().toUpperCase() || null,
                grtData.conductor_tipo_doc || 'DNI',
                grtData.conductor_num_doc || null,
                grtData.conductor_nombre || null,
                grtData.conductor_licencia || null,
                Number(grtData.peso_bruto_total || 0),
                grtData.unidad_medida || 'KGM',
                emisionRes.estado_sunat || 'ACEPTADO',
                emisionRes.codigo_respuesta || '0',
                emisionRes.observaciones || 'Guía Transportista emitida exitosamente',
                grtData.gre_relacionada_id || null,
                grtData.gre_relacionada_numero || null,
                emisionRes.num_ticket || null,
                emisionRes.xml_hash || null,
                modo,
                grtData.motivo_traslado || '01',
                JSON.stringify(emisionRes.payload_enviado || {})
            ]);

            const nuevaGrtId = insertRes.insertId;

            // Guardar ítems si existen
            const items = grtData.items || [];
            if (items.length > 0) {
                for (const item of items) {
                    await dbConn.query(`
                        INSERT INTO guias_remision_items (guia_id, codigo, descripcion, cantidad, unidad_medida, peso_unitario)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, [
                        nuevaGrtId,
                        item.codigo || '001',
                        item.descripcion || 'MERCADERIA GENERAL',
                        Number(item.cantidad || 1),
                        item.unidad_medida || 'NIU',
                        Number(item.peso_unitario || 0)
                    ]);
                }
            }

            res.json({
                ok: true,
                message: modo === 'SIMULACION'
                    ? `[SIMULACIÓN] Guía Transportista ${numeroGuiaCompleto} emitida con éxito.`
                    : `Guía Transportista ${numeroGuiaCompleto} despachada a SUNAT.`,
                id: nuevaGrtId,
                numero_guia: numeroGuiaCompleto,
                num_ticket: emisionRes.num_ticket,
                estado_sunat: emisionRes.estado_sunat,
                xml_hash: emisionRes.xml_hash,
                modo
            });

        } catch (err) {
            console.error("Error en /emitir-grt:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 8. Consultar Estado de Ticket GRT en SUNAT
    router.get('/consultar-ticket/:id', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);
            const { id } = req.params;

            const [rows] = await dbConn.query("SELECT * FROM guias_remision WHERE id = ?", [id]);
            if (rows.length === 0) {
                return res.status(404).json({ ok: false, error: "Guía no encontrada." });
            }

            const guia = rows[0];
            if (!guia.num_ticket) {
                return res.json({ ok: true, estado_sunat: guia.estado_sunat, mensaje: "Esta guía no tiene ticket pendiente." });
            }

            const [rowsCreds] = await dbConn.query(
                "SELECT clave, valor FROM integraciones_api WHERE clave IN ('sunat_client_id', 'sunat_client_secret', 'sunat_ruc_emisor', 'sunat_usuario_sol', 'sunat_clave_sol')"
            );
            const creds = {};
            rowsCreds.forEach(r => creds[r.clave] = r.valor || '');

            const ticketRes = await SunatGrService.consultarTicket(guia.num_ticket, creds, guia.modo_emision);

            if (ticketRes.ok && ticketRes.estado_sunat) {
                await dbConn.query(
                    "UPDATE guias_remision SET estado_sunat = ?, observaciones_sunat = ? WHERE id = ?",
                    [ticketRes.estado_sunat, ticketRes.mensaje || 'Respuesta de ticket procesada', id]
                );
            }

            res.json({ ok: true, resultado: ticketRes });
        } catch (err) {
            console.error("Error consultando ticket:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 9. Eliminar Guía
    router.delete('/:id', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);
            const { id } = req.params;

            await dbConn.query("DELETE FROM guias_remision WHERE id = ?", [id]);
            res.json({ ok: true, message: "Guía eliminada con éxito." });
        } catch (err) {
            console.error("Error eliminando guia:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    return router;
};
