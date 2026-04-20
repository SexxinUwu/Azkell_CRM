mysqldump: [Warning] Using a password on the command line interface can be insecure.
Warning: A partial dump from a server that has GTIDs will by default include the GTIDs of all transactions, even those that changed suppressed parts of the database. If you don't want to restore GTIDs, pass --set-gtid-purged=OFF. To make a complete dump, pass --all-databases --triggers --routines --events. 
Warning: A dump from a server that has GTIDs enabled will by default include the GTIDs of all transactions, even those that were executed during its extraction and might not be represented in the dumped data. This might result in an inconsistent data dump. 
In order to ensure a consistent backup of the database, pass --single-transaction or --lock-all-tables or --master-data. 
-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: mysql-3ebd672a-crmazkell1.f.aivencloud.com    Database: defaultdb
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '07095810-1c03-11f1-9174-5af1933b7433:1-453,
1997bec6-1d91-11f1-99c6-d62857eab5db:1-26,
de53a853-1e64-11f1-a3ca-6a691ce9e0a2:1-756';

--
-- Table structure for table `almacen_familias`
--

DROP TABLE IF EXISTS `almacen_familias`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `almacen_familias` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `descripcion` varchar(200) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `orden` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `almacen_marcas`
--

DROP TABLE IF EXISTS `almacen_marcas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `almacen_marcas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `descripcion` varchar(200) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `orden` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `almacen_sistemas`
--

DROP TABLE IF EXISTS `almacen_sistemas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `almacen_sistemas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `sub_sistemas` json DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `orden` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `almacen_unidades`
--

DROP TABLE IF EXISTS `almacen_unidades`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `almacen_unidades` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(20) NOT NULL,
  `descripcion` varchar(200) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `orden` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auditoria`
--

DROP TABLE IF EXISTS `auditoria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditoria` (
  `idAuditoria` int NOT NULL AUTO_INCREMENT,
  `fecha` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `usuario` varchar(150) NOT NULL DEFAULT '',
  `modulo` varchar(50) DEFAULT NULL,
  `accion` varchar(50) NOT NULL DEFAULT '',
  `detalle` text,
  PRIMARY KEY (`idAuditoria`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `backlog_mantenimiento`
--

DROP TABLE IF EXISTS `backlog_mantenimiento`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `backlog_mantenimiento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `placa` varchar(20) NOT NULL,
  `descripcion_falla` text NOT NULL,
  `prioridad` enum('Baja','Media','Alta','Crítica') DEFAULT 'Media',
  `estado` enum('Pendiente','En Proceso','Resuelto') DEFAULT 'Pendiente',
  `reportado_por` varchar(100) DEFAULT NULL,
  `fecha_reporte` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cat_rampas`
--

DROP TABLE IF EXISTS `cat_rampas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cat_rampas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre_rampa` varchar(50) NOT NULL,
  `sede` varchar(50) NOT NULL,
  `estado` varchar(20) DEFAULT 'Disponible',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cat_situaciones`
--

DROP TABLE IF EXISTS `cat_situaciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cat_situaciones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(20) NOT NULL,
  `descripcion` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `conductores`
--

DROP TABLE IF EXISTS `conductores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conductores` (
  `idConductor` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL DEFAULT '',
  `empresa` varchar(100) NOT NULL DEFAULT '',
  `telefono` varchar(20) NOT NULL DEFAULT '',
  `dni` varchar(20) NOT NULL DEFAULT '',
  `licencia` varchar(50) NOT NULL DEFAULT '',
  `estado` varchar(20) NOT NULL DEFAULT 'Activo',
  `foto` text,
  PRIMARY KEY (`idConductor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `configuracion_almacen`
--

