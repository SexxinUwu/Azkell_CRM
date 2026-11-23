-- Correcciones de la lectura de guías (2026-11-23). Aditiva e idempotente: la tabla solo se crea si falta.
-- Guarda, por cada guía leída del XML o con IA, qué campos cambió la persona al confirmar. Sirve para medir en qué se equivoca
-- el lector y mejorar sus instrucciones; no entrena a la IA. No se toca ninguna tabla existente.

CREATE TABLE IF NOT EXISTS `gre_lecturas_ia` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `guia_id` INTEGER NULL,
  `numero_completo` VARCHAR(30) NOT NULL,
  `fuente` VARCHAR(10) NOT NULL,
  `modelo` VARCHAR(60) NULL,
  `campos_total` INTEGER NOT NULL DEFAULT 0,
  `campos_corregidos` INTEGER NOT NULL DEFAULT 0,
  `diferencias_json` TEXT NULL,
  `usuario` VARCHAR(150) NULL,
  `creado_en` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  INDEX `idx_gre_lectura_guia`(`guia_id`),
  INDEX `idx_gre_lectura_fecha`(`creado_en`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
