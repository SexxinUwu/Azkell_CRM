import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, apiFetch } from '../../../core/api/client';

// Datos del reproductor de recorridos: sensores de la unidad en cada instante (Wialon) y foto de la calle (Google Street View, vía nuestro servidor).

export interface SensorMensaje { id: number; nombre: string; valor: number; texto: string | null; unidad: string }
export interface SensoresMensaje {
  ok: boolean;
  mensaje: { t: number; lat: number; lng: number; velocidad: number; rumbo: number; satelites: number | null };
  sensores: SensorMensaje[];
}

/** Sensores de la unidad en el instante `t` (segundos desde 1970). Se agrupa de a 10 s para no repetir consultas al mover la barra */
export function useSensoresMensaje(unitId: number | null, t: number | null, activo: boolean) {
  const clave = t == null ? null : Math.round(t / 10);
  return useQuery<SensoresMensaje>({
    queryKey: ['gps', 'sensores', unitId, clave],
    enabled: activo && !!unitId && clave != null,
    staleTime: 5 * 60_000,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: () => api<SensoresMensaje>(`/telemetria/sensores-mensaje?unitId=${unitId}&t=${Math.round((clave ?? 0) * 10)}`),
  });
}

export type EstadoCalle = 'sin_clave' | 'sin_cobertura' | 'limite_diario' | 'error';
export class ErrorCalle extends Error { constructor(public estado: EstadoCalle) { super(estado); } }

/** Foto de la calle en un punto y rumbo. El servidor guarda las fotos y avisa si falta la clave, no hay cobertura o se llegó al tope diario */
export function useStreetView(lat: number | null, lng: number | null, rumbo: number, activo: boolean) {
  const r = Math.round((((rumbo % 360) + 360) % 360) / 15) * 15 % 360;
  const la = lat == null ? null : Number(lat.toFixed(5)), lo = lng == null ? null : Number(lng.toFixed(5));
  return useQuery<string, ErrorCalle>({
    queryKey: ['gps', 'calle', la, lo, r],
    enabled: activo && la != null && lo != null,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await apiFetch(`/telemetria/streetview?lat=${la}&lng=${lo}&heading=${r}&w=480&h=300`);
      if (res.ok) return URL.createObjectURL(await res.blob());
      let e: EstadoCalle = 'error';
      try {
        const j = await res.json() as { error?: string };
        if (j.error === 'sin_clave' || j.error === 'sin_cobertura' || j.error === 'limite_diario') e = j.error;
      } catch { /* sin cuerpo */ }
      throw new ErrorCalle(e);
    },
  });
}

/** Enlace para abrir Street View en Google (gratis, sin clave) en un punto y rumbo */
export const enlaceCalle = (lat: number, lng: number, rumbo = 0) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}&heading=${Math.round(rumbo)}`;

const PUNTOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export const puntoCardinal = (grados: number) => PUNTOS[Math.round((((grados % 360) + 360) % 360) / 45) % 8];
