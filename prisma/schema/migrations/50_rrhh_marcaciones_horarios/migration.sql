-- Asistencia por QR (2026-11-25). Aditiva e idempotente, para las cuatro empresas.
-- rrhh_marcaciones: cada lectura del QR del fotocheck (ingreso o salida). rrhh_horarios: horario por cargo o por persona (tardanza y horas extra).

CREATE TABLE IF NOT EXISTS `rrhh_marcaciones` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `personal_id` INT NOT NULL,
  `tipo` VARCHAR(10) NOT NULL,
  `marcado_en` DATETIME NOT NULL,
  `fecha_turno` DATE NOT NULL,
  `turno_id` INT NULL,
  `origen` VARCHAR(20) NOT NULL DEFAULT 'QR',
  `dispositivo` VARCHAR(120) NULL,
  `usuario_registro` VARCHAR(100) NULL,
  `observacion` VARCHAR(255) NULL,
  `creado_en` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_marc_persona` (`personal_id`, `marcado_en`),
  KEY `idx_marc_turno` (`fecha_turno`)
);

CREATE TABLE IF NOT EXISTS `rrhh_horarios` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ambito` VARCHAR(10) NOT NULL,
  `cargo` VARCHAR(100) NULL,
  `personal_id` INT NULL,
  `hora_ingreso` TIME NOT NULL,
  `hora_salida` TIME NOT NULL,
  `duracion_horas` DECIMAL(4,1) NOT NULL DEFAULT 9.0,
  `tolerancia_min` INT NOT NULL DEFAULT 10,
  `actualizado_por` VARCHAR(100) NULL,
  `actualizado_en` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hor_cargo` (`ambito`, `cargo`),
  KEY `idx_hor_persona` (`personal_id`)
);
