-- Ubigeo y dirección del punto de carga y de entrega del servicio (2026-11-12). Aditiva e idempotente.

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'ubigeo_origen');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_servicio` ADD COLUMN `ubigeo_origen` VARCHAR(6) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'direccion_origen');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_servicio` ADD COLUMN `direccion_origen` VARCHAR(255) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'ubigeo_destino');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_servicio` ADD COLUMN `ubigeo_destino` VARCHAR(6) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'direccion_destino');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_servicio` ADD COLUMN `direccion_destino` VARCHAR(255) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
