-- Hojas de ruta de los conductores (Operaciones Marsisa), 2026-11-25. Aditiva e idempotente.
-- Una plantilla por cliente y tipo de unidad (tracto con 2 choferes, camión con 1): su itinerario son paradas con día, hora de inicio y de fin.
-- Para cada viaje se genera el PDF corriendo todas las horas desde la llegada al cliente. Se siembran las dos plantillas de Bimbo (Callao a Arequipa).

CREATE TABLE IF NOT EXISTS `hoja_ruta_plantillas` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(150) NOT NULL,
  `cliente` VARCHAR(150) NOT NULL,
  `tipo_unidad` VARCHAR(20) NOT NULL DEFAULT 'TRACTO',
  `choferes` TINYINT NOT NULL DEFAULT 1,
  `origen` VARCHAR(150) NULL,
  `destino` VARCHAR(150) NULL,
  `material` VARCHAR(150) NULL,
  `notas` TEXT NULL,
  `activa` TINYINT NOT NULL DEFAULT 1,
  `creado_por` VARCHAR(150) NULL,
  `creado_en` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `actualizado_en` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `uq_hoja_ruta_plantilla_nombre`(`nombre`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hoja_ruta_paradas` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `plantilla_id` INTEGER NOT NULL,
  `orden` INTEGER NOT NULL,
  `dia` TINYINT NOT NULL DEFAULT 1,
  `tipo` VARCHAR(20) NOT NULL DEFAULT 'CONDUCCION',
  `actividad` VARCHAR(250) NOT NULL,
  `hora_inicio` CHAR(5) NOT NULL,
  `hora_fin` CHAR(5) NOT NULL,

  INDEX `idx_hoja_ruta_paradas_plantilla`(`plantilla_id`, `orden`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Plantillas de Bimbo (de la pizarra): tracto con 2 choferes y camión con 1 chofer
INSERT INTO `hoja_ruta_plantillas` (`nombre`, `cliente`, `tipo_unidad`, `choferes`, `origen`, `destino`, `material`, `notas`, `creado_por`)
SELECT 'Bimbo · Callao - Arequipa · Tracto (2 choferes)', 'PANIFICADORA BIMBO DEL PERU S.A', 'TRACTO', 2, 'Callao (Bimbo)', 'Arequipa', 'Carga Bimbo',
       'En todo momento se aplicarán las técnicas y conocimientos del manejo defensivo. La velocidad máxima en carretera será la que indique el MTC. Antes de operar el equipo, el conductor debe realizar las inspecciones necesarias (llantas, luces, frenos y niveles). El conductor es responsable de portar la documentación que solicita SUTRAN en carretera: guías de remisión remitente y transportista, permisos y documentos del vehículo.', 'Sistema'
WHERE NOT EXISTS (SELECT 1 FROM `hoja_ruta_plantillas` WHERE `nombre` = 'Bimbo · Callao - Arequipa · Tracto (2 choferes)');

INSERT INTO `hoja_ruta_plantillas` (`nombre`, `cliente`, `tipo_unidad`, `choferes`, `origen`, `destino`, `material`, `notas`, `creado_por`)
SELECT 'Bimbo · Callao - Arequipa · Camión (1 chofer)', 'PANIFICADORA BIMBO DEL PERU S.A', 'CAMION', 1, 'Callao (Bimbo)', 'Arequipa', 'Carga Bimbo',
       'En todo momento se aplicarán las técnicas y conocimientos del manejo defensivo. La velocidad máxima en carretera será la que indique el MTC. Antes de operar el equipo, el conductor debe realizar las inspecciones necesarias (llantas, luces, frenos y niveles). El conductor es responsable de portar la documentación que solicita SUTRAN en carretera: guías de remisión remitente y transportista, permisos y documentos del vehículo.', 'Sistema'
WHERE NOT EXISTS (SELECT 1 FROM `hoja_ruta_plantillas` WHERE `nombre` = 'Bimbo · Callao - Arequipa · Camión (1 chofer)');

-- Paradas del tracto (solo si la plantilla aún no tiene)
INSERT INTO `hoja_ruta_paradas` (`plantilla_id`, `orden`, `dia`, `tipo`, `actividad`, `hora_inicio`, `hora_fin`)
SELECT p.`id`, v.`orden`, v.`dia`, v.`tipo`, v.`actividad`, v.`hi`, v.`hf`
FROM `hoja_ruta_plantillas` p
JOIN (
  SELECT 1 AS `orden`, 1 AS `dia`, 'CARGA' AS `tipo`, 'Callao (Bimbo): llegada, carga y salida del cliente' AS `actividad`, '03:00' AS `hi`, '09:00' AS `hf`
  UNION ALL SELECT 2, 1, 'CONDUCCION', 'Callao - Kio', '09:00', '11:00'
  UNION ALL SELECT 3, 1, 'COMBUSTIBLE', 'Kio: parada y abastecimiento de combustible', '11:00', '12:00'
  UNION ALL SELECT 4, 1, 'CONDUCCION', 'Kio - Chilca', '12:00', '13:00'
  UNION ALL SELECT 5, 1, 'COMIDA', 'Chilca: almuerzo', '13:00', '14:00'
  UNION ALL SELECT 6, 1, 'CONDUCCION', 'Chilca - Nasca o Palpa', '14:00', '21:00'
  UNION ALL SELECT 7, 1, 'COMIDA', 'Nasca o Palpa: cena', '21:00', '22:00'
  UNION ALL SELECT 8, 1, 'CONDUCCION', 'Nasca o Palpa - Arequipa (13 horas)', '22:00', '11:00'
) v
WHERE p.`nombre` = 'Bimbo · Callao - Arequipa · Tracto (2 choferes)'
  AND NOT EXISTS (SELECT 1 FROM `hoja_ruta_paradas` x WHERE x.`plantilla_id` = p.`id`);

-- Paradas del camión
INSERT INTO `hoja_ruta_paradas` (`plantilla_id`, `orden`, `dia`, `tipo`, `actividad`, `hora_inicio`, `hora_fin`)
SELECT p.`id`, v.`orden`, v.`dia`, v.`tipo`, v.`actividad`, v.`hi`, v.`hf`
FROM `hoja_ruta_plantillas` p
JOIN (
  SELECT 1 AS `orden`, 1 AS `dia`, 'CARGA' AS `tipo`, 'Callao (Bimbo): llegada, carga y salida del cliente' AS `actividad`, '08:00' AS `hi`, '13:00' AS `hf`
  UNION ALL SELECT 2, 1, 'CONDUCCION', 'Callao - Kio', '13:00', '16:00'
  UNION ALL SELECT 3, 1, 'COMBUSTIBLE', 'Kio: parada y abastecimiento de combustible', '16:00', '17:00'
  UNION ALL SELECT 4, 1, 'CONDUCCION', 'Kio - Paracas', '17:00', '20:00'
  UNION ALL SELECT 5, 1, 'COMIDA', 'Paracas: cena', '20:00', '21:00'
  UNION ALL SELECT 6, 1, 'CONDUCCION', 'Paracas - Nasca', '21:00', '01:00'
  UNION ALL SELECT 7, 2, 'DESCANSO', 'Nasca: descanso (4 horas)', '01:00', '05:00'
  UNION ALL SELECT 8, 2, 'CONDUCCION', 'Nasca - Atico', '05:00', '11:00'
  UNION ALL SELECT 9, 2, 'COMIDA', 'Atico: desayuno y almuerzo', '11:00', '12:00'
  UNION ALL SELECT 10, 2, 'CONDUCCION', 'Atico - punto de descarga', '12:00', '16:00'
  UNION ALL SELECT 11, 2, 'DESCARGA', 'Descarga', '16:00', '18:00'
  UNION ALL SELECT 12, 2, 'CONDUCCION', 'Descarga - Arequipa', '18:00', '20:00'
) v
WHERE p.`nombre` = 'Bimbo · Callao - Arequipa · Camión (1 chofer)'
  AND NOT EXISTS (SELECT 1 FROM `hoja_ruta_paradas` x WHERE x.`plantilla_id` = p.`id`);
