-- ================================================================
-- AZKELL FLEET — Módulo Planificación Preventivos
-- Versión: 1.0 | Fecha: 2026-04
-- ================================================================
-- INSTRUCCIONES:
--   1. Ejecutar este script en Aiven MySQL (una sola vez)
--   2. Las CREATE TABLE también van en server.js (arranque automático)
--   3. Los INSERT de kits/configuracion son datos maestros — no se repiten
-- ================================================================

-- ================================================================
-- TABLA 1: configuracion_flota
-- Motor de velocidades: define cuánto recorre cada marca/UTS y
-- cada cuántos km se hace cada tipo de MP
-- ================================================================
CREATE TABLE IF NOT EXISTS configuracion_flota (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    marca           VARCHAR(50)  NOT NULL,
    uts_categoria   VARCHAR(20)  NOT NULL COMMENT 'LOCAL | NACIONAL',
    km_mensuales    INT          NOT NULL DEFAULT 0  COMMENT 'Km promedio por mes',
    dias_operativos INT          NOT NULL DEFAULT 26 COMMENT 'Días al mes que opera',
    km_diarios      DECIMAL(8,2) GENERATED ALWAYS AS (
                        CASE WHEN dias_operativos > 0
                             THEN ROUND(km_mensuales / dias_operativos, 2)
                             ELSE 0 END
                    ) STORED     COMMENT 'Km/día calculado automáticamente',
    mp1_intervalo_km INT         NOT NULL DEFAULT 5000  COMMENT 'Cada X km se hace MP1',
    mp2_intervalo_km INT         NOT NULL DEFAULT 10000 COMMENT 'Cada X km se hace MP2',
    mp3_intervalo_km INT         NOT NULL DEFAULT 20000 COMMENT 'Cada X km se hace MP3',
    activa          TINYINT(1)   NOT NULL DEFAULT 1,
    observaciones   TEXT,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_marca_uts (marca, uts_categoria),
    INDEX idx_uts (uts_categoria)
) COMMENT 'Velocidades y frecuencias de MP por marca/categoría';

-- ----------------------------------------------------------------
-- DATOS INICIALES: configuracion_flota
-- ⚠️ Ajustar km_mensuales y dias_operativos según tu operación real
-- ----------------------------------------------------------------
INSERT INTO configuracion_flota
    (marca, uts_categoria, km_mensuales, dias_operativos, mp1_intervalo_km, mp2_intervalo_km, mp3_intervalo_km)
VALUES
--  MARCA                   UTS         km/mes  días  MP1    MP2    MP3
    ('VOLVO',               'LOCAL',     8000,   26,    5000,  10000, 20000),
    ('VOLVO',               'NACIONAL', 18000,   30,    7500,  15000, 30000),
    ('UD',                  'LOCAL',     7000,   26,    5000,  10000, 20000),
    ('UD',                  'NACIONAL', 15000,   30,    7500,  15000, 30000),
    ('SCANIA',              'LOCAL',     8000,   26,    5000,  10000, 20000),
    ('SCANIA',              'NACIONAL', 18000,   30,    7500,  15000, 30000),
    ('MERCEDES ATEGO',      'LOCAL',     6000,   26,    5000,  10000, 20000),
    ('MERCEDES ATEGO',      'NACIONAL', 12000,   30,    5000,  10000, 20000),
    ('ISUZU CHIQUITO',      'LOCAL',     5000,   25,    5000,  10000, 20000),
    ('ISUZU',               'LOCAL',     6000,   25,    5000,  10000, 20000),
    ('ISUZU',               'NACIONAL', 12000,   30,    5000,  10000, 20000),
    ('INTER',               'LOCAL',     7000,   26,    5000,  10000, 20000),
    ('INTER',               'NACIONAL', 15000,   30,    5000,  10000, 20000),
    ('HOWO',                'LOCAL',     6000,   26,    5000,  10000, 20000),
    ('HOWO',                'NACIONAL', 15000,   30,    7500,  15000, 30000),
    ('HINO DUTRO',          'LOCAL',     5000,   25,    5000,  10000, 20000),
    ('HINO 500',            'LOCAL',     6000,   26,    5000,  10000, 20000),
    ('HINO 500',            'NACIONAL', 10000,   30,    5000,  10000, 20000),
    ('H1',                  'LOCAL',     3000,   25,    5000,  10000, 20000),
    ('FREIGHTLINER - MECHE','NACIONAL', 18000,   30,    7500,  15000, 30000),
    ('FREIGHTLINER',        'NACIONAL', 18000,   30,    7500,  15000, 30000),
    ('DONG FENG',           'LOCAL',     5000,   26,    5000,  10000, 20000),
    ('DONG FENG',           'NACIONAL', 10000,   30,    5000,  10000, 20000),
    ('DAF',                 'LOCAL',     8000,   26,    5000,  10000, 20000),
    ('DAF',                 'NACIONAL', 18000,   30,    7500,  15000, 30000)
