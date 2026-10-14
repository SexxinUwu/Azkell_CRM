// Tipos y subtipos de orden de trabajo (mismo catálogo que el clásico: CK_OT_SUBTIPOS).
// El subtipo depende del tipo: al cambiar el tipo se elige el primer subtipo de la lista.
export const SUBTIPOS_OT: Record<string, string[]> = {
  Correctivo: ['Falla', 'Varado', 'Programado', 'Garantía', 'Accidentabilidad', 'Mala Operación'],
  Preventivo: ['Inspección Pre-PM', 'Campaña', 'Limpieza Integral', 'Rutina', 'Programado', 'Oportuno'],
  Predictivo: ['Por condición', 'Prueba'],
  Proactivo: ['Mejora'],
  Servicio: ['Stock', 'Taller'],
};

export const TIPOS_OT = Object.keys(SUBTIPOS_OT);
