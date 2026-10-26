-- Carrocería del acta de entrega (2026-10-26). Aditiva e idempotente: la columna solo se agrega si falta.
-- Así el acta recuerda si la unidad es furgón o plataforma al reabrirla. Los registros existentes quedan en 'furgon'.

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seg_entrega_vehiculos' AND COLUMN_NAME = 'carroceria');
SET @sql = IF(@falta = 0, 'ALTER TABLE `seg_entrega_vehiculos` ADD COLUMN `carroceria` VARCHAR(50) NULL DEFAULT ''furgon''', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
