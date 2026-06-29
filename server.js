require('dotenv').config();
const { initDB } = require('./init_db');
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { uploadToS3, deleteFromS3, s3KeyFromUrl } = require('./utils/s3');

const app = express();

// Render (y cualquier reverse proxy) necesita esto para que express-rate-limit
// pueda identificar IPs correctamente desde el header X-Forwarded-For
app.set('trust proxy', 1);

// ── Compresión gzip (reduce 60-70% el tamaño de respuestas) ───────
app.use(compression());

// ── Rate Limiting (protección contra bots y abuso de API) ─────────
const limiterGeneral = rateLimit({
    windowMs: 60 * 1000,       // ventana: 1 minuto
    max: 200,                   // máximo 200 requests por IP por minuto
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Intenta en un momento.' }
});
const limiterLogin = rateLimit({
    windowMs: 15 * 60 * 1000,  // ventana: 15 minutos
    max: 20,                    // máximo 20 intentos de login por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de acceso. Espera 15 minutos.' }
});
app.use('/api/', limiterGeneral);
app.use('/api/login', limiterLogin);
const ALLOWED_ORIGINS = [
    'https://azkell-crm.onrender.com',
    'https://azkellcrm-production.up.railway.app',
    process.env.APP_URL,
    'capacitor://localhost',
    'http://localhost',
    'http://localhost:3000'
].filter(Boolean);
app.use(cors({
    origin: function(origin, cb) {
        // Permitimos llamadas sin origin (como apps móviles o curl)
        if (!origin) return cb(null, true);
        
        // Permitimos dominios de Railway, Render, Localhost y el VPS actual
        if (ALLOWED_ORIGINS.includes(origin) || origin.includes('sslip.io')) {
            return cb(null, true);
        }
        
        // Si hay una APP_URL definida y el origin coincide, lo permitimos
        if (process.env.APP_URL && origin.startsWith(process.env.APP_URL)) {
            return cb(null, true);
        }

        cb(new Error('CORS bloqueado: ' + origin));
    },
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));

app.use(express.static(__dirname, {
    setHeaders: function(res, filePath) {
        if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// ── CONFIGURACION ERP ─────────────────────────────────────────────────────────
app.get('/api/configuracion', async (req, res) => {
    try {
        const [rows] = await db.promise().query("SELECT clave, valor FROM configuracion_erp");
        let config = {};
        rows.forEach(r => config[r.clave] = r.valor);
        res.json(config);
    } catch (error) {
        console.error("Error obteniendo configuracion:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

app.post('/api/configuracion', async (req, res) => {
    try {
        const payload = req.body;
        for (const clave in payload) {
            let valor = payload[clave] || '';
            await db.promise().query("INSERT INTO configuracion_erp (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = ?", [clave, valor, valor]);
        }
        res.json({ success: true, message: "Configuración guardada" });
    } catch (error) {
        console.error("Error guardando configuracion:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// ── CONFIGURACION ERP ─────────────────────────────────────────────────────────
app.get('/api/configuracion', async (req, res) => {
    try {
        const [rows] = await db.promise().query("SELECT clave, valor FROM configuracion_erp");
        let config = {};
        rows.forEach(r => config[r.clave] = r.valor);
        res.json(config);
    } catch (error) {
        console.error("Error obteniendo configuracion:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

app.post('/api/configuracion', async (req, res) => {
    try {
        const payload = req.body;
        for (const clave in payload) {
            let valor = payload[clave] || '';
            
            // Subir a AWS S3 si es una imagen base64
            if (clave === 'empresa_logo' && typeof valor === 'string' && valor.startsWith('data:image')) {
                const matches = valor.match(/^data:(image\/\w+);base64,(.+)$/);
                if (matches) {
                    const ext = matches[1].split('/')[1] || 'jpeg';
                    const buffer = Buffer.from(matches[2], 'base64');
                    const key = `configuracion/logo_empresa_${Date.now()}.${ext}`;
                    
                    try {
                        const [oldRows] = await db.promise().query("SELECT valor FROM configuracion_erp WHERE clave = 'empresa_logo'");
                        if (oldRows.length > 0 && oldRows[0].valor && oldRows[0].valor.includes('amazonaws.com')) {
                            const oldKey = s3KeyFromUrl(oldRows[0].valor);
                            if (oldKey) await deleteFromS3(oldKey);
                        }
                    } catch(e) { console.warn("Error deleting old logo:", e); }
                    
                    valor = await uploadToS3(buffer, key, matches[1]);
                }
            }

            await db.promise().query("INSERT INTO configuracion_erp (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = ?", [clave, valor, valor]);
        }
        res.json({ success: true, message: "Configuración guardada" });
    } catch (error) {
        console.error("Error guardando configuracion:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

app.get('/api/proxy/documento', async (req, res) => {
    let tipo = req.query.tipo;
    let numero = req.query.numero;
    if (!tipo || !numero) return res.status(400).json({error: "Faltan parametros"});
    let url = '';
    if (tipo === 'RUC') url = 'https://api.apis.net.pe/v1/ruc?numero=' + numero;
    else if (tipo === 'DNI') url = 'https://api.apis.net.pe/v1/dni?numero=' + numero;
    else return res.status(400).json({error: "Tipo no valido"});
    
    try {
        let fetchCall = global.fetch || require('node-fetch');
        let response = await fetchCall(url);
        if (!response.ok) return res.status(response.status).json({error: "Error en API externa"});
        let data = await response.json();
        res.json(data);
    } catch(err) {
        res.status(500).json({error: err.message});
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Index.html'));
});

// ============================================================
// 🔥 CONEXIÓN A LA BASE DE DATOS (100% SEGURA POR VARIABLES)
// ============================================================
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    ssl: process.env.DB_HOST && (process.env.DB_HOST.includes('railway') || process.env.DB_HOST.includes('aiven') || process.env.DB_SSL === 'true') ? { rejectUnauthorized: false } : undefined,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// ── Crear tablas faltantes al arrancar ───────────────────────────
initDB(db);

db.getConnection((err, connection) => {
    if (err) {
        console.error('🚨 Error al conectar con Aiven:', err.message);
    } else {
        console.log('✅ Base de datos conectada con éxito (Pool Activo)');
        // Migraciones de esquema al arrancar
        connection.query(
            `ALTER TABLE auditoria ADD COLUMN modulo VARCHAR(50) DEFAULT NULL`,
            (err2) => {
                if (err2 && err2.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER auditoria:', err2.message);
                else console.log('✅ Columna modulo verificada en auditoria');
            }
        );
        // Crear tabla roles si no existe
        connection.query(
            `CREATE TABLE IF NOT EXISTS roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                color VARCHAR(20) DEFAULT '#5865F2',
                permisos_json TEXT,
                es_admin TINYINT(1) DEFAULT 0
            )`,
            (err3) => {
                if (err3) console.warn('CREATE TABLE roles:', err3.message);
                else console.log('✅ Tabla roles verificada');
            }
        );
        // Agregar rol_id a usuarios si no existe
        connection.query(
            `ALTER TABLE usuarios ADD COLUMN rol_id INT NULL DEFAULT NULL`,
            (err4) => {
                if (err4 && err4.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER usuarios rol_id:', err4.message);
                else console.log('✅ Columna rol_id verificada en usuarios');
            }
        );
        // Columnas de actividad/sesión
        connection.query(`ALTER TABLE usuarios ADD COLUMN ultimo_acceso DATETIME NULL DEFAULT NULL`,
            (e) => { if (e && e.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER ultimo_acceso:', e.message); });
        connection.query(`ALTER TABLE usuarios ADD COLUMN ultimo_ip VARCHAR(80) NULL DEFAULT NULL`,
            (e) => { if (e && e.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER ultimo_ip:', e.message); });
        connection.query(`ALTER TABLE usuarios ADD COLUMN ultimo_dispositivo VARCHAR(200) NULL DEFAULT NULL`,
            (e) => { if (e && e.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER ultimo_dispositivo:', e.message); });
        connection.query(`ALTER TABLE usuarios ADD COLUMN password_visible VARCHAR(255) NOT NULL DEFAULT ''`,
            (e) => { if (e && e.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER password_visible:', e.message); });
        // Orden/jerarquía en roles
        connection.query(`ALTER TABLE roles ADD COLUMN orden INT NOT NULL DEFAULT 0`,
            (e) => {
                if (e && e.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER roles orden:', e.message);
                else console.log('✅ Esquema v2 verificado');

                // ── Módulo Planificación v1 ──────────────────────────────────
                connection.query(
                    `CREATE TABLE IF NOT EXISTS configuracion_flota (
                        id              INT AUTO_INCREMENT PRIMARY KEY,
                        marca           VARCHAR(50)  NOT NULL,
                        uts_categoria   VARCHAR(20)  NOT NULL,
                        km_mensuales    INT          NOT NULL DEFAULT 0,
                        dias_operativos INT          NOT NULL DEFAULT 26,
                        mp1_intervalo_km INT         NOT NULL DEFAULT 5000,
                        mp2_intervalo_km INT         NOT NULL DEFAULT 10000,
                        mp3_intervalo_km INT         NOT NULL DEFAULT 20000,
                        activa          TINYINT(1)   NOT NULL DEFAULT 1,
                        observaciones   TEXT,
                        created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
                        updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uq_marca_uts (marca, uts_categoria)
                    )`,
                    (e1) => {
                        if (e1) console.warn('CREATE configuracion_flota:', e1.message);
                        else console.log('✅ Tabla configuracion_flota verificada');
                    }
                );
                connection.query(
                    `CREATE TABLE IF NOT EXISTS mantenimiento_kits (
                        id              INT           AUTO_INCREMENT PRIMARY KEY,
                        marca_vehiculo  VARCHAR(50)   NOT NULL,
                        tipo_mp         VARCHAR(60)   NOT NULL,
                        nombre_kit      VARCHAR(150),
                        item_codigo     VARCHAR(30)   NOT NULL,
                        item_nombre     VARCHAR(200)  NOT NULL,
                        cantidad        DECIMAL(10,2) NOT NULL,
                        unidad_medida   VARCHAR(10)   NOT NULL,
                        costo_unitario  DECIMAL(10,2) NOT NULL DEFAULT 0,
                        costo_total     DECIMAL(10,2) NOT NULL DEFAULT 0,
                        orden           INT           NOT NULL DEFAULT 1,
                        activo          TINYINT(1)    NOT NULL DEFAULT 1,
                        created_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
                        updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_marca_mp (marca_vehiculo, tipo_mp)
                    )`,
                    (e2) => {
                        if (e2) console.warn('CREATE mantenimiento_kits:', e2.message);
                        else console.log('✅ Tabla mantenimiento_kits verificada');
                    }
                );
                connection.query(
                    `CREATE TABLE IF NOT EXISTS planificacion (
                        id                      VARCHAR(50)   NOT NULL PRIMARY KEY,
                        placa                   VARCHAR(20)   NOT NULL,
                        configuracion_flota_id  INT           NULL DEFAULT NULL,
                        tipo_mp                 VARCHAR(60)   NOT NULL,
                        fecha_inicio_ventana    DATE          NOT NULL,
                        fecha_fin_ventana       DATE          NOT NULL,
                        mes_ejecucion           INT           NOT NULL,
                        anio_ejecucion          INT           NOT NULL,
                        km_estimado             INT           NOT NULL DEFAULT 0,
                        km_minimo               INT,
                        km_maximo               INT,
                        tecnico_asignado        VARCHAR(100),
                        prioridad               ENUM('Baja','Normal','Alta','Crítica') NOT NULL DEFAULT 'Normal',
                        observaciones_plan      TEXT,
                        estado                  ENUM('Programada','Confirmada','En Progreso','Completada','Cancelada','Diferida') NOT NULL DEFAULT 'Programada',
                        motivo_cancelacion      TEXT,
                        fleetrun_id_ejecutado   VARCHAR(50),
                        fecha_real_ejecucion    DATE,
                        km_real_ejecucion       INT,
                        desviacion_km           INT,
                        desviacion_dias         INT,
                        fecha_primer_retraso    DATE,
                        alertas_enviadas        TINYINT NOT NULL DEFAULT 0,
                        source                  ENUM('manual_excel','auto_generada') NOT NULL DEFAULT 'manual_excel',
                        created_by              VARCHAR(100),
                        created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_estado (estado),
                        INDEX idx_placa (placa),
                        INDEX idx_mes_anio (mes_ejecucion, anio_ejecucion),
                        INDEX idx_fecha_ventana (fecha_fin_ventana)
                    )`,
                    (e3) => {
                        if (e3) console.warn('CREATE planificacion:', e3.message);
                        else console.log('✅ Tabla planificacion verificada');
                    }
                );
                connection.query(
                    `CREATE TABLE IF NOT EXISTS requerimientos_planificacion (
                        id                  INT           AUTO_INCREMENT PRIMARY KEY,
                        plan_id             VARCHAR(50)   NOT NULL,
                        mes_ejecucion       INT           NOT NULL,
                        anio_ejecucion      INT           NOT NULL,
                        item_codigo         VARCHAR(30),
                        item_nombre         VARCHAR(200)  NOT NULL,
                        cantidad_requerida  DECIMAL(10,2) NOT NULL,
                        unidad_medida       VARCHAR(10)   NOT NULL,
                        costo_unitario      DECIMAL(10,2) NOT NULL DEFAULT 0,
                        costo_total         DECIMAL(10,2) NOT NULL DEFAULT 0,
                        estado_req          ENUM('Pendiente','Solicitado','Recibido','Entregado al Taller','Cancelado') NOT NULL DEFAULT 'Pendiente',
                        fecha_solicitud     DATE,
                        fecha_entrega       DATE,
                        responsable_almacen VARCHAR(100),
                        observaciones       TEXT,
                        created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_plan       (plan_id),
                        INDEX idx_mes_req    (mes_ejecucion, anio_ejecucion),
                        INDEX idx_estado_req (estado_req)
                    )`,
                    (e4) => {
                        connection.release();
                        if (e4) console.warn('CREATE requerimientos_planificacion:', e4.message);
                        else console.log('✅ Esquema planificacion v1 listo');
                        // Migración de seguridad: asegurar que configuracion_flota_id sea nullable
                        db.query(
                            `ALTER TABLE planificacion MODIFY configuracion_flota_id INT NULL DEFAULT NULL`,
                            (eM) => { if (eM && eM.code !== 'ER_DUP_FIELDNAME') console.log('✅ planificacion.configuracion_flota_id nullable'); }
                        );
                    }
                );
            }
        );
    }
});

// ── Migración adicional: tabla destinatarios_alertas  (fire-and-forget) ──
db.query(
    `CREATE TABLE IF NOT EXISTS destinatarios_alertas (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        nombre       VARCHAR(100) NOT NULL,
        correo       VARCHAR(150) NOT NULL,
        cargo        VARCHAR(80),
        notif_1d     TINYINT(1) NOT NULL DEFAULT 1  COMMENT '+1 día retraso',
        notif_3d     TINYINT(1) NOT NULL DEFAULT 1  COMMENT '+3 días retraso',
        notif_7d     TINYINT(1) NOT NULL DEFAULT 1  COMMENT '+7 días retraso',
        notif_completada TINYINT(1) NOT NULL DEFAULT 0,
        activo       TINYINT(1) NOT NULL DEFAULT 1,
        created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE KEY uq_correo (correo)
    ) COMMENT 'Destinatarios de alertas del módulo Planificación'`,
    (e) => {
        if (e) console.warn('CREATE destinatarios_alertas:', e.message);
        else   console.log('✅ Tabla destinatarios_alertas verificada');
    }
);
// ── Tabla integraciones_api (tokens/credenciales externas) ──────────
db.query(
    `CREATE TABLE IF NOT EXISTS integraciones_api (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        clave           VARCHAR(100)  NOT NULL UNIQUE,
        valor           TEXT,
        descripcion     VARCHAR(255),
        actualizado_por VARCHAR(100),
        actualizado_en  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        creado_en       DATETIME DEFAULT CURRENT_TIMESTAMP
    ) COMMENT 'Credenciales y tokens de integraciones externas (Wialon, etc.)'`,
    (e) => {
        if (e) console.warn('CREATE integraciones_api:', e.message);
        else {
            console.log('✅ Tabla integraciones_api verificada');
            db.query(
                `INSERT IGNORE INTO integraciones_api (clave, descripcion) VALUES
                 ('wialon_token',   'Token de autenticación API Wialon'),
                 ('wialon_url',     'URL base API Wialon (vacío = usar por defecto)')`,
                () => {}
            );
        }
    }
);
// ── Tabla histórico KM GPS (snapshot diario por placa) ────────────
db.query(
    `CREATE TABLE IF NOT EXISTS km_snapshots (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        placa        VARCHAR(20)    NOT NULL,
        fecha        DATE           NOT NULL,
        km_gps       INT            NOT NULL DEFAULT 0,
        horas_motor  DECIMAL(10,1)  NOT NULL DEFAULT 0,
        created_at   TIMESTAMP      NOT NULL DEFAULT NOW(),
        UNIQUE KEY uq_placa_fecha (placa, fecha),
        INDEX idx_placa (placa),
        INDEX idx_fecha (fecha)
    ) COMMENT 'Snapshot diario de KM GPS y horas motor por placa (Wialon)'`,
    (e) => {
        if (e) console.warn('CREATE km_snapshots:', e.message);
        else   console.log('✅ Tabla km_snapshots verificada');
    }
);
// ── Tabla maestra tipos de preventivo ─────────────────────────────
db.query(
    `CREATE TABLE IF NOT EXISTS tipos_preventivo (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        nombre      VARCHAR(100) NOT NULL UNIQUE,
        descripcion TEXT,
        activo      TINYINT(1) NOT NULL DEFAULT 1,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    (e) => {
        if (e) console.warn('CREATE tipos_preventivo:', e.message);
        else   console.log('✅ Tabla tipos_preventivo verificada');
    }
);
// ── Crear tabla tipos_mantenimiento si no existe ──────────────────────────
db.query(
    `CREATE TABLE IF NOT EXISTS tipos_mantenimiento (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        marca           VARCHAR(100) NOT NULL DEFAULT '',
        tipo_mp         VARCHAR(100) NOT NULL DEFAULT '',
        uts             VARCHAR(50)  NOT NULL DEFAULT '',
        frecuencia_km   DECIMAL(10,2) NULL DEFAULT NULL,
        frecuencia_horas VARCHAR(50) NULL DEFAULT NULL,
        frecuencia_dias INT          NULL DEFAULT NULL,
        tipo            VARCHAR(100) NULL DEFAULT NULL,
        sistema         VARCHAR(100) NULL DEFAULT NULL,
        descripcion     TEXT         NULL DEFAULT NULL,
        created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_marca_tipo_uts (marca, tipo_mp, uts)
    )`,
    (e) => {
        if (e) console.warn('CREATE tipos_mantenimiento:', e.message);
        else   console.log('✅ Tabla tipos_mantenimiento verificada');
    }
);
// ✨ Crear tabla taller_personal si no existe ✨
db.query(
    `CREATE TABLE IF NOT EXISTS taller_personal (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        nombre          VARCHAR(100) NOT NULL,
        sueldo_mensual  DECIMAL(10,2) DEFAULT 0,
        costo_hora      DECIMAL(10,2) DEFAULT 0,
        creado_en       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    (e) => {
        if (e) console.warn('CREATE taller_personal:', e.message);
        else   console.log('✅ Tabla taller_personal verificada');
    }
);
// ── Migración: columna frecuencia_horas en tipos_mantenimiento ────────────
db.query(
    `ALTER TABLE tipos_mantenimiento ADD COLUMN frecuencia_horas VARCHAR(50) NULL DEFAULT NULL`,
    (e) => { if (!e || e.code === 'ER_DUP_FIELDNAME') console.log('✅ tipos_mantenimiento.frecuencia_horas verificada'); }
);
// ── Migración: columna frecuencia_dias en tipos_mantenimiento ──────────────
db.query(
    `ALTER TABLE tipos_mantenimiento ADD COLUMN frecuencia_dias INT NULL DEFAULT NULL`,
    (e) => { if (!e || e.code === 'ER_DUP_FIELDNAME') console.log('✅ tipos_mantenimiento.frecuencia_dias verificada'); }
);
// ── Migración: columnas marca, tipo_mp, uts, frecuencia_km, tipo, sistema ────
['marca VARCHAR(100) NOT NULL DEFAULT \'\'',
 'tipo_mp VARCHAR(100) NOT NULL DEFAULT \'\'',
 'uts VARCHAR(50) NOT NULL DEFAULT \'\'',
 'frecuencia_km DECIMAL(10,2) NULL DEFAULT NULL',
 'tipo VARCHAR(100) NULL DEFAULT NULL',
 'sistema VARCHAR(100) NULL DEFAULT NULL'
].forEach(function(colDef) {
    var colName = colDef.split(' ')[0];
    db.query('ALTER TABLE tipos_mantenimiento ADD COLUMN ' + colDef, function(e) {
        if (!e || e.code === 'ER_DUP_FIELDNAME') console.log('✅ tipos_mantenimiento.' + colName + ' verificada');
        else console.warn('ALTER tipos_mantenimiento.' + colName + ':', e.message);
    });
});
// ── Migración: índice único para upsert en tipos_mantenimiento ────────────
db.query(
    'ALTER TABLE tipos_mantenimiento ADD UNIQUE INDEX uq_marca_tipo_uts (marca, tipo_mp, uts)',
    (e) => { if (!e || e.code === 'ER_DUP_KEYNAME') console.log('✅ tipos_mantenimiento.uq_marca_tipo_uts verificado'); }
);
// ── Migración: columnas faltantes en fleetrun (nuevo esquema) ─────────────
['idRegistro VARCHAR(50) NULL',
 'mes VARCHAR(10) NULL',
 'anio VARCHAR(10) NULL',
 'fecha VARCHAR(20) NULL',
 'marca VARCHAR(100) NULL DEFAULT \'\'',
 'dueno VARCHAR(100) NULL DEFAULT \'\'',
 'uts VARCHAR(50) NULL DEFAULT \'\'',
 'tipo_mp VARCHAR(100) NULL DEFAULT \'\'',
 'km_actual DECIMAL(15,2) NULL',
 'frecuencia_km DECIMAL(15,2) NULL',
 'km_proximo DECIMAL(15,2) NULL',
 'km_gps VARCHAR(100) NULL DEFAULT \'\'',
 'tecnico VARCHAR(100) NULL DEFAULT \'\'',
 'observacion TEXT NULL'
].forEach(function(colDef) {
    var colName = colDef.split(' ')[0];
    db.query('ALTER TABLE fleetrun ADD COLUMN ' + colDef, function(e) {
        if (!e || e.code === 'ER_DUP_FIELDNAME') console.log('✅ fleetrun.' + colName + ' verificada');
        else console.warn('ALTER fleetrun.' + colName + ':', e.message);
    });
});
// ── Migración: índice único idRegistro en fleetrun ────────────────────────
db.query(
    'ALTER TABLE fleetrun ADD UNIQUE INDEX uq_idregistro (idRegistro)',
    (e) => { if (!e || e.code === 'ER_DUP_KEYNAME') console.log('✅ fleetrun.uq_idregistro verificado'); }
);
// ── Fix: tipos_mantenimiento — eliminar índice único de codigo (legacy) ───
db.query(
    'ALTER TABLE tipos_mantenimiento DROP INDEX codigo',
    (e) => { if (!e || e.code === 'ER_CANT_DROP_FIELD_OR_KEY') console.log('✅ tipos_mantenimiento.codigo unique index removido'); }
);
// ── Migración: columna descripcion en tipos_mantenimiento ──────────────────
db.query(
    'ALTER TABLE tipos_mantenimiento ADD COLUMN descripcion TEXT NULL DEFAULT NULL',
    (e) => { if (!e || e.code === 'ER_DUP_FIELDNAME') console.log('✅ tipos_mantenimiento.descripcion verificada'); }
);
// ── Fix: tipos_mantenimiento — permitir NULL en columnas legacy NOT NULL ──
['ALTER TABLE tipos_mantenimiento MODIFY COLUMN codigo VARCHAR(20) NULL DEFAULT \'\'',
 'ALTER TABLE tipos_mantenimiento MODIFY COLUMN descripcion TEXT NULL DEFAULT NULL',
 'ALTER TABLE tipos_mantenimiento MODIFY COLUMN km_intervalo INT NULL DEFAULT NULL',
 'ALTER TABLE tipos_mantenimiento MODIFY COLUMN tipo VARCHAR(100) NULL DEFAULT NULL',
 'ALTER TABLE tipos_mantenimiento MODIFY COLUMN sistema VARCHAR(100) NULL DEFAULT NULL',
 'ALTER TABLE tipos_mantenimiento MODIFY COLUMN frecuencia_km DECIMAL(10,2) NULL DEFAULT NULL',
 'ALTER TABLE tipos_mantenimiento MODIFY COLUMN frecuencia_horas VARCHAR(50) NULL DEFAULT NULL',
 'ALTER TABLE tipos_mantenimiento MODIFY COLUMN frecuencia_dias INT NULL DEFAULT NULL'
].forEach(function(sql) {
    db.query(sql, function(e) {
        if (!e) console.log('✅ tipos_mantenimiento nullable fix: ' + sql.substring(0,60));
    });
});
// ── Fix: fleetrun — permitir NULL en columnas legacy NOT NULL ─────────────
['ALTER TABLE fleetrun MODIFY COLUMN placa VARCHAR(20) NULL DEFAULT \'\''
].forEach(function(sql) {
    db.query(sql, function(e) {
        if (!e) console.log('✅ fleetrun nullable fix: ' + sql.substring(0,60));
        else if (e.code !== 'ER_DUP_FIELDNAME') console.warn('WARN:', e.message);
    });
});

// ── Fix: inspecciones — km_tablero nullable para importación ─────────────
db.query('ALTER TABLE inspecciones MODIFY COLUMN km_tablero INT NULL DEFAULT NULL', function(e) {
    if (!e) console.log('✅ inspecciones km_tablero nullable');
    else if (e.code !== 'ER_NO_SUCH_TABLE') console.warn('WARN km_tablero:', e.message);
});
// ── Fix: normalizar marca a UPPERCASE en tipos_mantenimiento ──────────────
db.query(
    `UPDATE tipos_mantenimiento SET marca = UPPER(TRIM(marca)) WHERE marca != UPPER(TRIM(marca)) OR marca != TRIM(marca)`,
    (e) => { if (!e) console.log('✅ tipos_mantenimiento.marca normalizada a UPPERCASE'); }
);
// ── Fix: corregir frecuencia_km — paso 1: limpiar valores con coma ('20,000.00' → 20000)
db.query(
    `UPDATE tipos_mantenimiento
     SET frecuencia_km = CAST(REPLACE(CONVERT(frecuencia_km, CHAR), ',', '') AS DECIMAL(10,0))
     WHERE CONVERT(frecuencia_km, CHAR) LIKE '%,%'`,
    (e, r) => {
        if (e) console.error('❌ fix frecuencia_km coma:', e.message);
        else if (r && r.affectedRows > 0) console.log('✅ frecuencia_km: quitadas comas en', r.affectedRows, 'registros');
        else console.log('✅ frecuencia_km: sin valores con coma');
        // Paso 2: multiplicar x1000 los valores que quedaron con ceros faltantes (< 1000)
        db.query(
            `UPDATE tipos_mantenimiento SET frecuencia_km = frecuencia_km * 1000
             WHERE frecuencia_km > 0 AND frecuencia_km < 1000`,
            (e2, r2) => {
                if (e2) console.error('❌ fix frecuencia_km x1000:', e2.message);
                else if (r2 && r2.affectedRows > 0) console.log('✅ frecuencia_km corregida x1000 en', r2.affectedRows, 'registros');
                else console.log('✅ frecuencia_km ya estaba correcta (sin cambios)');
            }
        );
    }
);
// ── Fix: corregir encoding UTF-8 corrupto en tipos_mantenimiento ──────────
const _encFixes = [
    ["CampaÃ±a",  "Campaña"],  ["CorreccioÌ€n", "Corrección"],
    ["ProteccioÌ€n","Protección"],["InspecciÃ³n","Inspección"],
    ["reparaciÃ³n","reparación"],["cambioÂ",    "cambio"],
    ["Ã³",        "ó"],         ["Ã©",         "é"],
    ["Ãº",        "ú"],         ["Ãñ",         "ñ"],
];
_encFixes.forEach(([bad, good]) => {
    db.query(
        `UPDATE tipos_mantenimiento SET tipo = REPLACE(tipo, ?, ?) WHERE tipo LIKE CONCAT('%', ?, '%')`,
        [bad, good, bad],
        (e) => { if (e) console.error('encoding fix error:', e.message); }
    );
    db.query(
        `UPDATE tipos_mantenimiento SET descripcion = REPLACE(descripcion, ?, ?) WHERE descripcion LIKE CONCAT('%', ?, '%')`,
        [bad, good, bad],
        (e) => { if (e) console.error('encoding fix error:', e.message); }
    );
});
// ── Migración: columna metrica en placas (km vs horas motor) ──────────────
db.query(
    `ALTER TABLE placas ADD COLUMN metrica ENUM('km','horas') NOT NULL DEFAULT 'km'`,
    (e) => { if (!e || e.code === 'ER_DUP_FIELDNAME') console.log('✅ placas.metrica verificada'); }
);
// ── Nueva tabla: almacen_familias (fire-and-forget) ──────────────────────────
db.query(
    `CREATE TABLE IF NOT EXISTS almacen_familias (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        nombre      VARCHAR(100) NOT NULL UNIQUE,
        descripcion VARCHAR(200) NULL,
        activo      TINYINT(1) NOT NULL DEFAULT 1,
        orden       INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    (e) => {
        if (e) console.warn('CREATE almacen_familias:', e.message);
        else {
            console.log('✅ Tabla almacen_familias verificada');
            db.query(`SELECT COUNT(*) AS n FROM almacen_familias`, (e2, rows) => {
                if (!e2 && rows[0].n === 0) {
                    const defs = [['FILTROS',1],['LUBRICANTES',2],['NEUMATICOS',3],['HERRAMIENTAS',4],['REPUESTOS',5],['ELECTRICO',6],['CONSUMIBLES',7],['EPP',8],['QUIMICOS',9],['LIMPIEZA',10]];
                    db.query(`INSERT IGNORE INTO almacen_familias (nombre, orden) VALUES ?`, [defs], () => {});
                }
            });
        }
    }
);
// ── Nueva tabla: almacen_marcas (fire-and-forget) ─────────────────────────────
db.query(
    `CREATE TABLE IF NOT EXISTS almacen_marcas (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        nombre      VARCHAR(100) NOT NULL UNIQUE,
        descripcion VARCHAR(200) NULL,
        activo      TINYINT(1) NOT NULL DEFAULT 1,
        orden       INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    (e) => {
        if (e) console.warn('CREATE almacen_marcas:', e.message);
        else {
            console.log('✅ Tabla almacen_marcas verificada');
            db.query(`SELECT COUNT(*) AS n FROM almacen_marcas`, (e2, rows) => {
                if (!e2 && rows[0].n === 0) {
                    const defs = [['3M',1],['WIX',2],['MANN',3],['VOLVO',4],['FLEETGUARD',5],['DONALDSON',6],['MAHLE',7],['BOSCH',8],['CASTROL',9],['MOBIL',10]];
                    db.query(`INSERT IGNORE INTO almacen_marcas (nombre, orden) VALUES ?`, [defs], () => {});
                }
            });
        }
    }
);
// ── Nuevas tablas: almacen_unidades y almacen_sistemas (fire-and-forget) ──────
db.query(
    `CREATE TABLE IF NOT EXISTS almacen_unidades (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        nombre      VARCHAR(20) NOT NULL UNIQUE,
        descripcion VARCHAR(200) NULL,
        activo      TINYINT(1) NOT NULL DEFAULT 1,
        orden       INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    (e) => {
        if (e) console.warn('CREATE almacen_unidades:', e.message);
        else {
            console.log('✅ Tabla almacen_unidades verificada');
            // Insertar unidades por defecto si la tabla está vacía
            db.query(`SELECT COUNT(*) AS n FROM almacen_unidades`, (e2, rows) => {
                if (!e2 && rows[0].n === 0) {
                    const defaults = [['UND','Unidades',1],['LT','Litros',2],['KG','Kilogramos',3],['GL','Galones',4],['JGO','Juego',5],['PAR','Par',6],['MT','Metros',7],['M2','Metro cuadrado',8],['M3','Metro cúbico',9]];
                    db.query(`INSERT IGNORE INTO almacen_unidades (nombre, descripcion, orden) VALUES ?`, [defaults], () => {});
                }
            });
        }
    }
);
db.query(
    `CREATE TABLE IF NOT EXISTS almacen_sistemas (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        nombre      VARCHAR(100) NOT NULL UNIQUE,
        sub_sistemas JSON NULL,
        activo      TINYINT(1) NOT NULL DEFAULT 1,
        orden       INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    (e) => {
        if (e) console.warn('CREATE almacen_sistemas:', e.message);
        else {
            console.log('✅ Tabla almacen_sistemas verificada');
            // Insertar sistemas por defecto
            db.query(`SELECT COUNT(*) AS n FROM almacen_sistemas`, (e2, rows) => {
                if (!e2 && rows[0].n === 0) {
                    const defaults = [
                        ['MOTOR',      JSON.stringify(['ACEITE MOTOR','REFRIGERACIÓN','TURBO','INYECCION','DISTRIBUCION']),    1],
                        ['TRANSMISION',JSON.stringify(['CAJA DE CAMBIOS','EMBRAGUE','EJE CARDAN','DIFERENCIAL']),              2],
                        ['FRENOS',     JSON.stringify(['PASTILLAS','DISCOS','TAMBORES','LIQUIDO FRENOS']),                     3],
                        ['DIRECCION',  JSON.stringify(['CREMALLERA','TERMINALES','BOMBA DIRECCION']),                          4],
                        ['SUSPENSION', JSON.stringify(['AMORTIGUADORES','RESORTES','BUJES']),                                  5],
                        ['ELECTRICIDAD',JSON.stringify(['BATERIA','ALTERNADOR','ARRANQUE','FUSIBLES']),                       6],
                        ['NEUMATICO',  JSON.stringify(['LLANTA','ARO','VALVULA']),                                             7],
                        ['CARROCERIA', JSON.stringify(['PARACHOQUE','ESPEJO','LUNA','PUERTA']),                                8],
                        ['LUBRICANTES',JSON.stringify(['ACEITE MOTOR','ACEITE CAJA','GRASA']),                                 9],
                        ['HERRAMIENTAS',JSON.stringify(['HERRAMIENTA MANUAL','HERRAMIENTA ELECTRICA']),                      10],
                        ['SSOMA',      JSON.stringify(['EPP','SEÑALIZACION','EXTINTOR']),                                     11],
                        ['CONSUMIBLES',JSON.stringify(['LIMPIEZA','ADHESIVOS','SELLANTES']),                                  12],
                    ];
                    db.query(`INSERT IGNORE INTO almacen_sistemas (nombre, sub_sistemas, orden) VALUES ?`, [defaults], () => {});
                }
            });
        }
    }
);
// ── Tabla historial de cambios por placa ─────────────────────────────────────
db.query(
    `CREATE TABLE IF NOT EXISTS placa_auditoria (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        placa       VARCHAR(20)  NOT NULL,
        campo       VARCHAR(60)  NOT NULL,
        valor_ant   TEXT,
        valor_nuevo TEXT,
        usuario     VARCHAR(100),
        ip          VARCHAR(80),
        fecha       TIMESTAMP    NOT NULL DEFAULT NOW(),
        INDEX idx_placa (placa),
        INDEX idx_fecha  (fecha)
    ) COMMENT 'Historial de cambios por placa'`,
    (e) => {
        if (e) console.warn('CREATE placa_auditoria:', e.message);
        else   console.log('✅ Tabla placa_auditoria verificada');
    }
);
// ── Nodemailer: transporter de correo ─────────────────────────────────────
const mailTransporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST       || 'smtp.gmail.com',
    port:   parseInt(process.env.EMAIL_PORT_SMTP) || 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER || '',
        pass: process.env.EMAIL_PASS || ''
    },
    tls: { rejectUnauthorized: false }
});

// ── Función de envío de email ─────────────────────────────────────────────
async function enviarEmailAlerta(para, asunto, htmlBody) {
    if (!process.env.EMAIL_USER || process.env.EMAIL_USER.includes('correo@')) {
        console.log(`[Email DEMO] Para: ${para} | Asunto: ${asunto}`);
        return { demo: true };
    }
    return mailTransporter.sendMail({
        from:    process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to:      para,
        subject: asunto,
        html:    htmlBody
    });
}

// ── Scheduler de alertas de retraso (+1/+3/+7 días) ──────────────────────
// Corre una vez al día (cada 24h), revisa planes vencidos y manda emails
async function verificarAlertasRetraso() {
    const hoy = new Date().toISOString().split('T')[0];
    // Planes activos cuya fecha_fin_ventana ya pasó
    db.query(
        `SELECT p.*, pl.cliente, pl.marca
         FROM planificacion p
         LEFT JOIN placas pl ON pl.placa = p.placa
         WHERE p.estado IN ('Programada','Confirmada','En Progreso')
         AND p.fecha_fin_ventana < ?`,
        [hoy],
        async (err, planes) => {
            if (err || !planes.length) return;

            // Destinatarios activos
            db.query(`SELECT * FROM destinatarios_alertas WHERE activo=1`, async (err2, dest) => {
                if (err2 || !dest.length) return;

                for (const plan of planes) {
                    const diasRetraso = Math.round(
                        (new Date(hoy) - new Date(plan.fecha_fin_ventana)) / 86400000
                    );
                    if (!diasRetraso || isNaN(diasRetraso) || diasRetraso < 1) continue;

                    const nivel = diasRetraso >= 7 ? 3 : diasRetraso >= 3 ? 2 : 1;
                    const yaEnviados = plan.alertas_enviadas || 0;
                    if (yaEnviados >= nivel) continue; // ya se notificó este nivel

                    const destinatariosFiltrados = dest.filter(d =>
                        (nivel === 1 && d.notif_1d) ||
                        (nivel === 2 && d.notif_3d) ||
                        (nivel === 3 && d.notif_7d)
                    );
                    if (!destinatariosFiltrados.length) continue;

                    const etiqueta  = nivel === 3 ? '🔴 CRÍTICO' : nivel === 2 ? '🟠 URGENTE' : '🟡 AVISO';
                    const htmlEmail =
                        `<div style="font-family:Arial,sans-serif; max-width:600px;">
                         <h2 style="color:#ef4444;">${etiqueta} — Plan de Mantenimiento Atrasado</h2>
                         <table style="width:100%; border-collapse:collapse; font-size:14px;">
                           <tr><td style="padding:6px; background:#f8fafc; font-weight:bold;">Placa</td><td style="padding:6px;">${plan.placa}</td></tr>
                           <tr><td style="padding:6px; background:#f8fafc; font-weight:bold;">Cliente</td><td style="padding:6px;">${plan.cliente || '—'}</td></tr>
                           <tr><td style="padding:6px; background:#f8fafc; font-weight:bold;">Tipo MP</td><td style="padding:6px;">${plan.tipo_mp}</td></tr>
                           <tr><td style="padding:6px; background:#f8fafc; font-weight:bold;">Ventana</td><td style="padding:6px;">${plan.fecha_inicio_ventana} → ${plan.fecha_fin_ventana}</td></tr>
                           <tr><td style="padding:6px; background:#f8fafc; font-weight:bold;">Días de retraso</td><td style="padding:6px; color:#ef4444; font-weight:bold;">${diasRetraso} días</td></tr>
                           <tr><td style="padding:6px; background:#f8fafc; font-weight:bold;">Técnico</td><td style="padding:6px;">${plan.tecnico_asignado || 'Sin asignar'}</td></tr>
                           <tr><td style="padding:6px; background:#f8fafc; font-weight:bold;">Plan ID</td><td style="padding:6px;">${plan.id}</td></tr>
                         </table>
                         <p style="margin-top:16px; color:#64748b; font-size:12px;">— Sistema Azkell Fleet | Alerta automática</p>
                         </div>`;

                    const promesas = destinatariosFiltrados.map(d =>
                        enviarEmailAlerta(d.correo, `${etiqueta} — ${plan.placa} ${plan.tipo_mp} (+${diasRetraso}d)`, htmlEmail)
                            .catch(e => console.warn(`Email error a ${d.correo}:`, e.message))
                    );
                    await Promise.all(promesas);

                    // Registrar nivel de alerta enviada
                    db.query(
                        `UPDATE planificacion SET alertas_enviadas=?,
                         fecha_primer_retraso=COALESCE(fecha_primer_retraso,?) WHERE id=?`,
                        [nivel, hoy, plan.id]
                    );
                    console.log(`📧 Alerta nivel ${nivel} enviada: ${plan.id} (${plan.placa} ${plan.tipo_mp}, +${diasRetraso}d)`);
                }
            });
        }
    );
}

// Correr scheduler una vez al día (cada 24 horas)
setInterval(verificarAlertasRetraso, 24 * 60 * 60 * 1000);
// Correr también al arrancar (con 30s de delay para que el pool esté listo)
setTimeout(verificarAlertasRetraso, 30000);

// ============================================================
// 🚨 MIDDLEWARE RBAC (Control de Acceso Basado en Roles)
// ============================================================
const globalRBAC = require('./rbac');

function requirePerm(modulo, accion) {
    // Retenemos requirePerm como stub vacío en caso de que alguna ruta antigua lo llame
    return (req, res, next) => next();
}

function logAudit(usuario, modulo, accion, detalle) {
    db.query(
        'INSERT INTO auditoria (usuario, modulo, accion, detalle) VALUES (?, ?, ?, ?)',
        [usuario || 'sistema', modulo || '', accion || '', detalle || ''],
        (err) => { if (err) console.warn('Audit log error:', err.message); }
    );
}

// ============================================================
// 📡 SSE — SINCRONIZACIÓN EN TIEMPO REAL
// ============================================================
const sseClients = new Set();

// ============================================================
// 🔑 MIDDLEWARE DE AUTENTICACIÓN JWT
// ============================================================
function verifyToken(req, res, next) {
    const PUBLIC_PATHS = ['/login', '/ping', '/eventos', '/test-s3', '/seguridad/limpiar-plantillas'];
    if (PUBLIC_PATHS.includes(req.path)) return next();
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' });
    try {
        req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
        next();
    } catch(e) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}
app.use('/api', verifyToken);
app.use('/api', globalRBAC);

// ============================================================
// 🛡️ MIDDLEWARE RBAC (Control de Acceso Basado en Roles)
// ============================================================
function requirePerm(modulo, accion) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'No autenticado' });
        if (req.user.rol === 'Fundador') return next();
        try {
            let p = typeof req.user.permisos === 'string' ? JSON.parse(req.user.permisos) : req.user.permisos;
            if (p.admin === true) return next();
            let m = p[modulo];
            if (!m) return res.status(403).json({ error: `Acceso denegado al módulo: ${modulo}` });
            if (m[accion] === 1 || m[accion] === true) return next();
            return res.status(403).json({ error: 'Permisos insuficientes para esta acción en el servidor' });
        } catch (e) {
            return res.status(403).json({ error: 'Error de permisos' });
        }
    };
}

setInterval(() => {
    sseClients.forEach(c => {
        try { c.write(': ping\n\n'); } catch(e) { sseClients.delete(c); }
    });
}, 30000);

app.get('/api/eventos', (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    res.write('data: {"tipo":"conectado"}\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
});

function broadcast(modulo, accion, detalle) {
    const payload = Object.assign({ modulo, accion }, detalle || {});
    const msg = `event: datos-actualizados\ndata: ${JSON.stringify(payload)}\n\n`;
    sseClients.forEach(c => {
        try { c.write(msg); } catch(e) { sseClients.delete(c); }
    });
}

// ============================================================
// ⏰ RUTA DESPERTADOR (MANTIENE VIVO A RENDER Y AIVEN)
// ============================================================
app.get('/api/ping', (req, res) => {
    db.query("SELECT 1", (err) => {
        if (err) {
            console.error("Error en el Ping a la BD:", err.message);
            return res.status(500).send("Render está despierto, pero Aiven falló.");
        }
        res.status(200).send("¡Pong! Render y Aiven están 100% despiertos.");
    });
});

// ============================================================
// 🔐 API DE LOGIN (CON DETECTOR DE ERRORES EXACTO)
// ============================================================
app.post('/api/login', (req, res) => {
    const { correo, password } = req.body;
    const sql = `
        SELECT u.*, r.permisos_json AS rol_permisos, r.nombre AS rol_nombre,
               r.color AS rol_color, r.es_admin AS rol_es_admin, r.id AS rol_id_fk
        FROM usuarios u
        LEFT JOIN roles r ON u.rol_id = r.id
        WHERE u.correo = ?`;

    db.query(sql, [correo], async (err, results) => {
        if (err) {
            console.error("🚨 FALLO EN LOGIN SQL:", err.message);
            return res.status(500).json({ exito: false, mensaje: "Error BD: " + err.code });
        }

        if (results.length > 0) {
            const usuario = results[0];

            // Verificación gradual: hash bcrypt o texto plano
            const esHash = usuario.password && (usuario.password.startsWith('$2b$') || usuario.password.startsWith('$2a$'));
            let passwordValida = false;
            if (esHash) {
                passwordValida = await bcrypt.compare(password, usuario.password);
            } else {
                passwordValida = (usuario.password === password);
                if (passwordValida) {
                    const hashed = await bcrypt.hash(password, 10);
                    db.query('UPDATE usuarios SET password=? WHERE correo=?', [hashed, correo]);
                }
            }

            if (passwordValida) {
                if (usuario.estado === 'Inactivo' && correo.toLowerCase() !== 'admin@azkell.com') {
                    return res.json({ exito: false, mensaje: "Cuenta inactiva." });
                }

                let permisosFinales;
                let rolFinal = usuario.rol || "Personalizado";

                if (correo.toLowerCase() === 'admin@azkell.com') {
                    permisosFinales = JSON.stringify({ admin: true });
                    rolFinal = "Fundador";
                } else if (usuario.rol_id && usuario.rol_es_admin) {
                    permisosFinales = JSON.stringify({ admin: true });
                    rolFinal = usuario.rol_nombre || "Administrador";
                } else if (usuario.rol_id && usuario.rol_permisos) {
                    permisosFinales = usuario.rol_permisos;
                    rolFinal = usuario.rol_nombre || "Personalizado";
                } else {
                    permisosFinales = usuario.permisos_json || "{}";
                }

                // Registrar actividad de sesión
                const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '?';
                const ua = req.headers['user-agent'] || '';
                let dispositivo = 'PC';
                if (/Mobile|Android|iPhone|iPad/i.test(ua)) {
                    if (/iPhone/i.test(ua)) dispositivo = 'iPhone';
                    else if (/iPad/i.test(ua)) dispositivo = 'iPad';
                    else if (/Android/i.test(ua)) dispositivo = 'Android';
                    else dispositivo = 'Móvil';
                } else if (/Chrome/i.test(ua)) dispositivo = 'Chrome (PC)';
                else if (/Firefox/i.test(ua)) dispositivo = 'Firefox (PC)';
                else if (/Safari/i.test(ua)) dispositivo = 'Safari (PC)';
                else if (/Edg/i.test(ua)) dispositivo = 'Edge (PC)';

                db.query(
                    'UPDATE usuarios SET ultimo_acceso=NOW(), ultimo_ip=?, ultimo_dispositivo=? WHERE correo=?',
                    [ip, dispositivo, correo],
                    (err) => { if (err) console.warn('UPDATE sesion:', err.message); }
                );

                return res.json({
                    exito: true,
                    token: jwt.sign(
                        { id: usuario.idUsuario, correo: usuario.correo, rol: rolFinal, permisos: permisosFinales },
                        process.env.JWT_SECRET,
                        { expiresIn: '12h' }
                    ),
                    nombre: usuario.nombre,
                    rol: rolFinal,
                    permisos: permisosFinales,
                    rol_color: usuario.rol_color || null,
                    rol_id: usuario.rol_id || null
                });
            } else { return res.json({ exito: false, mensaje: "Contraseña incorrecta." }); }
        } else { return res.json({ exito: false, mensaje: "El correo no está registrado." }); }
    });
});

// ============================================================
// 🚀 RUTAS TALLER Y MANTENIMIENTO (deben ir ANTES del legacy wildcard)
// ============================================================
const tallerRoutes = require('./routes/taller')(db, logAudit, _generarCodigoAlmacen);
app.use('/api', tallerRoutes);

// ============================================================
// 🛡️ RUTAS SEGURIDAD (Unidades checklist + Asistencia QR)
// ============================================================
const seguridadRoutes = require('./routes/seguridad')(db, logAudit);
app.use('/api', seguridadRoutes);

const mantenimientoRoutes = require('./routes/mantenimiento')(db, logAudit);
app.use('/api/mantenimiento', mantenimientoRoutes);

// (legacyRoutes se movió más abajo para no interceptar los endpoints que siguen)

app.get('/api/cat-rampas', (req, res) => {
    db.query('SELECT * FROM cat_rampas ORDER BY orden ASC, id ASC', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/cat-rampas', (req, res) => {
    const { nombre_rampa, sede } = req.body;
    if (!nombre_rampa) return res.status(400).json({ error: 'nombre_rampa requerido' });
    db.query('INSERT INTO cat_rampas (nombre_rampa, sede, estado) VALUES (?,?,?)',
        [nombre_rampa.trim(), sede || 'Principal', 'Disponible'], (err, r) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true, id: r.insertId });
    });
});

// Reordenar rampas: body = [{id, orden}, ...]
app.put('/api/cat-rampas/reorder', (req, res) => {
    const items = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items requeridos' });
    const updates = items.map(item =>
        new Promise((resolve, reject) =>
            db.query('UPDATE cat_rampas SET orden=? WHERE id=?', [item.orden, item.id],
                (err) => err ? reject(err) : resolve())
        )
    );
    Promise.all(updates)
        .then(() => res.json({ ok: true }))
        .catch(err => res.status(500).json({ error: err.message }));
});

app.put('/api/cat-rampas/:id', (req, res) => {
    const { nombre_rampa, estado } = req.body;
    const sets = [];
    const vals = [];
    if (nombre_rampa !== undefined) { sets.push('nombre_rampa=?'); vals.push(nombre_rampa.trim()); }
    if (estado !== undefined) { sets.push('estado=?'); vals.push(estado); }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    vals.push(req.params.id);
    db.query(`UPDATE cat_rampas SET ${sets.join(',')} WHERE id=?`, vals, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

app.delete('/api/cat-rampas/:id', (req, res) => {
    db.query('SELECT COUNT(*) AS cnt FROM taller_rampas WHERE rampa=? AND estado="Activo"', [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (rows[0].cnt > 0) return res.status(400).json({ error: 'La rampa tiene unidades activas. Libéralas primero.' });
        db.query('DELETE FROM cat_rampas WHERE id=?', [req.params.id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ ok: true });
        });
    });
});

// A. Obtener Catálogos (Rampas y Situaciones) para el Front-End
app.get('/api/catalogos_taller', (req, res) => {
    const sqlRampas = "SELECT * FROM cat_rampas ORDER BY orden ASC, id ASC";
    const sqlSituaciones = "SELECT * FROM cat_situaciones ORDER BY id ASC";
    db.query(sqlRampas, (err1, rampas) => {
        if (err1) return res.status(500).json({ error: err1.message });
        db.query(sqlSituaciones, (err2, situaciones) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ rampas, situaciones });
        });
    });
});

// CRUD cat_situaciones  (columnas reales: id, codigo, descripcion)
app.post('/api/cat-situaciones', (req, res) => {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'nombre es requerido' });
    const desc = nombre.trim();
    const cod  = desc.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').substring(0, 20);
    db.query('INSERT INTO cat_situaciones (codigo, descripcion) VALUES (?, ?)',
        [cod, desc],
        (err, r) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, id: r.insertId });
        });
});

app.put('/api/cat-situaciones/:id', (req, res) => {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'nombre es requerido' });
    const desc = nombre.trim();
    const cod  = desc.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').substring(0, 20);
    db.query('UPDATE cat_situaciones SET codigo=?, descripcion=? WHERE id=?',
        [cod, desc, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
});

app.delete('/api/cat-situaciones/:id', (req, res) => {
    db.query('DELETE FROM cat_situaciones WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// Buscar OT por ticket_entrada (para autocompletar placa en Salidas)
app.get('/api/ordenes/by-ticket', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Falta id' });
    db.query(
        'SELECT ticket_entrada, placa FROM ordenes_trabajo WHERE ticket_entrada = ? LIMIT 1',
        [id.trim()],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows[0] || null);
        }
    );
});

app.get('/api/ordenes', (req, res) => {
    db.query("SELECT * FROM ordenes_trabajo ORDER BY fecha_ingreso DESC", (err, results) => {
        if (err) return res.status(500).json({ error: "Error MySQL: " + err.message });
        res.json({ data: results });
    });
});

// B. Crear nueva Visita/OT con ID Inteligente (OT-0001-2026)
app.post('/api/ordenes', (req, res) => {
    // 1. Recibimos las nuevas fechas estimadas
    const { placa, fecha, hora, fecha_est, hora_est, km, combustible, motivo, id_rampa, id_situacion, usuario } = req.body;
    if (!placa) return res.status(400).json({ error: "Falta placa" });

    const ticket_entrada = 'TKT-' + Date.now();
    const currentYear = new Date().getFullYear();

    db.query("SELECT ultimo_valor, anio FROM secuencias WHERE tipo = 'OT'", (errSeq, rows) => {
        if (errSeq) return res.status(500).json({ error: "Error secuencias: " + errSeq.message });

        let ultimo = rows.length > 0 ? rows[0].ultimo_valor : 0;
        let dbYear = rows.length > 0 ? rows[0].anio : currentYear;
        if (dbYear !== currentYear) ultimo = 0;
        ultimo += 1;

        const nuevoIdOT = "OT-" + currentYear + "-" + String(ultimo).padStart(4, "0");

        db.query("UPDATE secuencias SET ultimo_valor = ?, anio = ? WHERE tipo = 'OT'", [ultimo, currentYear], (errUpd) => {
            if (errUpd) return res.status(500).json({ error: "Error update seq: " + errUpd.message });

            const detalles = {
                km_ingreso: km, combustible: combustible, motivo: motivo,
                historial: [{ fase: 'Recepción', fecha: new Date().toISOString(), usuario: usuario || 'Admin' }]
            };

            // 2. Ensamblamos las fechas para SQL
            const fechaHoraSQL = (fecha && hora) ? `${fecha} ${hora}:00` : new Date().toISOString().slice(0, 19).replace('T', ' ');
            const fechaHoraEstSQL = (fecha_est && hora_est) ? `${fecha_est} ${hora_est}:00` : null;

            // 3. Insertamos usando la columna correcta: fecha_hora_salida
            const sql = `INSERT INTO ordenes_trabajo (ticket_entrada, id_ot, placa, estado, id_situacion, id_rampa, detalles_json, creado_por, fecha_ingreso, fecha_hora_salida) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            db.query(sql, [ticket_entrada, nuevoIdOT, placa, 'Recepción', id_situacion || null, id_rampa || null, JSON.stringify(detalles), usuario || 'Admin', fechaHoraSQL, fechaHoraEstSQL], (errInsert) => {
                if (errInsert) return res.status(500).json({ error: "Error guardando OT: " + errInsert.message });
                res.json({ data: 'Éxito', id_ot: nuevoIdOT });
            });
        });
    });
});

// C. Crear una nueva Visita al Taller (Con Correlativo Inteligente ST-0001-YYYY)
app.post('/api/taller/ingreso', (req, res) => {
    const data = req.body;

    db.query("SELECT COUNT(*) as total FROM ordenes_trabajo WHERE YEAR(fecha_ingreso) = YEAR(CURDATE())", (err, counts) => {
        if (err) return res.status(500).json({ error: err.message });

        const nextNum = (counts[0].total + 1).toString().padStart(4, '0');
        const year = new Date().getFullYear();
        const correlativoID = `ST-${year}-${nextNum}`;

        const detallesObj = { km: parseFloat(data.kilometraje) || 0 };
        const sql = `INSERT INTO ordenes_trabajo
            (ticket_entrada, placa, id_rampa, tipo_trabajo, descripcion_falla, conductor, kilometraje, detalles_json, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EN ESPERA')`;

        db.query(sql, [correlativoID, data.placa, data.id_rampa, data.tipo_trabajo, data.descripcion_falla, data.conductor, data.kilometraje, JSON.stringify(detallesObj)], (err) => {
            if (err) return res.status(500).json({ error: err.message });

            if (data.generar_ot) {
                const id_ot_hija = `OT-${nextNum}-${year}`;
                db.query(
                    "INSERT INTO trabajos_ot (id_ot, ticket_visita, tipo_ot, sub_tipo, estado) VALUES (?, ?, ?, ?, 'Recepción')",
                    [id_ot_hija, correlativoID, 'Correctivo', 'Mecánica General'],
                    (errOT) => {
                        if (errOT) return res.status(500).json({ error: errOT.message });
                        res.json({ data: 'Ingreso y OT generados con éxito', ticket: correlativoID });
                    }
                );
            } else {
                res.json({ data: 'Ingreso generado con éxito', ticket: correlativoID });
            }
        });
    });
});

// 3. Actualizar y Avanzar de Fase la Orden (PUT)
// 3. Actualizar y Avanzar de Fase la Orden V2 (PUT)
app.put('/api/ordenes/:ticket_entrada', (req, res) => {
    const { ticket_entrada } = req.params;
    const { estado, nuevosDetalles, tecnico_asignado, usuario } = req.body;

    db.query("SELECT detalles_json FROM ordenes_trabajo WHERE ticket_entrada = ?", [ticket_entrada], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ error: "OT no encontrada" });

        let detalles = {};
        try { detalles = JSON.parse(results[0].detalles_json || '{}'); } catch(e) {}

        detalles = { ...detalles, ...nuevosDetalles };

        if (!detalles.historial) detalles.historial = [];
        detalles.historial.push({ fase: estado, fecha: new Date().toISOString(), usuario: usuario || 'Admin' });

        let sql = "UPDATE ordenes_trabajo SET estado = ?, detalles_json = ?";
        let params = [estado, JSON.stringify(detalles)];

        if (tecnico_asignado) {
            sql += ", tecnico_asignado = ?";
            params.push(tecnico_asignado);
        }

        sql += " WHERE ticket_entrada = ?";
        params.push(ticket_entrada);

        db.query(sql, params, (errUpdate) => {
            if (errUpdate) return res.status(500).json({ error: errUpdate.message });
            res.json({ data: 'Éxito' });
        });
    });
});

// ============================================================
// MÓDULO BACKLOG MAESTRO (MANTENIMIENTOS PENDIENTES)
// ============================================================

// C. Guardar un nuevo pendiente en el Backlog
app.post('/api/backlog', (req, res) => {
    const { placa, trabajo_pendiente, fuente, usuario } = req.body;
    const sql = "INSERT INTO backlog_mantenimiento (placa, trabajo_pendiente, fuente, creado_por) VALUES (?, ?, ?, ?)";
    db.query(sql, [placa, trabajo_pendiente, fuente || 'Taller (OT)', usuario || 'Admin'], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: 'Guardado con éxito' });
    });
});

// D. Leer el historial de pendientes por Placa
app.get('/api/backlog/:placa', (req, res) => {
    const sql = "SELECT * FROM backlog_mantenimiento WHERE placa = ? ORDER BY fecha_deteccion DESC";
    db.query(sql, [req.params.placa], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: results });
    });
});

// E. Actualizar Rampa y Situación (Status General del Vehículo)
app.put('/api/ordenes/:ticket_entrada/ubicacion', (req, res) => {
    const { id_rampa, id_situacion } = req.body;
    const sql = "UPDATE ordenes_trabajo SET id_rampa = ?, id_situacion = ? WHERE ticket_entrada = ?";
    db.query(sql, [id_rampa || null, id_situacion || null, req.params.ticket_entrada], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: 'Ubicación y Situación actualizadas' });
    });
});

// ============================================================
// VISTA MASTER: STATUS GENERAL DEL TALLER
// ============================================================

// F. Obtener la Vista Master de Unidades en Taller
app.get('/api/taller/status', (req, res) => {
    const sql = `
        SELECT
            ot.id_ot, ot.ticket_entrada, ot.placa, ot.fecha_ingreso, ot.fecha_hora_salida, ot.estado AS fase_ot,
            ot.detalles_json, ot.creado_por,
            ot.id_rampa,
            rampa.nombre AS txtRampa,
            situacion.descripcion AS txtSituacion, situacion.id AS idSituacion
        FROM ordenes_trabajo ot
        LEFT JOIN cat_rampas rampa ON ot.id_rampa = rampa.id
        LEFT JOIN cat_situaciones situacion ON ot.id_situacion = situacion.id
        WHERE ot.estado != 'Entregado'
        ORDER BY ot.fecha_ingreso DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: "Error MySQL: " + err.message });
        res.json({ data: results });
    });
});

// H. Eliminar una Visita / Status (y sus OTs hijas)
app.delete('/api/taller/status/:ticket_entrada', (req, res) => {
    db.query("DELETE FROM ordenes_trabajo WHERE ticket_entrada = ?", [req.params.ticket_entrada], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query("DELETE FROM trabajos_ot WHERE ticket_visita = ?", [req.params.ticket_entrada], () => {
            res.json({ data: 'Registro eliminado correctamente' });
        });
    });
});

// ============================================================
// GENERADOR DE ÓRDENES DE TRABAJO (HIJAS DE UNA VISITA)
// ============================================================
app.post('/api/taller/generar_ot', (req, res) => {
    const { ticket_visita, tipo_ot, sub_tipo, usuario } = req.body;
    if (!ticket_visita) return res.status(400).json({ error: "Falta el ID de la Visita" });

    const currentYear = new Date().getFullYear();

    db.query("SELECT ultimo_valor, anio FROM secuencias WHERE tipo = 'OT'", (errSeq, rows) => {
        if (errSeq) return res.status(500).json({ error: "Error en secuencias: " + errSeq.message });

        let ultimo = rows.length > 0 ? rows[0].ultimo_valor : 0;
        let dbYear = rows.length > 0 ? rows[0].anio : currentYear;

        if (dbYear !== currentYear) ultimo = 0;
        ultimo += 1;

        const nuevoIdOT = "OT-" + currentYear + "-" + String(ultimo).padStart(4, "0");

        db.query("UPDATE secuencias SET ultimo_valor = ?, anio = ? WHERE tipo = 'OT'", [ultimo, currentYear], (errUpd) => {
            if (errUpd) return res.status(500).json({ error: "Error actualizando secuencia: " + errUpd.message });

            const detalles = {
                historial: [{ fase: 'Recepción', fecha: new Date().toISOString(), usuario: usuario || 'Admin' }]
            };

            const sql = `INSERT INTO trabajos_ot (id_ot, ticket_visita, tipo_ot, sub_tipo, estado, detalles_json, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?)`;

            db.query(sql, [nuevoIdOT, ticket_visita, tipo_ot || 'Correctivo', sub_tipo || 'Falla', 'Recepción', JSON.stringify(detalles), usuario || 'Admin'], (errInsert) => {
                if (errInsert) return res.status(500).json({ error: "Error guardando OT hija: " + errInsert.message });
                res.json({ data: 'Éxito', id_ot: nuevoIdOT });
            });
        });
    });
});

// G. Obtener solo las OTs Hijas para el Tablero Kanban
app.get('/api/taller/kanban', (req, res) => {
    const sql = `
        SELECT t.*, o.placa, o.id_rampa, r.nombre AS txtRampa
        FROM trabajos_ot t
        JOIN ordenes_trabajo o ON t.ticket_visita = o.ticket_entrada
        LEFT JOIN cat_rampas r ON o.id_rampa = r.id
        WHERE t.estado != 'Entregado'
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: results });
    });
});

// I. Obtener las OTs Hijas de un Ticket de Visita
// L. Obtener los detalles completos de una OT específica
app.get('/api/taller/trabajos/detalle/:id_ot', (req, res) => {
    db.query("SELECT * FROM trabajos_ot WHERE id_ot = ?", [req.params.id_ot], (err, results) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: results[0] || {}});
    });
});

// M. Guardar los Detalles del Trabajo del Mecánico
app.put('/api/taller/trabajos/:id_ot/detalles', (req, res) => {
    const { fecha_trabajo, trabajo_realizado, tecnico, fecha_salida } = req.body;
    const sql = `UPDATE trabajos_ot SET fecha_trabajo = ?, trabajo_realizado = ?, tecnico = ?, fecha_salida = ? WHERE id_ot = ?`;
    db.query(sql, [fecha_trabajo, trabajo_realizado, tecnico, fecha_salida, req.params.id_ot], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: 'Detalles guardados correctamente'});
    });
});

app.get('/api/taller/trabajos/:ticket', (req, res) => {
    db.query("SELECT * FROM trabajos_ot WHERE ticket_visita = ? ORDER BY fecha_creacion DESC", [req.params.ticket], (err, results) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: results});
    });
});

// J. Eliminar una OT Hija específica (Desde el Expediente)
app.delete('/api/taller/trabajos/:id_ot', (req, res) => {
    db.query("DELETE FROM trabajos_ot WHERE id_ot = ?", [req.params.id_ot], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: 'OT eliminada correctamente'});
    });
});

