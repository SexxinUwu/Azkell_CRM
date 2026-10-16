// Días desde la última inspección de cada unidad, para la columna "Inspección" de Status de Rampa.
// Misma regla que srCalcularDiasInspeccion (Modulos/mantenimiento/status-rampa/logica.js): la última inspección
// general (no "Solo Frenos"; si no hay, cualquiera de la placa), y días = fecha + días propuestos − hoy.
import type { Inspeccion } from '../inspecciones/api';
import { clavePlaca } from '../inspecciones/api';

export interface DiasInspeccion {
  texto: string;
  color: string;
  /** Valor para ordenar: más bajo = más urgente */
  valor: number;
}

const DIA = 86_400_000;
const inicioDelDia = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Mapa placa → inspección más reciente que cuenta para el ciclo */
export function ultimasPorPlaca(lista: Inspeccion[]): Map<string, Inspeccion> {
  const porPlaca = new Map<string, Inspeccion[]>();
  for (const i of lista) {
    const k = clavePlaca(i.placa);
    porPlaca.set(k, [...(porPlaca.get(k) ?? []), i]);
  }
  const elegida = new Map<string, Inspeccion>();
  for (const [k, todas] of porPlaca) {
    const ordenadas = (xs: Inspeccion[]) => [...xs].sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0) || b.id.localeCompare(a.id, 'es', { numeric: true }));
    const generales = todas.filter(i => i.tipo !== 'Solo Frenos');
    const ultima = ordenadas(generales.length ? generales : todas)[0];
    if (ultima) elegida.set(k, ultima);
  }
  return elegida;
}

/** Texto, color y valor de los días de inspección de una placa */
export function diasInspeccion(placa: string | null | undefined, ultimas: Map<string, Inspeccion>): DiasInspeccion {
  if (!placa) return { texto: '—', color: '#94a3b8', valor: 9999 };
  const ultima = ultimas.get(clavePlaca(placa));
  if (!ultima?.fecha) return { texto: 'Sin Insp.', color: '#dc2626', valor: -999 };
  const prox = inicioDelDia(ultima.fecha);
  prox.setDate(prox.getDate() + (ultima.diasPropuestos || 30));
  const dias = Math.round((prox.getTime() - inicioDelDia(new Date()).getTime()) / DIA);
  if (dias < 0) return { texto: `${dias} d`, color: '#dc2626', valor: dias };
  if (dias <= 7) return { texto: `${dias} d`, color: '#d97706', valor: dias };
  return { texto: `+${dias} d`, color: '#16a34a', valor: dias };
}

/** Semáforo de la inspección: verde sin fallas; ámbar con fallas vigentes; rojo con fallas y la inspección vencida. */
export function semaforoInspeccion(insp: Inspeccion | null, dias: DiasInspeccion): 'green' | 'amber' | 'red' | 'gray' {
  if (!insp) return 'gray';
  const fallas = insp.puntos.filter(p => p.estado === 'FALLA').length;
  if (fallas === 0) return 'green';
  return dias.valor < 0 ? 'red' : 'amber';
}
