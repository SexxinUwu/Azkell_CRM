-- Vida al comprar del artículo "Llanta" (2026-11-03). Aditiva e idempotente: cada cambio solo se aplica si falta.
-- Con vida_inicial = 'R0' la recepción de compra da de alta la llanta como nueva (almacén Nuevas, 100).
-- Con 'R1', 'R2' o 'R3' (llanta comprada ya reencauchada) la da de alta con esa vida en el almacén Reencauche (1142).
-- La tabla neumaticos_articulo la crea scripts/migracion_codigo_fuego.js en las bases que no la tengan: aquí se crea solo si falta.

CREATE TABLE IF NOT EXISTS `neumaticos_articulo` (
  `inventario_id` VARCHAR(20) NOT NULL,
  `medida` VARCHAR(60) NULL,
  `modelo` VARCHAR(100) NULL,
  `cocada_inicial` DECIMAL(6, 2) NULL,
  `actualizado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

  PRIMARY KEY (`inventario_id`)
);

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_articulo' AND COLUMN_NAME = 'vida_inicial');
SET @sql = IF(@falta = 0, 'ALTER TABLE `neumaticos_articulo` ADD COLUMN `vida_inicial` VARCHAR(2) NOT NULL DEFAULT ''R0''', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
