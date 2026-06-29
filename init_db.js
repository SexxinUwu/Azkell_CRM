/**
 * init_db.js — Azkell Fleet
 * Crea todas las tablas si no existen al arrancar el servidor.
 * Se llama desde server.js pasándole el pool `db`.
 * Esquemas sincronizados con las queries reales de server.js.
 */

const TABLAS = [
    {
        nombre: 'configuracion_erp',
        sql: `CREATE TABLE IF NOT EXISTS configuracion_erp (
            clave VARCHAR(50) PRIMARY KEY,
            valor LONGTEXT
        )`
    },
    {
        nombre: 'usuarios',
        sql: `CREATE TABLE IF NOT EXISTS usuarios (
            idUsuario          VARCHAR(20)  NOT NULL PRIMARY KEY,
            nombre             VARCHAR(100) NOT NULL DEFAULT '',
            cargo              VARCHAR(100) NOT NULL DEFAULT '',
            correo             VARCHAR(150) NOT NULL,
            password           VARCHAR(255) NOT NULL DEFAULT '',
            password_visible   VARCHAR(255) NOT NULL DEFAULT '',
            rol                VARCHAR(50)  NOT NULL DEFAULT 'usuario',
            estado             VARCHAR(20)  NOT NULL DEFAULT 'Activo',
            permisos_json      JSON         NULL,
            rol_id             INT          NULL,
            ultimo_acceso      DATETIME     NULL,
            ultimo_ip          VARCHAR(80)  NULL,
            ultimo_dispositivo VARCHAR(200) NULL,
            creado_en          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_correo (correo)
        )`
    },
    {
        nombre: 'roles',
        sql: `CREATE TABLE IF NOT EXISTS roles (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            nombre       VARCHAR(100) NOT NULL,
            color        VARCHAR(20)  DEFAULT '#5865F2',
            permisos_json TEXT,
            es_admin     TINYINT(1)   DEFAULT 0,
            orden        INT          NOT NULL DEFAULT 0
        )`
    },
    {
        nombre: 'auditoria',
        sql: `CREATE TABLE IF NOT EXISTS auditoria (
            idAuditoria  INT AUTO_INCREMENT PRIMARY KEY,
            fecha        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            usuario      VARCHAR(150) NOT NULL DEFAULT '',
            modulo       VARCHAR(50)  DEFAULT NULL,
            accion       VARCHAR(50)  NOT NULL DEFAULT '',
            detalle      TEXT
        )`
    },
    {
        nombre: 'seguridad',
        sql: `CREATE TABLE IF NOT EXISTS seguridad (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id       INT NOT NULL,
            token_sesion     VARCHAR(255) NOT NULL,
            fecha_expiracion DATETIME NOT NULL,
            creado_en        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        nombre: 'placas',
        sql: `CREATE TABLE IF NOT EXISTS placas (
            placa         VARCHAR(20)  NOT NULL PRIMARY KEY,
            cliente       VARCHAR(100) NOT NULL DEFAULT '',
            ruc_dni       VARCHAR(20)  NOT NULL DEFAULT '',
            marca         VARCHAR(50)  NOT NULL DEFAULT '',
            modelo_uts    VARCHAR(100) NOT NULL DEFAULT '',
            tipo          VARCHAR(50)  NOT NULL DEFAULT '',
            sub_tipo      VARCHAR(50)  NOT NULL DEFAULT '',
            color         VARCHAR(30)  NOT NULL DEFAULT '',
            nro_motor     VARCHAR(50)  NOT NULL DEFAULT '',
            nro_caja      VARCHAR(50)  NOT NULL DEFAULT '',
            nro_corona    VARCHAR(50)  NOT NULL DEFAULT '',
            nro_vin       VARCHAR(50)  NOT NULL DEFAULT '',
            configuracion VARCHAR(50)  NOT NULL DEFAULT '',
            anio          VARCHAR(10)  NOT NULL DEFAULT '',
            combustible   VARCHAR(30)  NOT NULL DEFAULT '',
            carga_util    VARCHAR(20)  NOT NULL DEFAULT '',
            peso_neto     VARCHAR(20)  NOT NULL DEFAULT '',
            peso_bruto    VARCHAR(20)  NOT NULL DEFAULT '',
            estado        VARCHAR(20)  NOT NULL DEFAULT 'Activa',
            uts           VARCHAR(20)  NOT NULL DEFAULT '',
            motora        VARCHAR(10)  NOT NULL DEFAULT '',
            llantas       VARCHAR(10)  NOT NULL DEFAULT '',
            en_uso        VARCHAR(10)  NOT NULL DEFAULT '',
            metrica       VARCHAR(10)  NOT NULL DEFAULT 'km'
        )`
    },
    {
        nombre: 'placa_auditoria',
        sql: `CREATE TABLE IF NOT EXISTS placa_auditoria (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            placa       VARCHAR(20)  NOT NULL,
            campo       VARCHAR(50)  NOT NULL,
            valor_ant   TEXT,
            valor_nuevo TEXT,
            usuario     VARCHAR(150) NOT NULL DEFAULT '',
            ip          VARCHAR(80),
            fecha       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_placa (placa)
        )`
    },
    {
        nombre: 'status_flota',
        sql: `CREATE TABLE IF NOT EXISTS status_flota (
            idRegistro       VARCHAR(50)  NOT NULL PRIMARY KEY,
            fecha            DATE,
            corte            VARCHAR(30)  NOT NULL DEFAULT '',
            unidad_motora    VARCHAR(20)  NOT NULL DEFAULT '',
            unidad_no_motora VARCHAR(20)  NOT NULL DEFAULT '',
            cliente_motora   VARCHAR(100) NOT NULL DEFAULT '',
            cliente_nomotora VARCHAR(100) NOT NULL DEFAULT '',
            zona             VARCHAR(50)  NOT NULL DEFAULT '',
            conductor        VARCHAR(100) NOT NULL DEFAULT '',
            estado           VARCHAR(30)  NOT NULL DEFAULT '',
            observaciones    TEXT,
            usuario          VARCHAR(150) NOT NULL DEFAULT '',
            INDEX idx_fecha    (fecha),
            INDEX idx_motora   (unidad_motora),
            INDEX idx_nomotora (unidad_no_motora)
        )`
    },
    {
        nombre: 'inspecciones',
        sql: `CREATE TABLE IF NOT EXISTS inspecciones (
            id              VARCHAR(50)  NOT NULL PRIMARY KEY,
            placa           VARCHAR(20)  NOT NULL DEFAULT '',
            fecha_ingreso   DATE,
            cliente         VARCHAR(100) NOT NULL DEFAULT '',
            tecnico         VARCHAR(100) NOT NULL DEFAULT '',
            km_tablero      INT          NOT NULL DEFAULT 0,
            dias_propuestos INT          NOT NULL DEFAULT 0,
            detalles_json   LONGTEXT,
            url_firma       TEXT,
            INDEX idx_placa (placa),
            INDEX idx_fecha (fecha_ingreso)
        )`
    },
    {
        nombre: 'conductores',
        sql: `CREATE TABLE IF NOT EXISTS conductores (
            idConductor  INT AUTO_INCREMENT PRIMARY KEY,
            nombre       VARCHAR(100) NOT NULL DEFAULT '',
            empresa      VARCHAR(100) NOT NULL DEFAULT '',
            telefono     VARCHAR(20)  NOT NULL DEFAULT '',
            dni          VARCHAR(20)  NOT NULL DEFAULT '',
            licencia     VARCHAR(50)  NOT NULL DEFAULT '',
            estado       VARCHAR(20)  NOT NULL DEFAULT 'Activo',
            foto         TEXT
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
            idRegistro    VARCHAR(50)  NOT NULL PRIMARY KEY,
            fecha         DATE         NOT NULL,
            mes           INT          NULL,
            anio          INT          NULL,
            placa         VARCHAR(20)  NOT NULL,
            marca         VARCHAR(50)  NOT NULL DEFAULT '',
            dueno         VARCHAR(100) NOT NULL DEFAULT '',
            uts           VARCHAR(20)  NOT NULL DEFAULT '',
            tipo_mp       VARCHAR(60)  NOT NULL DEFAULT '',
            km_actual     INT          NOT NULL DEFAULT 0,
            frecuencia_km INT          NULL,
            km_proximo    INT          NULL,
            observacion   TEXT,
            tecnico       VARCHAR(100) NOT NULL DEFAULT '',
            km_gps        INT          NULL,
            creado_en     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_placa (placa),
            INDEX idx_fecha (fecha)
        )`
    },
    {
        nombre: 'backlog_mantenimiento',
        sql: `CREATE TABLE IF NOT EXISTS backlog_mantenimiento (
            id                INT AUTO_INCREMENT PRIMARY KEY,
            placa             VARCHAR(20) NOT NULL,
            descripcion_falla TEXT        NOT NULL,
            prioridad         ENUM('Baja','Media','Alta','Crítica') DEFAULT 'Media',
            estado            ENUM('Pendiente','En Proceso','Resuelto') DEFAULT 'Pendiente',
            reportado_por     VARCHAR(100),
            fecha_reporte     TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
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
            INDEX idx_placa  (placa),
            INDEX idx_estado (estado)
        )`
    },
    {
        nombre: 'trabajos_ot',
        sql: `CREATE TABLE IF NOT EXISTS trabajos_ot (
            id_ot             VARCHAR(50)  NOT NULL PRIMARY KEY,
            ticket_visita     VARCHAR(50)  NOT NULL,
            tipo_ot           VARCHAR(50)  NOT NULL DEFAULT '',
            sub_tipo          VARCHAR(50)  NOT NULL DEFAULT '',
            estado            VARCHAR(30)  NOT NULL DEFAULT 'Recepción',
            detalles_json     JSON         NULL,
            creado_por        VARCHAR(100) NOT NULL DEFAULT '',
            trabajo_realizado TEXT         NULL,
            tecnico           VARCHAR(100) NULL,
            fecha_trabajo     DATE         NULL,
            fecha_salida      DATETIME     NULL,
            fecha_creacion    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ticket (ticket_visita)
        )`
    },
    {
        nombre: 'trabajos_ot_repuestos',
        sql: `CREATE TABLE IF NOT EXISTS trabajos_ot_repuestos (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            id_ot           VARCHAR(50)   NOT NULL,
            item            VARCHAR(200)  NOT NULL,
            cantidad        DECIMAL(10,2) NOT NULL DEFAULT 1,
            precio_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
            total           DECIMAL(10,2) NOT NULL DEFAULT 0,
            INDEX idx_id_ot (id_ot)
        )`
    },
    {
        nombre: 'ot_materiales',
        sql: `CREATE TABLE IF NOT EXISTS ot_materiales (
            id                   INT AUTO_INCREMENT PRIMARY KEY,
            id_solicitud         VARCHAR(30)   NOT NULL UNIQUE,
            ticket_ot            VARCHAR(50)   NOT NULL,
            producto             VARCHAR(200)  NOT NULL,
            cantidad             DECIMAL(10,3) NOT NULL DEFAULT 1,
            unidad_medida        VARCHAR(20)   NOT NULL DEFAULT 'Pza',
            costo_unit           DECIMAL(10,2) NOT NULL DEFAULT 0,
            costo_total          DECIMAL(10,2) NOT NULL DEFAULT 0,
            personal_solicitante VARCHAR(100)  NOT NULL DEFAULT '',
            observacion          TEXT          NULL,
            estado               VARCHAR(20)   NOT NULL DEFAULT 'Pendiente',
            creado_por           VARCHAR(100)  NOT NULL DEFAULT '',
            creado_en            TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ticket_ot (ticket_ot)
        )`
    },
    {
        nombre: 'ot_backlog',
        sql: `CREATE TABLE IF NOT EXISTS ot_backlog (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            backlog_id    VARCHAR(30)  NOT NULL UNIQUE,
            placa         VARCHAR(20)  NOT NULL,
            km            INT          NOT NULL DEFAULT 0,
            tema          VARCHAR(100) NOT NULL DEFAULT '',
            tarea         TEXT         NOT NULL,
            reportado_por VARCHAR(100) NOT NULL DEFAULT '',
            fecha_reporte DATE         NULL,
            estado        VARCHAR(20)  NOT NULL DEFAULT 'Pendiente',
            creado_por    VARCHAR(100) NOT NULL DEFAULT '',
            creado_en     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_placa (placa),
            INDEX idx_estado (estado)
        )`
    },
    {
        nombre: 'taller_rampas',
        sql: `CREATE TABLE IF NOT EXISTS taller_rampas (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            rampa         INT          NOT NULL,
            placa         VARCHAR(20)  NOT NULL,
            km            VARCHAR(20)  NULL,
            fecha_ingreso DATE         NULL,
            hora_ingreso  TIME         NULL,
            fecha_salida  DATE         NULL,
            hora_salida   TIME         NULL,
            situacion     VARCHAR(80)  NOT NULL DEFAULT '',
            obs           TEXT         NULL,
            creado_por    VARCHAR(100) NOT NULL DEFAULT '',
            creado_en     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_rampa (rampa),
            INDEX idx_placa (placa)
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

    try {
        await promisePool.query("INSERT IGNORE INTO configuracion_erp (clave, valor) VALUES ('empresa_nombre', 'Azkell Fleet')");
        await promisePool.query("INSERT IGNORE INTO configuracion_erp (clave, valor) VALUES ('empresa_logo', '')");
        console.log(`✅ Default configurations seeded`);
    } catch (err) {
        console.error(`❌ Error seeding configurations:`, err.message);
    }
}

module.exports = { initDB };
