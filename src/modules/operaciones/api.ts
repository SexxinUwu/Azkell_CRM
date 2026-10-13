import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

function arr<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { data?: T[] })?.data) ?? [];
}

export interface ViajeCombustible {
  id?: number | string;
  codigo?: string | null;
  placa?: string | null;
  conductor?: string | null;
  fecha_salida?: string | null;
  fecha_retorno?: string | null;
  km_recorridos?: number | string | null;
  combustible_cargado?: number | string | null;
  rendimiento?: number | string | null;
  rendimiento_teorico?: number | string | null;
  diferencia?: number | string | null;
  estado?: string | null;
  [key: string]: unknown;
}

export interface GuiaRemitente {
  id?: number | string;
  serie?: string | null;
  correlativo?: string | number | null;
  fecha_emision?: string | null;
  destinatario_nombre?: string | null;
  descripcion?: string | null;
  peso_bruto?: number | string | null;
  unidad_peso?: string | null;
  estado?: string | null;
  orden_viaje_code?: string | null;
  [key: string]: unknown;
}

export interface GuiaTransportista {
  id?: number | string;
  serie?: string | null;
  correlativo?: string | number | null;
  fecha_emision?: string | null;
  placa?: string | null;
  conductor?: string | null;
  descripcion?: string | null;
  estado?: string | null;
  [key: string]: unknown;
}

export interface KpisGuia {
  total?: number | null;
  emitidas?: number | null;
  pendientes?: number | null;
  anuladas?: number | null;
  [key: string]: unknown;
}

export function useAnalisisCombustible() {
  return useQuery<ViajeCombustible[]>({
    queryKey: ['operaciones', 'analisis-combustible'],
    queryFn: () =>
      api('/combustible/analisis-viajes?modulo=d2').then((r) => arr<ViajeCombustible>(r)),
    staleTime: 60_000,
  });
}

export function useAnalisisUrea() {
  return useQuery<ViajeCombustible[]>({
    queryKey: ['operaciones', 'analisis-urea'],
    queryFn: () =>
      api('/combustible/analisis-viajes?modulo=urea').then((r) => arr<ViajeCombustible>(r)),
    staleTime: 60_000,
  });
}

export function useGuiasRemitente() {
  return useQuery<GuiaRemitente[]>({
    queryKey: ['operaciones', 'guias-remitente'],
    queryFn: () =>
      api('/guia-remitente').then((r) => arr<GuiaRemitente>(r)),
    staleTime: 60_000,
  });
}

export function useGuiasRemitenteKpis() {
  return useQuery<KpisGuia>({
    queryKey: ['operaciones', 'guias-remitente-kpis'],
    queryFn: () =>
      api('/guia-remitente/kpis').then((r) => (r as KpisGuia) ?? {}),
    staleTime: 60_000,
  });
}

export function useGuiasTransportista() {
  return useQuery<GuiaTransportista[]>({
    queryKey: ['operaciones', 'guias-transportista'],
    queryFn: () =>
      api('/guia-transportista').then((r) => arr<GuiaTransportista>(r)),
    staleTime: 60_000,
  });
}

export function useGuiasTransportistaKpis() {
  return useQuery<KpisGuia>({
    queryKey: ['operaciones', 'guias-transportista-kpis'],
    queryFn: () =>
      api('/guia-transportista/kpis').then((r) => (r as KpisGuia) ?? {}),
    staleTime: 60_000,
  });
}

export function estadoGuiaColor(estado: string | null | undefined): string {
  const e = String(estado ?? '').toLowerCase();
  if (e.includes('emit')) return 'green';
  if (e.includes('anul')) return 'red';
  if (e.includes('pend') || e.includes('borrad')) return 'amber';
  return 'neutral';
}

export function fmtNum(v: number | string | null | undefined, dec = 2): string {
  const n = Number(v);
  if (isNaN(n) || v === null || v === undefined || v === '') return '—';
  return n.toLocaleString('es-PE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
