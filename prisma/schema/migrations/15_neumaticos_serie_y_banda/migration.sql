-- Datos de la carcasa y de la banda de cada llanta (2026-11-04). Aditiva e idempotente.
--   serie        número de serie de la carcasa (lo imprime el fabricante); el DOT va en codigo_dot (ya existía).
--   banda_marca  marca de la banda de reencauche (p. ej. VIPAL).
--   banda_diseno diseño de la banda (p. ej. PBA60, PBD61).
--   banda_ancho  ancho de la banda en mm (p. ej. 225, 240, 250).
-- La marca y el modelo de la llanta pasan a ser los de la carcasa (p. ej. GOODYEAR / KMAX S210); la vida (R1…) dice que está reencauchada.

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND COLUMN_NAME = 'serie');
SET @sql = IF(@falta = 0, 'ALTER TABLE `neumaticos_hoja_vida` ADD COLUMN `serie` VARCHAR(40) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND COLUMN_NAME = 'banda_marca');
SET @sql = IF(@falta = 0, 'ALTER TABLE `neumaticos_hoja_vida` ADD COLUMN `banda_marca` VARCHAR(40) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND COLUMN_NAME = 'banda_diseno');
SET @sql = IF(@falta = 0, 'ALTER TABLE `neumaticos_hoja_vida` ADD COLUMN `banda_diseno` VARCHAR(40) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND COLUMN_NAME = 'banda_ancho');
SET @sql = IF(@falta = 0, 'ALTER TABLE `neumaticos_hoja_vida` ADD COLUMN `banda_ancho` INTEGER NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND INDEX_NAME = 'idx_serie');
SET @sql = IF(@falta = 0, 'CREATE INDEX `idx_serie` ON `neumaticos_hoja_vida` (`serie`)', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
