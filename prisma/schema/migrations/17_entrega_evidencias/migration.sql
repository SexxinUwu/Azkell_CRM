-- Evidencias fotográficas del acta de entrega de vehículos (2026-11-09). Aditiva e idempotente.
--   evidencias_json  lista (JSON) de URLs en S3 de las fotos del acta; no entran en el PDF, solo se ven en el detalle.

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seg_entrega_vehiculos' AND COLUMN_NAME = 'evidencias_json');
SET @sql = IF(@falta = 0, 'ALTER TABLE `seg_entrega_vehiculos` ADD COLUMN `evidencias_json` TEXT NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
