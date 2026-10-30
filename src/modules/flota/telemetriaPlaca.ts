import type { UnidadMapa } from './api';

// Unidad de telemetría Wialon por placa (sin guiones), igual que el clásico: km del tracto y horas del remolque
export function telemetriaDe(unidades: UnidadMapa[] | undefined, placa: string): UnidadMapa | null {
  const p = placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!p || !unidades) return null;
  return unidades.find(u => {
    const up = u.placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const nom = u.nombre.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return (up && (up.includes(p) || p.includes(up))) || (nom && (nom.includes(p) || p.includes(nom)));
  }) ?? null;
}
