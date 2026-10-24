-- Recorrido GPS por viaje (2026-10-24). Aditiva e idempotente: cada columna solo se agrega si falta.
-- km_recorrido_gps: km que midió Wialon para el viaje, guardado al cerrar la orden (no se vuelve a consultar).
-- km_recorrido_gps_fuente: 'WIALON' si viene de Wialon; 'ODOMETRO' si no hubo dato (km_recorrido_gps queda NULL).

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_viaje' AND COLUMN_NAME = 'km_recorrido_gps');
SET @sql = IF(@falta = 0, 'ALTER TABLE `operaciones_ordenes_viaje` ADD COLUMN `km_recorrido_gps` DECIMAL(10, 1) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_viaje' AND COLUMN_NAME = 'km_recorrido_gps_fuente');
SET @sql = IF(@falta = 0, 'ALTER TABLE `operaciones_ordenes_viaje` ADD COLUMN `km_recorrido_gps_fuente` VARCHAR(20) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
