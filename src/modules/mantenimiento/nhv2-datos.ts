// Modelo de la ficha de un neumático a partir de GET /api/neumaticos/ficha/:codigo.
// El contrato llega tal cual: los decimales de MySQL pueden venir como texto y cualquier campo puede ser null.

export const TIPOS_EVENTO = [
  'APLICACION', 'RETIRO', 'REFORMA', 'MEDICION_PRESION', 'APUNTE_SURCO', 'MARCA_FUEGO', 'COMPRA', 'OTRO',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

type Valor = number | string | null | undefined;

// ---- Contrato (tal como llega) ----
interface LlantaRaw {
  codigo?: string | null; marca?: string | null; modelo?: string | null; medida?: string | null;
  vida?: Valor; estado_ciclo?: string | null; almacen?: string | null;
  placa_actual?: string | null; posicion_actual?: string | null; km_acumulado?: Valor;
  costo_compra?: Valor; costo_reencauches?: Valor; cpk?: Valor; contador_reencauches?: Valor;
}
interface EventoRaw {
  fecha?: string | null; tipo?: string | null; titulo?: string | null; detalle?: string | null;
  placa?: string | null; posicion?: string | null; proveedor?: string | null; km?: Valor; valor?: Valor;
}
export interface FichaRaw {
  ok?: boolean; error?: string;
  llanta?: LlantaRaw | null;
  presion?: { ultima_medicion?: Valor; fecha?: string | null; historial?: unknown[] | null } | null;
  surco?: {
    fecha?: string | null; interno?: Valor; central?: Valor; externo?: Valor;
    desgaste_interno?: Valor; desgaste_central?: Valor; desgaste_externo?: Valor;
  } | null;
  timeline?: EventoRaw[] | null;
}

// ---- Modelo para la pantalla ----
export interface Llanta {
  codigo: string; marca: string | null; modelo: string | null; medida: string | null;
  vida: number | null; estado: string | null; almacen: string | null;
  placaActual: string | null; posicionActual: string | null;
  kmAcumulado: number | null; reencauches: number | null; cpk: number | null;
  costoCompra: number | null; costoReencauches: number | null;
}
export interface FilaSurco { etiqueta: string; valor: number | null; desgaste: number | null }
export interface Evento {
  fecha: string | null; tipo: TipoEvento; titulo: string | null; detalle: string | null;
  placa: string | null; posicion: string | null; proveedor: string | null; km: number | null; valor: number | null;
}
export interface Ficha {
  llanta: Llanta | null;
  presionUltima: number | null; presionFecha: string | null;
  surcoFecha: string | null; surco: FilaSurco[];
  timeline: Evento[];
}

// ---- Normalización ----
/** Número o null; acepta texto de DECIMAL ("15.00") y vacíos */
export function aNumero(v: Valor): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/** Texto recortado o null */
export function aTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function normalizarFicha(r: FichaRaw): Ficha {
  const l = r.llanta;
  const surco = r.surco ?? null;
  const timeline: Evento[] = (r.timeline ?? []).map(e => ({
    fecha: aTexto(e.fecha),
    tipo: (TIPOS_EVENTO as readonly string[]).includes(String(e.tipo)) ? (e.tipo as TipoEvento) : 'OTRO',
    titulo: aTexto(e.titulo), detalle: aTexto(e.detalle),
    placa: aTexto(e.placa), posicion: aTexto(e.posicion), proveedor: aTexto(e.proveedor),
    km: aNumero(e.km), valor: aNumero(e.valor),
  })).sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));

  return {
    llanta: l ? {
      codigo: aTexto(l.codigo) ?? '—',
      marca: aTexto(l.marca), modelo: aTexto(l.modelo), medida: aTexto(l.medida),
      vida: aNumero(l.vida), estado: aTexto(l.estado_ciclo), almacen: aTexto(l.almacen),
      placaActual: aTexto(l.placa_actual), posicionActual: aTexto(l.posicion_actual),
      kmAcumulado: aNumero(l.km_acumulado), reencauches: aNumero(l.contador_reencauches),
      cpk: aNumero(l.cpk), costoCompra: aNumero(l.costo_compra), costoReencauches: aNumero(l.costo_reencauches),
    } : null,
    presionUltima: aNumero(r.presion?.ultima_medicion),
    presionFecha: aTexto(r.presion?.fecha),
    surcoFecha: aTexto(surco?.fecha),
    surco: [
      { etiqueta: 'Surco interno', valor: aNumero(surco?.interno), desgaste: aNumero(surco?.desgaste_interno) },
      { etiqueta: 'Surco central', valor: aNumero(surco?.central), desgaste: aNumero(surco?.desgaste_central) },
      { etiqueta: 'Surco externo', valor: aNumero(surco?.externo), desgaste: aNumero(surco?.desgaste_externo) },
    ],
    timeline,
  };
}

// ---- Formatos (es-PE, como el resto del proyecto) ----
const dos = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cuatro = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const entero = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });

export const fmtDos = (n: number | null): string => (n === null ? '—' : dos.format(n));
export const fmtMm = (n: number | null): string => (n === null ? 'N/A' : `${dos.format(n)} mm`);
export const fmtPsi = (n: number | null): string => (n === null ? '—' : `${dos.format(n)} PSI`);
export const fmtKm = (n: number | null): string => (n === null ? '—' : `${entero.format(n)} km`);
export const fmtSoles = (n: number | null): string => (n === null ? '—' : `S/ ${dos.format(n)}`);
export const fmtCpk = (n: number | null): string => (n === null ? '—' : `S/ ${cuatro.format(n)}`);
export const fmtEntero = (n: number | null): string => (n === null ? '—' : entero.format(n));

export const ETIQUETA_EVENTO: Record<TipoEvento, string> = {
  APLICACION: 'Aplicación',
  RETIRO: 'Retirada',
  REFORMA: 'Reforma',
  MEDICION_PRESION: 'Medición de presión',
  APUNTE_SURCO: 'Apunte de surco',
  MARCA_FUEGO: 'Marca de fuego',
  COMPRA: 'Compra',
  OTRO: 'Otro evento',
};
