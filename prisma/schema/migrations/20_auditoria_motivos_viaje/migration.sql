-- Motivos de la auditoría de combustible (2026-11-10). Aditiva e idempotente.
--   combustible_auditoria_viajes.motivos   motivos de un viaje OBSERVADO (JSON, varios por viaje)
--   combustible_auditoria_motivos          catálogo de motivos (editable desde el análisis; los nuevos se agregan solos)

SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'combustible_auditoria_viajes' AND COLUMN_NAME = 'motivos');
SET @sql = IF(@falta = 0, 'ALTER TABLE `combustible_auditoria_viajes` ADD COLUMN `motivos` TEXT NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS `combustible_auditoria_motivos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(80) NOT NULL,
  `activo` TINYINT NOT NULL DEFAULT 1,
  `creado_en` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_comb_aud_motivo` (`nombre`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `combustible_auditoria_motivos` (`nombre`) VALUES
  ('ROBO DE COMBUSTIBLE'),
  ('MAL MANEJO'),
  ('CONSUMO ALTO SIN JUSTIFICACIÓN'),
  ('VALE O DATO INCONSISTENTE'),
  ('DESVÍO DE RUTA'),
  ('FALLA MECÁNICA'),
  ('OTRO');
