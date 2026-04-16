/**
 * init_db.js — Azkell Fleet
 * Crea todas las tablas si no existen al arrancar el servidor.
 * Se llama desde server.js pasándole el pool `db`.
 */

const TABLAS = [
    {
        nombre: 'usuarios',
        sql: `CREATE TABLE IF NOT EXISTS usuarios (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            nombre           VARCHAR(100) NOT NULL,
            email            VARCHAR(100) UNIQUE NOT NULL,
            password_hash    VARCHAR(255) NOT NULL,
            password_visible VARCHAR(255) NOT NULL DEFAULT '',
            rol_id           INT NULL DEFAULT NULL,
            permisos_json    JSON NULL,
            estado           TINYINT(1) DEFAULT 1,
            ultimo_acceso    DATETIME NULL DEFAULT NULL,
            ultimo_ip        VARCHAR(80) NULL DEFAULT NULL,
            ultimo_dispositivo VARCHAR(200) NULL DEFAULT NULL,
            creado_en        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        nombre: 'auditoria',
        sql: `CREATE TABLE IF NOT EXISTS auditoria (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT,
            accion     VARCHAR(50) NOT NULL,
            modulo     VARCHAR(50) DEFAULT NULL,
            detalle    TEXT,
            ip_origen  VARCHAR(45),
            fecha      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        nombre: 'seguridad',
        sql: `CREATE TABLE IF NOT EXISTS seguridad (
            id                INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id        INT NOT NULL,
            token_sesion      VARCHAR(255) NOT NULL,
            fecha_expiracion  DATETIME NOT NULL,
            creado_en         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        nombre: 'conductores',
        sql: `CREATE TABLE IF NOT EXISTS conductores (
            id                    INT AUTO_INCREMENT PRIMARY KEY,
            nombres               VARCHAR(100) NOT NULL,
            apellidos             VARCHAR(100) NOT NULL,
            dni                   VARCHAR(20) UNIQUE,
            licencia              VARCHAR(50),
            categoria_licencia    VARCHAR(20),
            vencimiento_licencia  DATE,
            telefono              VARCHAR(20),
            estado                VARCHAR(20) DEFAULT 'Activo'
        )`
    },
    {
        nombre: 'cat_rampas',
        sql: `CREATE TABLE IF NOT EXISTS cat_rampas (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            nombre_rampa VARCHAR(50) NOT NULL,
            sede         VARCHAR(50) NOT NULL,
            estado       VARCHAR(20) DEFAULT 'Disponible'
        )`
    },
    {
        nombre: 'cat_situaciones',
        sql: `CREATE TABLE IF NOT EXISTS cat_situaciones (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            codigo      VARCHAR(20) UNIQUE NOT NULL,
            descripcion VARCHAR(100) NOT NULL
        )`
    },
    {
        nombre: 'secuencias',
        sql: `CREATE TABLE IF NOT EXISTS secuencias (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            modulo        VARCHAR(50) UNIQUE NOT NULL,
            prefijo       VARCHAR(10) NOT NULL,
            ultimo_numero INT DEFAULT 0
        )`
    },
    {
        nombre: 'placas',
        sql: `CREATE TABLE IF NOT EXISTS placas (
            id                INT AUTO_INCREMENT PRIMARY KEY,
            placa             VARCHAR(20) UNIQUE NOT NULL,
            cliente           VARCHAR(100),
            ruc               VARCHAR(20),
            marca             VARCHAR(50),
            modelo            VARCHAR(50),
            tipo_vehiculo     VARCHAR(50),
            subtipo           VARCHAR(50),
            color             VARCHAR(30),
            tipo_combustible  VARCHAR(30),
            sede              VARCHAR(50),
            configuracion     VARCHAR(50),
            uts               VARCHAR(20),
            motor             VARCHAR(50),
            chasis            VARCHAR(50),
            anio_fabricacion  INT,
            metrica           VARCHAR(20) DEFAULT 'km',
            estado            VARCHAR(20) DEFAULT 'Operativo',
            creado_en         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        nombre: 'status_flota',
        sql: `CREATE TABLE IF NOT EXISTS status_flota (
            id                    INT AUTO_INCREMENT PRIMARY KEY,
            placa                 VARCHAR(20) UNIQUE NOT NULL,
            situacion_id          INT,
            ubicacion_actual      VARCHAR(255),
            latitud               DECIMAL(10,8),
            longitud              DECIMAL(11,8),
            kilometraje_actual    INT DEFAULT 0,
            horas_motor           DECIMAL(10,2) DEFAULT 0,
            ultima_actualizacion  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`
    },
    {
        nombre: 'tipos_mantenimiento',
        sql: `CREATE TABLE IF NOT EXISTS tipos_mantenimiento (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            marca            VARCHAR(50)   NOT NULL DEFAULT '',
            tipo_mp          VARCHAR(60)   NOT NULL DEFAULT '',
            uts              VARCHAR(20)   NOT NULL DEFAULT '',
            frecuencia_km    INT           NULL,
            frecuencia_horas DECIMAL(10,2) NULL,
            frecuencia_dias  INT           NULL,
            tipo             VARCHAR(50)   NOT NULL DEFAULT '',
            sistema          VARCHAR(100)  NOT NULL DEFAULT '',
            descripcion      VARCHAR(255)  NOT NULL DEFAULT ''
        )`
    },
    {
        nombre: 'tp_mp',
        sql: `CREATE TABLE IF NOT EXISTS tp_mp (
            id                    INT AUTO_INCREMENT PRIMARY KEY,
            tipo_mantenimiento_id INT NOT NULL,
            marca_vehiculo        VARCHAR(50) NOT NULL,
            modelo_vehiculo       VARCHAR(50),
            repuestos_json        JSON
        )`
    },
    {
        nombre: 'fleetrun',
        sql: `CREATE TABLE IF NOT EXISTS fleetrun (
            idRegistro    VARCHAR(50)    NOT NULL PRIMARY KEY,
            fecha         DATE           NOT NULL,
            mes           INT            NULL,
            anio          INT            NULL,
            placa         VARCHAR(20)    NOT NULL,
            marca         VARCHAR(50)    NOT NULL DEFAULT '',
            dueno         VARCHAR(100)   NOT NULL DEFAULT '',
            uts           VARCHAR(20)    NOT NULL DEFAULT '',
            tipo_mp       VARCHAR(60)    NOT NULL DEFAULT '',
            km_actual     INT            NOT NULL DEFAULT 0,
            frecuencia_km INT            NULL,
            km_proximo    INT            NULL,
            observacion   TEXT,
            tecnico       VARCHAR(100)   NOT NULL DEFAULT '',
            km_gps        INT            NULL,
            creado_en     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_placa (placa),
            INDEX idx_fecha (fecha)
        )`
    },
    {
        nombre: 'inspecciones',
        sql: `CREATE TABLE IF NOT EXISTS inspecciones (
            id                INT AUTO_INCREMENT PRIMARY KEY,
            placa             VARCHAR(20) NOT NULL,
            conductor_id      INT NOT NULL,
            fecha_inspeccion  DATE NOT NULL,
            kilometraje       INT NOT NULL,
            nivel_combustible VARCHAR(20),
            estado_general    VARCHAR(20),
            fallas_json       JSON,
            observaciones     TEXT
        )`
    },
    {
        nombre: 'backlog_mantenimiento',
        sql: `CREATE TABLE IF NOT EXISTS backlog_mantenimiento (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            placa           VARCHAR(20) NOT NULL,
            descripcion_falla TEXT NOT NULL,
            prioridad       ENUM('Baja','Media','Alta','Crítica') DEFAULT 'Media',
            estado          ENUM('Pendiente','En Proceso','Resuelto') DEFAULT 'Pendiente',
            reportado_por   VARCHAR(100),
            fecha_reporte   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        nombre: 'ordenes_trabajo',
        sql: `CREATE TABLE IF NOT EXISTS ordenes_trabajo (
            ticket_entrada    VARCHAR(50)  NOT NULL PRIMARY KEY,
            id_ot             VARCHAR(50)  NOT NULL,
            placa             VARCHAR(20)  NOT NULL,
            estado            VARCHAR(30)  NOT NULL DEFAULT 'Recepción',
            id_situacion      INT          NULL,
            id_rampa          INT          NULL,
            detalles_json     JSON         NULL,
            creado_por        VARCHAR(100) NOT NULL DEFAULT '',
            fecha_ingreso     DATETIME     NOT NULL,
            fecha_hora_salida DATETIME     NULL,
            INDEX idx_placa   (placa),
            INDEX idx_estado  (estado)
        )`
    },
    {
        nombre: 'trabajos_ot',
        sql: `CREATE TABLE IF NOT EXISTS trabajos_ot (
            id_ot           VARCHAR(50)  NOT NULL PRIMARY KEY,
            ticket_visita   VARCHAR(50)  NOT NULL,
            tipo_ot         VARCHAR(50)  NOT NULL DEFAULT '',
            sub_tipo        VARCHAR(50)  NOT NULL DEFAULT '',
            estado          VARCHAR(30)  NOT NULL DEFAULT 'Recepción',
            detalles_json   JSON         NULL,
            creado_por      VARCHAR(100) NOT NULL DEFAULT '',
            trabajo_realizado TEXT        NULL,
            tecnico         VARCHAR(100) NULL,
            fecha_trabajo   DATE         NULL,
            fecha_salida    DATETIME     NULL,
            fecha_creacion  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ticket (ticket_visita)
        )`
    },
    {
        nombre: 'trabajos_ot_repuestos',
        sql: `CREATE TABLE IF NOT EXISTS trabajos_ot_repuestos (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            id_ot           VARCHAR(50)  NOT NULL,
            item            VARCHAR(200) NOT NULL,
            cantidad        DECIMAL(10,2) NOT NULL DEFAULT 1,
            precio_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
            total           DECIMAL(10,2) NOT NULL DEFAULT 0,
            INDEX idx_id_ot (id_ot)
        )`
    }
];

/**
 * @param {import('mysql2').Pool} db
 */
async function initDB(db) {
    const promisePool = db.promise();
    const resultados = [];

    for (const tabla of TABLAS) {
        try {
            await promisePool.query(tabla.sql);
            console.log(`✅ Tabla verificada: ${tabla.nombre}`);
            resultados.push({ tabla: tabla.nombre, ok: true });
        } catch (err) {
            console.error(`❌ Error en tabla ${tabla.nombre}:`, err.message);
            resultados.push({ tabla: tabla.nombre, ok: false, error: err.message });
        }
    }

    const ok = resultados.filter(r => r.ok).length;
    const fail = resultados.filter(r => !r.ok).length;
    console.log(`\n📦 init_db.js — ${ok} tablas OK, ${fail} con error\n`);
}

module.exports = { initDB };
