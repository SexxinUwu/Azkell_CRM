// Historial de recorrido de una unidad (misma fuente que la versión actual: obtenerHistorialGPS).
// Hasta 7 días se pide de una vez. Un rango más largo se pide día por día (de a uno, porque Wialon atiende una consulta a la vez) y el
// recorrido se va dibujando conforme llegan los días; cada día queda guardado, así no se vuelve a pedir.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import { guardarLocal, leerLocal } from '../../core/lib/cacheLocal';

export interface PuntoHistorial {
  lat: number;
  lng: number;
  velocidad: number;
  curso: number;
  ignicion: boolean;
  altitud: number;
  /** Nivel de combustible (%) si la unidad tiene sensor */
  combustible: number | null;
  /** Segundos desde 1970 (como en Wialon) */
  tiempo: number;
}

export interface ParadaHistorial { lat: number; lng: number; durMin: number; startT: number; endT: number }
export interface ExcesoHistorial { lat: number; lng: number; velocidad: number; tiempo: number }

export interface Historial {
  puntos: PuntoHistorial[];
  paradas: ParadaHistorial[];
  excesos: ExcesoHistorial[];
  /** El servidor no pudo cargar todo el rango: el trazado puede tener huecos */
  truncado?: boolean;
  /** Nombre del sensor de combustible de la unidad (null si no tiene) */
  sensorCombustible: string | null;
  /** Unidad del sensor: '%', 'gal', 'L'… */
  unidadCombustible: string | null;
  metricas: { totalKm: number; maxSpeed: number; avgSpeed: number; tiempoMovMin: number; paradasTotal: number };
}

const num = (v: unknown, defecto = 0) => {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) ? defecto : n;
};

/** Rango del recorrido: las últimas N horas, o un día completo ('AAAA-MM-DD', hora local) */
export type RangoHistorial = { horas: number; dia: string | null; /** 'AAAA-MM-DDTHH:mm' local */ desde?: string | null; hasta?: string | null };
const inicioDia = (d: string) => new Date(`${d}T00:00:00`);

/** Hasta cuántos días se piden de una vez; más que eso se pide día por día */
const DIAS_DE_UNA = 7;

async function consultar(args: Record<string, unknown>): Promise<Historial> {
  const r = await api<{ data?: Record<string, unknown> }>('/script/obtenerHistorialGPS', { method: 'POST', body: { args: [args] } });
  const d = (r?.data ?? {}) as Record<string, unknown>;
  if (d.error) throw new Error(String(d.error));
  const puntos = (Array.isArray(d.puntos) ? d.puntos : []) as Array<Record<string, unknown>>;
  const paradas = (Array.isArray(d.paradas) ? d.paradas : []) as Array<Record<string, unknown>>;
  const excesos = (Array.isArray(d.excesos) ? d.excesos : []) as Array<Record<string, unknown>>;
  const m = (d.metricas ?? {}) as Record<string, unknown>;
  return {
    truncado: d.truncado === true,
    sensorCombustible: typeof d.sensorCombustible === 'string' ? d.sensorCombustible : null,
    unidadCombustible: typeof d.unidadCombustible === 'string' ? d.unidadCombustible : null,
    puntos: puntos
      .map(p => ({
        lat: num(p.lat), lng: num(p.lng), velocidad: num(p.velocidad), curso: num(p.curso),
        ignicion: p.ignicion === true || Number(p.ignicion) === 1, altitud: num(p.altitud), tiempo: num(p.tiempo),
        combustible: p.combustible == null ? null : num(p.combustible),
      }))
      .filter(p => p.lat !== 0 && p.lng !== 0),
    paradas: paradas.map(s => ({ lat: num(s.lat), lng: num(s.lng), durMin: num(s.durMin), startT: num(s.startT), endT: num(s.endT) })),
    excesos: excesos.map(e => ({ lat: num(e.lat), lng: num(e.lng), velocidad: num(e.velocidad), tiempo: num(e.tiempo) })),
    metricas: {
      totalKm: num(m.totalKm), maxSpeed: num(m.maxSpeed), avgSpeed: num(m.avgSpeed),
      tiempoMovMin: num(m.tiempoMovMin), paradasTotal: num(m.paradasTotal),
    },
  };
}

const aISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Un tramo de 00:00 a 00:00 de un día que ya pasó no vuelve a cambiar: se guarda una copia en este navegador y, la próxima vez
 * (incluso tras recargar la página), sale al instante. El servidor guarda otra copia para todos los usuarios.
 */
async function consultarTramo(placa: string | null, unitId: number | null, a: Date, b: Date): Promise<Historial> {
  const args = { placa, unitId, fechaInicio: a.toISOString(), fechaFin: b.toISOString(), completo: true };
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const diaPasado = !!placa && a.getHours() === 0 && a.getMinutes() === 0 && Math.abs(b.getTime() - a.getTime() - 86400000) < 3600000 && b.getTime() <= hoy.getTime();
  if (!diaPasado) return consultar(args);
  const clave = `recorrido|v1|${placa}|${aISO(a)}`;
  const guardado = await leerLocal<Historial>(clave);
  if (guardado && Array.isArray(guardado.puntos)) return guardado;
  const h = await consultar(args);
  if (!h.truncado && h.puntos.length > 0) void guardarLocal(clave, h);
  return h;
}

function argumentos(placa: string | null, unitId: number | null, r: RangoHistorial): Record<string, unknown> {
  const { horas, dia, desde, hasta } = r;
  return desde && hasta
    // completo: recorre todo el rango por ventanas, así no se pierde el inicio por el tope de 2.000 mensajes
    ? { placa, unitId, fechaInicio: new Date(desde).toISOString(), fechaFin: new Date(hasta).toISOString(), completo: true }
    : dia
      ? { placa, unitId, fechaInicio: inicioDia(dia).toISOString(), fechaFin: new Date(inicioDia(dia).getTime() + 86400000).toISOString(), completo: true }
      // completo también en las últimas horas: trae todas las paradas y el nivel de combustible de todo el rango
      : { placa, unitId, horas, completo: true };
}

/** Rango dividido en días locales: el primer y el último tramo pueden ser parciales */
function tramosPorDia(desde: string, hasta: string): Array<{ a: Date; b: Date }> {
  const fin = new Date(hasta);
  const out: Array<{ a: Date; b: Date }> = [];
  let a = new Date(desde);
  while (a < fin && out.length < 500) {
    const sig = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 1);
    const b = sig < fin ? sig : fin;
    out.push({ a, b });
    a = b;
  }
  return out;
}

const MAX_PUNTOS = 6000;
/** Une los días ya cargados en un solo recorrido (los puntos se reducen parejo a ~6.000 para que el mapa y la barra sigan fluidos) */
function unir(partes: Historial[]): Historial | undefined {
  if (!partes.length) return undefined;
  let puntos = partes.flatMap(h => h.puntos).sort((x, y) => x.tiempo - y.tiempo);
  if (puntos.length > MAX_PUNTOS) {
    const paso = (puntos.length - 1) / (MAX_PUNTOS - 1);
    puntos = Array.from({ length: MAX_PUNTOS }, (_, i) => puntos[Math.round(i * paso)]);
  }
  const mov = partes.reduce((s, h) => s + h.metricas.tiempoMovMin, 0);
  const prom = mov ? partes.reduce((s, h) => s + h.metricas.avgSpeed * h.metricas.tiempoMovMin, 0) / mov : 0;
  return {
    puntos,
    paradas: partes.flatMap(h => h.paradas),
    excesos: partes.flatMap(h => h.excesos),
    truncado: partes.some(h => h.truncado),
    sensorCombustible: partes.find(h => h.sensorCombustible)?.sensorCombustible ?? null,
    unidadCombustible: partes.find(h => h.unidadCombustible)?.unidadCombustible ?? null,
    metricas: {
      totalKm: Math.round(partes.reduce((s, h) => s + h.metricas.totalKm, 0) * 10) / 10,
      maxSpeed: Math.max(...partes.map(h => h.metricas.maxSpeed)),
      avgSpeed: Math.round(prom),
      tiempoMovMin: mov,
      paradasTotal: partes.reduce((s, h) => s + h.metricas.paradasTotal, 0),
    },
  };
}

