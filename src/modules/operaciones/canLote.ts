// Telemetría CAN (Wialon) de los viajes de la página, una consulta por viaje.
// - Cada viaje tiene su propia clave de caché: cambiar filtros o fechas solo pide los viajes que aún no están cargados.
// - Las consultas van en fila (una a la vez) porque Wialon usa una sola ejecución de reporte por sesión.
// - Un viaje sin datos o con error queda marcado con su motivo, y se puede reintentar sin tocar los demás.
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import type { TelemetriaWialon } from './AnalisisViajes';

export interface ItemCan { viaje: string; placa: string; ini: string; fin: string }
export type EstadoCan = 'cargando' | 'listo' | 'sin_datos' | 'error';
export interface FilaCan { viaje: string; placa: string; estado: EstadoCan; motivo?: string; data: TelemetriaWialon | null }

/** La unidad no existe en Wialon o el reporte no trajo filas: no es un fallo, solo no hay datos */
export class SinDatosCan extends Error {}

// Misma clave que usa el detalle del viaje: así el detalle reutiliza lo que ya se cargó en la tabla
export const claveCan = (i: ItemCan) => ['operaciones', 'wialon', i.viaje, i.placa, i.ini, i.fin] as const;

let cola: Promise<unknown> = Promise.resolve();
/** Ejecuta las consultas de una en una. Si la consulta ya no se necesita (cambió el filtro), se omite. */
export function encolarCan<T>(signal: AbortSignal, tarea: () => Promise<T>): Promise<T> {
  const p = cola.then(() => {
    if (signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
    return tarea();
  });
  cola = p.catch(() => undefined);
  return p;
}

export async function pedirCan(i: ItemCan): Promise<TelemetriaWialon> {
  const p = new URLSearchParams({ placa: i.placa, fechaInicio: i.ini, fechaFin: i.fin });
  const r = await api<{ ok?: boolean; data?: TelemetriaWialon | null; error?: string }>(`/combustible/wialon-telemetria?${p.toString()}`);
  if (!r.ok) throw new Error(r.error || 'No se pudo consultar Wialon');
  if (!r.data) throw new SinDatosCan('Sin unidad en Wialon con esa placa o sin telemetría en el periodo');
  return r.data;
}

export function useCanViajes(items: ItemCan[], activo: boolean) {
  const qc = useQueryClient();
  const queries = useQueries({
    queries: items.map(i => ({
      queryKey: claveCan(i),
      queryFn: ({ signal }: { signal: AbortSignal }) => encolarCan(signal, () => pedirCan(i)),
      enabled: activo,
      retry: false,
      staleTime: 30 * 60_000,
    })),
  });

  const filas: FilaCan[] = items.map((i, k) => {
    const q = queries[k];
    if (q.isError) {
      const sinDatos = q.error instanceof SinDatosCan;
      return { viaje: i.viaje, placa: i.placa, estado: sinDatos ? 'sin_datos' : 'error', motivo: q.error instanceof Error ? q.error.message : String(q.error), data: null };
    }
    if (q.data) return { viaje: i.viaje, placa: i.placa, estado: 'listo', data: q.data };
    return { viaje: i.viaje, placa: i.placa, estado: 'cargando', data: null };
  });

  const lote = Object.fromEntries(filas.map(f => [f.viaje, { data: f.data, error: f.motivo, estado: f.estado }])) as Record<string, { data: TelemetriaWialon | null; error?: string; estado: EstadoCan }>;
  const contar = (e: EstadoCan) => filas.filter(f => f.estado === e).length;

  return {
    lote,
    filas,
    total: items.length,
    listos: contar('listo'),
    cargando: contar('cargando'),
    sinDatos: contar('sin_datos'),
    errores: contar('error'),
    reintentar: (i: ItemCan) => qc.invalidateQueries({ queryKey: claveCan(i) }),
  };
}