ON DUPLICATE KEY UPDATE updated_at = NOW();


-- ================================================================
-- TABLA 2: mantenimiento_kits
-- "Receta" de cada servicio: qué items (repuestos/aceites) lleva
-- un MP para una marca específica
-- ================================================================
CREATE TABLE IF NOT EXISTS mantenimiento_kits (
    id              INT           AUTO_INCREMENT PRIMARY KEY,
    marca_vehiculo  VARCHAR(50)   NOT NULL COMMENT 'Debe coincidir con configuracion_flota.marca',
    tipo_mp         VARCHAR(60)   NOT NULL COMMENT 'MP1 | MP2 | MP3 | FILTRO DE AIRE | etc.',
    nombre_kit      VARCHAR(150)  COMMENT 'Nombre descriptivo del kit completo',
    item_codigo     VARCHAR(30)   NOT NULL COMMENT 'Código de inventario INV-XXXX',
    item_nombre     VARCHAR(200)  NOT NULL COMMENT 'Descripción del repuesto/insumo',
    cantidad        DECIMAL(10,2) NOT NULL,
    unidad_medida   VARCHAR(10)   NOT NULL COMMENT 'L = litros | U = unidad | KG = kilo',
    costo_unitario  DECIMAL(10,2) NOT NULL DEFAULT 0,
    costo_total     DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'cantidad × costo_unitario',
    orden           INT           NOT NULL DEFAULT 1 COMMENT 'Orden dentro del kit',
    activo          TINYINT(1)    NOT NULL DEFAULT 1,
    created_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_marca_mp (marca_vehiculo, tipo_mp),
    INDEX idx_codigo (item_codigo)
) COMMENT 'Ítems requeridos por tipo de MP y marca de vehículo';

-- ----------------------------------------------------------------
-- DATOS INICIALES: mantenimiento_kits
-- Fuente: planilla oficial de costos de Azkell Fleet (abril 2026)
-- ----------------------------------------------------------------

-- ==========================  VOLVO  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('VOLVO','MP1','Cambio de Aceite y Filtros - Volvo','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',11,'L',44.84,493.24,1),
('VOLVO','MP1','Cambio de Aceite y Filtros - Volvo','INV-1454','Filtro de Combustible WDK11102/28 - Volvo',1,'U',35.45,35.45,2),
('VOLVO','MP1','Cambio de Aceite y Filtros - Volvo','INV-1455','Filtro de Aceite WP11102/3 - Volvo',1,'U',20.53,20.53,3),
('VOLVO','MP1','Cambio de Aceite y Filtros - Volvo','INV-1456','Filtro de Aceite W11102/36 - Volvo',2,'U',22.32,44.64,4),
('VOLVO','MP1','Cambio de Aceite y Filtros - Volvo','INV-1457','Filtro Separador de Combustible WK 10006Z - Volvo',1,'U',79.27,79.27,5),
('VOLVO','MP2','Aceite de Caja - Volvo','INV-0001','Aceite Caja 80W-90 / Shell',4,'L',58.00,232.00,1),
('VOLVO','MP3','Aceite de Corona - Volvo','INV-0002','Aceite Corona 85W-140 / Shell',5,'L',54.24,271.20,1);

-- ==========================  UD  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('UD','MP1','Cambio de Aceite y Filtros - UD','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',5,'L',44.84,224.20,1),
('UD','MP1','Cambio de Aceite y Filtros - UD','INV-0333','Filtro de Aceite EO-18230 - UD / SAKURA',1,'U',70.00,70.00,2),
('UD','MP1','Cambio de Aceite y Filtros - UD','INV-0404','Filtro Separador de Combustible 1060/2 / MANN FILT',1,'U',61.45,61.45,3),
('UD','MP1','Cambio de Aceite y Filtros - UD','INV-0374','Filtro de Combustible EF-18060 - UD / SAKURA',1,'U',30.28,30.28,4),
('UD','MP2','Aceite de Caja - UD','INV-0001','Aceite Caja 80W-90 / Shell',3,'L',58.00,174.00,1),
('UD','MP3','Aceite de Corona - UD','INV-0002','Aceite Corona 85W-140 / Shell',5,'L',54.24,271.20,1),
('UD','FILTRO DE AIRE','Filtro de Aire - UD','INV-0359','Filtro de Aire A-61640 - UD / SAKURA',1,'U',383.20,383.20,1),
('UD','FILTRO SECADOR DE AIRE','Filtro Secador de Aire - UD','INV-0391','Filtro Secador de Aire 4329010042:009 - Dong Feng / Wabco',1,'U',84.75,84.75,1);

