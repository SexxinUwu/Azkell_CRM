import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// Papeletas (Flota): contrato con routes/papeletas.js. Las papeletas llegan con lo derivado ya calculado (pagado, saldo, descuento vigente, días).

export type EstadoEfectivo = 'PENDIENTE' | 'CON_DESCUENTO' | 'PARCIAL' | 'VENCIDA' | 'EN_DESCARGO' | 'PAGADA' | 'ANULADA';
export type QuienAsume = 'EMPRESA' | 'CONDUCTOR' | 'ALQUILADA' | 'TERCERO';
export type Gravedad = 'LEVE' | 'GRAVE' | 'MUY_GRAVE';

export interface Papeleta {
  id: number;
  codigo: string;
  entidad_codigo: string;
  entidad_nombre: string | null;
  entidad_otra: string | null;
  tipo_documento: string;
  numero: string;
  /** AAAA-MM-DDTHH:mm */
  fecha_infraccion: string;
  departamento: string | null;
  lugar: string | null;
  agente: string | null;
  placa: string;
  empresa_unidad: string | null;
  conductor_nombre: string | null;
  conductor_dni: string | null;
  licencia: string | null;
  infraccion_codigo: string | null;
  infraccion_desc: string | null;
  gravedad: Gravedad | null;
  puntos: number | null;
  medida: string | null;
  moneda: 'PEN' | 'USD';
  monto: number;
  descuento_monto: number;
  recargos: number;
  fecha_limite_descuento: string | null;
  fecha_notificacion: string | null;
  fecha_limite_descargo: string | null;
  fecha_limite_pago: string | null;
  quien_asume: QuienAsume;
  asume_nombre: string | null;
  estado: 'PENDIENTE' | 'EN_DESCARGO' | 'PAGADA' | 'ANULADA';
  descargo_fecha: string | null;
  descargo_expediente: string | null;
  descargo_resultado: 'PENDIENTE' | 'FUNDADO' | 'INFUNDADO' | null;
  anulada_motivo: string | null;
  reembolso_fecha: string | null;
  reembolso_monto: number | null;
  observaciones: string | null;
  creado_por: string | null;
  created_at: string;
  // Derivados por el servidor
  pagado: number;
  n_pagos: number;
  total_sin_descuento: number;
  total_vigente: number;
  saldo: number;
  descuento_vigente: boolean;
  dias_descuento: number | null;
  dias_descargo: number | null;
  dias_pago: number | null;
  vencida: boolean;
  estado_efectivo: EstadoEfectivo;
  tiene_evidencias: boolean;
}

export interface EvidenciaPap { key: string; url: string; orden: number }
export interface PagoPap {
  id: number; fecha: string; monto: number; medio: string | null; nro_operacion: string | null; comprobante: string | null;
  pagado_por: string | null; caja_id: number | null; observacion: string | null; registrado_por: string | null;
}
export interface EventoPap { id: number; accion: string; detalle: string | null; usuario: string | null; created_at: string }
export interface PapeletaDetalle extends Papeleta { evidencias: EvidenciaPap[]; pagos: PagoPap[]; historial: EventoPap[] }

export interface EntidadPap {
  id: number; codigo: string; nombre: string; ambito: string | null;
  dias_descargo: number | null; dias_descuento: number | null; dias_pago: number | null; pct_descuento: number | null; activo: number;
}
export interface InfraccionPap {
  id: number; entidad_codigo: string; codigo: string; descripcion: string; gravedad: Gravedad | null; puntos: number | null;
  multa_uit: number | null; multa_soles: number | null; medida: string | null; activo: number;
}
export interface CatalogosPap { entidades: EntidadPap[]; infracciones: InfraccionPap[]; config: { uit_valor?: string } }

/** Datos que el formulario manda al guardar (el servidor completa y valida) */
export type DatosPapeleta = Record<string, unknown>;

export interface AutocompletarPap {
  ok: boolean;
  unidad: { placa: string; empresa: string | null; marca: string | null; modelo: string | null; tipo: string | null; alquilada_a: string | null } | null;
  conductor: { nombre: string; dni: string | null; licencia: string | null; origen: string } | null;
  quien_asume?: QuienAsume;
  asume_nombre?: string | null;
}

export interface LecturaIA {
  entidad_codigo: string | null; tipo_documento: string | null; numero: string | null; fecha_infraccion: string | null; lugar: string | null; departamento: string | null;
  agente: string | null; placa: string | null; conductor_nombre: string | null; conductor_dni: string | null; licencia: string | null;
  infraccion_codigo: string | null; infraccion_desc: string | null; monto: number | null; moneda: 'PEN' | 'USD'; fecha_notificacion: string | null; observaciones: string | null;
}

