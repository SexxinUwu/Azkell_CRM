const express = require('express');
const router = express.Router();

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
                    datos_json LONGTEXT DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_numero_guia (numero_guia),
                    INDEX idx_placa_tracto (placa_tracto),
                    INDEX idx_fecha_emision (fecha_emision)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);

            await dbConn.query(`
                CREATE TABLE IF NOT EXISTS guias_remision_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guia_id INT NOT NULL,
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
            
            // Si tiene usuario SOL configurado, usamos password grant o client_credentials
            const bodyParams = {
                client_id: creds.sunat_client_id,
                client_secret: creds.sunat_client_secret
            };

            if (creds.sunat_usuario_sol && creds.sunat_clave_sol && creds.sunat_ruc_emisor) {
                bodyParams.grant_type = 'password';
                bodyParams.scope = 'https://api.sunat.gob.pe/v1/contribuyente/gem';
                bodyParams.username = `${creds.sunat_ruc_emisor}${creds.sunat_usuario_sol}`;
                bodyParams.password = creds.sunat_clave_sol;
            } else {
                bodyParams.grant_type = 'client_credentials';
                bodyParams.scope = 'https://api.sunat.gob.pe/v1/contribuyente/gem';
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

    // 4. Consultar Guía en SUNAT (API REST Oficial / OAuth 2.0 / Validador)
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
                return res.status(400).json({ ok: false, error: "Debe ingresar el número de la guía (Serie y Correlativo, ej. T072-00366620)" });
            }

            const cleanRuc = (rucEmisor || '').trim();
            const tipoDocumento = tipoDoc || (cleanNumero.startsWith('V') || cleanNumero.startsWith('T') ? '09' : '31');

            // Verificar si ya existe registrada en la base de datos local
            const [existentes] = await dbConn.query(
                "SELECT * FROM guias_remision WHERE numero_guia = ? OR numero_guia = ?",
                [cleanNumero, `${serieLimpia}-${parseInt(numLimpio, 10)}`]
            );

            // Obtener credenciales SUNAT
            const [rows] = await dbConn.query(
                "SELECT clave, valor FROM integraciones_api WHERE clave IN ('sunat_client_id', 'sunat_client_secret', 'sunat_ruc_emisor', 'sunat_usuario_sol', 'sunat_clave_sol', 'sunat_modo_entorno')"
            );

            const creds = {};
            rows.forEach(r => creds[r.clave] = r.valor);

            const rucConsulta = cleanRuc || creds.sunat_ruc_emisor || '20609532484';

            // Simulación / Conexión API SUNAT OAuth 2.0
            let tokenSunat = null;
            if (creds.sunat_client_id && creds.sunat_client_secret) {
                try {
                    const tokenUrl = `https://api-seguridad.sunat.gob.pe/v1/clientessol/${encodeURIComponent(creds.sunat_client_id)}/oauth2/token/`;
                    const bodyParams = {
                        client_id: creds.sunat_client_id,
                        client_secret: creds.sunat_client_secret
                    };

                    if (creds.sunat_usuario_sol && creds.sunat_clave_sol && creds.sunat_ruc_emisor) {
                        bodyParams.grant_type = 'password';
                        bodyParams.scope = 'https://api.sunat.gob.pe/v1/contribuyente/gem';
                        bodyParams.username = `${creds.sunat_ruc_emisor}${creds.sunat_usuario_sol}`;
                        bodyParams.password = creds.sunat_clave_sol;
                    } else {
                        bodyParams.grant_type = 'client_credentials';
                        bodyParams.scope = 'https://api.sunat.gob.pe/v1/contribuyente/gem';
                    }

                    const authRes = await fetch(tokenUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams(bodyParams).toString()
                    });

                    if (authRes.ok) {
                        const authData = await authRes.json();
                        tokenSunat = authData.access_token;
                    }
                } catch (e) {
                    console.log("Aviso conexión OAuth SUNAT:", e.message);
                }
            }

            // Datos estructurados de la GRE
            let guiaData = null;

            // Si ya existe en BD local
            if (existentes.length > 0) {
                const guiaExist = existentes[0];
                const [itemsExist] = await dbConn.query("SELECT * FROM guias_remision_items WHERE guia_id = ?", [guiaExist.id]);
                guiaData = {
                    ...guiaExist,
                    items: itemsExist || []
                };
                return res.json({ ok: true, estado: 'ENCONTRADA', data: guiaData, origen: 'bd' });
            }

            // Si no tiene credenciales configuradas
            if (!tokenSunat) {
                return res.status(400).json({
                    ok: false,
                    error: "No se pudo autenticar con SUNAT. Verifique sus credenciales (Client ID, Usuario SOL, Clave SOL) en Sistema > Integraciones."
                });
            }

            // Llamar al endpoint oficial GRE de SUNAT
            // Formato de clave comprobante: {numRucEmisor}-{codCpe}-{numSerie}-{numCpe}
            const numCpe8 = numLimpio.padStart(8, '0');
            const cpeId = `${rucConsulta}-${tipoDocumento}-${serieLimpia}-${numCpe8}`;
            const sunatEndpoint = `https://api-cpe.sunat.gob.pe/v1/contribuyente/gre/comprobantes/${cpeId}`;

            console.log(`[SUNAT GRE] Consultando endpoint oficial: ${sunatEndpoint}`);

            let sunatResp;
            try {
                sunatResp = await fetch(sunatEndpoint, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${tokenSunat}`,
                        'Accept': 'application/json'
                    }
                });
            } catch (netErr) {
                console.error("[SUNAT GRE] Error de red:", netErr);
                return res.status(502).json({
                    ok: false,
                    error: `Error de comunicación con el servidor de SUNAT: ${netErr.message}`
                });
            }

            const sunatStatus = sunatResp.status;
            let sunatJson = null;
            try {
                sunatJson = await sunatResp.json();
            } catch (e) {
                sunatJson = null;
            }

            console.log(`[SUNAT GRE] Respuesta HTTP ${sunatStatus}:`, sunatJson);

            // Manejo de errores devueltos por SUNAT
            if (!sunatResp.ok || (sunatJson && sunatJson.errors)) {
                let mensajeError = "No se encontraron resultados en SUNAT para la serie y número ingresados.";
                if (sunatJson && Array.isArray(sunatJson.errors) && sunatJson.errors.length > 0) {
                    mensajeError = sunatJson.errors.map(err => err.msg || err.desError || err.cod).join('. ');
                } else if (sunatJson && sunatJson.msg) {
                    mensajeError = sunatJson.msg;
                } else if (sunatStatus === 404) {
                    mensajeError = "No se encontró el comprobante en SUNAT (404 Not Found).";
                }

                return res.status(404).json({
                    ok: false,
                    error: mensajeError,
                    detalleSunat: sunatJson
                });
            }

            // Si SUNAT devuelve datos válidos
            const sData = sunatJson || {};
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
            
            guiaData = {
                numero_guia: cleanNumero,
                tipo_documento: sData.codCpe || tipoDocumento,
                fecha_emision: (emi.fecEmision || sData.fecEmision || sData.fechaEmision || new Date().toISOString()).slice(0, 10),
                fecha_traslado: (t.fecInicioTraslado || sData.fecInicioTraslado || sData.fechaTraslado || new Date().toISOString()).slice(0, 10),
                remitente_ruc: sData.numRuc || sData.numRucRemitente || rucConsulta,
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
                observaciones_sunat: sData.observacion || "Guía validada directamente en el servicio oficial de SUNAT.",
                items: bienes.map(it => ({
                    codigo: it.codBien || it.codItem || it.codigo || '—',
                    descripcion: it.desBien || it.desItem || it.descripcion || '—',
                    cantidad: Number(it.numCantidad !== undefined ? it.numCantidad : (it.canItem || it.cantidad || 1)),
                    unidad_medida: it.codUniMedida || it.codUnidadMedida || it.unidadMedida || 'NIU',
                    peso_unitario: Number(it.canPesoItem || it.pesoUnitario || 0)
                }))
            };

            // Si se solicita guardar en BD
            if (guardar === 'true' || guardar === true) {
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

                const newId = insertRes.insertId;
                guiaData.id = newId;

                if (guiaData.items && guiaData.items.length > 0) {
                    for (const item of guiaData.items) {
                        await dbConn.query(`
                            INSERT INTO guias_remision_items (guia_id, codigo, descripcion, cantidad, unidad_medida, peso_unitario)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `, [newId, item.codigo, item.descripcion, item.cantidad, item.unidad_medida, item.peso_unitario || 0]);
                    }
                }
            }

            res.json({ ok: true, estado: 'ENCONTRADA', data: guiaData, origen: 'sunat' });
        } catch (err) {
            console.error("[SUNAT GRE] Error en /consultar-sunat:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 5. Eliminar Guía
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