// K. Actualizar el estado (Fase) de una OT Hija en el Kanban
app.put('/api/taller/trabajos/:id_ot/estado', (req, res) => {
    const { estado } = req.body;
    db.query("UPDATE trabajos_ot SET estado = ? WHERE id_ot = ?", [estado, req.params.id_ot], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: 'Estado actualizado correctamente'});
    });
});

// N. Obtener la lista de repuestos de una OT
app.get('/api/taller/trabajos/:id_ot/repuestos', (req, res) => {
    db.query("SELECT * FROM trabajos_ot_repuestos WHERE id_ot = ? ORDER BY id ASC", [req.params.id_ot], (err, results) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: results});
    });
});

// O. Agregar un repuesto/servicio a una OT
app.post('/api/taller/trabajos/:id_ot/repuestos', (req, res) => {
    const { item, cantidad, precio_unitario } = req.body;
    if (!item) return res.status(400).json({ error: 'item es requerido' });
    const total = (parseFloat(cantidad) || 0) * (parseFloat(precio_unitario) || 0);
    const sql = `INSERT INTO trabajos_ot_repuestos (id_ot, item, cantidad, precio_unitario, total) VALUES (?, ?, ?, ?, ?)`;
    db.query(sql, [req.params.id_ot, item.toUpperCase(), cantidad, precio_unitario, total], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: 'Repuesto agregado'});
    });
});

