-- Quién anuló una orden de compra y cuándo (2026-11-11). Aditiva e idempotente: cada columna solo se agrega si falta.
-- Antes solo se guardaba el motivo; la pantalla mostraba al aprobador como si fuera quien anuló.

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'entradas_inv' AND COLUMN_NAME = 'anulado_por');
SET @sql = IF(@falta = 0, 'ALTER TABLE `entradas_inv` ADD COLUMN `anulado_por` VARCHAR(150) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'entradas_inv' AND COLUMN_NAME = 'fecha_anulacion');
SET @sql = IF(@falta = 0, 'ALTER TABLE `entradas_inv` ADD COLUMN `fecha_anulacion` DATETIME NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
