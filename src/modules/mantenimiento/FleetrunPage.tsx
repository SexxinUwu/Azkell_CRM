import { haptic } from '../../core/lib/haptics';
import './mant.css';
import { Fragment, useMemo, useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, Bus, ChevronDown, ChevronRight, Clock, Download, FileSpreadsheet, Gauge, History, Pencil, Plus, SearchX, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { exportarExcel } from '../../core/lib/excel';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { useAuth } from '../../core/auth/AuthProvider';
import {
  frFecha, frId, frKmCambio, frKmGps, frKmProx, frFrecuencia,
  frObs, frPlaca, frTipo, frUts, useFleetrun, type FleetrunFila,
} from './api';
import { usePlacas, useMetricas } from '../placas/api';
import { useUnidadesGps, type UnidadMapa } from '../flota/api';
import { useKmHistorico } from './fleetrunApi';
import { FleetrunFormulario } from './FleetrunFormulario';
import { ImportarFleetrunSheet, descargarPlantillaFleetrun } from './ImportarFleetrunSheet';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type EstadoFR = 'vencido' | 'por_vencer' | 'vigente' | 'sin_datos';
const PRIORIDAD: Record<EstadoFR, number> = { sin_datos: -1, vigente: 0, por_vencer: 1, vencido: 2 };

// ─── Hook: umbrales configurables desde /api/configuracion ───────────────────

function useFleetrunUmbrales() {
  return useQuery<Record<string, number>>({
    queryKey: ['conf', 'fleetrun-umbrales'],
    queryFn: async () => {
      try {
        // Lectura de la base de esta empresa (no de la base global de /configuracion)
        const conf = await api<{ valor: string | null }>('/configuracion-clave/fleetrun_uts_umbrales');
        const raw = conf.valor || '{}';
        return JSON.parse(raw) as Record<string, number>;
      } catch { return {}; }
    },
    staleTime: 300_000,
  });
}

// ─── Km / horas en vivo del GPS (mismo origen y emparejamiento que el clásico: buscarWialonPorPlaca) ───

export type KmVivo = (placa: string) => Pick<UnidadMapa, 'km' | 'horas' | 'ubicacion'> | null;

const limpiarPlaca = (p: string) => p.replace(/[^A-Z0-9]/gi, '').toUpperCase();

/** KPIs y listas: el GPS se consulta cada 30 s (el mapa sigue en 4 s) para no saturar el navegador */
export function useKmVivo(): KmVivo {
  const { data: unidades } = useUnidadesGps(30_000);
  const { data: placas } = usePlacas();
  return useMemo(() => {
    if (!unidades || !unidades.length) return () => null;
    const wialonDe = new Map<string, string>();
    for (const p of placas ?? []) if (p.wialon) wialonDe.set(limpiarPlaca(p.placa), p.wialon.trim().toUpperCase());
    return (placa: string) => {
      const pl = limpiarPlaca(placa);
      if (!pl) return null;
      const wn = wialonDe.get(pl);
      const exacta = wn ? unidades.find(u => u.nombre.trim().toUpperCase() === wn) : undefined;
      if (exacta) return exacta;
      return unidades.find(u => {
        const wp = limpiarPlaca(u.placa);
        const wnom = limpiarPlaca(u.nombre);
        return (wp && (wp === pl || wp.includes(pl) || pl.includes(wp))) || (wnom && (wnom === pl || wnom.includes(pl) || pl.includes(wnom)));
      }) ?? null;
    };
  }, [unidades, placas]);
}

/** Km (u horas) actual: el del GPS en vivo si la unidad aparece, si no el guardado en el registro */
function kmActual(f: FleetrunFila, esHoras: boolean, vivo: KmVivo): number {
  const v = vivo(frPlaca(f));
  if (v) return (esHoras ? v.horas : v.km) || 0;
  return frKmGps(f);
}

// ─── Lógica de estado (igual a la SPA clásica) ───────────────────────────────

function calcularEstado(
  f: FleetrunFila,
  uts: string,
  umbrales: Record<string, number>,
  metricas: Map<string, string>,
  vivo: KmVivo,
): EstadoFR {
  const placa = frPlaca(f).toUpperCase();
  const esHoras = metricas.get(placa) === 'horas';
  const kmG = kmActual(f, esHoras, vivo);
  let kmP = frKmProx(f);
  const kmC = frKmCambio(f);
  const frec = frFrecuencia(f);

  if ((!kmP || kmP === 0) && frec > 0 && kmC > 0) kmP = kmC + frec;
  // Sin próximo km no hay cálculo: no se presenta como vigente
  if (!kmP) return 'sin_datos';

  const kmRestante = kmG > 0 ? kmP - kmG : kmP - kmC;
  if (kmRestante <= 0) return 'vencido';

  // Umbral por tipo de UTS configurable (fallback: Nacional=1500, Local=100, resto=1000)
  const utsU = uts.toUpperCase();
  const sufijo = esHoras ? '_HORAS' : '_KM';
  let umbral = umbrales[utsU + sufijo] ?? umbrales[utsU];
  if (umbral === undefined) {
    if (utsU === 'NACIONAL') umbral = 1500;
    else if (utsU === 'LOCAL') umbral = 100;
    else umbral = 1000;
  }

  return kmRestante <= umbral ? 'por_vencer' : 'vigente';
}

function estadoLabel(e: EstadoFR) {
  if (e === 'vencido')    return 'Vencido';
  if (e === 'por_vencer') return 'Por vencer';
  if (e === 'sin_datos') return 'Sin datos';
  return 'Vigente';
}

function estadoColor(e: EstadoFR) {
  if (e === 'vencido')    return 'red';
  if (e === 'por_vencer') return 'amber';
  return 'green';
}

// ─── Parseo de fecha DD/MM/YYYY o ISO ────────────────────────────────────────

function parseFechaMs(str: string | number | null): number {
  if (!str) return 0;
  const s = String(str).trim();
  const p = s.split('/');
  if (p.length === 3) {
    return new Date(`${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`).getTime() || 0;
  }
  return new Date(s).getTime() || 0;
}

// Km (u horas) por día de los últimos 30 días, según los snapshots del GPS
function kmDiaTexto(k: { km_dia: number | null; horas_dia: number | null } | undefined, horas: boolean): string {
  const v = k ? (horas ? k.horas_dia : k.km_dia) : null;
  return v != null && v > 0 ? `${Number(v).toLocaleString('es-PE')} ${horas ? 'h' : 'km'}/día` : '';
}

// ─── Donut SVG ───────────────────────────────────────────────────────────────

function DonutChart({ vencidos, porVencer, vigentes }: { vencidos: number; porVencer: number; vigentes: number }) {
  const total = vencidos + porVencer + vigentes;
  if (!total) return null;
  const r = 40, cx = 50, cy = 50, circum = 2 * Math.PI * r;
  const pV = (vencidos / total) * circum;
  const pP = (porVencer / total) * circum;
  const pG = (vigentes / total) * circum;
  const o3 = circum - pV - pP;
  return (
    <svg viewBox="0 0 100 100" width={96} height={96} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      {vigentes > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--green-ink)" strokeWidth={18}
        strokeDasharray={`${pG} ${circum - pG}`} strokeDashoffset={-o3} />}
      {porVencer > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--amber-ink)" strokeWidth={18}
        strokeDasharray={`${pP} ${circum - pP}`} strokeDashoffset={-(circum - pV)} />}
      {vencidos > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--red-ink)" strokeWidth={18}
        strokeDasharray={`${pV} ${circum - pV}`} strokeDashoffset={0} />}
    </svg>
  );
}

