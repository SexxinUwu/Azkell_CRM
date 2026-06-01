-- ============================================================
-- 🛡️ MÓDULO SEGURIDAD — Scripts de Creación de Tablas
-- Base de datos: crm_azkell (Railway MySQL)
-- Ejecutar en MySQL Workbench uno por uno o todo junto
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- TABLA 1: seg_checklist_templates
-- Plantilla global del checklist de seguridad (categorías + ítems)
-- Cada fila es una categoría con sus ítems en JSON
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `seg_checklist_templates` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `template_id` VARCHAR(30) NOT NULL COMMENT 'ID único de la categoría (ej: cat_1)',
  `titulo` VARCHAR(150) NOT NULL COMMENT 'Nombre de la categoría',
  `items_json` JSON NOT NULL COMMENT 'Array de ítems: [{id, label}]',
  `orden` INT NOT NULL DEFAULT 0,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_template_id` (`template_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Plantilla global del checklist de seguridad';


-- ─────────────────────────────────────────────────────────────
-- DATOS INICIALES: Categorías por defecto del checklist
-- ─────────────────────────────────────────────────────────────
INSERT INTO `seg_checklist_templates` (`template_id`, `titulo`, `items_json`, `orden`) VALUES
('cat_1', 'Documentación',     '[{"id":"i_11","label":"Tarjeta de Propiedad"},{"id":"i_12","label":"Rev. Técnica y SOAT"},{"id":"i_13","label":"DNI, Licencia y SCTR"}]', 1),
('cat_2', 'EPPs Personal',     '[{"id":"i_21","label":"Casco y Barbiquejo"},{"id":"i_22","label":"Chaleco Reflectivo"},{"id":"i_23","label":"Zapatos Seguridad"}]', 2),
('cat_3', 'Físico y Seguridad','[{"id":"i_31","label":"Botiquín y Extintor"},{"id":"i_32","label":"Luces y Llantas"},{"id":"i_33","label":"Furgón Hermético"}]', 3);


-- ─────────────────────────────────────────────────────────────
-- TABLA 2: seg_unidades_registros
-- Registros de control de unidades (salida/retorno)
-- Cada registro guarda un snapshot del checklist (pattern)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `seg_unidades_registros` (
  `id` VARCHAR(50) NOT NULL COMMENT 'ID único (ej: REQ-1717267200000)',
  `placa_tracto` VARCHAR(20) NOT NULL,
  `placa_carreta` VARCHAR(20) DEFAULT NULL,
  `conductor` VARCHAR(100) NOT NULL,
  `destino` VARCHAR(150) DEFAULT NULL,
  `estado` ENUM('en_ruta','completado') NOT NULL DEFAULT 'en_ruta',

  -- SALIDA
  `salida_fecha` VARCHAR(10) DEFAULT NULL COMMENT 'DD-MM-YY',
  `salida_hora` VARCHAR(5) DEFAULT NULL COMMENT 'HH:MM',
  `salida_km` VARCHAR(20) DEFAULT NULL,
  `salida_template_json` JSON DEFAULT NULL COMMENT 'Snapshot de la plantilla al momento de la salida',
  `salida_checklist_json` JSON DEFAULT NULL COMMENT 'Respuestas del checklist {item_id: ok|mal|na}',
  `salida_has_alert` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 si hay ítems marcados como MAL',

  -- RETORNO
  `retorno_fecha` VARCHAR(10) DEFAULT NULL COMMENT 'DD-MM-YY',
  `retorno_hora` VARCHAR(5) DEFAULT NULL,
  `retorno_km` VARCHAR(20) DEFAULT NULL,
  `retorno_template_json` JSON DEFAULT NULL,
  `retorno_checklist_json` JSON DEFAULT NULL,
  `retorno_has_alert` TINYINT(1) NOT NULL DEFAULT 0,

  `creado_por` VARCHAR(100) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_placa_tracto` (`placa_tracto`),
  KEY `idx_estado` (`estado`),
  KEY `idx_salida_fecha` (`salida_fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Registros de control de unidades con checklist snapshot';


-- ─────────────────────────────────────────────────────────────
-- TABLA 3: seg_unidades_fotos
-- Fotos de evidencia almacenadas en AWS S3
-- Vinculadas a un registro de unidad
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `seg_unidades_fotos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `registro_id` VARCHAR(50) NOT NULL COMMENT 'FK a seg_unidades_registros.id',
  `tipo` ENUM('salida','retorno') NOT NULL COMMENT 'Fase del registro',
  `url` TEXT NOT NULL COMMENT 'URL de la imagen en AWS S3',
  `orden` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_registro` (`registro_id`),
  KEY `idx_tipo` (`tipo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Fotos de evidencia en S3 por registro de unidad';


-- ─────────────────────────────────────────────────────────────
-- TABLA 4: seg_asistencia
-- Control de asistencia de personal (ingreso/salida con QR)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `seg_asistencia` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `dni` VARCHAR(12) NOT NULL COMMENT 'DNI del trabajador',
  `nombre` VARCHAR(150) NOT NULL COMMENT 'Nombre completo',
  `cargo` VARCHAR(100) DEFAULT NULL,
  `fecha_ingreso` VARCHAR(10) NOT NULL COMMENT 'DD-MM-YY',
  `hora_ingreso` VARCHAR(8) NOT NULL COMMENT 'HH:MM:SS',
  `fecha_salida` VARCHAR(10) DEFAULT NULL,
  `hora_salida` VARCHAR(8) DEFAULT NULL,
  `registrado_por` VARCHAR(100) DEFAULT NULL COMMENT 'Usuario que operó el escáner',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_dni` (`dni`),
  KEY `idx_fecha_ingreso` (`fecha_ingreso`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Control de asistencia de personal con escáner QR';


-- ─────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────
SELECT 'seg_checklist_templates' AS tabla, COUNT(*) AS registros FROM seg_checklist_templates
UNION ALL
SELECT 'seg_unidades_registros', COUNT(*) FROM seg_unidades_registros
UNION ALL
SELECT 'seg_unidades_fotos', COUNT(*) FROM seg_unidades_fotos
UNION ALL
SELECT 'seg_asistencia', COUNT(*) FROM seg_asistencia;
