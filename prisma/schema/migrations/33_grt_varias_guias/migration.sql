-- GRE Transportista con varias guías de remitente (2026-11-13). Aditiva e idempotente.
-- gre_guias.guias_relacionadas_ids: ids (separados por coma) de las guías de remitente que cubre una GRE Transportista emitida.

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'guias_relacionadas_ids');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `guias_relacionadas_ids` VARCHAR(255) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
