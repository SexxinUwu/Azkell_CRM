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
            telefono           VARCHAR(50)  NULL,
            avatar_url         TEXT         NULL,
            banner_url         TEXT         NULL,
            firma_digital      LONGTEXT     NULL,
            preferencias_json  LONGTEXT     NULL,
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
            fecha         DATE         NULL DEFAULT NULL,
            mes           INT          NULL,
            anio          INT          NULL,
            placa         VARCHAR(20)  NOT NULL,
            marca         VARCHAR(50)  NOT NULL DEFAULT '',
            dueno         VARCHAR(100) NOT NULL DEFAULT '',
            uts           VARCHAR(20)  NOT NULL DEFAULT '',
            tipo_mp       VARCHAR(60)  NOT NULL DEFAULT '',
            km_actual     INT          NULL DEFAULT NULL,
            frecuencia_km INT          NULL,
            km_proximo    INT          NULL,
            observacion   TEXT,
            tecnico       VARCHAR(100) NOT NULL DEFAULT '',
            km_gps        INT          NULL,
            creado_en     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_placa (placa),
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
            INDEX idx_estado (estado)
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
            id               INT AUTO_INCREMENT PRIMARY KEY,
            rampa            INT          NOT NULL,
            placa            VARCHAR(20)  NOT NULL,
            km               VARCHAR(20)  NULL,
            fecha_ingreso    DATE         NULL,
            hora_ingreso     TIME         NULL,
            fecha_salida     DATE         NULL,
            hora_salida      TIME         NULL,
            situacion        VARCHAR(80)  NOT NULL DEFAULT '',
            obs              TEXT         NULL,
            creado_por       VARCHAR(100) NOT NULL DEFAULT '',
            estado           VARCHAR(20)  NOT NULL DEFAULT 'Activo',
            fecha_liberado   DATETIME     NULL,
            liberado_por     VARCHAR(100) NULL,
            evidencia_url    VARCHAR(255) NULL,
            creado_en        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_rampa (rampa),
            INDEX idx_placa (placa)
        )`
    },
    {
        nombre: "almacen_familias",
        sql: "CREATE TABLE IF NOT EXISTS `almacen_familias` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `nombre` varchar(100) NOT NULL,\n  `descripcion` varchar(200) DEFAULT NULL,\n  `activo` tinyint(1) NOT NULL DEFAULT '1',\n  `orden` int NOT NULL DEFAULT '0',\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `nombre` (`nombre`)\n) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "almacen_marcas",
        sql: "CREATE TABLE IF NOT EXISTS `almacen_marcas` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `nombre` varchar(100) NOT NULL,\n  `descripcion` varchar(200) DEFAULT NULL,\n  `activo` tinyint(1) NOT NULL DEFAULT '1',\n  `orden` int NOT NULL DEFAULT '0',\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `nombre` (`nombre`)\n) ENGINE=InnoDB AUTO_INCREMENT=184 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "almacen_sistemas",
        sql: "CREATE TABLE IF NOT EXISTS `almacen_sistemas` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `nombre` varchar(100) NOT NULL,\n  `sub_sistemas` json DEFAULT NULL,\n  `activo` tinyint(1) NOT NULL DEFAULT '1',\n  `orden` int NOT NULL DEFAULT '0',\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `nombre` (`nombre`)\n) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "almacen_unidades",
        sql: "CREATE TABLE IF NOT EXISTS `almacen_unidades` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `nombre` varchar(20) NOT NULL,\n  `descripcion` varchar(200) DEFAULT NULL,\n  `activo` tinyint(1) NOT NULL DEFAULT '1',\n  `orden` int NOT NULL DEFAULT '0',\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `nombre` (`nombre`)\n) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "configuracion_almacen",
        sql: "CREATE TABLE IF NOT EXISTS `configuracion_almacen` (\n  `clave` varchar(50) NOT NULL,\n  `valor` varchar(500) NOT NULL DEFAULT '',\n  `descripcion` varchar(200) DEFAULT NULL,\n  PRIMARY KEY (`clave`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "configuracion_flota",
        sql: "CREATE TABLE IF NOT EXISTS `configuracion_flota` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `marca` varchar(50) NOT NULL,\n  `uts_categoria` varchar(20) NOT NULL,\n  `km_mensuales` int NOT NULL DEFAULT '0',\n  `dias_operativos` int NOT NULL DEFAULT '26',\n  `mp1_intervalo_km` int NOT NULL DEFAULT '5000',\n  `mp2_intervalo_km` int NOT NULL DEFAULT '10000',\n  `mp3_intervalo_km` int NOT NULL DEFAULT '20000',\n  `activa` tinyint(1) NOT NULL DEFAULT '1',\n  `observaciones` text,\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uq_marca_uts` (`marca`,`uts_categoria`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "destinatarios_alertas",
        sql: "CREATE TABLE IF NOT EXISTS `destinatarios_alertas` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `nombre` varchar(100) NOT NULL,\n  `correo` varchar(150) NOT NULL,\n  `cargo` varchar(80) DEFAULT NULL,\n  `notif_1d` tinyint(1) NOT NULL DEFAULT '1' COMMENT '+1 día retraso',\n  `notif_3d` tinyint(1) NOT NULL DEFAULT '1' COMMENT '+3 días retraso',\n  `notif_7d` tinyint(1) NOT NULL DEFAULT '1' COMMENT '+7 días retraso',\n  `notif_completada` tinyint(1) NOT NULL DEFAULT '0',\n  `activo` tinyint(1) NOT NULL DEFAULT '1',\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uq_correo` (`correo`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Destinatarios de alertas del módulo Planificación'"
    },
    {
        nombre: "detalle_entradas_inv",
        sql: "CREATE TABLE IF NOT EXISTS `detalle_entradas_inv` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `entrada_id` varchar(20) NOT NULL,\n  `inventario_id` varchar(20) NOT NULL,\n  `descripcion` varchar(400) DEFAULT NULL,\n  `cantidad` decimal(14,4) NOT NULL,\n  `costo_unitario` decimal(14,4) NOT NULL DEFAULT '0.0000',\n  `moneda` enum('PEN','USD') NOT NULL DEFAULT 'PEN',\n  `importe` decimal(14,4) NOT NULL DEFAULT '0.0000',\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_entrada` (`entrada_id`),\n  KEY `idx_item` (`inventario_id`)\n) ENGINE=InnoDB AUTO_INCREMENT=358 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "detalle_salidas_inv",
        sql: "CREATE TABLE IF NOT EXISTS `detalle_salidas_inv` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `salida_id` varchar(20) NOT NULL,\n  `inventario_id` varchar(20) DEFAULT NULL,\n  `descripcion` varchar(400) DEFAULT NULL,\n  `cantidad` decimal(14,4) NOT NULL,\n  `costo_unitario` decimal(14,4) NOT NULL DEFAULT '0.0000',\n  `moneda` enum('PEN','USD') NOT NULL DEFAULT 'PEN',\n  `importe` decimal(14,4) NOT NULL DEFAULT '0.0000',\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_salida` (`salida_id`),\n  KEY `idx_item` (`inventario_id`)\n) ENGINE=InnoDB AUTO_INCREMENT=1213 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "documentos_flota",
        sql: "CREATE TABLE IF NOT EXISTS `documentos_flota` (\n  `id` varchar(50) NOT NULL,\n  `placa` varchar(50) NOT NULL,\n  `tipo_documento` varchar(100) NOT NULL,\n  `entidad` varchar(100) DEFAULT NULL,\n  `nro_constancia` varchar(100) DEFAULT NULL,\n  `fecha_emision` date DEFAULT NULL,\n  `fecha_vencimiento` date DEFAULT NULL,\n  `pago` varchar(50) DEFAULT NULL,\n  `asesor` varchar(100) DEFAULT NULL,\n  `observaciones` text,\n  `usuario` varchar(100) DEFAULT NULL,\n  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "entradas_inv",
        sql: "CREATE TABLE IF NOT EXISTS `entradas_inv` (\n  `id` varchar(20) NOT NULL,\n  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `proveedor_id` varchar(20) DEFAULT NULL,\n  `proveedor_nombre` varchar(200) DEFAULT NULL,\n  `documento_referencia` varchar(100) DEFAULT NULL,\n  `moneda` enum('PEN','USD') NOT NULL DEFAULT 'PEN',\n  `tipo_cambio` decimal(8,4) DEFAULT NULL,\n  `total_pen` decimal(14,4) NOT NULL DEFAULT '0.0000',\n  `observaciones` text,\n  `tipo_igv` varchar(20) DEFAULT 'sin_igv',\n  `creado_por` varchar(100) DEFAULT NULL,\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `estado` varchar(50) DEFAULT NULL,\n  `motivo_anulacion` varchar(255) DEFAULT NULL,\n  `url_voucher` text,\n  `url_cotizacion` text,\n  `url_factura` text,\n  `motivo_entrada` varchar(255) DEFAULT NULL,\n  `placa` varchar(50) DEFAULT NULL,\n  `tipo_orden` varchar(50) DEFAULT 'Orden de compra',\n  `condicion_pago` varchar(50) DEFAULT 'Al contado',\n  `dias_credito` int DEFAULT '30',\n  `ot_id` varchar(50) DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  KEY `idx_fecha` (`fecha`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "integraciones_api",
        sql: "CREATE TABLE IF NOT EXISTS `integraciones_api` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `clave` varchar(100) NOT NULL,\n  `valor` text,\n  `descripcion` varchar(255) DEFAULT NULL,\n  `actualizado_por` varchar(100) DEFAULT NULL,\n  `actualizado_en` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  `creado_en` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `clave` (`clave`)\n) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Credenciales y tokens de integraciones externas (Wialon, Gemini, etc.)'"
    },
    {
        nombre: "inventario",
        sql: "CREATE TABLE IF NOT EXISTS `inventario` (\n  `id` varchar(20) NOT NULL,\n  `descripcion` varchar(400) NOT NULL,\n  `familia` varchar(100) DEFAULT NULL,\n  `sub_familia` varchar(100) DEFAULT NULL,\n  `almacen` varchar(100) DEFAULT NULL,\n  `unidad` varchar(30) DEFAULT NULL,\n  `moneda` enum('PEN','USD') NOT NULL DEFAULT 'PEN',\n  `costo_referencial` decimal(14,4) NOT NULL DEFAULT '0.0000',\n  `costo_soles` decimal(14,4) DEFAULT NULL,\n  `tipo_cambio` decimal(10,4) DEFAULT NULL,\n  `stock_regularizado` decimal(14,4) NOT NULL DEFAULT '0.0000',\n  `fecha_regularizacion` date DEFAULT NULL,\n  `proveedor_id` varchar(20) DEFAULT NULL,\n  `marca` varchar(100) DEFAULT NULL,\n  `activo` tinyint(1) NOT NULL DEFAULT '1',\n  `observaciones` text,\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  `codigo_item` varchar(100) DEFAULT NULL,\n  `marca_unidad` text,\n  `sistema` varchar(100) DEFAULT NULL,\n  `sub_sistema` varchar(100) DEFAULT NULL,\n  `tipo` varchar(50) DEFAULT NULL,\n  `sub_tipo` enum('Nuevo','Reparado') DEFAULT NULL,\n  `ubicacion` varchar(150) DEFAULT NULL,\n  `anaquel` decimal(6,2) DEFAULT NULL,\n  `stock_min` decimal(14,4) NOT NULL DEFAULT '0.0000',\n  `stock_max` decimal(14,4) NOT NULL DEFAULT '0.0000',\n  `estado_art` varchar(50) DEFAULT 'Activo',\n  `codigo_barras` varchar(100) DEFAULT NULL,\n  `imagen_url` text,\n  `articulo` varchar(300) DEFAULT NULL,\n  `codigo_articulo` varchar(100) DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  KEY `idx_familia` (`familia`),\n  KEY `idx_almacen` (`almacen`),\n  KEY `idx_activo` (`activo`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "km_snapshots",
        sql: "CREATE TABLE IF NOT EXISTS `km_snapshots` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `placa` varchar(100) DEFAULT NULL,\n  `fecha` date NOT NULL,\n  `km_gps` int NOT NULL DEFAULT '0',\n  `horas_motor` decimal(10,1) NOT NULL DEFAULT '0.0',\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uq_placa_fecha` (`placa`,`fecha`),\n  KEY `idx_placa` (`placa`),\n  KEY `idx_fecha` (`fecha`)\n) ENGINE=InnoDB AUTO_INCREMENT=135780 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Snapshot diario de KM GPS y horas motor por placa (Wialon)'"
    },
    {
        nombre: "mant_insp_templates",
        sql: "CREATE TABLE IF NOT EXISTS `mant_insp_templates` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `template_id` varchar(30) NOT NULL COMMENT 'ID único de la categoría (ej: cat_1)',\n  `titulo` varchar(150) NOT NULL COMMENT 'Nombre de la categoría',\n  `items_json` json NOT NULL COMMENT 'Array de ítems: [{id, label, type}]',\n  `orden` int NOT NULL DEFAULT '0',\n  `activo` tinyint(1) NOT NULL DEFAULT '1',\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uq_template_id` (`template_id`)\n) ENGINE=InnoDB AUTO_INCREMENT=68 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Plantilla global del checklist de inspecciones de mantenimiento'"
    },
    {
        nombre: "mantenimiento_kits",
        sql: "CREATE TABLE IF NOT EXISTS `mantenimiento_kits` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `marca_vehiculo` varchar(50) NOT NULL,\n  `modelo_vehiculo` varchar(100) DEFAULT 'TODOS LOS MODELOS',\n  `tipo_mp` varchar(60) NOT NULL,\n  `nombre_kit` varchar(150) DEFAULT NULL,\n  `item_codigo` varchar(30) NOT NULL,\n  `item_nombre` varchar(200) NOT NULL,\n  `cantidad` decimal(10,2) NOT NULL,\n  `unidad_medida` varchar(10) NOT NULL,\n  `costo_unitario` decimal(10,2) NOT NULL DEFAULT '0.00',\n  `costo_total` decimal(10,2) NOT NULL DEFAULT '0.00',\n  `orden` int NOT NULL DEFAULT '1',\n  `activo` tinyint(1) NOT NULL DEFAULT '1',\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_marca_mp` (`marca_vehiculo`,`tipo_mp`)\n) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "planificacion",
        sql: "CREATE TABLE IF NOT EXISTS `planificacion` (\n  `id` varchar(50) NOT NULL,\n  `placa` varchar(100) DEFAULT NULL,\n  `configuracion_flota_id` int DEFAULT NULL,\n  `tipo_mp` varchar(60) NOT NULL,\n  `fecha_inicio_ventana` date NOT NULL,\n  `fecha_fin_ventana` date NOT NULL,\n  `mes_ejecucion` int NOT NULL,\n  `anio_ejecucion` int NOT NULL,\n  `km_estimado` int NOT NULL DEFAULT '0',\n  `km_minimo` int DEFAULT NULL,\n  `km_maximo` int DEFAULT NULL,\n  `tecnico_asignado` varchar(100) DEFAULT NULL,\n  `prioridad` enum('Baja','Normal','Alta','Crítica') NOT NULL DEFAULT 'Normal',\n  `observaciones_plan` text,\n  `estado` enum('Programada','Confirmada','En Progreso','Completada','Cancelada','Diferida') NOT NULL DEFAULT 'Programada',\n  `motivo_cancelacion` text,\n  `fleetrun_id_ejecutado` varchar(50) DEFAULT NULL,\n  `fecha_real_ejecucion` date DEFAULT NULL,\n  `km_real_ejecucion` int DEFAULT NULL,\n  `desviacion_km` int DEFAULT NULL,\n  `desviacion_dias` int DEFAULT NULL,\n  `fecha_primer_retraso` date DEFAULT NULL,\n  `alertas_enviadas` tinyint NOT NULL DEFAULT '0',\n  `source` enum('manual_excel','auto_generada') NOT NULL DEFAULT 'manual_excel',\n  `created_by` varchar(100) DEFAULT NULL,\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_estado` (`estado`),\n  KEY `idx_placa` (`placa`),\n  KEY `idx_mes_anio` (`mes_ejecucion`,`anio_ejecucion`),\n  KEY `idx_fecha_ventana` (`fecha_fin_ventana`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "proveedor_marcas_inv",
        sql: "CREATE TABLE IF NOT EXISTS `proveedor_marcas_inv` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `proveedor_id` varchar(20) NOT NULL,\n  `marca` varchar(100) NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `idx_prov` (`proveedor_id`)\n) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "proveedores_inv",
        sql: "CREATE TABLE IF NOT EXISTS `proveedores_inv` (\n  `id` varchar(20) NOT NULL,\n  `nombre` varchar(200) NOT NULL,\n  `razon_social` varchar(200) DEFAULT NULL,\n  `tipo_documento` enum('RUC','DNI','CE','Otro') DEFAULT 'RUC',\n  `numero_documento` varchar(20) DEFAULT NULL,\n  `telefono` varchar(30) DEFAULT NULL,\n  `email` varchar(150) DEFAULT NULL,\n  `direccion` text,\n  `estado` enum('Activo','Inactivo') DEFAULT 'Activo',\n  `observaciones` text,\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "requerimientos_planificacion",
        sql: "CREATE TABLE IF NOT EXISTS `requerimientos_planificacion` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `plan_id` varchar(50) NOT NULL,\n  `mes_ejecucion` int NOT NULL,\n  `anio_ejecucion` int NOT NULL,\n  `item_codigo` varchar(30) DEFAULT NULL,\n  `item_nombre` varchar(200) NOT NULL,\n  `cantidad_requerida` decimal(10,2) NOT NULL,\n  `unidad_medida` varchar(10) NOT NULL,\n  `costo_unitario` decimal(10,2) NOT NULL DEFAULT '0.00',\n  `costo_total` decimal(10,2) NOT NULL DEFAULT '0.00',\n  `estado_req` enum('Pendiente','Solicitado','Recibido','Entregado al Taller','Cancelado') NOT NULL DEFAULT 'Pendiente',\n  `fecha_solicitud` date DEFAULT NULL,\n  `fecha_entrega` date DEFAULT NULL,\n  `responsable_almacen` varchar(100) DEFAULT NULL,\n  `observaciones` text,\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_plan` (`plan_id`),\n  KEY `idx_mes_req` (`mes_ejecucion`,`anio_ejecucion`),\n  KEY `idx_estado_req` (`estado_req`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "salidas_inv",
        sql: "CREATE TABLE IF NOT EXISTS `salidas_inv` (\n  `id` varchar(20) NOT NULL,\n  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `tipo_orden` varchar(60) NOT NULL DEFAULT 'Orden de Salida',\n  `tipo_destino` varchar(50) NOT NULL DEFAULT 'Vehiculo',\n  `placa` varchar(100) DEFAULT NULL,\n  `responsable` varchar(150) DEFAULT NULL,\n  `responsable_id` int DEFAULT NULL,\n  `moneda` enum('PEN','USD') NOT NULL DEFAULT 'PEN',\n  `tipo_cambio` decimal(8,4) DEFAULT NULL,\n  `total_pen` decimal(14,4) NOT NULL DEFAULT '0.0000',\n  `observaciones` text,\n  `creado_por` varchar(100) DEFAULT NULL,\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `ticket_ot` varchar(30) DEFAULT NULL,\n  `estado` varchar(20) NOT NULL DEFAULT 'Despachado',\n  `motivo_anulacion` varchar(255) DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  KEY `idx_fecha` (`fecha`),\n  KEY `idx_placa` (`placa`),\n  KEY `idx_ticket_ot` (`ticket_ot`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "seg_asistencia",
        sql: "CREATE TABLE IF NOT EXISTS `seg_asistencia` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `dni` varchar(12) NOT NULL,\n  `nombre` varchar(150) NOT NULL,\n  `cargo` varchar(100) DEFAULT NULL,\n  `fecha_ingreso` varchar(10) NOT NULL,\n  `hora_ingreso` varchar(8) NOT NULL,\n  `fecha_salida` varchar(10) DEFAULT NULL,\n  `hora_salida` varchar(8) DEFAULT NULL,\n  `registrado_por` varchar(100) DEFAULT NULL,\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_dni` (`dni`),\n  KEY `idx_fecha_ingreso` (`fecha_ingreso`),\n  KEY `idx_estado` (`hora_salida`)\n) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "seg_checklist_templates",
        sql: "CREATE TABLE IF NOT EXISTS `seg_checklist_templates` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `template_id` varchar(30) NOT NULL,\n  `titulo` varchar(150) NOT NULL,\n  `items_json` json NOT NULL,\n  `orden` int NOT NULL DEFAULT '0',\n  `activo` tinyint(1) NOT NULL DEFAULT '1',\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uq_template_id` (`template_id`)\n) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "seg_unidades_fotos",
        sql: "CREATE TABLE IF NOT EXISTS `seg_unidades_fotos` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `registro_id` varchar(50) DEFAULT NULL,\n  `tipo` enum('salida','retorno') NOT NULL,\n  `url` varchar(500) DEFAULT NULL,\n  `orden` int NOT NULL DEFAULT '0',\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_registro` (`registro_id`),\n  KEY `idx_tipo` (`tipo`)\n) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "seg_unidades_registros",
        sql: "CREATE TABLE IF NOT EXISTS `seg_unidades_registros` (\n  `id` varchar(50) NOT NULL,\n  `placa_tracto` varchar(20) NOT NULL,\n  `placa_carreta` varchar(20) DEFAULT NULL,\n  `conductor` varchar(100) NOT NULL,\n  `destino` varchar(150) DEFAULT NULL,\n  `estado` enum('en_ruta','completado') NOT NULL DEFAULT 'en_ruta',\n  `salida_fecha` varchar(10) DEFAULT NULL,\n  `salida_hora` varchar(5) DEFAULT NULL,\n  `salida_km` varchar(20) DEFAULT NULL,\n  `salida_template_json` json DEFAULT NULL,\n  `salida_checklist_json` json DEFAULT NULL,\n  `salida_has_alert` tinyint(1) NOT NULL DEFAULT '0',\n  `retorno_fecha` varchar(10) DEFAULT NULL,\n  `retorno_hora` varchar(5) DEFAULT NULL,\n  `retorno_km` varchar(20) DEFAULT NULL,\n  `retorno_template_json` json DEFAULT NULL,\n  `retorno_checklist_json` json DEFAULT NULL,\n  `retorno_has_alert` tinyint(1) NOT NULL DEFAULT '0',\n  `creado_por` varchar(100) DEFAULT NULL,\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_placa_tracto` (`placa_tracto`),\n  KEY `idx_estado` (`estado`),\n  KEY `idx_salida_fecha` (`salida_fecha`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "taller_personal",
        sql: "CREATE TABLE IF NOT EXISTS `taller_personal` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `nombre` varchar(100) NOT NULL,\n  `sueldo_mensual` decimal(10,2) DEFAULT '0.00',\n  `costo_hora` decimal(10,2) DEFAULT '0.00',\n  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "tipos_preventivo",
        sql: "CREATE TABLE IF NOT EXISTS `tipos_preventivo` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `nombre` varchar(100) NOT NULL,\n  `descripcion` text,\n  `activo` tinyint(1) NOT NULL DEFAULT '1',\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `nombre` (`nombre`)\n) ENGINE=InnoDB AUTO_INCREMENT=113 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "clientes",
        sql: "CREATE TABLE IF NOT EXISTS `clientes` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `ruc_dni` varchar(50) DEFAULT NULL,\n  `razon_social` varchar(255) NOT NULL,\n  `direccion` text,\n  `telefono` varchar(50) DEFAULT NULL,\n  `email` varchar(100) DEFAULT NULL,\n  `estado` varchar(20) DEFAULT 'Activo',\n  `notas` text,\n  `fecha_creacion` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uq_razon` (`razon_social`)\n) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    },
    {
        nombre: "flota_disponibilidad",
        sql: `CREATE TABLE IF NOT EXISTS flota_disponibilidad (
            id INT AUTO_INCREMENT PRIMARY KEY,
            flota VARCHAR(100) NULL DEFAULT '',
            conductor_eventual VARCHAR(150) NULL DEFAULT '',
            conductor_asignado VARCHAR(150) NULL DEFAULT '',
            placa_camion VARCHAR(20) NOT NULL,
            placa_carreta VARCHAR(20) NULL DEFAULT '',
            capacidad_tanque VARCHAR(50) NULL DEFAULT '',
            marca VARCHAR(50) NULL DEFAULT '',
            categoria_conductor VARCHAR(50) NULL DEFAULT '',
            tipo_unidad VARCHAR(100) NULL DEFAULT '',
            estado_conductor VARCHAR(50) NOT NULL DEFAULT 'Disponible',
            estado_unidad VARCHAR(50) NOT NULL DEFAULT 'Disponible',
            ubicacion_manual TEXT NULL,
            observaciones TEXT NULL,
            creado_por VARCHAR(100) NULL DEFAULT '',
            actualizado_por VARCHAR(100) NULL DEFAULT '',
            fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_placa_camion (placa_camion),
            INDEX idx_estado_con (estado_conductor),
            INDEX idx_estado_uni (estado_unidad)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    },
    {
        nombre: 'cat_neumaticos_marcas',
        sql: `CREATE TABLE IF NOT EXISTS cat_neumaticos_marcas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL UNIQUE,
            activo TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    {
        nombre: 'cat_neumaticos_modelos',
        sql: `CREATE TABLE IF NOT EXISTS cat_neumaticos_modelos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL UNIQUE,
            activo TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    {
        nombre: 'cat_neumaticos_medidas',
        sql: `CREATE TABLE IF NOT EXISTS cat_neumaticos_medidas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(50) NOT NULL UNIQUE,
            activo TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    {
        nombre: 'cat_neumaticos_acciones',
        sql: `CREATE TABLE IF NOT EXISTS cat_neumaticos_acciones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(50) NOT NULL UNIQUE,
            activo TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    {
        nombre: 'neumaticos_hoja_vida',
        sql: `CREATE TABLE IF NOT EXISTS neumaticos_hoja_vida (
            id_neumatico VARCHAR(50) PRIMARY KEY,
            codigo_dot VARCHAR(50) NULL,
            marca VARCHAR(100) NOT NULL,
            modelo VARCHAR(100) NOT NULL,
            medida VARCHAR(50) NOT NULL,
            estado VARCHAR(30) DEFAULT 'NUEVA',
            remanente_inicial INT DEFAULT 18,
            remanente_actual DECIMAL(4,1) DEFAULT 18.0,
            costo_compra DECIMAL(10,2) DEFAULT 0.00,
            km_acumulado INT DEFAULT 0,
            placa_actual VARCHAR(20) NULL,
            posicion_actual VARCHAR(10) NULL,
            estado_operativo ENUM('Montada', 'Stock Taller', 'En Rencauche', 'Desecho') DEFAULT 'Stock Taller',
            fecha_instalacion DATE NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_placa (placa_actual),
            INDEX idx_estado (estado_operativo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    {
        nombre: 'neumaticos_inspecciones',
        sql: `CREATE TABLE IF NOT EXISTS neumaticos_inspecciones (
            id_inspeccion VARCHAR(50) PRIMARY KEY,
            id_ot VARCHAR(50) NULL,
            placa VARCHAR(20) NOT NULL,
            fecha_inspeccion DATE NOT NULL,
            km_vehiculo INT NOT NULL DEFAULT 0,
            dias_propuestos INT NOT NULL DEFAULT 30,
            fecha_proxima DATE NULL,
            observaciones TEXT NULL,
            inspector VARCHAR(100) NOT NULL DEFAULT '',
            total_llantas INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_placa (placa),
            INDEX idx_ot (id_ot),
            INDEX idx_fecha (fecha_inspeccion)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    {
        nombre: 'neumaticos_inspecciones_det',
        sql: `CREATE TABLE IF NOT EXISTS neumaticos_inspecciones_det (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_inspeccion VARCHAR(50) NOT NULL,
            id_neumatico VARCHAR(50) NULL,
            posicion VARCHAR(10) NOT NULL,
            marca VARCHAR(100) NOT NULL,
            medida VARCHAR(50) NOT NULL,
            modelo VARCHAR(100) NOT NULL,
            r1 INT NOT NULL,
            r2 INT NOT NULL,
            r3 INT NOT NULL,
            remanente_promedio DECIMAL(4,1) GENERATED ALWAYS AS ((r1 + r2 + r3) / 3.0) STORED,
            presion_ant INT DEFAULT 0,
            presion_actual INT DEFAULT 0,
            estado VARCHAR(30) NOT NULL DEFAULT 'NUEVA',
            accion VARCHAR(50) NOT NULL DEFAULT 'Inspeccion',
            observaciones TEXT NULL,
            alerta_cambio TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_insp (id_inspeccion),
            INDEX idx_pos (posicion)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    {
        nombre: 'neumaticos_rotaciones',
        sql: `CREATE TABLE IF NOT EXISTS neumaticos_rotaciones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_ot VARCHAR(50) NULL,
            placa VARCHAR(20) NOT NULL,
            fecha DATE NOT NULL,
            km_actual INT DEFAULT 0,
            posicion_origen VARCHAR(10) NOT NULL,
            posicion_destino VARCHAR(10) NOT NULL,
            id_neumatico VARCHAR(50) NULL,
            motivo VARCHAR(200) DEFAULT 'Rotación preventiva',
            tecnico VARCHAR(100) NOT NULL DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_placa (placa)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
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
        await promisePool.query("INSERT IGNORE INTO roles (id, nombre, color, permisos_json, es_admin, orden) VALUES (1, 'Administrador', '#5865F2', '{\"admin\":true}', 1, 1)");
        
        // Catálogos semillas predeterminados (INSERT IGNORE garantiza no alterar Marsisa ni datos existentes)
        await promisePool.query("INSERT IGNORE INTO cat_situaciones (id, codigo, descripcion) VALUES (1, 'S01', 'En Espera'), (2, 'S02', 'En Diagnóstico'), (3, 'S03', 'En Reparación'), (4, 'S04', 'Finalizada')");
        await promisePool.query("INSERT IGNORE INTO tipos_mantenimiento (id, tipo_mp, marca, descripcion) VALUES (1, 'MP1', 'TODOS', 'Mantenimiento Preventivo 1'), (2, 'MP2', 'TODOS', 'Mantenimiento Preventivo 2'), (3, 'MP3', 'TODOS', 'Mantenimiento Preventivo 3')");

        // Catálogos Neumáticos - Semillas
        const marcasNeu = [
            'AEOLUS', 'AMBERTONE', 'APLUS', 'ARMORSTEEL', 'AUSTONE', 'AUFINE', 'BLACKLION', 'BRIDGESTONE',
            'CHAOYANG', 'CONTINENTAL', 'DUNLOP', 'DOUBLESTAR', 'DURATURN', 'DYNACARGO', 'FULLRUN', 'GITI',
            'GOODYEAR', 'GOODRIDE', 'GOODTYRE', 'GOLDEN CROWN', 'HANKOOK', 'HILO', 'INFINITY', 'JK TYRE',
            'JINYU', 'KELLY', 'KETER', 'KUMHO', 'KUNLUN', 'LABIGATOR', 'LINGLONG', 'MAISHALL', 'MARSHAL',
            'MAXELL', 'MAXXIS', 'MICHELIN', 'NIPPON', 'PIRELLI', 'PRINX', 'ROADLUX', 'ROYAL BLACK',
            'STEELMARK', 'SUPERHAWK', 'TRIANGLE', 'WESTLAKE', 'WINDPOWER', 'WOSEN', 'YOKOHAMA', 'EVERGREEN', 'ROADMASTER'
        ];
        for (const m of marcasNeu) {
            await promisePool.query("INSERT IGNORE INTO cat_neumaticos_marcas (nombre) VALUES (?)", [m]);
        }

        const medidasNeu = [
            '11R22.5', '235/70R17.5', '235/75R17.5', '245/70R17.5', '245/70R19.5', '245/70R22.5',
            '275/70R22.5', '275/80R22.5', '295/80R22.5', '315/80R22.5', '385/65R22.5', '425/65R22.5',
            '445/65R22.5', '9.5R17.5'
        ];
        for (const med of medidasNeu) {
            await promisePool.query("INSERT IGNORE INTO cat_neumaticos_medidas (nombre) VALUES (?)", [med]);
        }

        const accionesNeu = ['Inspeccion', 'Reparacion', 'Cambio', 'Instalacion', 'Rotacion'];
        for (const ac of accionesNeu) {
            await promisePool.query("INSERT IGNORE INTO cat_neumaticos_acciones (nombre) VALUES (?)", [ac]);
        }

        const modelosNeu = [
            '10558', '17', '366', '785', 'AAR603', 'ACEL2', 'AD153', 'ADR35', 'ADR6', 'ADR8', 'AEL2', 'AEL5',
            'AF177', 'AG510', 'AGD', 'AGD5', 'AH+', 'AHS', 'AHT', 'AMS', 'AT115A', 'AT121', 'AT161', 'AT27',
            'AT605', 'AZ126', 'AZ171', 'BA226', 'BAR26', 'BT165', 'C901', 'CITY Y999', 'COUCH GRIP', 'CR960',
            'CR976A', 'CRUNCH GRIP', 'CST27', 'D200', 'DR919', 'DSR266', 'DUD100', 'E BUS', 'EZ334', 'F820',
            'FFH123', 'FR01', 'FR88', 'G658', 'GAC812', 'GAR820', 'GAU867', 'GAU867A', 'GDR1', 'GDR665', 'GITI',
            'GL283A', 'GSR1', 'GSR225', 'GSRI', 'GT198', 'GT867', 'GU01', 'HAI', 'HA1', 'HCT', 'HD', 'HD3',
            'HH301', 'HKS78', 'HK578', 'HN266', 'HT3', 'HTC', 'HYD', 'IFL866', 'JDH6', 'JDM6', 'JF568', 'JOH6',
            'JTM1', 'JU558', 'JUH5', 'JULL1', 'JUM', 'K5461', 'KMA01', 'KMAX', 'KMAX D', 'KMAX S', 'KMAX5',
            'KMAXD', 'KMAX D200', 'KMAX D210', 'KMAX S210', 'KRA01', 'KRA11', 'KRA50', 'KRD50', 'KS461', 'KS481',
            'KT', 'KT511', 'KT512', 'KT522', 'LLA38', 'LLF01', 'LLFO', 'LUFO1', 'M5A', 'M840', 'M940', 'MC45',
            'MIX716', 'MSA2', 'MY507A', 'MYSO7', 'NUEVA', 'PROGUO1', 'R152', 'R605', 'RE', 'REE', 'REGIONAL RHZ',
            'RENCAUCHADA', 'RHS', 'RS201', 'RT605', 'RY023', 'S210', 'SAH02', 'SC216', 'SP580', 'SUPER HA1',
            'T605', 'TB888', 'TE', 'TH22', 'TR01', 'TR656', 'TR658', 'TR668', 'TR685', 'TR689', 'TRS', 'TRS02',
            'V1111', 'WGC28', 'WS', 'WS778', 'WS788', 'WS806', 'XLINE', 'XMULTI', 'Y115', 'Y126', 'Y201', 'Y209',
            'Y631', 'Y99', 'Y999', 'EAU91', 'TR605', 'RM230HH', 'MSS2'
        ];
        for (const mod of modelosNeu) {
            await promisePool.query("INSERT IGNORE INTO cat_neumaticos_modelos (nombre) VALUES (?)", [mod]);
        }

        // Migraciones de columnas en cat_rampas y usuarios para instalaciones existentes
        try { await promisePool.query("ALTER TABLE cat_rampas ADD COLUMN orden INT NOT NULL DEFAULT 0"); } catch(e) {}
        try { await promisePool.query("UPDATE cat_rampas SET orden=id WHERE orden=0"); } catch(e) {}

        const colsUsuarios = ['telefono VARCHAR(50) NULL', 'avatar_url TEXT NULL', 'banner_url TEXT NULL', 'firma_digital LONGTEXT NULL', 'preferencias_json LONGTEXT NULL'];
        for (const colDef of colsUsuarios) {
            try { await promisePool.query(`ALTER TABLE usuarios ADD COLUMN ${colDef}`); } catch(e) {}
        }
        console.log(`✅ Default configurations, catalogs and roles seeded`);
    } catch (err) {
        console.error(`❌ Error seeding configurations:`, err.message);
    }
}

module.exports = { initDB };
