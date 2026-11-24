-- Conducción por RPM (Operaciones Marsisa), 2026-11-25. Aditiva e idempotente.
-- Rangos de RPM por modelo de motor y meta de reparto, editables desde el sistema (antes estaban fijos en el código).
-- Cada fila: hasta qué RPM llega el ralentí, el bajo torque, la zona verde (económico) y la potencia; por encima, sobrerrevolución.
-- Se siembran con los valores de la hoja MOTOR; los que ya existan (o que se editen después) no se tocan.

CREATE TABLE IF NOT EXISTS `conduccion_rpm_rangos` (
  `modelo` VARCHAR(60) NOT NULL,
  `lim_ralenti` INTEGER NOT NULL,
  `lim_bajo` INTEGER NOT NULL,
  `lim_verde` INTEGER NOT NULL,
  `lim_potencia` INTEGER NOT NULL,
  `actualizado_por` VARCHAR(150) NULL,
  `actualizado_en` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  PRIMARY KEY (`modelo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `conduccion_rpm_config` (
  `clave` VARCHAR(60) NOT NULL,
  `valor` VARCHAR(255) NOT NULL,
  `actualizado_por` VARCHAR(150) NULL,
  `actualizado_en` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  PRIMARY KEY (`clave`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `conduccion_rpm_rangos` (`modelo`, `lim_ralenti`, `lim_bajo`, `lim_verde`, `lim_potencia`) VALUES
  ('D13C460', 1000, 1150, 1400, 1900),
  ('D8C350', 900, 1200, 1600, 2200),
  ('DC13450', 650, 1000, 1300, 1900),
  ('DC13500', 700, 1000, 1300, 1800),
  ('DC13460', 700, 1000, 1300, 1800),
  ('DC13410', 700, 1000, 1400, 1900),
  ('SUPER13460', 700, 1000, 1300, 1800),
  ('6HK1', 800, 1050, 1500, 2400),
  ('ISM', 1000, 1200, 1500, 1900),
  ('DT530', 800, 1200, 1500, 2000),
  ('MT13.46', 550, 1050, 1400, 1900),
  ('WP12.430E201', 800, 1100, 1500, 1900),
  ('MC11.44', 750, 1000, 1400, 1900),
  ('MC13.54', 700, 1000, 1400, 1900),
  ('MC07.28', 600, 1200, 1800, 2300),
  ('ISDE-180', 800, 1200, 1700, 2500),
  ('MX13', 850, 1050, 1500, 1900),
  ('J05E-TY', 800, 1100, 1600, 2500),
  ('J08E-WB', 800, 1100, 1600, 2500),
  ('MBE4000', 700, 1100, 1400, 1900),
  ('MB-OM926', 800, 1200, 1600, 2200);

-- Meta de reparto (bajo torque / zona verde / potencia, en %), sobrerrevolución permitida y rangos para motores sin modelo
INSERT IGNORE INTO `conduccion_rpm_config` (`clave`, `valor`) VALUES
  ('meta_bajo', '20'),
  ('meta_verde', '60'),
  ('meta_potencia', '20'),
  ('meta_sobre', '0'),
  ('rangos_generico', '800,1150,1400,1900');
