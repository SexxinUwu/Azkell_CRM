-- REVISIÓN DE SOLO LECTURA (para Gemini)
-- Objetivo: saber si registros de Rosymar aparecen en la base de Marsisa y de dónde vienen.
-- REGLA: solo SELECT. No ejecutar UPDATE, DELETE, INSERT ni ALTER sin autorización explícita.
-- Antes de cualquier cambio: respaldo con mysqldump de las tablas afectadas.
-- Reportar: resultados de cada bloque (conteos y filas), sin modificar nada.

-- ───────────────────────────────────────────────────────────────
-- A) BASE MAESTRA (la que tiene la tabla empresas)
-- ───────────────────────────────────────────────────────────────
-- A1. Empresas registradas: slug, base de datos y estado.
--     Confirmar que Rosymar tenga su slug (subdominio) y su db_name correctos.
SELECT id, slug, db_name, nombre_empresa, estado
FROM empresas
ORDER BY id;

-- ───────────────────────────────────────────────────────────────
-- B) BASE DE MARSISA (azkell_tenant_marsisa)
-- ───────────────────────────────────────────────────────────────
-- B1. Conteo de rampas por quién las creó. ¿Aparece Rosymar?
SELECT creado_por, COUNT(*) AS registros, MIN(fecha_ingreso) AS primera, MAX(fecha_ingreso) AS ultima
FROM taller_rampas
GROUP BY creado_por
ORDER BY registros DESC;

-- B2. Filas de rampa creadas o asignadas a personal de Rosymar.
SELECT id, rampa, placa, conductor, creado_por, fecha_ingreso, estado, creado_en
FROM taller_rampas
WHERE creado_por LIKE '%ROSYMAR%' OR conductor LIKE '%ROSYMAR%'
ORDER BY id;

-- B3. Placas de rampas que NO existen en el catálogo de placas de Marsisa.
SELECT tr.placa, COUNT(*) AS rampas
FROM taller_rampas tr
LEFT JOIN placas p
  ON UPPER(REPLACE(p.placa, '-', '')) = UPPER(REPLACE(tr.placa, '-', ''))
WHERE p.placa IS NULL AND tr.placa IS NOT NULL AND tr.placa <> ''
GROUP BY tr.placa
ORDER BY rampas DESC;

-- B4. Usuarios de Rosymar en la tabla de usuarios de Marsisa.
--     Si existen, un usuario de Rosymar podía entrar a esta base.
SELECT id, nombre, correo, rol, estado
FROM usuarios
WHERE nombre LIKE '%ROSYMAR%' OR correo LIKE '%rosymar%';

-- B5. Órdenes de trabajo con referencias a Rosymar (si las columnas existen en la tabla).
SELECT id_ot, placa, supervisor, estado, creado_en
FROM ordenes_trabajo
WHERE supervisor LIKE '%ROSYMAR%'
ORDER BY creado_en DESC;

-- ───────────────────────────────────────────────────────────────
-- C) BASE DE ROSYMAR (azkell_tenant_rosymarperu)
-- ───────────────────────────────────────────────────────────────
-- C1. Rampas de Rosymar, para comparar con B1 y B2.
SELECT creado_por, COUNT(*) AS registros
FROM taller_rampas
GROUP BY creado_por
ORDER BY registros DESC;

-- C2. Placas que aparecen en Marsisa (B3) y ¿existen en Rosymar?
--     Sustituir la lista por las placas que devolvió B3.
SELECT p.placa, p.cliente
FROM placas p
WHERE UPPER(REPLACE(p.placa, '-', '')) IN ('BEQ942', 'CFB890', 'CPX778');

-- ───────────────────────────────────────────────────────────────
-- Resultado esperado para el informe:
--   1) ¿Hay filas de Rosymar en la base de Marsisa? (B1, B2)
--   2) ¿Las placas de B3 existen en Rosymar? (C2)
--   3) ¿Hay usuarios de Rosymar en Marsisa? (B4)
--   4) ¿El slug o db_name de Rosymar en empresas es correcto? (A1)
-- Con esto se decide qué filas borrar o mover. Ese paso requiere autorización.
-- ───────────────────────────────────────────────────────────────