-- ==========================  SCANIA  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('SCANIA','MP1','Kit MP1 - Scania','INV-1706','Kit Mp1 ML33500002 - Scania / Donaldson',1,'U',316.20,316.20,1),
('SCANIA','MP1','Kit MP1 - Scania','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',11,'L',44.84,493.24,2),
('SCANIA','MP1','Kit MP1 - Scania','INV-0404','Filtro Separador de Combustible 1060/2 / MANN FILT',1,'U',61.45,61.45,3),
('SCANIA','MP2','Caja y Corona - Scania','INV-0001','Aceite Caja 80W-90 / Shell',4,'L',58.00,232.00,1),
('SCANIA','MP2','Caja y Corona - Scania','INV-0350','Filtro de Aceite de Caja y Corona W9023/1 - Scania / MANN FILT',1,'U',100.81,100.81,2),
('SCANIA','MP3','Corona y Filtro - Scania','INV-0002','Aceite Corona 85W-140 / Shell',5,'L',54.24,271.20,1),
('SCANIA','MP3','Corona y Filtro - Scania','INV-0350','Filtro de Aceite de Caja y Corona W9023/1 - Scania / MANN FILT',1,'U',100.81,100.81,2),
('SCANIA','FILTRO DE AIRE R500','Filtro Aire P500 - Scania','INV-0365','Filtro de Aire (Primario) P-500 2829529 - Scania',1,'U',242.50,242.50,1),
('SCANIA','FILTRO DE AIRE R500','Filtro Aire P500 - Scania','INV-0368','Filtro de Aire (Secundario) P-500 2829531 - Scania',1,'U',242.50,242.50,2),
('SCANIA','FILTRO DE AIRE P450','Filtro Aire P450 - Scania','INV-0364','Filtro de Aire (Secundario) P-450 2355129 - Scania',1,'U',215.00,215.00,1),
('SCANIA','FILTRO DE AIRE P450','Filtro Aire P450 - Scania','INV-0367','Filtro de Aire (Primario) P-450 2355128 - Scania',1,'U',215.00,215.00,2),
('SCANIA','LIQUIDO DE FRENO','Liquido de Freno - Scania','INV-0532','Liquido de Freno DOT 4 - Scania / VISTONY',1,'U',8.82,8.82,1),
('SCANIA','FILTRO SECADOR DE AIRE','Filtro Secador Aire - Scania','INV-0389','Filtro Secador de Aire 4329012282 - Scania / Wabco',1,'U',92.67,92.67,1),
('SCANIA','FILTRO SEPARADOR DE COMBUSTIBLE','Filtro Sep. Combustible - Scania','INV-0404','Filtro Separador de Combustible 1060/2 / MANN FILT',1,'U',61.45,61.45,1),
('SCANIA','HIDROLINA Y FILTRO ACEITE RETARDE','Hidrolina Retarde - Scania','INV-0090','AutoMator (Hidrolina) ATF VI - Scania / REPSOL',6,'L',22.02,132.12,1),
('SCANIA','HIDROLINA Y FILTRO ACEITE RETARDE','Hidrolina Retarde - Scania','INV-0337','Filtro de Aceite de Retarde H929/3 - Scania / MANN FILT',1,'U',31.62,31.62,2),
('SCANIA','FILTRO DE CAJA DIRECCION HIDROLINA','Filtro Caja Direccion - Scania','INV-0369','Filtro de Caja Direccion Hidrolina H 601/10 - Scania / MANN FILT',1,'U',10.79,10.79,1);

-- ==========================  MERCEDES ATEGO  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('MERCEDES ATEGO','MP1','Cambio Aceite y Filtros - Mercedes Atego','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',7,'L',44.84,313.88,1),
('MERCEDES ATEGO','MP1','Cambio Aceite y Filtros - Mercedes Atego','INV-0384','Filtro de Aceite EO-2404 - Mercedes Atego / SAKURA',1,'U',19.72,19.72,2),
('MERCEDES ATEGO','MP1','Cambio Aceite y Filtros - Mercedes Atego','INV-0375','Filtro de Combustible EF-2636 - Mercedes Atego / SAKURA',1,'U',28.35,28.35,3),
('MERCEDES ATEGO','MP1','Cambio Aceite y Filtros - Mercedes Atego','INV-0404','Filtro Separador de Combustible 1060/2 / MANN FILT',1,'U',61.45,61.45,4),
('MERCEDES ATEGO','MP2','Aceite Caja - Mercedes Atego','INV-0001','Aceite Caja 80W-90 / Shell',2.5,'L',58.00,145.00,1),
('MERCEDES ATEGO','MP3','Aceite Corona - Mercedes Atego','INV-0002','Aceite Corona 85W-140 / Shell',3.5,'L',54.24,189.84,1),
('MERCEDES ATEGO','FILTRO DE AIRE','Filtro de Aire - Mercedes Atego','INV-0360','Filtro de Aire C-281012 - Mercedes Atego / MANN FILT',1,'U',208.32,208.32,1),
('MERCEDES ATEGO','FILTRO SECADOR DE AIRE','Filtro Secador - Mercedes Atego','INV-0391','Filtro Secador de Aire 4329010042:009 / Wabco',1,'U',84.75,84.75,1);

