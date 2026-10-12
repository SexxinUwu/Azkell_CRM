// Inspecciones: datos de la versión actual.
//   POST /api/script/obtenerDatosInspecciones           → inspecciones mecánicas (fecha_ingreso en DD/MM/AAAA)
//   GET  /api/neumaticos/inspecciones?limit=1000         → inspecciones de neumáticos (más reciente primero)
//   POST /api/mantenimiento/inspecciones/presign-read    → { urls } → { signed: { url: urlFirmada } }
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

export interface PuntoRevisado { categoria: string; item: string; estado: string; observacion: string; foto: string }

export interface Inspeccion {
  id: string;
  placa: string;
  fecha: Date | null;
  cliente: string;
  tecnico: string;
  km: number | null;
  diasPropuestos: number;
  tipo: string;
  idOt: string;
  firma: string;
  puntos: PuntoRevisado[];
}

export interface InspeccionNeumaticos {
  id: string;
  placa: string;
  fecha: Date | null;
  diasRestantes: number | null;
  fechaProxima: Date | null;
  tecnico: string;
  km: number | null;
  llantasCriticas: number;
}

const txt = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));

/** "12/10/2026" o "2026-10-12…" → fecha local a medianoche */
export function parsearFecha(v: unknown): Date | null {
  const s = txt(v);
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Una foto guardada como solo el dominio ("https://empresa.azkell.com/") no es una foto */
export const esFotoReal = (url: string) => /^https?:\/\/[^/]+\/.+/.test(url) || url.startsWith('data:image');

function puntos(json: unknown): PuntoRevisado[] {
  try {
    const d = typeof json === 'string' ? JSON.parse(json || '[]') : json;
    if (!Array.isArray(d)) return [];
    return d.map(p => ({
      categoria: txt(p.categoria) || 'General', item: txt(p.item), estado: txt(p.estado) || 'SIN DATOS',
      observacion: txt(p.observacion), foto: esFotoReal(txt(p.foto)) ? txt(p.foto) : '',
    }));
  } catch { return []; }
}

export function useInspecciones() {
  return useQuery({
    queryKey: ['inspecciones'],
    queryFn: async () => {
      const r = await api<{ data?: Array<Record<string, unknown>> }>('/script/obtenerDatosInspecciones', { method: 'POST', body: { args: [] } });
      return (r.data ?? []).filter(i => txt(i.estado) !== 'Eliminada').map<Inspeccion>(i => ({
        id: txt(i.id), placa: txt(i.placa).toUpperCase(), fecha: parsearFecha(i.fecha_ingreso), cliente: txt(i.cliente),
        tecnico: txt(i.tecnico), km: num(i.km_tablero), diasPropuestos: Number(i.dias_propuestos) || 30,
        tipo: txt(i.tipo_inspeccion) || 'General', idOt: txt(i.id_ot), firma: txt(i.url_firma), puntos: puntos(i.detalles_json),
      }));
    },
  });
}

export function useInspeccionesNeumaticos() {
  return useQuery({
    queryKey: ['inspecciones', 'neumaticos'],
    queryFn: async () => {
      const r = await api<{ ok?: boolean; data?: Array<Record<string, unknown>> }>('/neumaticos/inspecciones', { query: { limit: 1000 } }).catch(() => ({ data: [] }));
      return (r.data ?? []).map<InspeccionNeumaticos>(n => ({
        id: txt(n.id_inspeccion), placa: txt(n.placa).toUpperCase(), fecha: parsearFecha(n.fecha_inspeccion),
        diasRestantes: num(n.dias_restantes), fechaProxima: parsearFecha(n.fecha_proxima),
        tecnico: txt(n.tecnico) || txt(n.usuario_nombre), km: num(n.km_vehiculo), llantasCriticas: Number(n.llantas_criticas) || 0,
      }));
    },
  });
}

/** Firma las fotos de S3 para poder verlas (las URLs firmadas vencen; se piden al abrir la ficha) */
export function useFotosFirmadas(urls: string[]) {
  const s3 = urls.filter(u => u.startsWith('https://') && u.includes('.s3.'));
  return useQuery({
    queryKey: ['inspecciones', 'fotos', s3],
    enabled: s3.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => (await api<{ signed?: Record<string, string> }>('/mantenimiento/inspecciones/presign-read', { method: 'POST', body: { urls: s3 } })).signed ?? {},
  });
}

/** Clave de placa sin guiones ni espacios (como cleanPlaca de la versión actual) */
export const clavePlaca = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
