import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// Auditoría para personas: eventos legibles del registro firmado (sin el ruido de las consultas automáticas),
// anulaciones/rechazos con quién y cuándo, y detalle con antes/después. Todo viene en UTC (ISO); aquí se muestra en hora de Lima.

export type CategoriaEvento = 'ingreso' | 'creo' | 'modifico' | 'elimino' | 'anulo' | 'rechazo' | 'aprobo' | 'bloqueo';

export const ETIQUETA_CATEGORIA: Record<CategoriaEvento, string> = {
  ingreso: 'Ingresó', creo: 'Registró', modifico: 'Modificó', elimino: 'Eliminó', anulo: 'Anuló', rechazo: 'Rechazó', aprobo: 'Aprobó', bloqueo: 'Bloqueado',
};

export interface EventoAuditoria {
  uid: string;
  id: number;
  fecha: string | null;
  usuario: string;
  correo: string | null;
  ip: string | null;
  categoria: CategoriaEvento;
  descripcion: string;
  modulo: string;
  segmento?: string;
  metodo: string;
  ruta: string;
  status: number | null;
  firma: string | null;
}

export interface DetalleEvento extends EventoAuditoria {
  firmaHash: string | null;
  cuerpo: Record<string, unknown> | string | null;
  antes: Record<string, unknown> | string | null;
  despues: Record<string, unknown> | string | null;
}

export interface FiltrosEventos {
  q: string; modulo: string; usuario: string; categoria: '' | CategoriaEvento; from: string; to: string;
}

export interface Anulacion {
  codigo: string;
  tipo: 'Orden de compra' | 'Orden de servicio' | 'Salida';
  estado: 'Anulada' | 'Rechazada';
  contraparte: string;
  total: number;
  creadoPor: string;
  creadaEn: string | null;
  porQuien: string | null;
  cuando: string | null;
  motivo: string;
  conRegistro: boolean;
}

function consulta(f: FiltrosEventos) {
  const p = new URLSearchParams();
  (Object.keys(f) as Array<keyof FiltrosEventos>).forEach(k => { if (f[k]) p.set(k, f[k]); });
  return p;
}

export function useEventos(f: FiltrosEventos, pagina: number, tamano: number) {
  return useQuery<{ items: EventoAuditoria[]; total: number }>({
    queryKey: ['auditoria', 'eventos', f, pagina, tamano],
    queryFn: () => {
      const p = consulta(f);
      p.set('page', String(pagina));
      p.set('pageSize', String(tamano));
      return api(`/audit/eventos?${p.toString()}`);
    },
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useResumenEventos(f: FiltrosEventos) {
  const sinCategoria = { ...f, categoria: '' as const };
  return useQuery<{ total: number; por: Partial<Record<CategoriaEvento, number>>; personas: number }>({
    queryKey: ['auditoria', 'resumen', sinCategoria],
    queryFn: () => api(`/audit/eventos/resumen?${consulta(sinCategoria).toString()}`),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useFiltrosEventos() {
  return useQuery<{ modulos: Array<{ valor: string; etiqueta: string; n: number }>; personas: Array<{ valor: string; n: number }> }>({
    queryKey: ['auditoria', 'filtros'],
    queryFn: () => api('/audit/eventos/filtros'),
    staleTime: 5 * 60_000,
  });
}

export function useDetalleEvento(uid: string | null) {
  return useQuery<DetalleEvento>({
    queryKey: ['auditoria', 'evento', uid],
    queryFn: () => api(`/audit/evento/${encodeURIComponent(uid ?? '')}`),
    enabled: !!uid,
    staleTime: 60_000,
  });
}

export function useAnulaciones(activo: boolean) {
  return useQuery<Anulacion[]>({
    queryKey: ['auditoria', 'anulaciones'],
    queryFn: () => api('/audit/anulaciones'),
    enabled: activo,
    staleTime: 30_000,
  });
}

/** Todos los eventos del filtro (para Excel): se piden por tandas de 250 */
export async function todosLosEventos(f: FiltrosEventos, maximo = 5000): Promise<EventoAuditoria[]> {
  const salida: EventoAuditoria[] = [];
  for (let pagina = 1; salida.length < maximo; pagina++) {
    const p = consulta(f);
    p.set('page', String(pagina));
    p.set('pageSize', '250');
    const r = await api<{ items: EventoAuditoria[]; total: number }>(`/audit/eventos?${p.toString()}`);
    salida.push(...r.items);
    if (salida.length >= r.total || r.items.length === 0) break;
  }
  return salida;
}

// ── Formato de fecha: siempre hora de Lima ──

const PARTES = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

/** "09/11/2026 10:02:06" (hora de Lima) a partir de una fecha ISO en UTC */
export function fechaLima(iso: string | null | undefined, conSegundos = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const p = Object.fromEntries(PARTES.formatToParts(d).map(x => [x.type, x.value]));
  const hora = p.hour === '24' ? '00' : p.hour;
  return `${p.day}/${p.month}/${p.year} ${hora}:${p.minute}${conSegundos ? ':' + p.second : ''}`;
}

/** "hace 20 min", "hace 3 h", "hace 2 d" */
export function haceCuanto(iso: string | null | undefined): string {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (isNaN(min) || min < 0) return '';
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `hace ${d} d` : '';
}

/** Hoy en Lima (AAAA-MM-DD), con un desplazamiento de días */
export function diaLima(desplazamiento = 0): string {
  const d = new Date(Date.now() - 5 * 3600_000 + desplazamiento * 86400_000);
  return d.toISOString().slice(0, 10);
}
