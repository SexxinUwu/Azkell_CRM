-- Notas de crédito de proveedores (2026-11-11). Aditiva e idempotente: solo crea tablas nuevas, no toca datos existentes.
--   compras_notas_credito     la nota de crédito que emite el proveedor (devolución de mercadería, descuento, anulación) con su saldo a favor
--   compras_nc_aplicaciones   cada vez que un saldo a favor se aplica al pago de una orden de compra (compensación sin movimiento de dinero)
--   compras_nc_historial      línea de vida de cada nota (registro, aprobación, aplicaciones, reembolso, anulación)

CREATE TABLE IF NOT EXISTS `compras_notas_credito` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(20) NOT NULL,
  `proveedor_id` VARCHAR(20) NULL,
  `proveedor_nombre` VARCHAR(200) NOT NULL,
  `proveedor_ruc` VARCHAR(20) NULL,
  `serie` VARCHAR(10) NOT NULL,
  `numero` VARCHAR(20) NOT NULL,
  `fecha_emision` DATE NOT NULL,
  `moneda` VARCHAR(3) NOT NULL DEFAULT 'PEN',
  `base` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `igv` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `total` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `saldo` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `motivo_sunat` VARCHAR(2) NULL,
  `motivo_texto` VARCHAR(255) NULL,
  `oc_origen` VARCHAR(20) NULL,
  `referencia_devolucion` VARCHAR(150) NULL,
  `forma` VARCHAR(10) NOT NULL DEFAULT 'APLICAR',
  `estado` VARCHAR(20) NOT NULL DEFAULT 'REGISTRADA',
  `archivo_url` TEXT NULL,
  `observaciones` TEXT NULL,
  `registrado_por` VARCHAR(150) NULL,
  `aprobado_por` VARCHAR(150) NULL,
  `fecha_aprobacion` DATETIME NULL,
  `anulado_por` VARCHAR(150) NULL,
  `motivo_anulacion` VARCHAR(255) NULL,
  `reembolso_fecha` DATE NULL,
  `reembolso_constancia` VARCHAR(100) NULL,
  `reembolso_url` TEXT NULL,
  `reembolso_caja_id` INT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_nc_codigo` (`codigo`),
  KEY `idx_nc_proveedor` (`proveedor_id`),
  KEY `idx_nc_estado` (`estado`),
  KEY `idx_nc_documento` (`proveedor_ruc`, `serie`, `numero`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `compras_nc_aplicaciones` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nc_id` INT NOT NULL,
  `entrada_id` VARCHAR(20) NOT NULL,
  `monto` DECIMAL(14,2) NOT NULL,
  `moneda` VARCHAR(3) NOT NULL DEFAULT 'PEN',
  `estado` VARCHAR(12) NOT NULL DEFAULT 'VIGENTE',
  `usuario` VARCHAR(150) NULL,
  `observacion` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ncap_nc` (`nc_id`),
  KEY `idx_ncap_entrada` (`entrada_id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `compras_nc_historial` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nc_id` INT NOT NULL,
  `accion` VARCHAR(40) NOT NULL,
  `detalle` TEXT NULL,
  `usuario` VARCHAR(150) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_nchis_nc` (`nc_id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
