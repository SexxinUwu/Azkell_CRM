// Consultas y movimientos del tablero de neumáticos y de la línea de tiempo (contratos en neumaticos-tablero-tipos.ts).
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../../core/api/client';
import type { LineaTiempoLlanta, LlantaTablero, RespuestaMovimiento, TableroPlaca } from './neumaticos-tablero-tipos';

/** Vida del neumático: R0 nueva; cada reencauche sube un nivel (ver routes/neumaticos-ciclo.js) */
export const VIDAS = ['R0', 'R1', 'R2', 'R3'] as const;

/** La base guarda la vida como texto ("R0"…"R3"); el contrato la tipea como número. Se muestra lo que llegue. */
export function vidaTexto(v: unknown): string {
  if (typeof v === 'string' && v.trim()) return v.trim().toUpperCase();
  if (typeof v === 'number' && Number.isFinite(v)) return `R${v}`;
  return '—';
}

/** Vida que tendría la llanta tras un retorno de reencauche; null si ya está en R3 */
export function vidaSiguiente(v: unknown): string | null {
  const actual = vidaTexto(v) === '—' ? 'R0' : vidaTexto(v);
  const i = VIDAS.indexOf(actual as typeof VIDAS[number]);
  if (i < 0) return null;
  return i < VIDAS.length - 1 ? VIDAS[i + 1] : null;
}

/** Hora y fecha de la base (yyyy-mm-dd hh:mm) a dd/mm/aaaa hh:mm */
export function fechaHoraTexto(v: string | null | undefined): string {
  if (!v) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(v);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}`;
}

export function tituloLlanta(l: Pick<LlantaTablero, 'marca' | 'modelo' | 'medida'>): string {
  return [l.marca, l.modelo, l.medida].filter(Boolean).join(' · ') || 'Sin marca ni medida';
}

export function useTablero(placa: string) {
  return useQuery<TableroPlaca>({
    queryKey: ['mant', 'neumaticos-tablero', placa],
    enabled: !!placa,
    queryFn: async () => {
      const r = await api<TableroPlaca & { error?: string }>(`/neumaticos/tablero/${encodeURIComponent(placa)}`);
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo cargar el tablero');
      return r;
    },
    staleTime: 15_000,
  });
}

export function useLineaTiempo(codigo: string | null) {
  return useQuery<LineaTiempoLlanta>({
    queryKey: ['mant', 'neumaticos-linea', codigo],
    enabled: !!codigo,
    queryFn: async () => {
      const r = await api<LineaTiempoLlanta & { error?: string }>(`/neumaticos/linea-tiempo/${encodeURIComponent(codigo ?? '')}`);
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo cargar la línea de tiempo');
      return r;
    },
    staleTime: 15_000,
  });
}

/** Placas del sistema para el selector (mismo endpoint que las demás pantallas de mantenimiento) */
export function usePlacasLista() {
  return useQuery<string[]>({
    queryKey: ['mant', 'placas-lista'],
    queryFn: () => api<{ ok?: boolean; data?: string[] }>('/neumaticos/placas').then(r => r.data ?? []),
    staleTime: 5 * 60_000,
  });
}

export type Movimiento =
  | { clase: 'instalar'; codigo: string; placa: string; posicion: string; km: number }
  | { clase: 'retirar'; codigo: string; placa: string; posicion: string; km: number; destino: 'desecho' | 'reencauche' }
  | { clase: 'retorno'; codigo: string; proveedor: string; costo_servicio: number; disenio: string; remanente: number | null };

async function enviar(ruta: string, body: unknown): Promise<void> {
  const r = await api<RespuestaMovimiento>(ruta, { method: 'POST', body });
  if (r.ok === false) throw new Error(r.error ?? 'No se pudo completar el movimiento');
}

export function ejecutarMovimiento(m: Movimiento): Promise<void> {
  if (m.clase === 'instalar') {
    return enviar('/neumaticos/instalar', { codigo: m.codigo, placa: m.placa, posicion: m.posicion, km: m.km });
  }
  if (m.clase === 'retirar') {
    return enviar('/neumaticos/retirar', { codigo: m.codigo, placa: m.placa, posicion: m.posicion, km: m.km, destino: m.destino });
  }
  return enviar('/neumaticos/retorno-reencauche', {
    codigo: m.codigo, proveedor: m.proveedor, costo_servicio: m.costo_servicio, disenio: m.disenio, remanente: m.remanente,
  });
}

/**
 * Intercambio: primero se retira la llanta que ocupa la posición (el servidor exige destino reencauche o desecho)
 * y después se instala la que viene de bodega. Si la instalación falla, la primera ya salió: se avisa con claridad.
 */
export async function ejecutarIntercambio(
  saliente: { codigo: string; placa: string; posicion: string; destino: 'desecho' | 'reencauche'; km: number },
  entrante: { codigo: string; placa: string; posicion: string; km: number },
): Promise<void> {
  await ejecutarMovimiento({ clase: 'retirar', ...saliente });
  try {
    await ejecutarMovimiento({ clase: 'instalar', ...entrante });
  } catch (err) {
    throw new Error(`La llanta ${saliente.codigo} ya salió de ${saliente.posicion}, pero no se pudo instalar ${entrante.codigo}: ${errorMessage(err)}`);
  }
}
