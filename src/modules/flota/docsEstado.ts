// Estado de los documentos de cada vehículo. Misma regla que la versión actual (calcularEstado):
// vencido si ya pasó la fecha; crítico hasta 15 días; alerta hasta 30 días; vigente después.
import type { VehiculoFlota } from './api';

export type Clave = 'vigente' | 'alerta' | 'critico' | 'vencido' | 'sin';

export interface EstadoDoc {
  clave: Clave;
  texto: string;
  /** Puntaje de peor a mejor: 0 vencido, 1 crítico, 2 alerta, 3 vigente (el clásico lo usa para los indicadores) */
  score: number;
  color: string;
  dias: number | null;
}

export const COLOR_CLAVE: Record<Clave, string> = {
  vigente: 'var(--green-ink)', alerta: 'var(--amber-ink)', critico: 'var(--amber-ink)', vencido: 'var(--red-ink)', sin: 'var(--label-3)',
};

const SIN_INFO: EstadoDoc = { clave: 'sin', texto: 'Sin información', score: -1, color: COLOR_CLAVE.sin, dias: null };
const PERMANENTE: EstadoDoc = { clave: 'vigente', texto: 'Permanente', score: 3, color: COLOR_CLAVE.vigente, dias: null };

/** Día (AAAA-MM-DD) de una fecha de la base, sin desfase por zona horaria */
function diaDe(fecha: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha).trim());
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function estadoDeFecha(fecha: string | null | undefined): EstadoDoc {
  if (!fecha) return SIN_INFO;
  const venc = diaDe(fecha);
  if (venc == null) return SIN_INFO;
  const h = new Date();
  const hoy = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
  const dias = Math.round((venc - hoy) / 86_400_000);
  if (dias < 0) return { clave: 'vencido', texto: 'Vencido', score: 0, color: COLOR_CLAVE.vencido, dias };
  if (dias <= 15) return { clave: 'critico', texto: dias === 0 ? 'Vence hoy' : 'Crítico', score: 1, color: COLOR_CLAVE.critico, dias };
  if (dias <= 30) return { clave: 'alerta', texto: 'Alerta', score: 2, color: COLOR_CLAVE.alerta, dias };
  return { clave: 'vigente', texto: 'Vigente', score: 3, color: COLOR_CLAVE.vigente, dias };
}

/** Un tipo de documento del vehículo: su vencimiento y los datos que se muestran junto a él */
export interface DocConfig {
  clave: string;
  num: number;
  titulo: string;
  corto: string;
  /** Clave con la que la versión actual guarda el tipo en el historial (tipo_documento) */
  tipoKey: string;
  /** Campo con la fecha de vencimiento */
  vencimiento: keyof VehiculoFlota;
  /** Datos que se muestran en la tarjeta (N° de constancia, entidad, pago, emisión…) */
  datos: Array<{ campo: keyof VehiculoFlota; etiqueta: string }>;
  /** Prefijo del archivo adjunto (campo <prefijo>_url) */
  prefijo: string;
}

export const DOCS: DocConfig[] = [
  { clave: 'tc', num: 1, titulo: 'Tarj. circulación (TUC)', corto: 'TUC', tipoKey: 'TARJETA_PROPIEDAD', vencimiento: 'tc_vencimiento', prefijo: 'tc', datos: [{ campo: 'tc_constancia', etiqueta: 'N°' }] },
  { clave: 'soat', num: 2, titulo: 'SOAT', corto: 'SOAT', tipoKey: 'SOAT', vencimiento: 'soat_vencimiento', prefijo: 'soat', datos: [{ campo: 'soat_entidad', etiqueta: 'Entidad' }, { campo: 'soat_pago', etiqueta: 'Pago' }] },
  { clave: 'rt', num: 3, titulo: 'Revisión técnica (CITV)', corto: 'CITV', tipoKey: 'REV_TECNICA', vencimiento: 'rt_vencimiento', prefijo: 'rt', datos: [{ campo: 'rt_emision', etiqueta: 'Emisión' }] },
  { clave: 'matpel', num: 4, titulo: 'Autorización MATPEL', corto: 'MATPEL', tipoKey: 'MATPEL', vencimiento: 'matpel_vencimiento', prefijo: 'matpel', datos: [{ campo: 'matpel_constancia', etiqueta: 'N°' }] },
  { clave: 'boni', num: 5, titulo: 'Bonificación (MTC)', corto: 'Bonificación', tipoKey: 'BONIFICACION', vencimiento: 'boni_vencimiento', prefijo: 'boni', datos: [{ campo: 'boni_emision', etiqueta: 'Emisión' }] },
  { clave: 'sv', num: 6, titulo: 'Póliza vehicular', corto: 'Póliza vehicular', tipoKey: 'SEG_VEHICULAR', vencimiento: 'sv_vencimiento', prefijo: 'sv', datos: [{ campo: 'sv_entidad', etiqueta: 'Entidad' }] },
  { clave: 'sc', num: 7, titulo: 'Póliza carreta', corto: 'Póliza carreta', tipoKey: 'SEG_CARRETA', vencimiento: 'sc_vencimiento', prefijo: 'sc', datos: [{ campo: 'sc_entidad', etiqueta: 'Entidad' }] },
  { clave: 'fum', num: 8, titulo: 'Cert. fumigación', corto: 'Fumigación', tipoKey: 'FUMIGACION', vencimiento: 'fum_vencimiento', prefijo: 'fum', datos: [{ campo: 'fum_emision', etiqueta: 'Emisión' }] },
  { clave: 'ext', num: 9, titulo: 'Insp. extintores', corto: 'Extintores', tipoKey: 'EXTINTOR', vencimiento: 'ext_vencimiento', prefijo: 'ext', datos: [{ campo: 'ext_emision', etiqueta: 'Emisión' }] },
];

