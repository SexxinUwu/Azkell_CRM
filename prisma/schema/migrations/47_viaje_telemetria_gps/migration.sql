-- Telemetría de los viajes guardada (Operaciones Marsisa), 2026-11-25. Aditiva e idempotente: la tabla solo se crea si falta.
-- Una fila por viaje y placa con lo que respondió Wialon: el CAN (can_json) y las lecturas de RPM en histograma (rpm_json).
-- Solo se guardan viajes ya terminados (no cambian), con el periodo consultado: si las fechas del viaje cambian, se vuelve a pedir.
-- Se guarda el histograma de RPM (no los porcentajes), así al cambiar los rangos del motor se recalcula sin volver a Wialon.

CREATE TABLE IF NOT EXISTS `viaje_telemetria_gps` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `viaje` VARCHAR(60) NOT NULL,
  `placa` VARCHAR(20) NOT NULL,
  `desde_unix` INTEGER NOT NULL,
  `hasta_unix` INTEGER NOT NULL,
  `can_json` MEDIUMTEXT NULL,
  `rpm_json` MEDIUMTEXT NULL,
  `calculado_en` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `uq_viaje_telemetria`(`viaje`, `placa`),
  INDEX `idx_viaje_telemetria_placa`(`placa`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
