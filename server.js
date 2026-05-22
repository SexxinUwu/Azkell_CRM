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
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
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
    ssl: { rejectUnauthorized: false }, // Crucial para que Render acepte a Aiven
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
    ) COMMENT 'Credenciales y tokens de integraciones externas (Wialon, Gemini, etc.)'`,
    (e) => {
        if (e) console.warn('CREATE integraciones_api:', e.message);
        else {
            console.log('✅ Tabla integraciones_api verificada');
            db.query(
                `INSERT IGNORE INTO integraciones_api (clave, descripcion) VALUES
                 ('wialon_token',   'Token de autenticación API Wialon'),
                 ('wialon_url',     'URL base API Wialon (vacío = usar por defecto)'),
                 ('gemini_api_key', 'Clave API Google Gemini (IA)')`,
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
    const PUBLIC_PATHS = ['/login', '/ping', '/eventos'];
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
// 🚀 EL PUENTE DE LECTURA A MYSQL
// ============================================================
app.post('/api/script/:metodo', async (req, res) => {
    const metodo = req.params.metodo;
    console.log(`📡 El sistema solicitó: ${metodo}`);

    if (metodo === 'obtenerDatosPlacas') {
        const sql = `
            SELECT
                placa, cliente, ruc_dni, marca, modelo_uts, tipo, sub_tipo, color,
                nro_motor, nro_caja, nro_corona, nro_vin, configuracion, anio,
                combustible, carga_util, peso_neto, peso_bruto, estado, uts, motora, llantas, en_uso
            FROM placas
        `;
        db.query(sql, (err, results) => {
            if (err) { console.error("Error leyendo placas:", err); return res.json({ data: [] }); }
            console.log(`✅ Se encontraron ${results.length} placas en MySQL`);

            const data = results.map(r => [
                r.placa || '',           // 0: Placa
                r.cliente || '',         // 1: Cliente
                r.ruc_dni || '',         // 2: Ruc/ Dni
                r.marca || '',           // 3: Marca
                r.modelo_uts || '',      // 4: Modelo
                r.tipo || '',            // 5: Tipo
                r.sub_tipo || '',        // 6: Sub tipo
                r.color || '',           // 7: Color
                r.nro_motor || '',       // 8: Nº Motor
                r.nro_caja || '',        // 9: Nº Caja
                r.nro_corona || '',      // 10: Nº Corona
                r.nro_vin || '',         // 11: Nº VIN
                r.configuracion || '',   // 12: Configuracion
                r.anio || '',            // 13: Año
                r.combustible || '',     // 14: Combustible
                r.carga_util || '',      // 15: Carga Util
                r.peso_neto || '',       // 16: Peso Neto
                r.peso_bruto || '',      // 17: Peso Bruto
                r.estado || 'Inactiva',  // 18: Estado
                r.uts || '',             // 19: Uts
                r.motora || '',          // 20: Motora O No Motora
                r.llantas || '',         // 21: Llantas
                r.en_uso || ''           // 22: En Uso?
            ]);
            return res.json({ data });
        });
        return;
    }

    if (metodo === 'obtenerDatosFleetrun') {
        db.query('SELECT * FROM fleetrun', (err, results) => {
            if (err) return res.json({ data: [] });
            // fila[3] debe ser fecha DD/MM/YYYY — el módulo fleetrun la usa para ordenar y mostrar
            const _fmtFecha = (f) => {
                if (!f) return '';
                const d = f instanceof Date ? f : new Date(String(f));
                if (!isNaN(d.getTime())) {
                    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
                }
                return String(f); // ya viene como "DD/MM/YYYY" (registros legacy)
            };
            const data = results.map(r => [
                r.idRegistro || r.IDREGISTRO || '',                        // [0] ID
                r.fecha || r.FECHA || '',                                   // [1] fecha ISO/raw
                r.mes || r.MES || '',                                       // [2] mes
                _fmtFecha(r.fecha || r.FECHA),                             // [3] fecha DD/MM/YYYY ← fix
                r.placa || r.PLACA || '', r.marca || r.MARCA || '',
                r.dueno || r.DUENO || '', r.uts || r.UTS || '',
                r.tipo_mp || r.TIPO_MP || '',
                r.km_actual || r.KM_ACTUAL || '',
                r.frecuencia_km || r.FRECUENCIA_KM || '',
                r.km_proximo || r.KM_PROXIMO || '',
                r.observacion || r.OBSERVACION || '',
                r.tecnico || r.TECNICO || '',
                r.km_gps || r.KM_GPS || '',
                r.id || 0                                                   // [15] DB auto-increment (tiebreaker de orden de inserción)
            ]);
            return res.json({ data });
        });
        return;
    }

    if (metodo === 'obtenerDatosUsuarios') {
        const query = `
            SELECT u.idUsuario, u.nombre, u.cargo, u.correo, u.password, u.rol,
                   u.estado, u.permisos_json, u.rol_id,
                   u.ultimo_acceso, u.ultimo_ip, u.ultimo_dispositivo,
                   r.nombre AS rol_nombre, r.color AS rol_color, r.es_admin AS rol_es_admin
            FROM usuarios u
            LEFT JOIN roles r ON u.rol_id = r.id`;
        db.query(query, (err, results) => {
            if (err) return res.status(500).json({ data: "Error BD: " + err.message });
            const filas = results.map(r => {
                let permisosFinales = {};
                let correoMin = (r.correo || '').trim().toLowerCase();
                let rolLabel = r.rol_nombre || r.rol || 'Personalizado';
                if (correoMin === 'admin@azkell.com') {
                    permisosFinales = { admin: true };
                    rolLabel = 'Fundador';
                } else if (r.rol_id && r.rol_es_admin) {
                    permisosFinales = { admin: true };
                } else {
                    try {
                        let raw = r.permisos_json || '{}';
                        permisosFinales = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                        if (typeof permisosFinales === 'string') permisosFinales = JSON.parse(permisosFinales);
                    } catch (e) { permisosFinales = {}; }
                }
                // [0]id [1]nombre [2]cargo [3]correo [4]rol_label [5]estado [6]password_visible [7]permisos [8]rol_id [9]rol_color [10]ultimo_acceso [11]ultimo_ip [12]ultimo_dispositivo
                return [
                    r.idUsuario, r.nombre, r.cargo, r.correo,
                    rolLabel, r.estado, r.password_visible || '',
                    JSON.stringify(permisosFinales), r.rol_id || null, r.rol_color || null,
                    r.ultimo_acceso || null, r.ultimo_ip || null, r.ultimo_dispositivo || null
                ];
            });
            return res.json({ data: filas });
        });
        return;
    }

    if (metodo === 'obtenerDatosInspecciones') {
        db.query('SELECT * FROM inspecciones', (err, results) => {
            if (err) return res.json({ data: [] });
            const _fmtFechaInsp = (f) => {
                if (!f) return '';
                const d = f instanceof Date ? f : new Date(String(f).split('T')[0]);
                if (!isNaN(d.getTime())) {
                    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
                }
                return String(f);
            };
            const data = results.map(r => Object.assign({}, r, {
                fecha_ingreso: _fmtFechaInsp(r.fecha_ingreso)
            }));
            return res.json({ data });
        });
        return;
    }

    if (metodo === 'obtenerDatosStatusFlota') {
        db.query('SELECT * FROM status_flota', (err, results) => {
            if (err) return res.json({ data: [] });
            const data = results.map(r => [
                r.idRegistro || '', r.fecha || '', r.corte || '',
                r.unidad_motora || '', r.unidad_no_motora || '',
                r.cliente_motora || '', r.cliente_nomotora || '',
                r.zona || '', r.conductor || '',
                r.estado || '', r.observaciones || '', r.kilometraje || '', r.foto || ''
            ]);
            return res.json({ data });
        });
        return;
    }

    if (metodo === 'guardarStatusFlota') {
        const form = req.body.form || {};
        const id = form.sf_id;
        const fecha = form.sf_fecha;
        const corte = form.sf_corte;
        const motora = form.sf_motora || "";
        const nomotora = form.sf_nomotora || "";
        const cliMotora = form.sf_cliente_motora || "";
        const cliNoMotora = form.sf_cliente_nomotora || "";
        const zona = form.sf_zona || "";
        const conductor = form.sf_conductor || "";
        const estado = form.sf_estado || "";
        const obs = form.sf_obs || "";
        const km = form.sf_kilometraje ? parseInt(form.sf_kilometraje) : null;
        const usuario = form.usuarioAutor || "";

        const query = `
            INSERT INTO status_flota
            (idRegistro, fecha, corte, unidad_motora, unidad_no_motora, cliente_motora, cliente_nomotora, zona, conductor, estado, observaciones, kilometraje, usuario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            fecha=?, corte=?, unidad_motora=?, unidad_no_motora=?, cliente_motora=?, cliente_nomotora=?, zona=?, conductor=?, estado=?, observaciones=?, kilometraje=?, usuario=?
        `;
        const values = [id, fecha, corte, motora, nomotora, cliMotora, cliNoMotora, zona, conductor, estado, obs, km, usuario,
                        fecha, corte, motora, nomotora, cliMotora, cliNoMotora, zona, conductor, estado, obs, km, usuario];
        db.query(query, values, (err) => {
            if (err) { console.error("❌ Error BD Status Flota:", err); return res.json({ data: "Error al guardar en Base de Datos" }); }
            console.log("✅ Status Flota guardado correctamente");
            broadcast('status', metodo);
            return res.json({ data: "Éxito" });
        });
        return;
    }

    if (metodo === 'guardarInspeccion') {
        const datos = req.body.form || {};
        const query = `
            INSERT INTO inspecciones
            (id, placa, fecha_ingreso, cliente, tecnico, km_tablero, dias_propuestos, detalles_json, url_firma)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            placa=?, fecha_ingreso=?, cliente=?, tecnico=?, km_tablero=?, dias_propuestos=?, detalles_json=?, url_firma=?
        `;
        const values = [
            datos.id, datos.placa, datos.fecha_ingreso, datos.cliente, datos.tecnico,
            datos.km_tablero, datos.dias_propuestos, datos.detalles_json, datos.firma_base64,
            datos.placa, datos.fecha_ingreso, datos.cliente, datos.tecnico,
            datos.km_tablero, datos.dias_propuestos, datos.detalles_json, datos.firma_base64
        ];
        db.query(query, values, (err) => {
            if (err) { console.error("Error BD Inspecciones:", err); return res.json({ data: "Error al guardar inspección" }); }
            console.log("✅ Inspección guardada correctamente");
            broadcast('inspecciones', metodo);
            const usuario = req.body.usuario || datos.tecnico || 'sistema';
            logAudit(usuario, 'inspecciones', 'CREÓ', `${datos.placa || '?'} · ${datos.fecha_ingreso || '?'}`);
            return res.json({ data: "Éxito" });
        });
        return;
    }

    if (metodo === 'eliminarDocumento') {
        const { id, ids, coleccion } = req.body;

        const listaIds = ids && ids.length > 0 ? ids : (id ? [id] : []);
        if (listaIds.length === 0) return res.json({ data: "No hay registros para procesar" });

        let sql = '';

        if (coleccion === 'Placas') sql = 'DELETE FROM placas WHERE placa IN (?)';
        else if (coleccion === 'Inspecciones') sql = 'DELETE FROM inspecciones WHERE id IN (?)';
        else if (coleccion === 'Fleetrun') sql = 'DELETE FROM fleetrun WHERE idRegistro IN (?)';
        else if (coleccion === 'StatusFlota') sql = 'DELETE FROM status_flota WHERE idRegistro IN (?)';
        else if (coleccion === 'Usuarios') sql = 'DELETE FROM usuarios WHERE idUsuario IN (?)';

        if (!sql) return res.json({ data: "Colección no válida" });

        db.query(sql, [listaIds], (err) => {
            if (err) { console.error("❌ Error en BD:", err); return res.json({ data: "Error al procesar registro" }); }
            console.log(`✅ Eliminados definitivamente ${listaIds.length} registros de ${coleccion}`);
            const COLECCION_MODULO = { Placas:'placas', Inspecciones:'inspecciones', Fleetrun:'fleetrun', StatusFlota:'status', Usuarios:'usuarios' };
            broadcast(COLECCION_MODULO[coleccion] || coleccion.toLowerCase(), 'eliminar');
            const usuario = req.body.usuario || 'sistema';
            logAudit(usuario, COLECCION_MODULO[coleccion] || coleccion.toLowerCase(), 'ELIMINÓ', `${listaIds.length} reg. de ${coleccion}`);

            // Al eliminar Fleetrun: revertir planes Completadas que referenciaban esos registros
            if (coleccion === 'Fleetrun' && listaIds.length > 0) {
                db.query(
                    `UPDATE planificacion
                     SET estado = 'Programada',
                         fleetrun_id_ejecutado = NULL,
                         fecha_real_ejecucion = NULL,
                         km_real_ejecucion = NULL
                     WHERE fleetrun_id_ejecutado IN (?) AND estado = 'Completada'`,
                    [listaIds],
                    (errRev) => {
                        if (errRev) console.error('⚠️ Error al revertir planificación tras eliminar Fleetrun:', errRev.message);
                        else broadcast('planificacion', 'revertir');
                    }
                );
            }

            return res.json({ data: "Éxito" });
        });
        return;
    }

    if (metodo === 'guardarUsuario' || metodo === 'actualizarUsuario') {
        const form = req.body.args[0];
        const isEdit = (form.idUsuarioEdit && form.idUsuarioEdit.trim() !== '') ? true : false;

        const ejecutarGuardado = async (idFinal) => {
            const nombre = form.nombreUsuarioEdit || '';
            const cargo = form.cargoUsuarioEdit || '';
            const correo = form.correoUsuarioEdit || '';
            const passwordPlain = form.passwordUsuarioEdit || '';
            const password = passwordPlain ? await bcrypt.hash(passwordPlain, 10) : '';
            let estado = form.estadoUsuarioEdit || 'Activo';
            let permisos = form.permisos_json || "{}";
            let rol = "Personalizado";
            const rolIdRaw = form.rol_id || null;
            const rolId = (rolIdRaw && rolIdRaw !== '' && rolIdRaw !== 'null') ? parseInt(rolIdRaw) || null : null;

            if (correo.trim().toLowerCase() === 'admin@azkell.com') {
                permisos = JSON.stringify({ admin: true });
                estado = "Activo"; rol = "Fundador";
            }
            if (typeof permisos === 'object') permisos = JSON.stringify(permisos);

            if (isEdit) {
                if (passwordPlain) {
                    const sqlUpdate = "UPDATE usuarios SET nombre=?, cargo=?, correo=?, password=?, password_visible=?, estado=?, permisos_json=?, rol=?, rol_id=? WHERE idUsuario=?";
                    db.query(sqlUpdate, [nombre, cargo, correo, password, passwordPlain, estado, permisos, rol, rolId, idFinal], (err) => {
                        if (err) return res.json({ data: "Error BD: " + err.message });
                        broadcast('usuarios', 'actualizar');
                        return res.json({ data: "Éxito" });
                    });
                } else {
                    const sqlUpdate = "UPDATE usuarios SET nombre=?, cargo=?, correo=?, estado=?, permisos_json=?, rol=?, rol_id=? WHERE idUsuario=?";
                    db.query(sqlUpdate, [nombre, cargo, correo, estado, permisos, rol, rolId, idFinal], (err) => {
                        if (err) return res.json({ data: "Error BD: " + err.message });
                        broadcast('usuarios', 'actualizar');
                        return res.json({ data: "Éxito" });
                    });
                }
            } else {
                const sqlInsert = "INSERT INTO usuarios (idUsuario, nombre, cargo, correo, password, password_visible, rol, estado, permisos_json, rol_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                db.query(sqlInsert, [idFinal, nombre, cargo, correo, password, passwordPlain, rol, estado, permisos, rolId], (err) => {
                    if (err) return res.json({ data: "Error BD: " + err.message });
                    broadcast('usuarios', 'guardar');
                    return res.json({ data: "Éxito" });
                });
            }
        };

        if (isEdit) {
            ejecutarGuardado(form.idUsuarioEdit);
        } else {
            db.query("SELECT idUsuario FROM usuarios", (err, results) => {
                let maxId = 1000;
                if (!err && results) {
                    results.forEach(r => {
                        if (r.idUsuario && r.idUsuario.startsWith('USR-')) {
                            let num = parseInt(r.idUsuario.split('-')[1]);
                            if (!isNaN(num) && num > maxId) maxId = num;
                        }
                    });
                }
                ejecutarGuardado(`USR-${maxId + 1}`);
            });
        }
        return;
    }

    if (metodo === 'guardarPlaca' || metodo === 'actualizarPlaca') {
        const form = req.body.args[0];
        const isEdit = metodo === 'actualizarPlaca';

        // Extracción de las 23 variables del formulario HTML
        const placa = (isEdit ? form.editP_placa : form.p_placa).toUpperCase();
        const cliente = isEdit ? form.editP_cliente : form.p_cliente;
        const ruc = isEdit ? form.editP_ruc : form.p_ruc;
        const marca = isEdit ? form.editP_marca : form.p_marca;
        const modelo = isEdit ? form.editP_modelo : form.p_modelo;
        const tipo = isEdit ? form.editP_tipo : form.p_tipo;
        const sub_tipo = isEdit ? form.editP_sub_tipo : form.p_sub_tipo;
        const color = isEdit ? form.editP_color : form.p_color;
        const nro_motor = isEdit ? form.editP_nro_motor : form.p_nro_motor;
        const nro_caja = isEdit ? form.editP_nro_caja : form.p_nro_caja;
        const nro_corona = isEdit ? form.editP_nro_corona : form.p_nro_corona;
        const nro_vin = isEdit ? form.editP_nro_vin : form.p_nro_vin;
        const conf = isEdit ? form.editP_conf : form.p_conf;
        const anio = isEdit ? form.editP_anio : form.p_anio;
        const comb = isEdit ? form.editP_comb : form.p_comb;
        const carga_util = isEdit ? form.editP_carga_util : form.p_carga_util;
        const peso_neto = isEdit ? form.editP_peso_neto : form.p_peso_neto;
        const peso_bruto = isEdit ? form.editP_peso_bruto : form.p_peso_bruto;
        const estado = isEdit ? form.editP_estado : form.p_estado;
        const uts = isEdit ? form.editP_uts : form.p_uts;
        const motora = isEdit ? form.editP_motora : form.p_motora;
        const llantas = isEdit ? form.editP_llantas : form.p_llantas;
        const enuso = isEdit ? form.editP_enuso : form.p_enuso;

        const query = `
            INSERT INTO placas (placa, cliente, ruc_dni, marca, modelo_uts, tipo, sub_tipo, color, nro_motor, nro_caja, nro_corona, nro_vin, configuracion, anio, combustible, carga_util, peso_neto, peso_bruto, estado, uts, motora, llantas, en_uso)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            cliente=?, ruc_dni=?, marca=?, modelo_uts=?, tipo=?, sub_tipo=?, color=?, nro_motor=?, nro_caja=?, nro_corona=?, nro_vin=?, configuracion=?, anio=?, combustible=?, carga_util=?, peso_neto=?, peso_bruto=?, estado=?, uts=?, motora=?, llantas=?, en_uso=?
        `;

        // 23 valores para INSERT, luego 22 (sin placa) para ON DUPLICATE KEY UPDATE
        const valores = [placa, cliente, ruc, marca, modelo, tipo, sub_tipo, color, nro_motor, nro_caja, nro_corona, nro_vin, conf, anio, comb, carga_util, peso_neto, peso_bruto, estado, uts, motora, llantas, enuso];
        const valoresUpdate = valores.slice(1);

        db.query(query, [...valores, ...valoresUpdate], (err) => {
            if (err) return res.json({ data: "Error BD: " + err.message });
            broadcast('placas', metodo);
            const usuario = req.body.usuario || 'sistema';
            logAudit(usuario, 'placas', metodo === 'actualizarPlaca' ? 'MODIFICÓ' : 'CREÓ', `${placa} · ${cliente || '?'}`);
            return res.json({ data: "Éxito" });
        });
        return;
    }

    if (metodo === 'guardarFleetrun' || metodo === 'actualizarFleetrun') {
        const form = req.body.args[0];
        const isEdit = metodo === 'actualizarFleetrun';

        const _ejecutarGuardado = (idFinal) => {
            const values = [
                idFinal,
                isEdit ? form.editF_fecha : form.f_fecha,
                isEdit ? form.editF_mes   : form.f_mes,
                isEdit ? form.editF_anio  : form.f_anio,
                ((isEdit ? form.editF_placa : form.f_placa) || '').toUpperCase(),
                isEdit ? form.editF_marca   : form.f_marca,
                isEdit ? form.editF_dueno   : form.f_dueno,
                isEdit ? form.editF_uts     : form.f_uts,
                isEdit ? form.editF_tipomp  : form.f_tipomp,
                isEdit ? form.editF_kmact   : form.f_kmact,
                isEdit ? form.editF_freckm  : form.f_freckm,
                isEdit ? form.editF_kmprox  : form.f_kmprox,
                isEdit ? form.editF_obs     : form.f_obs,
                isEdit ? form.editF_tec     : form.f_tec,
                isEdit ? form.editF_kmgps   : form.f_kmgps
            ];
            const query = `
                INSERT INTO fleetrun (idRegistro, fecha, mes, anio, placa, marca, dueno, uts, tipo_mp, km_actual, frecuencia_km, km_proximo, observacion, tecnico, km_gps)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                fecha=?, mes=?, anio=?, placa=?, marca=?, dueno=?, uts=?, tipo_mp=?, km_actual=?, frecuencia_km=?, km_proximo=?, observacion=?, tecnico=?, km_gps=?
            `;
            db.query(query, [...values, ...values.slice(1)], (err) => {
                if (err) return res.json({ data: "Error BD: " + err.message });
                broadcast('fleetrun', metodo);
                const usuario = req.body.usuario || 'sistema';
                const placa   = ((isEdit ? form.editF_placa  : form.f_placa)  || '').toUpperCase();
                const tipomp  = (isEdit ? form.editF_tipomp : form.f_tipomp) || '';
                logAudit(usuario, 'fleetrun', isEdit ? 'MODIFICÓ' : 'CREÓ', `${tipomp || '?'} · ${placa || '?'} · ${idFinal}`);
                // Si es edición, sincronizar planificacion vinculada (fecha_real y km_real)
                if (isEdit) {
                    const newFecha = (isEdit ? form.editF_fecha : null) || null;
                    const newKmAct = parseFloat(isEdit ? form.editF_kmact : 0) || null;
                    db.query(
                        `UPDATE planificacion SET fecha_real_ejecucion=?, km_real_ejecucion=?
                         WHERE fleetrun_id_ejecutado=? AND estado='Completada'`,
                        [newFecha, newKmAct, idFinal],
                        () => { broadcast('planificacion', 'actualizar'); }
                    );
                }
                // Auto-link a planificación si existe una activa
                if (placa && tipomp && !isEdit) {
                    db.query(
                        `SELECT id FROM planificacion
                         WHERE UPPER(placa)=? AND tipo_mp=? AND estado NOT IN ('Completada','Cancelada')
                         ORDER BY fecha_inicio_ventana ASC LIMIT 1`,
                        [placa, tipomp],
                        (e2, plans) => {
                            if (!e2 && plans.length) {
                                db.query(
                                    `UPDATE planificacion SET fleetrun_id_ejecutado=? WHERE id=?`,
                                    [idFinal, plans[0].id],
                                    () => {}
                                );
                            }
                        }
                    );
                }
                return res.json({ data: "Éxito", idRegistro: idFinal });
            });
        };

        if (isEdit) {
            const placaEnviada = (form.editF_placa || '').trim();
            if (!placaEnviada) {
                // Safeguard: placa vacía → recuperar del propio registro en DB antes de sobrescribir
                db.query('SELECT placa FROM fleetrun WHERE idRegistro=? LIMIT 1', [form.editF_id], (errP, rowsP) => {
                    if (!errP && rowsP.length && rowsP[0].placa) {
                        form.editF_placa = rowsP[0].placa;
                    }
                    _ejecutarGuardado(form.editF_id);
                });
            } else {
                _ejecutarGuardado(form.editF_id);
            }
        } else {
            // Para nuevos: generar código legible si no viene uno
            const placaNueva  = (form.f_placa  || '').toUpperCase();
            const tipoMpNuevo = form.f_tipomp  || '';
            const fechaNueva  = form.f_fecha   || new Date().toISOString().split('T')[0];
            if (form.f_id && !String(form.f_id).match(/^FL-\d{13}$/)) {
                // ID manual enviado por el frontend (no timestamp)
                _ejecutarGuardado(form.f_id);
            } else {
                generarIdFleetrunUnico(placaNueva, tipoMpNuevo, fechaNueva, _ejecutarGuardado);
            }
        }
        return;
    }

    if (metodo === 'obtenerDatosConductores') {
        db.query('SELECT * FROM conductores', (err, results) => {
            if (err) return res.json({ data: [] });
            return res.json({ data: results });
        });
        return;
    }

    if (metodo === 'guardarConductor') {
        const form = req.body.args[0];
        const isEdit = form.idConductor ? true : false;
        const nombre = form.c_nombre || "";
        const empresa = form.c_empresa || "";
        const telefono = form.c_telefono || "";
        const dni = form.c_dni || "";
        const licencia = form.c_licencia || "";
        const estado = form.c_estado || "Activo";
        const foto = form.c_foto_base64 || "";

        if (isEdit) {
            let sql = 'UPDATE conductores SET nombre=?, empresa=?, telefono=?, dni=?, licencia=?, estado=?';
            let params = [nombre, empresa, telefono, dni, licencia, estado];
            if (foto) { sql += ', foto=?'; params.push(foto); }
            sql += ' WHERE idConductor=?'; params.push(form.idConductor);
            db.query(sql, params, (err) => {
                if (err) return res.json({ data: "Error BD: " + err.message });
                broadcast('conductores', 'actualizar');
                return res.json({ data: "Éxito" });
            });
        } else {
            db.query('INSERT INTO conductores (nombre, empresa, telefono, dni, licencia, estado, foto) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nombre, empresa, telefono, dni, licencia, estado, foto], (err) => {
                if (err) return res.json({ data: "Error BD: " + err.message });
                broadcast('conductores', 'guardar');
                return res.json({ data: "Éxito" });
            });
        }
        return;
    }

    if (metodo === 'obtenerTiposMantenimiento') {
        db.query('SELECT * FROM tipos_mantenimiento', (err, results) => {
            if (err) return res.json({ data: [] });
            return res.json({ data: results });
        });
        return;
    }

    if (metodo === 'obtenerTPMP') {
        db.query('SELECT * FROM tp_mp', (err, results) => {
            if (err) return res.json({ data: [] });
            return res.json({ data: results.map(r => r.tipo_mant) });
        });
        return;
    }

    if (metodo === 'consultarGemini') {
        const prompt = req.body.args[0];
        const resumenContexto = req.body.args[1];
        const apiKey = process.env.GEMINI_API_KEY;
        const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;

        try {
            const aiRes = await fetch(url, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ "contents": [{ "parts": [{ "text": "Eres el asistente experto del CRM de AZKELL. " + resumenContexto + ".\nResponde de forma útil, breve y profesional a esta consulta del usuario: " + prompt }] }] })
            });
            const json = await aiRes.json();
            if (json.error) return res.json({ data: "Error IA: " + json.error.message });
            return res.json({ data: json.candidates[0].content.parts[0].text });
        } catch (e) {
            return res.json({ data: "Error conexión IA: " + e.message });
        }
    }

    if (metodo === 'obtenerDatosWialon') {
        // Lee token desde DB; si no hay, cae en .env como fallback
        const obtenerTokenWialon = () => new Promise((resolve) => {
            db.query(
                "SELECT valor FROM integraciones_api WHERE clave = 'wialon_token' LIMIT 1",
                (err, rows) => {
                    const tokenDB = rows && rows[0] && rows[0].valor ? rows[0].valor.trim() : null;
                    resolve(tokenDB || process.env.WIALON_TOKEN || '');
                }
            );
        });
        const obtenerUrlWialon = () => new Promise((resolve) => {
            db.query(
                "SELECT valor FROM integraciones_api WHERE clave = 'wialon_url' LIMIT 1",
                (err, rows) => {
                    const urlDB = rows && rows[0] && rows[0].valor ? rows[0].valor.trim() : null;
                    resolve(urlDB || 'https://hst-api.wialon.us/wialon/ajax.html');
                }
            );
        });

        try {
            const [token, baseUrl] = await Promise.all([obtenerTokenWialon(), obtenerUrlWialon()]);
            if (!token) return res.json({ data: { error: 'Token Wialon no configurado. Configúralo en Sistema → Integraciones.' } });

            const loginRes = await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({token: token}))}`);
            const loginData = await loginRes.json();
            if (!loginData.eid) return res.json({ data: { error: "Fallo Login Wialon. Verifica el token en Sistema → Integraciones." }});

            const sid = loginData.eid;
            const searchParams = { "spec": { "itemsType": "avl_unit", "propName": "sys_name", "propValueMask": "*", "sortType": "sys_name" }, "force": 1, "flags": 9221, "from": 0, "to": 0 };
            const searchRes = await fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(searchParams))}&sid=${sid}`);
            const searchData = await searchRes.json();

            if (!searchData.items) return res.json({ data: [] });

            const vehiculosLive = [];
            searchData.items.forEach(item => {
                const rawName = item.nm ? item.nm.toUpperCase().trim() : "";
                let placaLimpia = rawName.replace(/[^A-Z0-9]/g, '');
                const matchPlaca = placaLimpia.match(/[A-Z0-9]{6}/);
                if (matchPlaca) placaLimpia = matchPlaca[0];

                if (rawName) {
                    vehiculosLive.push({
                        nombre_wialon: rawName, placa: placaLimpia,
                        km: item.cnm_km ? Math.round(item.cnm_km) : 0,
                        horas: item.cneh ? Math.round(item.cneh) : 0,
                        lat: item.pos ? item.pos.y : 0, lng: item.pos ? item.pos.x : 0
                    });
                }
            });

            fetch(`${baseUrl}?svc=core/logout&params=%7B%7D&sid=${sid}`).catch(e=>{});

            // ── Snapshot automático de KM GPS (una vez por día por placa) ──
            const hoy = new Date().toISOString().split('T')[0];
            vehiculosLive.forEach(v => {
                if (!v.placa || (!v.km && !v.horas)) return;
                db.query(
                    `INSERT IGNORE INTO km_snapshots (placa, fecha, km_gps, horas_motor)
                     VALUES (?, ?, ?, ?)`,
                    [v.placa, hoy, v.km || 0, v.horas || 0],
                    () => {}
                );
            });

            return res.json({ data: vehiculosLive });
        } catch (error) {
            console.error("Error Wialon:", error);
            return res.json({ data: { error: error.toString() }});
        }
    }

    res.json({ data: [] });
});

// ── IMPORTACIÓN MASIVA DE PLACAS (23 CAMPOS) ─────────────────────────────────
app.post('/api/importarPlacasMasivo', async (req, res) => {
    const { registros } = req.body;
    if (!Array.isArray(registros) || !registros.length) {
        return res.status(400).json({ ok: 0, errores: 0, msg: 'Sin registros' });
    }

    const query = `
        INSERT INTO placas (
            placa, cliente, ruc_dni, marca, modelo_uts, tipo, sub_tipo, color,
            nro_motor, nro_caja, nro_corona, nro_vin, configuracion, anio,
            combustible, carga_util, peso_neto, peso_bruto, estado, uts, motora, llantas, en_uso
        ) VALUES ?
        ON DUPLICATE KEY UPDATE
            cliente=VALUES(cliente), ruc_dni=VALUES(ruc_dni), marca=VALUES(marca),
            modelo_uts=VALUES(modelo_uts), tipo=VALUES(tipo), sub_tipo=VALUES(sub_tipo),
            color=VALUES(color), nro_motor=VALUES(nro_motor), nro_caja=VALUES(nro_caja),
            nro_corona=VALUES(nro_corona), nro_vin=VALUES(nro_vin), configuracion=VALUES(configuracion),
            anio=VALUES(anio), combustible=VALUES(combustible), carga_util=VALUES(carga_util),
            peso_neto=VALUES(peso_neto), peso_bruto=VALUES(peso_bruto), estado=VALUES(estado),
            uts=VALUES(uts), motora=VALUES(motora), llantas=VALUES(llantas), en_uso=VALUES(en_uso)
    `;

    let ok = 0, errores = 0;
    const validos = registros.filter(r => {
        const placa = (r.placa || r.PLACA || '').toString().trim().toUpperCase();
        if (!placa) { errores++; return false; }
        return true;
    });

    if (validos.length > 0) {
        for (let i = 0; i < validos.length; i += 500) {
            const lote = validos.slice(i, i + 500);
            const vals = lote.map(r => [
                (r.placa || r.PLACA || '').toString().trim().toUpperCase(),
                r.cliente || r.CLIENTE || '',
                r.ruc_dni || r['RUC / DNI'] || r.RUC_DNI || '',
                r.marca || r.MARCA || '',
                r.modelo_uts || r['MODELO UTS'] || r.MODELO_UTS || r.modelo || '',
                r.tipo || r.TIPO || '',
                r.sub_tipo || r['SUB TIPO'] || r.SUB_TIPO || '',
                r.color || r.COLOR || '',
                r.nro_motor || r['Nº MOTOR'] || r.NRO_MOTOR || '',
                r.nro_caja || r['Nº CAJA'] || r.NRO_CAJA || '',
                r.nro_corona || r['Nº CORONA'] || r.NRO_CORONA || '',
                r.nro_vin || r['Nº VIN'] || r.NRO_VIN || '',
                r.configuracion || r.CONFIGURACION || '',
                r.anio || r.AÑO || r.ANIO || '',
                (r.combustible || r.COMBUSTIBLE || '').replace('Dií©sel','DIESEL').replace('DIÍ©SEL','DIESEL'),
                r.carga_util || r['CARGA UTIL'] || r.CARGA_UTIL || '',
                r.peso_neto || r['PESO NETO'] || r.PESO_NETO || '',
                r.peso_bruto || r['PESO BRUTO'] || r.PESO_BRUTO || '',
                r.estado || r.ESTADO || 'Activa',
                r.uts || r.UTS || '',
                r.motora || r.MOTORA || '',
                r.llantas || r.LLANTAS || '',
                r.en_uso || r['EN USO?'] || r.EN_USO || ''
            ]);

            try {
                await new Promise((resolve, reject) => {
                    db.query(query, [vals], (err) => {
                        if (err) return reject(err);
                        ok += lote.length;
                        resolve();
                    });
                });
            } catch (e) {
                console.error('Import error bulk placas:', e.message);
                errores += lote.length;
            }
        }
    }
    broadcast('placas', 'importar');
    res.json({ ok, errores });
});

// ============================================================
// 🔥 IMPORTACIÓN MASIVA DE INSPECCIONES (DESDE EXCEL)
// ============================================================
app.post('/api/importarInspeccionesMasivo', async (req, res) => {
    const registros = req.body.registros;
    if (!registros || !Array.isArray(registros)) {
        return res.status(400).json({ error: "Datos inválidos" });
    }

    // Sanitiza fecha a YYYY-MM-DD o null
    function sanitizarFecha(val) {
        if (!val || String(val).trim() === '') return null;
        let s = String(val).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        // DD/MM/YYYY o DD-MM-YYYY
        let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
        // Fallback: Date.parse
        let d = new Date(s);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        return null;
    }

    let okCount = 0;
    let errCount = 0;
    let primerError = null;

    const sql = `
        INSERT INTO inspecciones
        (id, fecha_ingreso, placa, km_tablero, cliente, tecnico, dias_propuestos, detalles_json)
        VALUES ?
        ON DUPLICATE KEY UPDATE
        fecha_ingreso=VALUES(fecha_ingreso), placa=VALUES(placa), km_tablero=VALUES(km_tablero),
        cliente=VALUES(cliente), tecnico=VALUES(tecnico), dias_propuestos=VALUES(dias_propuestos), detalles_json=VALUES(detalles_json)
    `;

    const validos = registros.filter(r => {
        const placa = r.PLACA || r.placa || '';
        if (!placa || placa === "") { errCount++; return false; }
        return true;
    });

    if (validos.length > 0) {
        for (let i = 0; i < validos.length; i += 500) {
            const lote = validos.slice(i, i + 500);
            const vals = lote.map(r => [
                r['ID (NO MODIFICAR)'] || r.ID || r.id || `INSP-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                sanitizarFecha(r['FECHA INGRESO'] || r.FECHA || r.fecha_ingreso),
                (r.PLACA || r.placa || '').toString().toUpperCase().trim(),
                parseInt(r['KM TABLERO'] || r.KM || r.km_tablero || '0') || 0,
                (r.CLIENTE || r.cliente || '').toString().trim(),
                (r.TECNICO || r.tecnico || '').toString().trim(),
                parseInt(r['DIAS PROPUESTOS'] || r.DIAS || r.dias_propuestos || '30') || 30,
                r['DETALLES JSON'] || r.DETALLES || r.detalles_json || '[]'
            ]);

            try {
                await new Promise((resolve, reject) => {
                    db.query(sql, [vals], (err) => {
                        if (err) return reject(err);
                        okCount += lote.length;
                        resolve();
                    });
                });
            } catch (e) {
                console.error("Error bulk inspecciones:", e.message);
                if (!primerError) primerError = e.message;
                errCount += lote.length;
            }
        }
    }

    broadcast('inspecciones', 'importar');
    res.json({ ok: okCount, errores: errCount, detalle: primerError || null });
});

