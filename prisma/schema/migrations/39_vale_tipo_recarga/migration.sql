-- Tipo de recarga del vale de combustible (2026-11-18): RECARGA_IDA, RECARGA_VUELTA o FIN_DE_SERVICIO.
-- Es lo mismo que Marsisa trae de MarsisaSoft y lo que usa el análisis de combustible para separar el consumo de la ida y de la vuelta y cerrar el viaje.
-- Aditiva e idempotente. Los vales antiguos se rellenan según el servicio al que pertenecen: regreso = vuelta, lo demás = ida.

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'viaje_vales_combustible' AND COLUMN_NAME = 'tipo_recarga');
SET @sql = IF(@falta = 0, 'ALTER TABLE `viaje_vales_combustible` ADD COLUMN `tipo_recarga` VARCHAR(20) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

UPDATE `viaje_vales_combustible` v
LEFT JOIN `operaciones_ordenes_servicio` os ON os.codigo_orden COLLATE utf8mb4_unicode_ci = v.orden_servicio COLLATE utf8mb4_unicode_ci
SET v.tipo_recarga = IF(COALESCE(os.es_retorno, 0) = 1, 'RECARGA_VUELTA', 'RECARGA_IDA')
WHERE v.tipo_recarga IS NULL;
