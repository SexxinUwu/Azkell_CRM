-- Documentos del personal (2026-11-18): copia del DNI por ambas caras, licencia de conducir, antecedentes, examen médico, SCTR, contrato y otros.
-- El archivo vive en S3 (archivo_url); aquí van el tipo, los vencimientos y quién lo subió. Aditiva e idempotente: solo crea una tabla.

CREATE TABLE IF NOT EXISTS `rrhh_personal_documentos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `personal_id` INT NOT NULL,
  `tipo` VARCHAR(30) NOT NULL,
  `descripcion` VARCHAR(150) NULL,
  `archivo_url` TEXT NOT NULL,
  `nombre_archivo` VARCHAR(255) NULL,
  `mime` VARCHAR(100) NULL,
  `fecha_emision` DATE NULL,
  `fecha_vencimiento` DATE NULL,
  `subido_por` VARCHAR(150) NULL,
  `creado_en` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rrhh_docs_persona_tipo` (`personal_id`, `tipo`),
  KEY `idx_rrhh_docs_vence` (`fecha_vencimiento`),
  CONSTRAINT `fk_rrhh_docs_personal` FOREIGN KEY (`personal_id`) REFERENCES `rrhh_personal` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