// ============================================================
// 🔥 IMPORTACIÓN MASIVA DE FLEETRUN (DESDE EXCEL)
// ============================================================
app.post('/api/importarFleetrunMasivo', async (req, res) => {
    const registros = req.body.registros;
    if (!registros || !Array.isArray(registros)) return res.status(400).json({ error: "Datos inválidos" });

    let okCount = 0; let errCount = 0;

    const sql = `
        INSERT INTO fleetrun
        (idRegistro, mes, anio, fecha, placa, marca, dueno, uts, tipo_mp, km_actual, frecuencia_km, km_proximo, km_gps, tecnico, observacion)
        VALUES ?
        ON DUPLICATE KEY UPDATE
        fecha=VALUES(fecha), placa=VALUES(placa), tipo_mp=VALUES(tipo_mp), km_actual=VALUES(km_actual),
        frecuencia_km=VALUES(frecuencia_km), km_proximo=VALUES(km_proximo), tecnico=VALUES(tecnico), observacion=VALUES(observacion),
        mes=VALUES(mes), anio=VALUES(anio)
    `;

    const validos = registros.filter(r => {
        if (!r.placa || r.placa === "") { errCount++; return false; }
        return true;
    });

    if (validos.length > 0) {
        for (let i = 0; i < validos.length; i += 500) {
            const lote = validos.slice(i, i + 500);
            const vals = lote.map(r => [
                r.id, r.mes, r.anio, r.fecha, r.placa, '', '', '', r.tipomp, r.kmact, r.freckm, r.kmprox, '', r.tec, r.obs
            ]);

            try {
                await new Promise((resolve, reject) => {
                    db.query(sql, [vals], (err) => {
                        if (err) return reject(err);
                        okCount += lote.length;
                        resolve();
                    });
                });
            } catch (e) {
                console.error("Error bulk fleetrun:", e.message);
                errCount += lote.length;
            }
        }
    }
    broadcast('fleetrun', 'importar');
    res.json({ ok: okCount, errores: errCount });
});

// ============================================================
// 🔥 ELIMINACIÓN MASIVA SEGURA (CON DESBLOQUEO DE LLAVES FORÁNEAS)
// ============================================================
app.post('/api/eliminarMasivo', (req, res) => {
    const { ids, coleccion } = req.body;
    if (!ids || !ids.length || !coleccion) return res.status(400).json({ error: "Datos incompletos" });

    // 🛡️ VALIDACIÓN DE ROLES PARA ELIMINACIÓN MASIVA
    if (req.user && req.user.rol !== 'Fundador') {
        try {
            let p = typeof req.user.permisos === 'string' ? JSON.parse(req.user.permisos) : req.user.permisos;
            if (!p.admin) {
                let mapPerm = { Placas:'placas', Fleetrun:'fleet', Mantenimientos:'fleet', Inspecciones:'insp', statusMant:'insp', StatusFlota:'status', statusFlota:'status', Usuarios:'seg' };
                let mod = mapPerm[coleccion];
                if (!mod || !p[mod] || (p[mod].d !== 1 && p[mod].d !== true)) {
                    console.warn(`[RBAC] Bloqueado eliminarMasivo en ${coleccion}`);
                    return res.status(403).json({ error: 'Permisos insuficientes para eliminar masivamente' });
                }
            }
        } catch(e) {}
    }

    let tabla = '';

    // Por defecto, busca 'idRegistro' (Fleetrun, Inspecciones, StatusFlota)
    let campoId = 'idRegistro';

    if (coleccion === 'Placas') { tabla = 'placas'; campoId = 'placa'; }
    else if (coleccion === 'Fleetrun' || coleccion === 'Mantenimientos') { tabla = 'fleetrun'; }
    else if (coleccion === 'Inspecciones' || coleccion === 'statusMant') { tabla = 'inspecciones'; campoId = 'id'; }
    else if (coleccion === 'StatusFlota' || coleccion === 'statusFlota') { tabla = 'status_flota'; }
    else return res.status(400).json({ error: "Colección no válida" });

    const sql = `DELETE FROM ${tabla} WHERE ${campoId} IN (?)`;

    // Obtenemos una conexión exclusiva para apagar los seguros
    db.getConnection((err, connection) => {
        if (err) {
            console.error("Error obteniendo conexión:", err);
            return res.status(500).json({ error: "Error interno de servidor" });
        }

        // 1. Apagamos las llaves foráneas para que no bloquee el borrado
        connection.query('SET FOREIGN_KEY_CHECKS=0;', (err) => {
            if (err) {
                connection.release();
                return res.status(500).json({ error: "No se pudo apagar el seguro de MySQL" });
            }

            // 2. Eliminamos los registros
            connection.query(sql, [ids], (errDelete, result) => {

                // 3. Volvemos a prender las llaves foráneas (MUY IMPORTANTE)
                connection.query('SET FOREIGN_KEY_CHECKS=1;', () => {
                    connection.release();

                    if (errDelete) {
                        console.error("Error MySQL en eliminación masiva:", errDelete);
                        return res.status(500).json({ error: "MySQL dice: " + errDelete.message });
                    }

                    const COLECCION_MODULO2 = { Placas:'placas', Fleetrun:'fleetrun', Mantenimientos:'fleetrun', Inspecciones:'inspecciones', statusMant:'inspecciones', StatusFlota:'status', statusFlota:'status' };
                    broadcast(COLECCION_MODULO2[coleccion] || coleccion.toLowerCase(), 'eliminarMasivo');
                    res.json({ data: 'Éxito', afectados: result.affectedRows });
                });
            });
        });
    });
});

