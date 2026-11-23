-- Puntos de carga y descarga por cliente, y fecha comprometida de entrega en las guías (2026-11-23).
-- Aditiva e idempotente: la tabla solo se crea si falta y cada columna solo se agrega si falta. No se toca ningún dato existente.
-- operaciones_puntos: catálogo de lugares de carga y de descarga de cada cliente (código, nombre, dirección y distrito).
-- gre_guias.fecha_comprometida / hora_comprometida: cuándo se comprometió la entrega al cliente (base del indicador On Time).

CREATE TABLE IF NOT EXISTS `operaciones_puntos` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `cliente_nombre` VARCHAR(255) NOT NULL,
  `tipo` VARCHAR(10) NOT NULL,
  `codigo` VARCHAR(30) NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `direccion` VARCHAR(255) NOT NULL,
  `ubigeo` VARCHAR(6) NULL,
  `referencia` VARCHAR(255) NULL,
  `estado` TINYINT NOT NULL DEFAULT 1,
  `creado_por` VARCHAR(150) NULL,
  `creado_en` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  INDEX `idx_punto_cliente`(`cliente_nombre`, `tipo`, `estado`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'fecha_comprometida');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `fecha_comprometida` DATE NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gre_guias' AND COLUMN_NAME = 'hora_comprometida');
SET @sql = IF(@falta = 0, 'ALTER TABLE `gre_guias` ADD COLUMN `hora_comprometida` VARCHAR(5) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
