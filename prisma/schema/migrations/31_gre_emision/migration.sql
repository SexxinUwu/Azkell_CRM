-- Guías de remisión emitidas por nosotros (2026-11-13): la GRE Transportista que se emite vía APISUNAT se guarda en gre_guias, junto con las recibidas.
-- Aditiva e idempotente: cada columna solo se agrega si falta. No toca datos existentes.
-- apisunat_*: respuesta de APISUNAT. guia_relacionada_id: la guía del cliente en que se basa. modo_emision: 'prueba' o 'produccion'.

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'placa_carreta');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `placa_carreta` VARCHAR(20) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'viaje');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `viaje` VARCHAR(60) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'guia_relacionada_id');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `guia_relacionada_id` INT NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'apisunat_document_id');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `apisunat_document_id` VARCHAR(60) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'apisunat_status');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `apisunat_status` VARCHAR(30) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'apisunat_faults');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `apisunat_faults` TEXT NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'pdf_url');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `pdf_url` TEXT NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'xml_url');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `xml_url` TEXT NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'cdr_url');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `cdr_url` TEXT NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'datos_json');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `datos_json` LONGTEXT NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'modo_emision');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `modo_emision` VARCHAR(10) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND INDEX_NAME = 'idx_gre_relacionada');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD INDEX `idx_gre_relacionada` (`guia_relacionada_id`)', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
