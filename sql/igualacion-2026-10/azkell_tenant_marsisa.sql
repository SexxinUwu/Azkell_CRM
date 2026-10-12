-- Igualación de esquema · azkell_tenant_marsisa · generado 2026-10-12T19:52:16.115Z
-- Revisar antes de ejecutar. Requiere respaldo previo.
USE `azkell_tenant_marsisa`;
SET FOREIGN_KEY_CHECKS=0;
-- Tabla nueva (copiada de azkell_tenant_yoguitransport)
CREATE TABLE IF NOT EXISTS `guias_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `guia_tipo` enum('GRE','GRT') NOT NULL,
  `guia_id` int NOT NULL,
  `item_numero` int DEFAULT '1',
  `codigo` varchar(50) DEFAULT NULL,
  `descripcion` text NOT NULL,
  `cantidad` decimal(12,2) DEFAULT '1.00',
  `unidad_medida` varchar(20) DEFAULT 'NIU',
  `peso_unitario` decimal(12,2) DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_guia` (`guia_tipo`,`guia_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- Tabla nueva (copiada de azkell_tenant_yoguitransport)
CREATE TABLE IF NOT EXISTS `guias_remitente` (
  `id` int NOT NULL AUTO_INCREMENT,
  `numero_guia` varchar(30) NOT NULL,
  `serie` varchar(10) DEFAULT 'T001',
  `correlativo` int DEFAULT '1',
  `fecha_emision` date NOT NULL,
  `fecha_traslado` date NOT NULL,
  `modalidad_transporte` varchar(2) DEFAULT '01',
  `motivo_traslado` varchar(4) DEFAULT '01',
  `descripcion_motivo` varchar(255) DEFAULT 'VENTA',
  `remitente_ruc` varchar(20) NOT NULL,
  `remitente_razon_social` varchar(255) NOT NULL,
  `remitente_tipo_doc` char(1) DEFAULT '6',
  `destinatario_ruc` varchar(20) NOT NULL,
  `destinatario_razon_social` varchar(255) NOT NULL,
  `destinatario_tipo_doc` char(1) DEFAULT '6',
  `peso_total` decimal(12,2) DEFAULT '0.00',
  `unidad_medida` varchar(10) DEFAULT 'KGM',
  `total_bultos` int DEFAULT '1',
  `indicador_transbordo` tinyint(1) DEFAULT '0',
  `indicador_retorno_vehiculo_vacio` tinyint(1) DEFAULT '0',
  `indicador_retorno_envases_vacios` tinyint(1) DEFAULT '0',
  `indicador_traslado_total_m1_l` tinyint(1) DEFAULT '0',
  `partida_ubigeo` varchar(6) NOT NULL,
  `partida_direccion` text NOT NULL,
  `llegada_ubigeo` varchar(6) NOT NULL,
  `llegada_direccion` text NOT NULL,
  `transportista_ruc` varchar(20) DEFAULT NULL,
  `transportista_razon_social` varchar(255) DEFAULT NULL,
  `transportista_reg_mtc` varchar(50) DEFAULT NULL,
  `vehiculo_placa` varchar(20) DEFAULT NULL,
  `vehiculo_secundario_placa` varchar(20) DEFAULT NULL,
  `conductor_tipo_doc` char(1) DEFAULT '1',
  `conductor_num_doc` varchar(20) DEFAULT NULL,
  `conductor_nombres` varchar(200) DEFAULT NULL,
  `conductor_apellidos` varchar(200) DEFAULT NULL,
  `conductor_licencia` varchar(30) DEFAULT NULL,
  `apisunat_document_id` varchar(60) DEFAULT NULL,
  `apisunat_status` varchar(30) DEFAULT NULL,
  `apisunat_faults` text,
  `xml_url` text,
  `cdr_url` text,
  `pdf_url` text,
  `estado` varchar(30) DEFAULT 'BORRADOR',
  `observaciones` text,
  `grt_vinculada_id` int DEFAULT NULL,
  `grt_vinculada_numero` varchar(30) DEFAULT NULL,
  `orden_servicio` varchar(60) DEFAULT NULL,
  `orden_viaje` varchar(60) DEFAULT NULL,
  `datos_json` longtext,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero_guia` (`numero_guia`),
  KEY `idx_serie_corr` (`serie`,`correlativo`),
  KEY `idx_fecha` (`fecha_emision`),
  KEY `idx_estado` (`estado`),
  KEY `idx_modalidad` (`modalidad_transporte`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- Tabla nueva (copiada de azkell_tenant_yoguitransport)
CREATE TABLE IF NOT EXISTS `guias_transportista` (
  `id` int NOT NULL AUTO_INCREMENT,
  `numero_guia` varchar(30) NOT NULL,
  `serie` varchar(10) DEFAULT 'V001',
  `correlativo` int DEFAULT '1',
  `fecha_emision` date NOT NULL,
  `fecha_traslado` date NOT NULL,
  `transportista_ruc` varchar(20) NOT NULL,
  `transportista_razon_social` varchar(255) NOT NULL,
  `transportista_reg_mtc` varchar(50) DEFAULT NULL,
  `remitente_ruc` varchar(20) NOT NULL,
  `remitente_razon_social` varchar(255) NOT NULL,
  `remitente_tipo_doc` char(1) DEFAULT '6',
  `destinatario_ruc` varchar(20) NOT NULL,
  `destinatario_razon_social` varchar(255) NOT NULL,
  `destinatario_tipo_doc` char(1) DEFAULT '6',
  `motivo_traslado` varchar(4) DEFAULT '01',
  `descripcion_motivo` varchar(255) DEFAULT 'VENTA',
  `peso_total` decimal(12,2) DEFAULT '0.00',
  `unidad_medida` varchar(10) DEFAULT 'KGM',
  `indicador_transbordo` tinyint(1) DEFAULT '0',
  `partida_ubigeo` varchar(6) NOT NULL,
  `partida_direccion` text NOT NULL,
  `llegada_ubigeo` varchar(6) NOT NULL,
  `llegada_direccion` text NOT NULL,
  `vehiculo_placa` varchar(20) NOT NULL,
  `vehiculo_secundario_placa` varchar(20) DEFAULT NULL,
  `conductor_tipo_doc` char(1) DEFAULT '1',
  `conductor_num_doc` varchar(20) NOT NULL,
  `conductor_nombres` varchar(200) NOT NULL,
  `conductor_apellidos` varchar(200) DEFAULT NULL,
  `conductor_licencia` varchar(30) NOT NULL,
  `apisunat_document_id` varchar(60) DEFAULT NULL,
  `apisunat_status` varchar(30) DEFAULT NULL,
  `apisunat_faults` text,
  `xml_url` text,
  `cdr_url` text,
  `pdf_url` text,
  `estado` varchar(30) DEFAULT 'BORRADOR',
  `costo_flete` decimal(12,2) DEFAULT '0.00',
  `observaciones` text,
  `gre_vinculada_id` int DEFAULT NULL,
  `gre_vinculada_numero` varchar(30) DEFAULT NULL,
  `orden_servicio` varchar(60) DEFAULT NULL,
  `orden_viaje` varchar(60) DEFAULT NULL,
  `datos_json` longtext,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `gre_vinculada_ruc` varchar(20) DEFAULT NULL,
  `gre_vinculada_tipo` varchar(10) DEFAULT '09',
  `subcontratista_ruc` varchar(20) DEFAULT NULL,
  `subcontratista_razon_social` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero_guia` (`numero_guia`),
  KEY `idx_serie_corr` (`serie`,`correlativo`),
  KEY `idx_fecha` (`fecha_emision`),
  KEY `idx_estado` (`estado`),
  KEY `idx_placa` (`vehiculo_placa`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
ALTER TABLE `checklist_config_sistemas` MODIFY COLUMN `titulo` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE `checklist_config_sistemas` MODIFY COLUMN `icono` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'bi-gear';
ALTER TABLE `checklist_config_sistemas` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE `placa_auditoria` MODIFY COLUMN `usuario` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `placa_auditoria` MODIFY COLUMN `fecha` timestamp NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `salidas_inv` MODIFY COLUMN `tipo_destino` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;
ALTER TABLE `tipos_mantenimiento` MODIFY COLUMN `frecuencia_horas` decimal(10,2) NULL DEFAULT NULL;
ALTER TABLE `usuarios` MODIFY COLUMN `avatar_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `usuarios` MODIFY COLUMN `banner_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `usuarios` MODIFY COLUMN `firma_digital` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `usuarios` MODIFY COLUMN `preferencias_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `neumaticos_inspecciones` ADD INDEX `idx_neu_insp_placa_fecha` (`placa`, `fecha_inspeccion`);
ALTER TABLE `neumaticos_inspecciones_det` ADD INDEX `idx_insp_pos` (`id_inspeccion`, `posicion`);
ALTER TABLE `ot_materiales` ADD INDEX `idx_estado` (`estado`);
ALTER TABLE `reportes_fallas` ADD INDEX `idx_orden_viaje` (`orden_viaje`);
ALTER TABLE `reportes_fallas` ADD INDEX `idx_placa_tracto` (`placa_tracto`);
ALTER TABLE `tesoreria_cuentas` ADD INDEX `idx_cod_liq` (`codigo_liquidacion`);
ALTER TABLE `tesoreria_cuentas` ADD INDEX `idx_num_viaje` (`numero_viaje`);
ALTER TABLE `tesoreria_cuentas` ADD INDEX `idx_placa_cam` (`placa_camion`);
ALTER TABLE `tesoreria_cuentas` ADD INDEX `idx_placa_car` (`placa_carreta`);
ALTER TABLE `checklist_config_sistemas` ADD INDEX `idx_unidad_orden` (`unidad`, `orden`);
ALTER TABLE `guias_remision` ADD INDEX `idx_gre_relacionada` (`gre_relacionada_id`);
ALTER TABLE `api_keys` DROP INDEX `idx_api_key`;
ALTER TABLE `fleetrun` DROP INDEX `uq_idregistro`;
ALTER TABLE `guias_remision` DROP INDEX `idx_numero_guia`;
ALTER TABLE `marsisa_combustible_vales` DROP INDEX `idx_mcv_viaje`;
ALTER TABLE `marsisa_ordenes_viaje` DROP INDEX `idx_mov_viaje`;
ALTER TABLE `marsisa_ordenes_viaje_rutas` DROP INDEX `idx_movr_viaje`;
ALTER TABLE `oc_approval_tokens` DROP INDEX `idx_token`;
ALTER TABLE `ordenes_compra` DROP INDEX `idx_oc_codigo`;
SET FOREIGN_KEY_CHECKS=1;
