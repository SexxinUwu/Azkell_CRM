-- Gastos del viaje ligados al SERVICIO (2026-11-18). Sirve para saber cuánto costó cada servicio (ida o regreso) y su rentabilidad.
-- Aditiva e idempotente: agrega la columna orden_servicio (código de la orden de servicio) a los vales de combustible y a los gastos rendidos del viaje.
-- Los registros antiguos de un viaje con UN solo servicio se asignan solos; los de viajes con varios servicios quedan en blanco para asignarlos a mano.

-- 1) vales de combustible
SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'viaje_vales_combustible' AND COLUMN_NAME = 'orden_servicio');
SET @sql = IF(@falta = 0, 'ALTER TABLE `viaje_vales_combustible` ADD COLUMN `orden_servicio` VARCHAR(40) NULL, ADD KEY `idx_vale_servicio` (`orden_servicio`)', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 2) gastos rendidos del viaje (liquidación)
SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tesoreria_liquidaciones_gastos' AND COLUMN_NAME = 'orden_servicio');
SET @sql = IF(@falta = 0, 'ALTER TABLE `tesoreria_liquidaciones_gastos` ADD COLUMN `orden_servicio` VARCHAR(40) NULL, ADD KEY `idx_liq_servicio` (`orden_servicio`)', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 3) asignación automática: viajes con un único servicio (solo donde aún no hay servicio asignado)
UPDATE `viaje_vales_combustible` v
JOIN (SELECT viaje, MIN(orden) AS orden FROM `operaciones_ordenes_viaje_rutas` GROUP BY viaje HAVING COUNT(DISTINCT orden) = 1) r
  ON r.viaje COLLATE utf8mb4_unicode_ci = v.viaje COLLATE utf8mb4_unicode_ci
SET v.orden_servicio = r.orden
WHERE v.orden_servicio IS NULL;

UPDATE `tesoreria_liquidaciones_gastos` g
JOIN (SELECT viaje, MIN(orden) AS orden FROM `operaciones_ordenes_viaje_rutas` GROUP BY viaje HAVING COUNT(DISTINCT orden) = 1) r
  ON UPPER(TRIM(r.viaje)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(g.orden_viaje)) COLLATE utf8mb4_unicode_ci
SET g.orden_servicio = r.orden
WHERE g.orden_servicio IS NULL;
