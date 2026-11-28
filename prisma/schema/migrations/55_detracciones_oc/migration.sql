-- Detracciones (SPOT) en las órdenes de compra (2026-11-27). Aditiva e idempotente.
-- detraccion_tipos: catálogo editable de los servicios sujetos a detracción (código SUNAT, %, monto mínimo). Los valores de arranque deben validarse con el contador.
-- entradas_inv: tipo, % y tipo de cambio de la detracción, su monto en soles (se calcula en el servidor) y los datos del depósito hecho al pagar.

CREATE TABLE IF NOT EXISTS `detraccion_tipos` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(5) NOT NULL,
  `descripcion` VARCHAR(150) NOT NULL,
  `porcentaje` DECIMAL(5, 2) NOT NULL,
  `monto_minimo` DECIMAL(12, 2) NOT NULL DEFAULT 700.00,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_detraccion_codigo`(`codigo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `detraccion_tipos` (`codigo`, `descripcion`, `porcentaje`, `monto_minimo`) VALUES
  ('012', 'Intermediación laboral y tercerización', 12.00, 700.00),
  ('019', 'Arrendamiento de bienes', 10.00, 700.00),
  ('020', 'Mantenimiento y reparación de bienes muebles', 12.00, 700.00),
  ('021', 'Movimiento de carga', 10.00, 700.00),
  ('022', 'Otros servicios empresariales', 12.00, 700.00),
  ('024', 'Comisión mercantil', 10.00, 700.00),
  ('025', 'Fabricación de bienes por encargo', 10.00, 700.00),
  ('026', 'Servicio de transporte de personas', 10.00, 400.00),
  ('027', 'Servicio de transporte de carga', 4.00, 400.00),
  ('030', 'Contratos de construcción', 4.00, 700.00),
  ('037', 'Demás servicios gravados con el IGV', 12.00, 700.00);

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'entradas_inv' AND COLUMN_NAME = 'detraccion_codigo');
SET @sql = IF(@falta = 0, 'ALTER TABLE `entradas_inv` ADD COLUMN `detraccion_codigo` VARCHAR(5) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'entradas_inv' AND COLUMN_NAME = 'detraccion_pct');
SET @sql = IF(@falta = 0, 'ALTER TABLE `entradas_inv` ADD COLUMN `detraccion_pct` DECIMAL(5, 2) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'entradas_inv' AND COLUMN_NAME = 'detraccion_tc');
SET @sql = IF(@falta = 0, 'ALTER TABLE `entradas_inv` ADD COLUMN `detraccion_tc` DECIMAL(8, 4) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'entradas_inv' AND COLUMN_NAME = 'detraccion_monto_pen');
SET @sql = IF(@falta = 0, 'ALTER TABLE `entradas_inv` ADD COLUMN `detraccion_monto_pen` DECIMAL(14, 2) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'entradas_inv' AND COLUMN_NAME = 'detraccion_constancia');
SET @sql = IF(@falta = 0, 'ALTER TABLE `entradas_inv` ADD COLUMN `detraccion_constancia` VARCHAR(60) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'entradas_inv' AND COLUMN_NAME = 'detraccion_pagada_en');
SET @sql = IF(@falta = 0, 'ALTER TABLE `entradas_inv` ADD COLUMN `detraccion_pagada_en` DATETIME(0) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
