// Trabajos de una rampa. Se guardan en observaciones como líneas numeradas ("1. Cambio de aceite (Técnico: Juan Pérez)")
// y una línea "Nota: …" para lo demás. Así la tabla, la ficha y el PDF leen el mismo texto.

export interface TrabajoRampa { key: string; desc: string; tecnico: string }

const LINEA_AUTOMATICA = /^Generado automáticamente/i;
const SUFIJO_TECNICO = /\s*\(T[ée]cnico:\s*([^)]+)\)\s*$/i;
const NUMERADA = /^\d+[.)-]?\s/;

/** Quita el aviso que el sistema agregaba al cerrar una inspección ("Generado automáticamente desde Inspección …") */
export function quitarAutomatico(texto: string): string {
  return String(texto ?? '')
    .replace(/•\s*Generado automáticamente[^•\n]*/gi, '')
    .split('\n')
    .filter(l => !LINEA_AUTOMATICA.test(l.replace(/^[•\-*]\s*/, '').trim()))
    .join('\n');
}

/** Separa el texto guardado en trabajos (con su técnico) y notas */
export function parseTrabajosRampa(texto: string | null | undefined): { trabajos: Omit<TrabajoRampa, 'key'>[]; notas: string } {
  const lineas = quitarAutomatico(String(texto ?? '')).split('\n').map(l => l.trim()).filter(Boolean);
  const hayNumeradas = lineas.some(l => NUMERADA.test(l));
  const trabajos: Omit<TrabajoRampa, 'key'>[] = [];
  const notas: string[] = [];
  for (const l of lineas) {
    if (/^Nota:/i.test(l)) { notas.push(l.replace(/^Nota:\s*/i, '')); continue; }
    if (hayNumeradas && !NUMERADA.test(l)) { notas.push(l); continue; }
    const sinNumero = l.replace(/^\d+[.)-]?\s*/, '').replace(/^[•\-*]\s*/, '').trim();
    const tecnico = (sinNumero.match(SUFIJO_TECNICO)?.[1] ?? '').trim();
    const desc = sinNumero.replace(SUFIJO_TECNICO, '').trim();
    if (desc) trabajos.push({ desc, tecnico });
  }
  return { trabajos, notas: notas.join('\n') };
}

/** Texto que se guarda: un trabajo por línea numerada, con su técnico entre paréntesis y las notas al final */
export function formatoTrabajosRampa(trabajos: Pick<TrabajoRampa, 'desc' | 'tecnico'>[], notas: string): string {
  const lineas = trabajos
    .map(t => ({ desc: t.desc.trim(), tecnico: t.tecnico.trim() }))
    .filter(t => t.desc)
    .map((t, i) => `${i + 1}. ${t.desc}${t.tecnico ? ` (Técnico: ${t.tecnico})` : ''}`);
  if (notas.trim()) lineas.push(`Nota: ${notas.trim()}`);
  return lineas.join('\n');
}