const RAIZ = ['flota', 'papeletas'] as const;

export function usePapeletas(activo = true) {
  return useQuery({
    queryKey: [...RAIZ, 'lista'],
    queryFn: () => api<{ hoy: string; data: Papeleta[] }>('/papeletas'),
    staleTime: 30_000,
    enabled: activo,
  });
}

export function useCatalogosPap() {
  return useQuery({
    queryKey: [...RAIZ, 'catalogos'],
    queryFn: () => api<CatalogosPap>('/papeletas/catalogos'),
    staleTime: 60_000,
  });
}

export function useDetallePap(id: number | null) {
  return useQuery({
    queryKey: [...RAIZ, 'detalle', id],
    enabled: id != null,
    gcTime: 0,
    queryFn: () => api<{ data: PapeletaDetalle }>(`/papeletas/${id}`).then(r => r.data),
  });
}

export const RAIZ_PAPELETAS = RAIZ;

// ── Etiquetas ───────────────────────────────────────────────────────────────────────────────────
export const ESTADO_TXT: Record<EstadoEfectivo, string> = {
  PENDIENTE: 'Pendiente', CON_DESCUENTO: 'Con descuento', PARCIAL: 'Pago parcial', VENCIDA: 'Vencida', EN_DESCARGO: 'En descargo', PAGADA: 'Pagada', ANULADA: 'Anulada',
};
export const ESTADO_TONO: Record<EstadoEfectivo, 'red' | 'amber' | 'green' | 'blue' | 'gray'> = {
  PENDIENTE: 'amber', CON_DESCUENTO: 'blue', PARCIAL: 'amber', VENCIDA: 'red', EN_DESCARGO: 'blue', PAGADA: 'green', ANULADA: 'gray',
};
export const TIPO_DOC_TXT: Record<string, string> = {
  PAPELETA: 'Papeleta', ACTA_CONTROL: 'Acta de control', RESOLUCION_MULTA: 'Resolución de multa', FOTOPAPELETA: 'Fotopapeleta', NOTIFICACION: 'Notificación', OTRO: 'Otro documento',
};
export const ASUME_TXT: Record<QuienAsume, string> = { EMPRESA: 'La empresa', CONDUCTOR: 'El conductor', ALQUILADA: 'Empresa que alquila', TERCERO: 'Un tercero' };
export const GRAVEDAD_TXT: Record<Gravedad, string> = { LEVE: 'Leve', GRAVE: 'Grave', MUY_GRAVE: 'Muy grave' };

export const entidadTexto = (p: { entidad_codigo: string; entidad_nombre?: string | null; entidad_otra?: string | null }) =>
  p.entidad_codigo === 'OTRA' ? (p.entidad_otra || 'Otra entidad') : (p.entidad_nombre?.split(' - ')[0] || p.entidad_codigo);

/** AAAA-MM-DD o AAAA-MM-DDTHH:mm → DD/MM/AAAA (y la hora si viene) */
export function fechaTxt(f: string | null | undefined, conHora = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(f ?? ''));
  if (!m) return '—';
  return `${m[3]}/${m[2]}/${m[1]}${conHora && m[4] ? ` ${m[4]}:${m[5]}` : ''}`;
}

/** Frase corta para un plazo: «vence hoy», «en 3 días», «hace 2 días» */
export function plazoTxt(dias: number | null): string {
  if (dias == null) return '';
  if (dias === 0) return 'vence hoy';
  return dias > 0 ? `en ${dias} ${dias === 1 ? 'día' : 'días'}` : `hace ${-dias} ${dias === -1 ? 'día' : 'días'}`;
}

/** La fecha más cercana que importa: fin del descuento (si sigue vigente) o plazo de pago */
export function proximoPlazo(p: Papeleta): { texto: string; dias: number; tipo: 'descuento' | 'pago' } | null {
  if (p.saldo <= 0 || p.estado === 'ANULADA') return null;
  if (p.descuento_vigente && p.dias_descuento != null) return { texto: `Descuento hasta ${fechaTxt(p.fecha_limite_descuento)}`, dias: p.dias_descuento, tipo: 'descuento' };
  if (p.dias_pago != null) return { texto: `Pagar hasta ${fechaTxt(p.fecha_limite_pago)}`, dias: p.dias_pago, tipo: 'pago' };
  return null;
}

// ── Escrituras ─────────────────────────────────────────────────────────────────────────────────
interface Resp { ok: boolean; error?: string; id?: number; codigo?: string; aviso?: string | null; completa?: boolean }
const json = (method: string, body: unknown) => ({ method: method as 'POST', body });

