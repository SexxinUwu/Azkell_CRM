-- Notas de crédito sugeridas en una orden de compra (2026-11-11). Aditiva e idempotente: la columna solo se agrega si falta.
-- nc_sugeridas: JSON con los ids de las notas de crédito que quien genera la orden pide descontar al pagarla.
-- Es solo una sugerencia: Tesorería ve esas notas ya marcadas y confirma el descuento al pagar.

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'entradas_inv' AND COLUMN_NAME = 'nc_sugeridas');
SET @sql = IF(@falta = 0, 'ALTER TABLE `entradas_inv` ADD COLUMN `nc_sugeridas` VARCHAR(255) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