/** Panel de estado de la flota: logo, empresa, fecha, dona y KPIs. Lo usan Fleetrun y el dashboard de taller. */
export function PanelEstadoFlota({ stats, empresa }: { stats: { total: number; vencidos: number; porVencer: number; vigentes: number }; empresa: string }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'center', flexWrap: 'wrap' }}>
      <div className="mant-card" style={{ minWidth: 200, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--s-2)' }}>
        <img src="/api/tenant-logo" alt="" style={{ height: 64, maxWidth: 180, objectFit: 'contain' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        <div style={{ fontWeight: 700 }}>{empresa}</div>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--label-1)', background: 'var(--fill)', borderRadius: 999, padding: '3px 10px' }}>
          {new Date().toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' })}
        </span>
      </div>
      <DonutChart vencidos={stats.vencidos} porVencer={stats.porVencer} vigentes={stats.vigentes} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', gap: 'var(--s-2) var(--s-4)' }}>
        {[
          { label: 'Flota total',  valor: stats.total,     color: 'accent' as const },
          { label: 'Vencidos',     valor: stats.vencidos,  color: 'red'    as const, pct: stats.total ? Math.round(stats.vencidos  / stats.total * 100) : 0 },
          { label: 'Por vencer',   valor: stats.porVencer, color: 'amber'  as const, pct: stats.total ? Math.round(stats.porVencer / stats.total * 100) : 0 },
          { label: 'Vigentes',     valor: stats.vigentes,  color: 'green'  as const, pct: stats.total ? Math.round(stats.vigentes  / stats.total * 100) : 0 },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{
              fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
              color: s.color === 'accent' ? 'var(--label)' : `var(--${s.color}-ink)`,
            }}>
              {s.valor}
              {'pct' in s && (s as { pct: number }).pct > 0 && (
                <span style={{ fontSize: '0.75rem', marginLeft: 4, opacity: 0.7 }}>{(s as { pct: number }).pct}%</span>
              )}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const POR_PAGINA = 20;

// ─── Componente principal ─────────────────────────────────────────────────────

/** Número del ID del registro (como el clásico: los dígitos finales), para desempatar registros del mismo día */
const idFila = (f: FleetrunFila) => parseInt((String(f[0] ?? '').match(/\d+$/) || ['0'])[0], 10);

/** Estado preventivo de la flota: peor estado por placa (sin duplicar placa + tipo). Una sola regla para la pantalla y el dashboard. */
export function resumenPreventivo(filas: FleetrunFila[], placasData: { placa: string; estado: string; uts: string }[] | undefined,
  umbrales: Record<string, number>, metricas: Map<string, string>, vivo: KmVivo) {
  const hoy = Date.now();
  const ordenadas = [...filas].sort((a, b) => {
    const ta = parseFechaMs(a[3] as string | null);
    const tb = parseFechaMs(b[3] as string | null);
    const aFut = ta > hoy + 86_400_000;
    const bFut = tb > hoy + 86_400_000;
    if (aFut !== bFut) return aFut ? 1 : -1;
    if (tb !== ta) return tb - ta;
    return idFila(b) - idFila(a);
  });
  const activas = placasData
    ? new Map(placasData.filter(p => p.estado.toLowerCase() === 'activa' || p.estado === '').map(p => [p.placa.toUpperCase(), p]))
    : null;
  const unicas = new Map<string, FleetrunFila>();
  for (const f of ordenadas) {
    const placa = frPlaca(f).toUpperCase();
    if (activas !== null && !activas.has(placa)) continue;
    const clave = `${placa}__${frTipo(f).toUpperCase()}`;
    if (!unicas.has(clave)) unicas.set(clave, f);
  }
  const porPlaca = new Map<string, EstadoFR>();
  for (const f of unicas.values()) {
    const placa = frPlaca(f).toUpperCase();
    const uts = activas?.get(placa)?.uts || frUts(f);
    const est = calcularEstado(f, uts, umbrales, metricas, vivo);
    const prev = porPlaca.get(placa);
    if (!prev || PRIORIDAD[est] > PRIORIDAD[prev]) porPlaca.set(placa, est);
  }
  let vencidos = 0, porVencer = 0, vigentes = 0, sinDatos = 0;
  porPlaca.forEach(e => {
    if (e === 'vencido') vencidos++;
    else if (e === 'por_vencer') porVencer++;
    else if (e === 'sin_datos') sinDatos++;
    else vigentes++;
  });
  return { vencidos, porVencer, vigentes, sinDatos, total: porPlaca.size };
}

/** Nombre de la empresa (configuración), para el encabezado del panel */
export function useEmpresaNombre() {
  return useQuery<string>({
    queryKey: ['conf', 'empresa-nombre'],
    queryFn: async () => {
      try {
        const r = await api<{ valor: string | null }>('/configuracion-clave/empresa_nombre');
        if (r.valor) return r.valor;
      } catch { /* sin configuración */ }
      return (window.location.hostname.split('.')[0] || 'Azkell').toUpperCase();
    },
    staleTime: 300_000,
  });
}

const pildora = (fondo: string): CSSProperties => ({
  display: 'inline-block', fontSize: '0.6875rem', fontWeight: 700, padding: '2px 9px', borderRadius: 999,
  background: fondo, color: '#fff', whiteSpace: 'nowrap', letterSpacing: '0.02em',
});
const colorEstadoFila = (e: EstadoFR) => (e === 'sin_datos' ? 'var(--label-3)' : `var(--${estadoColor(e)}-ink)`);

/** Estado de mantenimientos en el formato del clásico: logo, dona con leyenda y KPI en cuadrícula 2x2 */
function EstadoMantenimientos({ stats, empresa }: { stats: { total: number; vencidos: number; porVencer: number; vigentes: number }; empresa: string }) {
  const pct = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0);
  const kpis = [
    { label: 'FLOTA TOTAL', valor: stats.total, color: 'var(--label)', icono: <Bus size={20} /> },
    { label: 'VENCIDOS', valor: stats.vencidos, color: 'var(--red-ink)', pct: pct(stats.vencidos), icono: <AlertTriangle size={20} /> },
    { label: 'POR VENCER', valor: stats.porVencer, color: 'var(--amber-ink)', pct: pct(stats.porVencer), icono: <Clock size={20} /> },
    { label: 'VIGENTES', valor: stats.vigentes, color: 'var(--green-ink)', pct: pct(stats.vigentes), icono: <ShieldCheck size={20} /> },
  ];
  const leyenda = [
    { nombre: 'Vencidos', n: stats.vencidos, color: 'var(--red-ink)' },
    { nombre: 'Por Vencer', n: stats.porVencer, color: 'var(--amber-ink)' },
    { nombre: 'Vigentes', n: stats.vigentes, color: 'var(--green-ink)' },
  ];
  return (
    <div className="mant-grid">
      <div className="mant-col-3 mant-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--s-2)', textAlign: 'center' }}>
        <img src="/api/tenant-logo" alt="" style={{ height: 56, maxWidth: 170, objectFit: 'contain' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        <div style={{ fontWeight: 700 }}>{empresa}</div>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--label-1)', background: 'var(--fill)', borderRadius: 999, padding: '3px 10px' }}>
          {new Date().toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' })}
        </span>
      </div>
      <div className="mant-col-4 mant-card">
        <div className="mant-card__header">
          <span className="mant-card__title"><Gauge size={15} /> Estado de Mantenimientos</span>
          <span style={{ fontSize: '0.6875rem', color: 'var(--label-2)', background: 'var(--fill)', borderRadius: 6, padding: '2px 8px' }}>Flota Activa</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', flexWrap: 'wrap', padding: 'var(--s-2) 0' }}>
          <DonutChart vencidos={stats.vencidos} porVencer={stats.porVencer} vigentes={stats.vigentes} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8125rem', fontWeight: 600 }}>
            {leyenda.map(l => (
              <span key={l.nombre} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, background: l.color, borderRadius: 2 }} />
                {l.nombre}: {pct(l.n)}% ({l.n})
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mant-col-5" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-2)' }}>
        {kpis.map(k => (
          <div key={k.label} className="mant-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s-2)' }}>
            <div>
              <div style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--label-2)' }}>
                {k.label}{k.pct !== undefined && <span style={{ marginLeft: 6, fontSize: '0.625rem', color: k.color }}>{k.pct}%</span>}
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: k.color, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>{k.valor}</div>
            </div>
            <span style={{ color: k.color, opacity: 0.85 }}>{k.icono}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FleetrunPage() {
  const qc = useQueryClient();
  const { can, user } = useAuth();
  const puedeCrear = can('fleet.crear', 'fleetrun.crear');
  const puedeEditar = can('fleet.editar', 'fleetrun.editar');
  const puedeEliminar = can('fleet.eliminar', 'fleetrun.eliminar');
  const { data, isLoading, isError, error } = useFleetrun();
  const { data: placasData } = usePlacas();
  const { data: metricas = new Map<string, string>() } = useMetricas();
  const { data: umbrales = {} } = useFleetrunUmbrales();
  const empresa = useEmpresaNombre();
  const { data: kmDia } = useKmHistorico();
  const vivo = useKmVivo();
  const [formulario, setFormulario] = useState<{ registro: FleetrunFila | null } | null>(null);
  const [importando, setImportando] = useState(false);

  const [busqueda, setBusqueda]   = useState('');
  const [filtro, setFiltro]       = useState<string>('Todos');
  const [historial, setHistorial] = useState(false);
  const [pagina, setPagina]       = useState(1);
  const [abiertas, setAbiertas]   = useState<Set<string>>(() => new Set());
  const [eliminando, setEliminando] = useState<string | null>(null);

  const filas = data ?? [];

  // Mapa de placas activas: null = aún cargando
  const placasActivas = useMemo(() => {
    if (!placasData) return null;
    return new Map(
      placasData
        .filter(p => p.estado.toLowerCase() === 'activa' || p.estado === '')
        .map(p => [p.placa.toUpperCase(), p]),
    );
  }, [placasData]);

  // Ordenar igual que la SPA: fecha DESC, ID DESC; registros futuros al final
  const filasOrdenadas = useMemo(() => {
    const hoy = Date.now();
    return [...filas].sort((a, b) => {
      const ta = parseFechaMs(a[3] as string | null);
      const tb = parseFechaMs(b[3] as string | null);
      const aFut = ta > hoy + 86_400_000;
      const bFut = tb > hoy + 86_400_000;
      if (aFut !== bFut) return aFut ? 1 : -1;
      if (tb !== ta) return tb - ta;
      return idFila(b) - idFila(a);
    });
  }, [filas]);

  // Deduplicar (último por placa+tipo) y filtrar por placas activas
  const datosVista = useMemo(() => {
    if (historial) return filasOrdenadas;
    const mapa = new Map<string, FleetrunFila>();
    for (const f of filasOrdenadas) {
      const placa = frPlaca(f).toUpperCase();
      const key   = `${placa}__${frTipo(f).toUpperCase()}`;
      // Si placas aún no cargó, mostrar todo (evita pantalla vacía temporal)
      if (placasActivas !== null && !placasActivas.has(placa)) continue;
      if (!mapa.has(key)) mapa.set(key, f);
    }
    return Array.from(mapa.values());
  }, [filasOrdenadas, historial, placasActivas]);

  // KPIs de la flota: misma función que el dashboard de taller
  const stats = useMemo(() => resumenPreventivo(filas, placasData, umbrales, metricas, vivo), [filas, placasData, umbrales, metricas, vivo]);

  // Filtrado + búsqueda
  const filtrados = useMemo(() => {
    const LABEL_A_ESTADO: Record<string, EstadoFR> = {
      'Vencido': 'vencido', 'Por vencer': 'por_vencer', 'Vigente': 'vigente', 'Sin datos': 'sin_datos',
    };
    let lista = datosVista;
    if (filtro !== 'Todos') {
      const target = LABEL_A_ESTADO[filtro];
      lista = lista.filter(f => {
        const placa = frPlaca(f).toUpperCase();
        const uts   = placasActivas?.get(placa)?.uts || frUts(f);
        return calcularEstado(f, uts, umbrales, metricas, vivo) === target;
      });
    }
    if (busqueda) {
      const q = busqueda.toUpperCase();
      lista = lista.filter(f =>
        frPlaca(f).toUpperCase().includes(q) ||
        frTipo(f).toUpperCase().includes(q)  ||
        frUts(f).toUpperCase().includes(q),
      );
    }
    return lista;
  }, [datosVista, filtro, busqueda, placasActivas, umbrales, metricas, vivo]);

  // Agrupar por placa en el orden en que aparecen, como el clásico (fila de placa que se despliega)
  const grupos = useMemo(() => {
    const mapa = new Map<string, FleetrunFila[]>();
    for (const f of filtrados) {
      const placa = frPlaca(f).toUpperCase();
      const lista = mapa.get(placa);
      if (lista) lista.push(f); else mapa.set(placa, [f]);
    }
    return Array.from(mapa.entries()).map(([placa, registros]) => ({ placa, registros }));
  }, [filtrados]);

  // Paginación por placas
  const totalPags   = Math.max(1, Math.ceil(grupos.length / POR_PAGINA));
  const pagActual   = Math.min(pagina, totalPags);
  const vistaGrupos = grupos.slice((pagActual - 1) * POR_PAGINA, pagActual * POR_PAGINA);

  function cambiarFiltro(f: string) { setFiltro(f); setPagina(1); }
  function cambiarBusqueda(v: string) { setBusqueda(v); setPagina(1); }
  function alternarGrupo(placa: string) {
    haptic('selection');
    setAbiertas(prev => { const n = new Set(prev); if (n.has(placa)) n.delete(placa); else n.add(placa); return n; });
  }

  /** Valores de una fila de la tabla (los mismos que usa el estado de la placa) */
  function datosFila(f: FleetrunFila) {
    const placa = frPlaca(f).toUpperCase();
    const esHoras = metricas.get(placa) === 'horas';
    const uts = placasActivas?.get(placa)?.uts || frUts(f);
    const kmC = frKmCambio(f);
    let kmP = frKmProx(f);
    const frec = frFrecuencia(f);
    if ((!kmP || kmP === 0) && frec > 0 && kmC > 0) kmP = kmC + frec;
    const kmG = kmActual(f, esHoras, vivo);
    const falta = kmG > 0 && kmP > 0 ? kmP - kmG : kmP > 0 && kmC > 0 ? kmP - kmC : 0;
    return {
      id: frId(f), placa, esHoras, unidad: esHoras ? ' h' : '', uts, kmC, kmP, frec, kmG, falta,
      kmRec: kmG > 0 && kmC > 0 ? kmG - kmC : 0,
      est: calcularEstado(f, uts, umbrales, metricas, vivo),
      ubicacion: vivo(placa)?.ubicacion || '',
      modelo: placasActivas?.get(placa)?.modelo || '',
      tipo: frTipo(f), fecha: frFecha(f), obs: frObs(f),
    };
  }

  async function exportar() {
    const filasExcel = filtrados.map(f => {
      const d = datosFila(f);
      return [d.placa, d.fecha, d.modelo, d.tipo, d.kmC || null, d.kmG || null, d.falta || null, d.kmP || null, d.frec || null, d.obs, estadoLabel(d.est), d.kmRec || null, d.ubicacion];
    });
    await exportarExcel('mantenimiento-preventivo', 'Preventivo',
      ['Placa', 'Fecha', 'Modelo', 'Tipo preventivo', 'Km cambio', 'Km actual (GPS)', 'Cuánto falta', 'Km próximo', 'Frecuencia', 'Observación', 'Estado', 'Km recorrido', 'Ubicación'],
      filasExcel);
  }

  // ─── Eliminar registro ────────────────────────────────────────────────────
  async function eliminarRegistro(f: FleetrunFila) {
    const id = frId(f);
    const placa = frPlaca(f);
    const tipo  = frTipo(f);
    if (!confirm(`¿Eliminar el registro de "${tipo}" para ${placa}? Esta acción no se puede deshacer.`)) return;
    setEliminando(id);
    try {
      await api('/script/eliminarRegistro', { method: 'POST', body: { id, coleccion: 'Fleetrun' } });
      qc.invalidateQueries({ queryKey: ['mant', 'fleetrun'] });
    } catch (e) {
      alert('Error al eliminar: ' + String(e));
    } finally {
      setEliminando(null);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const opcionesFiltro: Array<{ value: string; label: string }> = [
    { value: 'Todos', label: 'Todos' },
    { value: 'Vigente', label: 'Vigentes' },
    { value: 'Por vencer', label: 'Por Vencer' },
    { value: 'Vencido', label: 'Vencidos' },
    ...(stats.sinDatos > 0 ? [{ value: 'Sin datos', label: 'Sin datos' }] : []),
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Mantenimiento Preventivo"
        subtitle="Control de kilometraje, frecuencias de servicio y alertas de flota"
        actions={
          <>
          <MenuOtros opciones={[
            { label: 'Descargar plantilla de importación', icon: <FileSpreadsheet size={17} />, onSelect: () => descargarPlantillaFleetrun() },
            {
              separado: true,
              label: 'Abrir versión completa',
              icon: <ArrowUpRight size={17} />,
              onSelect: () => abrirClasico('mantenimiento/fleetrun'),
            },
          ]} />
          {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ registro: null })}>Registrar Mantenimiento</Button>}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>

          {/* Logo, dona con leyenda y KPI (formato del clásico) */}
          {!historial && <EstadoMantenimientos stats={stats} empresa={empresa.data ?? ''} />}

          {/* Filtros, búsqueda y herramientas */}
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            {!historial && (
              <SegmentedControl value={filtro} onChange={cambiarFiltro} label="Filtrar por estado" options={opcionesFiltro} />
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ width: '14rem' }}>
                <SearchField value={busqueda} onChange={cambiarBusqueda} placeholder="Buscar placa, modelo, tipo…" />
              </div>
              <Button variant={historial ? 'primary' : 'secondary'} icon={<History size={16} />}
                onClick={() => { setHistorial(h => !h); setPagina(1); setBusqueda(''); setFiltro('Todos'); }}>Historial</Button>
              {puedeCrear && <Button variant="secondary" icon={<Upload size={16} />} onClick={() => setImportando(true)}>Importar</Button>}
              <Button variant="secondary" icon={<Download size={16} />} onClick={exportar}>Exportar</Button>
            </div>
          </div>

          {/* Tabla agrupada por placa */}
          {grupos.length === 0 ? (
            <EmptyState
              icon={busqueda ? <SearchX size={22} /> : <Gauge size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin registros'}
            >
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => cambiarBusqueda('')}>Quitar búsqueda</button>
                : 'Los registros de mantenimiento preventivo aparecerán aquí.'}
            </EmptyState>
          ) : (
            <>
              <div className="tarjeta__lista" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table className="inv-kardex" style={{ minWidth: '70rem' }}>
                  <thead>
                    <tr>
                      <th>Placa</th>
                      <th>Fecha</th>
                      <th>Modelo</th>
                      <th>Tipo preventivo</th>
                      <th style={{ textAlign: 'right' }}>Km cambio</th>
                      <th style={{ textAlign: 'right' }}>Km actual (GPS)</th>
                      <th style={{ textAlign: 'right' }}>Cuánto falta</th>
                      <th style={{ textAlign: 'right' }}>Km próximo</th>
                      <th style={{ textAlign: 'right' }}>Frecuencia</th>
                      <th>Observación</th>
                      <th>Estado</th>
                      <th style={{ textAlign: 'right' }}>Km recorrido</th>
                      <th>Ubicación</th>
                      <th style={{ width: 64 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {vistaGrupos.map(g => {
                      const abierta = abiertas.has(g.placa);
                      const esHoras = metricas.get(g.placa) === 'horas';
                      const kmDiaT = kmDiaTexto(kmDia?.get(g.placa), esHoras);
                      const cliente = placasActivas?.get(g.placa)?.cliente ?? '';
                      const uts = placasActivas?.get(g.placa)?.uts || frUts(g.registros[0]);
                      return (
                        <Fragment key={g.placa}>
                          <tr onClick={() => alternarGrupo(g.placa)} style={{ cursor: 'pointer', background: 'var(--fill)' }} aria-expanded={abierta}>
                            <td colSpan={14}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap', minHeight: 32 }}>
                                {abierta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--label)' }}>{g.placa}</span>
                                {cliente && <span style={pildora('#475569')}>{cliente}</span>}
                                {uts && <span style={pildora('#0891b2')}>{uts}</span>}
                                {kmDiaT && <span style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{kmDiaT}</span>}
                                <span style={{ ...pildora('#d97706'), marginLeft: 'auto' }}>{g.registros.length} Registros</span>
                              </div>
                            </td>
                          </tr>
                          {abierta && g.registros.map(f => {
                            const d = datosFila(f);
                            return (
                              <tr key={d.id || `${d.placa}-${d.tipo}-${d.fecha}`}>
                                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--label-2)' }}>∟ {d.placa}</td>
                                <td style={{ color: 'var(--label-2)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                                  {d.fecha || <span style={{ color: 'var(--label-3)' }}>Plan inicial</span>}
                                </td>
                                <td style={{ color: 'var(--label-2)', fontSize: '0.8125rem' }}>{d.modelo || '—'}</td>
                                <td style={{ fontWeight: 600 }}>{d.tipo}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                                  {d.kmC > 0 ? `${d.kmC.toLocaleString('es-PE')}${d.unidad}` : '—'}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: d.kmG > 0 ? 'var(--label-1)' : 'var(--label-3)' }}>
                                  {d.kmG > 0 ? `${d.kmG.toLocaleString('es-PE')}${d.unidad}` : '—'}
                                </td>
                                <td style={{
                                  textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: d.falta < 0 ? 700 : undefined,
                                  color: d.falta < 0 ? 'var(--red-ink)' : d.falta === 0 ? 'var(--label-3)' : 'var(--label-1)',
                                }}>
                                  {d.falta !== 0 ? `${d.falta.toLocaleString('es-PE')}${d.unidad}` : '—'}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                                  {d.kmP > 0 ? `${d.kmP.toLocaleString('es-PE')}${d.unidad}` : '—'}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--label-2)' }}>
                                  {d.frec > 0 ? `${d.frec.toLocaleString('es-PE')}${d.unidad}` : '—'}
                                </td>
                                <td style={{ color: 'var(--label-2)', fontSize: '0.8125rem', maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {d.obs || '—'}
                                </td>
                                <td><span style={pildora(colorEstadoFila(d.est))}>{estadoLabel(d.est).toUpperCase()}</span></td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--label-2)' }}>
                                  {d.kmRec > 0 ? `${d.kmRec.toLocaleString('es-PE')}${d.unidad}` : '—'}
                                </td>
                                <td style={{ color: 'var(--label-2)', fontSize: '0.75rem', maxWidth: '16rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.ubicacion}>
                                  {d.ubicacion || '—'}
                                </td>
                                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  {puedeEditar && (
                                    <button type="button" title="Editar registro" aria-label={`Editar ${d.placa}`} onClick={() => setFormulario({ registro: f })}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--label-3)', padding: '2px 4px', lineHeight: 1 }}>
                                      <Pencil size={15} />
                                    </button>
                                  )}
                                  {puedeEliminar && <button
                                    type="button"
                                    title="Eliminar registro"
                                    disabled={eliminando === d.id}
                                    onClick={() => eliminarRegistro(f)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--label-3)', padding: '2px 4px', lineHeight: 1 }}
                                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--red-ink)')}
                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--label-3)')}
                                  >
                                    <Trash2 size={15} />
                                  </button>}
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', justifyContent: 'space-between', fontSize: '0.875rem', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--label-2)' }}>
                  Mostrando {(pagActual - 1) * POR_PAGINA + 1} a {Math.min(pagActual * POR_PAGINA, grupos.length)} de {grupos.length} placas
                </span>
                {totalPags > 1 && (
                  <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                    <button type="button" className="chip" disabled={pagActual <= 1}
                      onClick={() => setPagina(p => Math.max(1, p - 1))}>‹ Anterior</button>
                    <button type="button" className="chip" disabled={pagActual >= totalPags}
                      onClick={() => setPagina(p => Math.min(totalPags, p + 1))}>Siguiente ›</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <FleetrunFormulario open={!!formulario} registro={formulario?.registro ?? null} usuario={user?.email ?? ''} onClose={() => setFormulario(null)} />
      <ImportarFleetrunSheet open={importando} onClose={() => setImportando(false)} />
    </Page>
  );
}

// Estado preventivo por placa (el peor de sus registros), con la misma regla que esta pantalla. Lo usa el dashboard de taller.
export function useFleetrunStats() {
  const { data } = useFleetrun();
  const { data: placasData } = usePlacas();
  const { data: metricas = new Map<string, string>() } = useMetricas();
  const { data: umbrales = {} } = useFleetrunUmbrales();
  const vivo = useKmVivo();
  return useMemo(() => resumenPreventivo(data ?? [], placasData, umbrales, metricas, vivo), [data, placasData, metricas, umbrales, vivo]);
}
