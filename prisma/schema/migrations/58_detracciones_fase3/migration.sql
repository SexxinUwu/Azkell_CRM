-- Detracciones, fase 3 (2026-11-27). Aditiva e idempotente.
-- detraccion_tipos: quién y cuándo editó cada tipo (el catálogo ahora lo edita un administrador desde Tesorería › Detracciones).
-- configuracion_erp: bandera de la retención del 3 % del IGV, apagada por defecto (Marsisa no es agente de retención). Solo la marca; no cambia ningún flujo.

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'detraccion_tipos' AND COLUMN_NAME = 'actualizado_por');
SET @sql = IF(@falta = 0, 'ALTER TABLE `detraccion_tipos` ADD COLUMN `actualizado_por` VARCHAR(150) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'detraccion_tipos' AND COLUMN_NAME = 'actualizado_en');
SET @sql = IF(@falta = 0, 'ALTER TABLE `detraccion_tipos` ADD COLUMN `actualizado_en` DATETIME(0) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

INSERT IGNORE INTO `configuracion_erp` (`clave`, `valor`) VALUES ('retencion_3_activa', '0');
