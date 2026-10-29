// Presentación compartida de las aprobaciones (chips de estado, nombres, prioridad).
import { categoriaOc, type CategoriaOc } from './api';

const ETIQUETA: Record<CategoriaOc, string> = {
  pendiente: 'PENDIENTE',
  observada: 'OBSERVADO',
  aprobada: 'APROBADO',
  rechazada: 'RECHAZADO',
  otra: 'OTRO',
};

/** Chip con el color de la categoría. El texto original del estado se muestra si no es reconocido. */
export function chipEstado(estado: string | null | undefined) {
  const cat = categoriaOc(estado);
  const texto = cat === 'otra' ? (estado ?? 'SIN ESTADO').toUpperCase() : ETIQUETA[cat];
  return <span className={`gerencia-chip gerencia-chip--${cat}`}>{texto}</span>;
}

/** Correo → nombre legible ("juan.perez@x.com" → "JUAN PEREZ"). Otros textos pasan tal cual. */
export function nombreLimpio(valor: string | null | undefined): string {
  const v = (valor ?? '').trim();
  if (!v) return 'SISTEMA';
  if (v.includes('@')) return v.split('@')[0].replace(/[._]/g, ' ').toUpperCase();
  return v;
}

/** La base guarda "Urgente" / "Normal" (con mayúscula inicial); se compara sin importar mayúsculas. */
export function prioridadUrgente(prioridad: string | null | undefined): boolean {
  return (prioridad ?? '').trim().toUpperCase() === 'URGENTE';
}
