-- Auditoría (2026-10-19). Registro estructurado de cambios: quién, qué, cuándo, antes/después y desde dónde.
-- Idempotente: solo crea la tabla si no existe. No cambia datos ni otras tablas.
-- created_at se guarda en UTC; la pantalla lo muestra en hora de Lima.
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` INT NULL,
  `user_name` VARCHAR(120) NOT NULL,
  `action` VARCHAR(40) NOT NULL,
  `entity` VARCHAR(40) NOT NULL,
  `entity_id` VARCHAR(80) NULL,
  `summary` VARCHAR(300) NOT NULL,
  `changes` JSON NULL,
  `ip` VARCHAR(45) NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_fecha` (`created_at`),
  KEY `idx_audit_entidad` (`entity`, `entity_id`),
  KEY `idx_audit_usuario` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
