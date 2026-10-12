// Vigencia del ciclo de inspección de una unidad. Misma regla que evaluarCicloUnidad
// (modulos/mantenimiento/inspecciones/logica.js):
//   - Mecánica: vigente si no pasaron los días propuestos (30 por defecto) desde la última inspección.
//   - Neumáticos: días restantes que trae la inspección (o hasta su fecha próxima).
//   - Días del ciclo: el menor si ambas vigentes; el de la vigente si solo una; el mayor si ambas vencidas.
//   - Estado: < 0 no vigente · 0 a 7 próximo a vencer · > 7 vigente · sin inspecciones: sin registro.
import type { Inspeccion, InspeccionNeumaticos } from './api';

export type Cobertura = 'ambas' | 'solo-mecanica' | 'solo-neumaticos' | 'vencida' | 'sin-registro';
export type Estado = 'vigente' | 'proximo' | 'vencido' | 'sin-registro';

export interface Ciclo {
  mecanica: Inspeccion | null;
  neumaticos: InspeccionNeumaticos | null;
  diasMecanica: number | null;
  diasNeumaticos: number | null;
  mecanicaVigente: boolean;
  neumaticosVigente: boolean;
  cobertura: Cobertura;
  dias: number | null;
  estado: Estado;
  texto: string;
  ultimaActividad: Date | null;
}

const DIA = 86_400_000;
const hoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export function evaluarCiclo(mec: Inspeccion | null, neu: InspeccionNeumaticos | null, ahora = hoy()): Ciclo {
  let diasMec: number | null = null;
  if (mec?.fecha) {
    const prox = new Date(mec.fecha.getTime() + mec.diasPropuestos * DIA);
    diasMec = Math.ceil((prox.getTime() - ahora.getTime()) / DIA);
  }
  let diasNeu: number | null = null;
  if (neu) {
    if (neu.diasRestantes !== null) diasNeu = neu.diasRestantes;
    else if (neu.fechaProxima) diasNeu = Math.ceil((neu.fechaProxima.getTime() - ahora.getTime()) / DIA);
  }
  const vMec = diasMec !== null && diasMec >= 0;
  const vNeu = diasNeu !== null && diasNeu >= 0;
  const tMec = !!mec, tNeu = !!neu;

  let cobertura: Cobertura = 'sin-registro';
  let dias: number | null = null;
  if (tMec && tNeu) {
    if (vMec && vNeu) { cobertura = 'ambas'; dias = Math.min(diasMec!, diasNeu!); }
    else if (vNeu) { cobertura = 'solo-neumaticos'; dias = diasNeu; }
    else if (vMec) { cobertura = 'solo-mecanica'; dias = diasMec; }
    else { cobertura = 'vencida'; dias = Math.max(diasMec ?? -9999, diasNeu ?? -9999); }
  } else if (tMec) {
    cobertura = vMec ? 'solo-mecanica' : 'vencida'; dias = diasMec;
  } else if (tNeu) {
    cobertura = vNeu ? 'solo-neumaticos' : 'vencida'; dias = diasNeu;
  }
  if (dias === -9999) dias = null;

  let estado: Estado = 'sin-registro';
  let texto = 'Sin registro';
  if (dias !== null) {
    if (dias < 0) { estado = 'vencido'; texto = Math.abs(dias) === 1 ? 'Vencida hace 1 día' : `Vencida hace ${Math.abs(dias)} días`; }
    else if (dias <= 7) { estado = 'proximo'; texto = dias === 0 ? 'Vence hoy' : dias === 1 ? 'Falta 1 día' : `Faltan ${dias} días`; }
    else { estado = 'vigente'; texto = `Faltan ${dias} días`; }
  }

  const fechas = [mec?.fecha, neu?.fecha].filter((f): f is Date => !!f);
  return {
    mecanica: mec, neumaticos: neu, diasMecanica: diasMec, diasNeumaticos: diasNeu,
    mecanicaVigente: vMec, neumaticosVigente: vNeu, cobertura, dias, estado, texto,
    ultimaActividad: fechas.length ? new Date(Math.max(...fechas.map(f => f.getTime()))) : null,
  };
}

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  vigente: 'Vigente', proximo: 'Próximo a vencer', vencido: 'No vigente', 'sin-registro': 'Sin registro',
};

/** Orden por urgencia: no vigentes primero (los más vencidos arriba), luego próximos, sin registro al final */
export function urgencia(c: Ciclo) {
  if (c.estado === 'sin-registro') return 1e6;
  return c.dias ?? 1e6;
}
