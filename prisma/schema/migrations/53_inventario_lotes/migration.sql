-- Almacén (2026-11-26). Lotes de inventario: cada lote es una capa de costo de un artículo (Lote 1, Lote 2…).
-- Una compra nueva con otro costo abre un lote nuevo; con el mismo costo se suma al lote que aún tiene saldo.
-- Cada salida despachada guarda de qué lote(s) salió, para costearla con el costo real de cada lote.
-- Aditiva e idempotente: no toca ninguna tabla existente. El stock sigue calculándose como siempre; los lotes sirven para costo y etiquetas.

CREATE TABLE IF NOT EXISTS `inventario_lotes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `inventario_id` VARCHAR(20) NOT NULL,
  `numero` INT NOT NULL,
  `costo_unitario` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `cantidad_inicial` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `saldo` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `origen` VARCHAR(20) NOT NULL DEFAULT 'RECEPCION',
  `recepcion_id` INT NULL,
  `entrada_id` VARCHAR(50) NULL,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `creado_en` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inv_lote_numero` (`inventario_id`, `numero`),
  KEY `idx_inv_lote_saldo` (`inventario_id`, `saldo`)
);

CREATE TABLE IF NOT EXISTS `salida_lotes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `salida_id` VARCHAR(20) NOT NULL,
  `detalle_id` INT NOT NULL,
  `inventario_id` VARCHAR(20) NOT NULL,
  `lote_id` INT NOT NULL,
  `cantidad` DECIMAL(14,4) NOT NULL,
  `costo_unitario` DECIMAL(14,4) NOT NULL,
  `creado_en` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_salida_lotes_salida` (`salida_id`),
  KEY `idx_salida_lotes_detalle` (`detalle_id`),
  KEY `idx_salida_lotes_lote` (`lote_id`)
);
