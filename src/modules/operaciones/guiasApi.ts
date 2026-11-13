import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

export type OrigenGuia = 'RECIBIDA' | 'EMITIDA';
export type TipoGuia = 'REMITENTE' | 'TRANSPORTISTA';
export type EstadoGuia = 'REGISTRADA' | 'VINCULADA' | 'ANULADA';

export interface Guia {
  id: number; origen: OrigenGuia; tipo: TipoGuia; serie: string; numero: string; numero_completo: string; emisor_ruc: string;
  fecha_emision: string | null; fecha_traslado: string | null;
  remitente_ruc: string | null; remitente_nombre: string | null; destinatario_doc: string | null; destinatario_nombre: string | null;
  transportista_ruc: string | null; transportista_nombre: string | null; modalidad: string | null; motivo: string | null;
  partida_ubigeo: string | null; partida_direccion: string | null; llegada_ubigeo: string | null; llegada_direccion: string | null;
  peso_kg: number | string; bultos: number | null; descripcion: string | null; items_json: string | null;
  placa: string | null; conductor_nombre: string | null; conductor_doc: string | null; licencia: string | null; trae_transporte: number | boolean;
  orden_servicio_id: number | null; orden_servicio_codigo: string | null; servicio_cliente?: string | null;
  estado: EstadoGuia; fuente: 'XML' | 'IA' | 'MANUAL'; archivo_url: string | null; archivo_nombre: string | null; archivo_ver_url?: string | null;
  observaciones: string | null; usuario: string | null; creado_en: string | null;
}

/** Lo que devuelve el lector del archivo (XML, foto o PDF): se revisa antes de guardar */
export interface LecturaGuia {
  tipo: TipoGuia | null; serie: string | null; numero: string | null; numero_completo: string | null;
  fecha_emision: string | null; fecha_traslado: string | null;
  remitente_ruc: string | null; remitente_nombre: string | null; destinatario_doc: string | null; destinatario_nombre: string | null;
  transportista_ruc: string | null; transportista_nombre: string | null; modalidad: 'PUBLICO' | 'PRIVADO' | null; motivo: string | null;
  partida_ubigeo: string | null; partida_direccion: string | null; llegada_ubigeo: string | null; llegada_direccion: string | null;
  peso_kg: number | null; bultos: number | null; descripcion: string | null; items: { descripcion: string | null; cantidad: number | null; unidad: string | null }[];
  placa: string | null; conductor_nombre: string | null; conductor_doc: string | null; licencia: string | null;
  trae_transporte: boolean; fuente: 'XML' | 'IA'; advertencias: string[];
}

export const ETIQUETA_ESTADO_GUIA: Record<EstadoGuia, string> = { REGISTRADA: 'Registrada', VINCULADA: 'Vinculada', ANULADA: 'Anulada' };
export const TONO_ESTADO_GUIA: Record<EstadoGuia, string> = { REGISTRADA: 'amber', VINCULADA: 'green', ANULADA: 'gray' };
export const ETIQUETA_ORIGEN: Record<OrigenGuia, string> = { RECIBIDA: 'Recibida del cliente', EMITIDA: 'Emitida por nosotros' };
export const ETIQUETA_TIPO: Record<TipoGuia, string> = { REMITENTE: 'Remitente', TRANSPORTISTA: 'Transportista' };

export const kgDe = (v: unknown) => Number(v) || 0;
export const fmtKg = (v: unknown) => `${kgDe(v).toLocaleString('es-PE', { maximumFractionDigits: 2 })} kg`;
export const fechaGuia = (f?: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—');

export function useGuias(filtro?: { viaje?: string; orden?: number }, habilitada = true) {
  return useQuery<Guia[]>({
    queryKey: ['operaciones', 'guias', filtro?.viaje ?? '', filtro?.orden ?? 0],
    enabled: habilitada, staleTime: 15_000,
    queryFn: () => api<{ data?: Guia[] }>('/operaciones/gre/guias', { query: { ...(filtro?.viaje ? { viaje: filtro.viaje } : {}), ...(filtro?.orden ? { orden: filtro.orden } : {}) } }).then(r => r.data ?? []),
  });
}
