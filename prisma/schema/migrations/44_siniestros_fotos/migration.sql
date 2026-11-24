-- Fotos de los daños de un siniestro (2026-11-24). Aditiva e idempotente: la tabla solo se crea si falta.
-- Una fila por foto; el archivo vive en S3 (flota/siniestros/<id>/...) y aquí queda su dirección. No se toca ninguna tabla existente.

CREATE TABLE IF NOT EXISTS `mantenimiento_siniestros_fotos` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `siniestro_id` INTEGER NOT NULL,
  `url` VARCHAR(500) NOT NULL,
  `nombre` VARCHAR(255) NULL,
  `subido_por` VARCHAR(150) NULL,
  `creado_en` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  INDEX `idx_siniestro_foto`(`siniestro_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
