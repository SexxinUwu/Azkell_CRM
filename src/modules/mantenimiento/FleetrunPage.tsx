import { haptic } from '../../core/lib/haptics';
import './mant.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, BookOpen, FileSpreadsheet, Gauge, Pencil, Plus, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { useAuth } from '../../core/auth/AuthProvider';
import {
  frFecha, frId, frKmCambio, frKmGps, frKmProx, frFrecuencia,
  frObs, frPlaca, frTipo, frUts, useFleetrun, type FleetrunFila,
} from './api';
import { usePlacas, useMetricas } from '../placas/api';
import { useUnidadesGps } from '../flota/api';
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

export type KmVivo = (placa: string) => { km: number; horas: number } | null;

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

const FILTROS = ['Todos', 'Vencido', 'Por vencer', 'Vigente', 'Sin datos'] as const;
const POR_PAGINA = 20;

// ─── Componente principal ─────────────────────────────────────────────────────

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
    return (Number(b[0] ?? 0)) - (Number(a[0] ?? 0));
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
      return (Number(b[0] ?? 0)) - (Number(a[0] ?? 0));
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

  // Paginación
  const totalPags   = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pagActual   = Math.min(pagina, totalPags);
  const vistaActual = filtrados.slice((pagActual - 1) * POR_PAGINA, pagActual * POR_PAGINA);

  function cambiarFiltro(f: string) { setFiltro(f); setPagina(1); }
  function cambiarBusqueda(v: string) { setBusqueda(v); setPagina(1); }

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

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Mantenimiento Preventivo"
        subtitle={
          isLoading
            ? 'Cargando…'
            : historial
              ? `${filtrados.length} registros (historial completo)`
              : `${stats.total} unidades activas`
        }
        actions={
          <>
          <MenuOtros opciones={[
            {
              label: historial ? 'Ver solo activos' : 'Ver historial completo',
              icon: <BookOpen size={17} />,
              onSelect: () => { setHistorial(h => !h); setPagina(1); setBusqueda(''); setFiltro('Todos'); },
            },
            puedeCrear && { label: 'Importar desde Excel', icon: <FileSpreadsheet size={17} />, separado: true, onSelect: () => setImportando(true) },
            { label: 'Descargar plantilla de importación', icon: <FileSpreadsheet size={17} />, onSelect: () => descargarPlantillaFleetrun() },
            {
              separado: true,
              label: 'Abrir versión completa',
              icon: <ArrowUpRight size={17} />,
              onSelect: () => abrirClasico('mantenimiento/fleetrun'),
            },
          ]} />
          {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ registro: null })}>Registrar</Button>}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>

          {/* KPIs + Donut */}
          {!historial && (
            <PanelEstadoFlota stats={stats} empresa={empresa.data ?? ''} />
          )}

          {/* Filtros + búsqueda */}
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            {!historial && FILTROS.map(f => {
              const colorMap: Record<string, string> = { 'Vencido': 'red', 'Por vencer': 'amber', 'Vigente': 'green', 'Sin datos': '' };
              const color = colorMap[f] || '';
              const cnt = f === 'Todos' ? stats.total
                : f === 'Vencido' ? stats.vencidos
                : f === 'Por vencer' ? stats.porVencer
                : f === 'Sin datos' ? stats.sinDatos
                : stats.vigentes;
              return (
                <button key={f} type="button"
                  className={`chip${filtro === f ? ' chip--active' : ''}`}
                  onClick={() => { haptic('selection'); cambiarFiltro(f); }}>
                  {color && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                    background: `var(--${color}-ink)`, marginRight: 4 }} />}
                  {f} <span className="chip__badge">{cnt}</span>
                </button>
              );
            })}
            <div style={{ marginLeft: 'auto', maxWidth: '16rem' }}>
              <SearchField value={busqueda} onChange={cambiarBusqueda} placeholder="Placa, tipo…" />
            </div>
          </div>

          {/* Tabla */}
          {vistaActual.length === 0 ? (
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
                <table className="inv-kardex" style={{ minWidth: '54rem' }}>
                  <thead>
                    <tr>
                      <th>Placa</th>
                      <th>Tipo MP</th>
                      <th>Modelo / UTS</th>
                      <th>Fecha</th>
                      <th style={{ textAlign: 'right' }}>Km cambio</th>
                      <th style={{ textAlign: 'right' }}>Km actual (GPS)</th>
                      <th style={{ textAlign: 'right' }}>Cuánto falta</th>
                      <th style={{ textAlign: 'right' }}>Km próx.</th>
                      <th style={{ textAlign: 'right' }}>Frecuencia</th>
                      <th>Estado</th>
                      <th>Obs.</th>
                      <th style={{ width: 64 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {vistaActual.map(f => {
                      const id    = frId(f);
                      const placa = frPlaca(f).toUpperCase();
                      const uts   = placasActivas?.get(placa)?.uts || frUts(f);
                      const kmC   = frKmCambio(f);
                      let   kmP   = frKmProx(f);
                      const frec  = frFrecuencia(f);
                      const esHoras = metricas.get(placa) === 'horas';
                      const kmG   = kmActual(f, esHoras, vivo);
                      const unidad  = esHoras ? 'h' : '';

                      if ((!kmP || kmP === 0) && frec > 0 && kmC > 0) kmP = kmC + frec;

                      const falta = kmG > 0 && kmP > 0
                        ? kmP - kmG
                        : kmP > 0 && kmC > 0 ? kmP - kmC : 0;

                      const est   = calcularEstado(f, uts, umbrales, metricas, vivo);
                      const color = estadoColor(est);

                      return (
                        <tr key={id || `${placa}-${frTipo(f)}`}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--label)' }}>
                            {placa}
                            {kmDiaTexto(kmDia?.get(placa), esHoras) && (
                              <span style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 500, color: 'var(--label-2)' }}>{kmDiaTexto(kmDia?.get(placa), esHoras)}</span>
                            )}
                          </td>
                          <td style={{ fontWeight: 600 }}>{frTipo(f)}</td>
                          <td style={{ color: 'var(--label-2)', fontSize: '0.8125rem' }}>
                            {uts || placasActivas?.get(placa)?.modelo || '—'}
                          </td>
                          <td style={{ color: 'var(--label-2)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                            {frFecha(f) || <span style={{ color: 'var(--label-3)' }}>Plan inicial</span>}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                            {kmC > 0 ? `${kmC.toLocaleString('es-PE')}${unidad}` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem',
                            color: kmG > 0 ? 'var(--label-1)' : 'var(--label-3)' }}>
                            {kmG > 0 ? `${kmG.toLocaleString('es-PE')}${unidad}` : '—'}
                          </td>
                          <td style={{
                            textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: falta < 0 ? 700 : undefined,
                            color: falta < 0 ? 'var(--red-ink)' : falta === 0 ? 'var(--label-3)' : falta <= 1000 ? 'var(--amber-ink)' : 'var(--green-ink)',
                          }}>
                            {falta !== 0
                              ? `${falta < 0 ? Math.abs(falta).toLocaleString('es-PE') + ' ↑' : falta.toLocaleString('es-PE')}${unidad}`
                              : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem',
                            color: est !== 'vigente' ? `var(--${color}-ink)` : undefined,
                            fontWeight: est !== 'vigente' ? 700 : undefined }}>
                            {kmP > 0 ? `${kmP.toLocaleString('es-PE')}${unidad}` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--label-2)' }}>
                            {frec > 0 ? `${frec.toLocaleString('es-PE')}${unidad}` : '—'}
                          </td>
                          <td>
                            <span className={`ot-estado ot-estado--${color}`}>{estadoLabel(est)}</span>
                          </td>
                          <td style={{ color: 'var(--label-2)', fontSize: '0.8125rem', maxWidth: '9rem',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {frObs(f) || '—'}
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {puedeEditar && (
                              <button type="button" title="Editar registro" aria-label={`Editar ${placa}`} onClick={() => setFormulario({ registro: f })}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--label-3)', padding: '2px 4px', lineHeight: 1 }}>
                                <Pencil size={15} />
                              </button>
                            )}
                            {puedeEliminar && <button
                              type="button"
                              title="Eliminar registro"
                              disabled={eliminando === id}
                              onClick={() => eliminarRegistro(f)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--label-3)', padding: '2px 4px', lineHeight: 1 }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--red-ink)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--label-3)')}
                            >
                              <Trash2 size={15} />
                            </button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPags > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', justifyContent: 'flex-end', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--label-2)' }}>
                    {(pagActual - 1) * POR_PAGINA + 1}–{Math.min(pagActual * POR_PAGINA, filtrados.length)} de {filtrados.length}
                  </span>
                  <button type="button" className="chip" disabled={pagActual <= 1}
                    onClick={() => setPagina(p => Math.max(1, p - 1))}>‹ Anterior</button>
                  <button type="button" className="chip" disabled={pagActual >= totalPags}
                    onClick={() => setPagina(p => Math.min(totalPags, p + 1))}>Siguiente ›</button>
                </div>
              )}
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