export const crearPapeleta = (d: DatosPapeleta) => api<Resp>('/papeletas', json('POST', d));
export const editarPapeleta = (id: number, d: DatosPapeleta) => api<Resp>(`/papeletas/${id}`, json('PUT', d));
export const eliminarPapeleta = (id: number) => api<Resp>(`/papeletas/${id}`, { method: 'DELETE' });
export const anularPapeleta = (id: number, motivo: string) => api<Resp>(`/papeletas/${id}/anular`, json('POST', { motivo }));
export const reactivarPapeleta = (id: number) => api<Resp>(`/papeletas/${id}/reactivar`, json('POST', {}));
export const registrarDescargo = (id: number, d: { expediente: string; fecha: string; resultado: string; observacion: string }) =>
  api<Resp>(`/papeletas/${id}/descargo`, json('POST', d));
export const registrarReembolso = (id: number, d: { monto: number; fecha: string }) => api<Resp>(`/papeletas/${id}/reembolso`, json('POST', d));

export function subirEvidencias(id: number, archivos: File[]) {
  const f = new FormData();
  archivos.forEach(a => f.append('fotos', a));
  return api<{ ok: boolean; evidencias: EvidenciaPap[] }>(`/papeletas/${id}/evidencias`, { method: 'POST', body: f });
}
export const quitarEvidencia = (id: number, key: string) => api<{ ok: boolean; evidencias: EvidenciaPap[] }>(`/papeletas/${id}/evidencias`, { method: 'DELETE', body: { key } });

export function registrarPago(id: number, d: { fecha: string; monto: number; medio: string; nro_operacion: string; pagado_por: string; observacion: string; generar_egreso: boolean }, comprobante: File | null) {
  const f = new FormData();
  Object.entries(d).forEach(([k, v]) => f.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)));
  if (comprobante) f.append('comprobante', comprobante);
  return api<Resp>(`/papeletas/${id}/pagos`, { method: 'POST', body: f });
}
export const quitarPago = (id: number, pagoId: number) => api<Resp>(`/papeletas/${id}/pagos/${pagoId}`, { method: 'DELETE' });

export const autocompletarPapeleta = (placa: string, fecha: string) =>
  api<AutocompletarPap>('/papeletas/autocompletar', { query: { placa, fecha } });

export function leerFotoPapeleta(foto: File) {
  const f = new FormData();
  f.append('foto', foto);
  return api<{ ok: boolean; datos: LecturaIA }>('/papeletas/leer-foto', { method: 'POST', body: f });
}

/** Nombre de una persona por su DNI (RENIEC): primero los conductores propios, luego la consulta pública */
export async function consultarDni(dni: string): Promise<{ nombre: string; licencia: string | null } | null> {
  const propio = await api<{ encontrado: boolean; conductor: { nombre: string; licencia: string | null } | null }>('/papeletas/conductor', { query: { dni } }).catch(() => null);
  if (propio?.encontrado && propio.conductor) return { nombre: propio.conductor.nombre, licencia: propio.conductor.licencia };
  const r = await api<{ nombre?: string }>('/proxy/documento', { query: { numero: dni, tipo: 'DNI' } }).catch(() => null);
  return r?.nombre ? { nombre: r.nombre, licencia: null } : null;
}

// Catálogos
export const guardarEntidad = (id: number | null, d: Partial<EntidadPap>) =>
  id == null ? api<Resp>('/papeletas/entidades', json('POST', d)) : api<Resp>(`/papeletas/entidades/${id}`, json('PUT', d));
export const borrarEntidad = (id: number) => api<Resp>(`/papeletas/entidades/${id}`, { method: 'DELETE' });
export const guardarInfraccion = (id: number | null, d: Partial<InfraccionPap>) =>
  id == null ? api<Resp>('/papeletas/infracciones', json('POST', d)) : api<Resp>(`/papeletas/infracciones/${id}`, json('PUT', d));
export const borrarInfraccion = (id: number) => api<Resp>(`/papeletas/infracciones/${id}`, { method: 'DELETE' });
export const guardarUit = (uit_valor: number) => api<Resp>('/papeletas/config', json('PUT', { uit_valor }));
export const importarInfracciones = (filas: unknown[]) => api<{ ok: boolean; nuevas: number; actualizadas: number; errores: Array<{ fila: number; error: string }> }>('/papeletas/infracciones/importar-masivo', json('POST', { filas }));
export const importarPapeletas = (filas: unknown[]) => api<{ ok: boolean; insertadas: number; repetidas: number; errores: Array<{ fila: number; error: string }> }>('/papeletas/importar-masivo', json('POST', { filas }));
