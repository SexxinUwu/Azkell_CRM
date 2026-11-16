-- Cuentas bancarias de proveedores y del personal, con cuenta principal (2026-11-16). Aditiva e idempotente.
-- proveedor_cuentas_bancarias: columna principal (la que sale por defecto al elegir al proveedor), cci y tipos YAPE / PLIN.
-- persona_cuentas_bancarias: mismas columnas para conductores y personal, identificadas por documento (DNI).

-- 1) cci en cuentas de proveedores (Yoguitransport no la tenía)
SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proveedor_cuentas_bancarias' AND COLUMN_NAME = 'cci');
SET @sql = IF(@falta = 0, 'ALTER TABLE `proveedor_cuentas_bancarias` ADD COLUMN `cci` VARCHAR(40) NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 2) tipos de cuenta YAPE y PLIN (antes se agregaban al guardar desde el servidor)
SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proveedor_cuentas_bancarias' AND COLUMN_NAME = 'tipo_cuenta' AND COLUMN_TYPE LIKE '%PLIN%');
SET @sql = IF(@falta = 0, 'ALTER TABLE `proveedor_cuentas_bancarias` MODIFY COLUMN `tipo_cuenta` ENUM(''CUENTA CORRIENTE'',''CUENTA DE AHORROS'',''CUENTA REMUNERADA'',''YAPE'',''PLIN'') NOT NULL', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 3) cuenta principal del proveedor
SET @falta = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proveedor_cuentas_bancarias' AND COLUMN_NAME = 'principal');
SET @sql = IF(@falta = 0, 'ALTER TABLE `proveedor_cuentas_bancarias` ADD COLUMN `principal` TINYINT(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 4) cuentas del personal (conductores y RRHH): misma forma que las de proveedores
CREATE TABLE IF NOT EXISTS `persona_cuentas_bancarias` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `documento` VARCHAR(20) NOT NULL,
  `nombre` VARCHAR(200) NOT NULL DEFAULT '',
  `banco` VARCHAR(100) NOT NULL DEFAULT '',
  `tipo_cuenta` VARCHAR(30) NOT NULL DEFAULT 'CUENTA DE AHORROS',
  `moneda` VARCHAR(20) NOT NULL DEFAULT 'SOLES',
  `numero_cuenta` VARCHAR(100) NOT NULL DEFAULT '',
  `cci` VARCHAR(40) NULL,
  `principal` TINYINT(1) NOT NULL DEFAULT 0,
  `estado` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_persona_cuenta_doc` (`documento`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) Datos: la primera cuenta activa de cada proveedor queda como principal (solo si aún no tiene una)
UPDATE `proveedor_cuentas_bancarias` c
JOIN (SELECT proveedor_id, MIN(id) AS mid FROM `proveedor_cuentas_bancarias` WHERE estado = 1 GROUP BY proveedor_id) m ON m.mid = c.id
SET c.principal = 1
WHERE c.principal = 0
  AND NOT EXISTS (SELECT 1 FROM (SELECT proveedor_id FROM `proveedor_cuentas_bancarias` WHERE principal = 1) x WHERE x.proveedor_id = c.proveedor_id);

-- 6) Datos: la cuenta que ya tenía cada conductor pasa a la tabla nueva (no duplica si se corre otra vez)
INSERT INTO `persona_cuentas_bancarias` (documento, nombre, banco, tipo_cuenta, moneda, numero_cuenta, principal)
SELECT TRIM(c.dni), c.nombre, COALESCE(NULLIF(TRIM(c.banco), ''), 'Banco'), 'CUENTA DE AHORROS', 'SOLES', TRIM(c.numero_cuenta), 1
FROM `conductores` c
WHERE c.numero_cuenta IS NOT NULL AND TRIM(c.numero_cuenta) <> '' AND TRIM(c.dni) <> ''
  AND NOT EXISTS (SELECT 1 FROM `persona_cuentas_bancarias` p WHERE p.documento = TRIM(c.dni) AND p.numero_cuenta = TRIM(c.numero_cuenta));

-- 7) Datos: la CCI de haberes del personal de RRHH pasa a la tabla nueva
INSERT INTO `persona_cuentas_bancarias` (documento, nombre, banco, tipo_cuenta, moneda, numero_cuenta, cci, principal)
SELECT TRIM(r.numero_documento), TRIM(CONCAT(r.nombres, ' ', r.apellidos)), COALESCE(NULLIF(TRIM(r.banco_haberes), ''), 'Banco'), 'CUENTA DE AHORROS', 'SOLES', '', TRIM(r.cci_haberes), 0
FROM `rrhh_personal` r
WHERE r.cci_haberes IS NOT NULL AND TRIM(r.cci_haberes) <> ''
  AND NOT EXISTS (SELECT 1 FROM `persona_cuentas_bancarias` p WHERE p.documento = TRIM(r.numero_documento) AND (p.cci = TRIM(r.cci_haberes) OR p.numero_cuenta = TRIM(r.cci_haberes)));

-- 8) Datos: cada persona queda con una principal (la primera activa)
UPDATE `persona_cuentas_bancarias` c
JOIN (SELECT documento, MIN(id) AS mid FROM `persona_cuentas_bancarias` WHERE estado = 1 GROUP BY documento) m ON m.mid = c.id
SET c.principal = 1
WHERE c.principal = 0
  AND NOT EXISTS (SELECT 1 FROM (SELECT documento FROM `persona_cuentas_bancarias` WHERE principal = 1) x WHERE x.documento = c.documento);
