-- Vales de combustible ligados al viaje (2026-11-14). Aditiva e idempotente.
-- viaje_vales_combustible: un vale por carga de combustible; genera su caja en tesoreria_caja (caja_id).
-- tesoreria_caja.origen / origen_id: de dónde nace la caja (VALE_COMBUSTIBLE, ...), para Movimientos.

CREATE TABLE IF NOT EXISTS `viaje_vales_combustible` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(30) NOT NULL,
  `viaje` VARCHAR(60) NOT NULL,
  `placa` VARCHAR(20) NOT NULL DEFAULT '',
  `conductor` VARCHAR(150) NOT NULL DEFAULT '',
  `conductor_doc` VARCHAR(20) NULL,
  `fecha` DATE NOT NULL,
  `hora` VARCHAR(10) NULL,
  `estacion_nombre` VARCHAR(200) NOT NULL DEFAULT '',
  `estacion_ruc` VARCHAR(20) NULL,
  `combustible` VARCHAR(40) NULL,
  `galones` DECIMAL(10,3) NOT NULL DEFAULT 0,
  `precio_galon` DECIMAL(10,4) NOT NULL DEFAULT 0,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `moneda` VARCHAR(10) NOT NULL DEFAULT 'SOLES',
  `km_odometro` INT NULL,
  `numero_voucher` VARCHAR(60) NULL,
  `voucher_url` TEXT NULL,
  `pagar_a` VARCHAR(12) NOT NULL DEFAULT 'ESTACION',
  `beneficiario_nombre` VARCHAR(200) NOT NULL DEFAULT '',
  `beneficiario_doc` VARCHAR(20) NULL,
  `caja_id` INT NULL,
  `ia_json` LONGTEXT NULL,
  `alertas_json` TEXT NULL,
  `anulado` TINYINT(1) NOT NULL DEFAULT 0,
  `observacion` TEXT NULL,
  `usuario` VARCHAR(150) NULL,
  `creado_en` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vale_codigo` (`codigo`),
  KEY `idx_vale_viaje` (`viaje`),
  KEY `idx_vale_placa` (`placa`),
  KEY `idx_vale_caja` (`caja_id`)
) DEFAULT CHARSET=utf8mb4;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tesoreria_caja' AND COLUMN_NAME = 'origen');
SET @sql = IF(@falta = 0, 'ALTER TABLE `tesoreria_caja` ADD COLUMN `origen` VARCHAR(30) NULL, ADD COLUMN `origen_id` INT NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
