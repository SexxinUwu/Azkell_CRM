// Reglas del reporte de rampas (sin React): qué bahías salen en el PDF y en el WhatsApp, y el texto del reporte.
import type { RampaEntrada } from './api';

export interface CatRampa {
  id: number | string;
  nombre_rampa?: string;
  nombre?: string;
  color?: string;
  orden?: number;
  en_reporte?: number | boolean | null;
}

/** Sin el dato, la bahía sale en el reporte (así se comporta el servidor por defecto) */
export const enReporte = (c: CatRampa) => c.en_reporte == null ? true : (c.en_reporte === true || Number(c.en_reporte) === 1);

/** Unidades de las bahías marcadas "en reporte" */
export function rampasDelReporte(activas: RampaEntrada[], catalogo: CatRampa[]): RampaEntrada[] {
  const reporte = new Set(catalogo.filter(enReporte).map(c => String(c.id)));
  return activas.filter(r => reporte.has(String(r.rampaCatId)));
}

export function fechaCorta(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function horaCorta(v: string | null): string {
  return v ? String(v).slice(0, 5) : '—';
}

/** Texto del reporte diario para WhatsApp */
export function textoReporteRampas(activas: RampaEntrada[], catalogo: CatRampa[], ahora: Date = new Date()): string {
  const filas = rampasDelReporte(activas, catalogo);
  const cabecera = `*Reporte de taller · ${fechaCorta(ahora)}*`;
  if (!filas.length) return `${cabecera}\nSin unidades en rampa.`;
  const lineas = filas.map(r => `• ${r.rampa}: ${r.placa ?? '—'} · ${r.conductor ?? '—'} · ingreso ${r.fecha_ingreso?.split('T')[0] ?? '—'} ${horaCorta(r.hora_ingreso)} · ${r.situacion ?? '—'}`);
  return [cabecera, ...lineas, `Total en rampa: ${filas.length}`].join('\n');
}
