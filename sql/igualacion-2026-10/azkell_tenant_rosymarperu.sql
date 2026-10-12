-- Igualación de esquema · azkell_tenant_rosymarperu · generado 2026-10-12T19:52:16.116Z
-- Revisar antes de ejecutar. Requiere respaldo previo.
USE `azkell_tenant_rosymarperu`;
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
CREATE TABLE IF NOT EXISTS `rrhh_personal` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo_documento` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'DNI',
  `numero_documento` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombres` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `apellidos` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sexo` enum('M','F') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'M',
  `fecha_nacimiento` date DEFAULT NULL,
  `nacionalidad` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'PERUANA',
  `estado_civil` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'SOLTERO(A)',
  `direccion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `distrito` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `provincia` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `departamento` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `telefono` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contacto_emergencia_nombre` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contacto_emergencia_parentesco` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contacto_emergencia_telefono` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `categoria_rol` enum('CONDUCTOR','MECANICO_TALLER','ADMINISTRATIVO','LIMPIEZA_SERVICIOS','SEGURIDAD_CONTROL','OTRO') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'ADMINISTRATIVO',
  `cargo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `area` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'OPERACIONES',
  `sede` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'BASE PRINCIPAL',
  `centro_costo_codigo` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'CC-100',
  `jefe_inmediato` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fecha_ingreso` date NOT NULL,
  `fecha_cese` date DEFAULT NULL,
  `motivo_cese` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado` enum('ACTIVO','VACACIONES','SUSPENDIDO','CESADO') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVO',
  `tipo_contrato` enum('INDETERMINADO','PLAZO_FIJO','PERIODO_PRUEBA','LOCACION_SERVICIOS','PRACTICANTE') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'PLAZO_FIJO',
  `fecha_inicio_contrato` date DEFAULT NULL,
  `fecha_fin_contrato` date DEFAULT NULL,
  `regimen_pensionario` enum('ONP','AFP_HABITAT','AFP_INTEGRA','AFP_PRIMA','AFP_PROFUTURO','SIN_REGIMEN') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'ONP',
  `tipo_comision_afp` enum('FLUJO','MIXTA') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'FLUJO',
  `cuspp` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tiene_asignacion_familiar` tinyint(1) DEFAULT '0',
  `sueldo_basico` decimal(12,2) DEFAULT '0.00',
  `bono_fijo` decimal(12,2) DEFAULT '0.00',
  `banco_haberes` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cuenta_haberes` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cci_haberes` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `banco_cts` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cuenta_cts` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `licencia_conducir` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `licencia_categoria` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `licencia_vencimiento` date DEFAULT NULL,
  `sctr_salud_vigente` tinyint(1) DEFAULT '1',
  `sctr_pension_vigente` tinyint(1) DEFAULT '1',
  `emo_fecha_vencimiento` date DEFAULT NULL,
  `emo_condicion` enum('APTO','APTO_RESTRICCIONES','NO_APTO','PENDIENTE') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'APTO',
  `grupo_sanguineo` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `talla_polo` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `talla_pantalon` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `talla_calzado` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `talla_chaleco` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_url` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero_documento` (`numero_documento`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Tabla nueva (copiada de azkell_tenant_marsisa)
CREATE TABLE IF NOT EXISTS `rrhh_licencias` (
  `id` int NOT NULL AUTO_INCREMENT,
  `personal_id` int NOT NULL,
  `tipo` enum('VACACIONES','DESCANSO_MEDICO','PERMISO_CON_GOCE','PERMISO_SIN_GOCE','LICENCIA_PATERNIDAD','LICENCIA_MATERNIDAD','SUSPENSION') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `fecha_inicio` date NOT NULL,
  `fecha_fin` date NOT NULL,
  `dias_totales` int NOT NULL,
  `motivo` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `sustento_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `estado` enum('PENDIENTE','APROBADO','RECHAZADO') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'APROBADO',
  `aprobado_por` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `personal_id` (`personal_id`),
  CONSTRAINT `rrhh_licencias_ibfk_1` FOREIGN KEY (`personal_id`) REFERENCES `rrhh_personal` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Tabla nueva (copiada de azkell_tenant_marsisa)
CREATE TABLE IF NOT EXISTS `rrhh_sst_registros` (
  `id` int NOT NULL AUTO_INCREMENT,
  `personal_id` int NOT NULL,
  `tipo_registro` enum('ENTREGA_EPP','CAPACITACION_SST','EXAMEN_MEDICO_EMO','INDUCCION','ENTREGA_RIT_RISST') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `fecha_registro` date NOT NULL,
  `descripcion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `documento_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `firmado` tinyint(1) DEFAULT '0',
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `personal_id` (`personal_id`),
  CONSTRAINT `rrhh_sst_registros_ibfk_1` FOREIGN KEY (`personal_id`) REFERENCES `rrhh_personal` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Tabla nueva (copiada de azkell_tenant_marsisa)
CREATE TABLE IF NOT EXISTS `rrhh_tareo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `personal_id` int NOT NULL,
  `fecha` date NOT NULL,
  `estado` enum('A','T','F','R','DM','V','P','D','FER') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'A',
  `hora_entrada` time DEFAULT NULL,
  `hora_salida` time DEFAULT NULL,
  `minutos_tardanza` int DEFAULT '0',
  `horas_extras` decimal(4,2) DEFAULT '0.00',
  `observacion` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `orden_viaje_codigo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usuario_registro` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_fecha` (`personal_id`,`fecha`),
  CONSTRAINT `rrhh_tareo_ibfk_1` FOREIGN KEY (`personal_id`) REFERENCES `rrhh_personal` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
ALTER TABLE `backlog_mantenimiento` MODIFY COLUMN `placa` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE `checklist_config_sistemas` MODIFY COLUMN `titulo` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE `checklist_config_sistemas` MODIFY COLUMN `icono` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'bi-gear';
ALTER TABLE `checklist_config_sistemas` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE `entradas_inv` ADD COLUMN `centro_costo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `entradas_inv` ADD COLUMN `sub_motivo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `entradas_inv` ADD COLUMN `autoriza` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `fleetrun` MODIFY COLUMN `placa` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE `guias_remision` ADD COLUMN `orden_servicio` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `guias_remision` ADD COLUMN `orden_viaje` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `guias_remision` ADD COLUMN `apisunat_faults` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `inspecciones` MODIFY COLUMN `placa` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '';
ALTER TABLE `inspecciones` MODIFY COLUMN `km_tablero` int NULL DEFAULT 0;
ALTER TABLE `inventario` MODIFY COLUMN `anaquel` varchar(50) NULL DEFAULT NULL;
ALTER TABLE `ordenes_trabajo` MODIFY COLUMN `placa` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE `ot_backlog` MODIFY COLUMN `placa` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE `placa_auditoria` MODIFY COLUMN `placa` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE `placa_auditoria` MODIFY COLUMN `campo` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE `placa_auditoria` MODIFY COLUMN `usuario` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '';
ALTER TABLE `placas` MODIFY COLUMN `placa` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE `salidas_inv` MODIFY COLUMN `tipo_destino` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;
ALTER TABLE `seg_unidades_base` ADD COLUMN `corte_hora` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL;
ALTER TABLE `seg_unidades_registros` ADD COLUMN `retorno_placa_carreta` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `seg_unidades_registros` ADD COLUMN `retorno_conductor` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL;
ALTER TABLE `seg_unidades_registros` ADD COLUMN `tipo_salida` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'RUTA';
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
ALTER TABLE `tipos_mantenimiento` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE `trabajos_ot` MODIFY COLUMN `fecha_trabajo` datetime NULL DEFAULT NULL;
ALTER TABLE `marsisa_combustible_vales` ADD INDEX `idx_fecha_estado` (`fecha`, `estado`);
ALTER TABLE `marsisa_combustible_vales` ADD INDEX `idx_vehiculo_fecha_viaje` (`vehiculo`, `fecha`, `viaje`);
ALTER TABLE `marsisa_ordenes_viaje` ADD INDEX `idx_mov_placas` (`placa_tracto`, `placa_remolque`);
ALTER TABLE `operaciones_combustible_vales` ADD INDEX `idx_fecha_estado` (`fecha`, `estado`);
ALTER TABLE `operaciones_combustible_vales` ADD INDEX `idx_vehiculo_fecha_viaje` (`vehiculo`, `fecha`, `viaje`);
ALTER TABLE `placa_auditoria` ADD INDEX `idx_fecha` (`fecha`);
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
ALTER TABLE `guias_remision` DROP INDEX `idx_numero_guia`;
ALTER TABLE `neumaticos_inspecciones` DROP INDEX `idx_placa_fecha`;
ALTER TABLE `neumaticos_inspecciones_det` DROP INDEX `idx_neu_det_insp`;
ALTER TABLE `oc_approval_tokens` DROP INDEX `idx_token`;
ALTER TABLE `ordenes_compra` DROP INDEX `idx_oc_codigo`;
ALTER TABLE `placas` DROP INDEX `idx_placa_lookup`;
ALTER TABLE `placas` DROP INDEX `idx_placas_placa`;
SET FOREIGN_KEY_CHECKS=1;
