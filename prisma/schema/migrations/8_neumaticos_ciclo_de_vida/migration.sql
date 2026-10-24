-- Ciclo de vida de neumáticos (2026-10-24). Aditiva e idempotente: cada cambio solo se aplica si falta.
-- Llanta física con código único (codigo_llanta), vida R0-R3, reencauches, costos, estado del ciclo y almacén.
-- El campo `estado` existente NO se toca: lo usa el código vivo de inspecciones ('NUEVA' / 'RENCAUCHADA').
-- Nuevas tablas: neumaticos_instalaciones (periodos en unidad) y neumaticos_movimientos (kardex).

-- 1. Columnas nuevas en neumaticos_hoja_vida
SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND COLUMN_NAME = 'codigo_llanta');
SET @sql = IF(@falta = 0, 'ALTER TABLE `neumaticos_hoja_vida` ADD COLUMN `codigo_llanta` VARCHAR(30) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND COLUMN_NAME = 'vida');
SET @sql = IF(@falta = 0, 'ALTER TABLE `neumaticos_hoja_vida` ADD COLUMN `vida` VARCHAR(2) NULL DEFAULT ''R0''', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND COLUMN_NAME = 'contador_reencauches');
SET @sql = IF(@falta = 0, 'ALTER TABLE `neumaticos_hoja_vida` ADD COLUMN `contador_reencauches` INTEGER NULL DEFAULT 0', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND COLUMN_NAME = 'costo_reencauches');
SET @sql = IF(@falta = 0, 'ALTER TABLE `neumaticos_hoja_vida` ADD COLUMN `costo_reencauches` DECIMAL(10, 2) NULL DEFAULT 0.00', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND COLUMN_NAME = 'estado_ciclo');
SET @sql = IF(@falta = 0, 'ALTER TABLE `neumaticos_hoja_vida` ADD COLUMN `estado_ciclo` VARCHAR(20) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND COLUMN_NAME = 'almacen_id');
SET @sql = IF(@falta = 0, 'ALTER TABLE `neumaticos_hoja_vida` ADD COLUMN `almacen_id` INTEGER NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 2. Índices de neumaticos_hoja_vida (codigo_llanta es único; NULL se permite en varias filas)
SET @falta = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND INDEX_NAME = 'uq_codigo_llanta');
SET @sql = IF(@falta = 0, 'CREATE UNIQUE INDEX `uq_codigo_llanta` ON `neumaticos_hoja_vida` (`codigo_llanta`)', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND INDEX_NAME = 'idx_almacen');
SET @sql = IF(@falta = 0, 'CREATE INDEX `idx_almacen` ON `neumaticos_hoja_vida` (`almacen_id`)', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'neumaticos_hoja_vida' AND INDEX_NAME = 'idx_estado_ciclo');
SET @sql = IF(@falta = 0, 'CREATE INDEX `idx_estado_ciclo` ON `neumaticos_hoja_vida` (`estado_ciclo`)', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 3. Backfill inicial de estado_ciclo a partir de estado_operativo / placa_actual.
-- Solo toca filas sin estado_ciclo, así que es seguro re-ejecutarla.
-- Las llantas sin código de llanta quedan sin código: se asignan después, desde el sistema.
UPDATE `neumaticos_hoja_vida`
SET `estado_ciclo` = CASE
  WHEN `estado_operativo` = 'Desecho' THEN 'desechado'
  WHEN `estado_operativo` = 'En Rencauche' THEN 'en_reencauche'
  WHEN `estado_operativo` = 'Montada' AND `placa_actual` IS NOT NULL THEN 'en_unidad'
  ELSE 'en_almacen'
END
WHERE `estado_ciclo` IS NULL;

-- 4. Tabla de instalaciones (periodos de una llanta en una unidad)
CREATE TABLE IF NOT EXISTS `neumaticos_instalaciones` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `id_neumatico` VARCHAR(50) NOT NULL,
  `placa` VARCHAR(20) NOT NULL,
  `posicion` VARCHAR(10) NOT NULL,
  `fecha_in` DATE NOT NULL,
  `km_in` INTEGER NOT NULL DEFAULT 0,
  `fecha_out` DATE NULL,
  `km_out` INTEGER NULL,
  `motivo_salida` VARCHAR(200) NULL,
  `usuario` VARCHAR(100) NULL,
  `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

  PRIMARY KEY (`id`),
  INDEX `idx_neu_inst_neumatico`(`id_neumatico`, `fecha_out`),
  INDEX `idx_neu_inst_placa_pos`(`placa`, `posicion`, `fecha_out`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 5. Tabla de movimientos (kardex de cada llanta)
CREATE TABLE IF NOT EXISTS `neumaticos_movimientos` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `id_neumatico` VARCHAR(50) NOT NULL,
  `tipo` VARCHAR(30) NOT NULL,
  `almacen_origen_id` INTEGER NULL,
  `almacen_destino_id` INTEGER NULL,
  `placa` VARCHAR(20) NULL,
  `posicion` VARCHAR(10) NULL,
  `km` INTEGER NULL DEFAULT 0,
  `fecha` DATETIME(0) NOT NULL,
  `usuario` VARCHAR(100) NULL,
  `observacion` TEXT NULL,
  `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

  PRIMARY KEY (`id`),
  INDEX `idx_neu_mov_neumatico_fecha`(`id_neumatico`, `fecha`),
  INDEX `idx_neu_mov_tipo`(`tipo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
