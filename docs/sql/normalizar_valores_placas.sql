-- Normaliza los campos combustible y uts de la tabla placas (una sola forma por valor: Diésel, Gasolina,
-- GNV, GNL, Local, Nacional). La app ya muestra y filtra estos valores normalizados; este script solo
-- deja la base igual, para que el clásico y las consultas directas vean los mismos nombres.
-- NO EJECUTAR sin revisar la vista previa y confirmar. Cambia datos de producción.
-- Base: la del tenant (por ejemplo azkell_tenant_marsisa). Respaldo antes:
--   mysqldump -u USUARIO -p NOMBRE_BD placas > respaldo_placas_valores.sql
-- Nota: la base usa collation *_unicode_ci, así que 'Diésel' = 'DIESEL' = 'diesel' en las comparaciones.
-- Los vacíos NO se tocan: en blanco significa "sin dato" (combustible y UTS pueden quedar en blanco).

-- ───────────────────────────────────────────────────────────────
-- 1) VISTA PREVIA (solo lectura): cuántas placas tienen cada valor hoy
-- ───────────────────────────────────────────────────────────────
SELECT combustible AS valor, COUNT(*) AS placas
FROM placas
GROUP BY combustible
ORDER BY combustible;

SELECT uts AS valor, COUNT(*) AS placas
FROM placas
GROUP BY uts
ORDER BY uts;

-- ───────────────────────────────────────────────────────────────
-- 2) CAMBIO, dentro de una transacción
-- ───────────────────────────────────────────────────────────────
START TRANSACTION;

UPDATE placas SET combustible = 'Diésel'
WHERE LOWER(TRIM(combustible)) = 'diesel';

UPDATE placas SET combustible = 'Gasolina'
WHERE LOWER(TRIM(combustible)) = 'gasolina';

UPDATE placas SET combustible = 'GNV'
WHERE LOWER(TRIM(combustible)) = 'gnv';

UPDATE placas SET combustible = 'GNL'
WHERE LOWER(TRIM(combustible)) = 'gnl';

UPDATE placas SET uts = 'Local'
WHERE LOWER(TRIM(uts)) = 'local';

UPDATE placas SET uts = 'Nacional'
WHERE LOWER(TRIM(uts)) = 'nacional';

-- Comprobación: no deben quedar valores fuera de la lista oficial (revisar a mano; los vacíos son válidos).
SELECT 'combustible' AS campo, combustible AS valor, COUNT(*) AS placas
FROM placas
WHERE combustible NOT IN ('Diésel', 'Gasolina', 'GNV', 'GNL') AND TRIM(combustible) <> ''
GROUP BY combustible
UNION ALL
SELECT 'uts', uts, COUNT(*)
FROM placas
WHERE uts NOT IN ('Local', 'Nacional') AND TRIM(uts) <> ''
GROUP BY uts;

-- Si la comprobación no muestra filas inesperadas y los conteos cuadran con la vista previa:
-- COMMIT;
-- Si algo no cuadra (o solo quieres ver el resultado sin guardar):
-- ROLLBACK;
