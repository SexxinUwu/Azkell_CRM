-- Igualación de esquema · azkell_tenant_trahesa · generado 2026-10-12T19:52:16.118Z
-- Revisar antes de ejecutar. Requiere respaldo previo.
USE `azkell_tenant_trahesa`;
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
-- Tabla nueva (copiada de azkell_tenant_marsisa)
CREATE TABLE IF NOT EXISTS `tesoreria_cuentas_historial_facturas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cuenta_id` int NOT NULL,
  `factura_anterior_serie` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `factura_anterior_numero` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `factura_anterior_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `nota_credito_serie` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `nota_credito_numero` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `nota_credito_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `motivo_anulacion` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `factura_nueva_serie` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `factura_nueva_numero` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `factura_nueva_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `usuario_registro` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'ADMINISTRADOR',
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cuenta_id` (`cuenta_id`),
  KEY `idx_nc` (`nota_credito_serie`,`nota_credito_numero`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Tabla nueva (copiada de azkell_tenant_marsisa)
CREATE TABLE IF NOT EXISTS `tesoreria_liquidaciones_gastos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `orden_viaje` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `fecha` date NOT NULL,
  `conductor` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo_gasto` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sub_motivo` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo_comprobante` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'BOLETA',
  `serie` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numero` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `proveedor_ruc` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `proveedor_nombre` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `detalle` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `importe` decimal(12,2) NOT NULL DEFAULT '0.00',
  `sustento_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `estado` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'APROBADO',
  `usuario_registro` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_liq_viaje` (`orden_viaje`),
  KEY `idx_liq_fecha` (`fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE `checklist_config_sistemas` MODIFY COLUMN `unidad` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'tracto';
ALTER TABLE `checklist_config_sistemas` MODIFY COLUMN `sistema_key` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;
ALTER TABLE `checklist_config_sistemas` MODIFY COLUMN `orden` int NULL DEFAULT 0;
ALTER TABLE `checklist_config_sistemas` MODIFY COLUMN `items_json` longtext NOT NULL;
ALTER TABLE `checklist_config_sistemas` ADD COLUMN `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `checklist_config_sistemas` ADD COLUMN `actualizado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE `entradas_inv` ADD COLUMN `centro_costo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `entradas_inv` ADD COLUMN `sub_motivo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `entradas_inv` ADD COLUMN `autoriza` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `fleetrun` MODIFY COLUMN `fecha` date NULL DEFAULT NULL;
ALTER TABLE `fleetrun` MODIFY COLUMN `placa` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE `fleetrun` MODIFY COLUMN `km_actual` int NULL DEFAULT 0;
ALTER TABLE `fleetrun` DROP INDEX `modulo`;
ALTER TABLE `fleetrun` DROP COLUMN `modulo`;
ALTER TABLE `fleetrun` DROP COLUMN `prefijo`;
ALTER TABLE `fleetrun` DROP COLUMN `ultimo_numero`;
ALTER TABLE `flota_disponibilidad` MODIFY COLUMN `placa_camion` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `guias_remision` ADD COLUMN `orden_servicio` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `guias_remision` ADD COLUMN `orden_viaje` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `guias_remision` ADD COLUMN `apisunat_faults` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `inspecciones` MODIFY COLUMN `placa` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '';
ALTER TABLE `inspecciones` MODIFY COLUMN `km_tablero` int NULL DEFAULT 0;
ALTER TABLE `inventario` MODIFY COLUMN `anaquel` varchar(50) NULL DEFAULT NULL;
ALTER TABLE `mant_incidencias_ruta` MODIFY COLUMN `codigo` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE `mant_incidencias_ruta` MODIFY COLUMN `area_responsable` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'Mantenimiento';
ALTER TABLE `neumaticos_inspecciones_det` MODIFY COLUMN `remanente_promedio` decimal(4,1) GENERATED ALWAYS AS ((((`r1` + `r2`) + `r3`) / 3.0)) STORED;
ALTER TABLE `ordenes_trabajo` MODIFY COLUMN `placa` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE `ot_backlog` MODIFY COLUMN `placa` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE `placa_auditoria` MODIFY COLUMN `placa` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE `placa_auditoria` MODIFY COLUMN `campo` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE `placa_auditoria` MODIFY COLUMN `usuario` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '';
ALTER TABLE `placas` MODIFY COLUMN `placa` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE `taller_rampas` MODIFY COLUMN `placa` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE `tesoreria_cuentas` ADD COLUMN `orden_servicio` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '';
ALTER TABLE `tesoreria_cuentas` ADD COLUMN `neto_cobrado` decimal(12,2) NULL DEFAULT NULL;
ALTER TABLE `tesoreria_cuentas` ADD COLUMN `factura_documento_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE `tesoreria_cuentas` ADD COLUMN `nota_credito` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '';
ALTER TABLE `tesoreria_cuentas` ADD COLUMN `nota_credito_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE `tesoreria_cuentas` ADD COLUMN `sustento_pago_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE `tipos_mantenimiento` MODIFY COLUMN `marca` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '';
ALTER TABLE `tipos_mantenimiento` MODIFY COLUMN `tipo_mp` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '';
ALTER TABLE `tipos_mantenimiento` MODIFY COLUMN `uts` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '';
ALTER TABLE `tipos_mantenimiento` MODIFY COLUMN `frecuencia_km` decimal(10,2) NULL DEFAULT NULL;
ALTER TABLE `tipos_mantenimiento` MODIFY COLUMN `tipo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '';
ALTER TABLE `tipos_mantenimiento` MODIFY COLUMN `sistema` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '';
ALTER TABLE `tipos_mantenimiento` MODIFY COLUMN `descripcion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT ('');
ALTER TABLE `tipos_mantenimiento` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE `trabajos_ot` MODIFY COLUMN `fecha_trabajo` datetime NULL DEFAULT NULL;
ALTER TABLE `checklist_config_sistemas` ADD UNIQUE INDEX `uk_unidad_sys` (`unidad`, `sistema_key`);
ALTER TABLE `combustible_vales` ADD INDEX `idx_fecha_estado` (`fecha`, `estado`);
ALTER TABLE `combustible_vales` ADD INDEX `idx_vehiculo_fecha_viaje` (`vehiculo`, `fecha`, `viaje`);
ALTER TABLE `fleetrun` ADD INDEX `idx_fecha` (`fecha`);
ALTER TABLE `marsisa_combustible_vales` ADD INDEX `idx_fecha_estado` (`fecha`, `estado`);
ALTER TABLE `marsisa_combustible_vales` ADD INDEX `idx_vehiculo_fecha_viaje` (`vehiculo`, `fecha`, `viaje`);
ALTER TABLE `marsisa_ordenes_viaje` ADD INDEX `idx_mov_placas` (`placa_tracto`, `placa_remolque`);
ALTER TABLE `operaciones_combustible_vales` ADD INDEX `idx_fecha_estado` (`fecha`, `estado`);
ALTER TABLE `operaciones_combustible_vales` ADD INDEX `idx_vehiculo_fecha_viaje` (`vehiculo`, `fecha`, `viaje`);
ALTER TABLE `ot_materiales` ADD INDEX `idx_ticket_ot` (`ticket_ot`);
ALTER TABLE `placa_auditoria` ADD INDEX `idx_fecha` (`fecha`);
ALTER TABLE `neumaticos_inspecciones` ADD INDEX `idx_neu_insp_placa_fecha` (`placa`, `fecha_inspeccion`);
ALTER TABLE `neumaticos_inspecciones_det` ADD INDEX `idx_insp_pos` (`id_inspeccion`, `posicion`);
ALTER TABLE `api_keys` DROP INDEX `idx_api_key`;
ALTER TABLE `guias_remision` DROP INDEX `idx_numero_guia`;
ALTER TABLE `oc_approval_tokens` DROP INDEX `idx_token`;
ALTER TABLE `ordenes_compra` DROP INDEX `idx_oc_codigo`;
SET FOREIGN_KEY_CHECKS=1;