// P. Eliminar un repuesto de la OT
app.delete('/api/taller/repuestos/:id_repuesto', (req, res) => {
    db.query("DELETE FROM trabajos_ot_repuestos WHERE id = ?", [req.params.id_repuesto], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: 'Repuesto eliminado'});
    });
});

// Q. BÓVEDA: Historial unificado de OTs finalizadas (Status + OT + Repuestos)
app.get('/api/taller/historial', (req, res) => {
    const sql = `
        SELECT t.*, o.placa, o.fecha_ingreso, o.fecha_hora_salida,
               (SELECT SUM(total) FROM trabajos_ot_repuestos WHERE id_ot = t.id_ot) as costo_total
        FROM trabajos_ot t
        JOIN ordenes_trabajo o ON t.ticket_visita = o.ticket_entrada
        WHERE t.estado = 'Entregado'
        ORDER BY t.fecha_salida DESC, t.fecha_creacion DESC
        LIMIT 200
    `;
    db.query(sql, (err, results) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: results});
    });
});

// S. Obtener todas las visitas activas para la Tabla Principal (Con Rampas)
app.get('/api/taller/entradas', (req, res) => {
    const sql = `
        SELECT o.*, r.nombre AS txtRampa
        FROM ordenes_trabajo o
        LEFT JOIN cat_rampas r ON o.id_rampa = r.id
        ORDER BY o.fecha_ingreso DESC
    `;
    db.query(sql, (err, results) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: results});
    });
});