/** Documento personalizado (docs_personalizados): tipo libre, o TIVE, que no vence */
export interface DocPersonalizado {
  id: string;
  tipo: string;
  constancia: string | null;
  emision: string | null;
  vencimiento: string | null;
  pago: string | null;
  url: string | null;
}

/** Igual que la versión actual: sin vencimiento o TIVE = permanente */
export function estadoPersonalizado(d: DocPersonalizado): EstadoDoc {
  if (!d.vencimiento || /TIVE/i.test(d.tipo)) return PERMANENTE;
  return estadoDeFecha(d.vencimiento);
}

const valor = (v: VehiculoFlota, campo: keyof VehiculoFlota) => {
  const x = v[campo];
  const t = x == null ? '' : String(x).trim();
  return t && t !== '---' ? t : '';
};

/** Un documento cuenta como registrado si tiene vencimiento o algún dato cargado */
export function docRegistrado(v: VehiculoFlota, d: DocConfig) {
  return !!valor(v, d.vencimiento) || d.datos.some(x => !!valor(v, x.campo)) || !!valor(v, `${d.prefijo}_url` as keyof VehiculoFlota);
}

export function personalizadosDe(v: VehiculoFlota): DocPersonalizado[] {
  return Array.isArray(v.docs_personalizados) ? (v.docs_personalizados as DocPersonalizado[]) : [];
}

export interface DocVehiculo {
  config: DocConfig;
  registrado: boolean;
  estado: EstadoDoc;
}

export interface PersonalizadoVehiculo {
  doc: DocPersonalizado;
  estado: EstadoDoc;
}

export interface MetaVehiculo {
  docs: DocVehiculo[];
  personalizados: PersonalizadoVehiculo[];
  registrados: number;
  /** Porcentaje de documentos registrados que están vigentes */
  salud: number;
  peor: EstadoDoc;
}

export function metaDeVehiculo(v: VehiculoFlota): MetaVehiculo {
  const docs = DOCS.map(d => ({
    config: d,
    registrado: docRegistrado(v, d),
    estado: docRegistrado(v, d) ? estadoDeFecha(valor(v, d.vencimiento)) : SIN_INFO,
  }));
  const personalizados = personalizadosDe(v).map(doc => ({ doc, estado: estadoPersonalizado(doc) }));
  const estados = [...docs.filter(d => d.registrado).map(d => d.estado), ...personalizados.map(p => p.estado)];
  const vigentes = estados.filter(e => e.score === 3).length;
  let peor: EstadoDoc = SIN_INFO;
  for (const e of estados) {
    if (e.score !== -1 && (peor.score === -1 || e.score < peor.score)) peor = e;
  }
  return {
    docs, personalizados, registrados: estados.length,
    salud: estados.length ? Math.round((vigentes / estados.length) * 100) : 0, peor,
  };
}

/** Grupo del indicador de la página: sin documentos, vencido, alerta o vigente */
export function grupoDe(m: MetaVehiculo): 'sin' | 'vencido' | 'alerta' | 'vigente' {
  if (m.registrados === 0 || m.peor.score === -1) return 'sin';
  if (m.peor.score === 0) return 'vencido';
  if (m.peor.score === 1 || m.peor.score === 2) return 'alerta';
  return 'vigente';
}

export function textoDias(e: EstadoDoc) {
  if (e.dias == null) return e.clave === 'vigente' ? 'Permanente (no vence)' : '—';
  if (e.dias < 0) return `Venció hace ${-e.dias} días`;
  if (e.dias === 0) return 'Vence hoy';
  return `Faltan ${e.dias} días (${e.texto})`;
}

/** Color de cada tipo de documento (el mismo en el expediente, la matriz y el calendario) */
const PALETA_DOC = ['#3b82f6', '#8b5cf6', '#ec4899', '#0ea5e9', '#14b8a6', '#6366f1', '#a855f7', '#06b6d4', '#d946ef'];
export const colorDoc = (num: number) => PALETA_DOC[(num - 1) % PALETA_DOC.length];
/** Documentos personalizados: gris neutro, para distinguirlos de los estándar */
export const COLOR_PERSONALIZADO = '#64748b';
