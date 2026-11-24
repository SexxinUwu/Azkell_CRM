import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// Control de siniestros, daños e incidencias de flota (Mantenimiento › Otros).

export const ESTADOS_SINIESTRO = ['Concluido', 'En Reparación', 'Pendiente Repuestos'] as const;
export type EstadoSiniestro = (typeof ESTADOS_SINIESTRO)[number];

export interface Siniestro {
  id: number; codigo: string; fecha: string; placa: string; marca: string | null; conductor: string | null; ubicacion: string | null;
  tipo_incidencia: string; detalle: string | null; tecnico: string | null; inicio: string | null; fin: string | null;
  horas_taller: number | string; costo_repuestos: number | string; costo_mano_obra: number | string; costo_total: number | string; estado: string;
  /** Cantidad de fotos de los daños */
  n_fotos?: number;
}

/** Evidencia de un siniestro: foto, video o PDF */
export interface FotoSiniestro { id: number; url: string; nombre: string | null; subido_por: string | null; creado_en: string; tipo: 'foto' | 'video' | 'pdf' }

export interface FiltroSiniestros { desde: string; hasta: string; placa?: string; tipo?: string; estado?: string; q?: string }

export interface CatalogoSiniestros {
  placas: { placa: string; marca: string | null; tipo: string }[];
  /** Personal de la empresa: de aquí salen el conductor y el técnico */
  personal: { nombre: string; cargo: string }[];
  /** Nombres ya usados en siniestros que no están en el personal (por ejemplo, los que vinieron de un Excel) */
  usados: string[]; estados: string[]; tipos: string[];
}

export interface ResumenSiniestros {
  totales: { siniestros: number; costo_total: number; repuestos: number; mano_obra: number; horas: number; unidades: number };
  por_tipo: { nombre: string; cantidad: number; costo: number; horas: number }[];
  por_conductor: { nombre: string; cantidad: number; costo: number }[];
  por_mes: { mes: string; cantidad: number; costo: number; repuestos: number; mano_obra: number; horas: number }[];
  por_placa: { nombre: string; marca: string | null; cantidad: number; costo: number; horas: number }[];
  por_tecnico: { nombre: string; cantidad: number; horas: number; costo: number }[];
  por_estado: { nombre: string; cantidad: number; costo: number }[];
}

const consulta = (f: FiltroSiniestros) => ({
  ...(f.desde ? { desde: f.desde } : {}), ...(f.hasta ? { hasta: f.hasta } : {}),
  ...(f.placa ? { placa: f.placa } : {}), ...(f.tipo ? { tipo: f.tipo } : {}), ...(f.estado ? { estado: f.estado } : {}), ...(f.q ? { q: f.q } : {}),
});

export function useSiniestros(f: FiltroSiniestros) {
  return useQuery<Siniestro[]>({
    queryKey: ['mant', 'siniestros', 'lista', f], staleTime: 15_000,
    queryFn: () => api<{ data?: Siniestro[] }>('/mantenimiento/siniestros', { query: consulta(f) }).then(r => r.data ?? []),
  });
}

export function useCatalogoSiniestros(habilitado = true) {
  return useQuery<CatalogoSiniestros>({
    queryKey: ['mant', 'siniestros', 'catalogo'], enabled: habilitado, staleTime: 60_000,
    queryFn: () => api<CatalogoSiniestros & { ok?: boolean }>('/mantenimiento/siniestros/catalogo'),
  });
}

export function useResumenSiniestros(f: Pick<FiltroSiniestros, 'desde' | 'hasta'>) {
  return useQuery<ResumenSiniestros>({
    queryKey: ['mant', 'siniestros', 'resumen', f], staleTime: 30_000,
    queryFn: () => api<ResumenSiniestros & { ok?: boolean }>('/mantenimiento/siniestros/resumen', { query: consulta({ ...f }) }),
  });
}

export type DatosSiniestro = Omit<Siniestro, 'id' | 'codigo' | 'horas_taller' | 'costo_total'>;

export const guardarSiniestro = (id: number | null, datos: Record<string, unknown>) =>
  api<{ ok?: boolean; error?: string; message?: string; codigo?: string }>(id ? `/mantenimiento/siniestros/${id}` : '/mantenimiento/siniestros', { method: id ? 'PUT' : 'POST', body: datos });

export function useFotosSiniestro(id: number | null) {
  return useQuery<FotoSiniestro[]>({
    queryKey: ['mant', 'siniestros', 'fotos', id], enabled: !!id, staleTime: 20_000,
    queryFn: () => api<{ data?: FotoSiniestro[] }>(`/mantenimiento/siniestros/${id}/fotos`).then(r => r.data ?? []),
  });
}

/**
 * Sube las evidencias (fotos, videos y PDF) de a una por solicitud: un video grande no frena a las demás y se ve el avance.
 * Devuelve los nombres de las que fallaron.
 */
export async function subirAdjuntosSiniestro(id: number, archivos: File[], alAvance?: (hechos: number, total: number) => void) {
  const fallidos: string[] = [];
  for (let i = 0; i < archivos.length; i++) {
    try {
      const f = new FormData();
      f.append('fotos', archivos[i]);
      const r = await api<{ ok?: boolean; error?: string }>(`/mantenimiento/siniestros/${id}/fotos`, { method: 'POST', body: f });
      if (r.ok === false) fallidos.push(archivos[i].name);
    } catch {
      fallidos.push(archivos[i].name);
    }
    alAvance?.(i + 1, archivos.length);
  }
  return { fallidos };
}

export const quitarFotoSiniestro = (id: number, fotoId: number) =>
  api<{ ok?: boolean; error?: string; data?: FotoSiniestro[] }>(`/mantenimiento/siniestros/${id}/fotos/${fotoId}`, { method: 'DELETE' });

export const eliminarSiniestro = (id: number) => api<{ ok?: boolean; error?: string }>(`/mantenimiento/siniestros/${id}`, { method: 'DELETE' });

export const importarSiniestros = (filas: unknown[]) =>
  api<{ ok?: boolean; insertados: number; actualizados: number; errores: number; detalle_errores?: string[] }>('/mantenimiento/siniestros/importar', { method: 'POST', body: { filas } });

export const num = (v: unknown) => Number(v) || 0;

/** «2026-10» → «Oct 2026» */
export function nombreMes(mes: string) {
  const [a, m] = mes.split('-');
  const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
  return `${nombres[Number(m) - 1] ?? m} ${a}`;
}

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
export const hoyIso = hoyLima;
export const inicioAnioIso = () => `${hoyLima().slice(0, 4)}-01-01`;
