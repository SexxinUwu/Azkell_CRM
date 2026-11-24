-- Documentos de flota traídos de la API externa de Marsisa (2026-11-24). Aditiva e idempotente: la tabla solo se crea si falta.
-- Una fila por documento remoto (id_remoto único). Es una copia de solo consulta: no se mezcla con los documentos propios de la flota.
-- El archivo, si el usuario lo pide o se descarga en lote, se guarda una vez en S3 (archivo_url) y aquí queda su dirección.

CREATE TABLE IF NOT EXISTS `marsisa_docs_flota_ext` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `id_remoto` INTEGER NOT NULL,
  `placa` VARCHAR(20) NOT NULL,
  `unidad_activa` TINYINT NOT NULL DEFAULT 1,
  `tipo_codigo` VARCHAR(80) NOT NULL,
  `tipo_nombre` VARCHAR(200) NOT NULL,
  `numero` VARCHAR(255) NULL,
  `emisor` VARCHAR(200) NULL,
  `fecha_emision` DATE NULL,
  `fecha_vencimiento` DATE NULL,
  `tiene_archivo` TINYINT NOT NULL DEFAULT 0,
  `eliminado_remoto` TINYINT NOT NULL DEFAULT 0,
  `actualizado_remoto` DATETIME(0) NULL,
  `archivo_url` VARCHAR(500) NULL,
  `archivo_nombre` VARCHAR(255) NULL,
  `archivo_mime` VARCHAR(100) NULL,
  `sincronizado_en` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `uq_docs_ext_remoto`(`id_remoto`),
  INDEX `idx_docs_ext_placa`(`placa`),
  INDEX `idx_docs_ext_tipo`(`tipo_codigo`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
