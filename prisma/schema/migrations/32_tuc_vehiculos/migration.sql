-- TUC y autorización especial del vehículo (2026-11-13), para la GRE Transportista. Aditiva e idempotente: cada columna solo se agrega si falta.
-- placas.tuc / placas.autorizacion_mtc: certificado de habilitación vehicular y autorización especial de cada placa (se registran una vez).
-- gre_guias.vehiculo_tuc / vehiculo_autorizacion: los que trae la guía del cliente cuando incluye los datos del vehículo.

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'placas' AND COLUMN_NAME = 'tuc');
SET @sql = IF(@falta = 0, 'ALTER TABLE `placas` ADD COLUMN `tuc` VARCHAR(30) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'placas' AND COLUMN_NAME = 'autorizacion_mtc');
SET @sql = IF(@falta = 0, 'ALTER TABLE `placas` ADD COLUMN `autorizacion_mtc` VARCHAR(30) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'vehiculo_tuc');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `vehiculo_tuc` VARCHAR(30) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'vehiculo_autorizacion');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `vehiculo_autorizacion` VARCHAR(30) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