-- ==========================  ISUZU CHIQUITO  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('ISUZU CHIQUITO','MP1','Cambio Aceite y Filtros - Isuzu Chiquito','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',5,'L',44.84,224.20,1),
('ISUZU CHIQUITO','MP1','Cambio Aceite y Filtros - Isuzu Chiquito','INV-0404','Filtro Separador de Combustible 1060/2 / MANN FILT',1,'U',61.45,61.45,2),
('ISUZU CHIQUITO','MP1','Cambio Aceite y Filtros - Isuzu Chiquito','INV-0398','Filtro separador de combustible EF-1509 - Isuzu / Sakura',1,'U',25.52,25.52,3),
('ISUZU CHIQUITO','MP1','Cambio Aceite y Filtros - Isuzu Chiquito','INV-0351','Filtro de Aceite EO-1501 - Isuzu / SAKURA',1,'U',44.00,44.00,4),
('ISUZU CHIQUITO','MP2','Aceite Caja - Isuzu Chiquito','INV-0001','Aceite Caja 80W-90 / Shell',2.25,'L',58.00,130.50,1),
('ISUZU CHIQUITO','MP3','Aceite Corona - Isuzu Chiquito','INV-0002','Aceite Corona 85W-140 / Shell',4,'L',54.24,216.96,1),
('ISUZU CHIQUITO','FILTRO DE AIRE','Filtro de Aire - Isuzu Chiquito','INV-0358','Filtro de Aire A-6038-S - Isuzu / SAKURA',1,'U',126.07,126.07,1);

-- ==========================  ISUZU  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('ISUZU','MP1','Cambio Aceite y Filtros - Isuzu','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',5,'L',44.84,224.20,1),
('ISUZU','MP1','Cambio Aceite y Filtros - Isuzu','INV-0399','Filtro separador de combustible EF-15130 - Isuzu / Sakura',1,'U',38.50,38.50,2),
('ISUZU','MP1','Cambio Aceite y Filtros - Isuzu','INV-0398','Filtro separador de combustible EF-1509 - Isuzu / Sakura',1,'U',25.52,25.52,3),
('ISUZU','MP1','Cambio Aceite y Filtros - Isuzu','INV-1707','Filtro de aceite C-1533 - Isuzu',1,'U',12.00,12.00,4),
('ISUZU','MP2','Aceite Caja - Isuzu','INV-0001','Aceite Caja 80W-90 / Shell',2.25,'L',58.00,130.50,1),
('ISUZU','MP3','Aceite Corona - Isuzu','INV-0002','Aceite Corona 85W-140 / Shell',4,'L',54.24,216.96,1),
('ISUZU','FILTRO DE AIRE','Filtro de Aire - Isuzu','INV-0358','Filtro de Aire A-6038-S - Isuzu / SAKURA',1,'U',126.07,126.07,1);

-- ==========================  INTER (International)  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('INTER','MP1','Cambio Aceite y Filtros - International','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',11,'L',44.84,493.24,1),
('INTER','MP1','Cambio Aceite y Filtros - International','INV-0335','Filtro de Aceite LF-14000NN / FLEETGUARD',1,'U',109.74,109.74,2),
('INTER','MP1','Cambio Aceite y Filtros - International','INV-0397','Filtro Separador de Combustible FS-19729 - International / FLEETGUARD',1,'U',48.21,48.21,3),
('INTER','MP2','Aceite Caja - International','INV-0001','Aceite Caja 80W-90 / Shell',4,'L',58.00,232.00,1),
('INTER','MP3','Aceite Corona - International','INV-0002','Aceite Corona 85W-140 / Shell',5,'L',54.24,271.20,1),
('INTER','FILTRO DE AIRE','Filtro de Aire - International','INV-0034','Filtro de Aire (Secundario) AF-26268 - International',1,'U',139.50,139.50,1),
('INTER','FILTRO DE AIRE','Filtro de Aire - International','INV-0341','Filtro de Aire (Primario) AF-26103 - International / FLEETGUARD',1,'U',162.12,162.12,2);