// R. ACTUALIZACIÓN RÁPIDA (QUICK-EDIT APPSHEET): Cambiar Situación de Visita
app.put('/api/taller/entradas/:ticket/estado', (req, res) => {
    db.query("UPDATE ordenes_trabajo SET estado = ? WHERE ticket_entrada = ?", [req.body.estado, req.params.ticket], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: 'Situación actualizada correctamente'});
    });
});

// ============================================================
// 📋 MÓDULO AUDITORÍA
// ============================================================
app.get('/api/auditoria', (req, res) => {
    // Garantizar columna modulo antes de consultar
    db.query('ALTER TABLE auditoria ADD COLUMN modulo VARCHAR(50) DEFAULT NULL', () => {
        const { modulo, accion, usuario, limit } = req.query;
        let sql = 'SELECT idAuditoria AS id, fecha, usuario, IFNULL(modulo,\'\') AS modulo, accion, detalle FROM auditoria';
        const params = [];
        const conditions = [];
        if (modulo) { conditions.push('modulo = ?'); params.push(modulo); }
        if (accion) { conditions.push('accion = ?'); params.push(accion); }
        if (usuario) { conditions.push('usuario LIKE ?'); params.push('%' + usuario + '%'); }
        if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
        sql += ' ORDER BY idAuditoria DESC LIMIT ?';
        params.push(Math.min(parseInt(limit) || 300, 500));
        db.query(sql, params, (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: results });
        });
    });
});

