-- Telemetría CAN por viaje (2026-10-19). La crea routes/telemetria.js cuando se usa; aquí queda en la estructura de la empresa.
-- Idempotente: si la tabla ya existe, no hace nada. Solo crea; no cambia datos ni otras tablas.
CREATE TABLE IF NOT EXISTS `telemetria_can` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `placa` VARCHAR(20) NOT NULL,
  `fecha` DATE NOT NULL,
  `recorrido_km` DECIMAL(10,1) DEFAULT 0,
  `horas_motor` DECIMAL(8,1) DEFAULT 0,
  `velocidad_max` DECIMAL(5,1) DEFAULT 0,
  `consumo_ralenti` DECIMAL(8,2) DEFAULT NULL COMMENT 'litros en ralentí',
  `combustible_con` DECIMAL(8,2) DEFAULT NULL COMMENT 'litros totales consumidos',
  `rendimiento` DECIMAL(8,3) DEFAULT NULL COMMENT 'km/litro',
  `lat_ultimo` DECIMAL(10,7) DEFAULT NULL,
  `lng_ultimo` DECIMAL(10,7) DEFAULT NULL,
  `estado_motor` VARCHAR(30) DEFAULT NULL,
  `raw_json` JSON DEFAULT NULL COMMENT 'snapshot completo del objeto Wialon',
  `synced_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_placa_fecha` (`placa`, `fecha`),
  KEY `idx_placa` (`placa`),
  KEY `idx_fecha` (`fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
