const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadToS3, deleteFromS3, s3KeyFromUrl, getPresignedUrl } = require('../utils/s3');
const { hoyLima } = require('../services/horaLima');

// Configuración de almacenamiento de archivos y fotos para RRHH
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, '../public/uploads/rrhh');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'rrhh-' + uniqueSuffix + ext);
    }
});
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });
// Documentos del personal: se suben a S3, así que el archivo llega en memoria
const subirDocumento = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const TIPOS_DOCUMENTO = ['DNI', 'LICENCIA', 'ANTECEDENTES', 'EMO', 'SCTR', 'CONTRATO', 'OTRO'];
const MIME_PERMITIDOS = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i;

module.exports = function (db, broadcast, logAudit) {
    const router = express.Router();

    // Helper para obtener la base de datos del request (Multi-tenant)
    function getDb(req) {
        const d = (req && req.db) ? req.db : db;
        if (!d) return null;
        return (typeof d.promise === 'function') ? d.promise() : d;
    }

    // ── Middleware de Auditoría Automática para RRHH ────────────────
    router.use((req, res, next) => {
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
            const originalJson = res.json.bind(res);
            res.json = function (data) {
                if (data && (data.ok === true || data.data === 'Éxito' || data.success || data.id || res.statusCode < 400)) {
                    if (typeof logAudit === 'function') {
                        const accion = req.method === 'POST' ? 'CREÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'MODIFICÓ';
                        let desc = `Operación de ${accion.toLowerCase()} en RRHH (${req.path})`;
                        if (req.body) {
                            if (req.body.nombres || req.body.apellidos) desc = `${accion} colaborador: ${(req.body.nombres || '')} ${(req.body.apellidos || '')}`.trim();
                            else if (req.params.id) desc = `${accion} registro RRHH ID: ${req.params.id}`;
                        }
                        logAudit(req, 'RRHH', 'Personal', accion, desc);
                    }
                }
                return originalJson(data);
            };
        }
        next();
    });

// ═════════════════════════════════════════════════════════════════════
// 1. GESTIÓN DE PERSONAL / LEGAJOS DIGITALES
// ═════════════════════════════════════════════════════════════════════

// Listar Personal con filtros y semáforos de vencimiento
router.get('/personal', async (req, res) => {
    try {
        const tdb = getDb(req);
        const { busqueda, rol, area, estado, orden } = req.query;

        let sql = `SELECT * FROM rrhh_personal WHERE 1=1`;
        const params = [];

        if (busqueda && busqueda.trim()) {
            sql += ` AND (nombres LIKE ? OR apellidos LIKE ? OR numero_documento LIKE ? OR cargo LIKE ?)`;
            const b = `%${busqueda.trim()}%`;
            params.push(b, b, b, b);
        }
        if (rol && rol.trim() && rol !== 'TODOS') {
            sql += ` AND categoria_rol = ?`;
            params.push(rol.trim());
        }
        if (area && area.trim() && area !== 'TODOS') {
            sql += ` AND area = ?`;
            params.push(area.trim());
        }
        if (estado && estado.trim() && estado !== 'TODOS') {
            sql += ` AND estado = ?`;
            params.push(estado.trim());
        }

        sql += ` ORDER BY estado ASC, apellidos ASC, nombres ASC`;
        const [rows] = await tdb.query(sql, params);

        res.json({ ok: true, data: rows });
    } catch (err) {
        console.error('Error al listar personal:', err);
        res.status(500).json({ error: err.message });
    }
});

