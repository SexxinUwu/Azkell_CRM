// Flota: Disponibilidad, Documentos (vehiculos-flota), Checklist (reportes_fallas), GPS
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// ─── Disponibilidad ──────────────────────────────────────────────────────────
// Endpoint real: GET /api/disponibilidad-flota → bare array

export interface VehiculoDisponibilidad {
  id: number | null;
  placa_camion: string;
  placa_carreta: string;
  conductor_asignado: string;
  estado: string;
  empresa: string;
  cliente: string;
  marca: string;
  capacidad_tanque: string;
  tipo_unidad: string;
  sub_tipo: string;
  sub_tipo_carreta: string;
  empresa_carreta: string;
  marca_carreta: string;
  estado_carreta: string;
  observaciones: string;
  is_motora: boolean;
  [key: string]: unknown;
}

export const ESTADOS_DISP = ['En Base', 'En Ruta', 'En Mantenimiento'] as const;

export function estadoDispColor(estado: string): string {
  const e = (estado || '').toLowerCase();
  if (e.includes('ruta'))         return 'blue';
  if (e.includes('mantenimiento') || e.includes('taller')) return 'amber';
  if (e.includes('base'))         return 'green';
  return 'neutral';
}

export function useDisponibilidad() {
  return useQuery<VehiculoDisponibilidad[]>({
    queryKey: ['flota', 'disponibilidad'],
    queryFn: () =>
      api('/disponibilidad-flota').then((r: unknown) => {
        if (Array.isArray(r)) return r as VehiculoDisponibilidad[];
        return (r as { data?: VehiculoDisponibilidad[] }).data ?? [];
      }),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}

// ─── Documentos de flota ─────────────────────────────────────────────────────
// Endpoint real: GET /api/vehiculos-flota → array de vehículos con vencimientos

export interface VehiculoFlota {
  placa: string;
  tipo: string | null;
  propiedad: string | null;
  empresa: string | null;
  fecha_entrega: string | null;
  anio: string | null;
  marca: string | null;
  modelo: string | null;
  color: string | null;
  chasis: string | null;
  tc_vencimiento: string | null;
  soat_vencimiento: string | null;
  matpel_vencimiento: string | null;
  rt_vencimiento: string | null;
  boni_vencimiento: string | null;
  sv_vencimiento: string | null;
  sc_vencimiento: string | null;
  fum_vencimiento: string | null;
  ext_vencimiento: string | null;
  soat_entidad: string | null;
  [key: string]: unknown;
}

// Documento "expandido" — un registro por tipo de doc por placa
export interface DocumentoFlota {
  id: string;          // `${placa}-${tipo}`
  placa: string;
  tipo_documento: string;
  fecha_vencimiento: string | null;
  archivo_url: string | null;
  entidad: string | null;
}

const TIPOS_DOC: Array<{ key: keyof VehiculoFlota; label: string; urlKey?: keyof VehiculoFlota; entidadKey?: keyof VehiculoFlota }> = [
  { key: 'tc_vencimiento',     label: 'Tarjeta de circulación',    urlKey: 'tc_url' },
  { key: 'soat_vencimiento',   label: 'SOAT',                      urlKey: 'soat_url',   entidadKey: 'soat_entidad' },
  { key: 'matpel_vencimiento', label: 'MATPEL',                    urlKey: 'matpel_url' },
  { key: 'rt_vencimiento',     label: 'Revisión técnica',          urlKey: 'rt_url' },
  { key: 'boni_vencimiento',   label: 'Bonificación',              urlKey: 'boni_url' },
  { key: 'sv_vencimiento',     label: 'Seguro vehicular',          urlKey: 'sv_url',     entidadKey: 'sv_entidad' },
  { key: 'sc_vencimiento',     label: 'SCTR',                      urlKey: 'sc_url',     entidadKey: 'sc_entidad' },
  { key: 'fum_vencimiento',    label: 'FUM / Fumigación',          urlKey: 'fum_url' },
  { key: 'ext_vencimiento',    label: 'Extintor',                  urlKey: 'ext_url' },
];

export function expandirDocumentos(vehiculos: VehiculoFlota[]): DocumentoFlota[] {
  const docs: DocumentoFlota[] = [];
  for (const v of vehiculos) {
    for (const t of TIPOS_DOC) {
      const venc = v[t.key] as string | null;
      if (!venc) continue;
      docs.push({
        id: `${v.placa}-${t.key}`,
        placa: v.placa,
        tipo_documento: t.label,
        fecha_vencimiento: venc,
        archivo_url: t.urlKey ? (v[t.urlKey] as string | null) : null,
        entidad: t.entidadKey ? (v[t.entidadKey] as string | null) : null,
      });
    }
  }
  return docs.sort((a, b) => {
    // Ordenar por vencimiento más próximo primero
    if (!a.fecha_vencimiento) return 1;
    if (!b.fecha_vencimiento) return -1;
    return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento);
  });
}

export function docEstadoColor(doc: DocumentoFlota): string {
  if (!doc.fecha_vencimiento) return 'neutral';
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const venc = new Date(String(doc.fecha_vencimiento).split('T')[0] + 'T00:00:00');
  if (venc < hoy) return 'red';
  const diff = Math.round((venc.getTime() - hoy.getTime()) / 86_400_000);
  if (diff <= 30) return 'amber';
  return 'green';
}

export function docEstadoLabel(doc: DocumentoFlota): string {
  const c = docEstadoColor(doc);
  if (c === 'red') return 'Vencido';
  if (c === 'amber') return 'Por vencer';
  return 'Vigente';
}

export function useVehiculosFlota() {
  return useQuery<VehiculoFlota[]>({
    queryKey: ['flota', 'vehiculos'],
    queryFn: () =>
      api('/vehiculos-flota').then((r: unknown) => {
        if (Array.isArray(r)) return r as VehiculoFlota[];
        return (r as { data?: VehiculoFlota[] }).data ?? [];
      }),
    staleTime: 120_000,
  });
}

// ─── GPS / Wialon ─────────────────────────────────────────────────────────────
// Endpoint real: GET /api/tv/gps-feed → { gps: { kpis, unidades, grupos } }

export interface UnidadGPS {
  id?: number;
  placa: string;
  nombre_wialon?: string;
  km: number;
  lat: number | null;
  lng: number | null;
  velocidad: number;
  curso?: number;
  estado_motor: 'en_marcha' | 'ralenti' | 'detenido' | 'offline' | string;
  empresa?: string;
  tipo_vehiculo?: string;
  marca_modelo?: string;
  grupos?: string[];
  [key: string]: unknown;
}

export interface GPSKpis {
  total: number;
  con_senal: number;
  en_movimiento: number;
  sin_senal: number;
}

export interface GPSData {
  kpis: GPSKpis;
  unidades: UnidadGPS[];
  grupos: string[];
}

export function estadoMotorColor(estado: string): string {
  switch (estado) {
    case 'en_marcha': return 'green';
    case 'ralenti':   return 'amber';
    case 'detenido':  return 'blue';
    default:          return 'neutral';
  }
}

export function estadoMotorLabel(estado: string): string {
  switch (estado) {
    case 'en_marcha': return 'En movimiento';
    case 'ralenti':   return 'Ralentí';
    case 'detenido':  return 'Detenido';
    default:          return 'Sin señal';
  }
}

export function useGPS() {
  return useQuery<GPSData>({
    queryKey: ['flota', 'gps'],
    queryFn: () =>
      api('/tv/gps-feed').then((r: unknown) => {
        const obj = r as { gps?: GPSData };
        return obj.gps ?? { kpis: { total: 0, con_senal: 0, en_movimiento: 0, sin_senal: 0 }, unidades: [], grupos: [] };
      }),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

// ─── Checklist / Reporte de fallas ───────────────────────────────────────────
// Endpoint real: GET /api/mantenimiento/checklist → bare array (no pagination)

export interface ReporteFalla {
  id: number | string;
  folio: string;
  orden_viaje: string | null;
  fecha_reporte: string | null;
  placa_tracto: string | null;
  placa_remolque: string | null;
  km_inicial: number | null;
  km_final: number | null;
  conductor: string | null;
  procedencia: string | null;
  ubicacion_gps: string | null;
  fallas_tracto_json: string | null;
  fallas_remolque_json: string | null;
  fallas_libres_text: string | null;
  estado: string;
  empresa: string | null;
  [key: string]: unknown;
}

export function fallaEstadoColor(f: ReporteFalla): string {
  const e = (f.estado || '').toLowerCase();
  if (e.includes('final'))  return 'green';
  if (e.includes('anula'))  return 'neutral';
  return 'amber';
}

export function useChecklist() {
  return useQuery<ReporteFalla[]>({
    queryKey: ['flota', 'checklist'],
    queryFn: () =>
      api('/mantenimiento/checklist').then((r: unknown) => {
        if (Array.isArray(r)) return r as ReporteFalla[];
        return (r as { data?: ReporteFalla[] }).data ?? [];
      }),
    staleTime: 30_000,
  });
}
