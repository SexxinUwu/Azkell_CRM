-- Cuenta bancaria del conductor (2026-10-29). Aditiva e idempotente: cada columna solo se agrega si falta.
-- banco y numero_cuenta se usan para autollenar la cuenta al elegir al conductor (órdenes de servicio, caja).

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conductores' AND COLUMN_NAME = 'banco');
SET @sql = IF(@falta = 0, 'ALTER TABLE `conductores` ADD COLUMN `banco` VARCHAR(50) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conductores' AND COLUMN_NAME = 'numero_cuenta');
SET @sql = IF(@falta = 0, 'ALTER TABLE `conductores` ADD COLUMN `numero_cuenta` VARCHAR(50) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
