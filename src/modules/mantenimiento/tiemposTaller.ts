// Indicadores de tiempo del taller, con una sola regla para la pantalla de Ingresos y el dashboard:
// - Permanencia: tiempo de una visita a la rampa (ingreso → salida), solo visitas ya liberadas.
// - MTTR: tiempo trabajado sin pausas por OT cerrada. Las OT cerradas sin fecha de inicio se excluyen y se cuentan.
// - Tiempo de espera: permanencia − tiempo trabajado, en las OT cerradas que tienen visita vinculada (id_rampa).
import type { OrdenTrabajo, RampaEntrada } from './api';
import { tiempoNetoOT } from './api';

const HORA = 3_600_000;

const parseFecha = (s?: string | null) => {
  if (!s) return NaN;
  return new Date(s.includes('T') ? s : s.replace(' ', 'T')).getTime();
};

/** Fecha de ingreso de la visita o de la OT (AAAA-MM-DD) */
const diaIngreso = (fecha?: string | null) => (fecha ?? '').slice(0, 10);
const fechaOT = (o: OrdenTrabajo) => diaIngreso(o.fecha_ingreso || o.creado_en || o.created_at);

const ingresoVisita = (e: RampaEntrada) => parseFecha(e.fecha_ingreso ? `${diaIngreso(e.fecha_ingreso)}T${e.hora_ingreso || '00:00:00'}` : null);
const salidaVisita = (e: RampaEntrada) => parseFecha(e.fecha_salida);
const cerrada = (o: OrdenTrabajo) => /cerrad|finaliz/i.test(String(o.estado ?? ''));
const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export interface IndicadoresTaller {
  permanenciaHoras: number | null;
  permanenciaN: number;
  permanenciaEnRampa: number;   // visitas del intervalo que siguen dentro (sin salida)
  mttrHoras: number | null;
  mttrN: number;
  mttrExcluidas: number;        // OT cerradas en el intervalo sin fecha de inicio
  esperaHoras: number | null;
  esperaN: number;
  esperaSinVisita: number;      // OT cerradas con trabajo que no tienen visita vinculada con salida
}

/** Calcula los tres indicadores para las visitas y OT cuya fecha de ingreso cae en [desde, hasta] */
export function indicadoresTaller(visitas: RampaEntrada[], ots: OrdenTrabajo[], desde: string, hasta: string): IndicadoresTaller {
  const enIntervalo = (f: string) => !!f && f >= desde && f <= hasta;

  // Permanencia
  const visitasIntervalo = visitas.filter(e => enIntervalo(diaIngreso(e.fecha_ingreso)));
  const permanencias = visitasIntervalo
    .map(e => ({ e, ini: ingresoVisita(e), fin: salidaVisita(e) }))
    .filter(x => !Number.isNaN(x.ini) && !Number.isNaN(x.fin) && x.fin >= x.ini)
    .map(x => ({ id: String(x.e.id ?? ''), horas: (x.fin - x.ini) / HORA }));
  const permanenciaHoras = media(permanencias.map(p => p.horas));
  const permanenciaEnRampa = visitasIntervalo.filter(e => Number.isNaN(salidaVisita(e))).length;

  // OT cerradas del intervalo
  const cerradasIntervalo = ots.filter(o => cerrada(o) && enIntervalo(fechaOT(o)));
  const conInicio = cerradasIntervalo.filter(o => !!o.fecha_inicio_ot);
  const mttrExcluidas = cerradasIntervalo.length - conInicio.length;
  const trabajo = conInicio
    .map(o => ({ o, horas: tiempoNetoOT(o).neto / HORA }))
    .filter(x => x.horas > 0);
  const mttrHoras = media(trabajo.map(x => x.horas));

  // Espera: permanencia de la visita vinculada − trabajo de la OT
  const salidaPorVisita = new Map<string, number>(permanencias.map(p => [p.id, p.horas]));
  const esperas: number[] = [];
  let esperaSinVisita = 0;
  for (const { o, horas } of trabajo) {
    const perm = salidaPorVisita.get(String(o.id_rampa ?? ''));
    if (perm === undefined) { esperaSinVisita++; continue; }
    esperas.push(Math.max(0, perm - horas));
  }

  return {
    permanenciaHoras,
    permanenciaN: permanencias.length,
    permanenciaEnRampa,
    mttrHoras,
    mttrN: trabajo.length,
    mttrExcluidas,
    esperaHoras: media(esperas),
    esperaN: esperas.length,
    esperaSinVisita,
  };
}

/** Horas con un decimal; null se muestra como guion */
export const horasTxt = (h: number | null) => (h == null ? '—' : `${h.toLocaleString('es-PE', { maximumFractionDigits: 1 })} h`);

/** Costo total de una OT (el servidor ya suma mano de obra, servicios, materiales y repuestos) */
export const costoOT = (o: OrdenTrabajo) => Number(o.costo_total_pen ?? o.costo_total ?? 0) || 0;

/** Suma de costos de las OT cuya fecha de ingreso cae en [desde, hasta]. La usan Ingresos a taller y el dashboard. */
export function sumaCostoEnPeriodo(ots: OrdenTrabajo[], desde: string, hasta: string): number {
  return ots.reduce((s, o) => {
    const f = (o.fecha_ingreso || o.creado_en || o.created_at || '').slice(0, 10);
    return f && f >= desde && f <= hasta ? s + costoOT(o) : s;
  }, 0);
}
