-- Normaliza el campo sub_tipo de la tabla placas (una sola forma por variante: Carreta, Furgón, Camión…).
-- Ejecutar en una sola sesión de MySQL (la tabla temporal solo vive en la conexión activa).
-- Base: la del tenant (por ejemplo azkell_tenant_marsisa).
-- Requiere MySQL 8.0 o superior (funciones de ventana).

-- 1) VISTA PREVIA (solo lectura): cada variante exacta y cuántas placas la tienen
SELECT sub_tipo COLLATE utf8mb4_bin AS variante, COUNT(*) AS placas
FROM placas
WHERE TRIM(sub_tipo) <> ''
GROUP BY variante
ORDER BY LOWER(variante), placas DESC;

-- 2) QUÉ CAMBIARÍA (solo lectura)
-- Prioriza la forma con mayúscula inicial / Title Case sobre mayúsculas sostenidas, y mayor frecuencia.
CREATE TEMPORARY TABLE tmp_subtipo_forma AS
SELECT variante, forma FROM (
  SELECT variante,
         FIRST_VALUE(variante) OVER (
             PARTITION BY clave 
             ORDER BY (CASE WHEN BINARY UPPER(variante) = BINARY variante THEN 0 ELSE 1 END) DESC, 
                      placas DESC, 
                      variante DESC
         ) AS forma
  FROM (
    SELECT LOWER(TRIM(sub_tipo)) AS clave, sub_tipo COLLATE utf8mb4_bin AS variante, COUNT(*) AS placas
    FROM placas
    WHERE TRIM(sub_tipo) <> ''
    GROUP BY clave, variante
  ) grupos
) elegidas;

-- Ajustes directos de casos en mayúsculas completas sin contraparte mixta
UPDATE tmp_subtipo_forma SET forma = 'Plataforma' WHERE variante = 'PLATAFORMA';
UPDATE tmp_subtipo_forma SET forma = 'Furgón' WHERE variante = 'FURGÓN';
UPDATE tmp_subtipo_forma SET forma = 'Carreta' WHERE variante = 'CARRETA';

SELECT t.variante AS de, t.forma AS a, p.placas
FROM tmp_subtipo_forma t
JOIN (
  SELECT sub_tipo COLLATE utf8mb4_bin AS variante, COUNT(*) AS placas
  FROM placas
  GROUP BY variante
) p ON p.variante = t.variante
WHERE t.variante <> t.forma
ORDER BY t.forma, t.variante;

-- 3) CAMBIO, dentro de una transacción
START TRANSACTION;

UPDATE placas p
JOIN tmp_subtipo_forma t ON p.sub_tipo COLLATE utf8mb4_bin = t.variante
SET p.sub_tipo = t.forma
WHERE t.variante <> t.forma;

-- Comprobación: debe quedar una sola forma por grupo
SELECT sub_tipo COLLATE utf8mb4_bin AS variante, COUNT(*) AS placas
FROM placas
WHERE TRIM(sub_tipo) <> ''
GROUP BY variante
ORDER BY LOWER(variante), placas DESC;

COMMIT;