// ============================================================
// 🎭 ROLES — CRUD COMPLETO
// ============================================================

app.get('/api/roles', (req, res) => {
    const sql = `
        SELECT r.*, COUNT(u.idUsuario) AS miembros
        FROM roles r
        LEFT JOIN usuarios u ON u.rol_id = r.id
        GROUP BY r.id
        ORDER BY r.orden ASC, r.id ASC`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: results });
    });
});

app.post('/api/roles', (req, res) => {
    const { nombre, color, permisos_json, es_admin, orden } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    db.query(
        'INSERT INTO roles (nombre, color, permisos_json, es_admin, orden) VALUES (?, ?, ?, ?, ?)',
        [nombre, color || '#5865F2', permisos_json || '{}', es_admin ? 1 : 0, orden || 0],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            broadcast('usuarios', 'crear_rol');
            res.json({ data: 'Éxito', id: result.insertId });
        }
    );
});

app.put('/api/roles/:id', (req, res) => {
    const { nombre, color, permisos_json, es_admin, orden } = req.body;
    const { id } = req.params;
    db.query(
        'UPDATE roles SET nombre=?, color=?, permisos_json=?, es_admin=?, orden=? WHERE id=?',
        [nombre, color || '#5865F2', permisos_json || '{}', es_admin ? 1 : 0, orden || 0, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            broadcast('usuarios', 'actualizar_rol');
            res.json({ data: 'Éxito' });
        }
    );
});

