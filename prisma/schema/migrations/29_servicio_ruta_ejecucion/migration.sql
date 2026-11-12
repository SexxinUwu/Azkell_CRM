-- Servicio: ruta (de la matriz de combustible), quién transporta (propio o tercero) e intermediario (2026-11-12). Aditiva e idempotente.

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'ruta');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_servicio` ADD COLUMN `ruta` VARCHAR(150) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'ejecucion');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_servicio` ADD COLUMN `ejecucion` VARCHAR(10) NOT NULL DEFAULT ''PROPIO''', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'intermediario');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_servicio` ADD COLUMN `intermediario` VARCHAR(255) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
