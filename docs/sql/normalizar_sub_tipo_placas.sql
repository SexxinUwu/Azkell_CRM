-- Unifica el campo sub_tipo de la tabla placas: "Carreta", "CARRETA" y "carreta" quedan en una sola forma.
-- Regla: en cada grupo (sin distinguir mayúsculas, espacios ni tildes) se usa la forma que más placas tiene.
-- Si empatan, la que ya trae la ventana de ordenación (ver paso 2). Vacíos: no se tocan.
-- Requiere MySQL 8.0 o superior (funciones de ventana) y permiso para crear tablas temporales.
-- NO EJECUTAR sin revisar la vista previa y confirmar. Cambia datos de producción.
-- Respaldo antes:
--   mysqldump -u USUARIO -p NOMBRE_BD placas > respaldo_placas_subtipo.sql
-- Nota: este UPDATE no deja registro en placa_auditoria.

-- ───────────────────────────────────────────────────────────────
-- 1) VISTA PREVIA (solo lectura): cada variante exacta y cuántas placas la tienen
-- ───────────────────────────────────────────────────────────────
SELECT sub_tipo COLLATE utf8mb4_bin AS variante, COUNT(*) AS placas
FROM placas
WHERE TRIM(sub_tipo) <> ''
GROUP BY variante
ORDER BY LOWER(variante), placas DESC;

-- ───────────────────────────────────────────────────────────────
-- 2) QUÉ CAMBIARÍA: cada variante y la forma que la reemplaza (solo lectura)
-- ───────────────────────────────────────────────────────────────
CREATE TEMPORARY TABLE tmp_subtipo_forma AS
SELECT variante, forma FROM (
  SELECT variante,
         FIRST_VALUE(variante) OVER (PARTITION BY clave ORDER BY placas DESC, variante DESC) AS forma
  FROM (
    SELECT LOWER(TRIM(sub_tipo)) AS clave, sub_tipo COLLATE utf8mb4_bin AS variante, COUNT(*) AS placas
    FROM placas
    WHERE TRIM(sub_tipo) <> ''
    GROUP BY clave, variante
  ) grupos
) elegidas;

-- Revisar: estas filas son las que cambiarían (variante → forma, con cuántas placas)
SELECT t.variante AS de, t.forma AS a, p.placas
FROM tmp_subtipo_forma t
JOIN (
  SELECT sub_tipo COLLATE utf8mb4_bin AS variante, COUNT(*) AS placas
  FROM placas
  GROUP BY variante
) p ON p.variante = t.variante
WHERE t.variante <> t.forma
ORDER BY t.forma, t.variante;

-- ───────────────────────────────────────────────────────────────
-- 3) CAMBIO, dentro de una transacción
-- ───────────────────────────────────────────────────────────────
START TRANSACTION;

UPDATE placas p
JOIN tmp_subtipo_forma t ON p.sub_tipo COLLATE utf8mb4_bin = t.variante
SET p.sub_tipo = t.forma
WHERE t.variante <> t.forma;

-- Comprobación: debe quedar una sola forma por grupo (repetir la vista previa del paso 1).
SELECT sub_tipo COLLATE utf8mb4_bin AS variante, COUNT(*) AS placas
FROM placas
WHERE TRIM(sub_tipo) <> ''
GROUP BY variante
ORDER BY LOWER(variante), placas DESC;

-- Si la comprobación está bien:
-- COMMIT;
-- Si algo no cuadra:
-- ROLLBACK;
