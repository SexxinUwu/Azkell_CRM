-- Neumáticos (2026-11-25). La cocada inicial (remanente_inicial) era entera y redondeaba 17,5 mm a 18. Pasa a decimal, igual que el remanente actual.
-- Idempotente: solo cambia la columna si todavía es entera. Los valores enteros que ya hay se conservan.

SET @tipo := (SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND COLUMN_NAME = 'remanente_inicial');
SET @sql := IF(@tipo = 'int', 'ALTER TABLE `neumaticos_hoja_vida` MODIFY COLUMN `remanente_inicial` DECIMAL(4,1) NULL DEFAULT 18.0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
