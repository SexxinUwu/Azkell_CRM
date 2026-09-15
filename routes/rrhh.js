const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

module.exports = function (db, broadcast, logAudit) {
    const router = express.Router();

    // Helper para obtener la base de datos del request (Multi-tenant)
    function getDb(req) {
        const d = (req && req.db) ? req.db : db;
        if (!d) return null;
        return (typeof d.promise === 'function') ? d.promise() : d;
    }

// Auto-creación de tablas del módulo RRHH
async function ensureTablesRRHH(req) {
    const tdb = getDb(req);
    try {
        await tdb.query(`
            CREATE TABLE IF NOT EXISTS rrhh_personal (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tipo_documento VARCHAR(20) DEFAULT 'DNI',
                numero_documento VARCHAR(20) NOT NULL UNIQUE,
                nombres VARCHAR(100) NOT NULL,
                apellidos VARCHAR(100) NOT NULL,
                sexo ENUM('M', 'F') DEFAULT 'M',
                fecha_nacimiento DATE NULL,
                nacionalidad VARCHAR(50) DEFAULT 'PERUANA',
                estado_civil VARCHAR(30) DEFAULT 'SOLTERO(A)',
                direccion TEXT NULL,
                distrito VARCHAR(100) NULL,
                provincia VARCHAR(100) NULL,
                departamento VARCHAR(100) NULL,
                telefono VARCHAR(30) NULL,
                email VARCHAR(100) NULL,
                contacto_emergencia_nombre VARCHAR(100) NULL,
                contacto_emergencia_parentesco VARCHAR(50) NULL,
                contacto_emergencia_telefono VARCHAR(30) NULL,
                categoria_rol ENUM('CONDUCTOR', 'MECANICO_TALLER', 'ADMINISTRATIVO', 'LIMPIEZA_SERVICIOS', 'SEGURIDAD_CONTROL', 'OTRO') DEFAULT 'ADMINISTRATIVO',
                cargo VARCHAR(100) NOT NULL,
                area VARCHAR(100) DEFAULT 'OPERACIONES',
                sede VARCHAR(100) DEFAULT 'BASE PRINCIPAL',
                centro_costo_codigo VARCHAR(20) DEFAULT 'CC-100',
                jefe_inmediato VARCHAR(100) NULL,
                fecha_ingreso DATE NOT NULL,
                fecha_cese DATE NULL,
                motivo_cese VARCHAR(255) NULL,
                estado ENUM('ACTIVO', 'VACACIONES', 'SUSPENDIDO', 'CESADO') DEFAULT 'ACTIVO',
                tipo_contrato ENUM('INDETERMINADO', 'PLAZO_FIJO', 'PERIODO_PRUEBA', 'LOCACION_SERVICIOS', 'PRACTICANTE') DEFAULT 'PLAZO_FIJO',
                fecha_inicio_contrato DATE NULL,
                fecha_fin_contrato DATE NULL,
                regimen_pensionario ENUM('ONP', 'AFP_HABITAT', 'AFP_INTEGRA', 'AFP_PRIMA', 'AFP_PROFUTURO', 'SIN_REGIMEN') DEFAULT 'ONP',
                tipo_comision_afp ENUM('FLUJO', 'MIXTA') DEFAULT 'FLUJO',
                cuspp VARCHAR(30) NULL,
                tiene_asignacion_familiar TINYINT(1) DEFAULT 0,
                sueldo_basico DECIMAL(12,2) DEFAULT 0.00,
                bono_fijo DECIMAL(12,2) DEFAULT 0.00,
                banco_haberes VARCHAR(100) NULL,
                cuenta_haberes VARCHAR(50) NULL,
                cci_haberes VARCHAR(50) NULL,
                banco_cts VARCHAR(100) NULL,
                cuenta_cts VARCHAR(50) NULL,
                licencia_conducir VARCHAR(30) NULL,
                licencia_categoria VARCHAR(20) NULL,
                licencia_vencimiento DATE NULL,
                sctr_salud_vigente TINYINT(1) DEFAULT 1,
                sctr_pension_vigente TINYINT(1) DEFAULT 1,
                emo_fecha_vencimiento DATE NULL,
                emo_condicion ENUM('APTO', 'APTO_RESTRICCIONES', 'NO_APTO', 'PENDIENTE') DEFAULT 'APTO',
                foto_url TEXT NULL,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `).catch(() => {});

        await tdb.query(`
            CREATE TABLE IF NOT EXISTS rrhh_tareo (
                id INT AUTO_INCREMENT PRIMARY KEY,
                personal_id INT NOT NULL,
                fecha DATE NOT NULL,
                estado ENUM('A', 'T', 'F', 'R', 'DM', 'V', 'P', 'D', 'FER') DEFAULT 'A',
                hora_entrada TIME NULL,
                hora_salida TIME NULL,
                minutos_tardanza INT DEFAULT 0,
                horas_extras DECIMAL(4,2) DEFAULT 0.00,
                observacion VARCHAR(255) NULL,
                orden_viaje_codigo VARCHAR(50) NULL,
                usuario_registro VARCHAR(100) NULL,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_personal_fecha (personal_id, fecha),
                FOREIGN KEY (personal_id) REFERENCES rrhh_personal(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `).catch(() => {});

        await tdb.query(`
            CREATE TABLE IF NOT EXISTS rrhh_licencias (
                id INT AUTO_INCREMENT PRIMARY KEY,
                personal_id INT NOT NULL,
                tipo ENUM('VACACIONES', 'DESCANSO_MEDICO', 'PERMISO_CON_GOCE', 'PERMISO_SIN_GOCE', 'LICENCIA_PATERNIDAD', 'LICENCIA_MATERNIDAD', 'SUSPENSION') NOT NULL,
                fecha_inicio DATE NOT NULL,
                fecha_fin DATE NOT NULL,
                dias_totales INT NOT NULL,
                motivo TEXT NULL,
                sustento_url TEXT NULL,
                estado ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO') DEFAULT 'APROBADO',
                aprobado_por VARCHAR(100) NULL,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (personal_id) REFERENCES rrhh_personal(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `).catch(() => {});

        await tdb.query(`
            CREATE TABLE IF NOT EXISTS rrhh_sst_registros (
                id INT AUTO_INCREMENT PRIMARY KEY,
                personal_id INT NOT NULL,
                tipo_registro ENUM('ENTREGA_EPP', 'CAPACITACION_SST', 'EXAMEN_MEDICO_EMO', 'INDUCCION', 'ENTREGA_RIT_RISST') NOT NULL,
                fecha_registro DATE NOT NULL,
                descripcion TEXT NOT NULL,
                fecha_vencimiento DATE NULL,
                documento_url TEXT NULL,
                firmado TINYINT(1) DEFAULT 0,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (personal_id) REFERENCES rrhh_personal(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `).catch(() => {});
    } catch(e) {
        console.warn('[RRHH] Error asegurando tablas:', e.message);
    }
}

// ═════════════════════════════════════════════════════════════════════
// 1. GESTIÓN DE PERSONAL / LEGAJOS DIGITALES
// ═════════════════════════════════════════════════════════════════════

// Listar Personal con filtros y semáforos de vencimiento
router.get('/personal', async (req, res) => {
    try {
        await ensureTablesRRHH(req);
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
        await ensureTablesRRHH(req);
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
        await ensureTablesRRHH(req);
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
router.post('/personal', upload.single('foto'), async (req, res) => {
    try {
        await ensureTablesRRHH(req);
        const tdb = getDb(req);
        const b = req.body || {};

        if (!b.numero_documento || !b.nombres || !b.apellidos || !b.cargo) {
            return res.status(400).json({ error: 'Nombres, Apellidos, DNI/Documento y Cargo son obligatorios.' });
        }

        let foto_url = null;
        if (req.file) {
            foto_url = `/uploads/rrhh/${req.file.filename}`;
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
                sctr_pension_vigente, emo_fecha_vencimiento, emo_condicion, foto_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            foto_url
        ];

        const [resIns] = await tdb.query(query, params);
        res.json({ ok: true, id: resIns.insertId, message: 'Colaborador registrado con éxito' });
    } catch (err) {
        console.error('Error al registrar personal:', err);
        res.status(500).json({ error: err.message });
    }
});

// Actualizar colaborador
router.put('/personal/:id', upload.single('foto'), async (req, res) => {
    try {
        await ensureTablesRRHH(req);
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
            b.emo_condicion || 'APTO'
        ];

        if (req.file) {
            fotoClause = ', foto_url = ?';
            params.push(`/uploads/rrhh/${req.file.filename}`);
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
                sctr_pension_vigente = ?, emo_fecha_vencimiento = ?, emo_condicion = ?
                ${fotoClause}
            WHERE id = ?
        `, params);

        res.json({ ok: true, message: 'Colaborador actualizado con éxito' });
    } catch (err) {
        console.error('Error al actualizar personal:', err);
        res.status(500).json({ error: err.message });
    }
});

// Eliminar colaborador
router.delete('/personal/:id', async (req, res) => {
    try {
        await ensureTablesRRHH(req);
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
        await ensureTablesRRHH(req);
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
        await ensureTablesRRHH(req);
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
        await ensureTablesRRHH(req);
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
        await ensureTablesRRHH(req);
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
        await ensureTablesRRHH(req);
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
        await ensureTablesRRHH(req);
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
        await ensureTablesRRHH(req);
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
        await ensureTablesRRHH(req);
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
        await ensureTablesRRHH(req);
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