-- ==========================  HOWO  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('HOWO','MP1','Cambio Aceite y Filtros - Howo','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',11,'L',44.84,493.24,1),
('HOWO','MP1','Cambio Aceite y Filtros - Howo','INV-1358','Filtro de Aceite 202V05504-0003-O - Howo / HOWO',1,'U',220.00,220.00,2),
('HOWO','MP1','Cambio Aceite y Filtros - Howo','INV-1496','Filtro de Gas WG9716550107-001 - Howo',1,'U',190.00,190.00,3),
('HOWO','MP1','Cambio Aceite y Filtros - Howo','INV-1497','Filtro de Gas 202V13120-0003NG - Howo',1,'U',290.00,290.00,4),
('HOWO','MP2','Aceite Caja - Howo','INV-0001','Aceite Caja 80W-90 / Shell',3.84,'L',58.00,222.72,1),
('HOWO','MP3','Aceite Caja Diferencial - Howo','INV-0001','Aceite Caja 80W-90 / Shell',4.75,'L',58.00,275.50,1),
('HOWO','MP3','Aceite Caja Diferencial - Howo','INV-0001','Aceite Caja 80W-90 / Shell',3.84,'L',58.00,222.72,2),
('HOWO','FILTRO Y ACEITE DE RETARDE','Retarde - Howo','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',1.69,'L',44.84,75.78,1),
('HOWO','FILTRO Y ACEITE DE RETARDE','Retarde - Howo','INV-1494','Filtro Retardador WG2203080020-037-1 / 15 - Howo',1,'U',150.00,150.00,2),
('HOWO','FILTRO Y ACEITE DE DIRECCION','Dirección - Howo','INV-1702','Filtro de direccion T7H WG9725470233+001 - Howo Power',1,'U',50.00,50.00,1),
('HOWO','FILTRO Y ACEITE DE DIRECCION','Dirección - Howo','INV-0462','Hidrolina ATF II',1.35,'L',48.00,64.80,2),
('HOWO','FILTRO SECADOR DE AIRE','Filtro Secador Aire - Howo','INV-1703','Filtro secador de Aire WG900360571+001 - Howo',1,'U',85.00,85.00,1),
('HOWO','FILTRO DE AIRE','Filtro de Aire - Howo','INV-1492','Filtro de Aire K2841 - WG9725190102/103 - Howo',1,'U',310.00,310.00,1);

-- ==========================  HINO DUTRO  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('HINO DUTRO','MP1','Cambio Aceite y Filtros - Hino Dutro','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',3.5,'L',44.84,156.94,1),
('HINO DUTRO','MP1','Cambio Aceite y Filtros - Hino Dutro','INV-0348','Filtro de Aceite C-1328 - Hino Dutro / SAKURA',1,'U',35.90,35.90,2),
('HINO DUTRO','MP1','Cambio Aceite y Filtros - Hino Dutro','INV-0396','Filtro Separador de Combustible EF-13070 - Hino Dutro / SAKURA',1,'U',31.02,31.02,3),
('HINO DUTRO','MP2','Aceite Caja - Hino Dutro','INV-0001','Aceite Caja 80W-90 / Shell',3,'L',58.00,174.00,1),
('HINO DUTRO','MP3','Aceite Corona - Hino Dutro','INV-0002','Aceite Corona 85W-140 / Shell',4,'L',54.24,216.96,1),
('HINO DUTRO','FILTRO DE AIRE','Filtro de Aire - Hino Dutro','INV-0356','Filtro de Aire A-13570 - Hino Dutro / SAKURA',1,'U',189.83,189.83,1);

-- ==========================  HINO 500  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('HINO 500','MP1','Cambio Aceite y Filtros - Hino 500','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',3.5,'L',44.84,156.94,1),
('HINO 500','MP1','Cambio Aceite y Filtros - Hino 500','INV-0347','Filtro de Aceite C-1314 - Hino 500 / SAKURA',1,'U',37.80,37.80,2),
('HINO 500','MP1','Cambio Aceite y Filtros - Hino 500','INV-0373','Filtro de Combustible EF-1802 - Hino 500 / SAKURA',1,'U',27.08,27.08,3),
('HINO 500','MP1','Cambio Aceite y Filtros - Hino 500','INV-0402','Filtro Separador de Combustible SF-1307 - Hino 500 / SAKURA',1,'U',26.45,26.45,4),
('HINO 500','MP2','Aceite Caja - Hino 500','INV-0001','Aceite Caja 80W-90 / Shell',2,'L',58.00,116.00,1),
('HINO 500','MP3','Aceite Corona - Hino 500','INV-0002','Aceite Corona 85W-140 / Shell',2,'L',54.24,108.48,1),
('HINO 500','FILTRO DE AIRE','Filtro de Aire - Hino 500','INV-0355','Filtro de Aire A-1331-S - Hino 500',1,'U',269.40,269.40,1);

