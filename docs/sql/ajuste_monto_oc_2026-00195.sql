-- Ajuste de monto de la orden de compra 2026-00195: de S/ 100.00 a S/ 66.30.
-- NO EJECUTAR sin confirmación. Cambia datos de producción.
-- Base de datos: la del tenant de MARSISA (por defecto azkell_tenant_marsisa; confirmar el nombre real antes).
-- Requisitos: la orden NO debe estar en Procesado ni con pago registrado (en la captura está Aprobada, por liquidar).

-- ───────────────────────────────────────────────────────────────
-- 1) REVISAR (solo lectura). Guarda estos resultados.
-- ───────────────────────────────────────────────────────────────
SELECT id, estado, moneda, total_pen, fecha, proveedor_nombre, observaciones
FROM entradas_inv
WHERE id = '2026-00195';

SELECT id, entrada_id, inventario_id, descripcion, cantidad, costo_unitario, importe
FROM detalle_entradas_inv
WHERE entrada_id = '2026-00195';

SELECT codigo, monto_total, moneda, estado
FROM ordenes_compra
WHERE codigo = '2026-00195';

-- Pagos: el sistema no guarda una referencia directa a la OC en una tabla fácil de consultar.
-- Antes de seguir, confirmar con Tesorería (módulo Pago de requerimientos) que la OC no tiene pagos registrados.

-- ───────────────────────────────────────────────────────────────
-- 2) RESPALDO (en la terminal, fuera de MySQL)
--    mysqldump -u USUARIO -p azkell_tenant_marsisa entradas_inv detalle_entradas_inv ordenes_compra > respaldo_oc_2026-00195.sql
-- ───────────────────────────────────────────────────────────────

-- ───────────────────────────────────────────────────────────────
-- 3) CAMBIO, dentro de una transacción. Revisar los conteos antes de confirmar.
-- ───────────────────────────────────────────────────────────────
START TRANSACTION;

UPDATE entradas_inv
SET total_pen = 66.30,
    observaciones = CONCAT(COALESCE(observaciones, ''), ' [Ajuste de monto: S/ 100.00 a S/ 66.30]')
WHERE id = '2026-00195'
  AND estado NOT IN ('Procesado', 'Anulado');
-- Debe afectar 1 fila. Si afecta 0, ROLLBACK.

UPDATE detalle_entradas_inv
SET costo_unitario = 66.30,
    importe = 66.30
WHERE entrada_id = '2026-00195'
  AND cantidad = 1;
-- Debe afectar 1 fila (la orden tiene un solo renglón). Si hubiera más renglones, recalcular.

UPDATE ordenes_compra
SET monto_total = 66.30
WHERE codigo = '2026-00195';
-- Debe afectar 1 fila.

-- Comprobación: el detalle debe sumar lo mismo que la cabecera.
SELECT e.total_pen, SUM(d.importe) AS suma_detalle, o.monto_total
FROM entradas_inv e
JOIN detalle_entradas_inv d ON d.entrada_id = e.id
JOIN ordenes_compra o ON o.codigo = e.id
WHERE e.id = '2026-00195'
GROUP BY e.total_pen, o.monto_total;
-- Esperado: 66.30 | 66.30 | 66.30

-- Si todo cuadra:
COMMIT;
-- Si algo no cuadra:
-- ROLLBACK;
