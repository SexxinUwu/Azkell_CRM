// Equivalencias entre el submotivo de una orden de compra (catálogo de almacén) y el motivo / submotivo
// de gasto de Caja (tesoreria_motivos_gastos). Lo usan el pago de requerimientos al registrar el egreso y
// la corrección de los egresos ya guardados (scripts). Los motivos deben existir tal cual en el catálogo activo,
// salvo "COMPRA / ALMACÉN", que es la etiqueta de compras sin equivalente en Caja.
//
// Aprobadas (2026-10-26): las cinco primeras.
// Recomendadas (pendientes de confirmar): las marcadas con "recomendada".

const MAPA_SUBMOTIVO_OC = {
  // Aprobadas
  'Repuestos menores / Accesorios': { motivo: 'Mantenimiento y Auxilio', sub: 'Repuestos menores / Accesorios de viaje' },
  'Mantenimiento correctivo / Auxilio mecánico': { motivo: 'Mantenimiento y Auxilio', sub: 'Grúa o auxilio mecánico en ruta' },
  'Servicios de tornería y rectificación': { motivo: 'Mantenimiento y Auxilio', sub: 'Servicios de tornería y soldadura' },
  'Peajes y pesajes': { motivo: 'Gastos de Viaje y Ruta', sub: 'Peajes (físico / telepeaje)' },
  'Equipos de comunicación / GPS / Radios': { motivo: 'Servicios de Terceros', sub: 'Mantenimiento de software / GPS satelital' },

  // Recomendadas (pendientes de confirmar)
  'Servicio técnico especializado externo': { motivo: 'Mantenimiento y Auxilio', sub: 'Mantenimiento preventivo programado' }, // recomendada
  'Fletes y transportes tercerizados': { motivo: 'Gastos de Viaje y Ruta', sub: 'Estibadores / Carga y descarga menor' }, // recomendada
  'Stock general de almacén': { motivo: 'COMPRA / ALMACÉN', sub: 'Stock general de almacén' }, // recomendada: inventario, sin equivalente en Caja
  'Mobiliario y enseres': { motivo: 'Gastos Administrativos / Oficina', sub: 'Útiles de escritorio y papelería' }, // recomendada
  'Herramientas y maquinaria de taller': { motivo: 'Mantenimiento y Auxilio', sub: 'Repuestos menores / Accesorios de viaje' }, // recomendada
  'Equipos de cómputo y tecnología': { motivo: 'Servicios de Terceros', sub: 'Mantenimiento de software / GPS satelital' }, // recomendada
};

/** Devuelve { motivo, sub } para un submotivo de orden de compra, o null si no hay equivalencia */
function equivalenciaOC(subMotivo) {
  const clave = String(subMotivo || '').trim();
  return MAPA_SUBMOTIVO_OC[clave] || null;
}

module.exports = { MAPA_SUBMOTIVO_OC, equivalenciaOC };
