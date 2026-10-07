/**
 * RUTAS GUÍA DE REMISIÓN TRANSPORTISTA (GRT)
 * Tipo Documento: 31 | Serie: V001
 * Módulo 100% independiente
 */

const express = require('express');
const router = express.Router();
const ApisunatService = require('../services/apisunatService');

module.exports = function(db, broadcast, logAudit) {

    // Helper para obtener conexión tenant
    const getDb = (req) => {
        const d = (req && req.db) ? req.db : db;
        if (!d) return null;
        return (typeof d.promise === 'function') ? d.promise() : d;
    };

    // ═══════════════════════════════════════════════════════════════
    // INICIALIZACIÓN DE TABLAS
    // ═══════════════════════════════════════════════════════════════
    const initTables = async (dbConn) => {
        if (!dbConn) return;
        try {
            await dbConn.query(`
                CREATE TABLE IF NOT EXISTS guias_transportista (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    numero_guia VARCHAR(30) NOT NULL UNIQUE,
                    serie VARCHAR(10) DEFAULT 'V001',
                    correlativo INT DEFAULT 1,
                    fecha_emision DATE NOT NULL,
                    fecha_traslado DATE NOT NULL,
                    transportista_ruc VARCHAR(20) NOT NULL,
                    transportista_razon_social VARCHAR(255) NOT NULL,
                    transportista_reg_mtc VARCHAR(50) DEFAULT NULL,
                    remitente_ruc VARCHAR(20) NOT NULL,
                    remitente_razon_social VARCHAR(255) NOT NULL,
                    remitente_tipo_doc CHAR(1) DEFAULT '6',
                    destinatario_ruc VARCHAR(20) NOT NULL,
                    destinatario_razon_social VARCHAR(255) NOT NULL,
                    destinatario_tipo_doc CHAR(1) DEFAULT '6',
                    motivo_traslado VARCHAR(4) DEFAULT '01',
                    descripcion_motivo VARCHAR(255) DEFAULT 'VENTA',
                    peso_total DECIMAL(12,2) DEFAULT 0,
                    unidad_medida VARCHAR(10) DEFAULT 'KGM',
                    indicador_transbordo TINYINT(1) DEFAULT 0,
                    partida_ubigeo VARCHAR(6) NOT NULL,
                    partida_direccion TEXT NOT NULL,
                    llegada_ubigeo VARCHAR(6) NOT NULL,
                    llegada_direccion TEXT NOT NULL,
                    vehiculo_placa VARCHAR(20) NOT NULL,
                    vehiculo_secundario_placa VARCHAR(20) DEFAULT NULL,
                    conductor_tipo_doc CHAR(1) DEFAULT '1',
                    conductor_num_doc VARCHAR(20) NOT NULL,
                    conductor_nombres VARCHAR(200) NOT NULL,
                    conductor_apellidos VARCHAR(200) DEFAULT NULL,
                    conductor_licencia VARCHAR(30) NOT NULL,
                    apisunat_document_id VARCHAR(60) DEFAULT NULL,
                    apisunat_status VARCHAR(30) DEFAULT NULL,
                    apisunat_faults TEXT DEFAULT NULL,
                    xml_url TEXT DEFAULT NULL,
                    cdr_url TEXT DEFAULT NULL,
                    pdf_url TEXT DEFAULT NULL,
                    estado VARCHAR(30) DEFAULT 'BORRADOR',
                    costo_flete DECIMAL(12,2) DEFAULT 0,
                    observaciones TEXT DEFAULT NULL,
                    gre_vinculada_id INT DEFAULT NULL,
                    gre_vinculada_numero VARCHAR(30) DEFAULT NULL,
                    orden_servicio VARCHAR(60) DEFAULT NULL,
                    orden_viaje VARCHAR(60) DEFAULT NULL,
                    datos_json LONGTEXT DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_serie_corr (serie, correlativo),
                    INDEX idx_fecha (fecha_emision),
                    INDEX idx_estado (estado),
                    INDEX idx_placa (vehiculo_placa)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);

            await dbConn.query(`
                CREATE TABLE IF NOT EXISTS guias_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guia_tipo ENUM('GRE','GRT') NOT NULL,
                    guia_id INT NOT NULL,
                    item_numero INT DEFAULT 1,
                    codigo VARCHAR(50) DEFAULT NULL,
                    descripcion TEXT NOT NULL,
                    cantidad DECIMAL(12,2) DEFAULT 1,
                    unidad_medida VARCHAR(20) DEFAULT 'NIU',
                    peso_unitario DECIMAL(12,2) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_guia (guia_tipo, guia_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);
        } catch (e) {
            if (!e.message.includes('already exists')) {
                console.error("[GRT] Error creando tablas:", e.message);
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // GET /kpis — Estadísticas del dashboard
    // ═══════════════════════════════════════════════════════════════
    router.get('/kpis', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);
            const [rows] = await dbConn.query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN estado = 'BORRADOR' THEN 1 ELSE 0 END) as borradores,
                    SUM(CASE WHEN estado = 'EMITIDA' OR estado = 'PENDIENTE' THEN 1 ELSE 0 END) as pendientes,
                    SUM(CASE WHEN estado = 'ACEPTADA' THEN 1 ELSE 0 END) as aceptadas,
                    SUM(CASE WHEN estado = 'RECHAZADA' THEN 1 ELSE 0 END) as rechazadas
                FROM guias_transportista
            `);
            res.json({ ok: true, kpis: rows[0] });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // GET /conductores-lista — Catálogo de conductores
    // ═══════════════════════════════════════════════════════════════
    router.get('/conductores-lista', async (req, res) => {
        try {
            const dbConn = getDb(req);
            let rows = [];
            try {
                const [r1] = await dbConn.query("SELECT idConductor as id, nombre, dni, licencia, telefono FROM conductores WHERE estado != 'INACTIVO' OR estado IS NULL ORDER BY nombre ASC");
                rows = r1 || [];
            } catch (_) {}

            if (!rows.length) {
                try {
                    const [r2] = await dbConn.query("SELECT id, CONCAT(COALESCE(nombres,''), ' ', COALESCE(apellidos,'')) as nombre, dni, licencia FROM directorio_conductores ORDER BY nombres ASC");
                    rows = r2 || [];
                } catch (_) {}
            }

            if (!rows.length) {
                try {
                    const [r3] = await dbConn.query("SELECT DISTINCT conductor as nombre FROM ordenes_viaje WHERE conductor IS NOT NULL AND conductor != '' ORDER BY conductor ASC");
                    rows = (r3 || []).map(x => ({ nombre: x.nombre, dni: '', licencia: '' }));
                } catch (_) {}
            }

            res.json({ ok: true, data: rows });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // GET /placas-lista — Catálogo de placas tracto y carreta
    // ═══════════════════════════════════════════════════════════════
    router.get('/placas-lista', async (req, res) => {
        try {
            const dbConn = getDb(req);
            let rows = [];
            try {
                const [r1] = await dbConn.query("SELECT id, placa, tipo, marca, modelo, configuracion FROM placas ORDER BY placa ASC");
                rows = r1 || [];
            } catch (_) {}

            if (!rows.length) {
                try {
                    const [r2] = await dbConn.query("SELECT DISTINCT placa_tracto as placa, 'TRACTO' as tipo FROM ordenes_viaje WHERE placa_tracto IS NOT NULL AND placa_tracto != ''");
                    rows = r2 || [];
                } catch (_) {}
            }

            res.json({ ok: true, data: rows });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // GET /ultimo-correlativo — Obtener siguiente número sugerido
    // ═══════════════════════════════════════════════════════════════
    router.get('/ultimo-correlativo', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);
            const serie = (req.query.serie || 'V001').trim().toUpperCase();
            const [rows] = await dbConn.query(
                'SELECT MAX(correlativo) as ultimo FROM guias_transportista WHERE serie = ?',
                [serie]
            );
            const ultimo = (rows[0] && rows[0].ultimo) ? rows[0].ultimo : 0;
            const siguiente = ultimo + 1;

            // También consultar APISUNAT para validar
            try {
                const creds = await ApisunatService.getCredenciales(dbConn);
                const apiResult = await ApisunatService.lastDocument({
                    personaId: creds.persona_id,
                    personaToken: creds.persona_token,
                    type: '31',
                    serie: serie
                });
                if (apiResult.ok && apiResult.suggestedNumber) {
                    const apiSuggested = parseInt(apiResult.suggestedNumber, 10);
                    res.json({
                        ok: true,
                        serie,
                        correlativo_local: siguiente,
                        correlativo_apisunat: apiSuggested,
                        correlativo_sugerido: Math.max(siguiente, apiSuggested)
                    });
                    return;
                }
            } catch (_) { /* Si APISUNAT falla, usamos local */ }

            res.json({ ok: true, serie, correlativo_sugerido: siguiente });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // GET / — Listar GRTs con filtros
    // ═══════════════════════════════════════════════════════════════
    router.get('/', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);

            let where = '1=1';
            const params = [];

            if (req.query.estado && req.query.estado !== 'TODOS') {
                where += ' AND g.estado = ?';
                params.push(req.query.estado);
            }
            if (req.query.buscar) {
                where += ' AND (g.numero_guia LIKE ? OR g.remitente_razon_social LIKE ? OR g.destinatario_razon_social LIKE ? OR g.vehiculo_placa LIKE ? OR g.conductor_nombres LIKE ?)';
                const like = `%${req.query.buscar}%`;
                params.push(like, like, like, like, like);
            }
            if (req.query.fecha_desde) {
                where += ' AND g.fecha_emision >= ?';
                params.push(req.query.fecha_desde);
            }
            if (req.query.fecha_hasta) {
                where += ' AND g.fecha_emision <= ?';
                params.push(req.query.fecha_hasta);
            }

            const limit = parseInt(req.query.limit) || 100;
            const offset = parseInt(req.query.offset) || 0;

            const [rows] = await dbConn.query(
                `SELECT g.* FROM guias_transportista g WHERE ${where} ORDER BY g.created_at DESC LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [countResult] = await dbConn.query(
                `SELECT COUNT(*) as total FROM guias_transportista g WHERE ${where}`,
                params
            );

            res.json({ ok: true, data: rows, total: countResult[0].total });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // GET /:id — Detalle de una GRT con sus items
    // ═══════════════════════════════════════════════════════════════
    router.get('/:id', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const id = parseInt(req.params.id);
            if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

            const [rows] = await dbConn.query('SELECT * FROM guias_transportista WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ ok: false, error: 'GRT no encontrada' });

            const [items] = await dbConn.query(
                'SELECT * FROM guias_items WHERE guia_tipo = ? AND guia_id = ? ORDER BY item_numero',
                ['GRT', id]
            );

            res.json({ ok: true, guia: rows[0], items });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // GET /buscar-ov/:viaje — Buscar datos por Orden de Viaje
    // ═══════════════════════════════════════════════════════════════
    router.get('/buscar-ov/:viaje', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const viaje = req.params.viaje.trim();
            const [rows] = await dbConn.query(`
                SELECT * FROM operaciones_ordenes_viaje 
                WHERE viaje = ? OR viaje LIKE ? 
                ORDER BY id DESC LIMIT 1
            `, [viaje, `%${viaje}%`]);

            if (rows.length === 0) {
                return res.status(404).json({ ok: false, success: false, error: 'Orden de viaje no encontrada' });
            }

            const ov = rows[0];
            let conductorInfo = { nombres: ov.conductor || '', num_doc: '', licencia: '' };
            if (ov.conductor) {
                try {
                    const [condRows] = await dbConn.query(`
                        SELECT * FROM directorio_conductores 
                        WHERE CONCAT(COALESCE(nombres,''), ' ', COALESCE(apellidos,'')) LIKE ? 
                           OR dni LIKE ? 
                        LIMIT 1
                    `, [`%${ov.conductor}%`, `%${ov.conductor}%`]);
                    if (condRows && condRows.length > 0) {
                        conductorInfo.nombres = `${condRows[0].nombres || ''} ${condRows[0].apellidos || ''}`.trim();
                        conductorInfo.num_doc = condRows[0].dni || condRows[0].numero_documento || '';
                        conductorInfo.licencia = condRows[0].licencia || condRows[0].numero_licencia || '';
                    }
                } catch (_) {}
            }

            res.json({
                ok: true,
                success: true,
                ov: {
                    viaje: ov.viaje,
                    fecha_viaje: ov.fecha_viaje,
                    placa_tracto: ov.placa_tracto,
                    placa_remolque: ov.placa_remolque,
                    peso: ov.peso,
                    origen: ov.origen,
                    destino: ov.destino,
                    ubigeo_partida: ov.ubigeo_partida,
                    direccion_partida: ov.direccion_partida,
                    ubigeo_llegada: ov.ubigeo_llegada,
                    direccion_llegada: ov.direccion_llegada,
                    observaciones: ov.observaciones,
                    conductor: conductorInfo
                }
            });
        } catch (e) {
            console.error("[GRT] Error buscando OV:", e);
            res.status(500).json({ ok: false, success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // POST / — Crear borrador GRT
    // ═══════════════════════════════════════════════════════════════
    router.post('/', async (req, res) => {
        try {
            const dbConn = getDb(req);
            await initTables(dbConn);
            const d = req.body;

            // Obtener credenciales para datos del transportista
            const creds = await ApisunatService.getCredenciales(dbConn);
            const serie = (d.serie || 'V001').trim().toUpperCase();

            // Obtener siguiente correlativo
            const [lastRow] = await dbConn.query(
                'SELECT MAX(correlativo) as ultimo FROM guias_transportista WHERE serie = ?',
                [serie]
            );
            const correlativo = d.correlativo || ((lastRow[0] && lastRow[0].ultimo) ? lastRow[0].ultimo + 1 : 1);
            const numeroGuia = `${serie}-${String(correlativo).padStart(8, '0')}`;

            const [result] = await dbConn.query(
                `INSERT INTO guias_transportista SET ?`,
                {
                    numero_guia: numeroGuia,
                    serie,
                    correlativo,
                    fecha_emision: d.fecha_emision || new Date().toISOString().slice(0, 10),
                    fecha_traslado: d.fecha_traslado || d.fecha_emision || new Date().toISOString().slice(0, 10),
                    transportista_ruc: creds.ruc_emisor,
                    transportista_razon_social: creds.razon_social,
                    transportista_reg_mtc: (d.registro_mtc || '').trim(),
                    remitente_ruc: (d.remitente_ruc || '').trim(),
                    remitente_razon_social: (d.remitente_razon_social || '').trim(),
                    remitente_tipo_doc: String(d.remitente_ruc || '').trim().length === 8 ? '1' : '6',
                    destinatario_ruc: (d.destinatario_ruc || '').trim(),
                    destinatario_razon_social: (d.destinatario_razon_social || '').trim(),
                    destinatario_tipo_doc: String(d.destinatario_ruc || '').trim().length === 8 ? '1' : '6',
                    motivo_traslado: d.motivo_traslado || '01',
                    descripcion_motivo: d.descripcion_motivo || 'VENTA',
                    peso_total: parseFloat(d.peso_total) || 0,
                    unidad_medida: d.unidad_medida || 'KGM',
                    indicador_transbordo: d.indicador_transbordo ? 1 : 0,
                    partida_ubigeo: ApisunatService.sanitizeUbigeo(d.partida_ubigeo, '040104'),
                    partida_direccion: (d.partida_direccion || '').trim(),
                    llegada_ubigeo: ApisunatService.sanitizeUbigeo(d.llegada_ubigeo, '150101'),
                    llegada_direccion: (d.llegada_direccion || '').trim(),
                    vehiculo_placa: (d.vehiculo_placa || '').trim().toUpperCase(),
                    vehiculo_secundario_placa: (d.vehiculo_secundario_placa || '').trim().toUpperCase() || null,
                    conductor_tipo_doc: d.conductor_tipo_doc || '1',
                    conductor_num_doc: (d.conductor_num_doc || '').trim(),
                    conductor_nombres: (d.conductor_nombres || '').trim(),
                    conductor_apellidos: (d.conductor_apellidos || '').trim() || null,
                    conductor_licencia: (d.conductor_licencia || '').trim(),
                    estado: 'BORRADOR',
                    costo_flete: parseFloat(d.costo_flete) || 0,
                    observaciones: (d.observaciones || '').trim() || null,
                    gre_vinculada_id: d.gre_vinculada_id || null,
                    gre_vinculada_numero: d.gre_vinculada_numero || null,
                    orden_servicio: d.orden_servicio || null,
                    orden_viaje: d.orden_viaje || null
                }
            );

            const guiaId = result.insertId;

            // Insertar items
            const items = Array.isArray(d.items) ? d.items : [];
            if (items.length === 0) {
                items.push({
                    codigo: '001',
                    descripcion: d.descripcion_carga || 'CARGA GENERAL',
                    cantidad: 1,
                    unidad_medida: 'NIU'
                });
            }
            for (let i = 0; i < items.length; i++) {
                await dbConn.query('INSERT INTO guias_items SET ?', {
                    guia_tipo: 'GRT',
                    guia_id: guiaId,
                    item_numero: i + 1,
                    codigo: items[i].codigo || `ITM-${i + 1}`,
                    descripcion: items[i].descripcion || 'CARGA GENERAL',
                    cantidad: parseFloat(items[i].cantidad) || 1,
                    unidad_medida: items[i].unidad_medida || 'NIU',
                    peso_unitario: parseFloat(items[i].peso_unitario) || 0
                });
            }

            res.json({ ok: true, id: guiaId, numero_guia: numeroGuia, message: 'Borrador GRT creado exitosamente.' });
        } catch (err) {
            console.error("[GRT] Error creando borrador:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // PUT /:id — Editar borrador GRT
    // ═══════════════════════════════════════════════════════════════
    router.put('/:id', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const id = parseInt(req.params.id);
            if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

            const [existing] = await dbConn.query('SELECT * FROM guias_transportista WHERE id = ?', [id]);
            if (!existing.length) return res.status(404).json({ ok: false, error: 'GRT no encontrada' });
            if (existing[0].estado !== 'BORRADOR') {
                return res.status(400).json({ ok: false, error: 'Solo se pueden editar borradores.' });
            }

            const d = req.body;
            const updates = {};
            const editableFields = [
                'fecha_emision', 'fecha_traslado', 'transportista_reg_mtc',
                'remitente_ruc', 'remitente_razon_social',
                'destinatario_ruc', 'destinatario_razon_social',
                'motivo_traslado', 'descripcion_motivo', 'peso_total', 'unidad_medida',
                'indicador_transbordo', 'partida_ubigeo', 'partida_direccion',
                'llegada_ubigeo', 'llegada_direccion', 'vehiculo_placa',
                'vehiculo_secundario_placa', 'conductor_tipo_doc', 'conductor_num_doc',
                'conductor_nombres', 'conductor_apellidos', 'conductor_licencia',
                'costo_flete', 'observaciones', 'gre_vinculada_id', 'gre_vinculada_numero',
                'orden_servicio', 'orden_viaje'
            ];

            for (const field of editableFields) {
                if (d[field] !== undefined) {
                    updates[field] = d[field];
                }
            }

            // Sanitizar ubigeos
            if (updates.partida_ubigeo) updates.partida_ubigeo = ApisunatService.sanitizeUbigeo(updates.partida_ubigeo, '040104');
            if (updates.llegada_ubigeo) updates.llegada_ubigeo = ApisunatService.sanitizeUbigeo(updates.llegada_ubigeo, '150101');
            if (updates.vehiculo_placa) updates.vehiculo_placa = updates.vehiculo_placa.trim().toUpperCase();
            if (updates.vehiculo_secundario_placa) updates.vehiculo_secundario_placa = updates.vehiculo_secundario_placa.trim().toUpperCase();

            // Tipo doc automático
            if (updates.remitente_ruc) {
                updates.remitente_tipo_doc = String(updates.remitente_ruc).trim().length === 8 ? '1' : '6';
            }
            if (updates.destinatario_ruc) {
                updates.destinatario_tipo_doc = String(updates.destinatario_ruc).trim().length === 8 ? '1' : '6';
            }

            if (Object.keys(updates).length > 0) {
                await dbConn.query('UPDATE guias_transportista SET ? WHERE id = ?', [updates, id]);
            }

            // Actualizar items si se enviaron
            if (Array.isArray(d.items)) {
                await dbConn.query('DELETE FROM guias_items WHERE guia_tipo = ? AND guia_id = ?', ['GRT', id]);
                for (let i = 0; i < d.items.length; i++) {
                    await dbConn.query('INSERT INTO guias_items SET ?', {
                        guia_tipo: 'GRT',
                        guia_id: id,
                        item_numero: i + 1,
                        codigo: d.items[i].codigo || `ITM-${i + 1}`,
                        descripcion: d.items[i].descripcion || 'CARGA GENERAL',
                        cantidad: parseFloat(d.items[i].cantidad) || 1,
                        unidad_medida: d.items[i].unidad_medida || 'NIU',
                        peso_unitario: parseFloat(d.items[i].peso_unitario) || 0
                    });
                }
            }

            res.json({ ok: true, message: 'GRT actualizada exitosamente.' });
        } catch (err) {
            console.error("[GRT] Error editando:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // POST /:id/emitir — Emitir GRT via APISUNAT
    // ═══════════════════════════════════════════════════════════════
    router.post('/:id/emitir', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const id = parseInt(req.params.id);
            if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

            const [rows] = await dbConn.query('SELECT * FROM guias_transportista WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ ok: false, error: 'GRT no encontrada' });
            
            const guia = rows[0];
            if (guia.estado === 'ACEPTADA') {
                return res.status(400).json({ ok: false, error: 'Esta GRT ya fue aceptada por SUNAT.' });
            }

            // Obtener items
            const [items] = await dbConn.query(
                'SELECT * FROM guias_items WHERE guia_tipo = ? AND guia_id = ? ORDER BY item_numero',
                ['GRT', id]
            );

            // Obtener credenciales APISUNAT
            const creds = await ApisunatService.getCredenciales(dbConn);

            // Construir fileName
            const fileName = `${guia.transportista_ruc}-31-${guia.serie}-${String(guia.correlativo).padStart(8, '0')}`;

            // Construir documentBody limpio según esquema APISUNAT
            const datosEnvio = {
                codTraslado: guia.motivo_traslado || '01',
                desTraslado: guia.descripcion_motivo || 'VENTA',
                indTransbordo: guia.indicador_transbordo ? '1' : '0',
                fecInicioTraslado: guia.fecha_traslado ? new Date(guia.fecha_traslado).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                pesoTotal: Number(guia.peso_total || 1),
                uniMedida: guia.unidad_medida || 'KGM',
                modTraslado: '01',
                transportista: {
                    numDoc: guia.transportista_ruc,
                    tipoDoc: '6',
                    rznSocial: guia.transportista_razon_social,
                    regMtc: guia.transportista_reg_mtc || '000000'
                },
                remitente: {
                    numDoc: guia.remitente_ruc,
                    tipoDoc: guia.remitente_tipo_doc || '6',
                    rznSocial: guia.remitente_razon_social
                },
                destinatario: {
                    numDoc: guia.destinatario_ruc,
                    tipoDoc: guia.destinatario_tipo_doc || '6',
                    rznSocial: guia.destinatario_razon_social
                },
                partida: {
                    ubigeo: guia.partida_ubigeo,
                    direccion: guia.partida_direccion
                },
                llegada: {
                    ubigeo: guia.llegada_ubigeo,
                    direccion: guia.llegada_direccion
                }
            };

            // Vehículo principal (OBLIGATORIO en GRT)
            if (guia.vehiculo_placa) {
                datosEnvio.vehiculoPrincipal = { numPlaca: guia.vehiculo_placa.toUpperCase() };
            }

            // Vehículo secundario (carreta)
            if (guia.vehiculo_secundario_placa) {
                datosEnvio.vehiculoSecundario = { numPlaca: guia.vehiculo_secundario_placa.toUpperCase() };
            }

            // Conductor (OBLIGATORIO en GRT)
            if (guia.conductor_num_doc) {
                datosEnvio.conductor = {
                    numDoc: guia.conductor_num_doc,
                    tipoDoc: guia.conductor_tipo_doc || '1',
                    nombres: guia.conductor_nombres || '',
                    apellidos: guia.conductor_apellidos || '',
                    licencia: guia.conductor_licencia || ''
                };
            }

            // GRE vinculada
            if (guia.gre_vinculada_numero) {
                datosEnvio.documentosRelacionados = [{
                    tipoDoc: '09',
                    numDoc: guia.gre_vinculada_numero
                }];
            }

            const documentBody = {
                tipoDoc: '31',
                serie: guia.serie,
                correlativo: String(guia.correlativo).padStart(8, '0'),
                fechaEmision: new Date(guia.fecha_emision).toISOString().slice(0, 10),
                horaEmision: new Date().toTimeString().slice(0, 8),
                datosEnvio,
                detalles: (items.length > 0 ? items : [{ descripcion: 'CARGA GENERAL' }]).map((it, idx) => ({
                    numItem: idx + 1,
                    codItem: it.codigo || `ITM-${idx + 1}`,
                    descripcion: (it.descripcion || 'CARGA GENERAL').trim(),
                    cantidad: Number(it.cantidad || 1),
                    uniMedida: it.unidad_medida || 'NIU'
                }))
            };

            // Limpiar objeto (eliminar nulls y vacíos)
            const cleanBody = ApisunatService.cleanObject(documentBody);

            console.log(`[GRT] Emitiendo ${fileName}...`);
            console.log(`[GRT] documentBody:`, JSON.stringify(cleanBody, null, 2));

            // Enviar a APISUNAT
            const result = await ApisunatService.sendBill({
                personaId: creds.persona_id,
                personaToken: creds.persona_token,
                fileName,
                documentBody: cleanBody
            });

            if (result.ok) {
                // Actualizar estado en BD
                await dbConn.query(
                    `UPDATE guias_transportista SET 
                        estado = 'EMITIDA', 
                        apisunat_document_id = ?, 
                        apisunat_status = 'PENDIENTE',
                        datos_json = ?
                    WHERE id = ?`,
                    [result.documentId, JSON.stringify(cleanBody), id]
                );

                res.json({
                    ok: true,
                    message: 'GRT emitida exitosamente via APISUNAT.',
                    documentId: result.documentId,
                    fileName,
                    estado: 'EMITIDA'
                });
            } else {
                // Guardar el error pero registrar igual
                const errorMsg = typeof result.error === 'object' ? JSON.stringify(result.error) : (result.error || 'Error desconocido');
                await dbConn.query(
                    `UPDATE guias_transportista SET 
                        estado = 'EMITIDA',
                        apisunat_status = 'ERROR_APISUNAT',
                        apisunat_faults = ?,
                        datos_json = ?
                    WHERE id = ?`,
                    [errorMsg, JSON.stringify(cleanBody), id]
                );

                res.json({
                    ok: true,
                    message: `GRT registrada con aviso APISUNAT: ${errorMsg}`,
                    fileName,
                    estado: 'EMITIDA',
                    apisunat_error: errorMsg
                });
            }
        } catch (err) {
            console.error("[GRT] Error en emisión:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // GET /:id/sincronizar — Consultar estado en APISUNAT
    // ═══════════════════════════════════════════════════════════════
    router.get('/:id/sincronizar', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const id = parseInt(req.params.id);
            if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

            const [rows] = await dbConn.query('SELECT * FROM guias_transportista WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ ok: false, error: 'GRT no encontrada' });

            const guia = rows[0];
            if (!guia.apisunat_document_id) {
                return res.status(400).json({ ok: false, error: 'Esta GRT no tiene documentId de APISUNAT.' });
            }

            const result = await ApisunatService.getById(guia.apisunat_document_id);
            if (!result.ok) {
                return res.status(400).json({ ok: false, error: result.error });
            }

            // Actualizar según estado
            const newEstado = result.status === 'ACEPTADO' ? 'ACEPTADA' : 
                              result.status === 'RECHAZADO' ? 'RECHAZADA' : 
                              result.status === 'PENDIENTE' ? 'EMITIDA' : guia.estado;

            const updates = {
                apisunat_status: result.status,
                estado: newEstado
            };

            if (result.xml) updates.xml_url = result.xml;
            if (result.cdr) updates.cdr_url = result.cdr;
            if (result.faults && result.faults.length > 0) {
                updates.apisunat_faults = JSON.stringify(result.faults);
            }
            if (result.notes && result.notes.length > 0) {
                updates.observaciones = result.notes.map(n => n.message || n).join(' | ');
            }

            // Generar URL del PDF
            const fileName = `${guia.transportista_ruc}-31-${guia.serie}-${String(guia.correlativo).padStart(8, '0')}`;
            const pdfUrl = ApisunatService.getPdfUrl(guia.apisunat_document_id, fileName, 'A4');
            if (pdfUrl) updates.pdf_url = pdfUrl;

            await dbConn.query('UPDATE guias_transportista SET ? WHERE id = ?', [updates, id]);

            res.json({
                ok: true,
                estado: newEstado,
                apisunat_status: result.status,
                xml_url: result.xml || null,
                cdr_url: result.cdr || null,
                pdf_url: pdfUrl || null,
                faults: result.faults || [],
                notes: result.notes || []
            });
        } catch (err) {
            console.error("[GRT] Error sincronizando:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // POST /:id/duplicar — Clonar una GRT existente
    // ═══════════════════════════════════════════════════════════════
    router.post('/:id/duplicar', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const id = parseInt(req.params.id);
            if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

            const [rows] = await dbConn.query('SELECT * FROM guias_transportista WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ ok: false, error: 'GRT no encontrada' });

            const original = rows[0];
            const serie = original.serie;

            // Obtener siguiente correlativo
            const [lastRow] = await dbConn.query(
                'SELECT MAX(correlativo) as ultimo FROM guias_transportista WHERE serie = ?',
                [serie]
            );
            const nuevoCorrelativo = ((lastRow[0] && lastRow[0].ultimo) || 0) + 1;
            const nuevaGuia = `${serie}-${String(nuevoCorrelativo).padStart(8, '0')}`;

            const [result] = await dbConn.query(
                `INSERT INTO guias_transportista SET ?`,
                {
                    numero_guia: nuevaGuia,
                    serie,
                    correlativo: nuevoCorrelativo,
                    fecha_emision: new Date().toISOString().slice(0, 10),
                    fecha_traslado: new Date().toISOString().slice(0, 10),
                    transportista_ruc: original.transportista_ruc,
                    transportista_razon_social: original.transportista_razon_social,
                    transportista_reg_mtc: original.transportista_reg_mtc,
                    remitente_ruc: original.remitente_ruc,
                    remitente_razon_social: original.remitente_razon_social,
                    remitente_tipo_doc: original.remitente_tipo_doc,
                    destinatario_ruc: original.destinatario_ruc,
                    destinatario_razon_social: original.destinatario_razon_social,
                    destinatario_tipo_doc: original.destinatario_tipo_doc,
                    motivo_traslado: original.motivo_traslado,
                    descripcion_motivo: original.descripcion_motivo,
                    peso_total: original.peso_total,
                    unidad_medida: original.unidad_medida,
                    indicador_transbordo: original.indicador_transbordo,
                    partida_ubigeo: original.partida_ubigeo,
                    partida_direccion: original.partida_direccion,
                    llegada_ubigeo: original.llegada_ubigeo,
                    llegada_direccion: original.llegada_direccion,
                    vehiculo_placa: original.vehiculo_placa,
                    vehiculo_secundario_placa: original.vehiculo_secundario_placa,
                    conductor_tipo_doc: original.conductor_tipo_doc,
                    conductor_num_doc: original.conductor_num_doc,
                    conductor_nombres: original.conductor_nombres,
                    conductor_apellidos: original.conductor_apellidos,
                    conductor_licencia: original.conductor_licencia,
                    estado: 'BORRADOR',
                    costo_flete: original.costo_flete,
                    gre_vinculada_id: original.gre_vinculada_id,
                    gre_vinculada_numero: original.gre_vinculada_numero,
                    orden_servicio: original.orden_servicio,
                    orden_viaje: original.orden_viaje
                }
            );

            // Duplicar items
            const [originalItems] = await dbConn.query(
                'SELECT * FROM guias_items WHERE guia_tipo = ? AND guia_id = ?',
                ['GRT', id]
            );
            for (const item of originalItems) {
                await dbConn.query('INSERT INTO guias_items SET ?', {
                    guia_tipo: 'GRT',
                    guia_id: result.insertId,
                    item_numero: item.item_numero,
                    codigo: item.codigo,
                    descripcion: item.descripcion,
                    cantidad: item.cantidad,
                    unidad_medida: item.unidad_medida,
                    peso_unitario: item.peso_unitario
                });
            }

            res.json({ ok: true, id: result.insertId, numero_guia: nuevaGuia, message: 'GRT duplicada exitosamente.' });
        } catch (err) {
            console.error("[GRT] Error duplicando:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // POST /emision-masiva — Emitir múltiples GRTs
    // ═══════════════════════════════════════════════════════════════
    router.post('/emision-masiva', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
            if (!ids.length) return res.status(400).json({ ok: false, error: 'No se proporcionaron IDs.' });

            const resultados = [];
            for (const id of ids) {
                try {
                    // Simular llamada al endpoint de emisión individual
                    const [rows] = await dbConn.query('SELECT estado FROM guias_transportista WHERE id = ?', [id]);
                    if (rows.length && rows[0].estado === 'BORRADOR') {
                        // Redirigir internamente al endpoint de emisión
                        const fakeReq = { params: { id }, db: req.db };
                        // Se delega la emisión al método del router
                        resultados.push({ id, status: 'encolado' });
                    } else {
                        resultados.push({ id, status: 'omitido', reason: 'No es borrador' });
                    }
                } catch (e) {
                    resultados.push({ id, status: 'error', reason: e.message });
                }
            }

            res.json({ ok: true, resultados, message: `Se procesaron ${ids.length} guías.` });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // DELETE /:id — Eliminar borrador GRT
    // ═══════════════════════════════════════════════════════════════
    router.delete('/:id', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const id = parseInt(req.params.id);
            if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

            const [rows] = await dbConn.query('SELECT estado FROM guias_transportista WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ ok: false, error: 'GRT no encontrada' });
            if (rows[0].estado !== 'BORRADOR') {
                return res.status(400).json({ ok: false, error: 'Solo se pueden eliminar borradores.' });
            }

            await dbConn.query('DELETE FROM guias_items WHERE guia_tipo = ? AND guia_id = ?', ['GRT', id]);
            await dbConn.query('DELETE FROM guias_transportista WHERE id = ?', [id]);

            res.json({ ok: true, message: 'GRT eliminada exitosamente.' });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // GET /credenciales-apisunat — Obtener credenciales APISUNAT
    // ═══════════════════════════════════════════════════════════════
    router.get('/config/credenciales-apisunat', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const creds = await ApisunatService.getCredenciales(dbConn);
            res.json({ ok: true, credenciales: creds });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    return router;
};
