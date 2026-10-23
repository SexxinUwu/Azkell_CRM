// Garita (Control de Unidades): tipos, reglas y consultas compartidas.
// Replica modulos/seguridad/unidades/logica.js (empresa por placa, tipo de salida, marca de tiempo).
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import type { ValoresChk, CatChk } from './garitaComponentes';

export interface FotoReg { id?: number | string; tipo: string; url?: string }

export interface Registro {
  id: string; placa_tracto: string; placa_carreta: string | null; conductor: string; destino: string | null; tipo_salida: string | null;
  orden_viaje: string | null; estado: string; salida_fecha: string | null; salida_hora: string | null; salida_km: number | null;
  salida_observaciones: string | null; salida_has_alert: number | boolean; retorno_fecha: string | null; retorno_hora: string | null; retorno_km: number | null;
  retorno_observaciones: string | null; retorno_has_alert: number | boolean; creado_por: string | null; retorno_creado_por: string | null;
  retorno_conductor?: string | null; retorno_placa_carreta?: string | null;
  empresa?: string | null; empresa_nombre?: string;
  firma_salida_conductor?: string | null; firma_salida_vigilancia?: string | null; firma_retorno_conductor?: string | null; firma_retorno_vigilancia?: string | null;
  salida_checklist_json?: ValoresChk | null; retorno_checklist_json?: ValoresChk | null;
  salida_template_json?: CatChk[] | null; retorno_template_json?: CatChk[] | null;
  fotos?: FotoReg[];
}

export interface Recursos {
  placas: string[]; carretasGlobales: string[]; conductores: string[];
  tractosPorEmpresa: Record<string, string[]>; placasPorEmpresa: Record<string, string[]>; placaToEmpresa: Record<string, string>;
}
export interface EmpresaStats { empresa: string; total_flota: number; en_ruta: number; completados: number; alertas: number }
export interface StatsPortal { empresas: EmpresaStats[]; global: EmpresaStats }

export type TipoSalida = 'RUTA' | 'COMPRAS' | 'TALLER';
export type Pestana = 'activos' | 'historial' | 'todos' | 'alertas';

export const n = (v: unknown) => Number(v) || 0;
export const limpiarPlaca = (p: unknown) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hayAlerta = (r: Registro) => !!(r.salida_has_alert || r.retorno_has_alert);

/** Tipo de salida del registro (mismas reglas del clasico) */
export function tipoDe(rec?: Registro | null): TipoSalida {
  if (!rec) return 'RUTA';
  if (rec.tipo_salida) {
    const ts = String(rec.tipo_salida).toUpperCase();
    if (ts.includes('COMPRA')) return 'COMPRAS';
    if (ts.includes('TALLER') || ts.includes('MANTENIMIENTO')) return 'TALLER';
    return 'RUTA';
  }
  const d = String(rec.destino ?? '').toUpperCase();
  if (d.includes('COMPRA')) return 'COMPRAS';
  if (d.includes('TALLER') || d.includes('MANTENIMIENTO') || d.includes('MAESTRANZA')) return 'TALLER';
  return 'RUTA';
}

/** Fecha dd-mm-aa y hora HH:MM, el mismo formato que guarda el clasico */
export function marcaTiempo() {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return { fecha: `${p(d.getDate())}-${p(d.getMonth() + 1)}-${String(d.getFullYear()).slice(-2)}`, hora: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

// ── Empresas ──
function normEmpresa(s: unknown) {
  if (!s) return '';
  return String(s).toUpperCase().replace(/S\.A\.C\.|SAC|S\.A\.|SA|E\.I\.R\.L\.|EIRL|S\.R\.L\.|SRL/gi, '').replace(/[^A-Z0-9]/g, '').trim();
}
export function empresaCoincide(a?: string | null, b?: string | null) {
  const n1 = normEmpresa(a), n2 = normEmpresa(b);
  if (!n1 || !n2) return false;
  return n1 === n2 || n1.includes(n2) || n2.includes(n1);
}
export function empresaDePlaca(placa: string | null | undefined, rec?: Recursos): string {
  if (!placa || !rec) return '';
  const c = limpiarPlaca(placa);
  if (rec.placaToEmpresa?.[c]) return rec.placaToEmpresa[c];
  for (const grupo of [rec.placasPorEmpresa, rec.tractosPorEmpresa]) {
    for (const [emp, lista] of Object.entries(grupo ?? {})) if ((lista ?? []).some(p => limpiarPlaca(p) === c)) return emp;
  }
  return '';
}
/** La titularidad la define el tracto; las carretas se comparten entre empresas */
export function perteneceAEmpresa(r: Registro, activa: string, rec?: Recursos) {
  if (!activa || activa === 'TODAS') return true;
  if (r.empresa && empresaCoincide(r.empresa, activa)) return true;
  const emp = r.placa_tracto ? empresaDePlaca(r.placa_tracto, rec) : '';
  return !!emp && empresaCoincide(emp, activa);
}
export function existePlaca(placa: string, rec?: Recursos) {
  const c = limpiarPlaca(placa);
  if (c.length < 4 || !rec) return false;
  if ([...(rec.placas ?? []), ...(rec.carretasGlobales ?? [])].some(p => limpiarPlaca(p) === c)) return true;
  return !!empresaDePlaca(placa, rec);
}

/** Color de la insignia de empresa (mismos tonos del clasico) */
export function estiloEmpresa(emp?: string | null): { texto: string; bg: string; color: string } | null {
  if (!emp) return null;
  const s = emp.toLowerCase();
  if (s.includes('marsisa')) return { texto: 'Marsisa', bg: '#e0f2fe', color: '#0369a1' };
  if (s.includes('rosymar')) return { texto: 'Rosymar', bg: '#dcfce7', color: '#15803d' };
  if (s.includes('trahesa')) return { texto: 'Trahesa', bg: '#fef3c7', color: '#b45309' };
  if (s.includes('yogui')) return { texto: 'Yogui', bg: '#f3e8ff', color: '#7e22ce' };
  return { texto: emp, bg: 'var(--fill)', color: 'var(--label)' };
}

/** Con "TODAS" el clasico pide los datos de todas las empresas (portal de seguridad) */
export const cabeceraEmpresa = (empresa: string): Record<string, string> | undefined => (empresa === 'TODAS' ? { 'x-portal': 'seguridad' } : undefined);

export function useRecursos(empresa: string) {
  return useQuery<Recursos>({
    queryKey: ['personas', 'garita-recursos', empresa === 'TODAS'],
    queryFn: () => api<Recursos>('/seguridad/recursos', { headers: cabeceraEmpresa(empresa) }),
    staleTime: 120_000,
  });
}

export function useRegistros(empresa: string) {
  return useQuery<Registro[]>({
    queryKey: ['personas', 'garita', empresa === 'TODAS'],
    queryFn: () => api<Registro[]>('/seguridad/unidades?limit=300', { headers: cabeceraEmpresa(empresa) }).then(r => (Array.isArray(r) ? r : [])),
    staleTime: 15_000, refetchInterval: 60_000,
  });
}

export function useEmpresasStats(empresa: string) {
  return useQuery<StatsPortal>({
    queryKey: ['personas', 'garita-empresas', empresa === 'TODAS'],
    queryFn: () => api<StatsPortal>('/seguridad/empresas-stats', { headers: cabeceraEmpresa(empresa) }),
    staleTime: 15_000,
  });
}