// ============================================================
// 🔥 MÓDULO TALLER V2 (CATÁLOGOS E IDs INTELIGENTES)
// ============================================================

// ── CRUD cat_rampas ──────────────────────────────────────────────
// Migración: agregar columna orden si no existe
db.query(`ALTER TABLE cat_rampas ADD COLUMN orden INT NOT NULL DEFAULT 0`, (e) => {
    if (!e) db.query(`UPDATE cat_rampas SET orden=id WHERE orden=0`);
});

// Auto-seed: si la tabla está vacía, insertar 12 rampas por defecto
function _seedRampasIfEmpty(cb) {
    db.query('SELECT COUNT(*) AS cnt FROM cat_rampas', (err, rows) => {
        if (err || rows[0].cnt > 0) return cb();
        const vals = Array.from({length:12}, (_,i) => [i+1, `Rampa ${i+1}`, 'Principal', 'Disponible', i+1]);
        db.query('INSERT INTO cat_rampas (id, nombre_rampa, sede, estado, orden) VALUES ?', [vals], cb);
    });
}

app.get('/api/cat-rampas', (req, res) => {
    _seedRampasIfEmpty(() => {
        db.query('SELECT * FROM cat_rampas ORDER BY orden ASC, id ASC', (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
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

// A. Obtener Catálogos (Rampas y Situaciones) para el Front-End
app.get('/api/catalogos_taller', (req, res) => {
    _seedRampasIfEmpty(() => {
    const sqlRampas = "SELECT * FROM cat_rampas ORDER BY orden ASC, id ASC";
    const sqlSituaciones = "SELECT * FROM cat_situaciones ORDER BY id ASC";
    db.query(sqlRampas, (err1, rampas) => {
        if (err1) return res.status(500).json({ error: err1.message });
        db.query(sqlSituaciones, (err2, situaciones) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ rampas, situaciones });
        });
    });
    }); // fin _seedRampasIfEmpty
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

        const nuevoIdOT = "OT-" + String(ultimo).padStart(4, '0') + "-" + currentYear;

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
        const correlativoID = `ST-${nextNum}-${year}`;

        const sql = `INSERT INTO ordenes_trabajo
            (ticket_entrada, placa, id_rampa, tipo_trabajo, descripcion_falla, conductor, kilometraje, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'EN ESPERA')`;

        db.query(sql, [correlativoID, data.placa, data.id_rampa, data.tipo_trabajo, data.descripcion_falla, data.conductor, data.kilometraje], (err) => {
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

        const nuevoIdOT = "OT-" + String(ultimo).padStart(4, '0') + "-" + currentYear;

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
// MÓDULO PLANIFICACIÓN PREVENTIVOS
// ============================================================
// GENERADORES DE ID
// ============================================================

// Genera ID legible para Fleetrun: FL-AJH832-MP1-20260415
// Si ya existe ese ID (mismo placa+tipomp+fecha), agrega -2, -3, etc.
function generarIdFleetrunUnico(placa, tipoMp, fecha, cb) {
    const p = (placa || 'XX').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
    const t = (tipoMp || 'MP').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
    const fechaStr = (fecha || new Date().toISOString().split('T')[0]).split('T')[0].replace(/-/g, '');
    const base = `FL-${p}-${t}-${fechaStr}`;
    db.query(
        'SELECT idRegistro FROM fleetrun WHERE idRegistro LIKE ? ORDER BY idRegistro DESC LIMIT 10',
        [base + '%'],
        (err, rows) => {
            if (err || !rows.length) return cb(base);
            // Si existe el base exacto, buscar el próximo número
            const existing = rows.map(r => r.idRegistro);
            if (!existing.includes(base)) return cb(base);
            let seq = 2;
            while (existing.includes(`${base}-${seq}`)) seq++;
            cb(`${base}-${seq}`);
        }
    );
}

// Genera el próximo ID de planificación (PLAN-YYYYMM-XXXX)
function generarIdPlan(mes, anio, cb) {
    const prefix = `PLAN-${anio}${String(mes).padStart(2,'0')}`;
    db.query(
        `SELECT id FROM planificacion WHERE id LIKE ? ORDER BY id DESC LIMIT 1`,
        [`${prefix}%`],
        (err, rows) => {
            let seq = 1;
            if (!err && rows.length) {
                const last = rows[0].id.split('-')[2];
                seq = (parseInt(last, 10) || 0) + 1;
            }
            cb(`${prefix}-${String(seq).padStart(4,'0')}`);
        }
    );
}

// Auto-genera requerimientos de kits para un plan creado
function generarRequerimientos(planId, placa, tipoMp, mes, anio) {
    db.query('SELECT marca FROM placas WHERE placa=?', [placa], (err, rows) => {
        if (err || !rows.length) return;
        const marca = (rows[0].marca || '').toUpperCase();
        db.query(
            `SELECT item_codigo, item_nombre, cantidad, unidad_medida, costo_unitario, costo_total
             FROM mantenimiento_kits
             WHERE UPPER(marca_vehiculo)=? AND tipo_mp=? AND activo=1
             ORDER BY orden`,
            [marca, tipoMp],
            (err2, kits) => {
                if (err2 || !kits.length) return;
                const inserts = kits.map(k => [
                    planId, mes, anio,
                    k.item_codigo, k.item_nombre,
                    k.cantidad, k.unidad_medida,
                    k.costo_unitario, k.costo_total
                ]);
                db.query(
                    `INSERT INTO requerimientos_planificacion
                     (plan_id, mes_ejecucion, anio_ejecucion, item_codigo, item_nombre,
                      cantidad_requerida, unidad_medida, costo_unitario, costo_total)
                     VALUES ?`,
                    [inserts],
                    (err3) => {
                        if (err3) console.warn('Requerimientos insert error:', err3.message);
                    }
                );
            }
        );
    });
}

// Auto-genera la PRÓXIMA planificación cuando se completa una
function generarProximaMP(placa, tipoMp, createdBy) {
    db.query(
        `SELECT km_actual, km_proximo, frecuencia_km, fecha, km_gps FROM fleetrun
         WHERE placa=? AND tipo_mp=? ORDER BY fecha DESC, idRegistro DESC LIMIT 1`,
        [placa, tipoMp],
        (err, rows) => {
            if (err || !rows.length) return;
            const last = rows[0];
            const intervalo = last.frecuencia_km
                ? parseInt(last.frecuencia_km)
                : (last.km_proximo && last.km_actual ? last.km_proximo - last.km_actual : 0);
            if (!intervalo || intervalo <= 0) return;

            const nextKm = (parseInt(last.km_proximo) || parseInt(last.km_actual) + intervalo);

            // Obtener config para estimar fecha
            db.query(
                `SELECT p.marca, cf.km_diarios
                 FROM placas p
                 LEFT JOIN configuracion_flota cf ON UPPER(cf.marca)=UPPER(p.marca) AND cf.activa=1
                 WHERE p.placa=?
                 ORDER BY cf.uts_categoria ASC LIMIT 1`,
                [placa],
                (err2, cfRows) => {
                    const kmDiarios = (cfRows && cfRows.length && cfRows[0].km_diarios)
                        ? parseFloat(cfRows[0].km_diarios) : 0;

                    const kmGpsActual = parseInt(last.km_gps) || parseInt(last.km_proximo) || parseInt(last.km_actual);
                    let diasAlProximo = 30; // default 1 mes
                    if (kmDiarios > 0) {
                        const faltanKm = nextKm - kmGpsActual;
                        diasAlProximo = Math.max(7, Math.round(faltanKm / kmDiarios));
                    }

                    const hoy = new Date();
                    const fechaEstimada = new Date(hoy.getTime() + diasAlProximo * 86400000);
                    const fechaInicio = new Date(fechaEstimada.getTime() - 5 * 86400000);
                    const fechaFin    = new Date(fechaEstimada.getTime() + 5 * 86400000);

                    const mes  = fechaEstimada.getMonth() + 1;
                    const anio = fechaEstimada.getFullYear();

                    generarIdPlan(mes, anio, (newId) => {
                        db.query(
                            `INSERT INTO planificacion
                             (id, placa, tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
                              mes_ejecucion, anio_ejecucion, km_estimado, km_minimo, km_maximo,
                              estado, source, created_by)
                             VALUES (?,?,?,?,?,?,?,?,?,?,'Programada','auto_generada',?)`,
                            [
                                newId, placa, tipoMp,
                                fechaInicio.toISOString().split('T')[0],
                                fechaFin.toISOString().split('T')[0],
                                mes, anio, nextKm,
                                nextKm - 5000, nextKm + 5000,
                                createdBy || 'sistema'
                            ],
                            (err3) => {
                                if (!err3) {
                                    generarRequerimientos(newId, placa, tipoMp, mes, anio);
                                    broadcast('planificacion', 'auto_generada');
                                    console.log(`✅ Próxima MP generada: ${newId} (${placa} ${tipoMp})`);
                                } else {
                                    console.warn('generarProximaMP insert error:', err3.message);
                                }
                            }
                        );
                    });
                }
            );
        }
    );
}

// GET /api/configuracion-flota
app.get('/api/configuracion-flota', (req, res) => {
    db.query(
        `SELECT id, marca, uts_categoria, km_mensuales, dias_operativos,
                CASE WHEN dias_operativos > 0 THEN ROUND(km_mensuales / dias_operativos, 2) ELSE 0 END AS km_diarios,
                mp1_intervalo_km, mp2_intervalo_km, mp3_intervalo_km, activa, observaciones
         FROM configuracion_flota ORDER BY marca, uts_categoria`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: rows });
        }
    );
});

// PUT /api/configuracion-flota/:id  (Gerencia ajusta km/mes e intervalos)
app.put('/api/configuracion-flota/:id', (req, res) => {
    const { id } = req.params;
    const { km_mensuales, dias_operativos, mp1_intervalo_km, mp2_intervalo_km, mp3_intervalo_km, observaciones, activa } = req.body;
    db.query(
        `UPDATE configuracion_flota
         SET km_mensuales=?, dias_operativos=?, mp1_intervalo_km=?, mp2_intervalo_km=?, mp3_intervalo_km=?,
             observaciones=?, activa=?
         WHERE id=?`,
        [km_mensuales, dias_operativos, mp1_intervalo_km, mp2_intervalo_km, mp3_intervalo_km, observaciones, activa, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

// GET /api/mantenimiento-kits?marca=X&tipo_mp=Y
app.get('/api/mantenimiento-kits', (req, res) => {
    const { marca, tipo_mp } = req.query;
    let sql = `SELECT id, marca_vehiculo, tipo_mp, nombre_kit, item_codigo, item_nombre,
                      cantidad, unidad_medida, costo_unitario, costo_total, orden
               FROM mantenimiento_kits WHERE activo=1`;
    const params = [];
    if (marca)   { sql += ' AND UPPER(marca_vehiculo)=?'; params.push(marca.toUpperCase()); }
    if (tipo_mp) { sql += ' AND tipo_mp=?'; params.push(tipo_mp); }
    sql += ' ORDER BY marca_vehiculo, tipo_mp, orden';
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// GET /api/planificacion?mes=X&anio=Y&estado=X&placa=X
app.get('/api/planificacion', (req, res) => {
    const { mes, anio, estado, placa } = req.query;
    let sql = `SELECT p.*, pl.marca, pl.cliente, pl.modelo_uts, pl.tipo, pl.uts AS placa_uts
               FROM planificacion p
               LEFT JOIN placas pl ON pl.placa = p.placa
               WHERE 1=1`;
    const params = [];
    if (mes)    { sql += ' AND p.mes_ejecucion=?';   params.push(parseInt(mes)); }
    if (anio)   { sql += ' AND p.anio_ejecucion=?';  params.push(parseInt(anio)); }
    if (estado) { sql += ' AND p.estado=?';           params.push(estado); }
    if (placa)  { sql += ' AND p.placa=?';            params.push(placa.toUpperCase()); }
    sql += ' ORDER BY p.fecha_inicio_ventana ASC, p.prioridad DESC';
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// POST /api/importarPlanificacionMasivo  (JSON desde SheetJS en frontend)
app.post('/api/importarPlanificacionMasivo', async (req, res) => {
    const { registros, mes, anio, createdBy } = req.body;
    if (!Array.isArray(registros) || !registros.length)
        return res.status(400).json({ ok: 0, errores: 0, msg: 'Sin registros' });

    const mesN  = parseInt(mes)  || new Date().getMonth() + 1;
    const anioN = parseInt(anio) || new Date().getFullYear();

    let ok = 0, errores = 0;
    const detallesError = [];

    // Validar que todas las placas existen
    const placasUnicas = [...new Set(registros.map(r => (r.placa || r.PLACA || '').toString().trim().toUpperCase()).filter(Boolean))];
    const placasEnDB = await new Promise(resolve => {
        if (!placasUnicas.length) return resolve([]);
        db.query('SELECT placa FROM placas WHERE placa IN (?)', [placasUnicas], (err, rows) => {
            resolve(err ? [] : rows.map(r => r.placa));
        });
    });

    for (let i = 0; i < registros.length; i++) {
        const r = registros[i];
        const placa    = (r.placa || r.PLACA || '').toString().trim().toUpperCase();
        const tipoMp   = (r.tipo_mp || r.TIPO_MP || r['TIPO MP'] || '').toString().trim().toUpperCase();
        const fechaIni = r.fecha_inicio || r.FECHA_INICIO || r['FECHA INICIO'] || '';
        const fechaFin = r.fecha_fin    || r.FECHA_FIN    || r['FECHA FIN']    || '';

        if (!placa || !tipoMp || !fechaIni || !fechaFin) {
            errores++;
            detallesError.push(`Fila ${i+2}: datos incompletos (placa, tipo_mp, fechas son obligatorios)`);
            continue;
        }
        if (!placasEnDB.includes(placa)) {
            errores++;
            detallesError.push(`Fila ${i+2}: placa ${placa} no existe en el sistema`);
            continue;
        }

        const kmEst  = parseInt(r.km_estimado || r.KM_ESTIMADO || r['KM ESTIMADO'] || 0) || 0;
        const kmMin  = parseInt(r.km_minimo   || r.KM_MINIMO   || r['KM MINIMO']   || 0) || null;
        const kmMax  = parseInt(r.km_maximo   || r.KM_MAXIMO   || r['KM MAXIMO']   || 0) || null;
        const tecnico   = r.tecnico   || r.TECNICO   || null;
        const prioridad = r.prioridad || r.PRIORIDAD || 'Normal';
        const obs       = r.observaciones || r.OBSERVACIONES || null;

        await new Promise(resolve => {
            generarIdPlan(mesN, anioN, (newId) => {
                db.query(
                    `INSERT INTO planificacion
                     (id, placa, tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
                      mes_ejecucion, anio_ejecucion, km_estimado, km_minimo, km_maximo,
                      tecnico_asignado, prioridad, observaciones_plan,
                      estado, source, created_by)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'Programada','manual_excel',?)`,
                    [newId, placa, tipoMp, fechaIni, fechaFin,
                     mesN, anioN, kmEst, kmMin, kmMax,
                     tecnico, prioridad, obs, createdBy || 'sistema'],
                    (err) => {
                        if (err) {
                            errores++;
                            detallesError.push(`Fila ${i+2}: ${err.message}`);
                        } else {
                            ok++;
                            generarRequerimientos(newId, placa, tipoMp, mesN, anioN);
                        }
                        resolve();
                    }
                );
            });
        });
    }

    if (ok > 0) broadcast('planificacion', 'importar');
    res.json({ ok, errores, errores_detalle: detallesError });
});

// POST /api/planificacion/lote — Genera múltiples planes desde proyección
app.post('/api/planificacion/lote', (req, res) => {
    const { planes } = req.body;
    if (!Array.isArray(planes) || !planes.length) return res.status(400).json({ error: 'planes[] requerido' });
    let creados = 0, ignorados = 0;
    const procesarPlan = (plan, cb) => {
        const { placa, tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
                mes_ejecucion, anio_ejecucion, km_estimado, prioridad, source, created_by } = plan;
        if (!placa || !tipo_mp || !fecha_inicio_ventana || !fecha_fin_ventana) { ignorados++; return cb(); }
        db.query(
            `SELECT id FROM planificacion
             WHERE UPPER(placa)=? AND UPPER(tipo_mp)=? AND mes_ejecucion=? AND anio_ejecucion=?
               AND estado NOT IN ('Cancelada','Diferida') LIMIT 1`,
            [placa.toUpperCase(), tipo_mp.toUpperCase(), mes_ejecucion, anio_ejecucion],
            (err, rows) => {
                if (err || rows.length) { ignorados++; return cb(); }
                generarIdPlan(mes_ejecucion, anio_ejecucion, (newId) => {
                    db.query(
                        `INSERT INTO planificacion (id, placa, tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
                         mes_ejecucion, anio_ejecucion, km_estimado, prioridad, estado, source, created_by)
                         VALUES (?,?,?,?,?,?,?,?,?,'Programada',?,?)`,
                        [newId, placa.toUpperCase(), tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
                         mes_ejecucion, anio_ejecucion, km_estimado || 0,
                         prioridad || 'Normal', source || 'auto_generada', created_by || 'sistema'],
                        (e2) => { if (!e2) creados++; cb(); }
                    );
                });
            }
        );
    };
    let i = 0;
    const siguiente = () => {
        if (i >= planes.length) {
            broadcast('planificacion', 'lote');
            return res.json({ ok: true, creados, ignorados });
        }
        procesarPlan(planes[i++], siguiente);
    };
    siguiente();
});

// POST /api/planificacion  (crear uno solo manualmente)
app.post('/api/planificacion', (req, res) => {
    const { placa, tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
            mes_ejecucion, anio_ejecucion, km_estimado, km_minimo, km_maximo,
            tecnico_asignado, prioridad, observaciones_plan, created_by } = req.body;

    if (!placa || !tipo_mp || !fecha_inicio_ventana || !fecha_fin_ventana)
        return res.status(400).json({ error: 'Placa, tipo_mp y fechas son requeridos' });

    const mes  = parseInt(mes_ejecucion)  || new Date().getMonth() + 1;
    const anio = parseInt(anio_ejecucion) || new Date().getFullYear();

    generarIdPlan(mes, anio, (newId) => {
        db.query(
            `INSERT INTO planificacion
             (id, placa, tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
              mes_ejecucion, anio_ejecucion, km_estimado, km_minimo, km_maximo,
              tecnico_asignado, prioridad, observaciones_plan,
              estado, source, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'Programada','manual_excel',?)`,
            [newId, placa.toUpperCase(), tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
             mes, anio, km_estimado || 0, km_minimo || null, km_maximo || null,
             tecnico_asignado || null, prioridad || 'Normal', observaciones_plan || null,
             created_by || 'sistema'],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                generarRequerimientos(newId, placa.toUpperCase(), tipo_mp, mes, anio);
                broadcast('planificacion', 'crear');
                res.json({ ok: true, id: newId });
            }
        );
    });
});

// PUT /api/planificacion/:id  (cambiar estado, reasignar, posponer)
app.put('/api/planificacion/:id', (req, res) => {
    const { id } = req.params;
    const {
        estado, tecnico_asignado, prioridad, observaciones_plan,
        fecha_inicio_ventana, fecha_fin_ventana,
        mes_ejecucion, anio_ejecucion,
        motivo_cancelacion
    } = req.body;

    const campos = [];
    const vals   = [];

    if (estado !== undefined)               { campos.push('estado=?');                 vals.push(estado); }
    if (tecnico_asignado !== undefined)     { campos.push('tecnico_asignado=?');       vals.push(tecnico_asignado); }
    if (prioridad !== undefined)            { campos.push('prioridad=?');              vals.push(prioridad); }
    if (observaciones_plan !== undefined)   { campos.push('observaciones_plan=?');     vals.push(observaciones_plan); }
    if (fecha_inicio_ventana !== undefined) { campos.push('fecha_inicio_ventana=?');   vals.push(fecha_inicio_ventana); }
    if (fecha_fin_ventana !== undefined)    { campos.push('fecha_fin_ventana=?');      vals.push(fecha_fin_ventana); }
    if (mes_ejecucion !== undefined)        { campos.push('mes_ejecucion=?');          vals.push(mes_ejecucion); }
    if (anio_ejecucion !== undefined)       { campos.push('anio_ejecucion=?');         vals.push(anio_ejecucion); }
    if (motivo_cancelacion !== undefined)   { campos.push('motivo_cancelacion=?');     vals.push(motivo_cancelacion); }

    // Si se pospone: resetear alertas
    if (estado === 'Diferida') {
        campos.push('fecha_primer_retraso=NULL');
        campos.push('alertas_enviadas=0');
    }

    if (!campos.length) return res.status(400).json({ error: 'Sin campos a actualizar' });

    vals.push(id);
    db.query(`UPDATE planificacion SET ${campos.join(',')} WHERE id=?`, vals, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        broadcast('planificacion', 'actualizar');
        res.json({ ok: true });
    });
});

// POST /api/planificacion/:id/completar  (link a Fleetrun + generar próxima MP)
app.post('/api/planificacion/:id/completar', (req, res) => {
    const { id } = req.params;
    const { fleetrun_id, fecha_real, km_real, usuario } = req.body;

    if (!fleetrun_id)
        return res.status(400).json({ error: 'fleetrun_id es requerido' });

    db.query('SELECT placa, tipo_mp, km_estimado, fecha_inicio_ventana, estado FROM planificacion WHERE id=?', [id], (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ error: 'Plan no encontrado' });
        const plan = rows[0];

        // Idempotencia: si ya está completado con el mismo Fleetrun, responder OK sin duplicar
        if (plan.estado === 'Completada') {
            return res.json({ ok: true, ya_completado: true });
        }

        const kmReal = parseInt(km_real) || 0;
        const desviacionKm = kmReal ? kmReal - plan.km_estimado : null;

        // Calcular desviacion_dias solo si ambas fechas son válidas
        let desviacionDias = null;
        if (fecha_real) {
            const dReal = new Date(fecha_real);
            const dPlan = plan.fecha_inicio_ventana instanceof Date
                ? plan.fecha_inicio_ventana
                : new Date(String(plan.fecha_inicio_ventana || ''));
            if (!isNaN(dReal.getTime()) && !isNaN(dPlan.getTime())) {
                desviacionDias = Math.round((dReal - dPlan) / 86400000);
            }
        }

        db.query(
            `UPDATE planificacion SET
                estado='Completada',
                fleetrun_id_ejecutado=?,
                fecha_real_ejecucion=?,
                km_real_ejecucion=?,
                desviacion_km=?,
                desviacion_dias=?,
                alertas_enviadas=0
             WHERE id=? AND estado != 'Completada'`,
            [fleetrun_id, fecha_real || null, kmReal || null, desviacionKm, desviacionDias, id],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                broadcast('planificacion', 'completar');
                logAudit(usuario || 'sistema', 'planificacion', 'COMPLETÓ', `${plan.tipo_mp} · ${plan.placa} → ${fleetrun_id}`);
                // Auto-generar próxima MP
                generarProximaMP(plan.placa, plan.tipo_mp, usuario || 'sistema');
                res.json({ ok: true });
            }
        );
    });
});

// DELETE /api/planificacion/:id  (cancelar con motivo)
app.delete('/api/planificacion/:id', (req, res) => {
    const { id }     = req.params;
    const { motivo, usuario } = req.body;

    db.query(
        `UPDATE planificacion SET estado='Cancelada', motivo_cancelacion=? WHERE id=?`,
        [motivo || null, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            logAudit(usuario || 'sistema', 'planificacion', 'CANCELÓ', `Plan ${id}: ${motivo || 'sin motivo'}`);
            broadcast('planificacion', 'cancelar');
            res.json({ ok: true });
        }
    );
});

// GET /api/reportePlanificacion?mes=X&anio=Y
app.get('/api/reportePlanificacion', (req, res) => {
    const mes  = parseInt(req.query.mes)  || new Date().getMonth() + 1;
    const anio = parseInt(req.query.anio) || new Date().getFullYear();

    db.query(
        `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN estado='Completada' THEN 1 ELSE 0 END) AS completadas,
            SUM(CASE WHEN estado='Cancelada'  THEN 1 ELSE 0 END) AS canceladas,
            SUM(CASE WHEN estado='Diferida'   THEN 1 ELSE 0 END) AS diferidas,
            SUM(CASE WHEN estado NOT IN ('Completada','Cancelada','Diferida') THEN 1 ELSE 0 END) AS pendientes,
            ROUND(
                SUM(CASE WHEN estado='Completada' THEN 1 ELSE 0 END) * 100.0 /
                NULLIF(COUNT(*),0), 1
            ) AS pct_cumplimiento,
            ROUND(AVG(CASE WHEN desviacion_dias IS NOT NULL THEN desviacion_dias END),1) AS promedio_desviacion_dias,
            ROUND(AVG(CASE WHEN desviacion_km IS NOT NULL AND estado='Completada' THEN desviacion_km END),0) AS promedio_desviacion_km,
            MAX(CASE WHEN desviacion_dias > 0 THEN desviacion_dias END) AS max_retraso_dias
         FROM planificacion
         WHERE mes_ejecucion=? AND anio_ejecucion=?`,
        [mes, anio],
        (err, kpis) => {
            if (err) return res.status(500).json({ error: err.message });

            db.query(
                `SELECT p.id, p.placa, pl.cliente, pl.marca, p.tipo_mp,
                        p.fecha_inicio_ventana, p.fecha_fin_ventana,
                        p.fecha_real_ejecucion, p.km_estimado, p.km_real_ejecucion,
                        p.desviacion_km, p.desviacion_dias, p.tecnico_asignado,
                        p.estado, p.prioridad, p.observaciones_plan, p.motivo_cancelacion,
                        p.fleetrun_id_ejecutado, p.source
                 FROM planificacion p
                 LEFT JOIN placas pl ON pl.placa=p.placa
                 WHERE p.mes_ejecucion=? AND p.anio_ejecucion=?
                 ORDER BY p.fecha_inicio_ventana ASC`,
                [mes, anio],
                (err2, detalle) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ kpis: kpis[0], detalle });
                }
            );
        }
    );
});

// GET /api/requerimientos-planificacion?mes=X&anio=Y&plan_id=X
app.get('/api/requerimientos-planificacion', (req, res) => {
    const { mes, anio, plan_id } = req.query;
    let sql = `SELECT r.*, p.placa, p.tipo_mp FROM requerimientos_planificacion r
               LEFT JOIN planificacion p ON p.id=r.plan_id WHERE 1=1`;
    const params = [];
    if (plan_id) { sql += ' AND r.plan_id=?'; params.push(plan_id); }
    if (mes)     { sql += ' AND r.mes_ejecucion=?'; params.push(parseInt(mes)); }
    if (anio)    { sql += ' AND r.anio_ejecucion=?'; params.push(parseInt(anio)); }
    sql += ' ORDER BY r.plan_id, r.id';
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// GET /api/planificacion-proyeccion?meses=3&placa=ALL
// Proyecta próximos mantenimientos basándose en el último Fleetrun + frecuencia configurada
app.get('/api/planificacion-proyeccion', (req, res) => {
    const meses = Math.max(1, Math.min(24, parseInt(req.query.meses) || 3));
    const placa = (req.query.placa || '').toUpperCase().trim();

    const sql = `
        SELECT
            fr.placa, fr.tipo_mp,
            fr.ultima_fecha, fr.ultimo_km, fr.km_proximo,
            p.marca, p.cliente, p.uts,
            tm.frecuencia_km, tm.frecuencia_dias,
            COALESCE(ks.costo_total_kit, 0) AS costo_kit
        FROM (
            SELECT f.placa, f.tipo_mp,
                   MAX(f.fecha)      AS ultima_fecha,
                   MAX(f.km_actual)  AS ultimo_km,
                   MAX(f.km_proximo) AS km_proximo,
                   MAX(f.marca)      AS fr_marca
            FROM fleetrun f
            INNER JOIN (
                SELECT placa, tipo_mp, MAX(fecha) AS max_fecha
                FROM fleetrun
                GROUP BY placa, tipo_mp
            ) lf ON f.placa = lf.placa AND f.tipo_mp = lf.tipo_mp AND f.fecha = lf.max_fecha
            GROUP BY f.placa, f.tipo_mp
        ) fr
        LEFT JOIN placas p   ON UPPER(p.placa) = UPPER(fr.placa)
        LEFT JOIN tipos_mantenimiento tm
            ON tm.id = (
                SELECT id FROM tipos_mantenimiento
                WHERE UPPER(marca) = UPPER(COALESCE(p.marca, fr.fr_marca, ''))
                  AND UPPER(tipo_mp) = UPPER(fr.tipo_mp)
                ORDER BY CASE WHEN UPPER(uts) = UPPER(COALESCE(p.uts,'')) THEN 0 ELSE 1 END, id ASC
                LIMIT 1
            )
        LEFT JOIN (
            SELECT marca_vehiculo, tipo_mp, SUM(costo_total) AS costo_total_kit
            FROM mantenimiento_kits
            WHERE activo = 1 OR activo IS NULL
            GROUP BY marca_vehiculo, tipo_mp
        ) ks ON UPPER(ks.marca_vehiculo) = UPPER(COALESCE(p.marca,'')) AND ks.tipo_mp = fr.tipo_mp
        ${placa ? 'WHERE UPPER(fr.placa) = ?' : ''}
        ORDER BY fr.placa, fr.tipo_mp
    `;

    const params = placa ? [placa] : [];

    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const horizonte = new Date(today);
        horizonte.setMonth(horizonte.getMonth() + meses);

        const resultado = [];

        rows.forEach(row => {
            let fecha_proyectada = null;
            let metodo = null;
            let vencida = false;
            let dias_restantes = null;

            if (row.ultima_fecha && row.frecuencia_dias) {
                const _rawUF = (row.ultima_fecha instanceof Date && !isNaN(row.ultima_fecha.getTime()))
                    ? row.ultima_fecha.toISOString()
                    : String(row.ultima_fecha || '');
                const base = new Date(_rawUF.slice(0, 10) + 'T00:00:00');
                if (!isNaN(base.getTime())) {
                    fecha_proyectada = new Date(base);
                    fecha_proyectada.setDate(fecha_proyectada.getDate() + parseInt(row.frecuencia_dias));
                    metodo  = 'dias';
                    vencida = fecha_proyectada < today;
                    dias_restantes = Math.round((fecha_proyectada - today) / 86400000);
                    if (!vencida && fecha_proyectada > horizonte) return;
                } else if (row.km_proximo) {
                    metodo = 'km';
                } else {
                    return;
                }
            } else if (row.km_proximo) {
                metodo = 'km';
            } else {
                return;
            }

            resultado.push({
                placa:           row.placa,
                marca:           row.marca || '',
                cliente:         row.cliente || '',
                uts:             row.uts    || '',
                tipo_mp:         row.tipo_mp,
                frecuencia_km:   row.frecuencia_km   || null,
                frecuencia_dias: row.frecuencia_dias || null,
                ultima_fecha:    (row.ultima_fecha instanceof Date && !isNaN(row.ultima_fecha.getTime()))
                    ? row.ultima_fecha.toISOString().split('T')[0]
                    : (row.ultima_fecha || null),
                ultimo_km:       row.ultimo_km,
                km_proximo:      row.km_proximo,
                costo_kit:       parseFloat(row.costo_kit) || 0,
                fecha_proyectada: (fecha_proyectada && !isNaN(fecha_proyectada.getTime())) ? fecha_proyectada.toISOString().split('T')[0] : null,
                metodo,
                vencida,
                dias_restantes
            });
        });

        res.json({ data: resultado, total: resultado.length });
    });
});

// GET /api/planificacion-sugerir?placa=X&tipomp=Y — sugiere fechas/KM para nuevo plan
app.get('/api/planificacion-sugerir', (req, res) => {
    const { placa, tipomp } = req.query;
    if (!placa || !tipomp) return res.status(400).json({ error: 'placa y tipomp requeridos' });

    // 1. Último registro Fleetrun para esa placa+tipomp
    db.query(
        `SELECT fecha, km_actual, km_proximo FROM fleetrun
         WHERE UPPER(placa)=? AND UPPER(tipo_mp)=?
         ORDER BY fecha DESC, idRegistro DESC LIMIT 1`,
        [placa.toUpperCase(), tipomp.toUpperCase()],
        (err, frRows) => {
            if (err) return res.status(500).json({ error: err.message });

            // 2. Configuración de frecuencia desde tipos_mantenimiento
            // ORDER BY prioriza el que coincide con el uts del vehículo (NACIONAL vs LOCAL)
            db.query(
                `SELECT tm.frecuencia_km, tm.frecuencia_dias, tm.uts
                 FROM tipos_mantenimiento tm
                 INNER JOIN placas p ON UPPER(p.marca) = UPPER(tm.marca)
                 WHERE UPPER(p.placa)=? AND UPPER(tm.tipo_mp)=?
                 ORDER BY CASE WHEN UPPER(tm.uts) = UPPER(p.uts) THEN 0 ELSE 1 END, tm.id ASC
                 LIMIT 1`,
                [placa.toUpperCase(), tipomp.toUpperCase()],
                (err2, tmRows) => {
                    if (err2) return res.status(500).json({ error: err2.message });

                    const tm = tmRows[0] || {};
                    const fr = frRows[0] || {};

                    // Calcular fecha sugerida
                    let fechaSugerida = null;
                    let fechaFinSugerida = null;
                    let kmSugerido = null;

                    const frecDias = parseInt(tm.frecuencia_dias) || 0;
                    const frecKm   = parseInt(tm.frecuencia_km)   || 0;

                    if (fr.fecha) {
                        const fechaRaw = fr.fecha instanceof Date ? fr.fecha.toISOString() : String(fr.fecha || '');
                        const base = new Date(fechaRaw.slice(0, 10) + 'T00:00:00');
                        if (!isNaN(base.getTime()) && frecDias > 0) {
                            const ini = new Date(base);
                            ini.setDate(ini.getDate() + frecDias);
                            fechaSugerida = ini.toISOString().split('T')[0];
                            // Ventana por defecto: 7 días
                            const fin = new Date(ini);
                            fin.setDate(fin.getDate() + 7);
                            fechaFinSugerida = fin.toISOString().split('T')[0];
                        }
                    }
                    if (fr.km_actual && frecKm > 0) {
                        kmSugerido = parseInt(fr.km_actual) + frecKm;
                    }

                    if (!fechaSugerida && !kmSugerido) {
                        return res.json({ ok: false, mensaje: 'Sin datos suficientes para sugerir fechas' });
                    }

                    res.json({
                        ok: true,
                        fecha_sugerida:     fechaSugerida,
                        fecha_fin_sugerida: fechaFinSugerida,
                        km_sugerido:        kmSugerido,
                        basado_en: {
                            ultimo_fleetrun_fecha: fr.fecha || null,
                            ultimo_km_actual:      fr.km_actual || null,
                            frecuencia_dias:       frecDias || null,
                            frecuencia_km:         frecKm   || null
                        }
                    });
                }
            );
        }
    );
});

// GET /api/fleetrun/buscar/:id — buscar un registro por idRegistro (para completar plan)
app.get('/api/fleetrun/buscar/:id', (req, res) => {
    db.query(
        `SELECT idRegistro, fecha, placa, tipo_mp, km_actual, km_proximo, frecuencia_km, tecnico, observacion
         FROM fleetrun WHERE idRegistro = ? LIMIT 1`,
        [req.params.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado' });
            res.json({ data: rows[0] });
        }
    );
});

// POST /api/fleetrun-backfill-codigos — migra IDs tipo FL-1713000000000 al formato legible
app.post('/api/fleetrun-backfill-codigos', (req, res) => {
    // Buscar registros con el antiguo formato timestamp (FL-13dígitos)
    db.query(
        `SELECT idRegistro, placa, tipo_mp, fecha FROM fleetrun
         WHERE idRegistro REGEXP '^FL-[0-9]{10,}$' OR idRegistro NOT REGEXP '^FL-[A-Z]'
         ORDER BY fecha ASC`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.json({ ok: true, actualizados: 0, mensaje: 'No hay registros con IDs antiguos' });

            let pendientes = rows.length;
            let actualizados = 0;
            let errores = 0;

            const procesarSiguiente = (idx) => {
                if (idx >= rows.length) {
                    return res.json({ ok: true, actualizados, errores, total: rows.length });
                }
                const r = rows[idx];
                const fechaStr = r.fecha
                    ? (r.fecha instanceof Date ? r.fecha.toISOString() : String(r.fecha)).split('T')[0]
                    : new Date().toISOString().split('T')[0];

                generarIdFleetrunUnico(r.placa, r.tipo_mp, fechaStr, (nuevoId) => {
                    db.query(
                        'UPDATE fleetrun SET idRegistro = ? WHERE idRegistro = ?',
                        [nuevoId, r.idRegistro],
                        (err2) => {
                            if (err2) { errores++; } else { actualizados++; }
                            procesarSiguiente(idx + 1);
                        }
                    );
                });
            };

            procesarSiguiente(0);
        }
    );
});

// GET /api/requerimientos-resumen?mes=X&anio=Y — vista consolidada por marca/tipo
app.get('/api/requerimientos-resumen', (req, res) => {
    const { mes, anio } = req.query;
    if (!mes || !anio) return res.status(400).json({ error: 'mes y anio son requeridos' });
    const sql = `
        SELECT pl2.marca, p.tipo_mp, mk.nombre_kit,
               r.item_codigo, r.item_nombre,
               SUM(r.cantidad_requerida) AS total_cantidad, r.unidad_medida,
               r.costo_unitario, SUM(r.costo_total) AS total_costo,
               COUNT(DISTINCT r.plan_id) AS num_planes
        FROM requerimientos_planificacion r
        LEFT JOIN planificacion p ON p.id = r.plan_id
        LEFT JOIN placas pl2 ON UPPER(pl2.placa) = UPPER(p.placa)
        LEFT JOIN mantenimiento_kits mk
               ON UPPER(mk.marca_vehiculo) = UPPER(pl2.marca)
              AND mk.tipo_mp = p.tipo_mp
              AND mk.item_codigo = r.item_codigo
        WHERE r.mes_ejecucion = ? AND r.anio_ejecucion = ?
          AND p.estado NOT IN ('Cancelada')
        GROUP BY pl2.marca, p.tipo_mp, mk.nombre_kit, r.item_codigo,
                 r.item_nombre, r.unidad_medida, r.costo_unitario
        ORDER BY pl2.marca, p.tipo_mp, r.item_codigo`;
    db.query(sql, [parseInt(mes), parseInt(anio)], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// ============================================================
// CRUD TIPOS PREVENTIVO (tabla maestra de tipos de MP)
// ============================================================
app.get('/api/tipos-preventivo', (req, res) => {
    db.query(
        `SELECT id, nombre, descripcion, activo FROM tipos_preventivo WHERE activo=1 ORDER BY nombre`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: rows });
        }
    );
});

app.post('/api/tipos-preventivo', (req, res) => {
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre es requerido' });
    db.query(
        `INSERT INTO tipos_preventivo (nombre, descripcion) VALUES (?, ?)`,
        [nombre.toUpperCase(), descripcion || null],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.put('/api/tipos-preventivo/:id', (req, res) => {
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre es requerido' });
    db.query(
        `UPDATE tipos_preventivo SET nombre=?, descripcion=? WHERE id=?`,
        [nombre.toUpperCase(), descripcion || null, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.delete('/api/tipos-preventivo/:id', (req, res) => {
    db.query(`DELETE FROM tipos_preventivo WHERE id=?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// Sync: importa tipos distintos de tipos_mantenimiento hacia tipos_preventivo
app.post('/api/tipos-preventivo/sync-desde-frecuencias', (req, res) => {
    db.query(
        `INSERT IGNORE INTO tipos_preventivo (nombre)
         SELECT DISTINCT UPPER(TRIM(tipo_mp)) FROM tipos_mantenimiento
         WHERE tipo_mp IS NOT NULL AND TRIM(tipo_mp) != ''`,
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, insertados: result.affectedRows });
        }
    );
});

// ============================================================
// HISTÓRICO KM GPS — Snapshots diarios por placa
// ============================================================

// Últimos N días de snapshots + km/día promedio
app.get('/api/km-historico/:placa', (req, res) => {
    const placa = (req.params.placa || '').toUpperCase().trim();
    const dias  = Math.min(parseInt(req.query.dias) || 30, 90);
    if (!placa) return res.status(400).json({ error: 'Placa requerida' });

    db.query(
        `SELECT fecha, km_gps, horas_motor
         FROM km_snapshots
         WHERE placa = ?
           AND fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         ORDER BY fecha ASC`,
        [placa, dias],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows || rows.length < 2) return res.json({ data: rows || [], km_dia: null, horas_dia: null });

            // Calcular km/día promedio entre primer y último snapshot
            const primero = rows[0];
            const ultimo  = rows[rows.length - 1];
            const diasDiff = Math.max(1,
                (new Date(ultimo.fecha) - new Date(primero.fecha)) / (1000 * 60 * 60 * 24)
            );
            const km_dia    = ((ultimo.km_gps    - primero.km_gps)    / diasDiff).toFixed(0);
            const horas_dia = ((ultimo.horas_motor - primero.horas_motor) / diasDiff).toFixed(1);

            res.json({ data: rows, km_dia: Number(km_dia), horas_dia: Number(horas_dia), dias_muestra: diasDiff });
        }
    );
});

// Resumen general: km/día de todas las placas (últimos 30 días)
app.get('/api/km-historico', (req, res) => {
    db.query(
        `SELECT
            s1.placa,
            ROUND((MAX(s1.km_gps) - MIN(s1.km_gps)) / GREATEST(DATEDIFF(MAX(s1.fecha), MIN(s1.fecha)), 1), 0) AS km_dia,
            ROUND((MAX(s1.horas_motor) - MIN(s1.horas_motor)) / GREATEST(DATEDIFF(MAX(s1.fecha), MIN(s1.fecha)), 1), 1) AS horas_dia,
            COUNT(*) AS snapshots,
            MAX(s1.km_gps) AS km_actual,
            MAX(s1.fecha)  AS ultima_fecha
         FROM km_snapshots s1
         WHERE s1.fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         GROUP BY s1.placa
         HAVING snapshots >= 2
         ORDER BY s1.placa`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

// ============================================================
// CONFIG MÉTRICA POR PLACA (km vs horas motor)
// ============================================================
app.get('/api/config-metrica', (req, res) => {
    db.query(
        `SELECT placa, marca, metrica FROM placas ORDER BY placa`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

app.put('/api/config-metrica/:placa', (req, res) => {
    const { placa } = req.params;
    const metrica = (req.body.metrica || 'km').toLowerCase() === 'horas' ? 'horas' : 'km';
    db.query(
        `UPDATE placas SET metrica = ? WHERE placa = ?`,
        [metrica, placa],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (result.affectedRows === 0) return res.status(404).json({ error: 'Placa no encontrada' });
            res.json({ ok: true, placa, metrica });
        }
    );
});

// ============================================================
// CRUD TIPOS MANTENIMIENTO
// ============================================================
app.get('/api/tipos-mantenimiento', (req, res) => {
    const { marca, uts } = req.query;
    let sql = `SELECT id, marca, tipo_mp, uts, frecuencia_km, frecuencia_horas, frecuencia_dias,
                      tipo, sistema, descripcion
               FROM tipos_mantenimiento WHERE 1=1`;
    const params = [];
    if (marca) { sql += ' AND UPPER(marca)=?'; params.push(marca.toUpperCase()); }
    if (uts)   { sql += ' AND UPPER(uts)=?';   params.push(uts.toUpperCase()); }
    sql += ' ORDER BY marca, tipo_mp, uts';
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.post('/api/tipos-mantenimiento', (req, res) => {
    const { marca, tipo_mp, uts, frecuencia_km, frecuencia_horas, frecuencia_dias, tipo, sistema, descripcion } = req.body;
    if (!marca || !tipo_mp) return res.status(400).json({ error: 'Marca y tipo_mp son requeridos' });
    db.query(
        `INSERT INTO tipos_mantenimiento (marca, tipo_mp, uts, frecuencia_km, frecuencia_horas, frecuencia_dias, tipo, sistema, descripcion)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [marca, tipo_mp, uts || '', frecuencia_km || null, frecuencia_horas || null, frecuencia_dias || null, tipo || '', sistema || '', descripcion || ''],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.put('/api/tipos-mantenimiento/:id', (req, res) => {
    const { id } = req.params;
    const { marca, tipo_mp, uts, frecuencia_km, frecuencia_horas, frecuencia_dias, tipo, sistema, descripcion } = req.body;
    db.query(
        `UPDATE tipos_mantenimiento SET marca=?, tipo_mp=?, uts=?, frecuencia_km=?,
         frecuencia_horas=?, frecuencia_dias=?, tipo=?, sistema=?, descripcion=? WHERE id=?`,
        [marca, tipo_mp, uts || '', frecuencia_km || null, frecuencia_horas || null, frecuencia_dias || null, tipo || '', sistema || '', descripcion || '', id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.delete('/api/tipos-mantenimiento/:id', (req, res) => {
    db.query('DELETE FROM tipos_mantenimiento WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// POST /api/tipos-mantenimiento/bulk-delete — eliminación masiva por IDs
app.post('/api/tipos-mantenimiento/bulk-delete', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length)
        return res.status(400).json({ error: 'Sin IDs' });
    const placeholders = ids.map(function(){ return '?'; }).join(',');
    db.query('DELETE FROM tipos_mantenimiento WHERE id IN (' + placeholders + ')', ids, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true, eliminados: result.affectedRows });
    });
});

// POST /api/tipos-mantenimiento/importar — importación masiva (upsert por marca+tipo_mp+uts)
app.post('/api/tipos-mantenimiento/importar', async (req, res) => {
    const { registros } = req.body;
    if (!Array.isArray(registros) || !registros.length)
        return res.status(400).json({ error: 'Sin registros' });

    let insertados = 0, actualizados = 0;
    try {
        for (const r of registros) {
            const marca   = (r.marca   || '').toUpperCase().trim();
            const tipo_mp = (r.tipo_mp || '').toUpperCase().trim();
            const uts     = (r.uts     || 'LOCAL').toUpperCase().trim();
            if (!marca || !tipo_mp) continue;

            const [existing] = await db.promise().query(
                'SELECT id FROM tipos_mantenimiento WHERE UPPER(marca)=? AND UPPER(tipo_mp)=? AND UPPER(uts)=? LIMIT 1',
                [marca, tipo_mp, uts]
            );
            if (existing.length) {
                await db.promise().query(
                    `UPDATE tipos_mantenimiento SET
                        frecuencia_km=?, frecuencia_horas=?, frecuencia_dias=?,
                        tipo=?, sistema=?, descripcion=?
                     WHERE id=?`,
                    [r.frecuencia_km||null, r.frecuencia_horas||null, r.frecuencia_dias||null,
                     r.tipo||null, r.sistema||null, r.descripcion||null, existing[0].id]
                );
                actualizados++;
            } else {
                await db.promise().query(
                    `INSERT INTO tipos_mantenimiento
                        (marca, tipo_mp, uts, frecuencia_km, frecuencia_horas, frecuencia_dias, tipo, sistema, descripcion)
                     VALUES (?,?,?,?,?,?,?,?,?)`,
                    [marca, tipo_mp, uts, r.frecuencia_km||null, r.frecuencia_horas||null, r.frecuencia_dias||null,
                     r.tipo||null, r.sistema||null, r.descripcion||null]
                );
                insertados++;
            }
        }
        res.json({ ok: true, insertados, actualizados });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// CRUD DESTINATARIOS ALERTAS
// ============================================================
app.get('/api/destinatarios-alertas', (req, res) => {
    db.query('SELECT * FROM destinatarios_alertas ORDER BY nombre', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.post('/api/destinatarios-alertas', (req, res) => {
    const { nombre, correo, cargo, notif_1d, notif_3d, notif_7d, notif_completada } = req.body;
    if (!nombre || !correo) return res.status(400).json({ error: 'Nombre y correo son requeridos' });
    db.query(
        `INSERT INTO destinatarios_alertas (nombre, correo, cargo, notif_1d, notif_3d, notif_7d, notif_completada)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), cargo=VALUES(cargo),
         notif_1d=VALUES(notif_1d), notif_3d=VALUES(notif_3d),
         notif_7d=VALUES(notif_7d), notif_completada=VALUES(notif_completada), activo=1`,
        [nombre, correo.trim().toLowerCase(), cargo || null,
         notif_1d ? 1 : 0, notif_3d ? 1 : 0, notif_7d ? 1 : 0, notif_completada ? 1 : 0],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.put('/api/destinatarios-alertas/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, correo, cargo, notif_1d, notif_3d, notif_7d, notif_completada, activo } = req.body;
    db.query(
        `UPDATE destinatarios_alertas SET nombre=?, correo=?, cargo=?,
         notif_1d=?, notif_3d=?, notif_7d=?, notif_completada=?, activo=?
         WHERE id=?`,
        [nombre, correo?.trim().toLowerCase(), cargo || null,
         notif_1d ? 1 : 0, notif_3d ? 1 : 0, notif_7d ? 1 : 0,
         notif_completada ? 1 : 0, activo !== undefined ? (activo ? 1 : 0) : 1, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.delete('/api/destinatarios-alertas/:id', (req, res) => {
    db.query('DELETE FROM destinatarios_alertas WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// Disparo manual de alertas (para probar o forzar envío)
app.post('/api/dispararAlertas', async (req, res) => {
    try {
        await verificarAlertasRetraso();
        res.json({ ok: true, msg: 'Verificación ejecutada' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Test de email (envía a un correo de prueba)
app.post('/api/testEmail', async (req, res) => {
    const { correo } = req.body;
    if (!correo) return res.status(400).json({ error: 'Correo requerido' });
    try {
        await enviarEmailAlerta(
            correo,
            '✅ Test Azkell Fleet — Email configurado correctamente',
            `<div style="font-family:Arial,sans-serif">
             <h2 style="color:#10b981;">✅ Configuración de email correcta</h2>
             <p>Este es un correo de prueba del sistema <strong>Azkell Fleet</strong>.</p>
             <p>Las alertas de mantenimiento llegarán a esta bandeja.</p>
             <p style="color:#64748b; font-size:12px;">— Sistema Azkell Fleet</p>
             </div>`
        );
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// CRUD CONFIGURACION FLOTA (ya tiene GET y PUT, falta DELETE y POST)
// ============================================================
app.post('/api/configuracion-flota', (req, res) => {
    const { marca, uts_categoria, km_mensuales, dias_operativos,
            mp1_intervalo_km, mp2_intervalo_km, mp3_intervalo_km, observaciones } = req.body;
    if (!marca || !uts_categoria) return res.status(400).json({ error: 'Marca y UTS son requeridos' });
    db.query(
        `INSERT INTO configuracion_flota
         (marca, uts_categoria, km_mensuales, dias_operativos, mp1_intervalo_km, mp2_intervalo_km, mp3_intervalo_km, observaciones)
         VALUES (?,?,?,?,?,?,?,?)`,
        [marca.toUpperCase(), uts_categoria.toUpperCase(),
         km_mensuales || 0, dias_operativos || 26,
         mp1_intervalo_km || 5000, mp2_intervalo_km || 10000, mp3_intervalo_km || 20000,
         observaciones || null],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.delete('/api/configuracion-flota/:id', (req, res) => {
    db.query('DELETE FROM configuracion_flota WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// ============================================================
// CRUD MANTENIMIENTO KITS (ya tiene GET, falta POST/PUT/DELETE)
// ============================================================
app.post('/api/mantenimiento-kits', (req, res) => {
    const { marca_vehiculo, tipo_mp, nombre_kit, item_codigo, item_nombre,
            cantidad, unidad_medida, costo_unitario, costo_total, orden } = req.body;
    if (!marca_vehiculo || !tipo_mp || !item_nombre)
        return res.status(400).json({ error: 'Marca, tipo_mp e item_nombre son requeridos' });
    db.query(
        `INSERT INTO mantenimiento_kits
         (marca_vehiculo, tipo_mp, nombre_kit, item_codigo, item_nombre,
          cantidad, unidad_medida, costo_unitario, costo_total, orden)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [marca_vehiculo.toUpperCase(), tipo_mp, nombre_kit || null,
         item_codigo || null, item_nombre,
         cantidad || 1, unidad_medida || 'UND',
         costo_unitario || 0, costo_total || 0, orden || 1],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.put('/api/mantenimiento-kits/:id', (req, res) => {
    const { id } = req.params;
    const { nombre_kit, item_codigo, item_nombre, cantidad,
            unidad_medida, costo_unitario, costo_total, orden, activo } = req.body;
    db.query(
        `UPDATE mantenimiento_kits
         SET nombre_kit=?, item_codigo=?, item_nombre=?, cantidad=?,
             unidad_medida=?, costo_unitario=?, costo_total=?, orden=?, activo=?
         WHERE id=?`,
        [nombre_kit || null, item_codigo || null, item_nombre,
         cantidad || 1, unidad_medida || 'UND',
         costo_unitario || 0, costo_total || 0, orden || 1,
         activo !== undefined ? (activo ? 1 : 0) : 1, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.delete('/api/mantenimiento-kits/:id', (req, res) => {
    db.query('DELETE FROM mantenimiento_kits WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// POST /api/mantenimiento-kits/importarMasivo
app.post('/api/mantenimiento-kits/importarMasivo', (req, res) => {
    const items = req.body.items;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Sin datos' });
    let insertados = 0, errores = 0;
    const done = () => { if (insertados + errores === items.length) res.json({ insertados, errores }); };
    items.forEach(function(k) {
        const costo_total = (parseFloat(k.cantidad)||0) * (parseFloat(k.costo_unitario)||0);
        db.query(
            `INSERT INTO mantenimiento_kits (marca_vehiculo, tipo_mp, nombre_kit, item_nombre, cantidad, unidad_medida, costo_unitario, costo_total)
             VALUES (?,?,?,?,?,?,?,?)`,
            [k.marca_vehiculo||'', k.tipo_mp||'', k.nombre_kit||'', k.item_nombre||'',
             parseFloat(k.cantidad)||0, k.unidad_medida||'', parseFloat(k.costo_unitario)||0, costo_total],
            (err) => { if (err) errores++; else insertados++; done(); }
        );
    });
});


// ============================================================
app.put('/api/requerimientos-planificacion/:id', (req, res) => {
    const { id } = req.params;
    const { estado_req, fecha_solicitud, fecha_entrega, responsable_almacen, observaciones } = req.body;
    db.query(
        `UPDATE requerimientos_planificacion
         SET estado_req=?, fecha_solicitud=?, fecha_entrega=?,
             responsable_almacen=?, observaciones=?
         WHERE id=?`,
        [estado_req || 'Pendiente', fecha_solicitud || null, fecha_entrega || null,
         responsable_almacen || null, observaciones || null, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.delete('/api/requerimientos-planificacion/:id', (req, res) => {
    db.query('DELETE FROM requerimientos_planificacion WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

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

// ── Helper: sumar total_pen de detalle (convierte USD con tipo_cambio) ───
function _calcularTotalPen(detalles, tc) {
    return detalles.reduce((acc, d) => {
        const imp = parseFloat(d.importe) || 0;
        return acc + (d.moneda === 'USD' ? imp * parseFloat(tc || 1) : imp);
    }, 0);
}

// ============================================================
// ALMACÉN — Configuración
// ============================================================
app.get('/api/almacen/configuracion', (req, res) => {
    db.query('SELECT clave, valor FROM configuracion_almacen', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const obj = {};
        rows.forEach(r => { obj[r.clave] = r.valor; });
        res.json(obj);
    });
});
app.put('/api/almacen/configuracion', (req, res) => {
    const entries = Object.entries(req.body);
    if (!entries.length) return res.json({ ok: true });
    const vals = entries.map(([k, v]) => [k, String(v)]);
    db.query('INSERT INTO configuracion_almacen (clave,valor) VALUES ? ON DUPLICATE KEY UPDATE valor=VALUES(valor)',
        [vals], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
});

// ============================================================
// ALMACÉN — Proveedores
// ============================================================
app.get('/api/almacen/proveedores', (req, res) => {
    db.query('SELECT p.id, p.nombre, p.razon_social, p.tipo_documento, p.numero_documento, p.telefono, p.email, p.direccion, p.estado, p.observaciones, p.created_at, p.updated_at, GROUP_CONCAT(m.marca ORDER BY m.marca SEPARATOR \', \') AS marcas FROM proveedores_inv p LEFT JOIN proveedor_marcas_inv m ON m.proveedor_id=p.id GROUP BY p.id, p.nombre, p.razon_social, p.tipo_documento, p.numero_documento, p.telefono, p.email, p.direccion, p.estado, p.observaciones, p.created_at, p.updated_at ORDER BY p.nombre', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
app.post('/api/almacen/proveedores', (req, res) => {
    const { nombre, razon_social, tipo_documento, numero_documento, telefono, email, direccion, estado, observaciones, marcas } = req.body;
    const anio = new Date().getFullYear();
    _generarCodigoAlmacen('PROV', null, (err, id) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('INSERT INTO proveedores_inv (id,nombre,razon_social,tipo_documento,numero_documento,telefono,email,direccion,estado,observaciones) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [id, nombre, razon_social||null, tipo_documento||'RUC', numero_documento||null, telefono||null, email||null, direccion||null, estado||'Activo', observaciones||null],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if (marcas && marcas.length) {
                    const mVals = marcas.map(m => [id, m]);
                    db.query('INSERT INTO proveedor_marcas_inv (proveedor_id,marca) VALUES ?', [mVals], () => {});
                }
                res.json({ ok: true, id });
            });
    });
});
app.put('/api/almacen/proveedores/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, razon_social, tipo_documento, numero_documento, telefono, email, direccion, estado, observaciones, marcas } = req.body;
    db.query('UPDATE proveedores_inv SET nombre=?,razon_social=?,tipo_documento=?,numero_documento=?,telefono=?,email=?,direccion=?,estado=?,observaciones=? WHERE id=?',
        [nombre, razon_social||null, tipo_documento||'RUC', numero_documento||null, telefono||null, email||null, direccion||null, estado||'Activo', observaciones||null, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            db.query('DELETE FROM proveedor_marcas_inv WHERE proveedor_id=?', [id], () => {
                if (marcas && marcas.length) {
                    const mVals = marcas.map(m => [id, m]);
                    db.query('INSERT INTO proveedor_marcas_inv (proveedor_id,marca) VALUES ?', [mVals], () => {});
                }
                res.json({ ok: true });
            });
        });
});
app.delete('/api/almacen/proveedores/:id', (req, res) => {
    db.query('DELETE FROM proveedores_inv WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

app.post('/api/almacen/importarProveedoresMasivo', async (req, res) => {
    const lista = req.body.proveedores || [];
    if (!lista.length) return res.status(400).json({ error: 'Sin datos' });

    // Helper promisificado
    const dbq = (sql, params) => new Promise((resolve, reject) =>
        db.query(sql, params || [], (err, rows) => err ? reject(err) : resolve(rows))
    );

    try {
        // 1. Buscar todos los existentes por nombre en una sola query
        const nombres = lista.filter(p => p.nombre).map(p => p.nombre);
        if (!nombres.length) return res.json({ insertados: 0, actualizados: 0, errores: lista.length });

        const existentes = await dbq('SELECT id, nombre FROM proveedores_inv WHERE nombre IN (?)', [nombres]);
        const existMap = {};
        existentes.forEach(r => { existMap[r.nombre] = r.id; });

        // 2. Separar nuevos vs a actualizar
        const nuevos    = lista.filter(p => p.nombre && !existMap[p.nombre]);
        const actualizar = lista.filter(p => p.nombre && existMap[p.nombre]);

        // 3. Obtener próximo número de secuencia una sola vez
        let startNum = 1;
        if (nuevos.length) {
            const maxRow = await dbq("SELECT MAX(id) AS max_id FROM proveedores_inv WHERE id LIKE 'PROV-%'");
            if (maxRow[0] && maxRow[0].max_id) {
                const parts = maxRow[0].max_id.split('-');
                const last = parseInt(parts[parts.length - 1], 10);
                if (!isNaN(last)) startNum = last + 1;
            }
        }

        const mkMarcas = p => p.marcas
            ? (typeof p.marcas === 'string' ? p.marcas.split(',').map(m => m.trim()).filter(Boolean) : (p.marcas || []))
            : [];

        let insertados = 0, actualizados = 0, errores = 0;

        // 4. INSERT nuevos en paralelo (IDs pre-asignados, sin race condition)
        await Promise.all(nuevos.map((p, i) => {
            const id = 'PROV-' + String(startNum + i).padStart(4, '0');
            const marcasArr = mkMarcas(p);
            return dbq(
                'INSERT INTO proveedores_inv (id,nombre,razon_social,tipo_documento,numero_documento,telefono,email,direccion,estado,observaciones) VALUES (?,?,?,?,?,?,?,?,?,?)',
                [id, p.nombre, p.razon_social||null, p.tipo_documento||'RUC', p.numero_documento||null,
                 p.telefono||null, p.email||null, p.direccion||null, p.estado||'Activo', p.observaciones||null]
            ).then(() => {
                insertados++;
                if (marcasArr.length) return dbq('INSERT INTO proveedor_marcas_inv (proveedor_id,marca) VALUES ?', [marcasArr.map(m => [id, m])]);
            }).catch(() => { errores++; });
        }));

        // 5. UPDATE existentes en paralelo + refresh marcas
        await Promise.all(actualizar.map(p => {
            const id = existMap[p.nombre];
            const marcasArr = mkMarcas(p);
            return dbq(
                'UPDATE proveedores_inv SET razon_social=?,tipo_documento=?,numero_documento=?,telefono=?,email=?,direccion=?,estado=?,observaciones=? WHERE id=?',
                [p.razon_social||null, p.tipo_documento||'RUC', p.numero_documento||null,
                 p.telefono||null, p.email||null, p.direccion||null, p.estado||'Activo', p.observaciones||null, id]
            ).then(() => {
                actualizados++;
                return dbq('DELETE FROM proveedor_marcas_inv WHERE proveedor_id=?', [id]).then(() => {
                    if (marcasArr.length) return dbq('INSERT INTO proveedor_marcas_inv (proveedor_id,marca) VALUES ?', [marcasArr.map(m => [id, m])]);
                });
            }).catch(() => { errores++; });
        }));

        res.json({ insertados, actualizados, errores });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/almacen/proveedores/bulk-delete', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Sin IDs' });
    const placeholders = ids.map(() => '?').join(',');
    db.query('DELETE FROM proveedores_inv WHERE id IN (' + placeholders + ')', ids, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true, eliminados: result.affectedRows });
    });
});

// ============================================================
// ALMACÉN — Inventario (Catálogo)
// ============================================================
const _stockSQL = `
  SELECT i.*,
    ROUND(
      COALESCE(i.stock_regularizado,0)
      + COALESCE((SELECT SUM(d.cantidad) FROM detalle_entradas_inv d
                  JOIN entradas_inv e ON e.id=d.entrada_id
                  WHERE d.inventario_id=i.id
                    AND (i.fecha_regularizacion IS NULL OR DATE(e.created_at) >= DATE(i.fecha_regularizacion))),0)
      - COALESCE((SELECT SUM(d.cantidad) FROM detalle_salidas_inv d
                  JOIN salidas_inv s ON s.id=d.salida_id
                  WHERE (d.inventario_id=i.id OR (d.inventario_id IS NULL AND LEFT(d.descripcion, CHAR_LENGTH(i.id)) = i.id))
                    AND s.estado = 'Despachado'
                    AND (i.fecha_regularizacion IS NULL OR DATE(s.created_at) >= DATE(i.fecha_regularizacion))),0)
    , 4) AS stock_actual
  FROM inventario i
  WHERE i.activo=1
  ORDER BY i.id`;

app.get('/api/notificaciones/resumen', (req, res) => {
    const qInspVencidas = `
        SELECT COUNT(*) AS cnt FROM inspecciones
        WHERE estado IS NULL OR estado != 'Eliminada'
        AND fecha_ingreso IS NOT NULL
        AND DATE_ADD(
            CASE
                WHEN fecha_ingreso REGEXP '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
                    THEN STR_TO_DATE(fecha_ingreso, '%d/%m/%Y')
                WHEN fecha_ingreso REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                    THEN DATE(fecha_ingreso)
                ELSE NULL
            END,
            INTERVAL COALESCE(dias_propuestos, 30) DAY
        ) < CURDATE()
    `;
    const qFleetrunVenc = `
        SELECT COUNT(*) AS cnt FROM (
            SELECT f.placa, f.tipo_mp
            FROM fleetrun f
            INNER JOIN (
                SELECT placa, tipo_mp, MAX(fecha) AS max_fecha
                FROM fleetrun GROUP BY placa, tipo_mp
            ) lf ON f.placa = lf.placa AND f.tipo_mp = lf.tipo_mp AND f.fecha = lf.max_fecha
            WHERE f.km_proximo > 0 AND f.km_actual >= f.km_proximo
            GROUP BY f.placa, f.tipo_mp
        ) t
    `;
    const qStockCrit = `
        SELECT COUNT(*) AS cnt FROM inventario
        WHERE activo = 1 AND stock_min > 0
        AND stock_actual <= stock_min
    `;
    const runQ = (sql) => new Promise((resolve) => {
        db.query(sql, (err, rows) => {
            resolve(err ? 0 : (rows[0] && rows[0].cnt != null ? parseInt(rows[0].cnt) : 0));
        });
    });
    Promise.all([runQ(qInspVencidas), runQ(qFleetrunVenc), runQ(qStockCrit)])
        .then(([inspVenc, fleetVenc, stockCrit]) => {
            res.json([
                { id: 'insp-vencidas',  tipo: 'danger',  icono: 'bi-shield-x',             titulo: 'Inspecciones Vencidas',  count: inspVenc,  modulo: 'mantenimiento/inspecciones' },
                { id: 'fleet-vencidos', tipo: 'warning', icono: 'bi-speedometer2',          titulo: 'MP Fleetrun Vencidos',   count: fleetVenc, modulo: 'mantenimiento/fleetrun'      },
                { id: 'stock-critico',  tipo: 'info',    icono: 'bi-exclamation-triangle',  titulo: 'Stock Crítico',          count: stockCrit, modulo: 'almacen/inventario'          }
            ]);
        });
});

app.get('/api/almacen/inventario', (req, res) => {
    db.query(_stockSQL, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ─── Marcas de placas para multi-select inventario ───────────────
app.get('/api/almacen/marcas-placas', (req, res) => {
    db.query(`SELECT DISTINCT marca FROM placas WHERE marca IS NOT NULL AND marca <> '' ORDER BY marca`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.marca));
    });
});

app.post('/api/almacen/inventario', (req, res) => {
    const { articulo, codigo_articulo, descripcion, familia, almacen, unidad, moneda, costo_referencial,
            tipo_cambio,
            proveedor_id, marca, observaciones,
            codigo_item, marca_unidad, sistema, sub_sistema, tipo, sub_tipo,
            ubicacion, anaquel, stock_min, stock_max, estado_art, codigo_barras } = req.body;

    const costoRef   = parseFloat(costo_referencial) || 0;
    const tc         = parseFloat(tipo_cambio) || null;
    const monedaVal  = moneda || 'PEN';
    const costoSoles = (monedaVal === 'USD' && tc) ? costoRef * tc : costoRef;

    // Generar descripcion concatenada desde los campos individuales
    let marcasArr = [];
    try { marcasArr = JSON.parse(marca_unidad || '[]'); } catch(e) { marcasArr = marca_unidad ? [marca_unidad] : []; }
    let descGenerada = (articulo || '').trim();
    if (codigo_articulo) descGenerada += ' ' + String(codigo_articulo).trim();
    if (marcasArr.length) descGenerada += ' - ' + marcasArr.join(', ');
    if (marca) descGenerada += ' / ' + String(marca).trim();
    const descFinal = descGenerada || descripcion || 'Sin nombre';

    _generarCodigoAlmacen('INV', null, (err, id) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query(`INSERT INTO inventario
            (id,descripcion,articulo,codigo_articulo,familia,almacen,unidad,moneda,costo_referencial,costo_soles,tipo_cambio,
             proveedor_id,marca,observaciones,
             codigo_item,marca_unidad,sistema,sub_sistema,tipo,sub_tipo,
             ubicacion,anaquel,stock_min,stock_max,estado_art,codigo_barras)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [id, descFinal, articulo||null, codigo_articulo||null, familia||null, almacen||null, unidad||null, monedaVal,
             costoRef, costoSoles, tc,
             proveedor_id||null, marca||null, observaciones||null,
             codigo_item||null, marca_unidad||null, sistema||null, sub_sistema||null,
             tipo||null, sub_tipo||null, ubicacion||null,
             anaquel!=null?parseFloat(anaquel):null, parseFloat(stock_min)||0, parseFloat(stock_max)||0,
             estado_art||'Activo', codigo_barras||null],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({ ok: true, id });
            });
    });
});
app.put('/api/almacen/inventario/:id', (req, res) => {
    const { articulo, codigo_articulo, descripcion, familia, almacen, unidad, moneda, costo_referencial,
            tipo_cambio,
            proveedor_id, marca, observaciones, activo,
            codigo_item, marca_unidad, sistema, sub_sistema, tipo, sub_tipo,
            ubicacion, anaquel, stock_min, stock_max, estado_art, codigo_barras } = req.body;

    const costoRef   = parseFloat(costo_referencial) || 0;
    const tc         = parseFloat(tipo_cambio) || null;
    const monedaVal  = moneda || 'PEN';
    const costoSoles = (monedaVal === 'USD' && tc) ? costoRef * tc : costoRef;

    let marcasArr = [];
    try { marcasArr = JSON.parse(marca_unidad || '[]'); } catch(e) { marcasArr = marca_unidad ? [marca_unidad] : []; }
    let descGenerada = (articulo || '').trim();
    if (codigo_articulo) descGenerada += ' ' + String(codigo_articulo).trim();
    if (marcasArr.length) descGenerada += ' - ' + marcasArr.join(', ');
    if (marca) descGenerada += ' / ' + String(marca).trim();
    const descFinal = descGenerada || descripcion || 'Sin nombre';

    db.query(`UPDATE inventario SET
        descripcion=?,articulo=?,codigo_articulo=?,familia=?,almacen=?,unidad=?,moneda=?,costo_referencial=?,costo_soles=?,tipo_cambio=?,
        proveedor_id=?,marca=?,observaciones=?,activo=?,
        codigo_item=?,marca_unidad=?,sistema=?,sub_sistema=?,tipo=?,sub_tipo=?,ubicacion=?,
        anaquel=?,stock_min=?,stock_max=?,estado_art=?,codigo_barras=?
        WHERE id=?`,
        [descFinal, articulo||null, codigo_articulo||null, familia||null, almacen||null, unidad||null, monedaVal,
         costoRef, costoSoles, tc,
         proveedor_id||null, marca||null, observaciones||null,
         activo != null ? activo : 1,
         codigo_item||null, marca_unidad||null, sistema||null, sub_sistema||null,
         tipo||null, sub_tipo||null, ubicacion||null,
         anaquel!=null?parseFloat(anaquel):null, parseFloat(stock_min)||0, parseFloat(stock_max)||0,
         estado_art||'Activo', codigo_barras||null, req.params.id],
        (err) => {
            if (err) { console.error('[PUT inventario]', err.message); return res.status(500).json({ error: err.message }); }
            res.json({ ok: true });
        });
});
app.delete('/api/almacen/inventario/:id', (req, res) => {
    db.query('UPDATE inventario SET activo=0 WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

app.post('/api/almacen/inventario/bulk-delete', (req, res) => {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'Sin IDs' });
    const placeholders = ids.map(() => '?').join(',');
    db.query(`UPDATE inventario SET activo=0 WHERE id IN (${placeholders})`, ids, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true, eliminados: ids.length });
    });
});

// Upload imagen de artículo → Cloudinary
app.post('/api/almacen/inventario/:id/imagen', _multerInv.single('imagen'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
    const publicId = 'inventario/' + req.params.id;
    // Eliminar imagen anterior si existía (ignorar error)
    cloudinary.uploader.destroy(publicId, { invalidate: true }, () => {});
    // Subir desde buffer en memoria
    const uploadStream = cloudinary.uploader.upload_stream(
        { public_id: publicId, overwrite: true, invalidate: true },
        (error, result) => {
            if (error) return res.status(500).json({ error: error.message });
            const url = result.secure_url;
            db.query('UPDATE inventario SET imagen_url=? WHERE id=?', [url, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true, imagen_url: url });
            });
        }
    );
    uploadStream.end(req.file.buffer);
});

// Eliminar imagen de artículo → Cloudinary
app.delete('/api/almacen/inventario/:id/imagen', (req, res) => {
    const publicId = 'inventario/' + req.params.id;
    cloudinary.uploader.destroy(publicId, { invalidate: true }, (error) => {
        if (error) console.error('Cloudinary destroy error:', error.message);
        db.query('UPDATE inventario SET imagen_url=NULL WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
    });
});

// Regularizar stock físico (autocontrol)
app.post('/api/almacen/inventario/:id/regularizar', (req, res) => {
    const { stock_fisico, motivo, usuario } = req.body;
    const id = req.params.id;
    if (stock_fisico == null || isNaN(parseFloat(stock_fisico))) {
        return res.status(400).json({ error: 'stock_fisico requerido' });
    }
    const stockVal = parseFloat(stock_fisico);
    const fechaHoy = new Date().toISOString().split('T')[0];

    // Obtener stock virtual actual para registrar en observaciones
    db.query(`SELECT
        COALESCE(i.stock_regularizado,0)
        + COALESCE((SELECT SUM(d.cantidad) FROM detalle_entradas_inv d
                    JOIN entradas_inv e ON e.id=d.entrada_id
                    WHERE d.inventario_id=i.id
                    AND (i.fecha_regularizacion IS NULL OR DATE(e.created_at) >= DATE(i.fecha_regularizacion))),0)
        - COALESCE((SELECT SUM(d.cantidad) FROM detalle_salidas_inv d
                    JOIN salidas_inv s ON s.id=d.salida_id
                    WHERE d.inventario_id=i.id
                    AND (i.fecha_regularizacion IS NULL OR DATE(s.created_at) >= DATE(i.fecha_regularizacion))),0)
        AS stock_virtual,
        i.stock_regularizado AS stock_ant,
        i.fecha_regularizacion AS fecha_reg_ant
        FROM inventario i WHERE i.id=?`, [id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const stockVirtual = parseFloat(rows[0]?.stock_virtual || 0);
        const stockAnt     = parseFloat(rows[0]?.stock_ant || 0);

        const obsAudit = `Regularización: virtual=${stockVirtual.toFixed(2)} → físico=${stockVal.toFixed(2)}` +
                         (motivo ? ` | Motivo: ${motivo}` : '') +
                         ` | Usuario: ${usuario || 'sistema'} | Fecha: ${fechaHoy}`;

        db.query(`UPDATE inventario SET stock_regularizado=?, fecha_regularizacion=? WHERE id=?`,
            [stockVal, fechaHoy, id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            // Registrar en observaciones de auditoría (append)
            db.query(`UPDATE inventario SET observaciones = CONCAT(COALESCE(observaciones,''), ?)
                      WHERE id=?`,
                ['\n[REG ' + fechaHoy + '] ' + obsAudit, id], () => {});
            res.json({ ok: true, fecha_regularizacion: fechaHoy, stock_anterior: stockAnt, stock_nuevo: stockVal });
        });
    });
});

// Import masivo desde Excel
app.post('/api/almacen/inventario/importar', async (req, res) => {
    const { filas } = req.body;
    if (!filas || !filas.length) return res.json({ ok: true, insertados: 0 });
    let insertados = 0;
    const errors = [];
    for (let i = 0; i < filas.length; i++) {
        const f = filas[i];
        if (!f.articulo) { errors.push(`Fila ${i+2}: falta el campo 'articulo'`); continue; }
        try {
            // Generar descripcion concatenada igual que el POST individual
            let marcasArr = [];
            try { marcasArr = JSON.parse(f.marca_unidad || '[]'); } catch(e) {
                marcasArr = f.marca_unidad ? String(f.marca_unidad).split(',').map(s=>s.trim()).filter(Boolean) : [];
            }
            let descGenerada = String(f.articulo).trim();
            if (f.codigo_articulo) descGenerada += ' ' + String(f.codigo_articulo).trim();
            if (marcasArr.length)  descGenerada += ' - ' + marcasArr.join(', ');
            if (f.marca)           descGenerada += ' / ' + String(f.marca).trim();
            const marcaUnidadJson = marcasArr.length ? JSON.stringify(marcasArr) : null;

            await new Promise((resolve, reject) => {
                _generarCodigoAlmacen('INV', null, (err, id) => {
                    if (err) return reject(err);
                    const cantInicial = parseFloat(f.cantidad_inicial) || 0;
                    const stockReg    = cantInicial > 0 ? cantInicial : 0;
                    const fechaReg    = cantInicial > 0 ? new Date().toISOString().split('T')[0] : null;
                    db.query(`INSERT INTO inventario
                        (id,descripcion,articulo,codigo_articulo,familia,almacen,unidad,moneda,costo_referencial,
                         marca,observaciones,marca_unidad,sistema,sub_sistema,tipo,sub_tipo,
                         ubicacion,anaquel,stock_min,stock_max,estado_art,codigo_barras,
                         stock_regularizado,fecha_regularizacion)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                        [id, descGenerada||'Sin nombre',
                         f.articulo||null, f.codigo_articulo||null, f.familia||null, f.almacen||null, f.unidad||null,
                         f.moneda||'PEN', parseFloat(f.costo_referencial)||0,
                         f.marca||null, f.observaciones||null,
                         marcaUnidadJson, f.sistema||null, f.sub_sistema||null,
                         f.tipo||null, f.sub_tipo||null, f.ubicacion||null,
                         f.anaquel!=null?parseFloat(f.anaquel):null,
                         parseFloat(f.stock_min)||0, parseFloat(f.stock_max)||0,
                         f.estado_art||'Activo', f.codigo_barras||null,
                         stockReg, fechaReg],
                        (err2) => { if (err2) return reject(err2); insertados++; resolve(); });
                });
            });
        } catch(e) { errors.push(`Fila ${i+2}: ${e.message}`); }
    }
    res.json({ ok: true, insertados, errores: errors });
});

// ── Clientes de placas (para Empresa en conductores) ──────────────────────
app.get('/api/almacen/clientes-placas', (req, res) => {
    db.query(`SELECT DISTINCT cliente FROM placas WHERE cliente IS NOT NULL AND cliente <> '' ORDER BY cliente`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.cliente));
    });
});

// ============================================================
// ALMACÉN — Unidades de Medida
// ============================================================
app.get('/api/almacen/unidades', (req, res) => {
    db.query(`SELECT * FROM almacen_unidades ORDER BY orden, nombre`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/almacen/unidades', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    db.query('INSERT INTO almacen_unidades (nombre, descripcion, activo) VALUES (?,?,?)',
        [nombre.toUpperCase().trim(), descripcion || null, activo != null ? activo : 1],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, id: result.insertId });
        });
});

app.put('/api/almacen/unidades/:id', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    db.query('UPDATE almacen_unidades SET nombre=?, descripcion=?, activo=? WHERE id=?',
        [nombre.toUpperCase().trim(), descripcion || null, activo != null ? activo : 1, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
});

app.delete('/api/almacen/unidades/:id', (req, res) => {
    db.query('DELETE FROM almacen_unidades WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// ============================================================
// ALMACÉN — Sistemas y Sub-Sistemas
// ============================================================
app.get('/api/almacen/sistemas', (req, res) => {
    db.query(`SELECT * FROM almacen_sistemas ORDER BY orden, nombre`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Parse sub_sistemas JSON
        rows.forEach(r => {
            try { r.sub_sistemas = r.sub_sistemas ? JSON.parse(r.sub_sistemas) : []; }
            catch(e) { r.sub_sistemas = []; }
        });
        res.json(rows);
    });
});

app.post('/api/almacen/sistemas', (req, res) => {
    const { nombre, sub_sistemas, activo, orden } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    db.query('INSERT INTO almacen_sistemas (nombre, sub_sistemas, activo, orden) VALUES (?,?,?,?)',
        [nombre.toUpperCase().trim(), JSON.stringify(sub_sistemas || []), activo != null ? activo : 1, orden || 0],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, id: result.insertId });
        });
});

app.put('/api/almacen/sistemas/:id', (req, res) => {
    const { nombre, sub_sistemas, activo, orden } = req.body;
    db.query('UPDATE almacen_sistemas SET nombre=?, sub_sistemas=?, activo=?, orden=? WHERE id=?',
        [nombre.toUpperCase().trim(), JSON.stringify(sub_sistemas || []), activo != null ? activo : 1, orden || 0, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
});

app.delete('/api/almacen/sistemas/:id', (req, res) => {
    db.query('DELETE FROM almacen_sistemas WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// ============================================================
// ALMACÉN — Familias
// ============================================================
app.get('/api/almacen/familias', (req, res) => {
    db.query(`SELECT * FROM almacen_familias ORDER BY orden, nombre`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/almacen/familias', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    db.query('INSERT INTO almacen_familias (nombre, descripcion, activo) VALUES (?,?,?)',
        [nombre.toUpperCase().trim(), descripcion || null, activo != null ? activo : 1],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, id: result.insertId });
        });
});

app.put('/api/almacen/familias/:id', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    db.query('UPDATE almacen_familias SET nombre=?, descripcion=?, activo=? WHERE id=?',
        [nombre.toUpperCase().trim(), descripcion || null, activo != null ? activo : 1, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
});

app.delete('/api/almacen/familias/:id', (req, res) => {
    db.query('DELETE FROM almacen_familias WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// ============================================================
// ALMACÉN — Marcas de Fabricante
// ============================================================
app.get('/api/almacen/marcas', (req, res) => {
    db.query(`SELECT * FROM almacen_marcas ORDER BY orden, nombre`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
app.post('/api/almacen/marcas', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    db.query('INSERT INTO almacen_marcas (nombre, descripcion, activo) VALUES (?,?,?)',
        [nombre.toUpperCase(), descripcion || null, activo ?? 1], (err, r) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true, id: r.insertId });
    });
});
app.put('/api/almacen/marcas/:id', (req, res) => {
    const { nombre, descripcion, activo } = req.body;
    db.query('UPDATE almacen_marcas SET nombre=?, descripcion=?, activo=? WHERE id=?',
        [nombre.toUpperCase(), descripcion || null, activo ?? 1, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});
app.delete('/api/almacen/marcas/:id', (req, res) => {
    db.query('DELETE FROM almacen_marcas WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// ============================================================
// ALMACÉN — Entradas
// ============================================================
app.get('/api/almacen/entradas', (req, res) => {
    db.query(`SELECT e.*, GROUP_CONCAT(CONCAT(d.descripcion,'|',d.cantidad,'|',d.costo_unitario,'|',d.moneda,'|',d.inventario_id) SEPARATOR ';;') AS items_raw
              FROM entradas_inv e
              LEFT JOIN detalle_entradas_inv d ON d.entrada_id=e.id
              GROUP BY e.id ORDER BY e.fecha DESC, e.id DESC LIMIT 300`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(r => {
            r.items = r.items_raw ? r.items_raw.split(';;').map(s => {
                const [desc, cant, cu, mon, invId] = s.split('|');
                return { descripcion: desc, cantidad: parseFloat(cant), costo_unitario: parseFloat(cu), moneda: mon, inventario_id: invId };
            }) : [];
            delete r.items_raw;
        });
        res.json(rows);
    });
});
app.post('/api/almacen/entradas', (req, res) => {
    const { fecha, proveedor_id, proveedor_nombre, documento_referencia, moneda, tipo_cambio, tipo_igv, observaciones, creado_por, items } = req.body;
    const anio = new Date(fecha || Date.now()).getFullYear();
    const tc = parseFloat(tipo_cambio) || 1;
    _generarCodigoAlmacen('ENT', anio, (err, id) => {
        if (err) return res.status(500).json({ error: err.message });
        const total_pen = _calcularTotalPen(items || [], tc);
        db.query('INSERT INTO entradas_inv (id,fecha,proveedor_id,proveedor_nombre,documento_referencia,moneda,tipo_cambio,total_pen,observaciones,tipo_igv,creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            [id, fecha||new Date().toISOString().split('T')[0], proveedor_id||null, proveedor_nombre||null,
             documento_referencia||null, moneda||'PEN', tc||null, total_pen, observaciones||null, tipo_igv||'sin_igv', creado_por||null],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if (!items || !items.length) return res.json({ ok: true, id });
                // Resolver inventario_id por descripción para items sin código
                const descsEntrada = items.filter(d => !d.inventario_id && d.descripcion).map(d => d.descripcion);
                const resolverEntrada = (cb) => {
                    if (!descsEntrada.length) return cb({});
                    db.query('SELECT id, descripcion FROM inventario WHERE descripcion IN (?) AND activo = 1', [descsEntrada], (e, rows) => {
                        const mapa = {};
                        if (!e && rows) rows.forEach(r => { mapa[r.descripcion] = r.id; });
                        cb(mapa);
                    });
                };
                resolverEntrada((mapaInvEnt) => {
                    const dVals = items.map(d => {
                        const invId = d.inventario_id || mapaInvEnt[d.descripcion] || null;
                        return [id, invId, d.descripcion||null,
                            parseFloat(d.cantidad)||0, parseFloat(d.costo_unitario)||0, d.moneda||moneda||'PEN',
                            parseFloat(d.importe)||((parseFloat(d.cantidad)||0)*(parseFloat(d.costo_unitario)||0))];
                    });
                    db.query('INSERT INTO detalle_entradas_inv (entrada_id,inventario_id,descripcion,cantidad,costo_unitario,moneda,importe) VALUES ?', [dVals], () => {
                        // Actualizar costo_referencial en PEN para cada ítem con inventario_id conocido
                        const toUpdate = items.filter(d =>
                            (d.inventario_id || mapaInvEnt[d.descripcion]) && parseFloat(d.costo_unitario) > 0
                        );
                        if (!toUpdate.length) return res.json({ ok: true, id });
                        let done = 0;
                        toUpdate.forEach(d => {
                            const invId      = d.inventario_id || mapaInvEnt[d.descripcion];
                            const isUSD      = d.moneda === 'USD' || moneda === 'USD';
                            const costoOrig  = parseFloat(d.costo_unitario);
                            const costoSoles = isUSD ? costoOrig * tc : costoOrig;
                            db.query(
                                'UPDATE inventario SET costo_referencial=?, costo_soles=?, tipo_cambio=? WHERE id=? AND activo=1',
                                [costoOrig, costoSoles, isUSD ? tc : null, invId],
                                () => { if (++done === toUpdate.length) res.json({ ok: true, id }); }
                            );
                        });
                    });
                });
            });
    });
});
app.delete('/api/almacen/entradas/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM detalle_entradas_inv WHERE entrada_id=?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('DELETE FROM entradas_inv WHERE id=?', [id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ ok: true });
        });
    });
});

// ============================================================
// ALMACÉN — Salidas
// ============================================================
app.get('/api/almacen/salidas', (req, res) => {
    const SEP_FIELD = '\x1F', SEP_ROW = '\x1E';
    db.query(`SELECT s.*,
              GROUP_CONCAT(CONCAT_WS('\x1F',
                COALESCE(d.inventario_id,''),
                COALESCE(d.descripcion,''),
                COALESCE(d.cantidad,0),
                COALESCE(d.costo_unitario,0),
                COALESCE(d.moneda,'PEN'),
                COALESCE(d.importe, d.cantidad*d.costo_unitario, 0)
              ) SEPARATOR '\x1E') AS items_raw
              FROM salidas_inv s
              LEFT JOIN detalle_salidas_inv d ON d.salida_id=s.id
              GROUP BY s.id ORDER BY s.fecha DESC, s.id DESC LIMIT 300`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(r => {
            r.items = r.items_raw ? r.items_raw.split(SEP_ROW).map(seg => {
                const [invId, desc, cant, cu, mon, imp] = seg.split(SEP_FIELD);
                return { inventario_id: invId||null, descripcion: desc||null, cantidad: parseFloat(cant)||0, costo_unitario: parseFloat(cu)||0, moneda: mon||'PEN', importe: parseFloat(imp)||0 };
            }).filter(it => it.descripcion || it.inventario_id) : [];
            delete r.items_raw;
        });
        res.json(rows);
    });
});
app.post('/api/almacen/salidas', (req, res) => {
    const { fecha, tipo_destino, placa, responsable, responsable_id, moneda, tipo_cambio, observaciones, creado_por, items, ticket_ot } = req.body;

    // Validar estado de la OT antes de permitir salida
    if (ticket_ot) {
        db.query('SELECT estado FROM ordenes_trabajo WHERE id_ot = ?', [ticket_ot], (errOT, rowsOT) => {
            if (errOT) return res.status(500).json({ error: errOT.message });
            if (!rowsOT.length) return res.status(400).json({ error: 'La OT ' + ticket_ot + ' no existe' });
            const estadoOT = rowsOT[0].estado;
            if (estadoOT !== 'En Proceso' && estadoOT !== 'Pausada') {
                const msg = estadoOT === 'Finalizado'
                    ? 'La OT ' + ticket_ot + ' ya está cerrada. No se pueden registrar salidas.'
                    : 'La OT ' + ticket_ot + ' no ha sido iniciada. Debes iniciar la OT antes de registrar salidas.';
                return res.status(400).json({ error: msg });
            }
            crearSalida();
        });
    } else {
        crearSalida();
    }

    function crearSalida() {
    const anio = new Date(fecha || Date.now()).getFullYear();
    const tc = parseFloat(tipo_cambio) || 1;
    _generarCodigoAlmacen('SAL', anio, (err, id) => {
        if (err) return res.status(500).json({ error: err.message });
        const total_pen = _calcularTotalPen(items || [], tc);
        db.query('INSERT INTO salidas_inv (id,fecha,tipo_destino,placa,responsable,responsable_id,moneda,tipo_cambio,total_pen,observaciones,creado_por,ticket_ot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [id, fecha||new Date().toISOString().split('T')[0], tipo_destino, placa||null, responsable||null,
             responsable_id||null, moneda||'PEN', tc||null, total_pen, observaciones||null, creado_por||null, ticket_ot||null],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if (!items || !items.length) return res.json({ ok: true, id });
                // Resolver inventario_id por descripción para items sin código
                const descsSalida = items.filter(d => !d.inventario_id && d.descripcion).map(d => d.descripcion);
                const resolverSalida = (cb) => {
                    if (!descsSalida.length) return cb({});
                    db.query('SELECT id, descripcion FROM inventario WHERE descripcion IN (?) AND activo = 1', [descsSalida], (e, rows) => {
                        const mapa = {};
                        if (!e && rows) rows.forEach(r => { mapa[r.descripcion] = r.id; });
                        cb(mapa);
                    });
                };
                resolverSalida((mapaInvSal) => {
                    const dVals = items.map(d => {
                        const invId = d.inventario_id || mapaInvSal[d.descripcion] || null;
                        return [id, invId, d.descripcion||null,
                            parseFloat(d.cantidad)||0, parseFloat(d.costo_unitario)||0, d.moneda||moneda||'PEN',
                            parseFloat(d.importe)||((parseFloat(d.cantidad)||0)*(parseFloat(d.costo_unitario)||0))];
                    });
                    db.query('INSERT INTO detalle_salidas_inv (salida_id,inventario_id,descripcion,cantidad,costo_unitario,moneda,importe) VALUES ?', [dVals], () => {});
                    res.json({ ok: true, id });
                });
            });
    });
    } // fin crearSalida
});
app.put('/api/almacen/salidas/:id', (req, res) => {
    const { id } = req.params;
    const { accion, motivo } = req.body;
    if (accion === 'anular') {
        if (!motivo || !String(motivo).trim()) return res.status(400).json({ error: 'Motivo requerido' });
        db.query('UPDATE salidas_inv SET estado=?, motivo_anulacion=? WHERE id=?',
            ['Anulado', String(motivo).trim(), id], (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!result.affectedRows) return res.status(404).json({ error: 'No encontrado' });
                res.json({ ok: true });
            });
    } else if (accion === 'despachar') {
        db.query("UPDATE salidas_inv SET estado='Despachado' WHERE id=?", [id], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!result.affectedRows) return res.status(404).json({ error: 'No encontrado' });
            // Resolver inventario_id nulos: por descripción exacta O prefijo "INV-XXX — ..."
            db.query(
                `UPDATE detalle_salidas_inv d
                 INNER JOIN inventario i ON (i.descripcion = d.descripcion OR LEFT(d.descripcion, CHAR_LENGTH(i.id)) = i.id) AND i.activo = 1
                 SET d.inventario_id = i.id
                 WHERE d.salida_id = ? AND (d.inventario_id IS NULL OR d.inventario_id = '')`,
                [id], () => {}
            );
            res.json({ ok: true });
        });
    } else {
        res.status(400).json({ error: 'Acción no válida' });
    }
});
app.delete('/api/almacen/salidas/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM detalle_salidas_inv WHERE salida_id=?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('DELETE FROM salidas_inv WHERE id=?', [id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ ok: true });
        });
    });
});

// ============================================================
// ALMACÉN — Kardex (movimientos por artículo)
// ============================================================
app.get('/api/almacen/kardex/:inventario_id', (req, res) => {
    const id = req.params.inventario_id;

    db.query('SELECT stock_regularizado, fecha_regularizacion FROM inventario WHERE id=?', [id], (e2, inv) => {
        if (e2) return res.status(500).json({ error: e2.message });
        const base    = parseFloat(inv[0]?.stock_regularizado || 0);
        const regDate = inv[0]?.fecha_regularizacion || null;

        db.query(`
            SELECT 'Entrada' AS tipo, e.fecha, e.created_at, e.id AS doc_id, e.proveedor_nombre AS contraparte, d.cantidad, d.costo_unitario, d.moneda, d.importe
            FROM detalle_entradas_inv d JOIN entradas_inv e ON e.id=d.entrada_id
            WHERE d.inventario_id=?
            UNION ALL
            SELECT 'Salida' AS tipo, s.fecha, s.created_at, s.id AS doc_id, CONCAT(s.tipo_destino,' / ',COALESCE(s.placa,s.responsable,'—')) AS contraparte, d.cantidad, d.costo_unitario, d.moneda, d.importe
            FROM detalle_salidas_inv d JOIN salidas_inv s ON s.id=d.salida_id
            WHERE d.inventario_id=? AND (s.estado IS NULL OR s.estado = 'Despachado')
            ORDER BY fecha ASC, created_at ASC, doc_id ASC
        `, [id, id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            // Saldo inicial = stock_regularizado (base post-regularización)
            let saldo = base;
            rows.forEach(r => {
                if (r.tipo === 'Entrada') saldo += parseFloat(r.cantidad);
                else saldo -= parseFloat(r.cantidad);
                r.saldo = parseFloat(saldo.toFixed(4));
            });
            res.json({ stock_base: base, fecha_regularizacion: regDate, movimientos: rows });
        });
    });
});

// ============================================================
// ALMACÉN — Costos (análisis)
// ============================================================
app.get('/api/almacen/costos', (req, res) => {
    const { desde, hasta } = req.query;
    const conds = [];
    const params = [];
    if (desde) { conds.push('s.fecha >= ?'); params.push(desde); }
    if (hasta)  { conds.push('s.fecha <= ?'); params.push(hasta); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    Promise.all([
        // Por familia
        new Promise((resolve, reject) => {
            db.query(`SELECT COALESCE(i.familia,'Sin familia') AS familia, SUM(d.importe) AS total, COUNT(*) AS movimientos
                      FROM detalle_salidas_inv d
                      JOIN salidas_inv s ON s.id=d.salida_id
                      JOIN inventario i ON i.id=d.inventario_id
                      ${where}
                      GROUP BY COALESCE(i.familia,'Sin familia') ORDER BY total DESC`, params, (e, r) => e ? reject(e) : resolve(r));
        }),
        // Por almacen
        new Promise((resolve, reject) => {
            db.query(`SELECT COALESCE(i.almacen,'Sin almacén') AS almacen, SUM(d.importe) AS total, COUNT(*) AS movimientos
                      FROM detalle_salidas_inv d
                      JOIN salidas_inv s ON s.id=d.salida_id
                      JOIN inventario i ON i.id=d.inventario_id
                      ${where}
                      GROUP BY COALESCE(i.almacen,'Sin almacén') ORDER BY total DESC`, params, (e, r) => e ? reject(e) : resolve(r));
        }),
        // Totales (entradas vs salidas)
        new Promise((resolve, reject) => {
            const p2 = [...params, ...params];
            db.query(`SELECT
                        (SELECT SUM(total_pen) FROM entradas_inv e ${conds.length ? 'WHERE e.fecha >= ? AND e.fecha <= ?' : ''}) AS total_entradas,
                        (SELECT SUM(total_pen) FROM salidas_inv s ${conds.length ? 'WHERE s.fecha >= ? AND s.fecha <= ?' : ''}) AS total_salidas`,
                conds.length ? [desde, hasta, desde, hasta] : [], (e, r) => e ? reject(e) : resolve(r[0]));
        }),
        // Top 10 artículos más consumidos
        new Promise((resolve, reject) => {
            db.query(`SELECT i.id, i.descripcion, i.familia, SUM(d.cantidad) AS cantidad_total, SUM(d.importe) AS costo_total, i.unidad
                      FROM detalle_salidas_inv d
                      JOIN salidas_inv s ON s.id=d.salida_id
                      JOIN inventario i ON i.id=d.inventario_id
                      ${where}
                      GROUP BY i.id ORDER BY costo_total DESC LIMIT 20`, params, (e, r) => e ? reject(e) : resolve(r));
        }),
        // Por cliente (salidas tipo Vehiculo → placa → cliente en tabla placas)
        new Promise((resolve, reject) => {
            db.query(`SELECT COALESCE(p.cliente,'Sin cliente') AS cliente, s.placa, SUM(d.importe) AS total, COUNT(*) AS movimientos
                      FROM detalle_salidas_inv d
                      JOIN salidas_inv s ON s.id=d.salida_id
                      LEFT JOIN placas p ON p.placa=s.placa
                      ${where ? where + " AND s.tipo_destino='Vehiculo'" : "WHERE s.tipo_destino='Vehiculo'"}
                      GROUP BY COALESCE(p.cliente,'Sin cliente'), s.placa ORDER BY total DESC`, params, (e, r) => e ? reject(e) : resolve(r));
        })
    ]).then(([porFamilia, porAlmacen, totales, topItems, porCliente]) => {
        res.json({ porFamilia, porAlmacen, totales, topItems, porCliente });
    }).catch(err => res.status(500).json({ error: err.message }));
});

// ============================================================
// ALMACÉN — Valorizado (stock actual × costo referencial)
// ============================================================
app.get('/api/almacen/valorizado', (req, res) => {
    const sql = `
        SELECT
            i.id, i.descripcion, i.familia, i.almacen, i.unidad, i.moneda, i.costo_referencial,
            ROUND(
                COALESCE(i.stock_regularizado, 0)
                + COALESCE((
                    SELECT SUM(de.cantidad)
                    FROM detalle_entradas_inv de
                    JOIN entradas_inv e ON e.id = de.entrada_id
                    WHERE de.inventario_id = i.id
                      AND (i.fecha_regularizacion IS NULL OR e.fecha >= i.fecha_regularizacion)
                ), 0)
                - COALESCE((
                    SELECT SUM(ds.cantidad)
                    FROM detalle_salidas_inv ds
                    JOIN salidas_inv s ON s.id = ds.salida_id
                    WHERE ds.inventario_id = i.id
                      AND (i.fecha_regularizacion IS NULL OR s.fecha >= i.fecha_regularizacion)
                ), 0)
            , 4) AS stock_actual
        FROM inventario i
        WHERE i.activo = 1
        ORDER BY i.familia, i.descripcion
    `;
    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Calcular valor = stock_actual * costo_referencial por moneda
        let totalPEN = 0, totalUSD = 0;
        const items = rows.map(r => {
            const stock = parseFloat(r.stock_actual || 0);
            const costo = parseFloat(r.costo_referencial || 0);
            const valor = stock * costo;
            if (r.moneda === 'USD') totalUSD += valor;
            else totalPEN += valor;
            return { ...r, stock_actual: stock, valor_total: valor };
        });
        // Resumen por familia
        const porFamilia = {};
        items.forEach(it => {
            const fam = it.familia || 'Sin familia';
            if (!porFamilia[fam]) porFamilia[fam] = { familia: fam, valor_pen: 0, valor_usd: 0, articulos: 0 };
            if (it.moneda === 'USD') porFamilia[fam].valor_usd += it.valor_total;
            else porFamilia[fam].valor_pen += it.valor_total;
            porFamilia[fam].articulos++;
        });
        const famArray = Object.values(porFamilia).sort((a, b) => (b.valor_pen + b.valor_usd * 3.7) - (a.valor_pen + a.valor_usd * 3.7));
        res.json({ items, totalPEN, totalUSD, porFamilia: famArray });
    });
});

// ============================================================
// MÓDULO: ÓRDENES DE MANTENIMIENTO (OT)
// Tablas: ordenes_trabajo, trabajos_ot, ot_materiales, ot_backlog
// ============================================================

// ── Migración: columnas de detalle de trabajo en trabajos_ot ──────────────
[
    'trabajo_realizado TEXT NULL',
    'tecnico VARCHAR(150) NULL DEFAULT \'\'',
    'fecha_trabajo DATETIME NULL',
    'fecha_salida DATETIME NULL',
    'costo DECIMAL(10,2) NULL DEFAULT 0'
].forEach(function(colDef) {
    var colName = colDef.split(' ')[0];
    db.query('ALTER TABLE trabajos_ot ADD COLUMN ' + colDef, function(e) {
        if (!e || e.code === 'ER_DUP_FIELDNAME') console.log('✅ trabajos_ot.' + colName + ' verificada');
        else console.warn('ALTER trabajos_ot.' + colName + ':', e.message);
    });
});

// ── Helper: genera ID secuencial por año  (ej. OT-2026-0001) ─────
// Solo busca IDs con sufijo de exactamente 4 dígitos (nuevo formato),
// ignorando los IDs legacy con sufijos largos.
function generarId(tabla, columna, prefijo, anio, cb) {
    const regex = `^${prefijo}-${anio}-[0-9]{4}$`;
    db.query(`SELECT MAX(${columna}) AS ultimo FROM ${tabla} WHERE ${columna} REGEXP ?`, [regex], (err, rows) => {
        if (err || !rows.length || !rows[0].ultimo) return cb(`${prefijo}-${anio}-0001`);
        const parts = String(rows[0].ultimo).split('-');
        const num   = parseInt(parts[parts.length - 1], 10) || 0;
        cb(`${prefijo}-${anio}-${String(num + 1).padStart(4, '0')}`);
    });
}

// ── ORDENES DE TRABAJO ────────────────────────────────────────────
app.get('/api/ordenes-trabajo', (req, res) => {
    const sql = `
        SELECT o.*,
            COALESCE((
                SELECT SUM(COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.detalles_json, '$.costo')) AS DECIMAL(10,2)), 0))
                FROM trabajos_ot t WHERE t.id_ot = o.ticket_entrada AND t.estado = 'Aprobado'
            ), 0)
            +
            COALESCE((
                SELECT SUM(s.total_pen)
                FROM salidas_inv s WHERE s.ticket_ot = o.ticket_entrada AND s.estado = 'Despachado'
            ), 0) AS costo_total
        FROM ordenes_trabajo o
        ORDER BY o.fecha_ingreso DESC`;
    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/ordenes-trabajo', (req, res) => {
    const { placa, estado, fecha_ingreso, creado_por, detalles_json } = req.body;
    if (!placa) return res.status(400).json({ error: 'placa es requerida' });
    const anio    = new Date().getFullYear();
    const detJson = typeof detalles_json === 'string' ? detalles_json : JSON.stringify(detalles_json || {});
    generarId('ordenes_trabajo', 'id_ot', 'OT', anio, (nuevoId) => {
        db.query(
            `INSERT INTO ordenes_trabajo (ticket_entrada, id_ot, placa, estado, detalles_json, creado_por, fecha_ingreso)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [nuevoId, nuevoId, placa.toUpperCase(), estado || 'Pendiente', detJson, creado_por || '', fecha_ingreso || new Date()],
            (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true, id: result.insertId, id_ot: nuevoId });
            }
        );
    });
});

app.put('/api/ordenes-trabajo/:id', (req, res) => {
    const ticketId = req.params.id;
    const { accion, estado, detalles_json, fecha_hora_salida, detalles_cierre, usuario } = req.body;

    if (accion === 'iniciar') {
        const { iniciado_por } = req.body;
        db.query(
            "UPDATE ordenes_trabajo SET estado='En Proceso', fecha_inicio_ot=NOW(), iniciado_por=? WHERE ticket_entrada=?",
            [iniciado_por || null, ticketId],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true });
            }
        );
        return;
    }

    if (accion === 'pausar') {
        const { motivo, pausado_por } = req.body;
        if (!motivo || !motivo.trim()) return res.status(400).json({ error: 'El motivo de pausa es requerido' });
        db.query('SELECT fecha_pausa1,fecha_pausa2,fecha_pausa3 FROM ordenes_trabajo WHERE ticket_entrada=?', [ticketId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
            const r = rows[0];
            let slot = 0;
            if (!r.fecha_pausa1) slot = 1;
            else if (!r.fecha_pausa2) slot = 2;
            else if (!r.fecha_pausa3) slot = 3;
            else return res.status(400).json({ error: 'Límite de 3 pausas alcanzado' });
            db.query(
                `UPDATE ordenes_trabajo SET estado='Pausada', fecha_pausa${slot}=NOW(), motivo_pausa${slot}=?, pausado_por${slot}=? WHERE ticket_entrada=?`,
                [motivo.trim(), pausado_por || null, ticketId],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ ok: true, slot });
                }
            );
        });
        return;
    }

    if (accion === 'reanudar') {
        db.query('SELECT fecha_pausa1,fecha_fin_pausa1,fecha_pausa2,fecha_fin_pausa2,fecha_pausa3,fecha_fin_pausa3 FROM ordenes_trabajo WHERE ticket_entrada=?', [ticketId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
            const r = rows[0];
            let slot = 0;
            if (r.fecha_pausa1 && !r.fecha_fin_pausa1) slot = 1;
            else if (r.fecha_pausa2 && !r.fecha_fin_pausa2) slot = 2;
            else if (r.fecha_pausa3 && !r.fecha_fin_pausa3) slot = 3;
            else return res.status(400).json({ error: 'No hay pausa activa' });
            db.query(
                `UPDATE ordenes_trabajo SET estado='En Proceso', fecha_fin_pausa${slot}=NOW() WHERE ticket_entrada=?`,
                [ticketId],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ ok: true, slot });
                }
            );
        });
        return;
    }

    if (accion === 'anular') {
        db.query("UPDATE ordenes_trabajo SET estado = 'Anulado' WHERE ticket_entrada = ?", [ticketId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
        return;
    }

    if (accion === 'aprobar') {
        db.query('SELECT detalles_json FROM ordenes_trabajo WHERE ticket_entrada = ?', [ticketId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
            const raw = rows[0].detalles_json;
            let det = {};
            try { det = typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch(e) { det = {}; }
            det.aprobacion = 'Aprobada';
            db.query('UPDATE ordenes_trabajo SET estado = \'Aprobada\', detalles_json = ? WHERE ticket_entrada = ?',
                [JSON.stringify(det), ticketId], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ ok: true });
                }
            );
        });
        return;
    }

    if (accion === 'cerrar') {
        const { comentario_cierre, cerrado_por } = req.body;
        db.query('SELECT detalles_json FROM ordenes_trabajo WHERE ticket_entrada = ?', [ticketId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
            const raw = rows[0].detalles_json;
            let det = {};
            try { det = typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch(e) { det = {}; }
            det.aprobacion    = 'Cerrada';
            det.tecnico_cierre = (detalles_cierre || {}).tecnico_cierre || '';
            det.obs_cierre    = (detalles_cierre || {}).obs_cierre || '';
            det.firma         = (detalles_cierre || {}).firma || null;
            const fhSalidaRaw = fecha_hora_salida ? new Date(fecha_hora_salida) : new Date();
            const fhSalida = fhSalidaRaw.toISOString().slice(0, 19).replace('T', ' ');
            db.query(
                'UPDATE ordenes_trabajo SET estado=?, detalles_json=?, fecha_hora_salida=?, comentario_cierre=?, cerrado_por=? WHERE ticket_entrada=?',
                ['Finalizado', JSON.stringify(det), fhSalida,
                 comentario_cierre || (detalles_cierre || {}).obs_cierre || null,
                 cerrado_por || null, ticketId],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ ok: true });
                }
            );
        });
        return;
    }

    if (accion === 'editar') {
        const { tipo_ot, sub_tipo, supervisor, situacion_inicial, motivo } = req.body;
        db.query('SELECT detalles_json FROM ordenes_trabajo WHERE ticket_entrada = ?', [ticketId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
            const raw = rows[0].detalles_json;
            let det = {};
            try { det = typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch(e) { det = {}; }
            if (tipo_ot !== undefined)           det.tipo_ot           = tipo_ot;
            if (sub_tipo !== undefined)          det.sub_tipo          = sub_tipo;
            if (supervisor !== undefined)        det.supervisor        = supervisor;
            if (situacion_inicial !== undefined) det.situacion_inicial = situacion_inicial;
            if (motivo !== undefined)            det.motivo            = motivo;
            db.query('UPDATE ordenes_trabajo SET detalles_json = ? WHERE ticket_entrada = ?',
                [JSON.stringify(det), ticketId], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ ok: true });
                }
            );
        });
        return;
    }

    // Edición general
    const sets = [];
    const params = [];
    if (estado)            { sets.push('estado = ?');          params.push(estado); }
    if (detalles_json)     { sets.push('detalles_json = ?');   params.push(JSON.stringify(detalles_json)); }
    if (fecha_hora_salida) { sets.push('fecha_hora_salida = ?'); params.push(new Date(fecha_hora_salida).toISOString().slice(0,19).replace('T',' ')); }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(ticketId);
    db.query('UPDATE ordenes_trabajo SET ' + sets.join(', ') + ' WHERE ticket_entrada = ?', params, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

app.delete('/api/ordenes-trabajo/:id', (req, res) => {
    const ticketId = req.params.id;
    // Cascade: borrar trabajos y materiales asociados primero
    db.query('DELETE FROM trabajos_ot WHERE id_ot = ?', [ticketId], (err1) => {
        if (err1) return res.status(500).json({ error: err1.message });
        db.query('DELETE FROM ot_materiales WHERE ticket_ot = ?', [ticketId], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            db.query('DELETE FROM ordenes_trabajo WHERE ticket_entrada = ?', [ticketId], (err3) => {
                if (err3) return res.status(500).json({ error: err3.message });
                res.json({ ok: true });
            });
        });
    });
});

// ── OT TRABAJOS ───────────────────────────────────────────────────
app.get('/api/ot-trabajos', (req, res) => {
    const { id_ot } = req.query;
    // ticket_visita = FK a ordenes_trabajo.ticket_entrada | id_ot = ID único del trabajo (TR-YYYY-NNN)
    let sql = 'SELECT t.*, ot.placa, ot.id_ot as ot_id FROM trabajos_ot t LEFT JOIN ordenes_trabajo ot ON ot.ticket_entrada = t.ticket_visita';
    const params = [];
    if (id_ot) { sql += ' WHERE t.ticket_visita = ?'; params.push(id_ot); }
    sql += ' ORDER BY t.fecha_creacion DESC';
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/ot-trabajos', (req, res) => {
    // ticket_visita del body = ticket_entrada de la OT (FK de asociación al OT)
    const { ticket_visita: ticketEntrada, trabajo_realizado, fecha_trabajo, fecha_salida, creado_por, detalles_json } = req.body;
    const anio    = new Date().getFullYear();
    const detJson = typeof detalles_json === 'string' ? detalles_json : JSON.stringify(detalles_json || {});
    const personal = (typeof detalles_json === 'object' && detalles_json) ? (detalles_json.personal || '') : '';
    // Generar id_ot único (TR-YYYY-NNN); ticket_visita = FK al ticket_entrada del OT
    generarId('trabajos_ot', 'id_ot', 'TR', anio, (nuevoId) => {
        db.query(
            `INSERT INTO trabajos_ot (id_ot, ticket_visita, estado, trabajo_realizado, tecnico, fecha_trabajo, fecha_salida, creado_por, detalles_json)
             VALUES (?, ?, 'Pendiente', ?, ?, ?, ?, ?, ?)`,
            [nuevoId, ticketEntrada || '', trabajo_realizado || '', personal, fecha_trabajo || null, fecha_salida || null, creado_por || '', detJson],
            (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true, id: result.insertId, id_ot: nuevoId, ticket_visita: ticketEntrada });
            }
        );
    });
});

app.put('/api/ot-trabajos/:id', (req, res) => {
    const idTrabajo = req.params.id;
    const { accion } = req.body;
    if (accion === 'aprobar') {
        db.query("UPDATE trabajos_ot SET estado = 'Aprobado' WHERE id_ot = ?", [idTrabajo], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
        return;
    }
    if (accion === 'editar') {
        const { trabajo_realizado, fecha_trabajo, fecha_salida, personal, costo, estado } = req.body;
        const detJson = JSON.stringify({ personal: personal || '', costo: parseFloat(costo) || 0 });
        // Fallback: registros viejos pueden tener id_ot vacío → usar ticket_visita
        db.query(
            `UPDATE trabajos_ot SET trabajo_realizado=?, tecnico=?, fecha_trabajo=?, fecha_salida=?, detalles_json=?, estado=?
             WHERE (id_ot = ? AND id_ot != '') OR (id_ot = '' AND ticket_visita = ?)`,
            [trabajo_realizado || '', personal || '', fecha_trabajo || null, fecha_salida || null, detJson, estado || 'Pendiente', idTrabajo, idTrabajo],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true });
            }
        );
        return;
    }
    res.status(400).json({ error: 'Acción desconocida' });
});

app.delete('/api/ot-trabajos/:id', (req, res) => {
    const id = req.params.id;
    // Fallback: registros viejos pueden tener id_ot vacío → usar ticket_visita como ID
    db.query(
        'DELETE FROM trabajos_ot WHERE (id_ot = ? AND id_ot != \'\') OR (id_ot = \'\' AND ticket_visita = ?)',
        [id, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

// ── OT MATERIALES ─────────────────────────────────────────────────
app.get('/api/ot-materiales', (req, res) => {
    const { ticket_ot } = req.query;
    let sql = `SELECT s.*,
        GROUP_CONCAT(CONCAT_WS('\u001f', COALESCE(d.inventario_id,''), COALESCE(d.descripcion,''), d.cantidad, d.costo_unitario, COALESCE(d.moneda,'PEN'), d.importe) ORDER BY d.id SEPARATOR '\u001e') AS items_raw
        FROM salidas_inv s
        LEFT JOIN detalle_salidas_inv d ON d.salida_id = s.id
        WHERE s.ticket_ot IS NOT NULL`;
    const params = [];
    if (ticket_ot) { sql += ' AND s.ticket_ot = ?'; params.push(ticket_ot); }
    sql += ' GROUP BY s.id ORDER BY s.id DESC';
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(r => {
            r.items = r.items_raw ? r.items_raw.split('\u001e').map(s => {
                const [invId, desc, cant, cu, mon, imp] = s.split('\u001f');
                return { inventario_id: invId || null, descripcion: desc || '', cantidad: parseFloat(cant) || 0, costo_unitario: parseFloat(cu) || 0, moneda: mon || 'PEN', importe: parseFloat(imp) || 0 };
            }) : [];
            delete r.items_raw;
        });
        res.json(rows);
    });
});

app.post('/api/ot-materiales', (req, res) => {
    const { ticket_ot, tipo_destino, placa, responsable, responsable_id, moneda, tipo_cambio, observaciones, creado_por, items } = req.body;
    if (!ticket_ot) return res.status(400).json({ error: 'ticket_ot es requerido' });
    const fecha = new Date().toISOString().split('T')[0];
    const anio = new Date().getFullYear();
    const tc = parseFloat(tipo_cambio) || 1;
    _generarCodigoAlmacen('SA', anio, (err, id) => {
        if (err) return res.status(500).json({ error: String(err) });
        const total_pen = _calcularTotalPen(items || [], tc);
        db.query(
            'INSERT INTO salidas_inv (id,fecha,tipo_destino,placa,responsable,responsable_id,moneda,tipo_cambio,total_pen,observaciones,creado_por,ticket_ot,estado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [id, fecha, tipo_destino || 'Vehiculo', placa || null, responsable || null, responsable_id || null,
             moneda || 'PEN', tc, total_pen, observaciones || null, creado_por || null, ticket_ot, 'Pendiente'],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if (!items || !items.length) return res.json({ ok: true, id });
                // Resolver inventario_id por descripción para items que no lo traen
                const descsParaResolver = items
                    .filter(d => !d.inventario_id && d.descripcion)
                    .map(d => d.descripcion);
                const resolver = (cb) => {
                    if (!descsParaResolver.length) return cb({});
                    db.query(
                        'SELECT id, descripcion FROM inventario WHERE descripcion IN (?) AND activo = 1',
                        [descsParaResolver],
                        (e, rows) => {
                            const mapa = {};
                            if (!e && rows) rows.forEach(r => { mapa[r.descripcion] = r.id; });
                            cb(mapa);
                        }
                    );
                };
                resolver((mapaInv) => {
                    const dVals = items.map(d => {
                        const invId = d.inventario_id || mapaInv[d.descripcion] || null;
                        return [id, invId, d.descripcion || null,
                            parseFloat(d.cantidad) || 0, parseFloat(d.costo_unitario) || 0,
                            d.moneda || moneda || 'PEN',
                            parseFloat(d.importe) || ((parseFloat(d.cantidad) || 0) * (parseFloat(d.costo_unitario) || 0))];
                    });
                    db.query('INSERT INTO detalle_salidas_inv (salida_id,inventario_id,descripcion,cantidad,costo_unitario,moneda,importe) VALUES ?', [dVals], () => {});
                    res.json({ ok: true, id });
                });
            }
        );
    });
});

app.put('/api/ot-materiales/:id', (req, res) => {
    const id = req.params.id;
    const { accion, motivo } = req.body;
    if (accion === 'despachar') {
        db.query("UPDATE salidas_inv SET estado = 'Despachado' WHERE id = ?", [id], (err, result) => {
            if (err) {
                console.error('Error despachando:', err.message);
                return res.status(500).json({ error: err.message });
            }
            // Resolver inventario_id nulos: por descripción exacta O prefijo "INV-XXX — ..."
            db.query(
                `UPDATE detalle_salidas_inv d
                 INNER JOIN inventario i ON (i.descripcion = d.descripcion OR LEFT(d.descripcion, CHAR_LENGTH(i.id)) = i.id) AND i.activo = 1
                 SET d.inventario_id = i.id
                 WHERE d.salida_id = ? AND (d.inventario_id IS NULL OR d.inventario_id = '')`,
                [id], () => {}
            );
            res.json({ ok: true });
        });
    } else if (accion === 'anular') {
        if (!motivo || !String(motivo).trim()) return res.status(400).json({ error: 'Motivo requerido' });
        db.query('UPDATE salidas_inv SET estado=?, motivo_anulacion=? WHERE id=?',
            ['Anulado', String(motivo).trim(), id], (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!result.affectedRows) return res.status(404).json({ error: 'No encontrado' });
                res.json({ ok: true });
            });
    } else {
        res.status(400).json({ error: 'Acción desconocida: ' + (accion || 'no especificada') });
    }
});

app.delete('/api/ot-materiales/:id', (req, res) => {
    const id = req.params.id;
    db.query('DELETE FROM detalle_salidas_inv WHERE salida_id = ?', [id], () => {
        db.query('DELETE FROM salidas_inv WHERE id = ?', [id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ ok: true });
        });
    });
});

// ── OT BACKLOG ────────────────────────────────────────────────────
app.get('/api/ot-backlog', (req, res) => {
    const { placa, estado } = req.query;
    let sql = 'SELECT * FROM ot_backlog';
    const conds = [], params = [];
    if (placa)  { conds.push('placa = ?');  params.push(placa.toUpperCase()); }
    if (estado) { conds.push('estado = ?'); params.push(estado); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY creado_en DESC';
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/ot-backlog', (req, res) => {
    const { placa, km, tema, tarea, reportado_por, fecha_reporte, estado, creado_por, ticket_ot } = req.body;
    if (!placa || !tarea) return res.status(400).json({ error: 'placa y tarea son requeridos' });
    const anio = new Date().getFullYear();
    generarId('ot_backlog', 'backlog_id', 'BK', anio, (nuevoId) => {
        db.query(
            `INSERT INTO ot_backlog (backlog_id, placa, km, tema, tarea, reportado_por, fecha_reporte, estado, creado_por, ticket_ot)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [nuevoId, placa.toUpperCase(), km || 0, tema || '', tarea, reportado_por || '', fecha_reporte || null, estado || 'Pendiente', creado_por || '', ticket_ot || null],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, id: result.insertId, backlog_id: nuevoId });
        }
        );
    });
});

app.put('/api/ot-backlog/:id', (req, res) => {
    const { estado, placa, km, tema, tarea, reportado_por, ticket_ot } = req.body;
    // Modo edición completa
    if (placa !== undefined || tarea !== undefined) {
        if (!tarea || !placa) return res.status(400).json({ error: 'placa y tarea son requeridos' });
        const fields = [];
        const vals = [];
        if (placa         !== undefined) { fields.push('placa = ?');         vals.push(String(placa).toUpperCase()); }
        if (km            !== undefined) { fields.push('km = ?');            vals.push(km || 0); }
        if (tema          !== undefined) { fields.push('tema = ?');          vals.push(tema || ''); }
        if (tarea         !== undefined) { fields.push('tarea = ?');         vals.push(tarea); }
        if (reportado_por !== undefined) { fields.push('reportado_por = ?'); vals.push(reportado_por || ''); }
        if (ticket_ot     !== undefined) { fields.push('ticket_ot = ?');     vals.push(ticket_ot || null); }
        if (estado        !== undefined) { fields.push('estado = ?');        vals.push(estado); }
        vals.push(req.params.id);
        db.query('UPDATE ot_backlog SET ' + fields.join(', ') + ' WHERE id = ?', vals, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
    } else {
        // Modo cambio de estado simple
        if (!estado) return res.status(400).json({ error: 'estado requerido' });
        db.query('UPDATE ot_backlog SET estado = ? WHERE id = ?', [estado, req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
    }
});

app.delete('/api/ot-backlog/:id', (req, res) => {
    db.query('DELETE FROM ot_backlog WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// ============================================================
// MÓDULO: STATUS RAMPA
// Tabla: taller_rampas
// CREATE TABLE IF NOT EXISTS taller_rampas (
//   id INT AUTO_INCREMENT PRIMARY KEY,
//   rampa INT NOT NULL,
//   placa VARCHAR(20) NOT NULL,
//   km VARCHAR(20),
//   fecha_ingreso DATE,
//   hora_ingreso TIME,
//   fecha_salida DATE,
//   hora_salida TIME,
//   situacion VARCHAR(80),
//   obs TEXT,
//   creado_por VARCHAR(100),
//   creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );
// ============================================================

// Migración: agregar columna estado a taller_rampas
db.query(`ALTER TABLE taller_rampas ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'Activo'`, (e) => {
    if (e && !e.message.includes('Duplicate column')) console.warn('ALTER taller_rampas estado:', e.message);
    else console.log('✅ Columna estado verificada en taller_rampas');
});
db.query(`ALTER TABLE taller_rampas ADD COLUMN fecha_liberado DATETIME NULL`, (e) => {
    if (e && !e.message.includes('Duplicate column')) console.warn('ALTER taller_rampas fecha_liberado:', e.message);
});
db.query(`ALTER TABLE taller_rampas ADD COLUMN liberado_por VARCHAR(100) NULL`, (e) => {
    if (e && !e.message.includes('Duplicate column')) console.warn('ALTER taller_rampas liberado_por:', e.message);
});
db.query(`ALTER TABLE taller_rampas ADD COLUMN fecha_salida_real DATE NULL`, (e) => {
    if (e && !e.message.includes('Duplicate column')) console.warn('ALTER taller_rampas fecha_salida_real:', e.message);
});
db.query(`ALTER TABLE taller_rampas ADD COLUMN hora_salida_real TIME NULL`, (e) => {
    if (e && !e.message.includes('Duplicate column')) console.warn('ALTER taller_rampas hora_salida_real:', e.message);
});

// ── Migraciones ordenes_trabajo: flujo OT (iniciar / pausar / cerrar) ─────────
[
    'sistema VARCHAR(100) NULL',
    'sub_sistema VARCHAR(100) NULL',
    'fecha_inicio_ot DATETIME NULL',
    'iniciado_por VARCHAR(100) NULL',
    'fecha_pausa1 DATETIME NULL',
    'fecha_fin_pausa1 DATETIME NULL',
    'motivo_pausa1 VARCHAR(255) NULL',
    'pausado_por1 VARCHAR(100) NULL',
    'fecha_pausa2 DATETIME NULL',
    'fecha_fin_pausa2 DATETIME NULL',
    'motivo_pausa2 VARCHAR(255) NULL',
    'pausado_por2 VARCHAR(100) NULL',
    'fecha_pausa3 DATETIME NULL',
    'fecha_fin_pausa3 DATETIME NULL',
    'motivo_pausa3 VARCHAR(255) NULL',
    'pausado_por3 VARCHAR(100) NULL',
    'comentario_cierre TEXT NULL',
    'cerrado_por VARCHAR(100) NULL'
].forEach(function(colDef) {
    var colName = colDef.split(' ')[0];
    db.query('ALTER TABLE ordenes_trabajo ADD COLUMN ' + colDef, function(e) {
        if (e && !e.message.includes('Duplicate column')) console.warn('ALTER ordenes_trabajo ' + colName + ':', e.message);
    });
});

app.get('/api/taller-rampas', (req, res) => {
    const historial = req.query.historial === '1';
    const sql = historial
        ? "SELECT * FROM taller_rampas WHERE estado = 'Liberado' ORDER BY fecha_liberado DESC, id DESC"
        : "SELECT * FROM taller_rampas WHERE estado != 'Liberado' ORDER BY rampa ASC, creado_en ASC";
    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/taller-rampas', (req, res) => {
    const { rampa, placa, km, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs, creado_por } = req.body;
    if (!rampa || !placa) return res.status(400).json({ error: 'rampa y placa son requeridos' });
    db.query(
        `INSERT INTO taller_rampas (rampa, placa, km, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs, creado_por, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Activo')`,
        [rampa, placa, km || null, fecha_ingreso || null, hora_ingreso || null, fecha_salida || null, hora_salida || null, situacion || '', obs || '', creado_por || ''],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, id: result.insertId });
        }
    );
});

app.put('/api/taller-rampas/:id', (req, res) => {
    const { accion } = req.body;
    if (accion === 'liberar') {
        const { liberado_por, fecha_salida_real, hora_salida_real, situacion } = req.body;
        db.query(
            `UPDATE taller_rampas SET estado='Liberado',
             fecha_liberado = CASE WHEN fecha_salida IS NOT NULL AND hora_salida IS NOT NULL
                              THEN CONCAT(fecha_salida, ' ', hora_salida)
                              ELSE NOW() END,
             liberado_por=?,
             fecha_salida_real=?, hora_salida_real=?, situacion=COALESCE(?, situacion) WHERE id=?`,
            [liberado_por || null, fecha_salida_real || null, hora_salida_real || null,
             situacion || null, req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true });
            }
        );
        return;
    }
    if (accion === 'reactivar') {
        db.query(
            `UPDATE taller_rampas SET estado='Activo', fecha_liberado=NULL, liberado_por=NULL WHERE id=?`,
            [req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true });
            }
        );
        return;
    }
    const { rampa, placa, km, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs } = req.body;
    db.query(
        `UPDATE taller_rampas SET rampa=?, placa=?, km=?, fecha_ingreso=?, hora_ingreso=?, fecha_salida=?, hora_salida=?, situacion=?, obs=? WHERE id=?`,
        [rampa, placa, km || null, fecha_ingreso || null, hora_ingreso || null, fecha_salida || null, hora_salida || null, situacion || '', obs || '', req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.delete('/api/taller-rampas/:id', (req, res) => {
    db.query('DELETE FROM taller_rampas WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

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
});