app.delete('/api/roles/:id', (req, res) => {
    const { id } = req.params;
    db.query('SELECT COUNT(*) AS cnt FROM usuarios WHERE rol_id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results[0].cnt > 0) return res.status(400).json({ error: `Este rol tiene ${results[0].cnt} usuario(s) asignado(s). Reasígnalos antes de eliminar.` });
        db.query('DELETE FROM roles WHERE id=?', [id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            broadcast('usuarios', 'eliminar_rol');
            res.json({ data: 'Éxito' });
        });
    });
});

// ============================================================
// 👤 USUARIOS v2 — ENDPOINTS MODERNOS
// ============================================================

app.post('/api/usuarios-v2', async (req, res) => {
    const { nombre, cargo, correo, password, estado, rol_id } = req.body;
    if (!correo) return res.status(400).json({ error: 'Correo requerido' });
    const rolId = (rol_id && rol_id !== '') ? parseInt(rol_id) || null : null;
    let rol = 'Personalizado';
    if (correo.trim().toLowerCase() === 'admin@azkell.com') rol = 'Fundador';
    const hashedPassword = password ? await bcrypt.hash(password, 10) : '';
    db.query('SELECT idUsuario FROM usuarios', (err, results) => {
        let maxId = 1000;
        if (!err && results) {
            results.forEach(r => {
                if (r.idUsuario && r.idUsuario.startsWith('USR-')) {
                    let num = parseInt(r.idUsuario.split('-')[1]);
                    if (!isNaN(num) && num > maxId) maxId = num;
                }
            });
        }
        const newId = `USR-${maxId + 1}`;
        db.query(
            'INSERT INTO usuarios (idUsuario, nombre, cargo, correo, password, password_visible, rol, estado, permisos_json, rol_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [newId, nombre || '', cargo || '', correo, hashedPassword, password || '', rol, estado || 'Activo', '{}', rolId],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                broadcast('usuarios', 'crear');
                const usuario = req.body.creado_por || 'admin';
                logAudit(usuario, 'usuarios', 'CREÓ', `${nombre || correo}`);
                res.json({ data: 'Éxito', id: newId });
            }
        );
    });
});

