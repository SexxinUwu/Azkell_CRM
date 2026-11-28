-- Submotivo «Reencauche de llantas» (2026-11-27). Idempotente: solo se agrega si el motivo «Mantenimiento y Auxilio» existe y el submotivo falta.
-- Lo usa la orden de reencauche que genera Neumáticos (centro de costo CC-400 Taller y Mantenimiento).
INSERT INTO `tesoreria_motivos_gastos` (`motivo`, `sub_motivo`, `centro_costo_codigo`, `estado`)
SELECT 'Mantenimiento y Auxilio', 'Reencauche de llantas', 'CC-400', 'ACTIVO' FROM DUAL
WHERE EXISTS (SELECT 1 FROM `tesoreria_motivos_gastos` WHERE `motivo` = 'Mantenimiento y Auxilio')
  AND NOT EXISTS (SELECT 1 FROM `tesoreria_motivos_gastos` WHERE `motivo` = 'Mantenimiento y Auxilio' AND `sub_motivo` = 'Reencauche de llantas');
