-- Pagos parciales de órdenes de compra con detracción (2026-11-27). Aditiva e idempotente.
-- entradas_inv_pagos: un renglón por cada pago de una orden que se paga en partes.
--   tipo CUOTA: la orden se paga en cuotas; la detracción de TODA la factura se deposita una sola vez, en la primera cuota.
--   tipo ENTREGA: el proveedor factura por partes; cada pago lleva la detracción proporcional a su parte.
--   tipo ADELANTO: pago a cuenta antes de la factura, sin detracción (su cálculo tributario está pendiente de validar con el contador).
-- parte: lo que cubre de la orden (en la moneda de la orden); neto: lo que sale del banco (parte menos la detracción retenida).

CREATE TABLE IF NOT EXISTS `entradas_inv_pagos` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `entrada_id` VARCHAR(20) NOT NULL,
  `numero` INTEGER NOT NULL,
  `tipo` VARCHAR(10) NOT NULL,
  `moneda` VARCHAR(5) NOT NULL DEFAULT 'PEN',
  `parte` DECIMAL(14, 2) NOT NULL,
  `detraccion_pen` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `detraccion_origen` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `detraccion_constancia` VARCHAR(60) NULL,
  `neto` DECIMAL(14, 2) NOT NULL,
  `numero_operacion` VARCHAR(100) NULL,
  `cuenta_origen` VARCHAR(250) NULL,
  `factura_ref` VARCHAR(100) NULL,
  `voucher_url` TEXT NULL,
  `usuario` VARCHAR(150) NULL,
  `creado_en` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_entradas_inv_pagos_numero`(`entrada_id`, `numero`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