-- ==========================  H1  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('H1','MP1','Cambio Aceite y Filtros - H1','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',1.5,'L',44.84,67.26,1),
('H1','MP1','Cambio Aceite y Filtros - H1','INV-1397','Filtro de Combustible FC-2801 - H1 / SAKURA',1,'U',45.00,45.00,2),
('H1','MP1','Cambio Aceite y Filtros - H1','INV-0349','Filtro de Aceite C-2906 - H1 / SAKURA',1,'U',35.00,35.00,3),
('H1','MP2','Aceite Caja - H1','INV-0001','Aceite Caja 80W-90 / Shell',1,'L',58.00,58.00,1),
('H1','MP3','Aceite Corona - H1','INV-0002','Aceite Corona 85W-140 / Shell',1,'L',54.24,54.24,1),
('H1','FILTRO DE AIRE','Filtro de Aire - H1','INV-0353','Filtro de Aire SB5300 - H1',1,'U',16.95,16.95,1);

-- ==========================  FREIGHTLINER - MECHE  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('FREIGHTLINER - MECHE','MP1','Cambio Aceite y Filtros - Freightliner Meche','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',12,'L',44.84,538.08,1),
('FREIGHTLINER - MECHE','MP1','Cambio Aceite y Filtros - Freightliner Meche','INV-1450','Filtro de Aceite HU-12110X - Freightliner / MANN FILT',1,'U',50.59,50.59,2),
('FREIGHTLINER - MECHE','MP1','Cambio Aceite y Filtros - Freightliner Meche','INV-1451','Filtro de Combustible PU999/1X - Freightliner / MANN FILT',1,'U',70.68,70.68,3),
('FREIGHTLINER - MECHE','MP1','Cambio Aceite y Filtros - Freightliner Meche','INV-0404','Filtro Separador de Combustible 1060/2 / MANN FILT',1,'U',61.45,61.45,4),
('FREIGHTLINER - MECHE','MP2','Aceite Caja - Freightliner Meche','INV-0001','Aceite Caja 80W-90 / Shell',5,'L',58.00,290.00,1),
('FREIGHTLINER - MECHE','MP3','Aceite Corona - Freightliner Meche','INV-0002','Aceite Corona 85W-140 / Shell',10,'L',54.24,542.40,1),
('FREIGHTLINER - MECHE','FILTRO DE AIRE','Filtro de Aire - Freightliner Meche','INV-1508','Filtro de Aire AF25139M / FLEETGUARD',1,'U',139.50,139.50,1);

-- ==========================  FREIGHTLINER  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('FREIGHTLINER','MP1','Cambio Aceite y Filtros - Freightliner','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',12,'L',44.84,538.08,1),
('FREIGHTLINER','MP1','Cambio Aceite y Filtros - Freightliner','INV-0335','Filtro de Aceite LF-14000NN / FLEETGUARD',1,'U',109.74,109.74,2),
('FREIGHTLINER','MP1','Cambio Aceite y Filtros - Freightliner','INV-0331','Filtro de Combustible FS1040 - Freightliner / Fleetguard',1,'U',108.07,108.07,3),
('FREIGHTLINER','MP1','Cambio Aceite y Filtros - Freightliner','INV-0378','Filtro Separador de Combustible FS19765 - Freightliner / Fleetguard',1,'U',58.78,58.78,4),
('FREIGHTLINER','MP2','Aceite Caja - Freightliner','INV-0001','Aceite Caja 80W-90 / Shell',4,'L',58.00,232.00,1),
('FREIGHTLINER','MP3','Aceite Corona - Freightliner','INV-0002','Aceite Corona 85W-140 / Shell',10,'L',54.24,542.40,1),
('FREIGHTLINER','FILTRO SEPARADOR DE COMBUSTIBLE','Filtro Sep. Combustible - Freightliner','INV-0378','Filtro Separador de Combustible FS19765 - Freightliner / Fleetguard',1,'U',58.78,58.78,1),
('FREIGHTLINER','FILTRO DE AIRE','Filtro de Aire - Freightliner','INV-1508','Filtro de Aire AF25139M / FLEETGUARD',1,'U',139.50,139.50,1);