export interface ResultadoHistorial {
  data: Historial | undefined;
  error: unknown;
  isFetching: boolean;
  /** Solo en rangos largos: días ya cargados y total */
  progreso: { hechos: number; total: number } | null;
}

/** Recorrido de una unidad: las últimas N horas, un día o un rango (de cualquier largo, hasta los 400 días que conserva Wialon) */
export function useHistorial(placa: string | null, unitId: number | null, rango: RangoHistorial): ResultadoHistorial {
  const { horas, dia, desde, hasta } = rango;
  const qc = useQueryClient();
  const largo = !!(desde && hasta && new Date(hasta).getTime() - new Date(desde).getTime() > DIAS_DE_UNA * 86400000);

  const corto = useQuery({
    queryKey: ['flota', 'historial', placa, unitId, horas, dia, desde, hasta],
    enabled: !!placa && !largo,
    staleTime: 60_000,
    queryFn: () => (dia && !desde && !hasta ? consultarTramo(placa, unitId, inicioDia(dia), new Date(inicioDia(dia).getFullYear(), inicioDia(dia).getMonth(), inicioDia(dia).getDate() + 1)) : consultar(argumentos(placa, unitId, { horas, dia, desde, hasta }))),
  });

  const [estado, setEstado] = useState<{ partes: Historial[]; hechos: number; total: number; fin: boolean; error: unknown }>({ partes: [], hechos: 0, total: 0, fin: true, error: null });
  useEffect(() => {
    if (!largo || !placa || !desde || !hasta) { setEstado({ partes: [], hechos: 0, total: 0, fin: true, error: null }); return; }
    let cancelado = false;
    const tramos = tramosPorDia(desde, hasta);
    setEstado({ partes: [], hechos: 0, total: tramos.length, fin: false, error: null });
    (async () => {
      const partes: Historial[] = [];
      let fallos = 0, ultimoError: unknown = null;
      for (let i = 0; i < tramos.length; i++) {
        if (cancelado) return;
        const { a, b } = tramos[i];
        try {
          const h = await qc.fetchQuery({
            queryKey: ['flota', 'historial-tramo', placa, unitId, a.toISOString(), b.toISOString()],
            staleTime: 10 * 60_000,
            queryFn: () => consultarTramo(placa, unitId, a, b),
          });
          partes.push(h);
        } catch (e) { fallos++; ultimoError = e; }
        if (cancelado) return;
        const acabo = i === tramos.length - 1;
        setEstado({ partes: [...partes], hechos: i + 1, total: tramos.length, fin: acabo, error: acabo && !partes.length ? ultimoError : null });
        if (acabo && fallos && partes.length) setEstado(s => ({ ...s, partes: s.partes.map((p, k) => (k === 0 ? { ...p, truncado: true } : p)) }));
      }
    })();
    return () => { cancelado = true; };
  }, [largo, placa, unitId, desde, hasta, qc]);

  const unido = useMemo(() => unir(estado.partes), [estado.partes]);
  if (largo) return { data: unido, error: estado.error, isFetching: !estado.fin, progreso: { hechos: estado.hechos, total: estado.total } };
  return { data: corto.data, error: corto.error, isFetching: corto.isFetching, progreso: null };
}

/** Fecha y hora como en el clásico: 15/10 14:32:05 */
export function fechaHora(segundos: number) {
  const d = new Date(segundos * 1000);
  return `${d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

/** Solo la hora: 14:32 */
export function soloHora(segundos: number) {
  return new Date(segundos * 1000).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
