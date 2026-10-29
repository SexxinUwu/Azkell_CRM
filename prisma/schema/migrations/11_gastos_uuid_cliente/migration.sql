-- Gastos del portal del conductor sin señal (2026-10-29). Aditiva e idempotente: cada cambio solo se aplica si falta.
-- uuid_cliente: identificador que genera el teléfono para cada gasto. Si el envío se repite (se perdió la señal
-- después de guardar), el servidor reconoce el UUID y no registra el gasto dos veces.
-- UNIQUE admite varios NULL: los gastos de Tesorería no lo llenan.

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tesoreria_liquidaciones_gastos' AND COLUMN_NAME = 'uuid_cliente');
SET @sql = IF(@falta = 0, 'ALTER TABLE `tesoreria_liquidaciones_gastos` ADD COLUMN `uuid_cliente` VARCHAR(36) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tesoreria_liquidaciones_gastos' AND INDEX_NAME = 'uq_liq_uuid_cliente');
SET @sql = IF(@falta = 0, 'CREATE UNIQUE INDEX `uq_liq_uuid_cliente` ON `tesoreria_liquidaciones_gastos` (`uuid_cliente`)', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