DROP TABLE IF EXISTS `configuracion_almacen`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracion_almacen` (
  `clave` varchar(50) NOT NULL,
  `valor` varchar(500) NOT NULL DEFAULT '',
  `descripcion` varchar(200) DEFAULT NULL,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `configuracion_flota`
--

DROP TABLE IF EXISTS `configuracion_flota`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracion_flota` (
  `id` int NOT NULL AUTO_INCREMENT,
  `marca` varchar(50) NOT NULL,
  `uts_categoria` varchar(20) NOT NULL,
  `km_mensuales` int NOT NULL DEFAULT '0',
  `dias_operativos` int NOT NULL DEFAULT '26',
  `mp1_intervalo_km` int NOT NULL DEFAULT '5000',
  `mp2_intervalo_km` int NOT NULL DEFAULT '10000',
  `mp3_intervalo_km` int NOT NULL DEFAULT '20000',
  `activa` tinyint(1) NOT NULL DEFAULT '1',
  `observaciones` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_marca_uts` (`marca`,`uts_categoria`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `destinatarios_alertas`
--

DROP TABLE IF EXISTS `destinatarios_alertas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `destinatarios_alertas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `correo` varchar(150) NOT NULL,
  `cargo` varchar(80) DEFAULT NULL,
  `notif_1d` tinyint(1) NOT NULL DEFAULT '1' COMMENT '+1 día retraso',
  `notif_3d` tinyint(1) NOT NULL DEFAULT '1' COMMENT '+3 días retraso',
  `notif_7d` tinyint(1) NOT NULL DEFAULT '1' COMMENT '+7 días retraso',
  `notif_completada` tinyint(1) NOT NULL DEFAULT '0',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_correo` (`correo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Destinatarios de alertas del módulo Planificación';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `detalle_entradas_inv`
--

DROP TABLE IF EXISTS `detalle_entradas_inv`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detalle_entradas_inv` (
  `id` int NOT NULL AUTO_INCREMENT,
  `entrada_id` varchar(20) NOT NULL,
  `inventario_id` varchar(20) NOT NULL,
  `descripcion` varchar(400) DEFAULT NULL,
  `cantidad` decimal(14,4) NOT NULL,
  `costo_unitario` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `moneda` enum('PEN','USD') NOT NULL DEFAULT 'PEN',
  `importe` decimal(14,4) NOT NULL DEFAULT '0.0000',
  PRIMARY KEY (`id`),
  KEY `idx_entrada` (`entrada_id`),
  KEY `idx_item` (`inventario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `detalle_salidas_inv`
--

DROP TABLE IF EXISTS `detalle_salidas_inv`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detalle_salidas_inv` (
  `id` int NOT NULL AUTO_INCREMENT,
  `salida_id` varchar(20) NOT NULL,
  `inventario_id` varchar(20) DEFAULT NULL,
  `descripcion` varchar(400) DEFAULT NULL,
  `cantidad` decimal(14,4) NOT NULL,
  `costo_unitario` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `moneda` enum('PEN','USD') NOT NULL DEFAULT 'PEN',
  `importe` decimal(14,4) NOT NULL DEFAULT '0.0000',
  PRIMARY KEY (`id`),
  KEY `idx_salida` (`salida_id`),
  KEY `idx_item` (`inventario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entradas_inv`
--

DROP TABLE IF EXISTS `entradas_inv`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entradas_inv` (
  `id` varchar(20) NOT NULL,
  `fecha` date NOT NULL,
  `proveedor_id` varchar(20) DEFAULT NULL,
  `proveedor_nombre` varchar(200) DEFAULT NULL,
  `documento_referencia` varchar(100) DEFAULT NULL,
  `moneda` enum('PEN','USD') NOT NULL DEFAULT 'PEN',
  `tipo_cambio` decimal(8,4) DEFAULT NULL,
  `total_pen` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `observaciones` text,
  `creado_por` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fecha` (`fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `fleetrun`
--

DROP TABLE IF EXISTS `fleetrun`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleetrun` (
  `idRegistro` varchar(50) NOT NULL,
  `fecha` date NOT NULL,
  `mes` int DEFAULT NULL,
  `anio` int DEFAULT NULL,
  `placa` varchar(20) DEFAULT '',
  `marca` varchar(50) NOT NULL DEFAULT '',
  `dueno` varchar(100) NOT NULL DEFAULT '',
  `uts` varchar(20) NOT NULL DEFAULT '',
  `tipo_mp` varchar(60) NOT NULL DEFAULT '',
  `km_actual` int NOT NULL DEFAULT '0',
  `frecuencia_km` int DEFAULT NULL,
  `km_proximo` int DEFAULT NULL,
  `observacion` text,
  `tecnico` varchar(100) NOT NULL DEFAULT '',
  `km_gps` int DEFAULT NULL,
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idRegistro`),
  UNIQUE KEY `uq_idregistro` (`idRegistro`),
  KEY `idx_placa` (`placa`),
  KEY `idx_fecha` (`fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inspecciones`
--

DROP TABLE IF EXISTS `inspecciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspecciones` (
  `id` varchar(50) NOT NULL,
  `placa` varchar(20) NOT NULL DEFAULT '',
  `fecha_ingreso` date DEFAULT NULL,
  `cliente` varchar(100) NOT NULL DEFAULT '',
  `tecnico` varchar(100) NOT NULL DEFAULT '',
  `km_tablero` int DEFAULT NULL,
  `dias_propuestos` int NOT NULL DEFAULT '0',
  `detalles_json` longtext,
  `url_firma` text,
  PRIMARY KEY (`id`),
  KEY `idx_placa` (`placa`),
  KEY `idx_fecha` (`fecha_ingreso`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventario`
--

DROP TABLE IF EXISTS `inventario`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventario` (
  `id` varchar(20) NOT NULL,
  `descripcion` varchar(400) NOT NULL,
  `familia` varchar(100) DEFAULT NULL,
  `sub_familia` varchar(100) DEFAULT NULL,
  `almacen` varchar(100) DEFAULT NULL,
  `unidad` varchar(30) DEFAULT NULL,
  `moneda` enum('PEN','USD') NOT NULL DEFAULT 'PEN',
  `costo_referencial` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `stock_regularizado` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `fecha_regularizacion` date DEFAULT NULL,
  `proveedor_id` varchar(20) DEFAULT NULL,
  `marca` varchar(100) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `observaciones` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `sub_sistema` varchar(100) DEFAULT NULL,
  `sistema` varchar(100) DEFAULT NULL,
  `ubicacion` varchar(150) DEFAULT NULL,
  `anaquel` decimal(6,2) DEFAULT NULL,
  `stock_min` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `stock_max` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `codigo_barras` varchar(100) DEFAULT NULL,
  `imagen_url` text,
  `articulo` varchar(300) DEFAULT NULL,
  `codigo_articulo` varchar(100) DEFAULT NULL,
  `codigo_item` varchar(100) DEFAULT NULL,
  `marca_unidad` text,
  PRIMARY KEY (`id`),
  KEY `idx_familia` (`familia`),
  KEY `idx_almacen` (`almacen`),
  KEY `idx_activo` (`activo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `km_snapshots`
--

DROP TABLE IF EXISTS `km_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `km_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `placa` varchar(20) NOT NULL,
  `fecha` date NOT NULL,
  `km_gps` int NOT NULL DEFAULT '0',
  `horas_motor` decimal(10,1) NOT NULL DEFAULT '0.0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_placa_fecha` (`placa`,`fecha`),
  KEY `idx_placa` (`placa`),
  KEY `idx_fecha` (`fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Snapshot diario de KM GPS y horas motor por placa (Wialon)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mantenimiento_kits`
--

DROP TABLE IF EXISTS `mantenimiento_kits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mantenimiento_kits` (
  `id` int NOT NULL AUTO_INCREMENT,
  `marca_vehiculo` varchar(50) NOT NULL,
  `tipo_mp` varchar(60) NOT NULL,
  `nombre_kit` varchar(150) DEFAULT NULL,
  `item_codigo` varchar(30) NOT NULL,
  `item_nombre` varchar(200) NOT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `unidad_medida` varchar(10) NOT NULL,
  `costo_unitario` decimal(10,2) NOT NULL DEFAULT '0.00',
  `costo_total` decimal(10,2) NOT NULL DEFAULT '0.00',
  `orden` int NOT NULL DEFAULT '1',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_marca_mp` (`marca_vehiculo`,`tipo_mp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ordenes_trabajo`
--

DROP TABLE IF EXISTS `ordenes_trabajo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ordenes_trabajo` (
  `ticket_entrada` varchar(50) NOT NULL,
  `id_ot` varchar(50) NOT NULL,
  `placa` varchar(20) NOT NULL,
  `estado` varchar(30) NOT NULL DEFAULT 'Recepción',
  `id_situacion` int DEFAULT NULL,
  `id_rampa` int DEFAULT NULL,
  `detalles_json` json DEFAULT NULL,
  `creado_por` varchar(100) NOT NULL DEFAULT '',
  `fecha_ingreso` datetime NOT NULL,
  `fecha_hora_salida` datetime DEFAULT NULL,
  PRIMARY KEY (`ticket_entrada`),
  KEY `idx_placa` (`placa`),
  KEY `idx_estado` (`estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ot_backlog`
--

DROP TABLE IF EXISTS `ot_backlog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ot_backlog` (
  `id` int NOT NULL AUTO_INCREMENT,
  `backlog_id` varchar(30) NOT NULL,
  `placa` varchar(20) NOT NULL,
  `km` int NOT NULL DEFAULT '0',
  `tema` varchar(100) NOT NULL DEFAULT '',
  `tarea` text NOT NULL,
  `reportado_por` varchar(100) NOT NULL DEFAULT '',
  `fecha_reporte` date DEFAULT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'Pendiente',
  `creado_por` varchar(100) NOT NULL DEFAULT '',
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `ticket_ot` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `backlog_id` (`backlog_id`),
  KEY `idx_placa` (`placa`),
  KEY `idx_estado` (`estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ot_materiales`
--

DROP TABLE IF EXISTS `ot_materiales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ot_materiales` (
  `id` int NOT NULL AUTO_INCREMENT,
  `id_solicitud` varchar(30) NOT NULL,
  `ticket_ot` varchar(50) NOT NULL,
  `producto` varchar(200) NOT NULL,
  `cantidad` decimal(10,3) NOT NULL DEFAULT '1.000',
  `unidad_medida` varchar(20) NOT NULL DEFAULT 'Pza',
  `costo_unit` decimal(10,2) NOT NULL DEFAULT '0.00',
  `costo_total` decimal(10,2) NOT NULL DEFAULT '0.00',
  `personal_solicitante` varchar(100) NOT NULL DEFAULT '',
  `observacion` text,
  `estado` varchar(20) NOT NULL DEFAULT 'Pendiente',
  `creado_por` varchar(100) NOT NULL DEFAULT '',
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_solicitud` (`id_solicitud`),
  KEY `idx_ticket_ot` (`ticket_ot`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `placa_auditoria`
--

DROP TABLE IF EXISTS `placa_auditoria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `placa_auditoria` (
  `id` int NOT NULL AUTO_INCREMENT,
  `placa` varchar(20) NOT NULL,
  `campo` varchar(60) NOT NULL,
  `valor_ant` text,
  `valor_nuevo` text,
  `usuario` varchar(100) DEFAULT NULL,
  `ip` varchar(80) DEFAULT NULL,
  `fecha` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_placa` (`placa`),
  KEY `idx_fecha` (`fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Historial de cambios por placa';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `placas`
--

DROP TABLE IF EXISTS `placas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `placas` (
  `placa` varchar(20) NOT NULL,
  `cliente` varchar(100) NOT NULL DEFAULT '',
  `ruc_dni` varchar(20) NOT NULL DEFAULT '',
  `marca` varchar(50) NOT NULL DEFAULT '',
  `modelo_uts` varchar(100) NOT NULL DEFAULT '',
  `tipo` varchar(50) NOT NULL DEFAULT '',
  `sub_tipo` varchar(50) NOT NULL DEFAULT '',
  `color` varchar(30) NOT NULL DEFAULT '',
  `nro_motor` varchar(50) NOT NULL DEFAULT '',
  `nro_caja` varchar(50) NOT NULL DEFAULT '',
  `nro_corona` varchar(50) NOT NULL DEFAULT '',
  `nro_vin` varchar(50) NOT NULL DEFAULT '',
  `configuracion` varchar(50) NOT NULL DEFAULT '',
  `anio` varchar(10) NOT NULL DEFAULT '',
  `combustible` varchar(30) NOT NULL DEFAULT '',
  `carga_util` varchar(20) NOT NULL DEFAULT '',
  `peso_neto` varchar(20) NOT NULL DEFAULT '',
  `peso_bruto` varchar(20) NOT NULL DEFAULT '',
  `estado` varchar(20) NOT NULL DEFAULT 'Activa',
  `uts` varchar(20) NOT NULL DEFAULT '',
  `motora` varchar(10) NOT NULL DEFAULT '',
  `llantas` varchar(10) NOT NULL DEFAULT '',
  `en_uso` varchar(10) NOT NULL DEFAULT '',
  `metrica` varchar(10) NOT NULL DEFAULT 'km',
  PRIMARY KEY (`placa`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `planificacion`
--

DROP TABLE IF EXISTS `planificacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `planificacion` (
  `id` varchar(50) NOT NULL,
  `placa` varchar(20) NOT NULL,
  `configuracion_flota_id` int DEFAULT NULL,
  `tipo_mp` varchar(60) NOT NULL,
  `fecha_inicio_ventana` date NOT NULL,
  `fecha_fin_ventana` date NOT NULL,
  `mes_ejecucion` int NOT NULL,
  `anio_ejecucion` int NOT NULL,
  `km_estimado` int NOT NULL DEFAULT '0',
  `km_minimo` int DEFAULT NULL,
  `km_maximo` int DEFAULT NULL,
  `tecnico_asignado` varchar(100) DEFAULT NULL,
  `prioridad` enum('Baja','Normal','Alta','Crítica') NOT NULL DEFAULT 'Normal',
  `observaciones_plan` text,
  `estado` enum('Programada','Confirmada','En Progreso','Completada','Cancelada','Diferida') NOT NULL DEFAULT 'Programada',
  `motivo_cancelacion` text,
  `fleetrun_id_ejecutado` varchar(50) DEFAULT NULL,
  `fecha_real_ejecucion` date DEFAULT NULL,
  `km_real_ejecucion` int DEFAULT NULL,
  `desviacion_km` int DEFAULT NULL,
  `desviacion_dias` int DEFAULT NULL,
  `fecha_primer_retraso` date DEFAULT NULL,
  `alertas_enviadas` tinyint NOT NULL DEFAULT '0',
  `source` enum('manual_excel','auto_generada') NOT NULL DEFAULT 'manual_excel',
  `created_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_estado` (`estado`),
  KEY `idx_placa` (`placa`),
  KEY `idx_mes_anio` (`mes_ejecucion`,`anio_ejecucion`),
  KEY `idx_fecha_ventana` (`fecha_fin_ventana`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `proveedor_marcas_inv`
--

DROP TABLE IF EXISTS `proveedor_marcas_inv`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `proveedor_marcas_inv` (
  `id` int NOT NULL AUTO_INCREMENT,
  `proveedor_id` varchar(20) NOT NULL,
  `marca` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_prov` (`proveedor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `proveedores_inv`
--

DROP TABLE IF EXISTS `proveedores_inv`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `proveedores_inv` (
  `id` varchar(20) NOT NULL,
  `nombre` varchar(200) NOT NULL,
  `razon_social` varchar(200) DEFAULT NULL,
  `tipo_documento` enum('RUC','DNI','CE','Otro') DEFAULT 'RUC',
  `numero_documento` varchar(20) DEFAULT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `direccion` text,
  `estado` enum('Activo','Inactivo') DEFAULT 'Activo',
  `observaciones` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `requerimientos_planificacion`
--

DROP TABLE IF EXISTS `requerimientos_planificacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `requerimientos_planificacion` (
  `id` int NOT NULL AUTO_INCREMENT,
  `plan_id` varchar(50) NOT NULL,
  `mes_ejecucion` int NOT NULL,
  `anio_ejecucion` int NOT NULL,
  `item_codigo` varchar(30) DEFAULT NULL,
  `item_nombre` varchar(200) NOT NULL,
  `cantidad_requerida` decimal(10,2) NOT NULL,
  `unidad_medida` varchar(10) NOT NULL,
  `costo_unitario` decimal(10,2) NOT NULL DEFAULT '0.00',
  `costo_total` decimal(10,2) NOT NULL DEFAULT '0.00',
  `estado_req` enum('Pendiente','Solicitado','Recibido','Entregado al Taller','Cancelado') NOT NULL DEFAULT 'Pendiente',
  `fecha_solicitud` date DEFAULT NULL,
  `fecha_entrega` date DEFAULT NULL,
  `responsable_almacen` varchar(100) DEFAULT NULL,
  `observaciones` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_plan` (`plan_id`),
  KEY `idx_mes_req` (`mes_ejecucion`,`anio_ejecucion`),
  KEY `idx_estado_req` (`estado_req`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `color` varchar(20) DEFAULT '#5865F2',
  `permisos_json` text,
  `es_admin` tinyint(1) DEFAULT '0',
  `orden` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `salidas_inv`
--

DROP TABLE IF EXISTS `salidas_inv`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `salidas_inv` (
  `id` varchar(20) NOT NULL,
  `fecha` date NOT NULL,
  `tipo_destino` enum('Vehiculo','Personal') NOT NULL,
  `placa` varchar(20) DEFAULT NULL,
  `responsable` varchar(150) DEFAULT NULL,
  `responsable_id` int DEFAULT NULL,
  `moneda` enum('PEN','USD') NOT NULL DEFAULT 'PEN',
  `tipo_cambio` decimal(8,4) DEFAULT NULL,
  `total_pen` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `observaciones` text,
  `creado_por` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ticket_ot` varchar(30) DEFAULT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'Despachado',
  `motivo_anulacion` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fecha` (`fecha`),
  KEY `idx_placa` (`placa`),
  KEY `idx_ticket_ot` (`ticket_ot`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `secuencias`
--

DROP TABLE IF EXISTS `secuencias`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `secuencias` (
  `id` int NOT NULL AUTO_INCREMENT,
  `modulo` varchar(50) NOT NULL,
  `prefijo` varchar(10) NOT NULL,
  `ultimo_numero` int DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `modulo` (`modulo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `seguridad`
--

DROP TABLE IF EXISTS `seguridad`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `seguridad` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `token_sesion` varchar(255) NOT NULL,
  `fecha_expiracion` datetime NOT NULL,
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `status_flota`
--

DROP TABLE IF EXISTS `status_flota`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `status_flota` (
  `idRegistro` varchar(50) NOT NULL,
  `fecha` date DEFAULT NULL,
  `corte` varchar(30) NOT NULL DEFAULT '',
  `unidad_motora` varchar(20) NOT NULL DEFAULT '',
  `unidad_no_motora` varchar(20) NOT NULL DEFAULT '',
  `cliente_motora` varchar(100) NOT NULL DEFAULT '',
  `cliente_nomotora` varchar(100) NOT NULL DEFAULT '',
  `zona` varchar(50) NOT NULL DEFAULT '',
  `conductor` varchar(100) NOT NULL DEFAULT '',
  `estado` varchar(30) NOT NULL DEFAULT '',
  `observaciones` text,
  `usuario` varchar(150) NOT NULL DEFAULT '',
  PRIMARY KEY (`idRegistro`),
  KEY `idx_fecha` (`fecha`),
  KEY `idx_motora` (`unidad_motora`),
  KEY `idx_nomotora` (`unidad_no_motora`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `taller_rampas`
--

DROP TABLE IF EXISTS `taller_rampas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `taller_rampas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `rampa` int NOT NULL,
  `placa` varchar(20) NOT NULL,
  `km` varchar(20) DEFAULT NULL,
  `fecha_ingreso` date DEFAULT NULL,
  `hora_ingreso` time DEFAULT NULL,
  `fecha_salida` date DEFAULT NULL,
  `hora_salida` time DEFAULT NULL,
  `situacion` varchar(80) DEFAULT NULL,
  `obs` text,
  `creado_por` varchar(100) DEFAULT NULL,
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `estado` varchar(20) NOT NULL DEFAULT 'Activo',
  `fecha_liberado` datetime DEFAULT NULL,
  `liberado_por` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tipos_mantenimiento`
--

DROP TABLE IF EXISTS `tipos_mantenimiento`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tipos_mantenimiento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `marca` varchar(50) NOT NULL DEFAULT '',
  `tipo_mp` varchar(60) NOT NULL DEFAULT '',
  `uts` varchar(20) NOT NULL DEFAULT '',
  `frecuencia_km` int DEFAULT NULL,
  `frecuencia_horas` decimal(10,2) DEFAULT NULL,
  `frecuencia_dias` int DEFAULT NULL,
  `tipo` varchar(50) NOT NULL DEFAULT '',
  `sistema` varchar(100) NOT NULL DEFAULT '',
  `descripcion` varchar(100) DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_marca_tipo_uts` (`marca`,`tipo_mp`,`uts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tipos_preventivo`
--

DROP TABLE IF EXISTS `tipos_preventivo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tipos_preventivo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `descripcion` text,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tp_mp`
--

DROP TABLE IF EXISTS `tp_mp`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tp_mp` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo_mantenimiento_id` int NOT NULL,
  `marca_vehiculo` varchar(50) NOT NULL,
  `modelo_vehiculo` varchar(50) DEFAULT NULL,
  `repuestos_json` json DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `trabajos_ot`
--

DROP TABLE IF EXISTS `trabajos_ot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `trabajos_ot` (
  `id_ot` varchar(50) NOT NULL,
  `ticket_visita` varchar(50) NOT NULL,
  `tipo_ot` varchar(50) NOT NULL DEFAULT '',
  `sub_tipo` varchar(50) NOT NULL DEFAULT '',
  `estado` varchar(30) NOT NULL DEFAULT 'Recepción',
  `detalles_json` json DEFAULT NULL,
  `creado_por` varchar(100) NOT NULL DEFAULT '',
  `trabajo_realizado` text,
  `tecnico` varchar(100) DEFAULT NULL,
  `fecha_trabajo` date DEFAULT NULL,
  `fecha_salida` datetime DEFAULT NULL,
  `fecha_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `costo` decimal(10,2) DEFAULT '0.00',
  PRIMARY KEY (`id_ot`),
  KEY `idx_ticket` (`ticket_visita`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `trabajos_ot_repuestos`
--

DROP TABLE IF EXISTS `trabajos_ot_repuestos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `trabajos_ot_repuestos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `id_ot` varchar(50) NOT NULL,
  `item` varchar(200) NOT NULL,
  `cantidad` decimal(10,2) NOT NULL DEFAULT '1.00',
  `precio_unitario` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total` decimal(10,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `idx_id_ot` (`id_ot`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `idUsuario` varchar(20) NOT NULL,
  `nombre` varchar(100) NOT NULL DEFAULT '',
  `cargo` varchar(100) NOT NULL DEFAULT '',
  `correo` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL DEFAULT '',
  `password_visible` varchar(255) NOT NULL DEFAULT '',
  `rol` varchar(50) NOT NULL DEFAULT 'usuario',
  `estado` varchar(20) NOT NULL DEFAULT 'Activo',
  `permisos_json` json DEFAULT NULL,
  `rol_id` int DEFAULT NULL,
  `ultimo_acceso` datetime DEFAULT NULL,
  `ultimo_ip` varchar(80) DEFAULT NULL,
  `ultimo_dispositivo` varchar(200) DEFAULT NULL,
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idUsuario`),
  UNIQUE KEY `uq_correo` (`correo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-20 15:02:05
