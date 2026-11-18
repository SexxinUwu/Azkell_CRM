-- Facturación por liquidación (2026-11-18): una factura puede agrupar varios servicios en UNA sola línea («por el servicio de transporte del 27/10 al 14/11…»).
-- Hasta ahora el vínculo servicio ↔ factura estaba en las líneas; con una línea agrupada ya no alcanza. Esta tabla guarda qué servicios cubre cada comprobante,
-- y se agrega el N.º de liquidación del comprobante. Aditiva e idempotente: solo crea y copia lo que ya existe (no modifica datos).

CREATE TABLE IF NOT EXISTS `facturacion_servicios` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `comprobante_id` INT NOT NULL,
  `orden_servicio` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fserv_comp` (`comprobante_id`),
  KEY `idx_fserv_os` (`orden_servicio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'facturacion_comprobantes' AND COLUMN_NAME = 'liquidacion');
SET @sql = IF(@falta = 0, 'ALTER TABLE `facturacion_comprobantes` ADD COLUMN `liquidacion` VARCHAR(60) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- Los comprobantes ya emitidos conservan su vínculo con los servicios de sus líneas
INSERT INTO `facturacion_servicios` (`comprobante_id`, `orden_servicio`)
SELECT DISTINCT fi.`comprobante_id`, fi.`orden_servicio`
FROM `facturacion_items` fi
WHERE fi.`orden_servicio` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `facturacion_servicios` fs WHERE fs.`comprobante_id` = fi.`comprobante_id` AND fs.`orden_servicio` = fi.`orden_servicio`);
