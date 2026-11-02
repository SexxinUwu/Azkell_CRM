// Estado de una unidad según su último mensaje de Wialon. Lo usan el mapa y la lista, para que cuenten lo mismo.
import { MOV_KMH, SIN_SENAL_MS } from './mapaConfig';
import type { ClaseEstado } from './camiones';

export interface DatosEstado {
  lat: number | null;
  lng: number | null;
  velocidad: number;
  ignicion: boolean;
  /** Momento del último mensaje (ms desde 1970), si Wialon lo informó */
  tPos?: number | null;
}

/**
 * mov: velocidad mayor a 2 km/h · ral: velocidad 0 con ignición encendida · det: velocidad 0 con ignición apagada ·
 * off: sin posición o último mensaje hace más de 10 minutos.
 */
export function claseEstado(d: DatosEstado, ahora = Date.now()): ClaseEstado {
  if (d.lat == null || d.lng == null) return 'off';
  if (d.tPos != null && ahora - d.tPos > SIN_SENAL_MS) return 'off';
  if (d.velocidad > MOV_KMH) return 'mov';
  return d.ignicion ? 'ral' : 'det';
}