-- ==========================  DONG FENG  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('DONG FENG','MP1','Cambio Aceite y Filtros - Dong Feng','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',4,'L',44.84,179.36,1),
('DONG FENG','MP1','Cambio Aceite y Filtros - Dong Feng','INV-0336','Filtro de Aceite LF-16015 - Dong Feng / FLEETGUARD',1,'U',37.46,37.46,2),
('DONG FENG','MP1','Cambio Aceite y Filtros - Dong Feng','INV-0343','Filtro de Combustible FF-5612 - Dong Feng / FLEETGUARD',1,'U',45.31,45.31,3),
('DONG FENG','MP1','Cambio Aceite y Filtros - Dong Feng','INV-0394','Filtro Separador de Combustible DP-898 - Dong Feng / Daruma',1,'U',60.65,60.65,4),
('DONG FENG','MP2','Aceite Caja - Dong Feng','INV-0001','Aceite Caja 80W-90 / Shell',2,'L',58.00,116.00,1),
('DONG FENG','MP3','Aceite Corona - Dong Feng','INV-0002','Aceite Corona 85W-140 / Shell',2.5,'L',54.24,135.60,1),
('DONG FENG','FILTRO DE AIRE','Filtro de Aire - Dong Feng','INV-0338','Filtro de Aire 1109 5L-9M6-020 - Dong Feng / Bartolom',1,'U',124.43,124.43,1),
('DONG FENG','FILTRO SECADOR DE AIRE','Filtro Secador Aire - Dong Feng','INV-0391','Filtro Secador de Aire 4329010042:009 / Wabco',1,'U',84.75,84.75,1);

-- ==========================  DAF  ============================
INSERT INTO mantenimiento_kits (marca_vehiculo,tipo_mp,nombre_kit,item_codigo,item_nombre,cantidad,unidad_medida,costo_unitario,costo_total,orden) VALUES
('DAF','MP1','Cambio Aceite y Filtros - DAF','INV-1459','Aceite Motor (Rimula) R4-15W40 / Shell',10,'L',44.84,448.40,1),
('DAF','MP1','Cambio Aceite y Filtros - DAF','INV-0334','Filtro de Aceite HU12103X - Daf / MANN FILT',1,'U',48.29,48.29,2),
('DAF','MP1','Cambio Aceite y Filtros - DAF','INV-0332','Filtro de Aceite Centrifugo ZR-905z - Daf / MANN FILT',1,'U',159.77,159.77,3),
('DAF','MP1','Cambio Aceite y Filtros - DAF','INV-0404','Filtro Separador de Combustible 1060/2 / MANN FILT',1,'U',61.45,61.45,4),
('DAF','MP1','Cambio Aceite y Filtros - DAF','INV-0344','Filtro de Combustible PU-966/1x - Daf / MANN FILT',2,'U',71.42,142.85,5),
('DAF','MP2','Aceite Caja - DAF','INV-0001','Aceite Caja 80W-90 / Shell',4,'L',58.00,232.00,1),
('DAF','MP3','Aceite Corona - DAF','INV-0002','Aceite Corona 85W-140 / Shell',10,'L',54.24,542.40,1),
('DAF','FILTRO DE AIRE','Filtro de Aire - DAF','INV-0339','Filtro de Aire 1534331 - Daf / TRP',1,'U',351.99,351.99,1),
('DAF','FILTRO SECADOR DE AIRE','Filtro Secador Aire - DAF','INV-0390','Filtro Secador de Aire 1527755 - Daf / TRP',1,'U',59.96,59.96,1),
('DAF','FILTRO DE CAJA DIRECCION HIDROLINA','Filtro Caja Direccion - DAF','INV-0369','Filtro de Caja Direccion Hidrolina H 601/10 - Scania / MANN FILT',1,'U',10.79,10.79,1);


-- ================================================================
-- TABLA 3: planificacion
-- Agenda central de MPs planificadas (auto-generadas o por Excel)
-- ================================================================
CREATE TABLE IF NOT EXISTS planificacion (
    id                      VARCHAR(50)   NOT NULL PRIMARY KEY COMMENT 'PLAN-YYYYMM-0001',
    placa                   VARCHAR(20)   NOT NULL,
    configuracion_flota_id  INT           NOT NULL COMMENT 'FK → configuracion_flota.id',
    tipo_mp                 VARCHAR(60)   NOT NULL,

    -- Ventana de ejecución
    fecha_inicio_ventana    DATE          NOT NULL COMMENT 'Ejecutar desde esta fecha',
    fecha_fin_ventana       DATE          NOT NULL COMMENT 'Hasta esta fecha (deadline)',
    mes_ejecucion           INT           NOT NULL COMMENT '1=Enero … 12=Diciembre',
    anio_ejecucion          INT           NOT NULL,

    -- KM estimados
    km_estimado             INT           NOT NULL DEFAULT 0 COMMENT 'KM proyectado al inicio de ventana',
    km_minimo               INT                    COMMENT 'Si GPS < km_minimo: diferir',
    km_maximo               INT                    COMMENT 'Si GPS > km_maximo: ya está atrasado',

    -- Asignación
    tecnico_asignado        VARCHAR(100),
    prioridad               ENUM('Baja','Normal','Alta','Crítica') NOT NULL DEFAULT 'Normal',
    observaciones_plan      TEXT,

    -- Estado del workflow
    estado                  ENUM(
                                'Programada',
                                'Confirmada',
                                'En Progreso',
                                'Completada',
                                'Cancelada',
                                'Diferida'
                            ) NOT NULL DEFAULT 'Programada',
    motivo_cancelacion      TEXT COMMENT 'Obligatorio cuando estado=Cancelada',

    -- Link a ejecución real
    fleetrun_id_ejecutado   VARCHAR(50)   COMMENT 'FK → fleetrun.idRegistro',
    fecha_real_ejecucion    DATE,
    km_real_ejecucion       INT,

    -- Desviaciones calculadas al completar
    desviacion_km           INT           COMMENT 'km_real - km_estimado (+adelantado/-atrasado)',
    desviacion_dias         INT           COMMENT 'días entre fecha_real y fecha_fin_ventana',

    -- Control de alertas de retraso
    fecha_primer_retraso    DATE          COMMENT 'Cuándo se detectó por primera vez como atrasada',
    alertas_enviadas        TINYINT       NOT NULL DEFAULT 0 COMMENT '0/1/2/3 (escalada)',

    -- Generación
    source                  ENUM('manual_excel','auto_generada') NOT NULL DEFAULT 'manual_excel',
    created_by              VARCHAR(100),
    created_at              TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (placa)                  REFERENCES placas(placa),
    FOREIGN KEY (configuracion_flota_id) REFERENCES configuracion_flota(id),
    INDEX idx_estado          (estado),
    INDEX idx_placa           (placa),
    INDEX idx_mes_anio        (mes_ejecucion, anio_ejecucion),
    INDEX idx_fecha_ventana   (fecha_fin_ventana),
    INDEX idx_fleetrun_link   (fleetrun_id_ejecutado)
) COMMENT 'Agenda de mantenimientos preventivos planificados';

