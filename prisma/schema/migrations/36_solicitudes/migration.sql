-- Solicitudes (2026-11-18). Aditiva e idempotente: solo crea tablas nuevas, no toca datos existentes.
-- Cualquier usuario pide algo (agregar proveedor, cliente o cuenta bancaria); quien tiene el permiso de aprobar ese tipo lo revisa,
-- y al aprobarse el sistema lo aplica. Cada paso queda en el historial.

CREATE TABLE IF NOT EXISTS `solicitudes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(20) NOT NULL,
  `tipo` VARCHAR(40) NOT NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  `titulo` VARCHAR(200) NOT NULL DEFAULT '',
  `datos_json` LONGTEXT NULL,
  `motivo` VARCHAR(500) NULL,
  `solicitante` VARCHAR(150) NOT NULL DEFAULT '',
  `revisado_por` VARCHAR(150) NULL,
  `revisado_en` DATETIME NULL,
  `comentario_revision` VARCHAR(500) NULL,
  `resultado_json` TEXT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_solicitud_codigo` (`codigo`),
  KEY `idx_solicitud_estado` (`estado`),
  KEY `idx_solicitud_tipo` (`tipo`),
  KEY `idx_solicitud_solicitante` (`solicitante`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `solicitudes_historial` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `solicitud_id` INT NOT NULL,
  `accion` VARCHAR(30) NOT NULL,
  `usuario` VARCHAR(150) NOT NULL DEFAULT '',
  `comentario` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_solicitud_hist` (`solicitud_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
