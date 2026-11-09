-- Foto del artículo del almacén de flota (2026-11-09). Aditiva e idempotente.
--   imagen_url  URL en S3 de la foto del artículo (obligatoria al crearlo desde la pantalla).

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'flota_articulos' AND COLUMN_NAME = 'imagen_url');
SET @sql = IF(@falta = 0, 'ALTER TABLE `flota_articulos` ADD COLUMN `imagen_url` TEXT NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