-- ================================================================
-- TABLA 4: requerimientos_planificacion
-- Items auto-generados al crear una planificación (del kit)
-- Visibles en el módulo de Almacén para gestión de compras
-- ================================================================
CREATE TABLE IF NOT EXISTS requerimientos_planificacion (
    id                      INT           AUTO_INCREMENT PRIMARY KEY,
    plan_id                 VARCHAR(50)   NOT NULL COMMENT 'FK → planificacion.id',
    mes_ejecucion           INT           NOT NULL COMMENT 'Denormalizado para consultas rápidas',
    anio_ejecucion          INT           NOT NULL,

    -- Item (del kit)
    item_codigo             VARCHAR(30),
    item_nombre             VARCHAR(200)  NOT NULL,
    cantidad_requerida      DECIMAL(10,2) NOT NULL,
    unidad_medida           VARCHAR(10)   NOT NULL,

    -- Costo
    costo_unitario          DECIMAL(10,2) NOT NULL DEFAULT 0,
    costo_total             DECIMAL(10,2) NOT NULL DEFAULT 0,

    -- Estado del requerimiento (para el jefe de almacén)
    estado_req              ENUM(
                                'Pendiente',
                                'Solicitado',
                                'Recibido',
                                'Entregado al Taller',
                                'Cancelado'
                            ) NOT NULL DEFAULT 'Pendiente',

    -- Trazabilidad
    fecha_solicitud         DATE,
    fecha_entrega           DATE,
    responsable_almacen     VARCHAR(100),
    observaciones           TEXT,

    created_at              TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (plan_id)    REFERENCES planificacion(id) ON DELETE CASCADE,
    INDEX idx_plan           (plan_id),
    INDEX idx_mes_anio_req   (mes_ejecucion, anio_ejecucion),
    INDEX idx_estado_req     (estado_req),
    INDEX idx_codigo_req     (item_codigo)
) COMMENT 'Items de almacén necesarios por planificación (auto-generados del kit)';


-- ================================================================
-- VISTA DE APOYO: resumen costo por kit (para UI)
-- ================================================================
CREATE OR REPLACE VIEW vista_costo_por_kit AS
SELECT
    marca_vehiculo,
    tipo_mp,
    nombre_kit,
    COUNT(*)                        AS total_items,
    ROUND(SUM(costo_total), 2)      AS costo_total_kit,
    MIN(created_at)                 AS creado_en
FROM mantenimiento_kits
WHERE activo = 1
GROUP BY marca_vehiculo, tipo_mp, nombre_kit
ORDER BY marca_vehiculo, tipo_mp;

-- ================================================================
-- FIN DEL SCRIPT
-- Ejecutar una sola vez en Aiven → verificar con:
--   SHOW TABLES LIKE '%planificacion%';
--   SHOW TABLES LIKE 'configuracion_flota';
--   SHOW TABLES LIKE 'mantenimiento_kits';
--   SELECT marca_vehiculo, tipo_mp, COUNT(*) items, SUM(costo_total) costo
--     FROM mantenimiento_kits GROUP BY marca_vehiculo, tipo_mp ORDER BY 1,2;
-- ================================================================