app.put('/api/usuarios-v2/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, cargo, correo, password, estado, rol_id } = req.body;
    const rolId = (rol_id !== undefined && rol_id !== '' && rol_id !== null) ? parseInt(rol_id) || null : null;
    let rol = 'Personalizado';
    if (correo && correo.trim().toLowerCase() === 'admin@azkell.com') rol = 'Fundador';
    const fields = ['nombre=?', 'cargo=?', 'correo=?', 'estado=?', 'rol=?', 'rol_id=?'];
    const values = [nombre || '', cargo || '', correo || '', estado || 'Activo', rol, rolId];
    if (password && password.trim() !== '') {
        const hashedPassword = await bcrypt.hash(password.trim(), 10);
        fields.push('password=?'); values.push(hashedPassword);
        fields.push('password_visible=?'); values.push(password.trim());
    }
    values.push(id);
    db.query(`UPDATE usuarios SET ${fields.join(',')} WHERE idUsuario=?`, values, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        broadcast('usuarios', 'actualizar');
        const editor = req.body.editado_por || 'admin';
        logAudit(editor, 'usuarios', 'MODIFICÓ', `${nombre || correo}`);
        res.json({ data: 'Éxito' });
    });
});

// ============================================================
// 🔑 CAMBIO DE CONTRASEÑA (usuario cambia su propia clave)
// ============================================================
app.post('/api/cambiar-password', async (req, res) => {
    const { correo, passwordActual, passwordNueva } = req.body;
    if (!correo || !passwordActual || !passwordNueva)
        return res.status(400).json({ error: 'Datos incompletos' });
    db.query('SELECT password FROM usuarios WHERE correo=?', [correo], async (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
        const hash = rows[0].password;
        const esHash = hash && (hash.startsWith('$2b$') || hash.startsWith('$2a$'));
        const valida = esHash ? await bcrypt.compare(passwordActual, hash) : (passwordActual === hash);
        if (!valida) return res.status(400).json({ error: 'Contraseña actual incorrecta' });
        const nuevoHash = await bcrypt.hash(passwordNueva, 10);
        db.query('UPDATE usuarios SET password=?, password_visible=? WHERE correo=?',
            [nuevoHash, passwordNueva, correo],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                logAudit(correo, 'usuarios', 'CAMBIÓ CONTRASEÑA', 'Auto-cambio de clave');
                res.json({ data: 'Éxito' });
            });
    });
});

// ============================================================
// ============================================================
// RUTAS PLANIFICACION
// ============================================================
const planificacionRoutes = require('./routes/planificacion')(db, broadcast, logAudit);
app.use('/api', planificacionRoutes);

// ── Cloudinary + Multer (memoria) para imágenes de inventario ─────
const cloudinary = require('cloudinary').v2;
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});
const _multerInv = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB máx
    fileFilter: (req, file, cb) => {
        if (/^image\/(jpeg|jpg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
        cb(new Error('Solo imágenes (jpg, png, webp, gif)'));
    }
});

