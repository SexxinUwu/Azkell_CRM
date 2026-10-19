-- Notificaciones unificadas (2026-10-19). Historial de envíos y reglas por evento.
-- Idempotente y aditiva: solo crea tablas. created_at en UTC; la pantalla lo muestra en hora de Lima.
CREATE TABLE IF NOT EXISTS `notificaciones_envios` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `canal` VARCHAR(16) NOT NULL,
  `destinatario` VARCHAR(160) NOT NULL,
  `evento` VARCHAR(60) NULL,
  `asunto` VARCHAR(200) NULL,
  `estado` VARCHAR(16) NOT NULL,
  `error` VARCHAR(300) NULL,
  `proveedor_ref` VARCHAR(120) NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notif_envios_fecha` (`created_at`),
  KEY `idx_notif_envios_evento` (`evento`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `notificaciones_reglas` (
  `evento` VARCHAR(60) NOT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `canales` VARCHAR(60) NOT NULL DEFAULT '',
  `destinatarios` VARCHAR(500) NOT NULL DEFAULT '',
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`evento`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
