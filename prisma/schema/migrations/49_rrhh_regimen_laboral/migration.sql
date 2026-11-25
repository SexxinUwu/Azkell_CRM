-- Personal (RRHH), 2026-11-25. Aditiva e idempotente: regimen laboral (MYPE, general…) y segunda categoría de la licencia de conducir.
-- Salen del Excel actualizado de empleados; la ficha de personal no tenía dónde guardarlos.

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rrhh_personal' AND COLUMN_NAME = 'regimen_laboral');
SET @sql := IF(@existe = 0, 'ALTER TABLE `rrhh_personal` ADD COLUMN `regimen_laboral` VARCHAR(30) NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rrhh_personal' AND COLUMN_NAME = 'licencia_categoria_2');
SET @sql := IF(@existe = 0, 'ALTER TABLE `rrhh_personal` ADD COLUMN `licencia_categoria_2` VARCHAR(20) NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
