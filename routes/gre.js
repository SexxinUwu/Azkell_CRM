// Módulo Guías de remisión (Operaciones): registro de las GRE que nos entregan los clientes (y, más adelante, las que emitimos).
// Tabla: gre_guias (migración 30). Una guía va con un solo servicio; al vincularla, su peso pasa al servicio y de ahí al viaje.
// Registrar es rápido: se sube el XML, la foto o el PDF de la guía y se leen los datos para que la persona los revise y confirme.
const express = require('express');
const multer = require('multer');
const { uploadToS3, deleteFromS3, s3KeyFromUrl, getPresignedUrlEstable } = require('../utils/s3');
const { leerGuia, rucValido, separarSerie } = require('../services/gre_lectura');
const Apisunat = require('../services/apisunatService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const digitos = (v, max) => { const d = String(v ?? '').replace(/\D/g, ''); return d ? d.slice(0, max) : null; };
const fechaOpc = v => { const s = String(v ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const ORIGENES = ['RECIBIDA', 'EMITIDA'];
const TIPOS = ['REMITENTE', 'TRANSPORTISTA'];

module.exports = (db, logAudit) => {
    const router = express.Router();
    const getDb = req => ((req && req.db) ? req.db : db);
    const P = req => getDb(req).promise();
    const usuarioDe = req => String((req.user && (req.user.nombre || req.user.correo)) || 'sistema').slice(0, 150);
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[gre] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: err && err.message ? err.message : 'Error del servidor' });
    };

    const COLUMNAS = `g.id, g.origen, g.tipo, g.serie, g.numero, g.numero_completo, g.emisor_ruc,
        DATE_FORMAT(g.fecha_emision, '%Y-%m-%d') AS fecha_emision, DATE_FORMAT(g.fecha_traslado, '%Y-%m-%d') AS fecha_traslado,
        g.remitente_ruc, g.remitente_nombre, g.destinatario_doc, g.destinatario_nombre, g.transportista_ruc, g.transportista_nombre,
        g.modalidad, g.motivo, g.partida_ubigeo, g.partida_direccion, g.llegada_ubigeo, g.llegada_direccion,
        g.peso_kg, g.bultos, g.descripcion, g.items_json, g.placa, g.conductor_nombre, g.conductor_doc, g.licencia, g.vehiculo_tuc, g.vehiculo_autorizacion, g.trae_transporte,
        g.placa_carreta, g.viaje, g.guia_relacionada_id, g.apisunat_status, g.apisunat_faults, g.pdf_url, g.modo_emision,
        g.orden_servicio_id, g.orden_servicio_codigo, g.estado, g.fuente, g.archivo_url, g.archivo_nombre, g.observaciones, g.usuario,
        DATE_FORMAT(g.creado_en, '%Y-%m-%d %H:%i') AS creado_en, g.xml_url, g.cdr_url, g.guias_relacionadas_ids,
        (SELECT t.numero_completo FROM gre_guias t WHERE t.origen = 'EMITIDA' AND t.tipo = 'TRANSPORTISTA' AND t.estado <> 'ANULADA'
            AND (t.guia_relacionada_id = g.id OR FIND_IN_SET(g.id, t.guias_relacionadas_ids)) ORDER BY t.id DESC LIMIT 1) AS grt_numero,
        (SELECT t.apisunat_status FROM gre_guias t WHERE t.origen = 'EMITIDA' AND t.tipo = 'TRANSPORTISTA' AND t.estado <> 'ANULADA'
            AND (t.guia_relacionada_id = g.id OR FIND_IN_SET(g.id, t.guias_relacionadas_ids)) ORDER BY t.id DESC LIMIT 1) AS grt_status,
        (SELECT GROUP_CONCAT(r.numero_completo ORDER BY r.id SEPARATOR ', ') FROM gre_guias r WHERE g.origen = 'EMITIDA' AND (FIND_IN_SET(r.id, g.guias_relacionadas_ids) OR r.id = g.guia_relacionada_id)) AS guias_incluidas`;

    // Peso real del servicio = suma de sus guías vigentes; pasa al tramo en su viaje y al peso del viaje
    async function recalcularPeso(p, codigoOrden) {
        if (!codigoOrden) return 0;
        const [s] = await p.query(`SELECT COALESCE(SUM(peso_kg), 0) AS kg FROM gre_guias WHERE orden_servicio_codigo = ? AND tipo = 'REMITENTE' AND estado <> 'ANULADA'`, [codigoOrden]);
        const kg = Number(s[0].kg) || 0;
        const [tramos] = await p.query(`SELECT viaje FROM operaciones_ordenes_viaje_rutas WHERE orden = ?`, [codigoOrden]);
        if (tramos.length) {
            if (kg > 0) {
                await p.query(`UPDATE operaciones_ordenes_viaje_rutas SET peso_total = ? WHERE orden = ?`, [kg, codigoOrden]);
            } else {
                // Sin guías vigentes, el tramo vuelve al peso estimado del servicio
                await p.query(`UPDATE operaciones_ordenes_viaje_rutas r JOIN operaciones_ordenes_servicio os ON os.codigo_orden COLLATE utf8mb4_unicode_ci = r.orden COLLATE utf8mb4_unicode_ci
                               SET r.peso_total = COALESCE(os.peso_estimado, 0) WHERE r.orden = ?`, [codigoOrden]);
            }
            for (const t of tramos) {
                await p.query(`UPDATE operaciones_ordenes_viaje SET peso = (SELECT COALESCE(SUM(peso_total), 0) FROM operaciones_ordenes_viaje_rutas WHERE viaje = ?) WHERE viaje = ?`, [t.viaje, t.viaje]);
            }
        }
        return kg;
    }

    // Datos que se guardan de una guía, validados
    function datosDeGuia(b, esNueva) {
        const origen = ORIGENES.includes(String(b.origen).toUpperCase()) ? String(b.origen).toUpperCase() : 'RECIBIDA';
        const tipo = TIPOS.includes(String(b.tipo).toUpperCase()) ? String(b.tipo).toUpperCase() : 'REMITENTE';
        const id = separarSerie(b.numero_completo || `${b.serie || ''}-${b.numero || ''}`);
        if (!id.completo) throw aviso('Escribe la serie y el número de la guía, por ejemplo T001-00000123.');
        const emisor = tipo === 'TRANSPORTISTA' ? digitos(b.transportista_ruc, 11) : digitos(b.remitente_ruc, 11);
        if (origen === 'RECIBIDA' && (!emisor || emisor.length !== 11)) throw aviso(tipo === 'TRANSPORTISTA' ? 'Indica el RUC del transportista que emitió la guía.' : 'Indica el RUC del remitente que emitió la guía.');
        const peso = num(b.peso_kg);
        if (peso < 0) throw aviso('El peso no puede ser negativo.');
        const ubigeo = v => { const d = digitos(v, 6); return d && d.length === 6 ? d : null; };
        return {
            origen, tipo, serie: id.serie, numero: id.numero, numero_completo: id.completo, emisor_ruc: emisor || '',
            fecha_emision: fechaOpc(b.fecha_emision), fecha_traslado: fechaOpc(b.fecha_traslado),
            remitente_ruc: digitos(b.remitente_ruc, 11), remitente_nombre: texto(b.remitente_nombre, 200),
            destinatario_doc: digitos(b.destinatario_doc, 11), destinatario_nombre: texto(b.destinatario_nombre, 200),
            transportista_ruc: digitos(b.transportista_ruc, 11), transportista_nombre: texto(b.transportista_nombre, 200),
            modalidad: ['PUBLICO', 'PRIVADO'].includes(String(b.modalidad).toUpperCase()) ? String(b.modalidad).toUpperCase() : null,
            motivo: texto(b.motivo, 80),
            partida_ubigeo: ubigeo(b.partida_ubigeo), partida_direccion: texto(b.partida_direccion, 255),
            llegada_ubigeo: ubigeo(b.llegada_ubigeo), llegada_direccion: texto(b.llegada_direccion, 255),
            peso_kg: Math.round(peso * 100) / 100, bultos: Number.isInteger(Number(b.bultos)) && Number(b.bultos) > 0 ? Number(b.bultos) : null,
            descripcion: texto(b.descripcion, 500),
            items_json: Array.isArray(b.items) && b.items.length ? JSON.stringify(b.items.slice(0, 60)) : null,
            placa: texto(b.placa, 20) ? String(b.placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
            conductor_nombre: texto(b.conductor_nombre, 150), conductor_doc: digitos(b.conductor_doc, 15), licencia: texto(b.licencia, 30),
            vehiculo_tuc: texto(b.vehiculo_tuc, 30), vehiculo_autorizacion: texto(b.vehiculo_autorizacion, 30),
            trae_transporte: b.trae_transporte ? 1 : 0,
            fuente: ['XML', 'IA', 'MANUAL'].includes(String(b.fuente).toUpperCase()) ? String(b.fuente).toUpperCase() : 'MANUAL',
            observaciones: texto(b.observaciones, 2000),
        };
    }

    // ── Leer el archivo de una guía (XML, foto o PDF) y devolver los datos para revisar; no guarda nada ──
    router.post('/leer', upload.single('archivo'), async (req, res) => {
        try {
            if (!req.file) throw aviso('Sube la guía como imagen, PDF o XML.');
            const datos = await leerGuia(req.file.buffer, req.file.mimetype, req.file.originalname);
            // Aviso de duplicado antes de que la persona termine de revisar
            let duplicada = null;
            if (datos.numero_completo) {
                const emisor = datos.tipo === 'TRANSPORTISTA' ? datos.transportista_ruc : datos.remitente_ruc;
                const [d] = await P(req).query(`SELECT id, estado FROM gre_guias WHERE tipo = ? AND emisor_ruc = ? AND numero_completo = ? LIMIT 1`, [datos.tipo || 'REMITENTE', emisor || '', datos.numero_completo]);
                if (d.length) duplicada = d[0];
            }
            res.json({ ok: true, datos, duplicada });
        } catch (err) { responder(res, err, 'leer'); }
    });

    // ── Listado (filtros: viaje, servicio) ──
    router.get('/guias', async (req, res) => {
        try {
            const donde = []; const params = [];
            if (req.query.viaje) { donde.push(`g.orden_servicio_codigo IN (SELECT orden FROM operaciones_ordenes_viaje_rutas WHERE viaje = ?)`); params.push(String(req.query.viaje)); }
            if (req.query.orden) { donde.push(`g.orden_servicio_id = ?`); params.push(Number(req.query.orden) || 0); }
            const [rows] = await P(req).query(
                `SELECT ${COLUMNAS}, os.cliente_nombre AS servicio_cliente
                   FROM gre_guias g LEFT JOIN operaciones_ordenes_servicio os ON os.id = g.orden_servicio_id
                  ${donde.length ? 'WHERE ' + donde.join(' AND ') : ''} ORDER BY g.fecha_emision DESC, g.id DESC LIMIT 3000`, params);
            res.json({ ok: true, data: rows });
        } catch (err) { responder(res, err, 'lista'); }
    });

    router.get('/guias/:id', async (req, res) => {
        try {
            const [rows] = await P(req).query(`SELECT ${COLUMNAS}, os.cliente_nombre AS servicio_cliente FROM gre_guias g LEFT JOIN operaciones_ordenes_servicio os ON os.id = g.orden_servicio_id WHERE g.id = ?`, [req.params.id]);
            if (!rows.length) throw aviso('Guía no encontrada.', 404);
            const g = rows[0];
            let archivo_ver_url = null;
            if (g.archivo_url) { try { archivo_ver_url = await getPresignedUrlEstable(s3KeyFromUrl(g.archivo_url)); } catch (e) { archivo_ver_url = null; } }
            res.json({ ok: true, data: { ...g, archivo_ver_url } });
        } catch (err) { responder(res, err, 'detalle'); }
    });

    // ── Registrar (multipart: campo `datos` en JSON y, opcional, el archivo original) ──
    router.post('/guias', upload.single('archivo'), async (req, res) => {
        try {
            let b = req.body || {};
            if (typeof b.datos === 'string') { try { b = JSON.parse(b.datos); } catch (e) { throw aviso('Los datos de la guía no son válidos.'); } }
            const d = datosDeGuia(b, true);
            const [dup] = await P(req).query(`SELECT id FROM gre_guias WHERE tipo = ? AND emisor_ruc = ? AND numero_completo = ? LIMIT 1`, [d.tipo, d.emisor_ruc, d.numero_completo]);
            if (dup.length) throw aviso(`La guía ${d.numero_completo} ya está registrada.`, 409);
            let archivo_url = null; let archivo_nombre = null;
            if (req.file) {
                const ext = (/\.([a-z0-9]{2,5})$/i.exec(req.file.originalname || '') || [])[1] || (req.file.mimetype === 'application/pdf' ? 'pdf' : 'jpg');
                archivo_url = await uploadToS3(req.file.buffer, `operaciones/gre/${new Date().getFullYear()}/${d.numero_completo}_${Date.now()}.${ext.toLowerCase()}`, req.file.mimetype);
                archivo_nombre = texto(req.file.originalname, 200);
            }
            const cols = Object.keys(d);
            const [r] = await P(req).query(
                `INSERT INTO gre_guias (${cols.join(', ')}, archivo_url, archivo_nombre, estado, usuario) VALUES (${cols.map(() => '?').join(', ')}, ?, ?, 'REGISTRADA', ?)`,
                [...cols.map(k => d[k]), archivo_url, archivo_nombre, usuarioDe(req)]);
            if (logAudit) logAudit({ req, accion: 'REGISTRAR_GUIA', modulo: 'OPERACIONES', detalle: `Registrada guía ${d.numero_completo} (${d.tipo}, ${d.origen})` });
            res.json({ ok: true, id: r.insertId, message: `Guía ${d.numero_completo} registrada.` });
        } catch (err) { responder(res, err, 'registrar'); }
    });

    // ── Corregir los datos de una guía ──
    router.put('/guias/:id', async (req, res) => {
        try {
            const p = P(req);
            const [prev] = await p.query(`SELECT id, origen, estado, orden_servicio_codigo, numero_completo FROM gre_guias WHERE id = ?`, [req.params.id]);
            if (!prev.length) throw aviso('Guía no encontrada.', 404);
            if (prev[0].origen === 'EMITIDA') throw aviso('Una guía emitida por nosotros no se edita.', 409);
            if (prev[0].estado === 'ANULADA') throw aviso('Una guía anulada ya no se edita.', 409);
            const d = datosDeGuia(req.body || {}, false);
            const [dup] = await p.query(`SELECT id FROM gre_guias WHERE tipo = ? AND emisor_ruc = ? AND numero_completo = ? AND id <> ? LIMIT 1`, [d.tipo, d.emisor_ruc, d.numero_completo, req.params.id]);
            if (dup.length) throw aviso(`Ya existe otra guía ${d.numero_completo} de ese emisor.`, 409);
            const cols = Object.keys(d);
            await p.query(`UPDATE gre_guias SET ${cols.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...cols.map(k => d[k]), req.params.id]);
            await recalcularPeso(p, prev[0].orden_servicio_codigo);
            if (logAudit) logAudit({ req, accion: 'EDITAR_GUIA', modulo: 'OPERACIONES', detalle: `Editada guía ${d.numero_completo}` });
            res.json({ ok: true, message: 'Guía actualizada.' });
        } catch (err) { responder(res, err, 'editar'); }
    });

    // ── Vincular a un servicio: su peso pasa al servicio y de ahí al viaje ──
    router.post('/guias/:id/vincular', async (req, res) => {
        try {
            const p = P(req);
            const [g] = await p.query(`SELECT id, origen, estado, numero_completo, orden_servicio_codigo FROM gre_guias WHERE id = ?`, [req.params.id]);
            if (!g.length) throw aviso('Guía no encontrada.', 404);
            if (g[0].origen === 'EMITIDA') throw aviso('Una guía emitida por nosotros sigue a su servicio: no se vincula a mano.', 409);
            if (g[0].estado === 'ANULADA') throw aviso('Una guía anulada no se puede vincular.', 409);
            if (g[0].orden_servicio_codigo) throw aviso(`La guía ya está vinculada al servicio ${g[0].orden_servicio_codigo}. Desvincúlala primero.`, 409);
            const [os] = await p.query(`SELECT id, codigo_orden, estado_servicio FROM operaciones_ordenes_servicio WHERE id = ?`, [Number((req.body || {}).orden_servicio_id) || 0]);
            if (!os.length) throw aviso('Elige el servicio.', 404);
            if (['ANULADO', 'ENTREGADO'].includes(String(os[0].estado_servicio).toUpperCase())) throw aviso('El servicio ya está cerrado: no admite más guías.', 409);
            await p.query(`UPDATE gre_guias SET orden_servicio_id = ?, orden_servicio_codigo = ?, estado = 'VINCULADA' WHERE id = ? AND orden_servicio_codigo IS NULL`, [os[0].id, os[0].codigo_orden, g[0].id]);
            const kg = await recalcularPeso(p, os[0].codigo_orden);
            if (logAudit) logAudit({ req, accion: 'VINCULAR_GUIA', modulo: 'OPERACIONES', detalle: `Guía ${g[0].numero_completo} vinculada al servicio ${os[0].codigo_orden}` });
            res.json({ ok: true, peso_servicio: kg, message: `Guía vinculada. El servicio ${os[0].codigo_orden} tiene ahora ${kg.toLocaleString('es-PE')} kg.` });
        } catch (err) { responder(res, err, 'vincular'); }
    });

    router.post('/guias/:id/desvincular', async (req, res) => {
        try {
            const p = P(req);
            const [g] = await p.query(`SELECT id, numero_completo, orden_servicio_codigo, estado FROM gre_guias WHERE id = ?`, [req.params.id]);
            if (!g.length) throw aviso('Guía no encontrada.', 404);
            if (!g[0].orden_servicio_codigo) throw aviso('La guía no está vinculada a ningún servicio.', 409);
            const codigo = g[0].orden_servicio_codigo;
            await p.query(`UPDATE gre_guias SET orden_servicio_id = NULL, orden_servicio_codigo = NULL, estado = IF(estado = 'ANULADA', 'ANULADA', 'REGISTRADA') WHERE id = ?`, [g[0].id]);
            await recalcularPeso(p, codigo);
            if (logAudit) logAudit({ req, accion: 'DESVINCULAR_GUIA', modulo: 'OPERACIONES', detalle: `Guía ${g[0].numero_completo} desvinculada del servicio ${codigo}` });
            res.json({ ok: true, message: 'Guía desvinculada.' });
        } catch (err) { responder(res, err, 'desvincular'); }
    });

    // ── Anular: la guía queda en el historial pero su peso sale del servicio y del viaje ──
    router.post('/guias/:id/anular', async (req, res) => {
        try {
            const p = P(req);
            const [g] = await p.query(`SELECT id, origen, numero_completo, orden_servicio_codigo, estado FROM gre_guias WHERE id = ?`, [req.params.id]);
            if (!g.length) throw aviso('Guía no encontrada.', 404);
            if (g[0].origen === 'EMITIDA') throw aviso('Una guía emitida se da de baja en APISUNAT, no desde aquí todavía.', 409);
            if (g[0].estado === 'ANULADA') throw aviso('La guía ya está anulada.', 409);
            await p.query(`UPDATE gre_guias SET estado = 'ANULADA' WHERE id = ?`, [g[0].id]);
            await recalcularPeso(p, g[0].orden_servicio_codigo);
            if (logAudit) logAudit({ req, accion: 'ANULAR_GUIA', modulo: 'OPERACIONES', detalle: `Anulada guía ${g[0].numero_completo}` });
            res.json({ ok: true, message: 'Guía anulada.' });
        } catch (err) { responder(res, err, 'anular'); }
    });

    // ── Eliminar un registro equivocado (solo si no está vinculado) ──
    router.delete('/guias/:id', async (req, res) => {
        try {
            const p = P(req);
            const [g] = await p.query(`SELECT id, origen, numero_completo, orden_servicio_codigo, archivo_url FROM gre_guias WHERE id = ?`, [req.params.id]);
            if (!g.length) throw aviso('Guía no encontrada.', 404);
            if (g[0].origen === 'EMITIDA') throw aviso('Una guía emitida no se elimina del sistema.', 409);
            if (g[0].orden_servicio_codigo) throw aviso('Desvincula la guía del servicio antes de eliminarla.', 409);
            await p.query(`DELETE FROM gre_guias WHERE id = ?`, [g[0].id]);
            if (g[0].archivo_url) { try { await deleteFromS3(s3KeyFromUrl(g[0].archivo_url)); } catch (e) { /* el archivo queda huérfano pero el registro ya no existe */ } }
            if (logAudit) logAudit({ req, accion: 'ELIMINAR_GUIA', modulo: 'OPERACIONES', detalle: `Eliminada guía ${g[0].numero_completo}` });
            res.json({ ok: true, message: 'Guía eliminada.' });
        } catch (err) { responder(res, err, 'eliminar'); }
    });

    // ───────────────────────── GRE Transportista propia, a partir de una guía recibida y vinculada ─────────────────────────
    // Se guarda en gre_guias (origen EMITIDA) y se envía con la configuración de APISUNAT de la empresa (Sistema › Integraciones).
    const MOTIVOS = [[/venta/i, '01'], [/compra/i, '02'], [/establecimientos|misma empresa/i, '04'], [/import/i, '08'], [/export/i, '09']];
    const motivoCodigo = t => { const m = MOTIVOS.find(([re]) => re.test(String(t || ''))); return m ? m[1] : '13'; };
    const UNIDADES_SUNAT = ['KGM', 'TNE', 'NIU', 'ZZ', 'BX', 'BE', 'LTR', 'MTR', 'GLL'];
    const unidadSunat = u => { const x = String(u || '').toUpperCase().trim(); if (/^FARDO/.test(x)) return 'BE'; return UNIDADES_SUNAT.includes(x) ? x : 'NIU'; };
    // Fecha y hora de Perú (el servidor está en UTC)
    const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    const horaLima = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Lima', hour12: false });

    // El catálogo guarda el nombre completo («NOMBRES APELLIDOS»); APISUNAT pide nombres y apellidos por separado. La persona lo corrige en el formulario.
    function partirNombre(completo) {
        const t = String(completo || '').trim().split(/\s+/).filter(Boolean);
        if (t.length < 2) return { nombres: t[0] || '', apellidos: '' };
        if (t.length === 2) return { nombres: t[0], apellidos: t[1] };
        if (t.length === 3) return { nombres: t[0], apellidos: t.slice(1).join(' ') };
        return { nombres: t.slice(0, t.length - 2).join(' '), apellidos: t.slice(-2).join(' ') };
    }

    // TUC y autorización del vehículo: se recuerdan de la última guía emitida con esa placa
    async function vehiculoGuardado(p, placa) {
        const vacio = { tuc: '', aut: '' };
        const pl = String(placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!pl) return vacio;
        const [r] = await p.query(`SELECT datos_json FROM gre_guias WHERE origen = 'EMITIDA' AND tipo = 'TRANSPORTISTA' AND datos_json IS NOT NULL ORDER BY id DESC LIMIT 30`);
        for (const row of r) {
            try {
                const te = JSON.parse(row.datos_json)['cac:Shipment']['cac:TransportHandlingUnit']['cac:TransportEquipment'];
                for (const n of [te, ...(te['cac:AttachedTransportEquipment'] || [])]) {
                    if (n && n['cbc:ID'] && String(n['cbc:ID']._text).toUpperCase() === pl) {
                        return {
                            tuc: n['cac:ApplicableTransportMeans'] ? String(n['cac:ApplicableTransportMeans']['cbc:RegistrationNationalityID']._text || '') : '',
                            aut: n['cac:ShipmentDocumentReference'] ? String(n['cac:ShipmentDocumentReference']['cbc:ID']._text || '') : '',
                        };
                    }
                }
            } catch (e) { /* guía antigua con otro formato */ }
        }
        return vacio;
    }

    const normPlaca = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    // TUC y autorización registrados en la ficha de la placa
    async function vehiculoDePlaca(p, placa) {
        const pl = normPlaca(placa);
        if (!pl) return { tuc: '', aut: '' };
        try {
            const [r] = await p.query(`SELECT tuc, autorizacion_mtc FROM placas WHERE REPLACE(REPLACE(UPPER(placa), '-', ''), ' ', '') = ? LIMIT 1`, [pl]);
            if (r[0]) return { tuc: r[0].tuc || '', aut: r[0].autorizacion_mtc || '' };
        } catch (e) { /* la columna aún no existe */ }
        return { tuc: '', aut: '' };
    }

    // Datos de la GRE Transportista que se propone para una guía: salen de la guía, del viaje y del conductor; la persona los revisa
    async function propuestaGrt(p, g, cfg) {
        const [v] = g.orden_servicio_codigo ? await p.query(
            `SELECT ov.viaje, ov.placa_tracto, ov.placa_remolque, ov.conductor, ov.id_conductor, DATE_FORMAT(ov.fecha_inicio, '%Y-%m-%d') AS fecha_inicio
             FROM operaciones_ordenes_viaje_rutas r JOIN operaciones_ordenes_viaje ov ON ov.viaje COLLATE utf8mb4_unicode_ci = r.viaje COLLATE utf8mb4_unicode_ci
             WHERE r.orden COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci ORDER BY ov.id DESC LIMIT 1`, [g.orden_servicio_codigo]) : [[]];
        const viaje = v[0] || null;
        let cond = null;
        if (viaje && (viaje.id_conductor || viaje.conductor)) {
            const [c] = await p.query(`SELECT nombre, dni, licencia FROM conductores WHERE idConductor = ? OR nombre COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci LIMIT 1`, [viaje.id_conductor || 0, viaje.conductor || '']);
            cond = c[0] || null;
        }
        let items = [];
        try { items = JSON.parse(g.items_json || '[]'); } catch (e) { items = []; }
        items = (items.length ? items : [{ descripcion: g.descripcion || 'CARGA GENERAL', cantidad: 1, unidad: 'NIU' }]).map((it, i) => ({
            codigo: String(i + 1).padStart(3, '0'), descripcion: String(it.descripcion || 'CARGA GENERAL').slice(0, 250), cantidad: Number(it.cantidad) || 1, unidad_medida: unidadSunat(it.unidad),
        }));
        const fecha = g.fecha_traslado ? new Date(g.fecha_traslado).toISOString().slice(0, 10) : null;
        // TUC y autorización: primero la ficha de la placa, luego lo que trae la guía del cliente (si habla de ese mismo vehículo) y por último lo usado en la última guía emitida
        const tracto = viaje && viaje.placa_tracto;
        const carreta = viaje && viaje.placa_remolque;
        const pT = await vehiculoDePlaca(p, tracto);
        const pC = await vehiculoDePlaca(p, carreta);
        const hT = await vehiculoGuardado(p, tracto);
        const hC = await vehiculoGuardado(p, carreta);
        const delCliente = normPlaca(g.placa) && normPlaca(g.placa) === normPlaca(tracto) ? { tuc: g.vehiculo_tuc || '', aut: g.vehiculo_autorizacion || '' } : { tuc: '', aut: '' };
        const vt = { tuc: pT.tuc || delCliente.tuc || hT.tuc, aut: pT.aut || delCliente.aut || cfg.autorizacion_mtc || hT.aut };
        const vc = { tuc: pC.tuc || hC.tuc, aut: pC.aut || cfg.autorizacion_mtc || hC.aut };
        const propuesta = {
            serie: cfg.serie_grt,
            // SUNAT no acepta que el traslado empiece antes de la emisión (error 3343): si la fecha de la guía del cliente ya pasó, se propone hoy
            fecha_traslado: [fecha, viaje && viaje.fecha_inicio].find(f => f && f >= hoyLima()) || hoyLima(),
            fecha_traslado_guia: fecha || '',
            motivo_traslado: motivoCodigo(g.motivo), descripcion_motivo: String(g.motivo || 'VENTA').toUpperCase().slice(0, 100),
            remitente_ruc: g.remitente_ruc || '', remitente_razon_social: g.remitente_nombre || '',
            destinatario_ruc: g.destinatario_doc || '', destinatario_razon_social: g.destinatario_nombre || '',
            punto_partida_ubigeo: g.partida_ubigeo || '', punto_partida_direccion: g.partida_direccion || '',
            punto_llegada_ubigeo: g.llegada_ubigeo || '', punto_llegada_direccion: g.llegada_direccion || '',
            peso_bruto_total: Number(g.peso_kg) || 0, unidad_medida: 'KGM',
            placa_tracto: (viaje && viaje.placa_tracto) || '', placa_carreta: (viaje && viaje.placa_remolque) || '',
            ...(() => { const n = partirNombre((cond && cond.nombre) || (viaje && viaje.conductor) || ''); return { conductor_nombre: n.nombres, conductor_apellidos: n.apellidos }; })(), conductor_num_doc: (cond && cond.dni) || '', conductor_licencia: (cond && cond.licencia) || '',
            tuc_tracto: vt.tuc, aut_tracto: vt.aut, tuc_carreta: vc.tuc, aut_carreta: vc.aut,
            registro_mtc: cfg.registro_mtc || '', items,
        };
        return { propuesta, viaje: viaje ? viaje.viaje : null };
    }

    // Lo que falta para poder emitir; cada ítem se corrige en el formulario o en la guía
    function faltanGrt(d) {
        const f = [];
        if (!/^\d{11}$/.test(String(d.remitente_ruc || '')) || !String(d.remitente_razon_social || '').trim()) f.push('RUC y nombre del remitente');
        if (!String(d.destinatario_ruc || '').trim() || !String(d.destinatario_razon_social || '').trim()) f.push('documento y nombre del destinatario');
        if (!/^\d{6}$/.test(String(d.punto_partida_ubigeo || '')) || !String(d.punto_partida_direccion || '').trim()) f.push('punto de partida (distrito y dirección)');
        if (!/^\d{6}$/.test(String(d.punto_llegada_ubigeo || '')) || !String(d.punto_llegada_direccion || '').trim()) f.push('punto de llegada (distrito y dirección)');
        if (!(Number(d.peso_bruto_total) > 0)) f.push('peso');
        if (!String(d.placa_tracto || '').trim()) f.push('placa del tracto');
        if (!String(d.conductor_nombre || '').trim() || !String(d.conductor_apellidos || '').trim()) f.push('nombres y apellidos del conductor');
        if (!/^\d{8}$/.test(String(d.conductor_num_doc || '').trim())) f.push('DNI del conductor (8 dígitos)');
        if (!String(d.conductor_licencia || '').trim()) f.push('licencia del conductor');
        if (!String(d.registro_mtc || '').trim()) f.push('registro MTC de la empresa');
        return f;
    }

    async function guiaParaGrt(p, id) {
        const [g] = await p.query(`SELECT * FROM gre_guias WHERE id = ?`, [id]);
        if (!g.length) throw aviso('Guía no encontrada.', 404);
        if (g[0].origen !== 'RECIBIDA' || g[0].tipo !== 'REMITENTE') throw aviso('La GRE Transportista se emite a partir de una guía de remitente recibida del cliente.', 409);
        if (g[0].estado === 'ANULADA') throw aviso('La guía está anulada.', 409);
        if (!g[0].orden_servicio_codigo) throw aviso('Vincula primero la guía a un servicio.', 409);
        return g[0];
    }

    async function grtExistente(p, guiaId) {
        const [r] = await p.query(`SELECT id, numero_completo, serie, numero, estado, apisunat_document_id, apisunat_status, apisunat_faults, pdf_url, modo_emision FROM gre_guias
                                   WHERE (guia_relacionada_id = ? OR FIND_IN_SET(?, guias_relacionadas_ids)) AND tipo = 'TRANSPORTISTA' AND origen = 'EMITIDA' AND estado <> 'ANULADA' ORDER BY id DESC LIMIT 1`, [guiaId, guiaId]);
        return r[0] || null;
    }

    // Ítems de una guía de remitente, en el formato de la GRE Transportista
    function itemsDeGuia(gu) {
        let items = [];
        try { items = JSON.parse(gu.items_json || '[]'); } catch (e) { items = []; }
        return (items.length ? items : [{ descripcion: gu.descripcion || 'CARGA GENERAL', cantidad: 1, unidad: 'NIU' }]).map(it => ({
            codigo: '', descripcion: String(it.descripcion || 'CARGA GENERAL').slice(0, 250), cantidad: Number(it.cantidad) || 1, unidad_medida: unidadSunat(it.unidad),
        }));
    }

    // Guías de remitente del mismo viaje que se pueden incluir en la misma GRE Transportista: una GRE Transportista tiene un solo remitente,
    // un solo destinatario y un solo punto de partida y de llegada, así que solo se agrupan las que coinciden.
    async function candidatasGrt(p, base, viaje) {
        let filas = [];
        if (viaje) {
            const [r] = await p.query(
                `SELECT g.id, g.numero_completo, g.emisor_ruc, g.peso_kg, g.descripcion, g.items_json, g.remitente_ruc, g.destinatario_doc, g.partida_ubigeo, g.llegada_ubigeo, g.orden_servicio_codigo
                 FROM gre_guias g JOIN operaciones_ordenes_viaje_rutas r ON r.orden COLLATE utf8mb4_unicode_ci = g.orden_servicio_codigo COLLATE utf8mb4_unicode_ci
                 WHERE r.viaje COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci AND g.origen = 'RECIBIDA' AND g.tipo = 'REMITENTE' AND g.estado <> 'ANULADA'
                   AND NOT EXISTS (SELECT 1 FROM gre_guias t WHERE t.origen = 'EMITIDA' AND t.tipo = 'TRANSPORTISTA' AND t.estado <> 'ANULADA' AND t.apisunat_document_id IS NOT NULL
                                   AND (t.guia_relacionada_id = g.id OR FIND_IN_SET(g.id, t.guias_relacionadas_ids)))
                 GROUP BY g.id ORDER BY g.id`, [viaje]);
            filas = r;
        }
        if (!filas.some(f => f.id === base.id)) filas.unshift(base);
        return filas.map(f => {
            let motivo = '';
            if (f.id !== base.id) {
                if (String(f.remitente_ruc || '') !== String(base.remitente_ruc || '')) motivo = 'tiene otro remitente';
                else if (String(f.destinatario_doc || '') !== String(base.destinatario_doc || '')) motivo = 'tiene otro destinatario';
                else if (String(f.partida_ubigeo || '') !== String(base.partida_ubigeo || '')) motivo = 'parte de otro lugar';
                else if (String(f.llegada_ubigeo || '') !== String(base.llegada_ubigeo || '')) motivo = 'llega a otro lugar';
            }
            return { id: f.id, numero_completo: f.numero_completo, emisor_ruc: f.emisor_ruc, peso_kg: Number(f.peso_kg) || 0, descripcion: f.descripcion, items_json: f.items_json,
                servicio: f.orden_servicio_codigo, base: f.id === base.id, compatible: !motivo, motivo };
        });
    }

    // En modo prueba, APISUNAT debe confirmar que la cuenta NO es de producción; si es de producción (o no responde) no se envía nada
    async function verificarPrueba(cfg) {
        if (cfg.modo !== 'prueba') return;
        const r = await Apisunat.lastDocument({ personaId: cfg.persona_id, personaToken: cfg.persona_token, type: '31', serie: cfg.serie_grt, base: cfg.base_url });
        if (!r.ok) throw aviso(`No se pudo comprobar la cuenta de pruebas en APISUNAT: ${String(typeof r.error === 'object' ? JSON.stringify(r.error) : r.error).slice(0, 200)}`, 422);
        if (r.production !== false) throw aviso('Esta cuenta de APISUNAT es de PRODUCCIÓN, no de pruebas: no se envía nada. Usa una cuenta de pruebas o cambia el ambiente a Producción a propósito.', 409);
    }

    // Configuración de APISUNAT de la empresa (sin token): modo, si está lista y por qué no
    router.get('/apisunat/estado', async (req, res) => {
        try { res.json({ ok: true, ...Apisunat.resumenConfig(await Apisunat.getConfigEmpresa(getDb(req))) }); } catch (err) { responder(res, err, 'apisunat-estado'); }
    });

    // Probar la conexión: consulta a APISUNAT el último número de la serie de transportista (no emite nada)
    router.post('/apisunat/probar', async (req, res) => {
        try {
            const cfg = await Apisunat.getConfigEmpresa(getDb(req));
            if (cfg.bloqueo) throw aviso(cfg.bloqueo, 409);
            await verificarPrueba(cfg);
            const r = await Apisunat.lastDocument({ personaId: cfg.persona_id, personaToken: cfg.persona_token, type: '31', serie: cfg.serie_grt, base: cfg.base_url });
            if (!r.ok) throw aviso(`APISUNAT respondió: ${String(typeof r.error === 'object' ? JSON.stringify(r.error) : r.error).slice(0, 200)}`, 422);
            res.json({ ok: true, modo: cfg.modo, produccion: r.production === true, siguiente: r.suggestedNumber, serie: cfg.serie_grt, message: `Conectado con APISUNAT (${cfg.modo === 'produccion' ? 'producción' : 'prueba'}). Siguiente número de ${cfg.serie_grt}: ${r.suggestedNumber}.` });
        } catch (err) { responder(res, err, 'apisunat-probar'); }
    });

    router.get('/guias/:id/grt', async (req, res) => {
        try {
            const p = P(req);
            const cfg = await Apisunat.getConfigEmpresa(getDb(req));
            const g = await guiaParaGrt(p, req.params.id);
            const { propuesta, viaje } = await propuestaGrt(p, g, cfg);
            res.json({
                ok: true, viaje, propuesta, faltan: faltanGrt(propuesta), existente: await grtExistente(p, g.id),
                guias: (await candidatasGrt(p, g, viaje)).map(c => ({ id: c.id, numero_completo: c.numero_completo, peso_kg: c.peso_kg, descripcion: c.descripcion, servicio: c.servicio, base: c.base, compatible: c.compatible, motivo: c.motivo })),
                ambiente: { modo: cfg.modo, lista: !cfg.bloqueo, motivo: cfg.bloqueo },
                guia_trae_transporte: !!g.trae_transporte,
            });
        } catch (err) { responder(res, err, 'grt-propuesta'); }
    });

    router.post('/guias/:id/grt', async (req, res) => {
        try {
            const p = P(req);
            const cfg = await Apisunat.getConfigEmpresa(getDb(req));
            if (cfg.bloqueo) throw aviso(cfg.bloqueo, 409);
            const g = await guiaParaGrt(p, req.params.id);
            const b = req.body || {};
            const base = (await propuestaGrt(p, g, cfg));
            const bp = base.propuesta;
            const d = {
                ...bp,
                fecha_traslado: fechaOpc(b.fecha_traslado) || bp.fecha_traslado,
                placa_tracto: String(b.placa_tracto ?? bp.placa_tracto).toUpperCase().replace(/[^A-Z0-9]/g, ''),
                placa_carreta: String(b.placa_carreta ?? bp.placa_carreta).toUpperCase().replace(/[^A-Z0-9]/g, ''),
                conductor_nombre: String(b.conductor_nombre ?? bp.conductor_nombre).trim(),
                conductor_apellidos: String(b.conductor_apellidos ?? bp.conductor_apellidos).trim(),
                conductor_num_doc: String(b.conductor_num_doc ?? bp.conductor_num_doc).replace(/\D/g, ''),
                conductor_licencia: String(b.conductor_licencia ?? bp.conductor_licencia).trim().toUpperCase(),
                registro_mtc: String(b.registro_mtc ?? bp.registro_mtc).trim().toUpperCase(),
                tuc_tracto: String(b.tuc_tracto ?? bp.tuc_tracto).trim().toUpperCase(),
                aut_tracto: String(b.aut_tracto ?? bp.aut_tracto).trim(),
                tuc_carreta: String(b.tuc_carreta ?? bp.tuc_carreta).trim().toUpperCase(),
                aut_carreta: String(b.aut_carreta ?? bp.aut_carreta).trim(),
            };
            // Guías de remitente que cubre esta GRE Transportista (por defecto solo la elegida): su peso y sus ítems se suman
            const cand = await candidatasGrt(p, g, base.viaje);
            const ids = new Set([g.id, ...(Array.isArray(b.guias_ids) ? b.guias_ids.map(Number).filter(Number.isInteger) : [])]);
            const elegidas = cand.filter(c => ids.has(c.id));
            if (elegidas.length !== ids.size) throw aviso('Alguna de las guías elegidas no pertenece a este viaje o ya tiene GRE Transportista.', 409);
            const noJuntas = elegidas.find(c => !c.compatible);
            if (noJuntas) throw aviso(`La guía ${noJuntas.numero_completo} no se puede agrupar con las demás: ${noJuntas.motivo}.`, 422);
            d.peso_bruto_total = Math.round(elegidas.reduce((s, c) => s + c.peso_kg, 0) * 1000) / 1000;
            d.items = elegidas.flatMap(c => itemsDeGuia(c)).map((it, i) => ({ ...it, codigo: String(i + 1).padStart(3, '0') }));

            const faltan = faltanGrt(d);
            if (faltan.length) throw aviso(`Faltan datos para emitir: ${faltan.join(', ')}.`, 422);
            if (d.fecha_traslado < hoyLima()) throw aviso('La fecha de inicio del traslado no puede ser anterior a la fecha de emisión (hoy). Corrígela.', 422);
            await verificarPrueba(cfg);

            const existente = await grtExistente(p, g.id);
            if (existente && existente.apisunat_document_id) throw aviso(`Esta guía ya tiene la GRE Transportista ${existente.numero_completo} (${existente.apisunat_status || existente.estado}).`, 409);

            // Numeración: la serie sale de la configuración de la empresa; el número, el mayor entre lo local y lo que dice APISUNAT
            let serie; let numero;
            if (existente) { serie = existente.serie; numero = existente.numero; }
            else {
                serie = cfg.serie_grt;
                const [u] = await p.query(`SELECT COALESCE(MAX(CAST(numero AS UNSIGNED)), 0) AS ultimo FROM gre_guias WHERE tipo = 'TRANSPORTISTA' AND origen = 'EMITIDA' AND serie = ?`, [serie]);
                let correlativo = (Number(u[0].ultimo) || 0) + 1;
                try {
                    const ap = await Apisunat.lastDocument({ personaId: cfg.persona_id, personaToken: cfg.persona_token, type: '31', serie, base: cfg.base_url });
                    if (ap.ok && ap.suggestedNumber) correlativo = Math.max(correlativo, parseInt(ap.suggestedNumber, 10) || 0);
                } catch (e) { /* si APISUNAT no responde se usa el número local */ }
                numero = String(correlativo).padStart(8, '0');
            }
            const numeroCompleto = `${serie}-${numero}`;
            const fila = {
                origen: 'EMITIDA', tipo: 'TRANSPORTISTA', serie, numero, numero_completo: numeroCompleto, emisor_ruc: cfg.ruc_emisor,
                fecha_emision: hoyLima(), fecha_traslado: d.fecha_traslado,
                remitente_ruc: d.remitente_ruc, remitente_nombre: texto(d.remitente_razon_social, 200), destinatario_doc: digitos(d.destinatario_ruc, 15), destinatario_nombre: texto(d.destinatario_razon_social, 200),
                transportista_ruc: cfg.ruc_emisor, transportista_nombre: texto(cfg.razon_social, 200), modalidad: 'PUBLICO', motivo: texto(d.descripcion_motivo, 80),
                partida_ubigeo: d.punto_partida_ubigeo, partida_direccion: texto(d.punto_partida_direccion, 255), llegada_ubigeo: d.punto_llegada_ubigeo, llegada_direccion: texto(d.punto_llegada_direccion, 255),
                peso_kg: d.peso_bruto_total, descripcion: texto(elegidas.map(c => c.descripcion).filter(Boolean).join('; ') || g.descripcion, 500), items_json: JSON.stringify(d.items),
                placa: d.placa_tracto, placa_carreta: d.placa_carreta || null, conductor_nombre: texto(`${d.conductor_nombre} ${d.conductor_apellidos}`.trim(), 150), conductor_doc: d.conductor_num_doc, licencia: texto(d.conductor_licencia, 30),
                trae_transporte: 0, orden_servicio_id: g.orden_servicio_id, orden_servicio_codigo: g.orden_servicio_codigo, estado: 'VINCULADA', fuente: 'MANUAL',
                usuario: usuarioDe(req), viaje: base.viaje || null, guia_relacionada_id: g.id, guias_relacionadas_ids: elegidas.map(c => c.id).join(','), modo_emision: cfg.modo,
            };
            let id;
            if (existente) {
                const cols = Object.keys(fila);
                await p.query(`UPDATE gre_guias SET ${cols.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...cols.map(k => fila[k]), existente.id]);
                id = existente.id;
            } else {
                const cols = Object.keys(fila);
                const [ins] = await p.query(`INSERT INTO gre_guias (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map(k => fila[k]));
                id = ins.insertId;
            }

            const body = Apisunat.buildGrtUbl({
                ...d, serie, numero, fecha_emision: fila.fecha_emision, hora_emision: horaLima(),
                gre_relacionadas: elegidas.map(c => ({ numero: c.numero_completo, ruc: c.emisor_ruc || d.remitente_ruc, tipo: '09' })),
            }, { ruc: cfg.ruc_emisor, razon_social: cfg.razon_social });
            const fileName = `${cfg.ruc_emisor}-31-${serie}-${numero}`;
            const r = await Apisunat.sendBill({ personaId: cfg.persona_id, personaToken: cfg.persona_token, fileName, documentBody: body, base: cfg.base_url });
            if (r.ok) {
                await p.query(`UPDATE gre_guias SET apisunat_document_id = ?, apisunat_status = 'PENDIENTE', apisunat_faults = NULL, datos_json = ?, pdf_url = ? WHERE id = ?`,
                    [r.documentId, JSON.stringify(body), Apisunat.getPdfUrl(r.documentId, fileName, 'A4', cfg.base_url), id]);
                // El TUC usado se guarda en la ficha de la placa si todavía no tenía uno
                for (const [pl, tuc] of [[d.placa_tracto, d.tuc_tracto], [d.placa_carreta, d.tuc_carreta]]) {
                    if (pl && tuc) await p.query(`UPDATE placas SET tuc = ? WHERE REPLACE(REPLACE(UPPER(placa), '-', ''), ' ', '') = ? AND (tuc IS NULL OR tuc = '')`, [tuc, normPlaca(pl)]).catch(() => {});
                }
                if (logAudit) logAudit({ req, accion: 'EMITIR_GRT', modulo: 'OPERACIONES', detalle: `GRE Transportista ${numeroCompleto} (${cfg.modo}) para la guía ${g.numero_completo}` });
                return res.json({ ok: true, id, numero_guia: numeroCompleto, message: `GRE Transportista ${numeroCompleto} enviada a APISUNAT (${cfg.modo === 'produccion' ? 'producción' : 'prueba'}).` });
            }
            const error = typeof r.error === 'object' ? JSON.stringify(r.error) : String(r.error || 'Error desconocido');
            await p.query(`UPDATE gre_guias SET apisunat_status = 'ERROR_APISUNAT', apisunat_faults = ?, datos_json = ? WHERE id = ?`, [error.slice(0, 2000), JSON.stringify(body), id]);
            throw aviso(`APISUNAT no aceptó la guía: ${error.slice(0, 300)}`, 422);
        } catch (err) { responder(res, err, 'grt-emitir'); }
    });

    // Consultar a APISUNAT cómo va una guía emitida (aceptada, rechazada, pendiente) y guardar sus enlaces
    router.post('/guias/:id/sincronizar', async (req, res) => {
        try {
            const p = P(req);
            const cfg = await Apisunat.getConfigEmpresa(getDb(req));
            const [r] = await p.query(`SELECT id, numero_completo, serie, numero, emisor_ruc, apisunat_document_id FROM gre_guias WHERE id = ? AND origen = 'EMITIDA'`, [req.params.id]);
            if (!r.length) throw aviso('Guía emitida no encontrada.', 404);
            if (!r[0].apisunat_document_id) throw aviso('Esta guía aún no se envió a APISUNAT.', 409);
            const x = await Apisunat.getById(r[0].apisunat_document_id, cfg.base_url);
            if (!x.ok) throw aviso(`APISUNAT respondió: ${String(x.error).slice(0, 200)}`, 422);
            const fileName = `${r[0].emisor_ruc}-31-${r[0].serie}-${r[0].numero}`;
            await p.query(`UPDATE gre_guias SET apisunat_status = ?, xml_url = ?, cdr_url = ?, apisunat_faults = ?, pdf_url = ? WHERE id = ?`,
                [x.status || null, x.xml || null, x.cdr || null, x.faults && x.faults.length ? JSON.stringify(x.faults).slice(0, 2000) : null, Apisunat.getPdfUrl(r[0].apisunat_document_id, fileName, 'A4', cfg.base_url), r[0].id]);
            res.json({ ok: true, apisunat_status: x.status, message: `${r[0].numero_completo}: ${x.status || 'sin estado'}` });
        } catch (err) { responder(res, err, 'grt-sincronizar'); }
    });

    router.rucValido = rucValido;
    return router;
};
