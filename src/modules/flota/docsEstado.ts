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
  { clave: 'sv', num: 6, titulo: 'Seguro vehicular', corto: 'Seguro vehicular', tipoKey: 'SEG_VEHICULAR', vencimiento: 'sv_vencimiento', prefijo: 'sv', datos: [{ campo: 'sv_entidad', etiqueta: 'Entidad' }] },
  { clave: 'fum', num: 7, titulo: 'Cert. fumigación', corto: 'Fumigación', tipoKey: 'FUMIGACION', vencimiento: 'fum_vencimiento', prefijo: 'fum', datos: [{ campo: 'fum_emision', etiqueta: 'Emisión' }] },
  { clave: 'ext', num: 8, titulo: 'Insp. extintores', corto: 'Extintores', tipoKey: 'EXTINTOR', vencimiento: 'ext_vencimiento', prefijo: 'ext', datos: [{ campo: 'ext_emision', etiqueta: 'Emisión' }] },
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

/**
 * Unidad motora (tracto o camión): la misma regla que usa Seguridad para contar «unidades motoras».
 * Remolques, semirremolques, carretas, furgones, plataformas, tanques, tolvas y bateas no lo son.
 */
export function esMotora(v: VehiculoFlota): boolean {
  const motora = String(v.motora ?? '').toUpperCase().trim();
  const tipo = String(v.tipo ?? '').toUpperCase().trim();
  if (motora.includes('NO') || motora === '0') return false;
  return !/(SEMIREMOLQUE|SEMIRREMOLQUE|CARRETA|FURGON|PLATAFORMA|TANQUE|TOLVA|BATEA|CAMA)/.test(tipo);
}

/**
 * Reparte porcentajes enteros que suman exactamente 100 (método del mayor resto): 53.8 pasa a 54 y los demás se ajustan
 * para que el total no se pase ni quede corto. Con total 0 devuelve ceros.
 */
export function repartirPorcentajes(valores: number[], total: number): number[] {
  if (total <= 0) return valores.map(() => 0);
  const exactos = valores.map(v => (v / total) * 100);
  const base = exactos.map(Math.floor);
  let faltan = 100 - base.reduce((a, b) => a + b, 0);
  const orden = exactos.map((x, i) => ({ i, resto: x - Math.floor(x) })).sort((a, b) => b.resto - a.resto);
  for (const { i } of orden) { if (faltan <= 0) break; base[i] += 1; faltan -= 1; }
  return base;
}

/** ¿La unidad está alquilada a otra empresa? */
export const esAlquilada = (v: VehiculoFlota) => !!String(v.alquilada_a ?? '').trim();

/** Empresa que se comprometió a actualizar los documentos (solo si el convenio lo dice), o null si los actualizamos nosotros */
export const responsableExterno = (v: VehiculoFlota): string | null =>
  esAlquilada(v) && v.docs_responsable === 'ARRENDATARIA' ? String(v.alquilada_a).trim() : null;

const fechaLarga = (f: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f); return m ? `${m[3]}/${m[2]}/${m[1]}` : f; };

/** Lo que necesita atención en la unidad: documentos vencidos, por vencer o sin registrar (para pedir su actualización) */
export function pendientesDeDocs(v: VehiculoFlota, m: MetaVehiculo): string[] {
  const lineas: string[] = [];
  for (const d of m.docs) {
    const f = String(v[d.config.vencimiento] ?? '').trim();
    if (!d.registrado) lineas.push(`• ${d.config.titulo}: sin registrar`);
    else if (d.estado.clave === 'vencido') lineas.push(`• ${d.config.titulo}: venció el ${fechaLarga(f)}`);
    else if (d.estado.clave === 'critico' || d.estado.clave === 'alerta') lineas.push(`• ${d.config.titulo}: vence el ${fechaLarga(f)}${d.estado.dias != null ? ` (en ${d.estado.dias} días)` : ''}`);
  }
  for (const p of m.personalizados) {
    if (p.estado.clave === 'vencido') lineas.push(`• ${p.doc.tipo}: venció el ${fechaLarga(String(p.doc.vencimiento ?? ''))}`);
    else if (p.estado.clave === 'critico' || p.estado.clave === 'alerta') lineas.push(`• ${p.doc.tipo}: vence el ${fechaLarga(String(p.doc.vencimiento ?? ''))}`);
  }
  return lineas;
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

/** Alerta de una unidad motora que todavía no tiene ningún inventario de vehículos (solo se registra desde su módulo) */
export const SIN_INVENTARIO: EstadoDoc = { clave: 'alerta', texto: 'Sin inventario', score: 2, color: COLOR_CLAVE.alerta, dias: null };

export interface MetaVehiculo {
  /** Unidad motora sin inventario de vehículos: cuenta como alerta */
  sinInventario: boolean;
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
  const registrados = estados.length;
  // El inventario nunca vence, pero una motora que no lo tiene está en alerta. Una unidad sin ningún documento sigue siendo «sin documentos».
  const sinInventario = esMotora(v) && !v.inventario_vehiculos;
  if (sinInventario && estados.length > 0) estados.push(SIN_INVENTARIO);
  const vigentes = estados.filter(e => e.score === 3).length;
  let peor: EstadoDoc = SIN_INFO;
  for (const e of estados) {
    if (e.score !== -1 && (peor.score === -1 || e.score < peor.score)) peor = e;
  }
  return {
    sinInventario, docs, personalizados, registrados,
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

/** Fecha de vencimiento como DD-MM-AAAA (la base la guarda como AAAA-MM-DD o con hora); vacío si no hay fecha */
export function fechaDDMMAAAA(fecha: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
