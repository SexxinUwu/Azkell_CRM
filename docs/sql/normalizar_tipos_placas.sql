-- Normaliza el campo tipo de la tabla placas (una sola forma por tipo: Semirremolque, Carreta, Tracto…).
-- NO EJECUTAR sin revisar la vista previa y confirmar. Cambia datos de producción.
-- Base: la del tenant (por ejemplo azkell_tenant_marsisa). Respaldo antes:
--   mysqldump -u USUARIO -p NOMBRE_BD placas > respaldo_placas_tipo.sql
-- Nota: la base usa collation *_unicode_ci, así que 'CAMIÓN' = 'camion' en las comparaciones.

-- ───────────────────────────────────────────────────────────────
-- 1) VISTA PREVIA (solo lectura): cuántas placas tienen cada tipo hoy
-- ───────────────────────────────────────────────────────────────
SELECT tipo, COUNT(*) AS placas
FROM placas
GROUP BY tipo
ORDER BY tipo;

-- ───────────────────────────────────────────────────────────────
-- 2) CAMBIO, dentro de una transacción
-- ───────────────────────────────────────────────────────────────
START TRANSACTION;

UPDATE placas SET tipo = 'Semirremolque'
WHERE REPLACE(LOWER(TRIM(tipo)), ' ', '') IN ('semirremolque', 'semiremolque');

UPDATE placas SET tipo = 'Remolque'
WHERE LOWER(TRIM(tipo)) = 'remolque';

-- DECISIÓN PENDIENTE: 'Carreta' se mantiene como tipo propio hasta confirmar con la tarjeta de
-- propiedad (campo Clase de SUNARP). Si confirman que es un semirremolque, cambiar a 'Semirremolque'.
UPDATE placas SET tipo = 'Carreta'
WHERE LOWER(TRIM(tipo)) = 'carreta';

UPDATE placas SET tipo = 'Camión'
WHERE REPLACE(LOWER(TRIM(tipo)), ' ', '') IN ('camion', 'camiones');

UPDATE placas SET tipo = 'Tracto'
WHERE REPLACE(LOWER(TRIM(tipo)), ' ', '') IN ('tracto', 'tractocamion');

UPDATE placas SET tipo = 'Cisterna'
WHERE LOWER(TRIM(tipo)) = 'cisterna';

UPDATE placas SET tipo = 'Furgón'
WHERE LOWER(TRIM(tipo)) = 'furgon';

UPDATE placas SET tipo = 'Plataforma'
WHERE LOWER(TRIM(tipo)) = 'plataforma';

UPDATE placas SET tipo = 'Tolva'
WHERE LOWER(TRIM(tipo)) = 'tolva';

-- Comprobación: ya no debe quedar ningún nombre fuera de la lista oficial (revisar a mano).
SELECT tipo, COUNT(*) AS placas
FROM placas
WHERE tipo NOT IN ('Camión', 'Tracto', 'Semirremolque', 'Remolque', 'Carreta', 'Cisterna', 'Furgón', 'Plataforma', 'Tolva')
   OR tipo IS NULL
GROUP BY tipo;

-- Si la comprobación no muestra filas inesperadas y los conteos cuadran con la vista previa:
COMMIT;
-- Si algo no cuadra:
-- ROLLBACK;
