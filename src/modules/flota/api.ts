// Flota: Disponibilidad, Documentos (vehiculos-flota), Checklist (reportes_fallas), GPS
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import { DOCS } from './docsEstado';
import type { ConfigSistemas } from './fman';

// ─── Disponibilidad ──────────────────────────────────────────────────────────
// Endpoint real: GET /api/disponibilidad-flota → bare array

export interface VehiculoDisponibilidad {
  id: number | null;
  /** Motivo explícito cuando la unidad está bloqueada por un viaje abierto (sin retorno) */
  aviso_viaje?: string;
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
  // Misma regla que la versión actual: mantenimiento o taller primero; ruta o viaje después
  if (e.includes('mant') || e.includes('taller')) return 'amber';
  if (e.includes('ruta') || e.includes('viaje'))  return 'blue';
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

// ─── Escritura de documentos ─────────────────────────────────────────────────
// POST /api/vehiculos-flota es un UPSERT de la fila completa: omitir un campo lo borra.
// Por eso se parte siempre del registro completo del vehículo y solo se cambian los campos del documento.

export type CampoDoc = { campo: string; label: string; tipo: 'date' | 'text' | 'number' };

/** Campos propios de cada documento (el prefijo es el de las columnas: soat_vencimiento → "soat") */
export const CAMPOS_DOC: Record<string, { label: string; campos: CampoDoc[] }> = {
  tc:     { label: 'Tarjeta de circulación', campos: [{ campo: 'tc_constancia', label: 'N° de constancia', tipo: 'text' }, { campo: 'tc_vencimiento', label: 'Vencimiento', tipo: 'date' }] },
  soat:   { label: 'SOAT', campos: [{ campo: 'soat_entidad', label: 'Aseguradora', tipo: 'text' }, { campo: 'soat_pago', label: 'Pago', tipo: 'text' }, { campo: 'soat_vencimiento', label: 'Vencimiento', tipo: 'date' }] },
  matpel: { label: 'MATPEL', campos: [{ campo: 'matpel_constancia', label: 'N° de constancia', tipo: 'text' }, { campo: 'matpel_vencimiento', label: 'Vencimiento', tipo: 'date' }] },
  rt:     { label: 'Revisión técnica', campos: [{ campo: 'rt_emision', label: 'Emisión', tipo: 'date' }, { campo: 'rt_vencimiento', label: 'Vencimiento', tipo: 'date' }] },
  boni:   { label: 'Bonificación', campos: [{ campo: 'boni_emision', label: 'Emisión', tipo: 'date' }, { campo: 'boni_vencimiento', label: 'Vencimiento', tipo: 'date' }] },
  sv:     { label: 'Seguro vehicular', campos: [{ campo: 'sv_entidad', label: 'Aseguradora', tipo: 'text' }, { campo: 'sv_asesor', label: 'Asesor', tipo: 'text' }, { campo: 'sv_vencimiento', label: 'Vencimiento', tipo: 'date' }] },
  sc:     { label: 'SCTR', campos: [{ campo: 'sc_entidad', label: 'Aseguradora', tipo: 'text' }, { campo: 'sc_asesor', label: 'Asesor', tipo: 'text' }, { campo: 'sc_vencimiento', label: 'Vencimiento', tipo: 'date' }] },
  fum:    { label: 'FUM / Fumigación', campos: [{ campo: 'fum_emision', label: 'Emisión', tipo: 'date' }, { campo: 'fum_vencimiento', label: 'Vencimiento', tipo: 'date' }] },
  ext:    { label: 'Extintor', campos: [{ campo: 'ext_emision', label: 'Emisión', tipo: 'date' }, { campo: 'ext_vencimiento', label: 'Vencimiento', tipo: 'date' }, { campo: 'ext_cantidad', label: 'Cantidad', tipo: 'number' }] },
};

/** Sube el archivo a S3 con una URL firmada y devuelve la URL final para guardarla en el documento */
export async function subirArchivoDocumento(file: File): Promise<string> {
  const r = await api<{ uploadUrl: string; fileUrl: string }>(
    `/documentos-flota/upload-url?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type || 'application/pdf')}`);
  const put = await fetch(r.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/pdf' } });
  if (!put.ok) throw new Error('No se pudo subir el archivo. Intenta de nuevo.');
  return r.fileUrl;
}

/** URL temporal para ver un archivo guardado en S3 (el bucket es privado) */
export async function urlTemporalDocumento(url: string): Promise<string> {
  const r = await api<Record<string, string>>('/documentos-flota/presign-read', { method: 'POST', body: { urls: [url] } });
  return r[url] || url;
}

/** Registro del historial de documentos (tabla documentos_flota) */
export interface RegistroHistorial {
  id: string;
  placa: string;
  tipo_documento: string;
  entidad: string | null;
  nro_constancia: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  pago: string | null;
  asesor?: string | null;
  observaciones: string | null;
  usuario: string | null;
}

/** Guarda una fila del historial. Usa la misma clave de tipo que la versión actual (tipo_documento). */
async function registrarHistorial(fila: Omit<RegistroHistorial, 'id'>) {
  await api('/documentos-flota/guardar-historial', { method: 'POST', body: fila });
}

/** Carga o renueva un documento estándar: actualiza la unidad y deja una fila en el historial */
export async function guardarDocumentoVehiculo(opts: {
  vehiculo: Partial<VehiculoFlota> & { placa: string };
  prefijo: string;
  valores: Record<string, string>;
  archivoUrl: string | null;
  costo: string;
  usuario: string;
}) {
  const { vehiculo, prefijo, valores, archivoUrl, costo, usuario } = opts;
  const cuerpo: Record<string, unknown> = { ...vehiculo, ...valores };
  if (archivoUrl) cuerpo[`${prefijo}_url`] = archivoUrl;
  await api('/vehiculos-flota', { method: 'POST', body: cuerpo });

  // Historial (no bloquea el guardado si falla). El archivo va en observaciones, como en la versión actual.
  const tipoKey = DOCS.find(d => d.prefijo === prefijo)?.tipoKey ?? prefijo;
  try {
    await registrarHistorial({
      placa: vehiculo.placa, tipo_documento: tipoKey,
      entidad: valores[`${prefijo}_entidad`] || null, nro_constancia: valores[`${prefijo}_constancia`] || null,
      fecha_emision: valores[`${prefijo}_emision`] || null, fecha_vencimiento: valores[`${prefijo}_vencimiento`] || null,
      pago: valores[`${prefijo}_pago`] || costo || null, asesor: valores[`${prefijo}_asesor`] || null,
      observaciones: archivoUrl ?? (String(vehiculo[`${prefijo}_url`] ?? '').trim() || null), usuario,
    });
  } catch { /* el historial es complementario */ }
}

/** Carga o renueva un documento personalizado (tipo libre o TIVE): solo vive en el historial */
export async function guardarDocumentoPersonalizado(opts: {
  placa: string; tipo: string; constancia: string; emision: string; vencimiento: string; costo: string;
  archivoUrl: string | null; usuario: string;
}) {
  const { placa, tipo, constancia, emision, vencimiento, costo, archivoUrl, usuario } = opts;
  await registrarHistorial({
    placa, tipo_documento: tipo.trim(), entidad: null, nro_constancia: constancia || null,
    fecha_emision: emision || null, fecha_vencimiento: vencimiento || null, pago: costo || null,
    observaciones: archivoUrl, usuario,
  });
}

/** Limpia el documento de la unidad (o el personalizado) y borra su archivo de S3 */
export async function eliminarDocumento(opts: { placa: string; tipoKey: string; urlS3: string | null }) {
  await api('/documentos-flota/eliminar-documento', {
    method: 'POST', body: { placa: opts.placa, tipoDocKey: opts.tipoKey, urlS3: opts.urlS3 ?? '' },
  });
}

/** Historial de una unidad (todas sus filas de documentos_flota) */
export function useHistorialDocumentos(placa: string, enabled: boolean) {
  return useQuery<RegistroHistorial[]>({
    queryKey: ['flota', 'historial-docs', placa],
    enabled: enabled && !!placa,
    queryFn: () =>
      api<{ historial?: RegistroHistorial[] }>(`/documentos-flota/historial/${encodeURIComponent(placa)}`).then(r => r.historial ?? []),
  });
}

/**
 * Comparte el archivo por WhatsApp como en la versión actual: adjunto si el navegador puede compartir archivos
 * (celular); si no, abre WhatsApp con el enlace temporal del documento.
 */
export async function compartirDocumento(url: string, titulo: string, placa: string) {
  const enlace = await urlTemporalDocumento(url);
  const ext = (url.split('?')[0].split('.').pop() || 'pdf').toLowerCase();
  const mime = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : /^jpe?g$/.test(ext) ? 'image/jpeg' : 'application/octet-stream';
  const nombre = `${placa} - ${titulo}.${ext}`;
  try {
    const blob = await (await fetch(enlace)).blob();
    const archivo = new File([blob], nombre, { type: mime });
    if (navigator.canShare?.({ files: [archivo] })) {
      await navigator.share({ files: [archivo], title: nombre, text: `📄 Documento: *${titulo}*\n🚗 Placa: *${placa}*` });
      return;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    // Sin archivo adjunto: se usa el enlace de abajo
  }
  const texto = `📄 *DOCUMENTO DE FLOTA*\n🚗 *Placa:* ${placa}\n📑 *Documento:* ${titulo}\n🔗 *Ver/Descargar archivo:* ${enlace}`;
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer');
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
    staleTime: 3_000,
    // Mientras dura la despedida al cerrar sesión, no se refresca (la animación tiene prioridad)
    refetchInterval: () => (document.documentElement.classList.contains('despidiendo') ? false : 4_000),
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

// ─── Ubicación GPS de cada unidad (Wialon) ────────────────────────────────────
// Misma fuente que la versión actual (POST /api/script/obtenerDatosWialon), cruzada por placa sin guiones.

export interface UbicacionGps { ubicacion: string; lat: number; lng: number; velocidad: number }

export function useUbicacionesGps() {
  return useQuery({
    queryKey: ['flota', 'ubicaciones-gps'],
    queryFn: async () => {
      const r = await api<unknown>('/script/obtenerDatosWialon', { method: 'POST', body: { args: [] } });
      const obj = r as { data?: unknown } | null;
      const anidado = (obj?.data as { data?: unknown } | undefined)?.data;
      const lista = (Array.isArray(obj) ? obj : Array.isArray(obj?.data) ? obj?.data : Array.isArray(anidado) ? anidado : []) as Array<Record<string, unknown>>;
      const mapa = new Map<string, UbicacionGps>();
      for (const g of lista) {
        const placa = String(g.placa ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const lat = Number(g.lat);
        const lng = Number(g.lng);
        const velocidad = Number(g.velocidad ?? (g.pos as { s?: unknown } | undefined)?.s ?? 0) || 0;
        if (placa && lat && lng) mapa.set(placa, { ubicacion: String(g.ubicacion ?? ''), lat, lng, velocidad });
      }
      return mapa;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

// ─── Unidades en el mapa (misma fuente que la versión actual: obtenerDatosWialon) ─────────

export interface UnidadMapa {
  id: number | null;
  placa: string;
  nombre: string;
  empresa: string;
  tipo: string;
  marcaModelo: string;
  km: number;
  horas: number;
  lat: number | null;
  lng: number | null;
  velocidad: number;
  rumbo: number;
  altitud: number | null;
  satelites: number | null;
  voltaje: string;
  ignicion: boolean;
  ubicacion: string;
}

/** movimiento: más de 3 km/h · ralenti: encendida y casi quieta · detenido: apagada · sin_senal: sin posición */
export type EstadoUnidad = 'movimiento' | 'ralenti' | 'detenido' | 'sin_senal';

export function estadoUnidad(u: UnidadMapa): EstadoUnidad {
  if (u.lat == null || u.lng == null) return 'sin_senal';
  if (u.velocidad > 3) return 'movimiento';
  return u.ignicion ? 'ralenti' : 'detenido';
}

const numero = (v: unknown, defecto = 0) => {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) ? defecto : n;
};

export function useUnidadesGps() {
  return useQuery({
    queryKey: ['flota', 'gps-unidades'],
    queryFn: async (): Promise<UnidadMapa[]> => {
      const r = await api<unknown>('/script/obtenerDatosWialon', { method: 'POST', body: { args: [] } });
      const obj = r as { data?: unknown } | null;
      const anidado = (obj?.data as { data?: unknown } | undefined)?.data;
      const lista = (Array.isArray(obj) ? obj : Array.isArray(obj?.data) ? obj?.data : Array.isArray(anidado) ? anidado : []) as Array<Record<string, unknown>>;
      return lista
        .map((g): UnidadMapa => {
          const lat = numero(g.lat, 0);
          const lng = numero(g.lng, 0);
          const conPosicion = lat !== 0 && lng !== 0;
          return {
            id: g.id == null ? null : numero(g.id),
            placa: String(g.placa ?? '').trim().toUpperCase(),
            nombre: String(g.nombre_wialon ?? ''),
            empresa: String(g.empresa ?? ''),
            tipo: String(g.tipo_vehiculo ?? ''),
            marcaModelo: String(g.marca_modelo ?? ''),
            km: numero(g.km),
            horas: numero(g.horas),
            lat: conPosicion ? lat : null,
            lng: conPosicion ? lng : null,
            velocidad: numero(g.velocidad),
            rumbo: numero(g.curso),
            altitud: g.altitud == null ? null : numero(g.altitud),
            satelites: g.satelites == null ? null : numero(g.satelites),
            voltaje: g.voltaje == null ? '' : String(g.voltaje),
            ignicion: g.ignicion === true || Number(g.ignicion) === 1,
            ubicacion: String(g.ubicacion ?? ''),
          };
        })
        .filter(u => u.placa);
    },
    refetchInterval: 4000,
    staleTime: 3000,
  });
}

/** Sistemas de revisión del checklist (tracto y carreta), como se configuran en la versión actual */
export function useConfigSistemas(enabled = true) {
  return useQuery<ConfigSistemas>({
    queryKey: ['flota', 'config-sistemas'],
    enabled,
    queryFn: () => api<ConfigSistemas>('/mantenimiento/checklist/config-sistemas'),
    staleTime: 10 * 60_000,
  });
}
