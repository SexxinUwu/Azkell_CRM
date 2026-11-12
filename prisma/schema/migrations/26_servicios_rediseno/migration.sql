-- Rediseño de Órdenes de servicio (2026-11-12). Idempotente: cada columna se agrega o quita solo si hace falta.
-- El servicio es lo que se vende; el viaje es lo que ejecuta la unidad. Conductor, placas y terceros viven en el viaje.

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'origen');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_servicio` ADD COLUMN `origen` VARCHAR(150) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'destino');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_servicio` ADD COLUMN `destino` VARCHAR(150) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'descripcion_carga');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_servicio` ADD COLUMN `descripcion_carga` VARCHAR(255) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'peso_estimado');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_servicio` ADD COLUMN `peso_estimado` DECIMAL(12,2) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'fecha_entrega');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_servicio` ADD COLUMN `fecha_entrega` DATE NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_viaje' AND COLUMN_NAME = 'ejecucion');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_viaje` ADD COLUMN `ejecucion` VARCHAR(10) NOT NULL DEFAULT ''PROPIO''', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_viaje' AND COLUMN_NAME = 'tercero_nombre');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_viaje` ADD COLUMN `tercero_nombre` VARCHAR(200) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_viaje' AND COLUMN_NAME = 'tercero_ruc');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_viaje` ADD COLUMN `tercero_ruc` VARCHAR(20) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_viaje' AND COLUMN_NAME = 'tercero_costo');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_viaje` ADD COLUMN `tercero_costo` DECIMAL(12,2) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_viaje' AND COLUMN_NAME = 'tercero_moneda');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_viaje` ADD COLUMN `tercero_moneda` VARCHAR(20) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_viaje' AND COLUMN_NAME = 'tercero_documento');
SET @sql = IF(@existe = 0, 'ALTER TABLE `operaciones_ordenes_viaje` ADD COLUMN `tercero_documento` VARCHAR(100) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'puntos_carga');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `puntos_carga`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'puntos_destino');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `puntos_destino`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'viaje_asignado');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `viaje_asignado`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'estado_viaje');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `estado_viaje`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'estado_liquidacion');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `estado_liquidacion`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'estado_descarga');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `estado_descarga`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'conductor');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `conductor`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'placa_tracto');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `placa_tracto`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'placa_carreta');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `placa_carreta`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'ruta_sistema');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `ruta_sistema`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'tipo_medida');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `tipo_medida`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'costo_medida');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `costo_medida`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'cargos_adicionales');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `cargos_adicionales`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'descuentos');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `descuentos`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'subtotal');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `subtotal`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'igv');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `igv`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'kilometraje_fin');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `kilometraje_fin`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'tipo_costo');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `tipo_costo`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'modalidad_ejecucion');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `modalidad_ejecucion`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'proveedor_tercero_nombre');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `proveedor_tercero_nombre`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'proveedor_tercero_ruc');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `proveedor_tercero_ruc`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'costo_tercero');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `costo_tercero`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'doc_tercero');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `doc_tercero`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operaciones_ordenes_servicio' AND COLUMN_NAME = 'fecha_fin');
SET @sql = IF(@existe = 1, 'ALTER TABLE `operaciones_ordenes_servicio` DROP COLUMN `fecha_fin`', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