// KPIs y Resumen Ejecutivo de RRHH
router.get('/kpis', async (req, res) => {
    try {
        const tdb = getDb(req);

        const [cntRows] = await tdb.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN estado = 'ACTIVO' THEN 1 ELSE 0 END) as activos,
                SUM(CASE WHEN categoria_rol = 'CONDUCTOR' AND estado = 'ACTIVO' THEN 1 ELSE 0 END) as conductores,
                SUM(CASE WHEN categoria_rol = 'MECANICO_TALLER' AND estado = 'ACTIVO' THEN 1 ELSE 0 END) as taller,
                SUM(CASE WHEN categoria_rol = 'ADMINISTRATIVO' AND estado = 'ACTIVO' THEN 1 ELSE 0 END) as admin,
                SUM(CASE WHEN categoria_rol = 'LIMPIEZA_SERVICIOS' AND estado = 'ACTIVO' THEN 1 ELSE 0 END) as limpieza,
                SUM(CASE WHEN fecha_fin_contrato IS NOT NULL AND fecha_fin_contrato BETWEEN DATE(UTC_TIMESTAMP() - INTERVAL 5 HOUR) AND DATE_ADD(DATE(UTC_TIMESTAMP() - INTERVAL 5 HOUR), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as contratos_por_vencer,
                SUM(CASE WHEN licencia_vencimiento IS NOT NULL AND licencia_vencimiento BETWEEN DATE(UTC_TIMESTAMP() - INTERVAL 5 HOUR) AND DATE_ADD(DATE(UTC_TIMESTAMP() - INTERVAL 5 HOUR), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as brevetes_por_vencer,
                SUM(CASE WHEN sctr_salud_vigente = 0 OR sctr_pension_vigente = 0 THEN 1 ELSE 0 END) as sctr_alertas
            FROM rrhh_personal
        `);

        // Consultar conductores actualmente en viaje
        let enRuta = 0;
        try {
            const [viajeRows] = await tdb.query(`
                SELECT COUNT(DISTINCT conductor) as en_ruta 
                FROM operaciones_ordenes_viaje 
                WHERE estado IN ('EN CURSO', 'TRANSITO', 'INICIADO')
            `);
            enRuta = viajeRows[0]?.en_ruta || 0;
        } catch(e) {}

        const kpis = cntRows[0] || {};
        kpis.conductores_en_ruta = enRuta;

        res.json({ ok: true, data: kpis });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener detalle 360° de un colaborador
router.get('/personal/:id', async (req, res) => {
    try {
        const tdb = getDb(req);
        const [rows] = await tdb.query('SELECT * FROM rrhh_personal WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Colaborador no encontrado' });

        const [licencias] = await tdb.query('SELECT * FROM rrhh_licencias WHERE personal_id = ? ORDER BY fecha_inicio DESC LIMIT 15', [req.params.id]);
        const [sst] = await tdb.query('SELECT * FROM rrhh_sst_registros WHERE personal_id = ? ORDER BY fecha_registro DESC LIMIT 15', [req.params.id]);

        res.json({ ok: true, data: rows[0], licencias, sst });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Guardar nuevo colaborador
// El personal que es conductor también debe existir en la tabla de conductores (Operaciones: viajes, vales, papeletas y el portal
// se apoyan en ella). Se enlaza por DNI y se mantiene al día cada vez que se guarda la persona en RRHH.
/** Régimen laboral y segunda categoría de la licencia. Se guardan aparte: si la empresa aún no tiene esas columnas, se omiten sin romper el guardado. */
async function guardarExtrasPersonal(tdb, id, b) {
    try {
        await tdb.query('UPDATE rrhh_personal SET regimen_laboral = ?, licencia_categoria_2 = ? WHERE id = ?', [b.regimen_laboral || null, b.licencia_categoria_2 || null, id]);
    } catch (e) { if (e && e.code !== 'ER_BAD_FIELD_ERROR') console.warn('rrhh: extras del personal:', e.message); }
}

async function sincronizarConductor(tdb, id) {
    try {
        const [filas] = await tdb.query('SELECT * FROM rrhh_personal WHERE id = ?', [id]);
        const p = filas && filas[0];
        if (!p || p.categoria_rol !== 'CONDUCTOR') return;
        const dni = String(p.numero_documento || '').trim();
        if (!dni) return;
        const nombre = `${p.nombres} ${p.apellidos}`.replace(/\s+/g, ' ').trim().slice(0, 100);
        const estado = p.estado === 'CESADO' ? 'Cesado' : p.estado === 'SUSPENDIDO' ? 'Bloqueado' : 'Activo';
        const tel = String(p.telefono || '').trim().slice(0, 20);
        const lic = String(p.licencia_conducir || '').trim().slice(0, 50);
        const banco = p.banco_haberes ? String(p.banco_haberes).slice(0, 50) : null;
        const cuenta = p.cuenta_haberes ? String(p.cuenta_haberes).slice(0, 50) : null;
        const [ex] = await tdb.query('SELECT idConductor FROM conductores WHERE TRIM(dni) = ? LIMIT 1', [dni]);
        if (ex && ex.length) {
            await tdb.query('UPDATE conductores SET nombre = ?, telefono = ?, licencia = ?, estado = ?, banco = COALESCE(?, banco), numero_cuenta = COALESCE(?, numero_cuenta) WHERE idConductor = ?',
                [nombre, tel, lic, estado, banco, cuenta, ex[0].idConductor]);
        } else {
            await tdb.query('INSERT INTO conductores (nombre, empresa, telefono, dni, licencia, estado, banco, numero_cuenta) VALUES (?, \'\', ?, ?, ?, ?, ?, ?)',
                [nombre, tel, dni, lic, estado, banco, cuenta]);
        }
    } catch (e) { console.warn('rrhh: no se pudo sincronizar el conductor:', e.message); }
}

// Directorio: solo datos de contacto (sin sueldos, cuentas ni datos de salud). Lo ve quien consulta el directorio aunque no tenga RRHH.
router.get('/directorio', async (req, res) => {
    try {
        const tdb = getDb(req);
        const [rows] = await tdb.query(`SELECT id, tipo_documento, numero_documento, nombres, apellidos, categoria_rol, cargo, area, sede, telefono, email, estado, foto_url
            FROM rrhh_personal ORDER BY apellidos, nombres`);
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/personal', upload.single('foto'), async (req, res) => {
    try {
        const tdb = getDb(req);
        const b = req.body || {};

        if (!b.numero_documento || !b.nombres || !b.apellidos || !b.cargo) {
            return res.status(400).json({ error: 'Nombres, Apellidos, DNI/Documento y Cargo son obligatorios.' });
        }

        let foto_url = null;
        if (req.file) {
            foto_url = `/uploads/rrhh/${req.file.filename}`;
        } else if (b.foto_url) {
            foto_url = b.foto_url;
        }

        const query = `
            INSERT INTO rrhh_personal (
                tipo_documento, numero_documento, nombres, apellidos, sexo, fecha_nacimiento,
                nacionalidad, estado_civil, direccion, distrito, provincia, departamento,
                telefono, email, contacto_emergencia_nombre, contacto_emergencia_parentesco,
                contacto_emergencia_telefono, categoria_rol, cargo, area, sede,
                jefe_inmediato, fecha_ingreso, fecha_cese, estado,
                tipo_contrato, fecha_inicio_contrato, fecha_fin_contrato, regimen_pensionario,
                tipo_comision_afp, cuspp, tiene_asignacion_familiar, sueldo_basico, bono_fijo,
                banco_haberes, cuenta_haberes, cci_haberes, banco_cts, cuenta_cts,
                licencia_conducir, licencia_categoria, licencia_vencimiento, sctr_salud_vigente,
                sctr_pension_vigente, emo_fecha_vencimiento, emo_condicion, grupo_sanguineo,
                talla_polo, talla_pantalon, talla_calzado, talla_chaleco, foto_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            b.tipo_documento || 'DNI',
            b.numero_documento.trim(),
            b.nombres.trim(),
            b.apellidos.trim(),
            b.sexo || 'M',
            b.fecha_nacimiento || null,
            b.nacionalidad || 'PERUANA',
            b.estado_civil || 'SOLTERO(A)',
            b.direccion || null,
            b.distrito || null,
            b.provincia || null,
            b.departamento || null,
            b.telefono || null,
            b.email || null,
            b.contacto_emergencia_nombre || null,
            b.contacto_emergencia_parentesco || null,
            b.contacto_emergencia_telefono || null,
            b.categoria_rol || 'ADMINISTRATIVO',
            b.cargo.trim(),
            b.area || 'OPERACIONES',
            b.sede || 'BASE PRINCIPAL',
            b.jefe_inmediato || null,
            b.fecha_ingreso || hoyLima(),
            b.fecha_cese || null,
            b.estado || 'ACTIVO',
            b.tipo_contrato || 'PLAZO_FIJO',
            b.fecha_inicio_contrato || null,
            b.fecha_fin_contrato || null,
            b.regimen_pensionario || 'ONP',
            b.tipo_comision_afp || 'FLUJO',
            b.cuspp || null,
            b.tiene_asignacion_familiar === '1' || b.tiene_asignacion_familiar === true ? 1 : 0,
            parseFloat(b.sueldo_basico || 0),
            parseFloat(b.bono_fijo || 0),
            b.banco_haberes || null,
            b.cuenta_haberes || null,
            b.cci_haberes || null,
            b.banco_cts || null,
            b.cuenta_cts || null,
            b.licencia_conducir || null,
            b.licencia_categoria || null,
            b.licencia_vencimiento || null,
            b.sctr_salud_vigente === '0' || b.sctr_salud_vigente === false ? 0 : 1,
            b.sctr_pension_vigente === '0' || b.sctr_pension_vigente === false ? 0 : 1,
            b.emo_fecha_vencimiento || null,
            b.emo_condicion || 'APTO',
            b.grupo_sanguineo || null,
            b.talla_polo || null,
            b.talla_pantalon || null,
            b.talla_calzado || null,
            b.talla_chaleco || null,
            foto_url
        ];

        const [resIns] = await tdb.query(query, params);
        await guardarExtrasPersonal(tdb, resIns.insertId, b);
        await sincronizarConductor(tdb, resIns.insertId);
        res.json({ ok: true, id: resIns.insertId, message: 'Colaborador registrado con éxito' });
    } catch (err) {
        console.error('Error al registrar personal:', err);
        res.status(500).json({ error: err.message });
    }
});

// Actualizar colaborador
router.put('/personal/:id', upload.single('foto'), async (req, res) => {
    try {
        const tdb = getDb(req);
        const b = req.body || {};
        const id = req.params.id;

        let fotoClause = '';
        const params = [
            b.tipo_documento || 'DNI',
            b.numero_documento?.trim(),
            b.nombres?.trim(),
            b.apellidos?.trim(),
            b.sexo || 'M',
            b.fecha_nacimiento || null,
            b.nacionalidad || 'PERUANA',
            b.estado_civil || 'SOLTERO(A)',
            b.direccion || null,
            b.distrito || null,
            b.provincia || null,
            b.departamento || null,
            b.telefono || null,
            b.email || null,
            b.contacto_emergencia_nombre || null,
            b.contacto_emergencia_parentesco || null,
            b.contacto_emergencia_telefono || null,
            b.categoria_rol || 'ADMINISTRATIVO',
            b.cargo?.trim(),
            b.area || 'OPERACIONES',
            b.sede || 'BASE PRINCIPAL',
            b.jefe_inmediato || null,
            b.fecha_ingreso || null,
            b.fecha_cese || null,
            b.motivo_cese || null,
            b.estado || 'ACTIVO',
            b.tipo_contrato || 'PLAZO_FIJO',
            b.fecha_inicio_contrato || null,
            b.fecha_fin_contrato || null,
            b.regimen_pensionario || 'ONP',
            b.tipo_comision_afp || 'FLUJO',
            b.cuspp || null,
            b.tiene_asignacion_familiar === '1' || b.tiene_asignacion_familiar === true ? 1 : 0,
            parseFloat(b.sueldo_basico || 0),
            parseFloat(b.bono_fijo || 0),
            b.banco_haberes || null,
            b.cuenta_haberes || null,
            b.cci_haberes || null,
            b.banco_cts || null,
            b.cuenta_cts || null,
            b.licencia_conducir || null,
            b.licencia_categoria || null,
            b.licencia_vencimiento || null,
            b.sctr_salud_vigente === '0' || b.sctr_salud_vigente === false ? 0 : 1,
            b.sctr_pension_vigente === '0' || b.sctr_pension_vigente === false ? 0 : 1,
            b.emo_fecha_vencimiento || null,
            b.emo_condicion || 'APTO',
            b.grupo_sanguineo || null,
            b.talla_polo || null,
            b.talla_pantalon || null,
            b.talla_calzado || null,
            b.talla_chaleco || null
        ];

        if (req.file) {
            fotoClause = ', foto_url = ?';
            params.push(`/uploads/rrhh/${req.file.filename}`);
        } else if (b.foto_url) {
            fotoClause = ', foto_url = ?';
            params.push(b.foto_url);
        }

        params.push(id);

        await tdb.query(`
            UPDATE rrhh_personal SET
                tipo_documento = ?, numero_documento = ?, nombres = ?, apellidos = ?, sexo = ?, fecha_nacimiento = ?,
                nacionalidad = ?, estado_civil = ?, direccion = ?, distrito = ?, provincia = ?, departamento = ?,
                telefono = ?, email = ?, contacto_emergencia_nombre = ?, contacto_emergencia_parentesco = ?,
                contacto_emergencia_telefono = ?, categoria_rol = ?, cargo = ?, area = ?, sede = ?,
                jefe_inmediato = ?, fecha_ingreso = ?, fecha_cese = ?, motivo_cese = ?, estado = ?,
                tipo_contrato = ?, fecha_inicio_contrato = ?, fecha_fin_contrato = ?, regimen_pensionario = ?,
                tipo_comision_afp = ?, cuspp = ?, tiene_asignacion_familiar = ?, sueldo_basico = ?, bono_fijo = ?,
                banco_haberes = ?, cuenta_haberes = ?, cci_haberes = ?, banco_cts = ?, cuenta_cts = ?,
                licencia_conducir = ?, licencia_categoria = ?, licencia_vencimiento = ?, sctr_salud_vigente = ?,
                sctr_pension_vigente = ?, emo_fecha_vencimiento = ?, emo_condicion = ?, grupo_sanguineo = ?,
                talla_polo = ?, talla_pantalon = ?, talla_calzado = ?, talla_chaleco = ?
                ${fotoClause}
            WHERE id = ?
        `, params);

        await guardarExtrasPersonal(tdb, id, b);
        await sincronizarConductor(tdb, id);
        res.json({ ok: true, message: 'Colaborador actualizado con éxito' });
    } catch (err) {
        console.error('Error al actualizar personal:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═════════════════════════════════════════════════════════════════════
// DOCUMENTOS DEL PERSONAL (DNI, licencia, antecedentes, EMO, SCTR, contrato…)
// ═════════════════════════════════════════════════════════════════════
const fechaODoc = v => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);

// Todos los documentos (sin archivo): alimenta el tablero de vencimientos
router.get('/documentos', async (req, res) => {
    try {
        const tdb = getDb(req);
        const [rows] = await tdb.query(`SELECT id, personal_id, CASE tipo WHEN 'DNI_A' THEN 'DNI' WHEN 'DNI_B' THEN 'OTRO' ELSE tipo END AS tipo, descripcion, nombre_archivo, mime,
            DATE_FORMAT(fecha_emision, '%Y-%m-%d') AS fecha_emision, DATE_FORMAT(fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento
            FROM rrhh_personal_documentos d
            WHERE d.tipo = 'OTRO' OR d.id = (SELECT MAX(x.id) FROM rrhh_personal_documentos x WHERE x.personal_id = d.personal_id AND x.tipo = d.tipo)`);
        res.json({ ok: true, data: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Documentos de una persona, con el enlace firmado para verlos
router.get('/personal/:id/documentos', async (req, res) => {
    try {
        const tdb = getDb(req);
        const [rows] = await tdb.query(`SELECT id, personal_id, tipo, descripcion, archivo_url, nombre_archivo, mime, subido_por,
            DATE_FORMAT(fecha_emision, '%Y-%m-%d') AS fecha_emision, DATE_FORMAT(fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
            DATE_FORMAT(actualizado_en, '%Y-%m-%d %H:%i') AS actualizado_en
            FROM rrhh_personal_documentos WHERE personal_id = ? ORDER BY tipo, id DESC`, [req.params.id]);
        // El DNI es uno solo: lo cargado antes por caras (DNI_A / DNI_B) se muestra como DNI, y la cara posterior queda como otro documento
        for (const d of rows) {
            if (d.tipo === 'DNI_A') d.tipo = 'DNI';
            else if (d.tipo === 'DNI_B') { d.tipo = 'OTRO'; if (!d.descripcion) d.descripcion = 'DNI · cara posterior'; }
        }
        rows.sort((a, b) => (a.tipo < b.tipo ? -1 : a.tipo > b.tipo ? 1 : b.id - a.id));
        for (const d of rows) {
            try { const key = s3KeyFromUrl(d.archivo_url); d.url = key ? await getPresignedUrl(key, 3600) : d.archivo_url; } catch (e) { d.url = d.archivo_url; }
            delete d.archivo_url;
        }
        res.json({ ok: true, data: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Subir un documento. Al subir otro del mismo tipo, el anterior queda en el historial
router.post('/personal/:id/documentos', subirDocumento.single('archivo'), async (req, res) => {
    try {
        const tdb = getDb(req);
        const b = req.body || {};
        const personaId = Number(req.params.id);
        const tipo = String(b.tipo || '').toUpperCase();
        if (!TIPOS_DOCUMENTO.includes(tipo)) return res.status(400).json({ error: 'Tipo de documento no válido.' });
        // El archivo es opcional (como en los documentos de Flota): sin archivo se registra el documento con sus fechas
        if (req.file && !MIME_PERMITIDOS.test(req.file.mimetype || '')) return res.status(400).json({ error: 'Solo se aceptan fotos (JPG, PNG, WEBP) o PDF.' });
        const [pr] = await tdb.query('SELECT id FROM rrhh_personal WHERE id = ?', [personaId]);
        if (!pr.length) return res.status(404).json({ error: 'La persona no existe.' });

        let url = '', mime = null;
        if (req.file) {
            let ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
            mime = req.file.mimetype;
            if (/^image\/hei[cf]$/i.test(mime)) { mime = 'image/jpeg'; ext = 'jpg'; }
            const key = `rrhh/documentos/${personaId}/${tipo.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
            url = await uploadToS3(req.file.buffer, key, mime);
        }

        const vence = fechaODoc(b.fecha_vencimiento);
        const emision = fechaODoc(b.fecha_emision);
        const quien = (req.user && req.user.nombre) ? req.user.nombre : 'SISTEMA';
        // Cada archivo nuevo se suma al historial: el vigente es el último que se cargó
        const [ins] = await tdb.query(`INSERT INTO rrhh_personal_documentos (personal_id, tipo, descripcion, archivo_url, nombre_archivo, mime, fecha_emision, fecha_vencimiento, subido_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [personaId, tipo, (b.descripcion || '').slice(0, 150) || null, url, req.file ? req.file.originalname.slice(0, 255) : null, mime, emision, vence, quien]);
        const id = ins.insertId;
        // La licencia y el examen médico alimentan los avisos de «por vencer» de la ficha
        if (vence && tipo === 'LICENCIA') await tdb.query('UPDATE rrhh_personal SET licencia_vencimiento = ? WHERE id = ?', [vence, personaId]);
        if (vence && tipo === 'EMO') await tdb.query('UPDATE rrhh_personal SET emo_fecha_vencimiento = ? WHERE id = ?', [vence, personaId]);
        if (logAudit) logAudit({ req, accion: 'SUBIR_DOCUMENTO_PERSONAL', modulo: 'RRHH', detalle: `Documento ${tipo} de la persona #${personaId}` });
        res.json({ ok: true, id });
    } catch (err) {
        console.error('Error al subir documento del personal:', err);
        res.status(500).json({ error: err.message });
    }
});

// Corregir vencimiento o descripción sin cambiar el archivo
router.put('/personal/documentos/:docId', async (req, res) => {
    try {
        const tdb = getDb(req);
        const b = req.body || {};
        const [doc] = await tdb.query('SELECT id, personal_id, tipo FROM rrhh_personal_documentos WHERE id = ?', [req.params.docId]);
        if (!doc.length) return res.status(404).json({ error: 'El documento no existe.' });
        const vence = fechaODoc(b.fecha_vencimiento);
        await tdb.query('UPDATE rrhh_personal_documentos SET fecha_vencimiento = ?, fecha_emision = ?, descripcion = ?, actualizado_en = NOW() WHERE id = ?',
            [vence, fechaODoc(b.fecha_emision), (b.descripcion || '').slice(0, 150) || null, doc[0].id]);
        if (vence && doc[0].tipo === 'LICENCIA') await tdb.query('UPDATE rrhh_personal SET licencia_vencimiento = ? WHERE id = ?', [vence, doc[0].personal_id]);
        if (vence && doc[0].tipo === 'EMO') await tdb.query('UPDATE rrhh_personal SET emo_fecha_vencimiento = ? WHERE id = ?', [vence, doc[0].personal_id]);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/personal/documentos/:docId', async (req, res) => {
    try {
        const tdb = getDb(req);
        const [doc] = await tdb.query('SELECT id, personal_id, tipo, archivo_url FROM rrhh_personal_documentos WHERE id = ?', [req.params.docId]);
        if (!doc.length) return res.status(404).json({ error: 'El documento no existe.' });
        const filas = req.query.todos === '1' && doc[0].tipo !== 'OTRO'
            ? (await tdb.query('SELECT id, archivo_url FROM rrhh_personal_documentos WHERE personal_id = ? AND tipo = ?', [doc[0].personal_id, doc[0].tipo]))[0]
            : doc;
        for (const f of filas) {
            await tdb.query('DELETE FROM rrhh_personal_documentos WHERE id = ?', [f.id]);
            const key = s3KeyFromUrl(f.archivo_url); if (key) deleteFromS3(key).catch(() => {});
        }
        if (logAudit) logAudit({ req, accion: 'ELIMINAR_DOCUMENTO_PERSONAL', modulo: 'RRHH', detalle: `Documento ${doc[0].tipo} de la persona #${doc[0].personal_id}` });
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Eliminar colaborador
router.delete('/personal/:id', async (req, res) => {
    try {
        const tdb = getDb(req);
        await tdb.query('DELETE FROM rrhh_personal WHERE id = ?', [req.params.id]);
        res.json({ ok: true, message: 'Colaborador eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═════════════════════════════════════════════════════════════════════
// 2. MATRIZ DE TAREO & ASISTENCIA DIARIA
// ═════════════════════════════════════════════════════════════════════

// Obtener matriz de asistencia para un mes y año determinado
router.get('/tareo', async (req, res) => {
    try {
        const tdb = getDb(req);
        const anio = parseInt(req.query.anio) || new Date().getFullYear();
        const mes = parseInt(req.query.mes) || (new Date().getMonth() + 1);
        const rol = req.query.rol || 'TODOS';

        // 1. Obtener lista de personal activo en el periodo
        let pSql = `SELECT id, numero_documento, nombres, apellidos, categoria_rol, cargo, area FROM rrhh_personal WHERE estado != 'CESADO'`;
        const pParams = [];
        if (rol !== 'TODOS') {
            pSql += ` AND categoria_rol = ?`;
            pParams.push(rol);
        }
        pSql += ` ORDER BY categoria_rol ASC, apellidos ASC, nombres ASC`;
        const [personal] = await tdb.query(pSql, pParams);

        // 2. Obtener registros de tareo del mes
        const inicioMes = `${anio}-${String(mes).padStart(2, '0')}-01`;
        const ultimoDia = new Date(anio, mes, 0).getDate();
        const finMes = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

        const [tareoRows] = await tdb.query(`
            SELECT personal_id, DATE_FORMAT(fecha, '%Y-%m-%d') as fecha, estado, minutos_tardanza, horas_extras, observacion, orden_viaje_codigo, TIME_FORMAT(hora_entrada, '%H:%i') as hora_entrada, TIME_FORMAT(hora_salida, '%H:%i') as hora_salida
            FROM rrhh_tareo
            WHERE fecha BETWEEN ? AND ?
        `, [inicioMes, finMes]);

        // Mapear tareos por personal_id y fecha
        const mapTareo = {};
        tareoRows.forEach(r => {
            if (!mapTareo[r.personal_id]) mapTareo[r.personal_id] = {};
            mapTareo[r.personal_id][r.fecha] = r;
        });

        res.json({
            ok: true,
            anio,
            mes,
            dias_mes: ultimoDia,
            personal,
            tareo: mapTareo
        });
    } catch (err) {
        console.error('Error al obtener tareo:', err);
        res.status(500).json({ error: err.message });
    }
});

// Guardar / Actualizar celda o lote de tareo
router.post('/tareo/guardar', async (req, res) => {
    try {
        const tdb = getDb(req);
        const b = req.body || {};
        const items = Array.isArray(b.items) ? b.items : [b];

        if (!items.length) return res.status(400).json({ error: 'No se recibieron datos de tareo' });

        for (const item of items) {
            if (!item.personal_id || !item.fecha || !item.estado) continue;
            await tdb.query(`
                INSERT INTO rrhh_tareo (personal_id, fecha, estado, minutos_tardanza, horas_extras, observacion, orden_viaje_codigo, usuario_registro)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    estado = VALUES(estado),
                    minutos_tardanza = VALUES(minutos_tardanza),
                    horas_extras = VALUES(horas_extras),
                    observacion = VALUES(observacion),
                    orden_viaje_codigo = VALUES(orden_viaje_codigo),
                    usuario_registro = VALUES(usuario_registro)
            `, [
                item.personal_id,
                item.fecha,
                item.estado,
                parseInt(item.minutos_tardanza || 0),
                parseFloat(item.horas_extras || 0),
                item.observacion || null,
                item.orden_viaje_codigo || null,
                item.usuario_registro || req.headers['x-user-nombre'] || 'SISTEMA'
            ]);
        }

        res.json({ ok: true, message: 'Tareo actualizado con éxito' });
    } catch (err) {
        console.error('Error al guardar tareo:', err);
        res.status(500).json({ error: err.message });
    }
});

// Sincronizar automáticamente con Órdenes de Viaje (Asignar 'R' a conductores en ruta)
router.post('/tareo/sincronizar-viajes', async (req, res) => {
    try {
        const tdb = getDb(req);
        const fecha = req.body.fecha || hoyLima();

        // Obtener conductores con ordenes de viaje activas en la fecha
        const [viajes] = await tdb.query(`
            SELECT codigo, conductor 
            FROM operaciones_ordenes_viaje 
            WHERE estado IN ('EN CURSO', 'TRANSITO', 'INICIADO')
               OR (fecha_viaje = ? AND estado != 'ANULADO')
        `, [fecha]);

        let actualizados = 0;
        for (const v of viajes) {
            if (!v.conductor) continue;
            // Buscar personal por nombre
            const [pRows] = await tdb.query(`
                SELECT id FROM rrhh_personal 
                WHERE categoria_rol = 'CONDUCTOR' 
                  AND (CONCAT(nombres, ' ', apellidos) LIKE ? OR CONCAT(apellidos, ' ', nombres) LIKE ?)
                LIMIT 1
            `, [`%${v.conductor.trim()}%`, `%${v.conductor.trim()}%`]);

            if (pRows.length > 0) {
                const pid = pRows[0].id;
                await tdb.query(`
                    INSERT INTO rrhh_tareo (personal_id, fecha, estado, orden_viaje_codigo, observacion, usuario_registro)
                    VALUES (?, ?, 'R', ?, 'Asignado en Viaje', 'SYNC_VIAJES')
                    ON DUPLICATE KEY UPDATE estado = 'R', orden_viaje_codigo = VALUES(orden_viaje_codigo)
                `, [pid, fecha, v.codigo]);
                actualizados++;
            }
        }

        res.json({ ok: true, message: `Se sincronizaron ${actualizados} conductores en ruta para la fecha ${fecha}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═════════════════════════════════════════════════════════════════════
// 3. VACACIONES, LICENCIAS Y DESCANSOS MÉDICOS
// ═════════════════════════════════════════════════════════════════════

router.get('/licencias', async (req, res) => {
    try {
        const tdb = getDb(req);
        const [rows] = await tdb.query(`
            SELECT l.*, p.nombres, p.apellidos, p.numero_documento, p.cargo, p.categoria_rol
            FROM rrhh_licencias l
            INNER JOIN rrhh_personal p ON l.personal_id = p.id
            ORDER BY l.fecha_inicio DESC
        `);
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/licencias', async (req, res) => {
    try {
        const tdb = getDb(req);
        const b = req.body || {};

        if (!b.personal_id || !b.tipo || !b.fecha_inicio || !b.fecha_fin) {
            return res.status(400).json({ error: 'Colaborador, tipo de licencia y fechas son obligatorios' });
        }

        const dIni = new Date(b.fecha_inicio);
        const dFin = new Date(b.fecha_fin);
        const diffTime = Math.abs(dFin - dIni);
        const diasTotales = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        await tdb.query(`
            INSERT INTO rrhh_licencias (personal_id, tipo, fecha_inicio, fecha_fin, dias_totales, motivo, sustento_url, estado, aprobado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            b.personal_id,
            b.tipo,
            b.fecha_inicio,
            b.fecha_fin,
            diasTotales,
            b.motivo || null,
            b.sustento_url || null,
            b.estado || 'APROBADO',
            b.aprobado_por || req.headers['x-user-nombre'] || 'RRHH'
        ]);

        // Marcar en tareo los días correspondientes
        const estadoTareo = b.tipo === 'VACACIONES' ? 'V' : (b.tipo === 'DESCANSO_MEDICO' ? 'DM' : 'P');
        let curr = new Date(dIni);
        while (curr <= dFin) {
            const fStr = curr.toISOString().slice(0, 10);
            await tdb.query(`
                INSERT INTO rrhh_tareo (personal_id, fecha, estado, observacion, usuario_registro)
                VALUES (?, ?, ?, ?, 'LICENCIA_AUTO')
                ON DUPLICATE KEY UPDATE estado = VALUES(estado), observacion = VALUES(observacion)
            `, [b.personal_id, fStr, estadoTareo, b.tipo]);
            curr.setDate(curr.getDate() + 1);
        }

        res.json({ ok: true, message: 'Licencia / Vacación registrada y aplicada al tareo' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/licencias/:id', async (req, res) => {
    try {
        const tdb = getDb(req);
        await tdb.query('DELETE FROM rrhh_licencias WHERE id = ?', [req.params.id]);
        res.json({ ok: true, message: 'Registro de licencia eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═════════════════════════════════════════════════════════════════════
// 4. SEGURIDAD Y SALUD EN EL TRABAJO (SST - LEY 29783)
// ═════════════════════════════════════════════════════════════════════

router.get('/sst', async (req, res) => {
    try {
        const tdb = getDb(req);
        const [rows] = await tdb.query(`
            SELECT s.*, p.nombres, p.apellidos, p.numero_documento, p.cargo, p.categoria_rol
            FROM rrhh_sst_registros s
            INNER JOIN rrhh_personal p ON s.personal_id = p.id
            ORDER BY s.fecha_registro DESC
        `);
        res.json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/sst', upload.single('documento'), async (req, res) => {
    try {
        const tdb = getDb(req);
        const b = req.body || {};

        if (!b.personal_id || !b.tipo_registro || !b.descripcion) {
            return res.status(400).json({ error: 'Colaborador, tipo de registro y descripción son obligatorios' });
        }

        let doc_url = null;
        if (req.file) {
            doc_url = `/uploads/rrhh/${req.file.filename}`;
        }

        await tdb.query(`
            INSERT INTO rrhh_sst_registros (personal_id, tipo_registro, fecha_registro, descripcion, fecha_vencimiento, documento_url, firmado)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            b.personal_id,
            b.tipo_registro,
            b.fecha_registro || hoyLima(),
            b.descripcion.trim(),
            b.fecha_vencimiento || null,
            doc_url,
            b.firmado === '1' || b.firmado === true ? 1 : 0
        ]);

        res.json({ ok: true, message: 'Constancia de SST registrada correctamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═════════════════════════════════════════════════════════════════════
// 5. PRENÓMINA Y RESUMEN DE PAGO DE HABERES
// ═════════════════════════════════════════════════════════════════════

router.get('/nomina/resumen', async (req, res) => {
    try {
        const tdb = getDb(req);
        const anio = parseInt(req.query.anio) || new Date().getFullYear();
        const mes = parseInt(req.query.mes) || (new Date().getMonth() + 1);

        const inicioMes = `${anio}-${String(mes).padStart(2, '0')}-01`;
        const ultimoDia = new Date(anio, mes, 0).getDate();
        const finMes = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

        // Obtener personal activo
        const [personal] = await tdb.query(`
            SELECT id, numero_documento, nombres, apellidos, categoria_rol, cargo, sueldo_basico, bono_fijo, 
                   regimen_pensionario, tiene_asignacion_familiar, banco_haberes, cuenta_haberes, cci_haberes
            FROM rrhh_personal 
            WHERE estado != 'CESADO'
            ORDER BY apellidos ASC
        `);

        // Obtener tareo consolidado del mes por trabajador
        const [tareos] = await tdb.query(`
            SELECT personal_id,
                   SUM(CASE WHEN estado IN ('A', 'R') THEN 1 ELSE 0 END) as dias_trabajados,
                   SUM(CASE WHEN estado = 'F' THEN 1 ELSE 0 END) as faltas,
                   SUM(CASE WHEN estado = 'T' THEN 1 ELSE 0 END) as tardanzas_conteo,
                   SUM(minutos_tardanza) as total_minutos_tardanza,
                   SUM(horas_extras) as total_horas_extras,
                   SUM(CASE WHEN estado = 'V' THEN 1 ELSE 0 END) as dias_vacaciones,
                   SUM(CASE WHEN estado = 'DM' THEN 1 ELSE 0 END) as dias_descanso_medico
            FROM rrhh_tareo
            WHERE fecha BETWEEN ? AND ?
            GROUP BY personal_id
        `, [inicioMes, finMes]);

        const mapTareoRes = {};
        tareos.forEach(t => { mapTareoRes[t.personal_id] = t; });

        // Calcular planilla consolidada
        const asigFamMonto = 102.50; // Asignación familiar legal actual en Perú (10% de RMV)
        const resumen = personal.map(p => {
            const t = mapTareoRes[p.id] || { dias_trabajados: 0, faltas: 0, total_minutos_tardanza: 0, total_horas_extras: 0, dias_vacaciones: 0, dias_descanso_medico: 0 };
            
            const sueldoBasico = parseFloat(p.sueldo_basico || 0);
            const bonoFijo = parseFloat(p.bono_fijo || 0);
            const asigFam = p.tiene_asignacion_familiar ? asigFamMonto : 0;
            const valorDia = sueldoBasico / 30;
            const valorHora = valorDia / 8;

            // Descuentos por falta y tardanza
            const descFaltas = (t.faltas || 0) * valorDia;
            const descTardanzas = ((t.total_minutos_tardanza || 0) / 60) * valorHora;
            const pagoHorasExtras = (t.total_horas_extras || 0) * (valorHora * 1.25);

            const totalIngresos = (sueldoBasico + bonoFijo + asigFam + pagoHorasExtras);
            
            // Aporte Previsional (Aproximado: AFP ~12.5%, ONP 13%)
            let tasaPension = 0.13;
            if (p.regimen_pensionario.startsWith('AFP')) tasaPension = 0.125;
            else if (p.regimen_pensionario === 'SIN_REGIMEN') tasaPension = 0;

            const descPension = (totalIngresos - descFaltas) * tasaPension;
            const totalDescuentos = descFaltas + descTardanzas + descPension;
            const netoPagar = Math.max(0, totalIngresos - totalDescuentos);

            // Aporte Empleador (ESSALUD 9%)
            const essalud = (totalIngresos - descFaltas) * 0.09;

            return {
                id: p.id,
                documento: p.numero_documento,
                nombre_completo: `${p.apellidos} ${p.nombres}`,
                cargo: p.cargo,
                rol: p.categoria_rol,
                sueldo_basico: sueldoBasico,
                asignacion_familiar: asigFam,
                bono_fijo: bonoFijo,
                horas_extras_importe: pagoHorasExtras,
                total_ingresos: totalIngresos,
                dias_trabajados: t.dias_trabajados || 0,
                faltas: t.faltas || 0,
                minutos_tardanza: t.total_minutos_tardanza || 0,
                descuento_faltas: descFaltas,
                descuento_tardanzas: descTardanzas,
                regimen_pensionario: p.regimen_pensionario,
                descuento_pension: descPension,
                total_descuentos: totalDescuentos,
                neto_pagar: netoPagar,
                essalud_empleador: essalud,
                banco: p.banco_haberes || '---',
                cuenta: p.cuenta_haberes || '---',
                cci: p.cci_haberes || '---'
            };
        });

        res.json({
            ok: true,
            periodo: `${String(mes).padStart(2, '0')}/${anio}`,
            total_colaboradores: resumen.length,
            total_neto_planilla: resumen.reduce((acc, r) => acc + r.neto_pagar, 0),
            total_essalud: resumen.reduce((acc, r) => acc + r.essalud_empleador, 0),
            data: resumen
        });
    } catch (err) {
        console.error('Error al calcular resumen de nómina:', err);
        res.status(500).json({ error: err.message });
    }
});

    // ═════════════════════════════════════════════════════════════════════
    // 3. MARCACIÓN POR QR (ingreso y salida) Y HORARIOS
    // ═════════════════════════════════════════════════════════════════════
    // El QR del fotocheck puede ser el nuevo (AZK1.<id>.<firma>, firmado por el servidor) o el anterior (AZKELL|DNI:...).
    // Regla: sin un ingreso abierto, la lectura es un INGRESO; con un ingreso abierto (dentro del tope del turno), es la SALIDA de ese turno.
    // La asistencia cuenta en el día del ingreso, aunque la salida sea de madrugada.
    const crypto = require('crypto');
    const { ahoraLima } = require('../services/horaLima');
    const firmaQr = (id) => crypto.createHmac('sha256', process.env.JWT_SECRET || '').update('azkell-qr|' + id).digest('base64url').slice(0, 16);
    const tokenQr = (id) => 'AZK1.' + id + '.' + firmaQr(id);
    const MIN_ENTRE_LECTURAS = 2;     // una segunda lectura casi seguida se ignora
    const TOPE_MINIMO_HORAS = 16;     // tope del turno abierto: la duración del horario + 4 h, nunca menos de 16 h

    function leerQr(texto) {
        const t = String(texto || '').trim();
        const nuevo = t.match(/^AZK1\.(\d+)\.([A-Za-z0-9_-]{16})$/);
        if (nuevo) {
            const esperado = Buffer.from(firmaQr(nuevo[1])); const recibido = Buffer.from(nuevo[2]);
            if (esperado.length === recibido.length && crypto.timingSafeEqual(esperado, recibido)) return { id: Number(nuevo[1]) };
            return { invalido: true };
        }
        const viejo = t.match(/^AZKELL\|DNI:([^|]+)/);
        if (viejo) return { dni: viejo[1].trim() };
        return null;
    }

    async function horarioDe(tdb, p) {
        try {
            const [h] = await tdb.query(
                "SELECT hora_ingreso, hora_salida, duracion_horas, tolerancia_min FROM rrhh_horarios WHERE (ambito = 'PERSONA' AND personal_id = ?) OR (ambito = 'CARGO' AND UPPER(cargo) = UPPER(?)) ORDER BY (ambito = 'PERSONA') DESC LIMIT 1",
                [p.id, p.cargo || '']);
            return h[0] || null;
        } catch (e) { return null; }
    }
    const aMin = (hhmm) => { const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

    // Minutos de tardanza de un ingreso a `hora` (HH:MM) según el horario; 0 si llegó dentro de la tolerancia o no hay horario
    function tardanzaDe(horario, hora) {
        if (!horario) return 0;
        let dif = aMin(hora) - aMin(horario.hora_ingreso);
        dif = ((dif + 720) % 1440 + 1440) % 1440 - 720;     // diferencia más corta, también para turnos de noche
        return dif > Number(horario.tolerancia_min || 0) ? dif : 0;
    }

    async function registrarMarcacion(tdb, p, { origen, dispositivo, usuario }) {
        const ahora = ahoraLima();
        const hora = ahora.slice(11, 16);
        const horario = await horarioDe(tdb, p);
        const duracion = horario ? Number(horario.duracion_horas) : 9;
        const tope = Math.max(TOPE_MINIMO_HORAS, duracion + 4);
        const [ults] = await tdb.query(
            "SELECT id, tipo, fecha_turno, DATE_FORMAT(fecha_turno, '%Y-%m-%d') AS fturno, TIMESTAMPDIFF(MINUTE, marcado_en, ?) AS min_desde FROM rrhh_marcaciones WHERE personal_id = ? ORDER BY marcado_en DESC, id DESC LIMIT 1",
            [ahora, p.id]);
        const ult = ults[0];
        if (ult && ult.min_desde < MIN_ENTRE_LECTURAS) {
            return { ignorada: true, tipo: ult.tipo, hora, mensaje: 'Ya marcaste hace un momento.' };
        }
        const abierto = ult && ult.tipo === 'INGRESO' && ult.min_desde <= tope * 60;
        if (abierto) {
            await tdb.query('INSERT INTO rrhh_marcaciones (personal_id, tipo, marcado_en, fecha_turno, turno_id, origen, dispositivo, usuario_registro) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [p.id, 'SALIDA', ahora, ult.fturno, ult.id, origen, dispositivo || null, usuario]);
            const trabajadas = ult.min_desde / 60;
            const sobra = horario ? Math.round((trabajadas - duracion) * 100) / 100 : 0;
            const extras = sobra >= 0.25 ? sobra : 0;      // menos de 15 minutos no cuenta como hora extra
            await tdb.query('UPDATE rrhh_tareo SET hora_salida = ?, horas_extras = ? WHERE personal_id = ? AND fecha = ?', [hora + ':00', extras, p.id, ult.fturno]);
            return { tipo: 'SALIDA', hora, fecha_turno: ult.fturno, horas_trabajadas: Math.round(trabajadas * 100) / 100, horas_extras: extras };
        }
        const fecha = ahora.slice(0, 10);
        const tardanza = tardanzaDe(horario, hora);
        const estado = tardanza > 0 ? 'T' : 'A';
        await tdb.query('INSERT INTO rrhh_marcaciones (personal_id, tipo, marcado_en, fecha_turno, origen, dispositivo, usuario_registro) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [p.id, 'INGRESO', ahora, fecha, origen, dispositivo || null, usuario]);
        await tdb.query(
            `INSERT INTO rrhh_tareo (personal_id, fecha, estado, hora_entrada, hora_salida, minutos_tardanza, horas_extras, usuario_registro)
             VALUES (?, ?, ?, ?, NULL, ?, 0, ?)
             ON DUPLICATE KEY UPDATE estado = IF(estado = 'R', 'R', VALUES(estado)), hora_entrada = VALUES(hora_entrada), hora_salida = NULL,
                 minutos_tardanza = VALUES(minutos_tardanza), horas_extras = 0, usuario_registro = VALUES(usuario_registro)`,
            [p.id, fecha, estado, hora + ':00', tardanza, usuario]);
        return { tipo: 'INGRESO', hora, fecha_turno: fecha, tardanza_min: tardanza };
    }

    // QR firmado de una persona (lo usa el fotocheck)
    router.get('/personal/:id/qr-token', (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Persona no válida' });
        res.json({ ok: true, token: tokenQr(id) });
    });

    // Marcar con el QR del fotocheck
    router.post('/marcacion/qr', async (req, res) => {
        try {
            const tdb = getDb(req);
            const b = req.body || {};
            const leido = leerQr(b.codigo);
            if (!leido || leido.invalido) return res.status(400).json({ ok: false, error: leido && leido.invalido ? 'El código no es válido (firma incorrecta).' : 'No reconozco este código. Usa el QR del fotocheck.' });
            const cols = 'id, numero_documento, nombres, apellidos, cargo, categoria_rol, estado, foto_url';
            const [filas] = leido.id
                ? await tdb.query(`SELECT ${cols} FROM rrhh_personal WHERE id = ?`, [leido.id])
                : await tdb.query(`SELECT ${cols} FROM rrhh_personal WHERE numero_documento = ?`, [leido.dni]);
            const p = filas[0];
            if (!p) return res.status(404).json({ ok: false, error: 'Esta persona no está registrada en esta empresa.' });
            if (String(p.estado || '').toUpperCase() === 'CESADO') return res.status(409).json({ ok: false, error: 'Esta persona figura como cesada.' });
            const usuario = (req.user && req.user.nombre) ? req.user.nombre : 'MARCACION_QR';
            const r = await registrarMarcacion(tdb, p, { origen: 'QR', dispositivo: String(b.dispositivo || '').slice(0, 120), usuario });
            res.json({ ok: true, ...r, persona: { id: p.id, nombres: p.nombres, apellidos: p.apellidos, cargo: p.cargo, categoria_rol: p.categoria_rol, foto_url: p.foto_url || null } });
        } catch (err) {
            console.error('Error en marcación QR:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Registro manual (se olvidó de marcar): ingreso y/o salida de un día, con motivo. Queda con origen MANUAL.
    router.post('/marcacion/manual', async (req, res) => {
        try {
            const tdb = getDb(req);
            const b = req.body || {};
            const pid = parseInt(b.personal_id, 10);
            const fecha = String(b.fecha || '');
            const hIn = String(b.hora_entrada || '').trim(), hOut = String(b.hora_salida || '').trim();
            const motivo = String(b.motivo || '').trim();
            if (!pid) return res.status(400).json({ ok: false, error: 'Elige a la persona.' });
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ ok: false, error: 'La fecha no es válida.' });
            if (fecha > hoyLima()) return res.status(400).json({ ok: false, error: 'No se puede registrar en una fecha futura.' });
            if (!hIn && !hOut) return res.status(400).json({ ok: false, error: 'Indica la hora de ingreso o la de salida.' });
            if ((hIn && aMin(hIn) === null) || (hOut && aMin(hOut) === null)) return res.status(400).json({ ok: false, error: 'Las horas no son válidas.' });
            if (motivo.length < 3) return res.status(400).json({ ok: false, error: 'Escribe el motivo (por ejemplo: olvidó marcar).' });
            const [ps] = await tdb.query('SELECT id, cargo FROM rrhh_personal WHERE id = ?', [pid]);
            if (!ps[0]) return res.status(404).json({ ok: false, error: 'Persona no encontrada.' });
            const horario = await horarioDe(tdb, ps[0]);
            const duracion = horario ? Number(horario.duracion_horas) : 9;
            const usuario = (req.user && req.user.nombre) ? req.user.nombre : 'SISTEMA';
            const [previas] = await tdb.query("SELECT id, tipo FROM rrhh_marcaciones WHERE personal_id = ? AND fecha_turno = ? ORDER BY marcado_en, id", [pid, fecha]);
            let ingresoId = null, tipoRes = '';
            if (hIn) {
                if (previas.length) return res.status(409).json({ ok: false, error: 'Ese día ya tiene marcaciones. Si solo falta la salida, deja vacío el ingreso.' });
                const [r] = await tdb.query('INSERT INTO rrhh_marcaciones (personal_id, tipo, marcado_en, fecha_turno, origen, usuario_registro, observacion) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [pid, 'INGRESO', `${fecha} ${hIn.slice(0, 5)}:00`, fecha, 'MANUAL', usuario, motivo.slice(0, 250)]);
                ingresoId = r.insertId; tipoRes = 'INGRESO';
                const tard = tardanzaDe(horario, hIn.slice(0, 5));
                await tdb.query(
                    `INSERT INTO rrhh_tareo (personal_id, fecha, estado, hora_entrada, hora_salida, minutos_tardanza, horas_extras, observacion, usuario_registro)
                     VALUES (?, ?, ?, ?, NULL, ?, 0, ?, ?)
                     ON DUPLICATE KEY UPDATE estado = IF(estado = 'R', 'R', VALUES(estado)), hora_entrada = VALUES(hora_entrada), hora_salida = NULL,
                         minutos_tardanza = VALUES(minutos_tardanza), horas_extras = 0, observacion = VALUES(observacion), usuario_registro = VALUES(usuario_registro)`,
                    [pid, fecha, tard > 0 ? 'T' : 'A', hIn.slice(0, 5) + ':00', tard, ('Marcación manual: ' + motivo).slice(0, 250), usuario]);
            }
            if (hOut) {
                if (!ingresoId) {
                    const abierto = [...previas].reverse().find(x => x.tipo === 'INGRESO');
                    const hayCierre = abierto && previas.some(x => x.tipo === 'SALIDA' && x.id > abierto.id);
                    if (!abierto || hayCierre) return res.status(409).json({ ok: false, error: 'No hay un ingreso abierto ese día al que ponerle la salida.' });
                    ingresoId = abierto.id;
                }
                const [ing] = await tdb.query("SELECT DATE_FORMAT(marcado_en, '%Y-%m-%d %H:%i:%s') AS en FROM rrhh_marcaciones WHERE id = ?", [ingresoId]);
                let fechaSalida = fecha;
                if (aMin(hOut.slice(0, 5)) <= aMin(String(ing[0].en).slice(11, 16))) {   // la salida es de madrugada: día siguiente
                    const d = new Date(fecha + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); fechaSalida = d.toISOString().slice(0, 10);
                }
                const salidaTs = `${fechaSalida} ${hOut.slice(0, 5)}:00`;
                await tdb.query('INSERT INTO rrhh_marcaciones (personal_id, tipo, marcado_en, fecha_turno, turno_id, origen, usuario_registro, observacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [pid, 'SALIDA', salidaTs, fecha, ingresoId, 'MANUAL', usuario, motivo.slice(0, 250)]);
                const [dm] = await tdb.query('SELECT TIMESTAMPDIFF(MINUTE, ?, ?) AS min', [ing[0].en, salidaTs]);
                const sobra = horario ? Math.round(((dm[0].min / 60) - duracion) * 100) / 100 : 0;
                await tdb.query('UPDATE rrhh_tareo SET hora_salida = ?, horas_extras = ? WHERE personal_id = ? AND fecha = ?', [hOut.slice(0, 5) + ':00', sobra >= 0.25 ? sobra : 0, pid, fecha]);
                tipoRes = tipoRes ? 'INGRESO Y SALIDA' : 'SALIDA';
            }
            res.json({ ok: true, tipo: tipoRes });
        } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
    });

    // Marcaciones de un día (por defecto, hoy)
    router.get('/marcaciones', async (req, res) => {
        try {
            const tdb = getDb(req);
            const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.fecha || '')) ? req.query.fecha : hoyLima();
            const [rows] = await tdb.query(
                `SELECT m.id, m.tipo, DATE_FORMAT(m.marcado_en, '%H:%i') AS hora, DATE_FORMAT(m.marcado_en, '%Y-%m-%d') AS fecha, m.origen, m.observacion, m.usuario_registro, p.id AS personal_id, p.nombres, p.apellidos, p.cargo
                 FROM rrhh_marcaciones m JOIN rrhh_personal p ON p.id = m.personal_id
                 WHERE DATE(m.marcado_en) = ? ORDER BY m.marcado_en DESC, m.id DESC LIMIT 500`, [fecha]);
            res.json({ ok: true, fecha, marcaciones: rows });
        } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
    });

    // Horarios por cargo o por persona
    router.get('/horarios', async (req, res) => {
        try {
            const tdb = getDb(req);
            const [rows] = await tdb.query(
                `SELECT h.id, h.ambito, h.cargo, h.personal_id, TIME_FORMAT(h.hora_ingreso, '%H:%i') AS hora_ingreso, TIME_FORMAT(h.hora_salida, '%H:%i') AS hora_salida,
                        h.duracion_horas, h.tolerancia_min, p.nombres, p.apellidos
                 FROM rrhh_horarios h LEFT JOIN rrhh_personal p ON p.id = h.personal_id ORDER BY h.ambito, h.cargo, p.apellidos`);
            res.json({ ok: true, horarios: rows });
        } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
    });

    router.post('/horarios', async (req, res) => {
        try {
            const tdb = getDb(req);
            const b = req.body || {};
            const ambito = b.ambito === 'PERSONA' ? 'PERSONA' : 'CARGO';
            const cargo = ambito === 'CARGO' ? String(b.cargo || '').trim() : null;
            const pid = ambito === 'PERSONA' ? parseInt(b.personal_id, 10) : null;
            if (ambito === 'CARGO' && !cargo) return res.status(400).json({ ok: false, error: 'Indica el cargo.' });
            if (ambito === 'PERSONA' && !pid) return res.status(400).json({ ok: false, error: 'Indica la persona.' });
            if (aMin(b.hora_ingreso) === null || aMin(b.hora_salida) === null) return res.status(400).json({ ok: false, error: 'Las horas no son válidas.' });
            const dur = Number(b.duracion_horas);
            if (!Number.isFinite(dur) || dur <= 0 || dur > 48) return res.status(400).json({ ok: false, error: 'La duración del turno debe estar entre 1 y 48 horas.' });
            const tol = Math.max(0, parseInt(b.tolerancia_min, 10) || 0);
            const usuario = (req.user && req.user.nombre) ? req.user.nombre : 'SISTEMA';
            const [ex] = ambito === 'CARGO'
                ? await tdb.query("SELECT id FROM rrhh_horarios WHERE ambito = 'CARGO' AND UPPER(cargo) = UPPER(?) LIMIT 1", [cargo])
                : await tdb.query("SELECT id FROM rrhh_horarios WHERE ambito = 'PERSONA' AND personal_id = ? LIMIT 1", [pid]);
            if (ex[0]) {
                await tdb.query('UPDATE rrhh_horarios SET hora_ingreso = ?, hora_salida = ?, duracion_horas = ?, tolerancia_min = ?, actualizado_por = ? WHERE id = ?',
                    [b.hora_ingreso, b.hora_salida, dur, tol, usuario, ex[0].id]);
            } else {
                await tdb.query('INSERT INTO rrhh_horarios (ambito, cargo, personal_id, hora_ingreso, hora_salida, duracion_horas, tolerancia_min, actualizado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [ambito, cargo, pid, b.hora_ingreso, b.hora_salida, dur, tol, usuario]);
            }
            res.json({ ok: true });
        } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
    });

    router.delete('/horarios/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            await tdb.query('DELETE FROM rrhh_horarios WHERE id = ?', [parseInt(req.params.id, 10) || 0]);
            res.json({ ok: true });
        } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
    });

    return router;
};
