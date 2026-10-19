-- Tablas del servidor que faltaban en empresas nuevas (2026-10-19): auditoría firmada y 2FA.
-- Idempotente. Son las mismas definiciones que tienen hoy las empresas activas (tomadas de azkell_tenant_marsisa).

CREATE TABLE IF NOT EXISTS `log_auditoria` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `usuario` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `correo` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `metodo` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ruta` varchar(400) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `modulo` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `accion` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `body_resumen` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `status_codigo` smallint DEFAULT NULL,
  `firma` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `despues` mediumtext COLLATE utf8mb4_unicode_ci,
  `antes` mediumtext COLLATE utf8mb4_unicode_ci,
  `firma_estado` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `usuarios_2fa` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `totp_secret` varchar(255) DEFAULT NULL,
  `totp_activo` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `webauthn_credentials` (
  `id` varchar(255) NOT NULL,
  `usuario_id` int NOT NULL,
  `nombre` varchar(100) DEFAULT 'Passkey',
  `public_key` text NOT NULL,
  `counter` bigint NOT NULL DEFAULT '0',
  `device_type` varchar(50) DEFAULT NULL,
  `backed_up` tinyint(1) DEFAULT '0',
  `transports` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Columnas de ordenes_compra y reportes_fallas que faltaban en empresas nuevas (mismas definiciones que las empresas activas).
SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ordenes_compra' AND COLUMN_NAME = 'condicion_pago');
SET @sql = IF(@falta = 0, 'ALTER TABLE `ordenes_compra` ADD COLUMN `condicion_pago` VARCHAR(20) NOT NULL DEFAULT \'Al contado\'', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ordenes_compra' AND COLUMN_NAME = 'dias_credito');
SET @sql = IF(@falta = 0, 'ALTER TABLE `ordenes_compra` ADD COLUMN `dias_credito` INT NOT NULL DEFAULT 0', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ordenes_compra' AND COLUMN_NAME = 'fecha_vencimiento');
SET @sql = IF(@falta = 0, 'ALTER TABLE `ordenes_compra` ADD COLUMN `fecha_vencimiento` DATE NULL DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reportes_fallas' AND COLUMN_NAME = 'critica');
SET @sql = IF(@falta = 0, 'ALTER TABLE `reportes_fallas` ADD COLUMN `critica` TINYINT(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
