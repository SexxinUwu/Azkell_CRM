// Respuesta háptica breve (skill apple-design §13): solo en momentos con significado
// — encaje de una selección, éxito, alerta. Funciona en Android; iOS Safari la ignora.

const PATTERNS = {
  selection: 6,          // cambiar de pestaña, encajar en un valor
  success: [10, 40, 14], // acción completada
  warning: [24, 60, 24, 60, 40], // cliente bloqueado
} as const;

export function haptic(kind: keyof typeof PATTERNS = 'selection') {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate?.(PATTERNS[kind] as number | number[]);
  } catch {
    /* sin soporte: no pasa nada */
  }
}
