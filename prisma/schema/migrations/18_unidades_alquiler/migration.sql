-- Unidades alquiladas y solicitudes de actualización de documentos (2026-11-09). Aditiva e idempotente.
--   alquilada_a       empresa a la que se alquila la unidad (vacío = no está alquilada)
--   alquiler_desde    desde cuándo; el alquiler es indefinido, así que no hay fecha de fin
--   docs_responsable  quién actualiza los documentos: PROPIA (nosotros) o ARRENDATARIA (la empresa que alquila)
--   alquiler_nota     lo acordado en el convenio
--   docs_solicitudes  cada vez que se le pide a la empresa responsable que actualice los documentos

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'placas' AND COLUMN_NAME = 'alquilada_a');
SET @sql = IF(@falta = 0, 'ALTER TABLE `placas` ADD COLUMN `alquilada_a` VARCHAR(150) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'placas' AND COLUMN_NAME = 'alquiler_desde');
SET @sql = IF(@falta = 0, 'ALTER TABLE `placas` ADD COLUMN `alquiler_desde` DATE NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'placas' AND COLUMN_NAME = 'docs_responsable');
SET @sql = IF(@falta = 0, 'ALTER TABLE `placas` ADD COLUMN `docs_responsable` VARCHAR(12) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'placas' AND COLUMN_NAME = 'alquiler_nota');
SET @sql = IF(@falta = 0, 'ALTER TABLE `placas` ADD COLUMN `alquiler_nota` VARCHAR(500) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS `docs_solicitudes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `placa` VARCHAR(20) NOT NULL,
  `empresa` VARCHAR(150) NULL,
  `detalle` TEXT NULL,
  `canal` VARCHAR(20) NOT NULL DEFAULT 'WHATSAPP',
  `solicitado_por` VARCHAR(150) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_docs_solicitudes_placa` (`placa`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
