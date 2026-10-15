// Historial de recorrido de una unidad (misma fuente que la versión actual: obtenerHistorialGPS).
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

export interface PuntoHistorial {
  lat: number;
  lng: number;
  velocidad: number;
  curso: number;
  ignicion: boolean;
  altitud: number;
  /** Segundos desde 1970 (como en Wialon) */
  tiempo: number;
}

export interface ParadaHistorial { lat: number; lng: number; durMin: number; startT: number; endT: number }
export interface ExcesoHistorial { lat: number; lng: number; velocidad: number; tiempo: number }

export interface Historial {
  puntos: PuntoHistorial[];
  paradas: ParadaHistorial[];
  excesos: ExcesoHistorial[];
  metricas: { totalKm: number; maxSpeed: number; avgSpeed: number; tiempoMovMin: number; paradasTotal: number };
}

const num = (v: unknown, defecto = 0) => {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) ? defecto : n;
};

/** Recorrido de las últimas N horas de una unidad */
export function useHistorial(placa: string | null, unitId: number | null, horas: number) {
  return useQuery({
    queryKey: ['flota', 'historial', placa, unitId, horas],
    enabled: !!placa,
    staleTime: 60_000,
    queryFn: async (): Promise<Historial> => {
      const r = await api<{ data?: Record<string, unknown> }>('/script/obtenerHistorialGPS', {
        method: 'POST',
        body: { args: [{ placa, unitId, horas }] },
      });
      const d = (r?.data ?? {}) as Record<string, unknown>;
      if (d.error) throw new Error(String(d.error));
      const puntos = (Array.isArray(d.puntos) ? d.puntos : []) as Array<Record<string, unknown>>;
      const paradas = (Array.isArray(d.paradas) ? d.paradas : []) as Array<Record<string, unknown>>;
      const excesos = (Array.isArray(d.excesos) ? d.excesos : []) as Array<Record<string, unknown>>;
      const m = (d.metricas ?? {}) as Record<string, unknown>;
      return {
        puntos: puntos
          .map(p => ({
            lat: num(p.lat), lng: num(p.lng), velocidad: num(p.velocidad), curso: num(p.curso),
            ignicion: p.ignicion === true || Number(p.ignicion) === 1, altitud: num(p.altitud), tiempo: num(p.tiempo),
          }))
          .filter(p => p.lat !== 0 && p.lng !== 0),
        paradas: paradas.map(s => ({ lat: num(s.lat), lng: num(s.lng), durMin: num(s.durMin), startT: num(s.startT), endT: num(s.endT) })),
        excesos: excesos.map(e => ({ lat: num(e.lat), lng: num(e.lng), velocidad: num(e.velocidad), tiempo: num(e.tiempo) })),
        metricas: {
          totalKm: num(m.totalKm), maxSpeed: num(m.maxSpeed), avgSpeed: num(m.avgSpeed),
          tiempoMovMin: num(m.tiempoMovMin), paradasTotal: num(m.paradasTotal),
        },
      };
    },
  });
}

/** Fecha y hora como en el clásico: 15/10 14:32:05 */
export function fechaHora(segundos: number) {
  const d = new Date(segundos * 1000);
  return `${d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}
