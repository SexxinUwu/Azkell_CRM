const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadToS3, deleteFromS3, s3KeyFromUrl, getPresignedUrl } = require('../utils/s3');

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
const TIPOS_DOCUMENTO = ['DNI_A', 'DNI_B', 'LICENCIA', 'ANTECEDENTES', 'EMO', 'SCTR', 'CONTRATO', 'OTRO'];
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
                SUM(CASE WHEN fecha_fin_contrato IS NOT NULL AND fecha_fin_contrato BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as contratos_por_vencer,
                SUM(CASE WHEN licencia_vencimiento IS NOT NULL AND licencia_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as brevetes_por_vencer,
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
                centro_costo_codigo, jefe_inmediato, fecha_ingreso, fecha_cese, estado,
                tipo_contrato, fecha_inicio_contrato, fecha_fin_contrato, regimen_pensionario,
                tipo_comision_afp, cuspp, tiene_asignacion_familiar, sueldo_basico, bono_fijo,
                banco_haberes, cuenta_haberes, cci_haberes, banco_cts, cuenta_cts,
                licencia_conducir, licencia_categoria, licencia_vencimiento, sctr_salud_vigente,
                sctr_pension_vigente, emo_fecha_vencimiento, emo_condicion, grupo_sanguineo,
                talla_polo, talla_pantalon, talla_calzado, talla_chaleco, foto_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            b.centro_costo_codigo || 'CC-100',
            b.jefe_inmediato || null,
            b.fecha_ingreso || new Date().toISOString().slice(0, 10),
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
            b.centro_costo_codigo || 'CC-100',
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
                centro_costo_codigo = ?, jefe_inmediato = ?, fecha_ingreso = ?, fecha_cese = ?, motivo_cese = ?, estado = ?,
                tipo_contrato = ?, fecha_inicio_contrato = ?, fecha_fin_contrato = ?, regimen_pensionario = ?,
                tipo_comision_afp = ?, cuspp = ?, tiene_asignacion_familiar = ?, sueldo_basico = ?, bono_fijo = ?,
                banco_haberes = ?, cuenta_haberes = ?, cci_haberes = ?, banco_cts = ?, cuenta_cts = ?,
                licencia_conducir = ?, licencia_categoria = ?, licencia_vencimiento = ?, sctr_salud_vigente = ?,
                sctr_pension_vigente = ?, emo_fecha_vencimiento = ?, emo_condicion = ?, grupo_sanguineo = ?,
                talla_polo = ?, talla_pantalon = ?, talla_calzado = ?, talla_chaleco = ?
                ${fotoClause}
            WHERE id = ?
        `, params);

        await sincronizarConductor(tdb, id);
        res.json({ ok: true, message: 'Colaborador actualizado con éxito' });
    } catch (err) {
        console.error('Error al actualizar personal:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═════════════════════════════════════════════════════════════════════
// DOCUMENTOS DEL PERSONAL (DNI por ambas caras, licencia, antecedentes, EMO, SCTR, contrato…)
// ═════════════════════════════════════════════════════════════════════
const fechaODoc = v => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);

// Todos los documentos (sin archivo): alimenta el tablero de vencimientos
router.get('/documentos', async (req, res) => {
    try {
        const tdb = getDb(req);
        const [rows] = await tdb.query(`SELECT id, personal_id, tipo, descripcion, nombre_archivo, mime,
            DATE_FORMAT(fecha_emision, '%Y-%m-%d') AS fecha_emision, DATE_FORMAT(fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento
            FROM rrhh_personal_documentos`);
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
        for (const d of rows) {
            try { const key = s3KeyFromUrl(d.archivo_url); d.url = key ? await getPresignedUrl(key, 3600) : d.archivo_url; } catch (e) { d.url = d.archivo_url; }
            delete d.archivo_url;
        }
        res.json({ ok: true, data: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Subir un documento. Cada tipo (salvo «Otro») tiene un solo documento: al subir de nuevo se reemplaza el anterior
router.post('/personal/:id/documentos', subirDocumento.single('archivo'), async (req, res) => {
    try {
        const tdb = getDb(req);
        const b = req.body || {};
        const personaId = Number(req.params.id);
        const tipo = String(b.tipo || '').toUpperCase();
        if (!TIPOS_DOCUMENTO.includes(tipo)) return res.status(400).json({ error: 'Tipo de documento no válido.' });
        if (!req.file) return res.status(400).json({ error: 'Elige el archivo del documento.' });
        if (!MIME_PERMITIDOS.test(req.file.mimetype || '')) return res.status(400).json({ error: 'Solo se aceptan fotos (JPG, PNG, WEBP) o PDF.' });
        const [pr] = await tdb.query('SELECT id FROM rrhh_personal WHERE id = ?', [personaId]);
        if (!pr.length) return res.status(404).json({ error: 'La persona no existe.' });

        let ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
        let mime = req.file.mimetype;
        if (/^image\/hei[cf]$/i.test(mime)) { mime = 'image/jpeg'; ext = 'jpg'; }
        const key = `rrhh/documentos/${personaId}/${tipo.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const url = await uploadToS3(req.file.buffer, key, mime);

        const vence = fechaODoc(b.fecha_vencimiento);
        const emision = fechaODoc(b.fecha_emision);
        const quien = (req.user && req.user.nombre) ? req.user.nombre : 'SISTEMA';
        let id;
        const [previo] = tipo === 'OTRO' ? [[]] : await tdb.query('SELECT id, archivo_url FROM rrhh_personal_documentos WHERE personal_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [personaId, tipo]);
        if (previo.length) {
            id = previo[0].id;
            await tdb.query(`UPDATE rrhh_personal_documentos SET archivo_url = ?, nombre_archivo = ?, mime = ?, descripcion = ?, fecha_emision = ?, fecha_vencimiento = ?,
                subido_por = ?, actualizado_en = NOW() WHERE id = ?`, [url, req.file.originalname.slice(0, 255), mime, (b.descripcion || '').slice(0, 150) || null, emision, vence, quien, id]);
            const vieja = s3KeyFromUrl(previo[0].archivo_url); if (vieja) deleteFromS3(vieja).catch(() => {});
        } else {
            const [ins] = await tdb.query(`INSERT INTO rrhh_personal_documentos (personal_id, tipo, descripcion, archivo_url, nombre_archivo, mime, fecha_emision, fecha_vencimiento, subido_por)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [personaId, tipo, (b.descripcion || '').slice(0, 150) || null, url, req.file.originalname.slice(0, 255), mime, emision, vence, quien]);
            id = ins.insertId;
        }
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
        await tdb.query('DELETE FROM rrhh_personal_documentos WHERE id = ?', [doc[0].id]);
        const key = s3KeyFromUrl(doc[0].archivo_url); if (key) deleteFromS3(key).catch(() => {});
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
            SELECT personal_id, DATE_FORMAT(fecha, '%Y-%m-%d') as fecha, estado, minutos_tardanza, horas_extras, observacion, orden_viaje_codigo
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
        const fecha = req.body.fecha || new Date().toISOString().slice(0, 10);

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
            b.fecha_registro || new Date().toISOString().slice(0, 10),
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

    return router;
};
