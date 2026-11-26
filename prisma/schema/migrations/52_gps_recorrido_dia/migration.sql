-- GPS (2026-11-25). Recorrido de cada día ya cerrado, guardado una vez (comprimido) para que Recorrido lo muestre al instante a todos los usuarios.
-- Aditiva e idempotente. El día de hoy nunca se guarda: sigue cambiando.

CREATE TABLE IF NOT EXISTS `gps_recorrido_dia` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `placa` VARCHAR(20) NOT NULL,
  `fecha` DATE NOT NULL,
  `unit_id` INT NULL,
  `puntos` INT NOT NULL DEFAULT 0,
  `km` DECIMAL(8,1) NOT NULL DEFAULT 0,
  `datos` LONGBLOB NOT NULL,
  `creado_en` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gps_recorrido_placa_fecha` (`placa`, `fecha`)
);
