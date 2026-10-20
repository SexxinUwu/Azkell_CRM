-- OC de servicio y OT (2026-10-22). Aditiva e idempotente.
-- Las OC que ya estaban vinculadas a una OT conservan 1 (siguen sumando al costo de la OT).
-- Las OC nuevas quedan en 0: no suman hasta que el usuario las agrega desde "Servicios de terceros".
SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'entradas_inv' AND COLUMN_NAME = 'ot_servicio_agregado');
SET @sql = IF(@falta = 0, 'ALTER TABLE `entradas_inv` ADD COLUMN `ot_servicio_agregado` TINYINT(1) NOT NULL DEFAULT 1', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
ALTER TABLE `entradas_inv` ALTER COLUMN `ot_servicio_agregado` SET DEFAULT 0;
