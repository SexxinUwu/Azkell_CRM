// Análisis del nivel de combustible (%) de un recorrido: caídas bruscas, recargas y nivel antes y después de cada parada.
import type { Historial, PuntoHistorial } from '../UbicacionHistorial';

/** Caída (o subida) de puntos porcentuales que se considera anormal */
export const FUEL_CAMBIO_PCT = 10;
/** Tiempo máximo (min) en que debe ocurrir el cambio para llamarlo abrupto */
export const FUEL_VENTANA_MIN = 20;

export interface EventoCombustible {
  tipo: 'caida' | 'recarga';
  t0: number;
  t1: number;
  desde: number;
  hasta: number;
  lat: number;
  lng: number;
  /** Ocurrió con la unidad detenida: es el caso sospechoso de extracción */
  detenida: boolean;
}
export interface NivelParada { startT: number; antes: number | null; despues: number | null }
export interface AnalisisCombustible {
  hay: boolean;
  /** '%' o 'gal' (cuando el sensor mide galones y la placa no tiene capacidad de tanque) */
  unidad: string;
  inicio: number | null;
  fin: number | null;
  minimo: number | null;
  eventos: EventoCombustible[];
  paradas: Map<number, NivelParada>;
  /** Serie suavizada para el gráfico: [tiempo, %] */
  serie: Array<[number, number]>;
}

const mediana = (v: number[]) => { const o = [...v].sort((a, b) => a - b); return o[Math.floor(o.length / 2)]; };

/** El sensor se mueve con el chapoteo del tanque: se suaviza con la mediana de 5 lecturas */
function suavizar(pts: PuntoHistorial[], factor: number) {
  // Un 0 con la unidad en marcha es un sensor sin lectura, no un tanque vacío
  const con = pts.filter(p => p.combustible != null && !(p.combustible === 0 && p.ignicion)) as Array<PuntoHistorial & { combustible: number }>;
  return con.map((p, i) => ({ p, f: mediana(con.slice(Math.max(0, i - 2), i + 3).map(x => x.combustible * factor)) }));
}

/**
 * factor: multiplica la lectura del sensor para dejarla en la unidad mostrada (por ejemplo 100 / capacidad del tanque para pasar galones a %).
 */
export function analizarCombustible(h: Historial | null | undefined, opts: { factor?: number; unidad?: string } = {}): AnalisisCombustible {
  const factor = opts.factor ?? 1, unidad = opts.unidad ?? '%';
  const vacio: AnalisisCombustible = { hay: false, unidad, inicio: null, fin: null, minimo: null, eventos: [], paradas: new Map(), serie: [] };
  if (!h || !h.puntos.length) return vacio;
  const s = suavizar(h.puntos, factor);
  if (s.length < 3) return vacio;

  const eventos: EventoCombustible[] = [];
  const ventana = FUEL_VENTANA_MIN * 60;
  for (let i = 0; i < s.length - 1;) {
    let hallado = -1;
    for (let j = i + 1; j < s.length && s[j].p.tiempo - s[i].p.tiempo <= ventana; j++) {
      if (Math.abs(s[j].f - s[i].f) >= FUEL_CAMBIO_PCT) { hallado = j; break; }
    }
    if (hallado < 0) { i++; continue; }
    // Se sigue mientras el cambio continúe en el mismo sentido (una extracción dura varios mensajes)
    const baja = s[hallado].f < s[i].f;
    let k = hallado;
    while (k + 1 < s.length && s[k + 1].p.tiempo - s[k].p.tiempo <= 300 && (baja ? s[k + 1].f < s[k].f - 0.5 : s[k + 1].f > s[k].f + 0.5)) k++;
    const tramo = s.slice(i, k + 1);
    eventos.push({
      tipo: baja ? 'caida' : 'recarga', t0: s[i].p.tiempo, t1: s[k].p.tiempo,
      desde: Math.round(s[i].f), hasta: Math.round(s[k].f), lat: s[k].p.lat, lng: s[k].p.lng,
      detenida: tramo.every(x => x.p.velocidad <= 3),
    });
    i = k + 1;
  }

  const antesDe = (t: number) => { const c = s.filter(x => x.p.tiempo <= t).slice(-5); return c.length ? Math.round(mediana(c.map(x => x.f))) : null; };
  const despuesDe = (t: number) => { const c = s.filter(x => x.p.tiempo >= t).slice(0, 5); return c.length ? Math.round(mediana(c.map(x => x.f))) : null; };
  const paradas = new Map<number, NivelParada>();
  h.paradas.forEach(p => paradas.set(p.startT, { startT: p.startT, antes: antesDe(p.startT), despues: despuesDe(p.endT) }));

  const paso = Math.max(1, Math.ceil(s.length / 240));
  return {
    hay: true, unidad,
    inicio: Math.round(s[0].f), fin: Math.round(s[s.length - 1].f), minimo: Math.round(Math.min(...s.map(x => x.f))),
    eventos, paradas,
    serie: s.filter((_, i) => i % paso === 0 || i === s.length - 1).map(x => [x.p.tiempo, x.f] as [number, number]),
  };
}
