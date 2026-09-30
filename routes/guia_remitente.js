/**
 * RUTAS GUÍA DE REMISIÓN ELECTRÓNICA - REMITENTE (GRE)
 * Tipo Documento: 09 | Serie: T001
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
                CREATE TABLE IF NOT EXISTS guias_remitente (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    numero_guia VARCHAR(30) NOT NULL UNIQUE,
                    serie VARCHAR(10) DEFAULT 'T001',
                    correlativo INT DEFAULT 1,
                    fecha_emision DATE NOT NULL,
                    fecha_traslado DATE NOT NULL,
                    modalidad_transporte VARCHAR(2) DEFAULT '01',
                    motivo_traslado VARCHAR(4) DEFAULT '01',
                    descripcion_motivo VARCHAR(255) DEFAULT 'VENTA',
                    remitente_ruc VARCHAR(20) NOT NULL,
                    remitente_razon_social VARCHAR(255) NOT NULL,
                    remitente_tipo_doc CHAR(1) DEFAULT '6',
                    destinatario_ruc VARCHAR(20) NOT NULL,
                    destinatario_razon_social VARCHAR(255) NOT NULL,
                    destinatario_tipo_doc CHAR(1) DEFAULT '6',
                    peso_total DECIMAL(12,2) DEFAULT 0,
                    unidad_medida VARCHAR(10) DEFAULT 'KGM',
                    total_bultos INT DEFAULT 1,
                    indicador_transbordo TINYINT(1) DEFAULT 0,
                    indicador_retorno_vehiculo_vacio TINYINT(1) DEFAULT 0,
                    indicador_retorno_envases_vacios TINYINT(1) DEFAULT 0,
                    indicador_traslado_total_m1_l TINYINT(1) DEFAULT 0,
                    partida_ubigeo VARCHAR(6) NOT NULL,
                    partida_direccion TEXT NOT NULL,
                    llegada_ubigeo VARCHAR(6) NOT NULL,
                    llegada_direccion TEXT NOT NULL,
                    transportista_ruc VARCHAR(20) DEFAULT NULL,
                    transportista_razon_social VARCHAR(255) DEFAULT NULL,
                    transportista_reg_mtc VARCHAR(50) DEFAULT NULL,
                    vehiculo_placa VARCHAR(20) DEFAULT NULL,
                    vehiculo_secundario_placa VARCHAR(20) DEFAULT NULL,
                    conductor_tipo_doc CHAR(1) DEFAULT '1',
                    conductor_num_doc VARCHAR(20) DEFAULT NULL,
                    conductor_nombres VARCHAR(200) DEFAULT NULL,
                    conductor_apellidos VARCHAR(200) DEFAULT NULL,
                    conductor_licencia VARCHAR(30) DEFAULT NULL,
                    apisunat_document_id VARCHAR(60) DEFAULT NULL,
                    apisunat_status VARCHAR(30) DEFAULT NULL,
                    apisunat_faults TEXT DEFAULT NULL,
                    xml_url TEXT DEFAULT NULL,
                    cdr_url TEXT DEFAULT NULL,
                    pdf_url TEXT DEFAULT NULL,
                    estado VARCHAR(30) DEFAULT 'BORRADOR',
                    observaciones TEXT DEFAULT NULL,
                    grt_vinculada_id INT DEFAULT NULL,
                    grt_vinculada_numero VARCHAR(30) DEFAULT NULL,
                    orden_servicio VARCHAR(60) DEFAULT NULL,
                    orden_viaje VARCHAR(60) DEFAULT NULL,
                    datos_json LONGTEXT DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_serie_corr (serie, correlativo),
                    INDEX idx_fecha (fecha_emision),
                    INDEX idx_estado (estado),
                    INDEX idx_modalidad (modalidad_transporte)
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
                console.error("[GRE] Error creando tablas:", e.message);
            }
        }
    };

    // Middleware de init
    router.use(async (req, res, next) => {
        const dbConn = getDb(req);
        if (dbConn) await initTables(dbConn);
        next();
    });

    // ═══════════════════════════════════════════════════════════════
    // 1. KPIS / RESUMEN
    // ═══════════════════════════════════════════════════════════════
    router.get('/kpis', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const [rows] = await dbConn.query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN estado = 'EMITIDA' OR apisunat_status IN ('SUCCESS','ACEPTADO','ENVIADO') THEN 1 ELSE 0 END) as emitidas,
                    SUM(CASE WHEN estado = 'BORRADOR' OR estado IS NULL THEN 1 ELSE 0 END) as pendientes,
                    SUM(CASE WHEN apisunat_status = 'ACEPTADO' OR apisunat_status = 'SUCCESS' THEN 1 ELSE 0 END) as aceptadas,
                    SUM(CASE WHEN estado = 'ANULADO' OR apisunat_status = 'ANULADO' THEN 1 ELSE 0 END) as anuladas,
                    COALESCE(SUM(peso_total), 0) as peso_total_kg
                FROM guias_remitente
            `);
            res.json({ success: true, kpis: rows[0] });
        } catch (e) {
            console.error("[GRE] Error KPIs:", e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // 2. ÚLTIMO CORRELATIVO
    // ═══════════════════════════════════════════════════════════════
    router.get('/ultimo-correlativo', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const serie = (req.query.serie || 'T001').toUpperCase().trim();
            const [rows] = await dbConn.query(
                `SELECT MAX(correlativo) as ultimo FROM guias_remitente WHERE serie = ?`,
                [serie]
            );
            const proximo = (rows[0]?.ultimo || 0) + 1;
            const numeroGuia = `${serie}-${String(proximo).padStart(8, '0')}`;
            res.json({ success: true, serie, ultimo: rows[0]?.ultimo || 0, proximo, numeroGuia });
        } catch (e) {
            console.error("[GRE] Error correlativo:", e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // 3. LISTAR GUÍAS CON FILTROS
    // ═══════════════════════════════════════════════════════════════
    router.get('/', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const { q, estado, fecha_desde, fecha_hasta, modalidad, limit = 50, offset = 0 } = req.query;

            let query = `
                SELECT g.*, 
                    (SELECT COUNT(*) FROM guias_items WHERE guia_tipo = 'GRE' AND guia_id = g.id) as items_count
                FROM guias_remitente g
                WHERE 1=1
            `;
            const params = [];

            if (q) {
                const term = `%${q}%`;
                query += ` AND (
                    g.numero_guia LIKE ? OR 
                    g.destinatario_razon_social LIKE ? OR 
                    g.destinatario_ruc LIKE ? OR 
                    g.remitente_razon_social LIKE ? OR
                    g.transportista_razon_social LIKE ? OR
                    g.vehiculo_placa LIKE ? OR
                    g.orden_viaje LIKE ?
                )`;
                params.push(term, term, term, term, term, term, term);
            }

            if (estado && estado !== 'TODOS') {
                if (estado === 'EMITIDA') {
                    query += ` AND (g.estado = 'EMITIDA' OR g.apisunat_status IN ('SUCCESS','ACEPTADO','ENVIADO'))`;
                } else if (estado === 'BORRADOR') {
                    query += ` AND (g.estado = 'BORRADOR' OR g.estado IS NULL)`;
                } else {
                    query += ` AND g.estado = ?`;
                    params.push(estado);
                }
            }

            if (modalidad && modalidad !== 'TODAS') {
                query += ` AND g.modalidad_transporte = ?`;
                params.push(modalidad);
            }

            if (fecha_desde) {
                query += ` AND g.fecha_emision >= ?`;
                params.push(fecha_desde);
            }
            if (fecha_hasta) {
                query += ` AND g.fecha_emision <= ?`;
                params.push(fecha_hasta);
            }

            query += ` ORDER BY g.id DESC LIMIT ? OFFSET ?`;
            params.push(parseInt(limit), parseInt(offset));

            const [rows] = await dbConn.query(query, params);

            // Conteo total para paginación
            const [countRows] = await dbConn.query(`SELECT COUNT(*) as total FROM guias_remitente`);

            res.json({
                success: true,
                guias: rows,
                total: countRows[0]?.total || 0,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        } catch (e) {
            console.error("[GRE] Error listando guías:", e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // 4. DETALLE DE UNA GUÍA (CON ITEMS)
    // ═══════════════════════════════════════════════════════════════
    router.get('/:id', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const { id } = req.params;

            const [guias] = await dbConn.query(`SELECT * FROM guias_remitente WHERE id = ?`, [id]);
            if (guias.length === 0) {
                return res.status(404).json({ success: false, error: 'Guía no encontrada' });
            }

            const guia = guias[0];
            const [items] = await dbConn.query(
                `SELECT * FROM guias_items WHERE guia_tipo = 'GRE' AND guia_id = ? ORDER BY item_numero ASC`,
                [id]
            );
            guia.items = items;

            res.json({ success: true, guia });
        } catch (e) {
            console.error("[GRE] Error detalle:", e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // BUSCAR DATOS POR ORDEN DE VIAJE (OV)
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
            console.error("[GRE] Error buscando OV:", e);
            res.status(500).json({ ok: false, success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // 5. CREAR GUÍA (BORRADOR)
    // ═══════════════════════════════════════════════════════════════
    router.post('/', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const data = req.body;

            const serie = (data.serie || 'T001').toUpperCase().trim();

            // Calcular siguiente correlativo si no viene especificado
            let correlativo = parseInt(data.correlativo);
            if (!correlativo || isNaN(correlativo)) {
                const [corrRows] = await dbConn.query(
                    `SELECT MAX(correlativo) as ultimo FROM guias_remitente WHERE serie = ?`,
                    [serie]
                );
                correlativo = (corrRows[0]?.ultimo || 0) + 1;
            }

            const numeroGuia = `${serie}-${String(correlativo).padStart(8, '0')}`;

            const [result] = await dbConn.query(`
                INSERT INTO guias_remitente (
                    numero_guia, serie, correlativo, fecha_emision, fecha_traslado,
                    modalidad_transporte, motivo_traslado, descripcion_motivo,
                    remitente_ruc, remitente_razon_social, remitente_tipo_doc,
                    destinatario_ruc, destinatario_razon_social, destinatario_tipo_doc,
                    peso_total, unidad_medida, total_bultos,
                    indicador_transbordo, indicador_retorno_vehiculo_vacio,
                    indicador_retorno_envases_vacios, indicador_traslado_total_m1_l,
                    partida_ubigeo, partida_direccion, llegada_ubigeo, llegada_direccion,
                    transportista_ruc, transportista_razon_social, transportista_reg_mtc,
                    vehiculo_placa, vehiculo_secundario_placa,
                    conductor_tipo_doc, conductor_num_doc, conductor_nombres, conductor_apellidos, conductor_licencia,
                    estado, observaciones, grt_vinculada_id, grt_vinculada_numero,
                    orden_servicio, orden_viaje
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                numeroGuia,
                serie,
                correlativo,
                data.fecha_emision || new Date().toISOString().split('T')[0],
                data.fecha_traslado || data.fecha_emision || new Date().toISOString().split('T')[0],
                data.modalidad_transporte || '01',
                data.motivo_traslado || '01',
                data.descripcion_motivo || 'VENTA',
                data.remitente_ruc || '',
                data.remitente_razon_social || '',
                data.remitente_tipo_doc || '6',
                data.destinatario_ruc || '',
                data.destinatario_razon_social || '',
                data.destinatario_tipo_doc || '6',
                parseFloat(data.peso_total) || 0,
                data.unidad_medida || 'KGM',
                parseInt(data.total_bultos) || 1,
                data.indicador_transbordo ? 1 : 0,
                data.indicador_retorno_vehiculo_vacio ? 1 : 0,
                data.indicador_retorno_envases_vacios ? 1 : 0,
                data.indicador_traslado_total_m1_l ? 1 : 0,
                data.partida_ubigeo || '',
                data.partida_direccion || '',
                data.llegada_ubigeo || '',
                data.llegada_direccion || '',
                data.transportista_ruc || null,
                data.transportista_razon_social || null,
                data.transportista_reg_mtc || null,
                data.vehiculo_placa ? data.vehiculo_placa.toUpperCase().trim() : null,
                data.vehiculo_secundario_placa ? data.vehiculo_secundario_placa.toUpperCase().trim() : null,
                data.conductor_tipo_doc || '1',
                data.conductor_num_doc || null,
                data.conductor_nombres || null,
                data.conductor_apellidos || null,
                data.conductor_licencia || null,
                'BORRADOR',
                data.observaciones || null,
                data.grt_vinculada_id || null,
                data.grt_vinculada_numero || null,
                data.orden_servicio || null,
                data.orden_viaje || null
            ]);

            const guiaId = result.insertId;

            // Guardar items
            const items = Array.isArray(data.items) ? data.items : [];
            if (items.length > 0) {
                for (let i = 0; i < items.length; i++) {
                    const it = items[i];
                    await dbConn.query(`
                        INSERT INTO guias_items (
                            guia_tipo, guia_id, item_numero, codigo, descripcion, cantidad, unidad_medida, peso_unitario
                        ) VALUES ('GRE', ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        guiaId,
                        i + 1,
                        it.codigo || `ITM-${i + 1}`,
                        it.descripcion || 'CARGA GENERAL',
                        parseFloat(it.cantidad) || 1,
                        it.unidad_medida || 'NIU',
                        parseFloat(it.peso_unitario) || 0
                    ]);
                }
            } else {
                // Item genérico por defecto
                await dbConn.query(`
                    INSERT INTO guias_items (
                        guia_tipo, guia_id, item_numero, codigo, descripcion, cantidad, unidad_medida, peso_unitario
                    ) VALUES ('GRE', ?, 1, 'CARGA-01', 'CARGA GENERAL', 1, 'NIU', ?)
                `, [guiaId, parseFloat(data.peso_total) || 0]);
            }

            if (typeof logAudit === 'function') {
                logAudit(req, 'CREAR_GRE', `Creación de Guía Remitente borrador ${numeroGuia}`);
            }

            res.json({
                success: true,
                message: 'Guía Remitente creada correctamente',
                id: guiaId,
                numeroGuia
            });
        } catch (e) {
            console.error("[GRE] Error creando guía:", e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // 6. ACTUALIZAR GUÍA
    // ═══════════════════════════════════════════════════════════════
    router.put('/:id', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const { id } = req.params;
            const data = req.body;

            // Verificar si ya fue emitida
            const [existentes] = await dbConn.query(`SELECT estado, apisunat_status FROM guias_remitente WHERE id = ?`, [id]);
            if (existentes.length === 0) {
                return res.status(404).json({ success: false, error: 'Guía no encontrada' });
            }
            if (existentes[0].estado === 'EMITIDA' || existentes[0].apisunat_status === 'SUCCESS' || existentes[0].apisunat_status === 'ACEPTADO') {
                return res.status(400).json({ success: false, error: 'No se puede editar una guía ya emitida ante SUNAT' });
            }

            await dbConn.query(`
                UPDATE guias_remitente SET
                    fecha_emision = ?,
                    fecha_traslado = ?,
                    modalidad_transporte = ?,
                    motivo_traslado = ?,
                    descripcion_motivo = ?,
                    remitente_ruc = ?,
                    remitente_razon_social = ?,
                    remitente_tipo_doc = ?,
                    destinatario_ruc = ?,
                    destinatario_razon_social = ?,
                    destinatario_tipo_doc = ?,
                    peso_total = ?,
                    unidad_medida = ?,
                    total_bultos = ?,
                    indicador_transbordo = ?,
                    indicador_retorno_vehiculo_vacio = ?,
                    indicador_retorno_envases_vacios = ?,
                    indicador_traslado_total_m1_l = ?,
                    partida_ubigeo = ?,
                    partida_direccion = ?,
                    llegada_ubigeo = ?,
                    llegada_direccion = ?,
                    transportista_ruc = ?,
                    transportista_razon_social = ?,
                    transportista_reg_mtc = ?,
                    vehiculo_placa = ?,
                    vehiculo_secundario_placa = ?,
                    conductor_tipo_doc = ?,
                    conductor_num_doc = ?,
                    conductor_nombres = ?,
                    conductor_apellidos = ?,
                    conductor_licencia = ?,
                    observaciones = ?,
                    grt_vinculada_id = ?,
                    grt_vinculada_numero = ?,
                    orden_servicio = ?,
                    orden_viaje = ?
                WHERE id = ?
            `, [
                data.fecha_emision,
                data.fecha_traslado || data.fecha_emision,
                data.modalidad_transporte || '01',
                data.motivo_traslado || '01',
                data.descripcion_motivo || 'VENTA',
                data.remitente_ruc,
                data.remitente_razon_social,
                data.remitente_tipo_doc || '6',
                data.destinatario_ruc,
                data.destinatario_razon_social,
                data.destinatario_tipo_doc || '6',
                parseFloat(data.peso_total) || 0,
                data.unidad_medida || 'KGM',
                parseInt(data.total_bultos) || 1,
                data.indicador_transbordo ? 1 : 0,
                data.indicador_retorno_vehiculo_vacio ? 1 : 0,
                data.indicador_retorno_envases_vacios ? 1 : 0,
                data.indicador_traslado_total_m1_l ? 1 : 0,
                data.partida_ubigeo,
                data.partida_direccion,
                data.llegada_ubigeo,
                data.llegada_direccion,
                data.transportista_ruc || null,
                data.transportista_razon_social || null,
                data.transportista_reg_mtc || null,
                data.vehiculo_placa ? data.vehiculo_placa.toUpperCase().trim() : null,
                data.vehiculo_secundario_placa ? data.vehiculo_secundario_placa.toUpperCase().trim() : null,
                data.conductor_tipo_doc || '1',
                data.conductor_num_doc || null,
                data.conductor_nombres || null,
                data.conductor_apellidos || null,
                data.conductor_licencia || null,
                data.observaciones || null,
                data.grt_vinculada_id || null,
                data.grt_vinculada_numero || null,
                data.orden_servicio || null,
                data.orden_viaje || null,
                id
            ]);

            // Reemplazar items
            if (Array.isArray(data.items)) {
                await dbConn.query(`DELETE FROM guias_items WHERE guia_tipo = 'GRE' AND guia_id = ?`, [id]);
                for (let i = 0; i < data.items.length; i++) {
                    const it = data.items[i];
                    await dbConn.query(`
                        INSERT INTO guias_items (
                            guia_tipo, guia_id, item_numero, codigo, descripcion, cantidad, unidad_medida, peso_unitario
                        ) VALUES ('GRE', ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        id,
                        i + 1,
                        it.codigo || `ITM-${i + 1}`,
                        it.descripcion || 'CARGA GENERAL',
                        parseFloat(it.cantidad) || 1,
                        it.unidad_medida || 'NIU',
                        parseFloat(it.peso_unitario) || 0
                    ]);
                }
            }

            res.json({ success: true, message: 'Guía Remitente actualizada correctamente' });
        } catch (e) {
            console.error("[GRE] Error actualizando guía:", e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // 7. ELIMINAR GUÍA (SOLO BORRADORES)
    // ═══════════════════════════════════════════════════════════════
    router.delete('/:id', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const { id } = req.params;

            const [existentes] = await dbConn.query(`SELECT estado, apisunat_status, numero_guia FROM guias_remitente WHERE id = ?`, [id]);
            if (existentes.length === 0) {
                return res.status(404).json({ success: false, error: 'Guía no encontrada' });
            }

            if (existentes[0].estado === 'EMITIDA' || existentes[0].apisunat_status === 'SUCCESS' || existentes[0].apisunat_status === 'ACEPTADO') {
                return res.status(400).json({ success: false, error: 'No se puede eliminar una guía ya emitida ante SUNAT' });
            }

            await dbConn.query(`DELETE FROM guias_items WHERE guia_tipo = 'GRE' AND guia_id = ?`, [id]);
            await dbConn.query(`DELETE FROM guias_remitente WHERE id = ?`, [id]);

            if (typeof logAudit === 'function') {
                logAudit(req, 'ELIMINAR_GRE', `Eliminación de Guía Remitente borrador ${existentes[0].numero_guia}`);
            }

            res.json({ success: true, message: 'Guía eliminada correctamente' });
        } catch (e) {
            console.error("[GRE] Error eliminando:", e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // 8. EMITIR GUÍA ANTE APISUNAT (TIPO 09)
    // ═══════════════════════════════════════════════════════════════
    router.post('/:id/emitir', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const { id } = req.params;

            const [guias] = await dbConn.query(`SELECT * FROM guias_remitente WHERE id = ?`, [id]);
            if (guias.length === 0) {
                return res.status(404).json({ success: false, error: 'Guía no encontrada' });
            }

            const guia = guias[0];

            if (guia.estado === 'EMITIDA' && (guia.apisunat_status === 'SUCCESS' || guia.apisunat_status === 'ACEPTADO')) {
                return res.status(400).json({
                    success: false,
                    error: `La guía ${guia.numero_guia} ya fue emitida exitosamente`,
                    documentId: guia.apisunat_document_id
                });
            }

            const [items] = await dbConn.query(
                `SELECT * FROM guias_items WHERE guia_tipo = 'GRE' AND guia_id = ? ORDER BY item_numero ASC`,
                [id]
            );

            // Obtener credenciales APISUNAT
            const creds = await ApisunatService.getCredenciales(dbConn);
            if (!creds || !creds.personaToken) {
                return res.status(400).json({
                    success: false,
                    error: 'Credenciales de APISUNAT no configuradas. Por favor revise el módulo de configuración.'
                });
            }

            // Datos de la empresa emisora
            const rucEmisor = guia.remitente_ruc || creds.ruc || '20609532484';
            const razonEmisor = guia.remitente_razon_social || creds.razonSocial || 'EMPRESA EMISORA S.A.C.';
            const serie = guia.serie || 'T001';
            const correlativo = parseInt(guia.correlativo) || 1;
            const fileName = `${rucEmisor}-09-${serie}-${correlativo}`;

            // Formatear fecha
            const fechaEmisionStr = guia.fecha_emision instanceof Date
                ? guia.fecha_emision.toISOString().split('T')[0]
                : String(guia.fecha_emision).split('T')[0];

            const fechaTrasladoStr = guia.fecha_traslado instanceof Date
                ? guia.fecha_traslado.toISOString().split('T')[0]
                : String(guia.fecha_traslado || guia.fecha_emision).split('T')[0];

            // Formatear items UBL 2.1
            const itemsPayload = (items.length > 0 ? items : [{
                item_numero: 1,
                codigo: 'CARGA-01',
                descripcion: 'CARGA GENERAL',
                cantidad: 1,
                unidad_medida: 'NIU',
                peso_unitario: guia.peso_total || 0
            }]).map((it, idx) => ({
                item: idx + 1,
                code: it.codigo || `ITM-${idx + 1}`,
                description: it.descripcion || 'CARGA GENERAL',
                unitCode: it.unidad_medida || 'NIU',
                quantity: parseFloat(it.cantidad) || 1,
                weight: parseFloat(it.peso_unitario) || 0
            }));

            // Estructura limpia de DocumentBody para UBL 2.1 GRE (Tipo 09)
            const documentBody = {
                documentType: "09",
                series: serie,
                correlative: correlativo,
                dateIssue: fechaEmisionStr,
                timeIssue: new Date().toTimeString().split(' ')[0],
                transferReasonCode: guia.motivo_traslado || "01",
                transferReasonDescription: guia.descripcion_motivo || "VENTA",
                transportModeCode: guia.modalidad_transporte || "01",
                startDateTransport: fechaTrasladoStr,
                grossWeight: parseFloat(guia.peso_total) || 1,
                grossWeightUnit: guia.unidad_medida || "KGM",
                totalPackages: parseInt(guia.total_bultos) || 1,
                
                // Emisor (Remitente)
                company: {
                    ruc: rucEmisor,
                    name: razonEmisor,
                    address: {
                        ubigeo: guia.partida_ubigeo || "150101",
                        address: guia.partida_direccion || "DIRECCION FISCAL"
                    }
                },

                // Receptor (Destinatario)
                recipient: {
                    documentType: guia.destinatario_tipo_doc || "6",
                    documentNumber: guia.destinatario_ruc,
                    name: guia.destinatario_razon_social
                },

                // Punto de Partida
                originAddress: {
                    ubigeo: guia.partida_ubigeo || "150101",
                    address: guia.partida_direccion || "DIRECCION PARTIDA"
                },

                // Punto de Llegada
                deliveryAddress: {
                    ubigeo: guia.llegada_ubigeo || "150101",
                    address: guia.llegada_direccion || "DIRECCION LLEGADA"
                },

                // Items
                items: itemsPayload
            };

            // Indicadores opcionales
            if (guia.indicador_transbordo) documentBody.transshipmentIndicator = true;
            if (guia.indicador_retorno_vehiculo_vacio) documentBody.emptyReturnIndicator = true;
            if (guia.indicador_retorno_envases_vacios) documentBody.emptyContainerIndicator = true;
            if (guia.indicador_traslado_total_m1_l) documentBody.m1lTransferIndicator = true;

            // Datos de transporte según modalidad
            if (guia.modalidad_transporte === '01') {
                // Modalidad 01: Transporte Público -> Requiere Transportista
                if (guia.transportista_ruc) {
                    documentBody.carrier = {
                        documentType: "6",
                        documentNumber: guia.transportista_ruc,
                        name: guia.transportista_razon_social || "EMPRESA DE TRANSPORTE",
                        mtcRegistration: guia.transportista_reg_mtc || undefined
                    };
                }
            } else {
                // Modalidad 02: Transporte Privado -> Requiere Vehículo y Conductor
                if (guia.vehiculo_placa) {
                    documentBody.transportVehicle = {
                        plate: guia.vehiculo_placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
                    };
                    if (guia.vehiculo_secundario_placa) {
                        documentBody.secondaryVehicle = {
                            plate: guia.vehiculo_secundario_placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
                        };
                    }
                }

                if (guia.conductor_num_doc) {
                    const conductorNombreCompleto = [guia.conductor_nombres, guia.conductor_apellidos].filter(Boolean).join(' ').trim();
                    documentBody.driver = {
                        documentType: guia.conductor_tipo_doc || "1",
                        documentNumber: guia.conductor_num_doc,
                        name: conductorNombreCompleto || "CONDUCTOR DESIGNADO",
                        license: guia.conductor_licencia || undefined
                    };
                }
            }

            // Limpieza de campos vacíos o indefinidos
            const cleanDocumentBody = ApisunatService.cleanObject(documentBody);

            console.log(`[GRE] Emitiendo ${fileName} a APISUNAT...`);

            // Llamada al servicio APISUNAT
            const apiResult = await ApisunatService.sendBill({
                personaId: creds.personaId,
                personaToken: creds.personaToken,
                fileName,
                documentBody: cleanDocumentBody
            });

            // Procesar respuesta
            const docId = apiResult.documentId || apiResult.id || null;
            const status = apiResult.status || (apiResult.success ? 'SUCCESS' : 'PENDIENTE');
            const faults = apiResult.faults ? JSON.stringify(apiResult.faults) : (apiResult.error || null);
            const xmlUrl = apiResult.xmlUrl || apiResult.xml || null;
            const cdrUrl = apiResult.cdrUrl || apiResult.cdr || null;
            const pdfUrl = apiResult.pdfUrl || apiResult.pdf || null;

            // Actualizar registro en base de datos
            await dbConn.query(`
                UPDATE guias_remitente SET
                    apisunat_document_id = ?,
                    apisunat_status = ?,
                    apisunat_faults = ?,
                    xml_url = COALESCE(?, xml_url),
                    cdr_url = COALESCE(?, cdr_url),
                    pdf_url = COALESCE(?, pdf_url),
                    estado = ?,
                    datos_json = ?
                WHERE id = ?
            `, [
                docId,
                status,
                faults,
                xmlUrl,
                cdrUrl,
                pdfUrl,
                (status === 'SUCCESS' || status === 'ACEPTADO') ? 'EMITIDA' : 'PROCESANDO',
                JSON.stringify(apiResult),
                id
            ]);

            if (typeof broadcast === 'function') {
                broadcast({
                    event: 'gre_emitida',
                    data: { id, numeroGuia: guia.numero_guia, status, pdfUrl }
                });
            }

            if (typeof logAudit === 'function') {
                logAudit(req, 'EMITIR_GRE', `Emisión de Guía Remitente ${guia.numero_guia} | Estado: ${status}`);
            }

            res.json({
                success: true,
                message: `Guía ${guia.numero_guia} enviada a SUNAT`,
                documentId: docId,
                status,
                pdfUrl,
                xmlUrl,
                cdrUrl,
                raw: apiResult
            });

        } catch (e) {
            console.error("[GRE] Error emitiendo:", e);
            // Guardar error en la guía
            try {
                const dbConn = getDb(req);
                await dbConn.query(`
                    UPDATE guias_remitente SET
                        apisunat_status = 'ERROR',
                        apisunat_faults = ?
                    WHERE id = ?
                `, [e.message, req.params.id]);
            } catch (_) {}

            res.status(400).json({ success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // 9. SINCRONIZAR ESTADO DESDE APISUNAT
    // ═══════════════════════════════════════════════════════════════
    router.get('/:id/sincronizar', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const { id } = req.params;

            const [guias] = await dbConn.query(`SELECT * FROM guias_remitente WHERE id = ?`, [id]);
            if (guias.length === 0) {
                return res.status(404).json({ success: false, error: 'Guía no encontrada' });
            }

            const guia = guias[0];
            if (!guia.apisunat_document_id) {
                return res.status(400).json({ success: false, error: 'La guía aún no tiene ID de documento en APISUNAT' });
            }

            const creds = await ApisunatService.getCredenciales(dbConn);
            const syncResult = await ApisunatService.getStatus({
                personaId: creds.personaId,
                personaToken: creds.personaToken,
                documentId: guia.apisunat_document_id
            });

            const status = syncResult.status || (syncResult.sunatResponse && syncResult.sunatResponse.success ? 'ACEPTADO' : guia.apisunat_status);
            const xmlUrl = syncResult.xmlUrl || syncResult.xml || guia.xml_url;
            const cdrUrl = syncResult.cdrUrl || syncResult.cdr || guia.cdr_url;
            const pdfUrl = syncResult.pdfUrl || syncResult.pdf || guia.pdf_url;
            const faults = syncResult.faults ? JSON.stringify(syncResult.faults) : guia.apisunat_faults;

            await dbConn.query(`
                UPDATE guias_remitente SET
                    apisunat_status = ?,
                    xml_url = ?,
                    cdr_url = ?,
                    pdf_url = ?,
                    apisunat_faults = ?,
                    estado = CASE WHEN ? IN ('SUCCESS','ACEPTADO') THEN 'EMITIDA' ELSE estado END
                WHERE id = ?
            `, [status, xmlUrl, cdrUrl, pdfUrl, faults, status, id]);

            res.json({
                success: true,
                message: 'Estado sincronizado con APISUNAT',
                status,
                pdfUrl,
                xmlUrl,
                cdrUrl
            });
        } catch (e) {
            console.error("[GRE] Error sincronizando:", e);
            res.status(400).json({ success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // 10. DUPLICAR GUÍA
    // ═══════════════════════════════════════════════════════════════
    router.post('/:id/duplicar', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const { id } = req.params;

            const [guias] = await dbConn.query(`SELECT * FROM guias_remitente WHERE id = ?`, [id]);
            if (guias.length === 0) {
                return res.status(404).json({ success: false, error: 'Guía no encontrada' });
            }

            const origen = guias[0];
            const serie = origen.serie || 'T001';

            const [corrRows] = await dbConn.query(
                `SELECT MAX(correlativo) as ultimo FROM guias_remitente WHERE serie = ?`,
                [serie]
            );
            const correlativo = (corrRows[0]?.ultimo || 0) + 1;
            const numeroGuia = `${serie}-${String(correlativo).padStart(8, '0')}`;
            const hoy = new Date().toISOString().split('T')[0];

            const [insertResult] = await dbConn.query(`
                INSERT INTO guias_remitente (
                    numero_guia, serie, correlativo, fecha_emision, fecha_traslado,
                    modalidad_transporte, motivo_traslado, descripcion_motivo,
                    remitente_ruc, remitente_razon_social, remitente_tipo_doc,
                    destinatario_ruc, destinatario_razon_social, destinatario_tipo_doc,
                    peso_total, unidad_medida, total_bultos,
                    indicador_transbordo, indicador_retorno_vehiculo_vacio,
                    indicador_retorno_envases_vacios, indicador_traslado_total_m1_l,
                    partida_ubigeo, partida_direccion, llegada_ubigeo, llegada_direccion,
                    transportista_ruc, transportista_razon_social, transportista_reg_mtc,
                    vehiculo_placa, vehiculo_secundario_placa,
                    conductor_tipo_doc, conductor_num_doc, conductor_nombres, conductor_apellidos, conductor_licencia,
                    estado, observaciones
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BORRADOR', ?)
            `, [
                numeroGuia,
                serie,
                correlativo,
                hoy,
                hoy,
                origen.modalidad_transporte,
                origen.motivo_traslado,
                origen.descripcion_motivo,
                origen.remitente_ruc,
                origen.remitente_razon_social,
                origen.remitente_tipo_doc,
                origen.destinatario_ruc,
                origen.destinatario_razon_social,
                origen.destinatario_tipo_doc,
                origen.peso_total,
                origen.unidad_medida,
                origen.total_bultos,
                origen.indicador_transbordo,
                origen.indicador_retorno_vehiculo_vacio,
                origen.indicador_retorno_envases_vacios,
                origen.indicador_traslado_total_m1_l,
                origen.partida_ubigeo,
                origen.partida_direccion,
                origen.llegada_ubigeo,
                origen.llegada_direccion,
                origen.transportista_ruc,
                origen.transportista_razon_social,
                origen.transportista_reg_mtc,
                origen.vehiculo_placa,
                origen.vehiculo_secundario_placa,
                origen.conductor_tipo_doc,
                origen.conductor_num_doc,
                origen.conductor_nombres,
                origen.conductor_apellidos,
                origen.conductor_licencia,
                `Duplicado de ${origen.numero_guia}`
            ]);

            const nuevoId = insertResult.insertId;

            // Duplicar items
            const [items] = await dbConn.query(
                `SELECT * FROM guias_items WHERE guia_tipo = 'GRE' AND guia_id = ?`,
                [id]
            );

            for (const it of items) {
                await dbConn.query(`
                    INSERT INTO guias_items (
                        guia_tipo, guia_id, item_numero, codigo, descripcion, cantidad, unidad_medida, peso_unitario
                    ) VALUES ('GRE', ?, ?, ?, ?, ?, ?, ?)
                `, [
                    nuevoId,
                    it.item_numero,
                    it.codigo,
                    it.descripcion,
                    it.cantidad,
                    it.unidad_medida,
                    it.peso_unitario
                ]);
            }

            res.json({
                success: true,
                message: `Guía duplicada como ${numeroGuia}`,
                id: nuevoId,
                numeroGuia
            });
        } catch (e) {
            console.error("[GRE] Error duplicando:", e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // 11. EMISIÓN MASIVA DE GUÍAS BORRADOR
    // ═══════════════════════════════════════════════════════════════
    router.post('/emision-masiva', async (req, res) => {
        try {
            const dbConn = getDb(req);
            const { ids } = req.body;

            if (!Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ success: false, error: 'Debe especificar una lista de IDs de guías' });
            }

            const resultados = [];

            for (const guiaId of ids) {
                try {
                    // Simular llamada interna a emisión
                    const [guias] = await dbConn.query(`SELECT * FROM guias_remitente WHERE id = ?`, [guiaId]);
                    if (guias.length === 0) continue;
                    const g = guias[0];

                    if (g.estado === 'EMITIDA') {
                        resultados.push({ id: guiaId, numeroGuia: g.numero_guia, success: true, message: 'Ya emitida previamente' });
                        continue;
                    }

                    // Proceder a emitir usando ApisunatService
                    const [items] = await dbConn.query(`SELECT * FROM guias_items WHERE guia_tipo = 'GRE' AND guia_id = ?`, [guiaId]);
                    const creds = await ApisunatService.getCredenciales(dbConn);

                    const rucEmisor = g.remitente_ruc || creds.ruc || '20609532484';
                    const serie = g.serie || 'T001';
                    const correlativo = parseInt(g.correlativo) || 1;
                    const fileName = `${rucEmisor}-09-${serie}-${correlativo}`;

                    const fechaEmisionStr = g.fecha_emision instanceof Date
                        ? g.fecha_emision.toISOString().split('T')[0]
                        : String(g.fecha_emision).split('T')[0];

                    const fechaTrasladoStr = g.fecha_traslado instanceof Date
                        ? g.fecha_traslado.toISOString().split('T')[0]
                        : String(g.fecha_traslado || g.fecha_emision).split('T')[0];

                    const itemsPayload = (items.length > 0 ? items : [{
                        item_numero: 1,
                        codigo: 'CARGA-01',
                        descripcion: 'CARGA GENERAL',
                        cantidad: 1,
                        unidad_medida: 'NIU',
                        peso_unitario: g.peso_total || 0
                    }]).map((it, idx) => ({
                        item: idx + 1,
                        code: it.codigo || `ITM-${idx + 1}`,
                        description: it.descripcion || 'CARGA GENERAL',
                        unitCode: it.unidad_medida || 'NIU',
                        quantity: parseFloat(it.cantidad) || 1,
                        weight: parseFloat(it.peso_unitario) || 0
                    }));

                    const docBody = {
                        documentType: "09",
                        series: serie,
                        correlative: correlativo,
                        dateIssue: fechaEmisionStr,
                        timeIssue: new Date().toTimeString().split(' ')[0],
                        transferReasonCode: g.motivo_traslado || "01",
                        transferReasonDescription: g.descripcion_motivo || "VENTA",
                        transportModeCode: g.modalidad_transporte || "01",
                        startDateTransport: fechaTrasladoStr,
                        grossWeight: parseFloat(g.peso_total) || 1,
                        grossWeightUnit: g.unidad_medida || "KGM",
                        totalPackages: parseInt(g.total_bultos) || 1,
                        company: {
                            ruc: rucEmisor,
                            name: g.remitente_razon_social || creds.razonSocial || 'EMPRESA EMISORA S.A.C.',
                            address: {
                                ubigeo: g.partida_ubigeo || "150101",
                                address: g.partida_direccion || "DIRECCION FISCAL"
                            }
                        },
                        recipient: {
                            documentType: g.destinatario_tipo_doc || "6",
                            documentNumber: g.destinatario_ruc,
                            name: g.destinatario_razon_social
                        },
                        originAddress: {
                            ubigeo: g.partida_ubigeo || "150101",
                            address: g.partida_direccion || "DIRECCION PARTIDA"
                        },
                        deliveryAddress: {
                            ubigeo: g.llegada_ubigeo || "150101",
                            address: g.llegada_direccion || "DIRECCION LLEGADA"
                        },
                        items: itemsPayload
                    };

                    if (g.modalidad_transporte === '01' && g.transportista_ruc) {
                        docBody.carrier = {
                            documentType: "6",
                            documentNumber: g.transportista_ruc,
                            name: g.transportista_razon_social || "EMPRESA DE TRANSPORTE",
                            mtcRegistration: g.transportista_reg_mtc || undefined
                        };
                    } else if (g.modalidad_transporte === '02') {
                        if (g.vehiculo_placa) {
                            docBody.transportVehicle = {
                                plate: g.vehiculo_placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
                            };
                        }
                        if (g.conductor_num_doc) {
                            docBody.driver = {
                                documentType: g.conductor_tipo_doc || "1",
                                documentNumber: g.conductor_num_doc,
                                name: [g.conductor_nombres, g.conductor_apellidos].filter(Boolean).join(' ').trim() || "CONDUCTOR",
                                license: g.conductor_licencia || undefined
                            };
                        }
                    }

                    const cleanDocBody = ApisunatService.cleanObject(docBody);

                    const apiRes = await ApisunatService.sendBill({
                        personaId: creds.personaId,
                        personaToken: creds.personaToken,
                        fileName,
                        documentBody: cleanDocBody
                    });

                    const st = apiRes.status || (apiRes.success ? 'SUCCESS' : 'PENDIENTE');

                    await dbConn.query(`
                        UPDATE guias_remitente SET
                            apisunat_document_id = ?,
                            apisunat_status = ?,
                            xml_url = COALESCE(?, xml_url),
                            cdr_url = COALESCE(?, cdr_url),
                            pdf_url = COALESCE(?, pdf_url),
                            estado = ?,
                            datos_json = ?
                        WHERE id = ?
                    `, [
                        apiRes.documentId || apiRes.id || null,
                        st,
                        apiRes.xmlUrl || null,
                        apiRes.cdrUrl || null,
                        apiRes.pdfUrl || null,
                        (st === 'SUCCESS' || st === 'ACEPTADO') ? 'EMITIDA' : 'PROCESANDO',
                        JSON.stringify(apiRes),
                        guiaId
                    ]);

                    resultados.push({ id: guiaId, numeroGuia: g.numero_guia, success: true, status: st });
                } catch (errGuia) {
                    resultados.push({ id: guiaId, success: false, error: errGuia.message });
                }
            }

            res.json({ success: true, resultados });
        } catch (e) {
            console.error("[GRE] Error emisión masiva:", e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    return router;
};
