-- Ubigeo (distrito) del cliente (2026-11-12): sirve para completar solo el punto de carga o entrega de los servicios. Aditiva e idempotente.

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'ubigeo');
SET @sql = IF(@existe = 0, 'ALTER TABLE `clientes` ADD COLUMN `ubigeo` VARCHAR(6) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
