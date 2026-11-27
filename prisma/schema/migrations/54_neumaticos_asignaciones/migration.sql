-- Asignación de llantas por código de fuego (2026-11-27). Aditiva e idempotente: la tabla solo se crea si falta.
-- Cuando almacén despacha una llanta para una OT, se anota qué llanta (código de fuego) salió, en qué salida, para qué OT y a qué placa.
--   asignada  → despachada a la placa, aún sin instalar (solo esa placa la ve como «disponible para uso»)
--   instalada → ya montada en la unidad (se cierra la asignación)
--   liberada  → se anuló la solicitud o la salida: la llanta vuelve a estar disponible para cualquier unidad
-- abierta_id vale el id de la llanta solo mientras la asignación sigue «asignada»; su índice UNIQUE impide que una llanta
-- esté asignada a dos solicitudes a la vez (MySQL no tiene índices parciales).

CREATE TABLE IF NOT EXISTS `neumaticos_asignaciones` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `id_neumatico` VARCHAR(50) NOT NULL,
  `salida_id` VARCHAR(20) NOT NULL,
  `detalle_id` INTEGER NULL,
  `ticket_ot` VARCHAR(30) NULL,
  `placa` VARCHAR(100) NULL,
  `estado` VARCHAR(12) NOT NULL DEFAULT 'asignada',
  `usuario` VARCHAR(100) NULL,
  `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  `instalada_en` DATETIME(0) NULL,
  `liberada_en` DATETIME(0) NULL,
  `motivo_liberacion` VARCHAR(200) NULL,
  `abierta_id` VARCHAR(50) GENERATED ALWAYS AS (IF(`estado` = 'asignada', `id_neumatico`, NULL)) STORED,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_neu_asig_abierta`(`abierta_id`),
  INDEX `idx_neu_asig_placa`(`placa`, `estado`),
  INDEX `idx_neu_asig_salida`(`salida_id`),
  INDEX `idx_neu_asig_ot`(`ticket_ot`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
