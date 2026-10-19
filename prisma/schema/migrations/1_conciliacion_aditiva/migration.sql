-- Conciliación aditiva de esquema (2026-10-19).
-- Solo crea lo que falta en las empresas que lo tienen atrasado. No cambia, renombra ni borra nada.
-- Idempotente: si ya existe una tabla o columna, no hace nada. No toca guias_remision ni las tablas SUNAT.
-- Tablas de flota: mismas definiciones que routes/almacen-flota.js (asegurarTablas).

CREATE TABLE IF NOT EXISTS `flota_articulos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `descripcion` VARCHAR(200) NOT NULL,
  `unidad` VARCHAR(20) NULL,
  `familia` VARCHAR(80) NULL,
  `costo_referencial` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `stock_minimo` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `activo` TINYINT NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `flota_documentos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tipo` VARCHAR(12) NOT NULL,
  `fecha` DATE NOT NULL,
  `placa` VARCHAR(20) NULL,
  `referencia` VARCHAR(120) NULL,
  `observaciones` TEXT NULL,
  `usuario` VARCHAR(120) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fdoc_placa` (`placa`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `flota_movimientos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `documento_id` INT NOT NULL,
  `tipo` VARCHAR(12) NOT NULL,
  `fecha` DATE NOT NULL,
  `articulo_id` INT NOT NULL,
  `placa` VARCHAR(20) NULL,
  `cantidad` DECIMAL(14,4) NOT NULL,
  `costo_unitario` DECIMAL(14,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_fmov_articulo` (`articulo_id`),
  KEY `idx_fmov_placa` (`placa`, `articulo_id`),
  KEY `idx_fmov_doc` (`documento_id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- auditoria.ip (la usa el registro de auditoría de server.js)
SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auditoria' AND COLUMN_NAME = 'ip');
SET @sql = IF(@falta = 0, 'ALTER TABLE `auditoria` ADD COLUMN `ip` VARCHAR(45) NULL DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- cat_rampas.en_reporte (usada por server.js y por la pantalla de Status de rampa)
SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cat_rampas' AND COLUMN_NAME = 'en_reporte');
SET @sql = IF(@falta = 0, 'ALTER TABLE `cat_rampas` ADD COLUMN `en_reporte` TINYINT(1) NOT NULL DEFAULT 1', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
