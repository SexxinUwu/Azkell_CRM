-- Control de siniestros, daños e incidencias de flota (2026-11-23). Aditiva e idempotente: la tabla solo se crea si falta.
-- Una fila por siniestro: la unidad, el conductor, qué pasó, cuánto costó en repuestos y mano de obra y cuántas horas estuvo en taller.
-- horas_taller y costo_total los calcula el servidor al guardar (fin - inicio, y repuestos + mano de obra). No se toca ninguna tabla existente.

CREATE TABLE IF NOT EXISTS `mantenimiento_siniestros` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(20) NOT NULL,
  `fecha` DATE NOT NULL,
  `placa` VARCHAR(20) NOT NULL,
  `marca` VARCHAR(60) NULL,
  `conductor` VARCHAR(150) NULL,
  `ubicacion` VARCHAR(255) NULL,
  `tipo_incidencia` VARCHAR(120) NOT NULL,
  `detalle` TEXT NULL,
  `tecnico` VARCHAR(150) NULL,
  `inicio` DATETIME(0) NULL,
  `fin` DATETIME(0) NULL,
  `horas_taller` DECIMAL(8, 1) NOT NULL DEFAULT 0,
  `costo_repuestos` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `costo_mano_obra` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `costo_total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `estado` VARCHAR(30) NOT NULL DEFAULT 'En Reparación',
  `creado_por` VARCHAR(150) NULL,
  `creado_en` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `actualizado_en` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `uq_siniestro_codigo`(`codigo`),
  INDEX `idx_siniestro_fecha`(`fecha`),
  INDEX `idx_siniestro_placa`(`placa`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Motivos (tipos de incidencia) que se pueden elegir al registrar un siniestro. Se configuran desde la pantalla; al «eliminar» uno
-- solo se desactiva, así los siniestros ya registrados conservan su motivo. Se siembran los de la hoja de listas del Excel de control.
CREATE TABLE IF NOT EXISTS `mantenimiento_siniestros_motivos` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(120) NOT NULL,
  `activo` TINYINT NOT NULL DEFAULT 1,
  `creado_en` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `uq_siniestro_motivo`(`nombre`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `mantenimiento_siniestros_motivos` (`nombre`) VALUES
  ('Choque / Colisión'),
  ('Reventón de Neumático (Mala maniobra)'),
  ('Rozadura / Abolladura de Carrocería'),
  ('Rotura de Parabrisas / Espejo'),
  ('Daño por Sobrerrevolución / Motor'),
  ('Desgaste prematuro / Quemado de Embrague'),
  ('Daño en Suspensión / Golpe en chasis'),
  ('Rotura de Faros / Parachoques'),
  ('Otro daño imputable a operación');