// ── Helper endpoints para formularios de Almacén ─────────────────
app.get('/api/conductores', (req, res) => {
    db.query("SELECT * FROM conductores ORDER BY estado, nombre", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/conductores-lista', (req, res) => {
    db.query("SELECT idConductor AS id, nombre, dni FROM conductores ORDER BY nombre", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/conductores/importarMasivo', (req, res) => {
    const lista = req.body.conductores || [];
    if (!lista.length) return res.status(400).json({ error: 'Sin datos' });
    let insertados = 0, errores = 0;
    const procesar = (i) => {
        if (i >= lista.length) return res.json({ insertados, errores });
        const c = lista[i];
        if (!c.nombre) { errores++; return procesar(i + 1); }
        db.query(
            'INSERT INTO conductores (nombre, empresa, telefono, dni, licencia, estado) VALUES (?,?,?,?,?,?)',
            [c.nombre, c.empresa||'', c.telefono||'', c.dni||'', c.licencia||'', c.estado||'Activo'],
            (err) => {
                if (err) { errores++; } else { insertados++; }
                procesar(i + 1);
            }
        );
    };
    procesar(0);
});
app.get('/api/placas-lista', (req, res) => {
    db.query("SELECT placa, cliente FROM placas ORDER BY placa", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ── PUT /api/placas/:placa — Editar ficha + auditoría de cambios ──────────────
app.put('/api/placas/:placa', (req, res) => {
    const placa   = req.params.placa;
    const usuario = (req.user?.correo || req.body.usuario_autor || '').substring(0, 100);
    const ip      = (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '').substring(0, 80);
    const campos  = ['cliente','ruc_dni','marca','modelo_uts','tipo','sub_tipo','color',
                     'nro_motor','nro_caja','nro_corona','nro_vin','configuracion','anio',
                     'combustible','carga_util','peso_neto','peso_bruto','estado','uts','motora','llantas','en_uso','metrica'];

    db.query('SELECT * FROM placas WHERE placa=?', [placa], (err, rows) => {
        if (err)  return res.status(500).json({ error: err.message });
        if (!rows.length) return res.status(404).json({ error: 'Placa no encontrada' });

        const actual = rows[0];
        const nuevo  = req.body;

        // Detectar diferencias campo a campo
        const diffs = [];
        campos.forEach(c => {
            const vAnt = actual[c] == null ? '' : String(actual[c]).trim();
            const vNue = nuevo[c]  == null ? '' : String(nuevo[c]).trim();
            if (vAnt !== vNue) diffs.push([placa, c, vAnt, vNue, usuario, ip]);
        });

        // Actualizar la placa
        const sets = campos.map(c => `${c}=?`).join(', ');
        const vals = campos.map(c => nuevo[c] != null ? String(nuevo[c]).trim() : '');
        db.query(`UPDATE placas SET ${sets} WHERE placa=?`, [...vals, placa], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });

            // Insertar diffs en auditoría (fire-and-forget)
            if (diffs.length) {
                db.query(
                    'INSERT INTO placa_auditoria (placa, campo, valor_ant, valor_nuevo, usuario, ip) VALUES ?',
                    [diffs], () => {}
                );
                logAudit(usuario, 'placas', 'editar', `Placa ${placa}: ${diffs.map(d => d[1]).join(', ')}`);
            }
            res.json({ ok: true, cambios: diffs.length });
        });
    });
});

// ── GET /api/placas/:placa/historial ──────────────────────────────────────────
app.get('/api/placas/:placa/historial', (req, res) => {
    db.query(
        `SELECT id, campo, valor_ant, valor_nuevo, usuario, ip, fecha
         FROM placa_auditoria
         WHERE placa = ?
         ORDER BY fecha DESC
         LIMIT 100`,
        [req.params.placa],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// ============================================================
// MÓDULO ALMACÉN — Tablas (fire-and-forget al arrancar)
// ============================================================
db.query(
    `CREATE TABLE IF NOT EXISTS configuracion_almacen (
        clave       VARCHAR(50)  NOT NULL PRIMARY KEY,
        valor       VARCHAR(500) NOT NULL DEFAULT '',
        descripcion VARCHAR(200)
    )`,
    (e) => {
        if (e) console.warn('CREATE configuracion_almacen:', e.message);
        else {
            console.log('✅ Tabla configuracion_almacen verificada');
            db.query(`INSERT IGNORE INTO configuracion_almacen (clave,valor,descripcion) VALUES ('tipo_cambio','3.70','Tipo de cambio USD → PEN')`,
                (e2) => { if (e2) console.warn('INSERT tipo_cambio:', e2.message); });
        }
    }
);
db.query(
    `CREATE TABLE IF NOT EXISTS proveedores_inv (
        id               VARCHAR(20)  NOT NULL PRIMARY KEY,
        nombre           VARCHAR(200) NOT NULL,
        razon_social     VARCHAR(200),
        tipo_documento   ENUM('RUC','DNI','CE','Otro') DEFAULT 'RUC',
        numero_documento VARCHAR(20),
        telefono         VARCHAR(30),
        email            VARCHAR(150),
        direccion        TEXT,
        estado           ENUM('Activo','Inactivo') DEFAULT 'Activo',
        observaciones    TEXT,
        created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    (e) => { if (e) console.warn('CREATE proveedores_inv:', e.message); else console.log('✅ Tabla proveedores_inv verificada'); }
);
db.query(
    `CREATE TABLE IF NOT EXISTS proveedor_marcas_inv (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        proveedor_id VARCHAR(20) NOT NULL,
        marca        VARCHAR(100) NOT NULL,
        INDEX idx_prov (proveedor_id)
    )`,
    (e) => { if (e) console.warn('CREATE proveedor_marcas_inv:', e.message); else console.log('✅ Tabla proveedor_marcas_inv verificada'); }
);
db.query(
    `CREATE TABLE IF NOT EXISTS inventario (
        id                   VARCHAR(20)  NOT NULL PRIMARY KEY,
        descripcion          VARCHAR(400) NOT NULL,
        familia              VARCHAR(100),
        sub_familia          VARCHAR(100),
        almacen              VARCHAR(100),
        unidad               VARCHAR(30),
        moneda               ENUM('PEN','USD') NOT NULL DEFAULT 'PEN',
        costo_referencial    DECIMAL(14,4) NOT NULL DEFAULT 0,
        stock_regularizado   DECIMAL(14,4) NOT NULL DEFAULT 0,
        fecha_regularizacion DATE,
        proveedor_id         VARCHAR(20),
        marca                VARCHAR(100),
        activo               TINYINT(1) NOT NULL DEFAULT 1,
        observaciones        TEXT,
        created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_familia (familia),
        INDEX idx_almacen (almacen),
        INDEX idx_activo  (activo)
    )`,
    (e) => { if (e) console.warn('CREATE inventario:', e.message); else console.log('✅ Tabla inventario verificada'); }
);
// ── Migración inventario: agregar columnas nuevas ─────────────────
[
    'ALTER TABLE inventario ADD COLUMN codigo_item    VARCHAR(100)     NULL DEFAULT NULL',
    'ALTER TABLE inventario ADD COLUMN marca_unidad   VARCHAR(100)     NULL DEFAULT NULL',
    'ALTER TABLE inventario ADD COLUMN sistema        VARCHAR(100)     NULL DEFAULT NULL',
    'ALTER TABLE inventario ADD COLUMN sub_sistema    VARCHAR(100)     NULL DEFAULT NULL',
    'ALTER TABLE inventario ADD COLUMN tipo           ENUM(\'Original\',\'Alternativo\') NULL DEFAULT NULL',
    'ALTER TABLE inventario ADD COLUMN sub_tipo       ENUM(\'Nuevo\',\'Reparado\') NULL DEFAULT NULL',
    'ALTER TABLE inventario ADD COLUMN ubicacion      VARCHAR(150)     NULL DEFAULT NULL',
    'ALTER TABLE inventario ADD COLUMN anaquel        DECIMAL(6,2)     NULL DEFAULT NULL',
    'ALTER TABLE inventario ADD COLUMN stock_min      DECIMAL(14,4)    NOT NULL DEFAULT 0',
    'ALTER TABLE inventario ADD COLUMN stock_max      DECIMAL(14,4)    NOT NULL DEFAULT 0',
    'ALTER TABLE inventario ADD COLUMN estado_art     VARCHAR(50)      NULL DEFAULT \'Activo\'',
    'ALTER TABLE inventario ADD COLUMN codigo_barras  VARCHAR(100)     NULL DEFAULT NULL',
    'ALTER TABLE inventario ADD COLUMN imagen_url     TEXT             NULL DEFAULT NULL',
    'ALTER TABLE inventario ADD COLUMN articulo       VARCHAR(300)     NULL DEFAULT NULL',
    'ALTER TABLE inventario ADD COLUMN codigo_articulo VARCHAR(100)    NULL DEFAULT NULL',
].forEach(sql => {
    db.query(sql, (e) => {
        if (e && e.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER inventario:', e.message);
    });
});
// Ampliar marca_unidad a TEXT para soportar JSON de múltiples marcas
db.query('ALTER TABLE inventario MODIFY COLUMN marca_unidad TEXT NULL DEFAULT NULL', () => {});
db.query(
    `CREATE TABLE IF NOT EXISTS entradas_inv (
        id                   VARCHAR(20) NOT NULL PRIMARY KEY,
        fecha                DATE        NOT NULL,
        proveedor_id         VARCHAR(20),
        proveedor_nombre     VARCHAR(200),
        documento_referencia VARCHAR(100),
        moneda               ENUM('PEN','USD') NOT NULL DEFAULT 'PEN',
        tipo_cambio          DECIMAL(8,4),
        total_pen            DECIMAL(14,4) NOT NULL DEFAULT 0,
        observaciones        TEXT,
        creado_por           VARCHAR(100),
        created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
        INDEX idx_fecha (fecha)
    )`,
    (e) => { if (e) console.warn('CREATE entradas_inv:', e.message); else console.log('✅ Tabla entradas_inv verificada'); }
);
db.query(
    `CREATE TABLE IF NOT EXISTS detalle_entradas_inv (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        entrada_id     VARCHAR(20)  NOT NULL,
        inventario_id  VARCHAR(20)  NOT NULL,
        descripcion    VARCHAR(400),
        cantidad       DECIMAL(14,4) NOT NULL,
        costo_unitario DECIMAL(14,4) NOT NULL DEFAULT 0,
        moneda         ENUM('PEN','USD') NOT NULL DEFAULT 'PEN',
        importe        DECIMAL(14,4) NOT NULL DEFAULT 0,
        INDEX idx_entrada (entrada_id),
        INDEX idx_item    (inventario_id)
    )`,
    (e) => { if (e) console.warn('CREATE detalle_entradas_inv:', e.message); else console.log('✅ Tabla detalle_entradas_inv verificada'); }
);
db.query(
    `CREATE TABLE IF NOT EXISTS salidas_inv (
        id             VARCHAR(20)  NOT NULL PRIMARY KEY,
        fecha          DATE         NOT NULL,
        tipo_destino   ENUM('Vehiculo','Personal') NOT NULL,
        placa          VARCHAR(20),
        responsable    VARCHAR(150),
        responsable_id INT,
        moneda         ENUM('PEN','USD') NOT NULL DEFAULT 'PEN',
        tipo_cambio    DECIMAL(8,4),
        total_pen      DECIMAL(14,4) NOT NULL DEFAULT 0,
        observaciones  TEXT,
        creado_por     VARCHAR(100),
        created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
        INDEX idx_fecha (fecha),
        INDEX idx_placa (placa)
    )`,
    (e) => { if (e) console.warn('CREATE salidas_inv:', e.message); else console.log('✅ Tabla salidas_inv verificada'); }
);
// Migraciones: columnas para Req/Salidas OT
db.query(`ALTER TABLE salidas_inv ADD COLUMN ticket_ot VARCHAR(30) DEFAULT NULL`, (e) => {
    if (e && !e.message.includes('Duplicate column')) console.warn('ALTER salidas_inv ticket_ot:', e.message);
});
db.query(`ALTER TABLE salidas_inv ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'Despachado'`, (e) => {
    if (e && !e.message.includes('Duplicate column')) console.warn('ALTER salidas_inv estado:', e.message);
});
db.query(`ALTER TABLE salidas_inv ADD INDEX idx_ticket_ot (ticket_ot)`, (e) => {});
// inventario_id en detalle_salidas_inv puede ser null (para ítems sin código)
db.query(`ALTER TABLE detalle_salidas_inv MODIFY COLUMN inventario_id VARCHAR(20) NULL DEFAULT NULL`, (e) => {
    if (e && !e.message.includes('errno: 150')) console.warn('ALTER detalle_salidas_inv inv_id:', e.message);
});
db.query(
    `CREATE TABLE IF NOT EXISTS detalle_salidas_inv (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        salida_id      VARCHAR(20)  NOT NULL,
        inventario_id  VARCHAR(20)  NOT NULL,
        descripcion    VARCHAR(400),
        cantidad       DECIMAL(14,4) NOT NULL,
        costo_unitario DECIMAL(14,4) NOT NULL DEFAULT 0,
        moneda         ENUM('PEN','USD') NOT NULL DEFAULT 'PEN',
        importe        DECIMAL(14,4) NOT NULL DEFAULT 0,
        INDEX idx_salida (salida_id),
        INDEX idx_item   (inventario_id)
    )`,
    (e) => { if (e) console.warn('CREATE detalle_salidas_inv:', e.message); else console.log('✅ Tabla detalle_salidas_inv verificada'); }
);

// ── Reparar inventario_id NULL en detalle existentes ────────────────────
// Actualiza filas cuyo inventario_id es NULL usando la descripción como clave
db.query(
    `UPDATE detalle_salidas_inv d
     JOIN inventario i ON i.descripcion = d.descripcion AND i.activo = 1
     SET d.inventario_id = i.id
     WHERE d.inventario_id IS NULL AND d.descripcion IS NOT NULL`,
    (e) => { if (e) console.warn('Repair detalle_salidas_inv:', e.message); else console.log('✅ Reparados inventario_id NULL en detalle_salidas_inv'); }
);
db.query(
    `UPDATE detalle_entradas_inv d
     JOIN inventario i ON i.descripcion = d.descripcion AND i.activo = 1
     SET d.inventario_id = i.id
     WHERE d.inventario_id IS NULL AND d.descripcion IS NOT NULL`,
    (e) => { if (e) console.warn('Repair detalle_entradas_inv:', e.message); else console.log('✅ Reparados inventario_id NULL en detalle_entradas_inv'); }
);

// ── Helper: generar código secuencial para Almacén ───────────────────────
function _generarCodigoAlmacen(tipo, anio, cb) {
    const tablas = { INV: 'inventario', ENT: 'entradas_inv', SAL: 'salidas_inv', SA: 'salidas_inv', PROV: 'proveedores_inv' };
    const tabla = tablas[tipo];
    const prefix = anio ? `${tipo}-${anio}-` : `${tipo}-`;
    db.query(
        `SELECT id FROM \`${tabla}\` WHERE id LIKE ? ORDER BY CAST(SUBSTRING_INDEX(id, '-', -1) AS UNSIGNED) DESC LIMIT 1`,
        [prefix + '%'],
        (err, rows) => {
            if (err) return cb(err);
            let num = 1;
            const last = rows[0]?.id;
            if (last) { const p = last.split('-'); num = parseInt(p[p.length - 1], 10) + 1; }
            const pad = anio ? 5 : 4;
            cb(null, prefix + String(num).padStart(pad, '0'));
        }
    );
}

// ============================================================
// RUTAS MODULARIZADAS
// ============================================================
const almacenRoutes = require('./routes/almacen')(db, _multerInv, logAudit, _generarCodigoAlmacen);
app.use('/api/almacen', almacenRoutes);

// (tallerRoutes ya fue montado antes del legacy wildcard — ver arriba)


// ── Integraciones API (GET / PUT) ────────────────────────────────
app.get('/api/integraciones', (req, res) => {
    db.query('SELECT clave, valor, descripcion, actualizado_por, actualizado_en FROM integraciones_api ORDER BY id', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put('/api/integraciones', (req, res) => {
    const { clave, valor, actualizado_por } = req.body;
    if (!clave) return res.status(400).json({ error: 'clave requerida' });
    db.query(
        `INSERT INTO integraciones_api (clave, valor, actualizado_por)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_por = VALUES(actualizado_por), actualizado_en = NOW()`,
        [clave, valor || null, actualizado_por || null],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

// ============================================================
// 🚀 EL PUENTE DE LECTURA A MYSQL (Legacy)
// Debe ir DESPUÉS de todas las rutas específicas de /api/ 
// para que el wildcard /:metodo no intercepte los POSTs correctos.
// ============================================================
const legacyRoutes = require('./routes/legacy')(db, broadcast, logAudit);
app.use('/api/script', legacyRoutes);
app.use('/api', legacyRoutes);

// 4. Encender Servidor
app.listen(process.env.PORT || 3000, () => {
    console.log('🚀 Servidor Backend de Azkell corriendo');
    // Migración: fecha_trabajo debe ser DATETIME (puede estar como DATE en DBs antiguas)
    db.query("ALTER TABLE trabajos_ot MODIFY COLUMN fecha_trabajo DATETIME NULL", (e) => {
        if (e) console.warn('ALTER fecha_trabajo (puede ignorarse si ya es DATETIME):', e.message);
    });
    // Migración: añadir ticket_ot a ot_backlog si no existe (compatible MySQL 5.7+)
    db.query(
        "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ot_backlog' AND COLUMN_NAME='ticket_ot'",
        (e, r) => {
            if (!e && r && r[0] && r[0].cnt === 0) {
                db.query("ALTER TABLE ot_backlog ADD COLUMN ticket_ot VARCHAR(50) DEFAULT NULL", () => {});
            }
        }
    );
    // Migración: añadir motivo_anulacion a salidas_inv si no existe (compatible MySQL 5.7+)
    db.query(
        "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='salidas_inv' AND COLUMN_NAME='motivo_anulacion'",
        (e, r) => {
            if (!e && r && r[0] && r[0].cnt === 0) {
                db.query("ALTER TABLE salidas_inv ADD COLUMN motivo_anulacion VARCHAR(255) DEFAULT NULL", () => {});
            }
        }
    );
    // Migración: añadir url_firma a inspecciones si no existe
    db.query(
        "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='inspecciones' AND COLUMN_NAME='url_firma'",
        (e, r) => {
            if (!e && r && r[0] && r[0].cnt === 0) {
                db.query("ALTER TABLE inspecciones ADD COLUMN url_firma LONGTEXT DEFAULT NULL", () => {});
            }
        }
    );
    // Migración: añadir orden a cat_rampas si no existe
    db.query(
        "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cat_rampas' AND COLUMN_NAME='orden'",
        (e, r) => {
            if (!e && r && r[0] && r[0].cnt === 0) {
                db.query("ALTER TABLE cat_rampas ADD COLUMN orden INT NOT NULL DEFAULT 0", () => {});
            }
        }
    );
});
