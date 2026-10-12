-- Migración inicial: el esquema de las bases de empresa tal como estaba el 2026-10-12 (ya igualado).
-- En las empresas existentes se marca como aplicada (prisma migrate resolve --applied 0_baseline);
-- en una empresa nueva crea todas las tablas.
-- Completada con scripts/prisma_baseline.js: 43 columnas ON UPDATE CURRENT_TIMESTAMP y 1 calculadas.

-- CreateTable
CREATE TABLE `almacen_almacenes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `es_sistema` BOOLEAN NOT NULL DEFAULT false,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `nombre`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `almacen_familias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `descripcion` VARCHAR(200) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `nombre`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `almacen_marcas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `descripcion` VARCHAR(200) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `nombre`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `almacen_sistemas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `sub_sistemas` JSON NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `nombre`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `almacen_unidades` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(20) NOT NULL,
    `descripcion` VARCHAR(200) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `nombre`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracion_almacen` (
    `clave` VARCHAR(50) NOT NULL,
    `valor` VARCHAR(500) NOT NULL DEFAULT '',
    `descripcion` VARCHAR(200) NULL,

    PRIMARY KEY (`clave`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detalle_entradas_inv` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entrada_id` VARCHAR(20) NOT NULL,
    `inventario_id` VARCHAR(20) NOT NULL,
    `descripcion` VARCHAR(400) NULL,
    `cantidad` DECIMAL(14, 4) NOT NULL,
    `costo_unitario` DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    `moneda` ENUM('PEN', 'USD') NOT NULL DEFAULT 'PEN',
    `importe` DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_entrada`(`entrada_id`),
    INDEX `idx_item`(`inventario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detalle_salidas_inv` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `salida_id` VARCHAR(20) NOT NULL,
    `inventario_id` VARCHAR(20) NULL,
    `descripcion` VARCHAR(400) NULL,
    `cantidad` DECIMAL(14, 4) NOT NULL,
    `costo_unitario` DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    `moneda` ENUM('PEN', 'USD') NOT NULL DEFAULT 'PEN',
    `importe` DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_item`(`inventario_id`),
    INDEX `idx_salida`(`salida_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `entradas_inv` (
    `id` VARCHAR(20) NOT NULL,
    `fecha` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `proveedor_id` VARCHAR(20) NULL,
    `proveedor_nombre` VARCHAR(200) NULL,
    `documento_referencia` VARCHAR(100) NULL,
    `moneda` ENUM('PEN', 'USD') NOT NULL DEFAULT 'PEN',
    `tipo_cambio` DECIMAL(8, 4) NULL,
    `total_pen` DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    `observaciones` TEXT NULL,
    `tipo_igv` VARCHAR(20) NULL DEFAULT 'sin_igv',
    `creado_por` VARCHAR(100) NULL,
    `aprobado_por` VARCHAR(150) NULL DEFAULT 'Dirección / Gerencia',
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `estado` VARCHAR(50) NULL,
    `motivo_anulacion` VARCHAR(255) NULL,
    `url_voucher` TEXT NULL,
    `url_cotizacion` TEXT NULL,
    `url_factura` TEXT NULL,
    `motivo_entrada` VARCHAR(255) NULL,
    `placa` VARCHAR(50) NULL,
    `tipo_orden` VARCHAR(50) NULL DEFAULT 'Orden de compra',
    `condicion_pago` VARCHAR(50) NULL DEFAULT 'Al contado',
    `dias_credito` INTEGER NULL DEFAULT 30,
    `ot_id` VARCHAR(50) NULL,
    `numero_correlativo` VARCHAR(50) NULL,
    `serie` VARCHAR(20) NULL,
    `dias_pagar` INTEGER NULL DEFAULT 0,
    `prioridad` VARCHAR(30) NULL DEFAULT 'Normal',
    `cuenta_bancaria_proveedor` VARCHAR(150) NULL,
    `cuenta_bancaria_empresa` VARCHAR(150) NULL,
    `solicitante` VARCHAR(150) NULL,
    `estado_factura` VARCHAR(50) NULL DEFAULT 'Pendiente',
    `numero_operacion` VARCHAR(100) NULL,
    `fecha_pago` DATETIME(0) NULL,
    `pagado_por` VARCHAR(150) NULL,
    `fecha_aprobacion` DATETIME(0) NULL,
    `centro_costo` VARCHAR(50) NULL,
    `sub_motivo` VARCHAR(100) NULL,
    `autoriza` VARCHAR(150) NULL,

    INDEX `idx_fecha`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventario` (
    `id` VARCHAR(20) NOT NULL,
    `descripcion` VARCHAR(400) NOT NULL,
    `familia` VARCHAR(100) NULL,
    `sub_familia` VARCHAR(100) NULL,
    `almacen` VARCHAR(100) NULL,
    `unidad` VARCHAR(30) NULL,
    `moneda` ENUM('PEN', 'USD') NOT NULL DEFAULT 'PEN',
    `costo_referencial` DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    `costo_soles` DECIMAL(14, 4) NULL,
    `tipo_cambio` DECIMAL(10, 4) NULL,
    `stock_regularizado` DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    `fecha_regularizacion` DATETIME(0) NULL,
    `proveedor_id` VARCHAR(20) NULL,
    `marca` VARCHAR(100) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `observaciones` TEXT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `codigo_item` VARCHAR(100) NULL,
    `marca_unidad` TEXT NULL,
    `sistema` VARCHAR(100) NULL,
    `sub_sistema` VARCHAR(100) NULL,
    `tipo` VARCHAR(50) NULL,
    `sub_tipo` ENUM('Nuevo', 'Reparado') NULL,
    `ubicacion` VARCHAR(150) NULL,
    `anaquel` VARCHAR(50) NULL,
    `stock_min` DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    `stock_max` DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    `estado_art` VARCHAR(50) NULL DEFAULT 'Activo',
    `codigo_barras` VARCHAR(100) NULL,
    `imagen_url` TEXT NULL,
    `articulo` VARCHAR(300) NULL,
    `codigo_articulo` VARCHAR(100) NULL,

    INDEX `idx_activo`(`activo`),
    INDEX `idx_almacen`(`almacen`),
    INDEX `idx_familia`(`familia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `proveedor_cuentas_bancarias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proveedor_id` VARCHAR(20) NOT NULL,
    `banco` VARCHAR(100) NOT NULL,
    `tipo_cuenta` ENUM('CUENTA CORRIENTE', 'CUENTA DE AHORROS', 'CUENTA REMUNERADA') NOT NULL,
    `numero_cuenta` VARCHAR(100) NOT NULL,
    `detraccion` BOOLEAN NULL DEFAULT false,
    `estado` BOOLEAN NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `moneda` VARCHAR(20) NULL DEFAULT 'SOLES',

    INDEX `idx_prov_cuenta`(`proveedor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `proveedor_marcas_inv` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proveedor_id` VARCHAR(20) NOT NULL,
    `marca` VARCHAR(100) NOT NULL,

    INDEX `idx_prov`(`proveedor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `proveedores_inv` (
    `id` VARCHAR(20) NOT NULL,
    `nombre` VARCHAR(200) NOT NULL,
    `razon_social` VARCHAR(200) NULL,
    `tipo_documento` ENUM('RUC', 'DNI', 'CE', 'Otro') NULL DEFAULT 'RUC',
    `numero_documento` VARCHAR(20) NULL,
    `telefono` VARCHAR(30) NULL,
    `email` VARCHAR(150) NULL,
    `direccion` TEXT NULL,
    `estado` ENUM('Activo', 'Inactivo') NULL DEFAULT 'Activo',
    `observaciones` TEXT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `salidas_inv` (
    `id` VARCHAR(20) NOT NULL,
    `fecha` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `tipo_destino` VARCHAR(50) NOT NULL,
    `placa` VARCHAR(100) NULL,
    `responsable` VARCHAR(150) NULL,
    `responsable_id` INTEGER NULL,
    `moneda` ENUM('PEN', 'USD') NOT NULL DEFAULT 'PEN',
    `tipo_cambio` DECIMAL(8, 4) NULL,
    `total_pen` DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    `observaciones` TEXT NULL,
    `creado_por` VARCHAR(100) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ticket_ot` VARCHAR(30) NULL,
    `estado` VARCHAR(20) NOT NULL DEFAULT 'Despachado',
    `motivo_anulacion` VARCHAR(255) NULL,
    `tipo_orden` VARCHAR(60) NOT NULL DEFAULT 'Orden de Salida',

    INDEX `idx_fecha`(`fecha`),
    INDEX `idx_placa`(`placa`),
    INDEX `idx_ticket_ot`(`ticket_ot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `combustible_auditoria_viajes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `modulo` VARCHAR(30) NOT NULL DEFAULT 'operaciones',
    `viaje` VARCHAR(60) NOT NULL,
    `estado_auditoria` VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
    `observacion` TEXT NULL,
    `usuario` VARCHAR(100) NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_viaje`(`viaje`),
    UNIQUE INDEX `uk_modulo_viaje`(`modulo`, `viaje`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `combustible_estaciones_proveedores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proveedor_razon_social` VARCHAR(200) NOT NULL,
    `proveedor_ruc` VARCHAR(20) NULL,
    `estaciones_nombres` TEXT NOT NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_prov_rs`(`proveedor_razon_social`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `combustible_matriz_d2` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sentido` VARCHAR(20) NOT NULL DEFAULT 'IDA',
    `ruta` VARCHAR(150) NOT NULL,
    `motor` VARCHAR(50) NOT NULL DEFAULT 'MC11.44',
    `confg` VARCHAR(20) NOT NULL DEFAULT 'T3',
    `km_0` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `km_5` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `km_10` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `km_15` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `km_20` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `km_25` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `km_30` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `km` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `estado` VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_motor_confg`(`motor`, `confg`),
    INDEX `idx_ruta`(`ruta`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `combustible_vales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATETIME(0) NOT NULL,
    `estado` VARCHAR(30) NOT NULL DEFAULT 'VÁLIDO',
    `correlativo` VARCHAR(50) NOT NULL DEFAULT '',
    `estado_pago` VARCHAR(30) NOT NULL DEFAULT 'NO PAGADO',
    `viaje` VARCHAR(50) NOT NULL DEFAULT '',
    `caja` VARCHAR(50) NOT NULL DEFAULT '',
    `estado_caja` VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
    `clase_vehiculo` VARCHAR(50) NOT NULL DEFAULT 'TRACTO',
    `vehiculo` VARCHAR(20) NOT NULL DEFAULT '',
    `conductor` VARCHAR(150) NOT NULL DEFAULT '',
    `ruta` VARCHAR(255) NOT NULL DEFAULT '',
    `departamento` VARCHAR(80) NOT NULL DEFAULT '',
    `provincia` VARCHAR(80) NOT NULL DEFAULT '',
    `distrito` VARCHAR(80) NOT NULL DEFAULT '',
    `estacion` VARCHAR(150) NOT NULL DEFAULT '',
    `tipo_combustible` VARCHAR(50) NOT NULL DEFAULT 'D2',
    `proveedor` VARCHAR(200) NOT NULL DEFAULT '',
    `ruc` VARCHAR(20) NOT NULL DEFAULT '',
    `kilometraje` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `peso_tn` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `galones` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `costo_gl` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `tipo_pago` VARCHAR(50) NOT NULL DEFAULT 'ANTICIPO',
    `dias_credito` INTEGER NOT NULL DEFAULT 0,
    `moneda` VARCHAR(20) NOT NULL DEFAULT 'SOLES',
    `importe` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `numero_comprobante` VARCHAR(50) NOT NULL DEFAULT '',
    `tipo_cambio` DECIMAL(8, 4) NULL,
    `archivo_url` VARCHAR(255) NULL,
    `observacion` TEXT NULL,
    `tipo` VARCHAR(80) NOT NULL DEFAULT 'RECARGA VUELTA',
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `id_remoto` INTEGER NULL,
    `vehiculo_marca` VARCHAR(100) NULL,
    `vehiculo_modelo` VARCHAR(100) NULL,

    INDEX `idx_correlativo`(`correlativo`),
    INDEX `idx_estado`(`estado`),
    INDEX `idx_fecha`(`fecha`),
    INDEX `idx_fecha_estado`(`fecha`, `estado`),
    INDEX `idx_vehiculo`(`vehiculo`),
    INDEX `idx_vehiculo_fecha_viaje`(`vehiculo`, `fecha`, `viaje`),
    INDEX `idx_viaje`(`viaje`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `marsisa_combustible_vales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATETIME(0) NOT NULL,
    `estado` VARCHAR(30) NOT NULL DEFAULT 'VÁLIDO',
    `correlativo` VARCHAR(50) NOT NULL DEFAULT '',
    `estado_pago` VARCHAR(30) NOT NULL DEFAULT 'NO PAGADO',
    `viaje` VARCHAR(50) NOT NULL DEFAULT '',
    `caja` VARCHAR(50) NOT NULL DEFAULT '',
    `estado_caja` VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
    `clase_vehiculo` VARCHAR(50) NOT NULL DEFAULT 'TRACTO',
    `vehiculo` VARCHAR(20) NOT NULL DEFAULT '',
    `conductor` VARCHAR(150) NOT NULL DEFAULT '',
    `ruta` VARCHAR(255) NOT NULL DEFAULT '',
    `departamento` VARCHAR(80) NOT NULL DEFAULT '',
    `provincia` VARCHAR(80) NOT NULL DEFAULT '',
    `distrito` VARCHAR(80) NOT NULL DEFAULT '',
    `estacion` VARCHAR(150) NOT NULL DEFAULT '',
    `tipo_combustible` VARCHAR(50) NOT NULL DEFAULT 'D2',
    `proveedor` VARCHAR(200) NOT NULL DEFAULT '',
    `ruc` VARCHAR(20) NOT NULL DEFAULT '',
    `kilometraje` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `peso_tn` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `galones` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `costo_gl` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `tipo_pago` VARCHAR(50) NOT NULL DEFAULT 'ANTICIPO',
    `dias_credito` INTEGER NOT NULL DEFAULT 0,
    `moneda` VARCHAR(20) NOT NULL DEFAULT 'SOLES',
    `importe` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `numero_comprobante` VARCHAR(50) NOT NULL DEFAULT '',
    `tipo_cambio` DECIMAL(8, 4) NULL,
    `archivo_url` VARCHAR(255) NULL,
    `observacion` TEXT NULL,
    `tipo` VARCHAR(80) NOT NULL DEFAULT 'RECARGA VUELTA',
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `id_remoto` INTEGER NULL,
    `vehiculo_marca` VARCHAR(100) NULL,
    `vehiculo_modelo` VARCHAR(100) NULL,

    INDEX `idx_correlativo`(`correlativo`),
    INDEX `idx_estado`(`estado`),
    INDEX `idx_fecha`(`fecha`),
    INDEX `idx_fecha_estado`(`fecha`, `estado`),
    INDEX `idx_vehiculo`(`vehiculo`),
    INDEX `idx_vehiculo_fecha_viaje`(`vehiculo`, `fecha`, `viaje`),
    INDEX `idx_viaje`(`viaje`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operaciones_combustible_vales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATETIME(0) NOT NULL,
    `estado` VARCHAR(30) NOT NULL DEFAULT 'VÁLIDO',
    `correlativo` VARCHAR(50) NOT NULL DEFAULT '',
    `estado_pago` VARCHAR(30) NOT NULL DEFAULT 'NO PAGADO',
    `viaje` VARCHAR(50) NOT NULL DEFAULT '',
    `caja` VARCHAR(50) NOT NULL DEFAULT '',
    `estado_caja` VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
    `clase_vehiculo` VARCHAR(50) NOT NULL DEFAULT 'TRACTO',
    `vehiculo` VARCHAR(20) NOT NULL DEFAULT '',
    `conductor` VARCHAR(150) NOT NULL DEFAULT '',
    `ruta` VARCHAR(255) NOT NULL DEFAULT '',
    `departamento` VARCHAR(80) NOT NULL DEFAULT '',
    `provincia` VARCHAR(80) NOT NULL DEFAULT '',
    `distrito` VARCHAR(80) NOT NULL DEFAULT '',
    `estacion` VARCHAR(150) NOT NULL DEFAULT '',
    `tipo_combustible` VARCHAR(50) NOT NULL DEFAULT 'D2',
    `proveedor` VARCHAR(200) NOT NULL DEFAULT '',
    `ruc` VARCHAR(20) NOT NULL DEFAULT '',
    `kilometraje` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `peso_tn` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `galones` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `costo_gl` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `tipo_pago` VARCHAR(50) NOT NULL DEFAULT 'ANTICIPO',
    `dias_credito` INTEGER NOT NULL DEFAULT 0,
    `moneda` VARCHAR(20) NOT NULL DEFAULT 'SOLES',
    `importe` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `numero_comprobante` VARCHAR(50) NOT NULL DEFAULT '',
    `tipo_cambio` DECIMAL(8, 4) NULL,
    `archivo_url` VARCHAR(255) NULL,
    `observacion` TEXT NULL,
    `tipo` VARCHAR(80) NOT NULL DEFAULT 'RECARGA VUELTA',
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `id_remoto` INTEGER NULL,
    `vehiculo_marca` VARCHAR(100) NULL,
    `vehiculo_modelo` VARCHAR(100) NULL,

    INDEX `idx_correlativo`(`correlativo`),
    INDEX `idx_estado`(`estado`),
    INDEX `idx_fecha`(`fecha`),
    INDEX `idx_fecha_estado`(`fecha`, `estado`),
    INDEX `idx_vehiculo`(`vehiculo`),
    INDEX `idx_vehiculo_fecha_viaje`(`vehiculo`, `fecha`, `viaje`),
    INDEX `idx_viaje`(`viaje`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detalle_recepciones_oc` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recepcion_id` INTEGER NOT NULL,
    `oc_id` VARCHAR(50) NOT NULL,
    `inventario_id` VARCHAR(20) NULL,
    `descripcion` VARCHAR(400) NULL,
    `cantidad_recibida` DECIMAL(14, 4) NOT NULL,
    `costo_unitario` DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
    `moneda` VARCHAR(10) NOT NULL DEFAULT 'PEN',
    `almacen` VARCHAR(100) NULL DEFAULT 'ALM CENTRAL',

    INDEX `idx_drec_item`(`inventario_id`),
    INDEX `idx_drec_oc`(`oc_id`),
    INDEX `idx_drec_rec`(`recepcion_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `oc_approval_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orden_compra_id` INTEGER NOT NULL,
    `token` VARCHAR(128) NOT NULL,
    `aprobador_telefono` VARCHAR(20) NOT NULL,
    `aprobador_nombre` VARCHAR(100) NULL,
    `estado` ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO') NULL DEFAULT 'PENDIENTE',
    `motivo_rechazo` TEXT NULL,
    `expira_en` DATETIME(0) NOT NULL,
    `usado_en` DATETIME(0) NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `token`(`token`),
    INDEX `idx_token_estado`(`estado`),
    INDEX `orden_compra_id`(`orden_compra_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ordenes_compra` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(50) NOT NULL,
    `proveedor_nombre` VARCHAR(200) NOT NULL,
    `proveedor_ruc` VARCHAR(20) NULL,
    `monto_total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `moneda` VARCHAR(10) NOT NULL DEFAULT 'PEN',
    `motivo_solicitud` TEXT NULL,
    `sustento_cotizacion_url` TEXT NULL,
    `estado` ENUM('BORRADOR', 'PENDIENTE_APROBACION', 'APROBADA', 'RECHAZADA', 'RECIBIDA') NULL DEFAULT 'PENDIENTE_APROBACION',
    `motivo_rechazo` TEXT NULL,
    `aprobado_por` VARCHAR(100) NULL,
    `aprobado_en` DATETIME(0) NULL,
    `solicitado_por` VARCHAR(100) NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `codigo`(`codigo`),
    INDEX `idx_oc_estado`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ordenes_compra_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orden_compra_id` INTEGER NOT NULL,
    `descripcion` TEXT NOT NULL,
    `cantidad` DECIMAL(12, 2) NOT NULL DEFAULT 1.00,
    `unidad_medida` VARCHAR(20) NULL DEFAULT 'UND',
    `precio_unitario` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_items_oc_id`(`orden_compra_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recepciones_oc` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `oc_id` VARCHAR(50) NOT NULL,
    `fecha_recepcion` DATETIME(0) NOT NULL,
    `usuario` VARCHAR(150) NULL,
    `almacen` VARCHAR(100) NULL DEFAULT 'ALM CENTRAL',
    `sustento_url` TEXT NULL,
    `observacion` TEXT NULL,
    `tipo_recepcion` ENUM('PARCIAL', 'TOTAL') NOT NULL DEFAULT 'TOTAL',
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_rec_fecha`(`fecha_recepcion`),
    INDEX `idx_rec_oc`(`oc_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ruc_dni` VARCHAR(50) NULL,
    `razon_social` VARCHAR(255) NOT NULL,
    `direccion` TEXT NULL,
    `telefono` VARCHAR(50) NULL,
    `email` VARCHAR(100) NULL,
    `estado` VARCHAR(20) NULL DEFAULT 'Activo',
    `notas` TEXT NULL,
    `fecha_creacion` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_razon`(`razon_social`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conductores` (
    `idConductor` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL DEFAULT '',
    `empresa` VARCHAR(100) NOT NULL DEFAULT '',
    `telefono` VARCHAR(20) NOT NULL DEFAULT '',
    `dni` VARCHAR(20) NOT NULL DEFAULT '',
    `licencia` VARCHAR(50) NOT NULL DEFAULT '',
    `estado` VARCHAR(20) NOT NULL DEFAULT 'Activo',
    `foto` TEXT NULL,

    PRIMARY KEY (`idConductor`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_situaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(20) NOT NULL,
    `descripcion` VARCHAR(100) NOT NULL,

    UNIQUE INDEX `codigo`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracion_flota` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `marca` VARCHAR(50) NOT NULL,
    `uts_categoria` VARCHAR(20) NOT NULL,
    `km_mensuales` INTEGER NOT NULL DEFAULT 0,
    `dias_operativos` INTEGER NOT NULL DEFAULT 26,
    `mp1_intervalo_km` INTEGER NOT NULL DEFAULT 5000,
    `mp2_intervalo_km` INTEGER NOT NULL DEFAULT 10000,
    `mp3_intervalo_km` INTEGER NOT NULL DEFAULT 20000,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `observaciones` TEXT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_marca_uts`(`marca`, `uts_categoria`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documentos_flota` (
    `id` VARCHAR(50) NOT NULL,
    `placa` VARCHAR(50) NOT NULL,
    `tipo_documento` VARCHAR(100) NOT NULL,
    `entidad` VARCHAR(100) NULL,
    `nro_constancia` VARCHAR(100) NULL,
    `fecha_emision` DATE NULL,
    `fecha_vencimiento` DATE NULL,
    `pago` VARCHAR(50) NULL,
    `asesor` VARCHAR(100) NULL,
    `observaciones` TEXT NULL,
    `usuario` VARCHAR(100) NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `flota_disponibilidad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `flota` VARCHAR(100) NULL DEFAULT '',
    `conductor_eventual` VARCHAR(150) NULL DEFAULT '',
    `conductor_asignado` VARCHAR(150) NULL DEFAULT '',
    `placa_camion` VARCHAR(50) NULL DEFAULT '',
    `placa_carreta` VARCHAR(20) NULL DEFAULT '',
    `capacidad_tanque` VARCHAR(50) NULL DEFAULT '',
    `marca` VARCHAR(50) NULL DEFAULT '',
    `categoria_conductor` VARCHAR(50) NULL DEFAULT '',
    `tipo_unidad` VARCHAR(100) NULL DEFAULT '',
    `estado_conductor` VARCHAR(50) NOT NULL DEFAULT 'Disponible',
    `estado_unidad` VARCHAR(50) NOT NULL DEFAULT 'Disponible',
    `ubicacion_manual` TEXT NULL,
    `observaciones` TEXT NULL,
    `creado_por` VARCHAR(100) NULL DEFAULT '',
    `actualizado_por` VARCHAR(100) NULL DEFAULT '',
    `fecha_creacion` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `fecha_actualizacion` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_estado_con`(`estado_conductor`),
    INDEX `idx_estado_uni`(`estado_unidad`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `km_snapshots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `placa` VARCHAR(100) NULL,
    `fecha` DATE NOT NULL,
    `km_gps` INTEGER NOT NULL DEFAULT 0,
    `horas_motor` DECIMAL(10, 1) NOT NULL DEFAULT 0.0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_fecha`(`fecha`),
    INDEX `idx_placa`(`placa`),
    UNIQUE INDEX `uq_placa_fecha`(`placa`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `placa_auditoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `placa` VARCHAR(100) NULL,
    `campo` VARCHAR(60) NOT NULL,
    `valor_ant` TEXT NULL,
    `valor_nuevo` TEXT NULL,
    `usuario` VARCHAR(150) NULL,
    `ip` VARCHAR(80) NULL,
    `fecha` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_fecha`(`fecha`),
    INDEX `idx_placa`(`placa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `placas` (
    `placa` VARCHAR(100) NOT NULL,
    `cliente` VARCHAR(100) NOT NULL DEFAULT '',
    `ruc_dni` VARCHAR(20) NOT NULL DEFAULT '',
    `marca` VARCHAR(50) NOT NULL DEFAULT '',
    `modelo_uts` VARCHAR(100) NOT NULL DEFAULT '',
    `tipo` VARCHAR(50) NOT NULL DEFAULT '',
    `sub_tipo` VARCHAR(50) NOT NULL DEFAULT '',
    `color` VARCHAR(30) NOT NULL DEFAULT '',
    `nro_motor` VARCHAR(50) NOT NULL DEFAULT '',
    `nro_caja` VARCHAR(50) NOT NULL DEFAULT '',
    `nro_corona` VARCHAR(50) NOT NULL DEFAULT '',
    `nro_vin` VARCHAR(50) NOT NULL DEFAULT '',
    `configuracion` VARCHAR(50) NOT NULL DEFAULT '',
    `anio` VARCHAR(10) NOT NULL DEFAULT '',
    `combustible` VARCHAR(30) NOT NULL DEFAULT '',
    `carga_util` VARCHAR(20) NOT NULL DEFAULT '',
    `peso_neto` VARCHAR(20) NOT NULL DEFAULT '',
    `peso_bruto` VARCHAR(20) NOT NULL DEFAULT '',
    `estado` VARCHAR(20) NOT NULL DEFAULT 'Activa',
    `uts` VARCHAR(20) NOT NULL DEFAULT '',
    `motora` VARCHAR(10) NOT NULL DEFAULT '',
    `llantas` VARCHAR(10) NOT NULL DEFAULT '',
    `en_uso` VARCHAR(10) NOT NULL DEFAULT '',
    `metrica` VARCHAR(10) NOT NULL DEFAULT 'km',
    `wialon_name` VARCHAR(100) NULL,
    `tanque_1` VARCHAR(20) NOT NULL DEFAULT '',
    `tanque_2` VARCHAR(20) NOT NULL DEFAULT '',
    `tanque_3` VARCHAR(20) NOT NULL DEFAULT '',
    `capacidad_tanque` VARCHAR(20) NOT NULL DEFAULT '',
    `tara` VARCHAR(20) NOT NULL DEFAULT '',
    `modelo_motor` VARCHAR(100) NULL,

    PRIMARY KEY (`placa`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `status_flota` (
    `idRegistro` VARCHAR(50) NOT NULL,
    `fecha` DATE NULL,
    `corte` VARCHAR(30) NOT NULL DEFAULT '',
    `unidad_motora` VARCHAR(20) NOT NULL DEFAULT '',
    `unidad_no_motora` VARCHAR(20) NOT NULL DEFAULT '',
    `cliente_motora` VARCHAR(100) NOT NULL DEFAULT '',
    `cliente_nomotora` VARCHAR(100) NOT NULL DEFAULT '',
    `zona` VARCHAR(50) NOT NULL DEFAULT '',
    `conductor` VARCHAR(100) NOT NULL DEFAULT '',
    `estado` VARCHAR(30) NOT NULL DEFAULT '',
    `observaciones` TEXT NULL,
    `usuario` VARCHAR(150) NOT NULL DEFAULT '',

    INDEX `idx_fecha`(`fecha`),
    INDEX `idx_motora`(`unidad_motora`),
    INDEX `idx_nomotora`(`unidad_no_motora`),
    PRIMARY KEY (`idRegistro`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehiculos_flota` (
    `placa` VARCHAR(10) NOT NULL,
    `tipo` VARCHAR(50) NULL,
    `propiedad` VARCHAR(50) NULL DEFAULT 'PROPIA',
    `empresa` VARCHAR(100) NULL DEFAULT 'MARSISA',
    `fecha_entrega` DATE NULL,
    `anio` INTEGER NULL,
    `marca` VARCHAR(50) NULL,
    `modelo` VARCHAR(50) NULL,
    `color` VARCHAR(50) NULL,
    `chasis` VARCHAR(100) NULL,
    `tc_vencimiento` DATE NULL,
    `tc_constancia` VARCHAR(50) NULL,
    `soat_entidad` VARCHAR(50) NULL,
    `soat_pago` DECIMAL(10, 2) NULL,
    `soat_vencimiento` DATE NULL,
    `matpel_constancia` VARCHAR(50) NULL,
    `matpel_vencimiento` DATE NULL,
    `rt_emision` DATE NULL,
    `rt_vencimiento` DATE NULL,
    `boni_emision` DATE NULL,
    `boni_vencimiento` DATE NULL,
    `sv_entidad` VARCHAR(50) NULL,
    `sv_asesor` VARCHAR(100) NULL,
    `sv_vencimiento` DATE NULL,
    `sc_entidad` VARCHAR(50) NULL,
    `sc_asesor` VARCHAR(100) NULL,
    `sc_vencimiento` DATE NULL,
    `fum_emision` DATE NULL,
    `fum_vencimiento` DATE NULL,
    `ext_emision` DATE NULL,
    `ext_vencimiento` DATE NULL,
    `ext_cantidad` INTEGER NULL DEFAULT 1,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `tc_url` VARCHAR(255) NULL,
    `soat_url` VARCHAR(255) NULL,
    `matpel_url` VARCHAR(255) NULL,
    `rt_url` VARCHAR(255) NULL,
    `boni_url` VARCHAR(255) NULL,
    `sv_url` VARCHAR(255) NULL,
    `sc_url` VARCHAR(255) NULL,
    `fum_url` VARCHAR(255) NULL,
    `ext_url` VARCHAR(255) NULL,
    `wialon_name` VARCHAR(100) NULL,

    PRIMARY KEY (`placa`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guias_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guia_tipo` ENUM('GRE', 'GRT') NOT NULL,
    `guia_id` INTEGER NOT NULL,
    `item_numero` INTEGER NULL DEFAULT 1,
    `codigo` VARCHAR(50) NULL,
    `descripcion` TEXT NOT NULL,
    `cantidad` DECIMAL(12, 2) NULL DEFAULT 1.00,
    `unidad_medida` VARCHAR(20) NULL DEFAULT 'NIU',
    `peso_unitario` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_guia`(`guia_tipo`, `guia_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guias_remision` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `numero_guia` VARCHAR(30) NOT NULL,
    `tipo_documento` VARCHAR(10) NULL DEFAULT '31',
    `fecha_emision` DATE NULL,
    `fecha_traslado` DATE NULL,
    `remitente_ruc` VARCHAR(20) NULL,
    `remitente_razon_social` VARCHAR(255) NULL,
    `destinatario_ruc` VARCHAR(20) NULL,
    `destinatario_razon_social` VARCHAR(255) NULL,
    `punto_partida_direccion` TEXT NULL,
    `punto_partida_ubigeo` VARCHAR(10) NULL,
    `punto_llegada_direccion` TEXT NULL,
    `punto_llegada_ubigeo` VARCHAR(10) NULL,
    `placa_tracto` VARCHAR(20) NULL,
    `placa_carreta` VARCHAR(20) NULL,
    `conductor_tipo_doc` VARCHAR(10) NULL DEFAULT 'DNI',
    `conductor_num_doc` VARCHAR(20) NULL,
    `conductor_nombre` VARCHAR(200) NULL,
    `conductor_licencia` VARCHAR(30) NULL,
    `peso_bruto_total` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `unidad_medida` VARCHAR(10) NULL DEFAULT 'KGM',
    `estado_sunat` VARCHAR(50) NULL DEFAULT 'ACEPTADO',
    `codigo_respuesta_sunat` VARCHAR(20) NULL DEFAULT '0',
    `observaciones_sunat` TEXT NULL,
    `datos_json` LONGTEXT NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `gre_relacionada_id` INTEGER NULL,
    `gre_relacionada_numero` VARCHAR(30) NULL,
    `num_ticket` VARCHAR(50) NULL,
    `xml_hash` VARCHAR(100) NULL,
    `modo_emision` VARCHAR(20) NULL DEFAULT 'SIMULACION',
    `motivo_traslado` VARCHAR(10) NULL DEFAULT '01',
    `hora_emision` VARCHAR(20) NULL,
    `fecha_cdr` DATETIME(0) NULL,
    `hora_cdr` VARCHAR(20) NULL,
    `descripcion_motivo` VARCHAR(255) NULL,
    `modalidad_traslado` VARCHAR(50) NULL DEFAULT 'Público',
    `indicador_transbordo` BOOLEAN NULL DEFAULT false,
    `indicador_retorno_vacio` BOOLEAN NULL DEFAULT false,
    `indicador_m1_l` BOOLEAN NULL DEFAULT false,
    `transportista_ruc` VARCHAR(20) NULL,
    `transportista_razon_social` VARCHAR(255) NULL,
    `registro_mtc` VARCHAR(50) NULL,
    `volumen_m3` DECIMAL(12, 3) NULL,
    `xml_contenido` LONGTEXT NULL,
    `orden_servicio` VARCHAR(60) NULL,
    `orden_viaje` VARCHAR(60) NULL,
    `foto_evidencia` LONGTEXT NULL,
    `fecha_entrega` DATE NULL,
    `numero_transporte` VARCHAR(50) NULL,
    `apisunat_document_id` VARCHAR(60) NULL,
    `xml_url` TEXT NULL,
    `cdr_url` TEXT NULL,
    `pdf_url` TEXT NULL,
    `apisunat_status` VARCHAR(30) NULL,
    `apisunat_faults` TEXT NULL,

    UNIQUE INDEX `numero_guia`(`numero_guia`),
    INDEX `idx_fecha_emision`(`fecha_emision`),
    INDEX `idx_gre_relacionada`(`gre_relacionada_id`),
    INDEX `idx_placa_tracto`(`placa_tracto`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guias_remision_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guia_id` INTEGER NOT NULL,
    `codigo` VARCHAR(50) NULL,
    `descripcion` TEXT NOT NULL,
    `cantidad` DECIMAL(12, 2) NULL DEFAULT 1.00,
    `unidad_medida` VARCHAR(20) NULL DEFAULT 'NIU',
    `peso_unitario` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `item_numero` INTEGER NULL DEFAULT 1,
    `bien_normalizado` VARCHAR(10) NULL DEFAULT 'NO',
    `codigo_bien` VARCHAR(50) NULL,
    `codigo_sunat` VARCHAR(30) NULL,
    `codigo_gtin` VARCHAR(30) NULL,
    `codigo_subpartida` VARCHAR(30) NULL,

    INDEX `idx_guia_id`(`guia_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guias_remitente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `numero_guia` VARCHAR(30) NOT NULL,
    `serie` VARCHAR(10) NULL DEFAULT 'T001',
    `correlativo` INTEGER NULL DEFAULT 1,
    `fecha_emision` DATE NOT NULL,
    `fecha_traslado` DATE NOT NULL,
    `modalidad_transporte` VARCHAR(2) NULL DEFAULT '01',
    `motivo_traslado` VARCHAR(4) NULL DEFAULT '01',
    `descripcion_motivo` VARCHAR(255) NULL DEFAULT 'VENTA',
    `remitente_ruc` VARCHAR(20) NOT NULL,
    `remitente_razon_social` VARCHAR(255) NOT NULL,
    `remitente_tipo_doc` CHAR(1) NULL DEFAULT '6',
    `destinatario_ruc` VARCHAR(20) NOT NULL,
    `destinatario_razon_social` VARCHAR(255) NOT NULL,
    `destinatario_tipo_doc` CHAR(1) NULL DEFAULT '6',
    `peso_total` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `unidad_medida` VARCHAR(10) NULL DEFAULT 'KGM',
    `total_bultos` INTEGER NULL DEFAULT 1,
    `indicador_transbordo` BOOLEAN NULL DEFAULT false,
    `indicador_retorno_vehiculo_vacio` BOOLEAN NULL DEFAULT false,
    `indicador_retorno_envases_vacios` BOOLEAN NULL DEFAULT false,
    `indicador_traslado_total_m1_l` BOOLEAN NULL DEFAULT false,
    `partida_ubigeo` VARCHAR(6) NOT NULL,
    `partida_direccion` TEXT NOT NULL,
    `llegada_ubigeo` VARCHAR(6) NOT NULL,
    `llegada_direccion` TEXT NOT NULL,
    `transportista_ruc` VARCHAR(20) NULL,
    `transportista_razon_social` VARCHAR(255) NULL,
    `transportista_reg_mtc` VARCHAR(50) NULL,
    `vehiculo_placa` VARCHAR(20) NULL,
    `vehiculo_secundario_placa` VARCHAR(20) NULL,
    `conductor_tipo_doc` CHAR(1) NULL DEFAULT '1',
    `conductor_num_doc` VARCHAR(20) NULL,
    `conductor_nombres` VARCHAR(200) NULL,
    `conductor_apellidos` VARCHAR(200) NULL,
    `conductor_licencia` VARCHAR(30) NULL,
    `apisunat_document_id` VARCHAR(60) NULL,
    `apisunat_status` VARCHAR(30) NULL,
    `apisunat_faults` TEXT NULL,
    `xml_url` TEXT NULL,
    `cdr_url` TEXT NULL,
    `pdf_url` TEXT NULL,
    `estado` VARCHAR(30) NULL DEFAULT 'BORRADOR',
    `observaciones` TEXT NULL,
    `grt_vinculada_id` INTEGER NULL,
    `grt_vinculada_numero` VARCHAR(30) NULL,
    `orden_servicio` VARCHAR(60) NULL,
    `orden_viaje` VARCHAR(60) NULL,
    `datos_json` LONGTEXT NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `numero_guia`(`numero_guia`),
    INDEX `idx_estado`(`estado`),
    INDEX `idx_fecha`(`fecha_emision`),
    INDEX `idx_modalidad`(`modalidad_transporte`),
    INDEX `idx_serie_corr`(`serie`, `correlativo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guias_transportista` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `numero_guia` VARCHAR(30) NOT NULL,
    `serie` VARCHAR(10) NULL DEFAULT 'V001',
    `correlativo` INTEGER NULL DEFAULT 1,
    `fecha_emision` DATE NOT NULL,
    `fecha_traslado` DATE NOT NULL,
    `transportista_ruc` VARCHAR(20) NOT NULL,
    `transportista_razon_social` VARCHAR(255) NOT NULL,
    `transportista_reg_mtc` VARCHAR(50) NULL,
    `remitente_ruc` VARCHAR(20) NOT NULL,
    `remitente_razon_social` VARCHAR(255) NOT NULL,
    `remitente_tipo_doc` CHAR(1) NULL DEFAULT '6',
    `destinatario_ruc` VARCHAR(20) NOT NULL,
    `destinatario_razon_social` VARCHAR(255) NOT NULL,
    `destinatario_tipo_doc` CHAR(1) NULL DEFAULT '6',
    `motivo_traslado` VARCHAR(4) NULL DEFAULT '01',
    `descripcion_motivo` VARCHAR(255) NULL DEFAULT 'VENTA',
    `peso_total` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `unidad_medida` VARCHAR(10) NULL DEFAULT 'KGM',
    `indicador_transbordo` BOOLEAN NULL DEFAULT false,
    `partida_ubigeo` VARCHAR(6) NOT NULL,
    `partida_direccion` TEXT NOT NULL,
    `llegada_ubigeo` VARCHAR(6) NOT NULL,
    `llegada_direccion` TEXT NOT NULL,
    `vehiculo_placa` VARCHAR(20) NOT NULL,
    `vehiculo_secundario_placa` VARCHAR(20) NULL,
    `conductor_tipo_doc` CHAR(1) NULL DEFAULT '1',
    `conductor_num_doc` VARCHAR(20) NOT NULL,
    `conductor_nombres` VARCHAR(200) NOT NULL,
    `conductor_apellidos` VARCHAR(200) NULL,
    `conductor_licencia` VARCHAR(30) NOT NULL,
    `apisunat_document_id` VARCHAR(60) NULL,
    `apisunat_status` VARCHAR(30) NULL,
    `apisunat_faults` TEXT NULL,
    `xml_url` TEXT NULL,
    `cdr_url` TEXT NULL,
    `pdf_url` TEXT NULL,
    `estado` VARCHAR(30) NULL DEFAULT 'BORRADOR',
    `costo_flete` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `observaciones` TEXT NULL,
    `gre_vinculada_id` INTEGER NULL,
    `gre_vinculada_numero` VARCHAR(30) NULL,
    `orden_servicio` VARCHAR(60) NULL,
    `orden_viaje` VARCHAR(60) NULL,
    `datos_json` LONGTEXT NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `gre_vinculada_ruc` VARCHAR(20) NULL,
    `gre_vinculada_tipo` VARCHAR(10) NULL DEFAULT '09',
    `subcontratista_ruc` VARCHAR(20) NULL,
    `subcontratista_razon_social` VARCHAR(255) NULL,

    UNIQUE INDEX `numero_guia`(`numero_guia`),
    INDEX `idx_estado`(`estado`),
    INDEX `idx_fecha`(`fecha_emision`),
    INDEX `idx_placa`(`vehiculo_placa`),
    INDEX `idx_serie_corr`(`serie`, `correlativo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `backlog_mantenimiento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `placa` VARCHAR(100) NULL,
    `descripcion_falla` TEXT NOT NULL,
    `prioridad` ENUM('Baja', 'Media', 'Alta', 'Crítica') NULL DEFAULT 'Media',
    `estado` ENUM('Pendiente', 'En Proceso', 'Resuelto') NULL DEFAULT 'Pendiente',
    `reportado_por` VARCHAR(100) NULL,
    `fecha_reporte` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_rampas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre_rampa` VARCHAR(50) NOT NULL,
    `sede` VARCHAR(50) NOT NULL,
    `estado` VARCHAR(20) NULL DEFAULT 'Disponible',
    `orden` INTEGER NOT NULL DEFAULT 0,
    `color` VARCHAR(50) NULL DEFAULT '#ef4444',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `checklist_config_sistemas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `unidad` VARCHAR(20) NOT NULL,
    `sistema_key` VARCHAR(60) NOT NULL,
    `titulo` VARCHAR(150) NOT NULL,
    `icono` VARCHAR(100) NULL DEFAULT 'bi-gear',
    `orden` INTEGER NULL DEFAULT 0,
    `items_json` LONGTEXT NOT NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_unidad_orden`(`unidad`, `orden`),
    UNIQUE INDEX `uk_unidad_sys`(`unidad`, `sistema_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fleetrun` (
    `idRegistro` VARCHAR(50) NOT NULL,
    `fecha` DATE NULL,
    `mes` INTEGER NULL,
    `anio` INTEGER NULL,
    `placa` VARCHAR(20) NULL DEFAULT '',
    `marca` VARCHAR(50) NOT NULL DEFAULT '',
    `dueno` VARCHAR(100) NOT NULL DEFAULT '',
    `uts` VARCHAR(20) NOT NULL DEFAULT '',
    `tipo_mp` VARCHAR(60) NOT NULL DEFAULT '',
    `km_actual` INTEGER NULL,
    `frecuencia_km` INTEGER NULL,
    `km_proximo` INTEGER NULL,
    `observacion` TEXT NULL,
    `tecnico` VARCHAR(100) NOT NULL DEFAULT '',
    `km_gps` INTEGER NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `combustible` VARCHAR(50) NULL,
    `modelo` VARCHAR(50) NULL,

    INDEX `idx_fecha`(`fecha`),
    INDEX `idx_placa`(`placa`),
    PRIMARY KEY (`idRegistro`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inspecciones` (
    `id` VARCHAR(50) NOT NULL,
    `placa` VARCHAR(100) NULL,
    `fecha_ingreso` DATE NULL,
    `cliente` VARCHAR(100) NOT NULL DEFAULT '',
    `tecnico` VARCHAR(100) NOT NULL DEFAULT '',
    `km_tablero` INTEGER NULL,
    `dias_propuestos` INTEGER NOT NULL DEFAULT 0,
    `detalles_json` LONGTEXT NULL,
    `url_firma` TEXT NULL,
    `id_ot` VARCHAR(50) NULL,
    `tipo_inspeccion` VARCHAR(50) NULL DEFAULT 'General',

    INDEX `idx_fecha`(`fecha_ingreso`),
    INDEX `idx_placa`(`placa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mant_incidencias_ruta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(60) NOT NULL,
    `fecha_falla` DATE NOT NULL,
    `placa` VARCHAR(20) NOT NULL,
    `conductor` VARCHAR(150) NULL DEFAULT '',
    `marca` VARCHAR(50) NULL DEFAULT '',
    `ubicacion` VARCHAR(150) NULL DEFAULT '',
    `tipo_unidad` VARCHAR(50) NULL DEFAULT '',
    `transbordo` ENUM('SI', 'NO') NULL DEFAULT 'NO',
    `motivo` VARCHAR(255) NULL DEFAULT '',
    `falla` TEXT NULL,
    `area_responsable` VARCHAR(60) NULL DEFAULT 'Mantenimiento',
    `responsable` VARCHAR(100) NULL DEFAULT '',
    `costos_detalle` JSON NULL,
    `total_costo` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `solucionado` ENUM('Atendido', 'Pendiente') NULL DEFAULT 'Pendiente',
    `observaciones` TEXT NULL,
    `creado_por` VARCHAR(100) NULL DEFAULT '',
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `codigo`(`codigo`),
    INDEX `idx_area`(`area_responsable`),
    INDEX `idx_fecha`(`fecha_falla`),
    INDEX `idx_placa`(`placa`),
    INDEX `idx_solucionado`(`solucionado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mant_insp_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `template_id` VARCHAR(30) NOT NULL,
    `titulo` VARCHAR(150) NOT NULL,
    `items_json` JSON NOT NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_template_id`(`template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mantenimiento_kits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `marca_vehiculo` VARCHAR(50) NOT NULL,
    `modelo_vehiculo` VARCHAR(100) NULL DEFAULT 'TODOS LOS MODELOS',
    `tipo_mp` VARCHAR(60) NOT NULL,
    `nombre_kit` VARCHAR(150) NULL,
    `item_codigo` VARCHAR(30) NOT NULL,
    `item_nombre` VARCHAR(200) NOT NULL,
    `cantidad` DECIMAL(10, 2) NOT NULL,
    `unidad_medida` VARCHAR(10) NOT NULL,
    `costo_unitario` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `costo_total` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `orden` INTEGER NOT NULL DEFAULT 1,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_marca_mp`(`marca_vehiculo`, `tipo_mp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ordenes_trabajo` (
    `ticket_entrada` VARCHAR(50) NOT NULL,
    `id_ot` VARCHAR(50) NOT NULL,
    `placa` VARCHAR(100) NULL,
    `estado` VARCHAR(30) NOT NULL DEFAULT 'Recepción',
    `id_situacion` INTEGER NULL,
    `id_rampa` INTEGER NULL,
    `detalles_json` JSON NULL,
    `creado_por` VARCHAR(100) NOT NULL DEFAULT '',
    `fecha_ingreso` DATETIME(0) NOT NULL,
    `fecha_hora_salida` DATETIME(0) NULL,
    `sistema` VARCHAR(100) NULL,
    `sub_sistema` VARCHAR(100) NULL,
    `fecha_inicio_ot` DATETIME(0) NULL,
    `iniciado_por` VARCHAR(100) NULL,
    `fecha_pausa1` DATETIME(0) NULL,
    `fecha_fin_pausa1` DATETIME(0) NULL,
    `motivo_pausa1` VARCHAR(255) NULL,
    `pausado_por1` VARCHAR(100) NULL,
    `fecha_pausa2` DATETIME(0) NULL,
    `fecha_fin_pausa2` DATETIME(0) NULL,
    `motivo_pausa2` VARCHAR(255) NULL,
    `pausado_por2` VARCHAR(100) NULL,
    `fecha_pausa3` DATETIME(0) NULL,
    `fecha_fin_pausa3` DATETIME(0) NULL,
    `motivo_pausa3` VARCHAR(255) NULL,
    `pausado_por3` VARCHAR(100) NULL,
    `comentario_cierre` TEXT NULL,
    `cerrado_por` VARCHAR(100) NULL,

    INDEX `idx_estado`(`estado`),
    INDEX `idx_placa`(`placa`),
    PRIMARY KEY (`ticket_entrada`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ot_backlog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `backlog_id` VARCHAR(30) NOT NULL,
    `placa` VARCHAR(100) NULL,
    `km` INTEGER NOT NULL DEFAULT 0,
    `tema` VARCHAR(100) NOT NULL DEFAULT '',
    `tarea` TEXT NOT NULL,
    `reportado_por` VARCHAR(100) NOT NULL DEFAULT '',
    `fecha_reporte` DATE NULL,
    `estado` VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    `creado_por` VARCHAR(100) NOT NULL DEFAULT '',
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ticket_ot` VARCHAR(50) NULL,

    UNIQUE INDEX `backlog_id`(`backlog_id`),
    INDEX `idx_estado`(`estado`),
    INDEX `idx_placa`(`placa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ot_materiales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_solicitud` VARCHAR(30) NOT NULL,
    `ticket_ot` VARCHAR(50) NOT NULL,
    `producto` VARCHAR(200) NOT NULL,
    `cantidad` DECIMAL(10, 3) NOT NULL DEFAULT 1.000,
    `unidad_medida` VARCHAR(20) NOT NULL DEFAULT 'Pza',
    `costo_unit` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `costo_total` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `personal_solicitante` VARCHAR(100) NOT NULL DEFAULT '',
    `observacion` TEXT NULL,
    `estado` VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    `creado_por` VARCHAR(100) NOT NULL DEFAULT '',
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `id_solicitud`(`id_solicitud`),
    INDEX `idx_estado`(`estado`),
    INDEX `idx_ticket_ot`(`ticket_ot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `planificacion` (
    `id` VARCHAR(50) NOT NULL,
    `placa` VARCHAR(100) NULL,
    `configuracion_flota_id` INTEGER NULL,
    `tipo_mp` VARCHAR(60) NOT NULL,
    `fecha_inicio_ventana` DATE NOT NULL,
    `fecha_fin_ventana` DATE NOT NULL,
    `mes_ejecucion` INTEGER NOT NULL,
    `anio_ejecucion` INTEGER NOT NULL,
    `km_estimado` INTEGER NOT NULL DEFAULT 0,
    `km_minimo` INTEGER NULL,
    `km_maximo` INTEGER NULL,
    `tecnico_asignado` VARCHAR(100) NULL,
    `prioridad` ENUM('Baja', 'Normal', 'Alta', 'Crítica') NOT NULL DEFAULT 'Normal',
    `observaciones_plan` TEXT NULL,
    `estado` ENUM('Programada', 'Confirmada', 'En Progreso', 'Completada', 'Cancelada', 'Diferida') NOT NULL DEFAULT 'Programada',
    `motivo_cancelacion` TEXT NULL,
    `fleetrun_id_ejecutado` VARCHAR(50) NULL,
    `fecha_real_ejecucion` DATE NULL,
    `km_real_ejecucion` INTEGER NULL,
    `desviacion_km` INTEGER NULL,
    `desviacion_dias` INTEGER NULL,
    `fecha_primer_retraso` DATE NULL,
    `alertas_enviadas` TINYINT NOT NULL DEFAULT 0,
    `source` ENUM('manual_excel', 'auto_generada') NOT NULL DEFAULT 'manual_excel',
    `created_by` VARCHAR(100) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_estado`(`estado`),
    INDEX `idx_fecha_ventana`(`fecha_fin_ventana`),
    INDEX `idx_mes_anio`(`mes_ejecucion`, `anio_ejecucion`),
    INDEX `idx_placa`(`placa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reportes_fallas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `folio` VARCHAR(50) NOT NULL,
    `orden_viaje` VARCHAR(60) NULL,
    `fecha_reporte` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `placa_tracto` VARCHAR(20) NULL,
    `placa_remolque` VARCHAR(20) NULL,
    `km_inicial` INTEGER NULL DEFAULT 0,
    `km_final` INTEGER NULL DEFAULT 0,
    `horas_motor` VARCHAR(50) NULL,
    `conductor` VARCHAR(150) NULL,
    `procedencia` VARCHAR(150) NULL,
    `ubicacion_gps` VARCHAR(255) NULL,
    `fallas_tracto_json` LONGTEXT NULL,
    `fallas_remolque_json` LONGTEXT NULL,
    `fallas_libres_text` TEXT NULL,
    `fotos_json` LONGTEXT NULL,
    `firma_conductor` LONGTEXT NULL,
    `estado` VARCHAR(30) NULL DEFAULT 'Pendiente',
    `id_rampa` VARCHAR(50) NULL,
    `ots_generadas_json` LONGTEXT NULL,
    `creado_por` VARCHAR(100) NULL,
    `creado_en` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `folio`(`folio`),
    INDEX `idx_orden_viaje`(`orden_viaje`),
    INDEX `idx_placa_tracto`(`placa_tracto`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `requerimientos_planificacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `plan_id` VARCHAR(50) NOT NULL,
    `mes_ejecucion` INTEGER NOT NULL,
    `anio_ejecucion` INTEGER NOT NULL,
    `item_codigo` VARCHAR(30) NULL,
    `item_nombre` VARCHAR(200) NOT NULL,
    `cantidad_requerida` DECIMAL(10, 2) NOT NULL,
    `unidad_medida` VARCHAR(10) NOT NULL,
    `costo_unitario` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `costo_total` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `estado_req` ENUM('Pendiente', 'Solicitado', 'Recibido', 'Entregado al Taller', 'Cancelado') NOT NULL DEFAULT 'Pendiente',
    `fecha_solicitud` DATE NULL,
    `fecha_entrega` DATE NULL,
    `responsable_almacen` VARCHAR(100) NULL,
    `observaciones` TEXT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_estado_req`(`estado_req`),
    INDEX `idx_mes_req`(`mes_ejecucion`, `anio_ejecucion`),
    INDEX `idx_plan`(`plan_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `taller_personal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `sueldo_mensual` DECIMAL(10, 2) NULL DEFAULT 0.00,
    `costo_hora` DECIMAL(10, 2) NULL DEFAULT 0.00,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `taller_rampas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rampa` INTEGER NOT NULL,
    `placa` VARCHAR(100) NULL,
    `km` VARCHAR(20) NULL,
    `fecha_ingreso` DATE NULL,
    `hora_ingreso` TIME(0) NULL,
    `fecha_salida` DATE NULL,
    `hora_salida` TIME(0) NULL,
    `situacion` VARCHAR(80) NOT NULL DEFAULT '',
    `obs` TEXT NULL,
    `creado_por` VARCHAR(100) NOT NULL DEFAULT '',
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `fecha_liberado` DATETIME(0) NULL,
    `estado` VARCHAR(20) NOT NULL DEFAULT 'Activo',
    `liberado_por` VARCHAR(100) NULL,
    `fecha_salida_real` DATE NULL,
    `hora_salida_real` TIME(0) NULL,
    `evidencia_url` VARCHAR(255) NULL,
    `conductor` VARCHAR(255) NULL,

    INDEX `idx_placa`(`placa`),
    INDEX `idx_rampa`(`rampa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipos_mantenimiento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `marca` VARCHAR(100) NOT NULL DEFAULT '',
    `tipo_mp` VARCHAR(100) NOT NULL DEFAULT '',
    `uts` VARCHAR(50) NOT NULL DEFAULT '',
    `frecuencia_km` DECIMAL(10, 2) NULL,
    `frecuencia_horas` DECIMAL(10, 2) NULL,
    `frecuencia_dias` INTEGER NULL,
    `tipo` VARCHAR(100) NULL,
    `sistema` VARCHAR(100) NULL,
    `descripcion` TEXT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `combustible` VARCHAR(50) NULL,
    `modelo` VARCHAR(100) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipos_preventivo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `descripcion` TEXT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `nombre`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tp_mp` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo_mantenimiento_id` INTEGER NOT NULL,
    `marca_vehiculo` VARCHAR(50) NOT NULL,
    `modelo_vehiculo` VARCHAR(50) NULL,
    `repuestos_json` JSON NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trabajos_ot` (
    `id_ot` VARCHAR(50) NOT NULL,
    `ticket_visita` VARCHAR(50) NOT NULL,
    `tipo_ot` VARCHAR(50) NOT NULL DEFAULT '',
    `sub_tipo` VARCHAR(50) NOT NULL DEFAULT '',
    `estado` VARCHAR(30) NOT NULL DEFAULT 'Recepción',
    `detalles_json` JSON NULL,
    `creado_por` VARCHAR(100) NOT NULL DEFAULT '',
    `trabajo_realizado` TEXT NULL,
    `tecnico` VARCHAR(100) NULL,
    `fecha_trabajo` DATETIME(0) NULL,
    `fecha_salida` DATETIME(0) NULL,
    `fecha_creacion` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `costo` DECIMAL(10, 2) NULL DEFAULT 0.00,
    `placa` VARCHAR(50) NULL,

    INDEX `idx_ticket`(`ticket_visita`),
    PRIMARY KEY (`id_ot`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trabajos_ot_repuestos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_ot` VARCHAR(50) NOT NULL,
    `item` VARCHAR(200) NOT NULL,
    `cantidad` DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
    `precio_unitario` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `total` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,

    INDEX `idx_id_ot`(`id_ot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_neumaticos_acciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `nombre`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_neumaticos_marcas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `nombre`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_neumaticos_medidas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `nombre`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_neumaticos_modelos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `nombre`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `neumaticos_hoja_vida` (
    `id_neumatico` VARCHAR(50) NOT NULL,
    `codigo_dot` VARCHAR(50) NULL,
    `marca` VARCHAR(100) NOT NULL,
    `modelo` VARCHAR(100) NOT NULL,
    `medida` VARCHAR(50) NOT NULL,
    `estado` VARCHAR(30) NULL DEFAULT 'NUEVA',
    `remanente_inicial` INTEGER NULL DEFAULT 18,
    `remanente_actual` DECIMAL(4, 1) NULL DEFAULT 18.0,
    `costo_compra` DECIMAL(10, 2) NULL DEFAULT 0.00,
    `km_acumulado` INTEGER NULL DEFAULT 0,
    `placa_actual` VARCHAR(20) NULL,
    `posicion_actual` VARCHAR(10) NULL,
    `estado_operativo` ENUM('Montada', 'Stock Taller', 'En Rencauche', 'Desecho') NULL DEFAULT 'Stock Taller',
    `fecha_instalacion` DATE NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_estado`(`estado_operativo`),
    INDEX `idx_placa`(`placa_actual`),
    PRIMARY KEY (`id_neumatico`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `neumaticos_inspecciones` (
    `id_inspeccion` VARCHAR(50) NOT NULL,
    `id_ot` VARCHAR(50) NULL,
    `placa` VARCHAR(20) NOT NULL,
    `fecha_inspeccion` DATE NOT NULL,
    `km_vehiculo` INTEGER NOT NULL DEFAULT 0,
    `dias_propuestos` INTEGER NOT NULL DEFAULT 30,
    `fecha_proxima` DATE NULL,
    `observaciones` TEXT NULL,
    `inspector` VARCHAR(100) NOT NULL DEFAULT '',
    `total_llantas` INTEGER NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_fecha`(`fecha_inspeccion`),
    INDEX `idx_neu_insp_placa_fecha`(`placa`, `fecha_inspeccion`),
    INDEX `idx_ot`(`id_ot`),
    INDEX `idx_placa`(`placa`),
    PRIMARY KEY (`id_inspeccion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `neumaticos_inspecciones_det` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_inspeccion` VARCHAR(50) NOT NULL,
    `id_neumatico` VARCHAR(50) NULL,
    `posicion` VARCHAR(10) NOT NULL,
    `marca` VARCHAR(100) NOT NULL,
    `medida` VARCHAR(50) NOT NULL,
    `modelo` VARCHAR(100) NOT NULL,
    `r1` INTEGER NOT NULL,
    `r2` INTEGER NOT NULL,
    `r3` INTEGER NOT NULL,
    `remanente_promedio` DECIMAL(4,1) GENERATED ALWAYS AS ((((`r1` + `r2`) + `r3`) / 3.0)) STORED NULL,
    `presion_ant` INTEGER NULL DEFAULT 0,
    `presion_actual` INTEGER NULL DEFAULT 0,
    `estado` VARCHAR(30) NOT NULL DEFAULT 'NUEVA',
    `accion` VARCHAR(50) NOT NULL DEFAULT 'Inspeccion',
    `observaciones` TEXT NULL,
    `alerta_cambio` BOOLEAN NULL DEFAULT false,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `r4` INTEGER NULL DEFAULT 0,
    `rot` VARCHAR(50) NULL DEFAULT 'NO',
    `foto1` LONGTEXT NULL,
    `foto2` LONGTEXT NULL,
    `foto3` LONGTEXT NULL,
    `tipo_eje` VARCHAR(50) NULL,

    INDEX `idx_insp`(`id_inspeccion`),
    INDEX `idx_insp_pos`(`id_inspeccion`, `posicion`),
    INDEX `idx_pos`(`posicion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `neumaticos_rotaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_ot` VARCHAR(50) NULL,
    `placa` VARCHAR(20) NOT NULL,
    `fecha` DATE NOT NULL,
    `km_actual` INTEGER NULL DEFAULT 0,
    `posicion_origen` VARCHAR(10) NOT NULL,
    `posicion_destino` VARCHAR(10) NOT NULL,
    `id_neumatico` VARCHAR(50) NULL,
    `motivo` VARCHAR(200) NULL DEFAULT 'Rotación preventiva',
    `tecnico` VARCHAR(100) NOT NULL DEFAULT '',
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_placa`(`placa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `marsisa_ordenes_viaje` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_remoto` BIGINT NULL,
    `viaje` VARCHAR(60) NOT NULL,
    `fecha_viaje` DATETIME(0) NULL,
    `id_conductor` INTEGER NULL,
    `conductor` VARCHAR(150) NOT NULL DEFAULT '',
    `placa_tracto` VARCHAR(20) NOT NULL DEFAULT '',
    `placa_remolque` VARCHAR(20) NULL,
    `peso` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `ruta` VARCHAR(255) NULL,
    `origen` VARCHAR(100) NULL,
    `destino` VARCHAR(100) NULL,
    `estado` VARCHAR(30) NOT NULL DEFAULT 'ACTIVO',
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_viaje`(`viaje`),
    INDEX `idx_fecha_viaje`(`fecha_viaje`),
    INDEX `idx_id_remoto`(`id_remoto`),
    INDEX `idx_mov_placas`(`placa_tracto`, `placa_remolque`),
    INDEX `idx_placa_remolque`(`placa_remolque`),
    INDEX `idx_placa_tracto`(`placa_tracto`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `marsisa_ordenes_viaje_rutas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `viaje` VARCHAR(60) NOT NULL,
    `orden` VARCHAR(60) NOT NULL,
    `ruta` VARCHAR(255) NULL,
    `tipo_servicio` VARCHAR(100) NULL,
    `es_retorno` BOOLEAN NOT NULL DEFAULT false,
    `peso_total` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `cantidad_total` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `volumen_total` DECIMAL(12, 3) NULL DEFAULT 0.000,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_es_retorno`(`es_retorno`),
    INDEX `idx_orden`(`orden`),
    INDEX `idx_viaje`(`viaje`),
    UNIQUE INDEX `uq_viaje_orden`(`viaje`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operaciones_ordenes_servicio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serie` VARCHAR(10) NOT NULL DEFAULT '2026',
    `numero` VARCHAR(20) NOT NULL,
    `codigo_orden` VARCHAR(40) NOT NULL,
    `fecha` DATE NOT NULL,
    `fecha_fin` DATE NULL,
    `moneda` VARCHAR(20) NULL DEFAULT 'SOLES',
    `tipo_cambio` DECIMAL(8, 3) NULL DEFAULT 3.750,
    `tipo_contratacion` VARCHAR(50) NULL DEFAULT 'CLIENTE DIRECTO',
    `modalidad_ejecucion` VARCHAR(50) NULL DEFAULT 'PROPIO',
    `cliente_id` INTEGER NULL,
    `cliente_nombre` VARCHAR(255) NOT NULL,
    `tipo_servicio` VARCHAR(100) NULL DEFAULT 'CARGA GENERAL',
    `es_retorno` BOOLEAN NULL DEFAULT false,
    `tipo_costo` VARCHAR(50) NULL DEFAULT 'POR VIAJE',
    `impuesto` VARCHAR(50) NULL DEFAULT 'IGV 18%',
    `costo_flete` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `puntos_carga` INTEGER NULL DEFAULT 1,
    `puntos_destino` INTEGER NULL DEFAULT 1,
    `destinatario` VARCHAR(255) NULL,
    `sustento_url` VARCHAR(255) NULL,
    `observaciones` TEXT NULL,
    `viaje_asignado` VARCHAR(60) NULL,
    `estado_viaje` VARCHAR(30) NULL DEFAULT 'Sin asignar',
    `estado_servicio` VARCHAR(30) NULL DEFAULT 'INICIADO',
    `estado_liquidacion` VARCHAR(30) NULL DEFAULT 'PENDIENTE',
    `estado_descarga` VARCHAR(30) NULL DEFAULT 'PENDIENTE',
    `conductor` VARCHAR(150) NULL,
    `placa_tracto` VARCHAR(20) NULL,
    `placa_carreta` VARCHAR(20) NULL,
    `ruta_sistema` VARCHAR(255) NULL,
    `tipo_medida` VARCHAR(50) NULL DEFAULT 'VIAJE',
    `costo_medida` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `cargos_adicionales` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `descuentos` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `subtotal` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `igv` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `kilometraje_fin` INTEGER NULL,
    `usuario_creacion` VARCHAR(100) NULL DEFAULT 'ADMINISTRADOR',
    `factura` VARCHAR(60) NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `proveedor_tercero_nombre` VARCHAR(200) NULL,
    `proveedor_tercero_ruc` VARCHAR(20) NULL,
    `costo_tercero` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `doc_tercero` VARCHAR(100) NULL,
    `remitente_generador` VARCHAR(255) NULL,

    UNIQUE INDEX `uq_codigo_orden`(`codigo_orden`),
    INDEX `idx_cliente`(`cliente_nombre`),
    INDEX `idx_fecha`(`fecha`),
    INDEX `idx_viaje`(`viaje_asignado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operaciones_ordenes_servicio_docs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orden_servicio_id` INTEGER NOT NULL,
    `codigo_orden` VARCHAR(40) NOT NULL,
    `guia_remision_id` INTEGER NULL,
    `numero_documento` VARCHAR(50) NOT NULL,
    `tipo_documento` VARCHAR(50) NULL DEFAULT 'GRE',
    `gr_remitente` VARCHAR(50) NULL,
    `numero_transporte` VARCHAR(50) NULL,
    `placa_referencia` VARCHAR(20) NULL,
    `volumen` DECIMAL(12, 3) NULL DEFAULT 0.000,
    `cantidad` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `peso` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `remitente` VARCHAR(255) NULL,
    `destinatario` VARCHAR(255) NULL,
    `fecha_carga` DATE NULL,
    `fecha_entrega` DATE NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_guia_id`(`guia_remision_id`),
    INDEX `idx_os_codigo`(`codigo_orden`),
    INDEX `idx_os_id`(`orden_servicio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operaciones_ordenes_servicio_rutas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orden_servicio_id` INTEGER NOT NULL,
    `codigo_orden` VARCHAR(40) NOT NULL,
    `ruta` VARCHAR(255) NULL,
    `distancia_km` DECIMAL(10, 2) NULL DEFAULT 0.00,
    `galones` DECIMAL(10, 2) NULL DEFAULT 0.00,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_os_rutas_cod`(`codigo_orden`),
    INDEX `idx_os_rutas_id`(`orden_servicio_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operaciones_ordenes_viaje` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_remoto` BIGINT NULL,
    `viaje` VARCHAR(60) NOT NULL,
    `fecha_viaje` DATETIME(0) NULL,
    `id_conductor` INTEGER NULL,
    `conductor` VARCHAR(150) NOT NULL DEFAULT '',
    `placa_tracto` VARCHAR(20) NOT NULL DEFAULT '',
    `placa_remolque` VARCHAR(20) NULL,
    `configuracion_tracto` VARCHAR(20) NULL,
    `configuracion_remolque` VARCHAR(20) NULL,
    `ruta` VARCHAR(255) NULL,
    `origen` VARCHAR(100) NULL,
    `destino` VARCHAR(100) NULL,
    `ubigeo_partida` VARCHAR(10) NULL,
    `direccion_partida` VARCHAR(255) NULL,
    `ubigeo_llegada` VARCHAR(10) NULL,
    `direccion_llegada` VARCHAR(255) NULL,
    `escolta` VARCHAR(150) NULL,
    `observaciones` TEXT NULL,
    `estado` VARCHAR(30) NOT NULL DEFAULT 'ACTIVO',
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `peso` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `kilometraje_inicial` INTEGER NULL,
    `kilometraje_final` INTEGER NULL,
    `horas_motor_remolque` INTEGER NULL,
    `fecha_inicio` DATETIME(0) NULL,
    `fecha_fin` DATETIME(0) NULL,
    `usuario_creacion` VARCHAR(150) NULL DEFAULT 'ADMINISTRADOR DEL SISTEMA',
    `usuario_finalizacion` VARCHAR(150) NULL,

    UNIQUE INDEX `uq_viaje`(`viaje`),
    INDEX `idx_fecha_viaje`(`fecha_viaje`),
    INDEX `idx_id_remoto`(`id_remoto`),
    INDEX `idx_placa_remolque`(`placa_remolque`),
    INDEX `idx_placa_tracto`(`placa_tracto`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operaciones_ordenes_viaje_rutas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `viaje` VARCHAR(60) NOT NULL,
    `orden` VARCHAR(60) NOT NULL,
    `ruta` VARCHAR(255) NULL,
    `tipo_servicio` VARCHAR(100) NULL,
    `es_retorno` BOOLEAN NOT NULL DEFAULT false,
    `peso_total` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `cantidad_total` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `volumen_total` DECIMAL(12, 3) NULL DEFAULT 0.000,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `distancia_km` DECIMAL(10, 2) NULL,
    `galones` DECIMAL(10, 2) NULL,

    INDEX `idx_es_retorno`(`es_retorno`),
    INDEX `idx_orden`(`orden`),
    INDEX `idx_viaje`(`viaje`),
    UNIQUE INDEX `uq_viaje_orden`(`viaje`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rrhh_licencias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `personal_id` INTEGER NOT NULL,
    `tipo` ENUM('VACACIONES', 'DESCANSO_MEDICO', 'PERMISO_CON_GOCE', 'PERMISO_SIN_GOCE', 'LICENCIA_PATERNIDAD', 'LICENCIA_MATERNIDAD', 'SUSPENSION') NOT NULL,
    `fecha_inicio` DATE NOT NULL,
    `fecha_fin` DATE NOT NULL,
    `dias_totales` INTEGER NOT NULL,
    `motivo` TEXT NULL,
    `sustento_url` TEXT NULL,
    `estado` ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO') NULL DEFAULT 'APROBADO',
    `aprobado_por` VARCHAR(100) NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `personal_id`(`personal_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rrhh_personal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo_documento` VARCHAR(20) NULL DEFAULT 'DNI',
    `numero_documento` VARCHAR(20) NOT NULL,
    `nombres` VARCHAR(100) NOT NULL,
    `apellidos` VARCHAR(100) NOT NULL,
    `sexo` ENUM('M', 'F') NULL DEFAULT 'M',
    `fecha_nacimiento` DATE NULL,
    `nacionalidad` VARCHAR(50) NULL DEFAULT 'PERUANA',
    `estado_civil` VARCHAR(30) NULL DEFAULT 'SOLTERO(A)',
    `direccion` TEXT NULL,
    `distrito` VARCHAR(100) NULL,
    `provincia` VARCHAR(100) NULL,
    `departamento` VARCHAR(100) NULL,
    `telefono` VARCHAR(30) NULL,
    `email` VARCHAR(100) NULL,
    `contacto_emergencia_nombre` VARCHAR(100) NULL,
    `contacto_emergencia_parentesco` VARCHAR(50) NULL,
    `contacto_emergencia_telefono` VARCHAR(30) NULL,
    `categoria_rol` ENUM('CONDUCTOR', 'MECANICO_TALLER', 'ADMINISTRATIVO', 'LIMPIEZA_SERVICIOS', 'SEGURIDAD_CONTROL', 'OTRO') NULL DEFAULT 'ADMINISTRATIVO',
    `cargo` VARCHAR(100) NOT NULL,
    `area` VARCHAR(100) NULL DEFAULT 'OPERACIONES',
    `sede` VARCHAR(100) NULL DEFAULT 'BASE PRINCIPAL',
    `centro_costo_codigo` VARCHAR(20) NULL DEFAULT 'CC-100',
    `jefe_inmediato` VARCHAR(100) NULL,
    `fecha_ingreso` DATE NOT NULL,
    `fecha_cese` DATE NULL,
    `motivo_cese` VARCHAR(255) NULL,
    `estado` ENUM('ACTIVO', 'VACACIONES', 'SUSPENDIDO', 'CESADO') NULL DEFAULT 'ACTIVO',
    `tipo_contrato` ENUM('INDETERMINADO', 'PLAZO_FIJO', 'PERIODO_PRUEBA', 'LOCACION_SERVICIOS', 'PRACTICANTE') NULL DEFAULT 'PLAZO_FIJO',
    `fecha_inicio_contrato` DATE NULL,
    `fecha_fin_contrato` DATE NULL,
    `regimen_pensionario` ENUM('ONP', 'AFP_HABITAT', 'AFP_INTEGRA', 'AFP_PRIMA', 'AFP_PROFUTURO', 'SIN_REGIMEN') NULL DEFAULT 'ONP',
    `tipo_comision_afp` ENUM('FLUJO', 'MIXTA') NULL DEFAULT 'FLUJO',
    `cuspp` VARCHAR(30) NULL,
    `tiene_asignacion_familiar` BOOLEAN NULL DEFAULT false,
    `sueldo_basico` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `bono_fijo` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `banco_haberes` VARCHAR(100) NULL,
    `cuenta_haberes` VARCHAR(50) NULL,
    `cci_haberes` VARCHAR(50) NULL,
    `banco_cts` VARCHAR(100) NULL,
    `cuenta_cts` VARCHAR(50) NULL,
    `licencia_conducir` VARCHAR(30) NULL,
    `licencia_categoria` VARCHAR(20) NULL,
    `licencia_vencimiento` DATE NULL,
    `sctr_salud_vigente` BOOLEAN NULL DEFAULT true,
    `sctr_pension_vigente` BOOLEAN NULL DEFAULT true,
    `emo_fecha_vencimiento` DATE NULL,
    `emo_condicion` ENUM('APTO', 'APTO_RESTRICCIONES', 'NO_APTO', 'PENDIENTE') NULL DEFAULT 'APTO',
    `grupo_sanguineo` VARCHAR(10) NULL,
    `talla_polo` VARCHAR(10) NULL,
    `talla_pantalon` VARCHAR(10) NULL,
    `talla_calzado` VARCHAR(10) NULL,
    `talla_chaleco` VARCHAR(10) NULL,
    `foto_url` LONGTEXT NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `numero_documento`(`numero_documento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rrhh_sst_registros` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `personal_id` INTEGER NOT NULL,
    `tipo_registro` ENUM('ENTREGA_EPP', 'CAPACITACION_SST', 'EXAMEN_MEDICO_EMO', 'INDUCCION', 'ENTREGA_RIT_RISST') NOT NULL,
    `fecha_registro` DATE NOT NULL,
    `descripcion` TEXT NOT NULL,
    `fecha_vencimiento` DATE NULL,
    `documento_url` TEXT NULL,
    `firmado` BOOLEAN NULL DEFAULT false,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `personal_id`(`personal_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rrhh_tareo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `personal_id` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `estado` ENUM('A', 'T', 'F', 'R', 'DM', 'V', 'P', 'D', 'FER') NULL DEFAULT 'A',
    `hora_entrada` TIME(0) NULL,
    `hora_salida` TIME(0) NULL,
    `minutos_tardanza` INTEGER NULL DEFAULT 0,
    `horas_extras` DECIMAL(4, 2) NULL DEFAULT 0.00,
    `observacion` VARCHAR(255) NULL,
    `orden_viaje_codigo` VARCHAR(50) NULL,
    `usuario_registro` VARCHAR(100) NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_personal_fecha`(`personal_id`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `seg_asistencia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dni` VARCHAR(12) NOT NULL,
    `nombre` VARCHAR(150) NOT NULL,
    `cargo` VARCHAR(100) NULL,
    `fecha_ingreso` VARCHAR(10) NOT NULL,
    `hora_ingreso` VARCHAR(8) NOT NULL,
    `fecha_salida` VARCHAR(10) NULL,
    `hora_salida` VARCHAR(8) NULL,
    `registrado_por` VARCHAR(100) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_dni`(`dni`),
    INDEX `idx_estado`(`hora_salida`),
    INDEX `idx_fecha_ingreso`(`fecha_ingreso`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `seg_checklist_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `template_id` VARCHAR(30) NOT NULL,
    `titulo` VARCHAR(150) NOT NULL,
    `items_json` JSON NOT NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_template_id`(`template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `seg_entrega_vehiculos` (
    `id` VARCHAR(50) NOT NULL,
    `numero_inventario` VARCHAR(50) NULL,
    `fecha` DATE NOT NULL,
    `motivo` VARCHAR(150) NOT NULL DEFAULT 'ENTREGA DE UNIDAD',
    `quien_entrega` VARCHAR(150) NOT NULL,
    `quien_recibe` VARCHAR(150) NOT NULL,
    `clase` VARCHAR(50) NULL,
    `marca` VARCHAR(50) NULL,
    `tipo` VARCHAR(50) NULL,
    `modelo` VARCHAR(50) NULL,
    `placa` VARCHAR(20) NOT NULL,
    `color` VARCHAR(50) NULL,
    `cilindros` VARCHAR(20) NULL,
    `numero_motor` VARCHAR(50) NULL,
    `numero_serie` VARCHAR(50) NULL,
    `kilometraje` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `llantas_del_der_marca` VARCHAR(50) NULL,
    `llantas_del_izq_marca` VARCHAR(50) NULL,
    `llantas_tra_der_marca` VARCHAR(50) NULL,
    `llantas_tra_izq_marca` VARCHAR(50) NULL,
    `llantas_repuesto_marca` VARCHAR(50) NULL,
    `llantas_ref_json` JSON NULL,
    `inventario_partes_json` JSON NULL,
    `observaciones` TEXT NULL,
    `croquis_danos_json` JSON NULL,
    `firma_entrega` LONGTEXT NULL,
    `firma_recibe` LONGTEXT NULL,
    `doc_entrega` VARCHAR(50) NULL,
    `doc_recibe` VARCHAR(50) NULL,
    `empresa` VARCHAR(100) NOT NULL DEFAULT 'MARSISA',
    `creado_por` VARCHAR(100) NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `configuracion` VARCHAR(50) NULL,
    `estilo_cabina` VARCHAR(50) NULL,

    INDEX `idx_empresa`(`empresa`),
    INDEX `idx_fecha`(`fecha`),
    INDEX `idx_placa`(`placa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `seg_unidades_base` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATE NOT NULL,
    `corte` VARCHAR(20) NOT NULL,
    `corte_hora` VARCHAR(10) NULL,
    `placa_camion` VARCHAR(50) NOT NULL,
    `placa_carreta` VARCHAR(50) NULL,
    `conductor` VARCHAR(150) NULL,
    `zona` VARCHAR(100) NULL DEFAULT 'Base Central',
    `estado` VARCHAR(50) NULL DEFAULT 'Disponible',
    `observacion` TEXT NULL,
    `usuario` VARCHAR(100) NULL,
    `creado_en` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_fecha_corte`(`fecha`, `corte`),
    INDEX `idx_placa_camion`(`placa_camion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `seg_unidades_fotos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `registro_id` VARCHAR(50) NULL,
    `tipo` ENUM('salida', 'retorno') NOT NULL,
    `url` VARCHAR(500) NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_registro`(`registro_id`),
    INDEX `idx_tipo`(`tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `seg_unidades_registros` (
    `id` VARCHAR(50) NOT NULL,
    `placa_tracto` VARCHAR(20) NOT NULL,
    `placa_carreta` VARCHAR(20) NULL,
    `retorno_placa_carreta` VARCHAR(20) NULL,
    `conductor` VARCHAR(100) NOT NULL,
    `retorno_conductor` VARCHAR(100) NULL,
    `destino` VARCHAR(150) NULL,
    `tipo_salida` VARCHAR(30) NOT NULL DEFAULT 'RUTA',
    `estado` ENUM('en_ruta', 'completado') NOT NULL DEFAULT 'en_ruta',
    `salida_fecha` VARCHAR(10) NULL,
    `salida_hora` VARCHAR(5) NULL,
    `salida_km` VARCHAR(20) NULL,
    `salida_template_json` JSON NULL,
    `salida_checklist_json` JSON NULL,
    `salida_has_alert` BOOLEAN NOT NULL DEFAULT false,
    `retorno_fecha` VARCHAR(10) NULL,
    `retorno_hora` VARCHAR(5) NULL,
    `retorno_km` VARCHAR(20) NULL,
    `retorno_template_json` JSON NULL,
    `retorno_checklist_json` JSON NULL,
    `retorno_has_alert` BOOLEAN NOT NULL DEFAULT false,
    `creado_por` VARCHAR(100) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `retorno_creado_por` VARCHAR(100) NULL,
    `firma_salida_conductor` LONGTEXT NULL,
    `firma_salida_vigilancia` LONGTEXT NULL,
    `firma_retorno_conductor` LONGTEXT NULL,
    `firma_retorno_vigilancia` LONGTEXT NULL,
    `salida_observaciones` TEXT NULL,
    `retorno_observaciones` TEXT NULL,
    `orden_viaje` VARCHAR(50) NULL,

    INDEX `idx_estado`(`estado`),
    INDEX `idx_placa_tracto`(`placa_tracto`),
    INDEX `idx_salida_fecha`(`salida_fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `seguridad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `token_sesion` VARCHAR(255) NOT NULL,
    `fecha_expiracion` DATETIME(0) NOT NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_keys` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(150) NOT NULL,
    `api_key` VARCHAR(80) NOT NULL,
    `cliente_empresa` VARCHAR(150) NULL DEFAULT '',
    `scopes` TEXT NOT NULL,
    `limite_rpm` INTEGER NULL DEFAULT 60,
    `estado` VARCHAR(20) NULL DEFAULT 'activo',
    `ultimo_uso` DATETIME(0) NULL,
    `peticiones_total` INTEGER NULL DEFAULT 0,
    `creado_por` VARCHAR(100) NULL DEFAULT '',
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `api_key`(`api_key`),
    INDEX `idx_estado`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `api_key_id` INTEGER NULL,
    `api_key_nombre` VARCHAR(150) NULL DEFAULT '',
    `endpoint` VARCHAR(255) NOT NULL,
    `metodo` VARCHAR(10) NOT NULL,
    `ip` VARCHAR(45) NULL DEFAULT '',
    `status_code` INTEGER NOT NULL,
    `tiempo_ms` INTEGER NOT NULL DEFAULT 0,
    `fecha` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_fecha`(`fecha`),
    INDEX `idx_status`(`status_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auditoria` (
    `idAuditoria` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `usuario` VARCHAR(150) NOT NULL DEFAULT '',
    `modulo` VARCHAR(50) NULL,
    `accion` VARCHAR(50) NOT NULL DEFAULT '',
    `detalle` TEXT NULL,
    `submodulo` VARCHAR(50) NULL,

    PRIMARY KEY (`idAuditoria`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracion_email` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `smtp_host` VARCHAR(150) NOT NULL DEFAULT 'smtp.gmail.com',
    `smtp_port` INTEGER NOT NULL DEFAULT 587,
    `smtp_secure` BOOLEAN NOT NULL DEFAULT false,
    `smtp_user` VARCHAR(150) NULL,
    `smtp_pass` VARCHAR(255) NULL,
    `from_name` VARCHAR(150) NULL DEFAULT 'Azkell ERP Alertas',
    `from_email` VARCHAR(150) NULL,
    `alertas_checklist` BOOLEAN NULL DEFAULT true,
    `alertas_vencimientos` BOOLEAN NULL DEFAULT true,
    `alertas_planes` BOOLEAN NULL DEFAULT true,
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracion_erp` (
    `clave` VARCHAR(50) NOT NULL,
    `valor` LONGTEXT NULL,

    PRIMARY KEY (`clave`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `destinatarios_alertas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `correo` VARCHAR(150) NOT NULL,
    `cargo` VARCHAR(80) NULL,
    `notif_1d` BOOLEAN NOT NULL DEFAULT true,
    `notif_3d` BOOLEAN NOT NULL DEFAULT true,
    `notif_7d` BOOLEAN NOT NULL DEFAULT true,
    `notif_completada` BOOLEAN NOT NULL DEFAULT false,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `notif_checklist` BOOLEAN NULL DEFAULT true,
    `notif_vencimientos` BOOLEAN NULL DEFAULT true,

    UNIQUE INDEX `uq_correo`(`correo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `integraciones_api` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clave` VARCHAR(100) NOT NULL,
    `valor` TEXT NULL,
    `descripcion` VARCHAR(255) NULL,
    `actualizado_por` VARCHAR(100) NULL,
    `actualizado_en` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `creado_en` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `clave`(`clave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reportes_programaciones_email` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre_reporte` VARCHAR(150) NOT NULL,
    `modulo` VARCHAR(100) NOT NULL,
    `destinatarios_para` TEXT NOT NULL,
    `destinatarios_cc` TEXT NULL,
    `destinatarios_cco` TEXT NULL,
    `frecuencia` VARCHAR(50) NOT NULL DEFAULT 'DIARIO',
    `hora_envio` VARCHAR(10) NULL DEFAULT '08:00',
    `dias_semana` VARCHAR(50) NULL,
    `asunto_personalizado` VARCHAR(255) NULL,
    `mensaje_personalizado` TEXT NULL,
    `incluir_pdf` BOOLEAN NULL DEFAULT true,
    `incluir_excel` BOOLEAN NULL DEFAULT false,
    `activo` BOOLEAN NULL DEFAULT true,
    `ultimo_envio` DATETIME(0) NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `color` VARCHAR(20) NULL DEFAULT '#5865F2',
    `permisos_json` TEXT NULL,
    `es_admin` BOOLEAN NULL DEFAULT false,
    `orden` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `secuencias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `modulo` VARCHAR(50) NOT NULL,
    `prefijo` VARCHAR(10) NOT NULL,
    `ultimo_numero` INTEGER NULL DEFAULT 0,

    UNIQUE INDEX `modulo`(`modulo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sesiones_activas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_correo` VARCHAR(255) NOT NULL,
    `token` TEXT NOT NULL,
    `ip` VARCHAR(80) NULL,
    `dispositivo` VARCHAR(255) NULL,
    `fecha_login` DATETIME(0) NOT NULL,
    `ultima_actividad` DATETIME(0) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios` (
    `idUsuario` VARCHAR(20) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL DEFAULT '',
    `cargo` VARCHAR(100) NOT NULL DEFAULT '',
    `correo` VARCHAR(150) NOT NULL,
    `password` VARCHAR(255) NOT NULL DEFAULT '',
    `password_visible` VARCHAR(255) NOT NULL DEFAULT '',
    `rol` VARCHAR(50) NOT NULL DEFAULT 'usuario',
    `estado` VARCHAR(20) NOT NULL DEFAULT 'Activo',
    `permisos_json` JSON NULL,
    `rol_id` INTEGER NULL,
    `ultimo_acceso` DATETIME(0) NULL,
    `ultimo_ip` VARCHAR(80) NULL,
    `ultimo_dispositivo` VARCHAR(200) NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `roles_ids` VARCHAR(255) NULL DEFAULT '[]',
    `avatar_url` TEXT NULL,
    `banner_url` TEXT NULL,
    `telefono` VARCHAR(50) NULL,
    `firma_digital` LONGTEXT NULL,
    `preferencias_json` LONGTEXT NULL,
    `dni` VARCHAR(30) NULL,

    UNIQUE INDEX `uq_correo`(`correo`),
    PRIMARY KEY (`idUsuario`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tesoreria_bancos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `banco` VARCHAR(100) NOT NULL,
    `titular` VARCHAR(150) NULL,
    `moneda` VARCHAR(20) NOT NULL DEFAULT 'SOLES',
    `tipo_cuenta` VARCHAR(50) NOT NULL DEFAULT 'CORRIENTE',
    `numero_cuenta` VARCHAR(100) NOT NULL,
    `cci` VARCHAR(100) NULL,
    `saldo_inicial` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `estado` VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tesoreria_caja` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATE NOT NULL,
    `hora` VARCHAR(10) NOT NULL DEFAULT '00:00:00',
    `fecha_valuta` DATE NULL,
    `hora_valuta` VARCHAR(10) NULL,
    `numero_constancia_deposito` VARCHAR(100) NULL,
    `numero_factura` VARCHAR(100) NULL,
    `serie` VARCHAR(50) NOT NULL DEFAULT '2026',
    `numero` VARCHAR(50) NOT NULL DEFAULT '',
    `orden_viaje` VARCHAR(100) NULL,
    `conductor` VARCHAR(150) NULL,
    `ruta_viaje` VARCHAR(255) NULL,
    `placa` VARCHAR(50) NULL,
    `autoriza` VARCHAR(150) NOT NULL,
    `motivo` VARCHAR(150) NOT NULL,
    `centro_costo` VARCHAR(150) NULL,
    `sub_motivo` VARCHAR(150) NULL,
    `modalidad_pago` VARCHAR(100) NOT NULL,
    `moneda` VARCHAR(20) NOT NULL DEFAULT 'SOLES',
    `tipo_persona` VARCHAR(50) NOT NULL,
    `persona` VARCHAR(200) NOT NULL,
    `tipo_movimiento` VARCHAR(20) NOT NULL DEFAULT 'EGRESO',
    `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `retencion_detraccion` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `importe_total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `tipo_cambio` DECIMAL(8, 4) NOT NULL DEFAULT 1.0000,
    `descripcion` TEXT NOT NULL,
    `tipo_comprobante` VARCHAR(100) NULL,
    `cuenta_bancaria_persona` VARCHAR(200) NULL,
    `cuenta_bancaria_empresa` VARCHAR(200) NULL,
    `voucher_url` TEXT NULL,
    `sustento_url` TEXT NULL,
    `observacion` TEXT NULL,
    `no_aplica_liquidacion` BOOLEAN NOT NULL DEFAULT false,
    `estado` VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE',
    `comentario` TEXT NULL,
    `usuario_creacion` VARCHAR(150) NULL,
    `usuario_aprobacion` VARCHAR(150) NULL,
    `fecha_aprobacion` DATETIME(0) NULL,
    `motivo_anulacion` TEXT NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_caja_estado`(`estado`),
    INDEX `idx_caja_fecha`(`fecha`),
    INDEX `idx_caja_numero`(`serie`, `numero`),
    INDEX `idx_caja_orden`(`orden_viaje`),
    INDEX `idx_caja_placa`(`placa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tesoreria_centros_costos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(50) NOT NULL,
    `nombre` VARCHAR(150) NOT NULL,
    `nivel` VARCHAR(50) NOT NULL DEFAULT 'Principal',
    `cuenta_contable` VARCHAR(100) NULL,
    `requiere_placa` BOOLEAN NOT NULL DEFAULT false,
    `descripcion` TEXT NULL,
    `estado` VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `codigo`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tesoreria_cuentas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orden_servicio` VARCHAR(60) NOT NULL DEFAULT '',
    `codigo_liquidacion` VARCHAR(60) NOT NULL DEFAULT '',
    `fecha_liquidacion` DATE NULL,
    `numero_viaje` VARCHAR(60) NOT NULL DEFAULT '',
    `fecha_servicio` DATE NULL,
    `razon_social` VARCHAR(150) NOT NULL DEFAULT '',
    `placa_camion` VARCHAR(50) NOT NULL DEFAULT '',
    `placa_carreta` VARCHAR(50) NOT NULL DEFAULT '',
    `placa` VARCHAR(50) NOT NULL DEFAULT '',
    `conductor` VARCHAR(150) NOT NULL DEFAULT '',
    `cliente` VARCHAR(150) NOT NULL DEFAULT '',
    `lugar` VARCHAR(150) NOT NULL DEFAULT '',
    `flete` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `comision_porcentaje` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `tarifa` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `gastos_operativos` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `base_imponible` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `igv` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `adelanto` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `detraccion` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `neto_cobrar` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `neto_cobrado` DECIMAL(12, 2) NULL,
    `mes_facturacion` VARCHAR(50) NOT NULL DEFAULT '',
    `fecha_factura` DATE NULL,
    `serie` VARCHAR(30) NOT NULL DEFAULT '',
    `factura` VARCHAR(50) NOT NULL DEFAULT '',
    `factura_documento_url` TEXT NULL,
    `nota_credito` VARCHAR(60) NOT NULL DEFAULT '',
    `nota_credito_url` TEXT NULL,
    `credito_dias` INTEGER NOT NULL DEFAULT 0,
    `fecha_cobrar` DATE NULL,
    `fecha_deposito` DATE NULL,
    `estado_servicio` VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE',
    `diferencia` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `observacion` TEXT NULL,
    `documento_url` TEXT NULL,
    `sustento_pago_url` TEXT NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_cliente`(`cliente`),
    INDEX `idx_cod_liq`(`codigo_liquidacion`),
    INDEX `idx_estado`(`estado_servicio`),
    INDEX `idx_factura`(`serie`, `factura`),
    INDEX `idx_fecha_liq`(`fecha_liquidacion`),
    INDEX `idx_num_viaje`(`numero_viaje`),
    INDEX `idx_placa`(`placa`),
    INDEX `idx_placa_cam`(`placa_camion`),
    INDEX `idx_placa_car`(`placa_carreta`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tesoreria_cuentas_historial_facturas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cuenta_id` INTEGER NOT NULL,
    `factura_anterior_serie` VARCHAR(30) NOT NULL DEFAULT '',
    `factura_anterior_numero` VARCHAR(50) NOT NULL DEFAULT '',
    `factura_anterior_url` TEXT NULL,
    `nota_credito_serie` VARCHAR(30) NOT NULL DEFAULT '',
    `nota_credito_numero` VARCHAR(50) NOT NULL DEFAULT '',
    `nota_credito_url` TEXT NULL,
    `motivo_anulacion` VARCHAR(255) NOT NULL DEFAULT '',
    `factura_nueva_serie` VARCHAR(30) NOT NULL DEFAULT '',
    `factura_nueva_numero` VARCHAR(50) NOT NULL DEFAULT '',
    `factura_nueva_url` TEXT NULL,
    `usuario_registro` VARCHAR(150) NULL DEFAULT 'ADMINISTRADOR',
    `fecha_registro` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_cuenta_id`(`cuenta_id`),
    INDEX `idx_nc`(`nota_credito_serie`, `nota_credito_numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tesoreria_liquidaciones_gastos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orden_viaje` VARCHAR(100) NOT NULL,
    `fecha` DATE NOT NULL,
    `conductor` VARCHAR(150) NULL,
    `tipo_gasto` VARCHAR(100) NOT NULL,
    `sub_motivo` VARCHAR(150) NULL,
    `tipo_comprobante` VARCHAR(50) NOT NULL DEFAULT 'BOLETA',
    `serie` VARCHAR(30) NULL,
    `numero` VARCHAR(50) NULL,
    `proveedor_ruc` VARCHAR(20) NULL,
    `proveedor_nombre` VARCHAR(200) NULL,
    `detalle` TEXT NULL,
    `importe` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `sustento_url` TEXT NULL,
    `estado` VARCHAR(50) NOT NULL DEFAULT 'APROBADO',
    `usuario_registro` VARCHAR(150) NULL,
    `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_liq_fecha`(`fecha`),
    INDEX `idx_liq_viaje`(`orden_viaje`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tesoreria_motivos_gastos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `motivo` VARCHAR(150) NOT NULL,
    `sub_motivo` VARCHAR(150) NOT NULL,
    `centro_costo_codigo` VARCHAR(50) NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NULL DEFAULT 'ACTIVO',
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_cc_codigo`(`centro_costo_codigo`),
    INDEX `idx_motivo`(`motivo`),
    INDEX `idx_submotivo`(`sub_motivo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `oc_approval_tokens` ADD CONSTRAINT `oc_approval_tokens_ibfk_1` FOREIGN KEY (`orden_compra_id`) REFERENCES `ordenes_compra`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ordenes_compra_items` ADD CONSTRAINT `ordenes_compra_items_ibfk_1` FOREIGN KEY (`orden_compra_id`) REFERENCES `ordenes_compra`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `guias_remision_items` ADD CONSTRAINT `guias_remision_items_ibfk_1` FOREIGN KEY (`guia_id`) REFERENCES `guias_remision`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rrhh_licencias` ADD CONSTRAINT `rrhh_licencias_ibfk_1` FOREIGN KEY (`personal_id`) REFERENCES `rrhh_personal`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rrhh_sst_registros` ADD CONSTRAINT `rrhh_sst_registros_ibfk_1` FOREIGN KEY (`personal_id`) REFERENCES `rrhh_personal`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rrhh_tareo` ADD CONSTRAINT `rrhh_tareo_ibfk_1` FOREIGN KEY (`personal_id`) REFERENCES `rrhh_personal`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

