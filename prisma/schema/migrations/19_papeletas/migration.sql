-- Módulo Papeletas (Flota): papeletas, multas y actas de control de las unidades (2026-11-09). Aditiva e idempotente.
--   papeletas_entidades     entidades que sancionan (SUTRAN, PNP, SAT, ATU…) con sus plazos habituales (editables)
--   papeletas_infracciones  catálogo de infracciones (código, gravedad, puntos, multa); se carga desde el módulo, no viene precargado
--   papeletas               cada papeleta, multa o acta
--   papeletas_pagos         pagos de cada papeleta (admite pagos parciales)
--   papeletas_historial     línea de vida de cada papeleta
--   papeletas_config        parámetros del módulo (valor de la UIT)

CREATE TABLE IF NOT EXISTS `papeletas_entidades` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(30) NOT NULL,
  `nombre` VARCHAR(200) NOT NULL,
  `ambito` VARCHAR(80) NULL,
  `dias_descargo` INT NULL,
  `dias_descuento` INT NULL,
  `pct_descuento` DECIMAL(5,2) NULL,
  `dias_pago` INT NULL,
  `activo` TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pap_ent_codigo` (`codigo`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `papeletas_entidades` (`codigo`, `nombre`, `ambito`) VALUES
  ('SUTRAN', 'SUTRAN - Superintendencia de Transporte Terrestre de Personas, Carga y Mercancías', 'Nacional'),
  ('PNP', 'PNP - Policía Nacional del Perú (Tránsito y Carreteras)', 'Nacional'),
  ('MTC', 'MTC - Ministerio de Transportes y Comunicaciones', 'Nacional'),
  ('ATU', 'ATU - Autoridad de Transporte Urbano para Lima y Callao', 'Lima y Callao'),
  ('SAT_LIMA', 'SAT Lima - Servicio de Administración Tributaria de Lima', 'Lima Metropolitana'),
  ('SAT_OTROS', 'SAT - Servicio de Administración Tributaria (otras ciudades)', 'Local'),
  ('MUN_PROV', 'Municipalidad Provincial', 'Local'),
  ('MUN_DIST', 'Municipalidad Distrital', 'Local'),
  ('GOB_REG', 'Gobierno Regional (Gerencia Regional de Transportes)', 'Regional'),
  ('SUNAT', 'SUNAT - Superintendencia Nacional de Aduanas y de Administración Tributaria', 'Nacional'),
  ('SUCAMEC', 'SUCAMEC - Superintendencia Nacional de Control de Servicios de Seguridad, Armas, Municiones y Explosivos de Uso Civil', 'Nacional'),
  ('SENASA', 'SENASA - Servicio Nacional de Sanidad Agraria', 'Nacional'),
  ('PRODUCE', 'PRODUCE - Ministerio de la Producción', 'Nacional'),
  ('OSINERGMIN', 'OSINERGMIN - Organismo Supervisor de la Inversión en Energía y Minería', 'Nacional'),
  ('MINEM', 'MINEM - Ministerio de Energía y Minas', 'Nacional'),
  ('OEFA', 'OEFA - Organismo de Evaluación y Fiscalización Ambiental', 'Nacional'),
  ('OTRA', 'Otra entidad (especificar)', NULL);

CREATE TABLE IF NOT EXISTS `papeletas_infracciones` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `entidad_codigo` VARCHAR(30) NOT NULL DEFAULT '',
  `codigo` VARCHAR(30) NOT NULL,
  `descripcion` VARCHAR(500) NOT NULL,
  `gravedad` VARCHAR(12) NULL,
  `puntos` INT NULL,
  `multa_uit` DECIMAL(8,4) NULL,
  `multa_soles` DECIMAL(12,2) NULL,
  `medida` VARCHAR(200) NULL,
  `activo` TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pap_inf` (`entidad_codigo`, `codigo`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `papeletas` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(20) NOT NULL,
  `entidad_codigo` VARCHAR(30) NOT NULL,
  `entidad_otra` VARCHAR(200) NULL,
  `tipo_documento` VARCHAR(30) NOT NULL DEFAULT 'PAPELETA',
  `numero` VARCHAR(60) NOT NULL,
  `fecha_infraccion` DATETIME NOT NULL,
  `departamento` VARCHAR(60) NULL,
  `lugar` VARCHAR(300) NULL,
  `agente` VARCHAR(150) NULL,
  `placa` VARCHAR(20) NOT NULL,
  `empresa_unidad` VARCHAR(150) NULL,
  `conductor_nombre` VARCHAR(150) NULL,
  `conductor_dni` VARCHAR(15) NULL,
  `licencia` VARCHAR(30) NULL,
  `infraccion_codigo` VARCHAR(30) NULL,
  `infraccion_desc` VARCHAR(500) NULL,
  `gravedad` VARCHAR(12) NULL,
  `puntos` INT NULL,
  `medida` VARCHAR(200) NULL,
  `moneda` VARCHAR(4) NOT NULL DEFAULT 'PEN',
  `monto` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `descuento_monto` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `recargos` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `fecha_limite_descuento` DATE NULL,
  `fecha_notificacion` DATE NULL,
  `fecha_limite_descargo` DATE NULL,
  `fecha_limite_pago` DATE NULL,
  `quien_asume` VARCHAR(12) NOT NULL DEFAULT 'EMPRESA',
  `asume_nombre` VARCHAR(150) NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  `descargo_fecha` DATE NULL,
  `descargo_expediente` VARCHAR(80) NULL,
  `descargo_resultado` VARCHAR(12) NULL,
  `anulada_motivo` VARCHAR(300) NULL,
  `reembolso_fecha` DATE NULL,
  `reembolso_monto` DECIMAL(12,2) NULL,
  `observaciones` TEXT NULL,
  `evidencias_json` TEXT NULL,
  `creado_por` VARCHAR(150) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_papeletas_codigo` (`codigo`),
  UNIQUE KEY `uq_papeletas_entidad_numero` (`entidad_codigo`, `numero`),
  KEY `idx_papeletas_placa` (`placa`),
  KEY `idx_papeletas_estado` (`estado`),
  KEY `idx_papeletas_fecha` (`fecha_infraccion`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `papeletas_pagos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `papeleta_id` INT NOT NULL,
  `fecha` DATE NOT NULL,
  `monto` DECIMAL(12,2) NOT NULL,
  `medio` VARCHAR(40) NULL,
  `nro_operacion` VARCHAR(80) NULL,
  `comprobante_url` TEXT NULL,
  `pagado_por` VARCHAR(150) NULL,
  `caja_id` INT NULL,
  `observacion` VARCHAR(300) NULL,
  `registrado_por` VARCHAR(150) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_papeletas_pagos_pap` (`papeleta_id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `papeletas_historial` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `papeleta_id` INT NOT NULL,
  `accion` VARCHAR(40) NOT NULL,
  `detalle` TEXT NULL,
  `usuario` VARCHAR(150) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_papeletas_hist_pap` (`papeleta_id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `papeletas_config` (
  `clave` VARCHAR(60) NOT NULL,
  `valor` VARCHAR(200) NULL,
  PRIMARY KEY (`clave`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
