// Viajes de un recorrido: tramos en movimiento separados por paradas de 5 min o más (como el detector de viajes de Wialon).
import type { Historial, ParadaHistorial } from '../UbicacionHistorial';
import type { AnalisisCombustible, NivelParada } from './combustible';

/** Una parada de esta duración (min) o más separa dos viajes */
export const PARADA_CORTE_MIN = 5;

export interface Viaje {
  n: number;
  t0: number;
  t1: number;
  km: number;
  durMin: number;
  /** Velocidad media del viaje (km/h) */
  vProm: number;
  /** Índices de los puntos del recorrido: [primero, último] */
  rango: [number, number];
  combIni: number | null;
  combFin: number | null;
}
export type Tramo =
  | { tipo: 'viaje'; viaje: Viaje }
  | { tipo: 'parada'; parada: ParadaHistorial; n: number; nivel: NivelParada | undefined };

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function armarTramos(h: Historial | undefined, a: AnalisisCombustible): Tramo[] {
  if (!h || h.puntos.length < 2) return [];
  const pts = h.puntos;
  const cortes = h.paradas.filter(p => p.durMin >= PARADA_CORTE_MIN).sort((x, y) => x.startT - y.startT);
  // Límites de cada viaje en tiempo: del fin de una parada al inicio de la siguiente
  const lim: Array<[number, number]> = [];
  let desde = pts[0].tiempo;
  for (const c of cortes) { lim.push([desde, c.startT]); desde = c.endT; }
  lim.push([desde, pts[pts.length - 1].tiempo]);

  const nivelEn = (t: number) => {
    if (!a.hay) return null;
    let mejor: [number, number] | null = null;
    for (const s of a.serie) if (!mejor || Math.abs(s[0] - t) < Math.abs(mejor[0] - t)) mejor = s;
    return mejor ? Math.round(mejor[1]) : null;
  };
  const tramos: Tramo[] = [];
  let nViaje = 0, nParada = 0;
  lim.forEach(([t0, t1], k) => {
    let i0 = pts.findIndex(p => p.tiempo >= t0);
    let i1 = -1;
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i].tiempo <= t1) { i1 = i; break; }
    if (i0 >= 0 && i1 > i0) {
      let d = 0;
      for (let i = i0 + 1; i <= i1; i++) { const s = km(pts[i - 1], pts[i]); if (s < 50) d += s; }
      const durMin = Math.max(1, Math.round((pts[i1].tiempo - pts[i0].tiempo) / 60));
      if (d >= 0.3) {
        nViaje++;
        tramos.push({ tipo: 'viaje', viaje: {
          n: nViaje, t0: pts[i0].tiempo, t1: pts[i1].tiempo, km: Math.round(d * 10) / 10, durMin,
          vProm: Math.round(d / (durMin / 60)), rango: [i0, i1], combIni: nivelEn(pts[i0].tiempo), combFin: nivelEn(pts[i1].tiempo),
        } });
      }
    }
    if (k < cortes.length) { nParada++; tramos.push({ tipo: 'parada', parada: cortes[k], n: nParada, nivel: a.paradas.get(cortes[k].startT) }); }
  });
  return tramos;
}
