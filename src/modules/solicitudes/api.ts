import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

export interface CampoSolicitud {
  key: string;
  label: string;
  tipo: 'texto' | 'select' | 'area' | 'banco' | 'documento';
  /** Con RUC o DNI completo, el formulario trae solos la razón social, la dirección y el nombre */
  autoconsulta?: boolean;
  /** Tarjeta del formulario donde se muestra el campo */
  grupo?: string;
  requerido?: boolean;
  opciones?: string[];
  defecto?: string;
  ayuda?: string;
  ancho?: boolean;
}

export interface TipoSolicitud {
  tipo: string;
  etiqueta: string;
  descripcion: string;
  icono: string;
  campos: CampoSolicitud[];
  puede_aprobar: boolean;
}

export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA';

export interface Solicitud {
  id: number;
  codigo: string;
  tipo: string;
  tipo_etiqueta: string;
  estado: EstadoSolicitud;
  titulo: string;
  motivo: string | null;
  solicitante: string;
  revisado_por: string | null;
  revisado_en: string | null;
  comentario_revision: string | null;
  created_at: string | null;
  puede_aprobar: boolean;
  es_mia: boolean;
}

export interface DetalleSolicitud extends Solicitud {
  datos: Record<string, string>;
  resultado: { entidad?: string; id?: string | number; ver?: string } | null;
  historial: Array<{ accion: string; usuario: string; comentario: string | null; created_at: string | null }>;
  campos: CampoSolicitud[];
}

export type VistaSolicitudes = 'mias' | 'gerencia';

const CLAVE = ['solicitudes'];

export function useTiposSolicitud() {
  return useQuery({
    queryKey: [...CLAVE, 'tipos'],
    queryFn: () => api<{ data: TipoSolicitud[]; puede_aprobar_alguno: boolean; puede_ver_todas: boolean }>('/solicitudes/tipos'),
    staleTime: 5 * 60_000,
  });
}

export function useSolicitudes(vista: VistaSolicitudes) {
  return useQuery({
    queryKey: [...CLAVE, 'lista', vista],
    queryFn: () => api<{ data: Solicitud[] }>('/solicitudes', { query: { vista } }).then(r => r.data ?? []),
    staleTime: 15_000,
    refetchOnMount: 'always',
  });
}

export function useDetalleSolicitud(id: number | null) {
  return useQuery({
    queryKey: [...CLAVE, 'detalle', id],
    enabled: id != null,
    queryFn: () => api<{ data: DetalleSolicitud }>(`/solicitudes/${id}`).then(r => r.data),
    refetchOnMount: 'always',
  });
}

export const claveSolicitudes = CLAVE;

export const crearSolicitud = (cuerpo: { tipo: string; datos: Record<string, string>; motivo?: string }) =>
  api<{ ok: boolean; codigo: string; id: number }>('/solicitudes', { method: 'POST', body: cuerpo });

export const aprobarSolicitud = (id: number, comentario?: string) =>
  api<{ ok: boolean; resultado?: DetalleSolicitud['resultado'] }>(`/solicitudes/${id}/aprobar`, { method: 'POST', body: { comentario } });

export const rechazarSolicitud = (id: number, comentario: string) =>
  api<{ ok: boolean }>(`/solicitudes/${id}/rechazar`, { method: 'POST', body: { comentario } });

export const cancelarSolicitud = (id: number) =>
  api<{ ok: boolean }>(`/solicitudes/${id}/cancelar`, { method: 'POST' });
