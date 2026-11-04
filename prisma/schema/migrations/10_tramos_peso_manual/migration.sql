-- Peso de tramo editado a mano (2026-11-05). Aditiva e idempotente.
-- peso_manual = 1 cuando alguien corrige el peso del tramo en Órdenes de viaje. La sincronización con MarsisaSoft
-- ya no sobrescribe ese peso (antes el valor de MarsisaSoft lo revertía en cada sincronización).
-- Si la tabla no existe en la empresa, no hace nada.

SET @existe = (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marsisa_ordenes_viaje_rutas');
SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marsisa_ordenes_viaje_rutas' AND COLUMN_NAME = 'peso_manual');
SET @sql = IF(@existe = 1 AND @falta = 0,
  'ALTER TABLE `marsisa_ordenes_viaje_rutas` ADD COLUMN `peso_manual` TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
