-- Facturación: la numeración y la unicidad del comprobante pasan a ser POR AMBIENTE (2026-11-18).
-- Antes el índice único era (tipo, serie, número): una factura de prueba F001-00000001 impediría emitir la F001-00000001 real al pasar a producción.
-- Ahora es (tipo, serie, número, ambiente): las pruebas y la producción llevan cada una su propia numeración.
-- Idempotente y sin tocar datos: solo cambia el índice.

SET @listo = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'facturacion_comprobantes' AND INDEX_NAME = 'uq_comprobante_numero' AND COLUMN_NAME = 'modo_emision');
SET @sql = IF(@listo = 0,
  'ALTER TABLE `facturacion_comprobantes` DROP INDEX `uq_comprobante_numero`, ADD UNIQUE KEY `uq_comprobante_numero` (`tipo_doc`, `serie`, `numero`, `modo_emision`)',
  'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
