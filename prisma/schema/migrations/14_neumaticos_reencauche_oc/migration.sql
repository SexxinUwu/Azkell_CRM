-- Orden de servicio de reencauche (2026-11-04). Aditiva e idempotente.
-- Une una orden de compra (entradas_inv) con los códigos de las llantas que se envían a la reformadora:
--   pendiente → en_reformadora (al despachar con guía) → aprobada | rechazada (al recepcionar la orden) | anulada.
-- abierta_id vale el id de la llanta solo mientras la orden sigue abierta (pendiente o en_reformadora);
-- su índice UNIQUE impide que una llanta esté en dos órdenes abiertas a la vez (MySQL no tiene índices parciales).

CREATE TABLE IF NOT EXISTS `neumaticos_reencauche_oc` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `oc_id` VARCHAR(20) NOT NULL,
  `inventario_id` VARCHAR(20) NOT NULL,
  `id_neumatico` VARCHAR(50) NOT NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  `costo` DECIMAL(14, 4) NULL,
  `guia` VARCHAR(100) NULL,
  `recepcion_id` INTEGER NULL,
  `usuario` VARCHAR(100) NULL,
  `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  `despachado_en` DATETIME(0) NULL,
  `resuelto_en` DATETIME(0) NULL,
  `abierta_id` VARCHAR(50) GENERATED ALWAYS AS (IF(`estado` IN ('pendiente', 'en_reformadora'), `id_neumatico`, NULL)) STORED,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_reenc_abierta`(`abierta_id`),
  INDEX `idx_reenc_oc`(`oc_id`, `estado`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
