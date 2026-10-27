import { Fragment, useMemo, useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, Bus, ChevronDown, ChevronRight, Clock, Columns3, Download, FileDown, FileSpreadsheet, Gauge, History, MessageCircle, Pencil, Plus, SearchX, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { DonaGrafico } from '../../core/ui/Graficos';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { exportarExcel } from '../../core/lib/excel';
import { compartirPDF } from '../../core/lib/pdf';
import { haptic } from '../../core/lib/haptics';
import { MOBILE_QUERY, useMediaQuery } from '../../core/lib/useMediaQuery';
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
import { abrirPdfEnVisor, nombreReportePreventivo, pedirReportePreventivo, tipoOracion, type FilaReporte } from './fleetrunReporte';
import './fleetrun-preventivo.css';

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

/** Umbral de aviso (km u horas) según la UTS; mismo valor por defecto que el clásico */
function umbralDe(uts: string, esHoras: boolean, umbrales: Record<string, number>): number {
  const utsU = uts.toUpperCase();
  const sufijo = esHoras ? '_HORAS' : '_KM';
  const configurado = umbrales[utsU + sufijo] ?? umbrales[utsU];
  if (configurado !== undefined) return configurado;
  if (utsU === 'NACIONAL') return 1500;
  if (utsU === 'LOCAL') return 100;
  return 1000;
}

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
  return kmRestante <= umbralDe(uts, esHoras, umbrales) ? 'por_vencer' : 'vigente';
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

/** Fecha del último cambio de aceite/filtro (MP1 o separador) por placa, en dd/mm/aaaa; "Plan inicial" si no hay */
function ultimoCambioPorPlaca(filas: FleetrunFila[]): Map<string, string> {
  const mejor = new Map<string, { ms: number; fecha: string }>();
  for (const f of filas) {
    const tipo = frTipo(f).toUpperCase();
    if (!(tipo.includes('MP1') || tipo.includes('SEPARADOR'))) continue;
    const placa = frPlaca(f).toUpperCase();
    const ms = parseFechaMs(frFecha(f));
    if (!ms) continue;
    const actual = mejor.get(placa);
    if (!actual || ms > actual.ms) mejor.set(placa, { ms, fecha: frFecha(f) });
  }
  const salida = new Map<string, string>();
  for (const [placa, v] of mejor) {
    const d = new Date(v.ms);
    salida.set(placa, `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
  }
  return salida;
}

// Km (u horas) por día de los últimos 30 días, según los snapshots del GPS
function kmDiaTexto(k: { km_dia: number | null; horas_dia: number | null } | undefined, horas: boolean): string {
  const v = k ? (horas ? k.horas_dia : k.km_dia) : null;
  return v != null && v > 0 ? `${Number(v).toLocaleString('es-PE')} ${horas ? 'h' : 'km'}/día` : '';
}

// Colores del gráfico y de los KPI (hex: el gráfico no lee variables CSS)
const COLOR_VENCIDO = '#dc2626';
const COLOR_POR_VENCER = '#d97706';
const COLOR_VIGENTE = '#16a34a';

function porcionesEstado(s: { vencidos: number; porVencer: number; vigentes: number }) {
  return [
    { nombre: 'Vencidos', valor: s.vencidos, color: COLOR_VENCIDO },
    { nombre: 'Por vencer', valor: s.porVencer, color: COLOR_POR_VENCER },
    { nombre: 'Vigentes', valor: s.vigentes, color: COLOR_VIGENTE },
  ];
}

/** Panel de estado de la flota: logo, empresa, fecha, dona y KPIs. Lo usan Fleetrun y el dashboard de taller. */
export function PanelEstadoFlota({ stats, empresa }: { stats: { total: number; vencidos: number; porVencer: number; vigentes: number }; empresa: string }) {
  return (
    <div className="prev-stats">
      <LogoEmpresa empresa={empresa} />
      <section className="mant-card">
        <DonaGrafico porciones={porcionesEstado(stats)} centro={String(stats.total)} altura={190} />
      </section>
    </div>
  );
}

// ─── Parseo de fecha, pantalla y filas ──────────────────────────────────────

const pildora = (fondo: string): CSSProperties => ({
  display: 'inline-block', fontSize: '0.6875rem', fontWeight: 700, padding: '2px 9px', borderRadius: 999,
  background: fondo, color: '#fff', whiteSpace: 'nowrap', letterSpacing: '0.02em',
});
const colorEstadoFila = (e: EstadoFR) => (e === 'sin_datos' ? 'var(--label-3)' : `var(--${estadoColor(e)}-ink)`);

/** Logo de la empresa, grande y centrado, con su nombre y la fecha */
function LogoEmpresa({ empresa }: { empresa: string }) {
  const fecha = new Date().toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' });
  return (
    <section className="mant-card prev-logo">
      <img src="/api/tenant-logo" alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      <div className="prev-logo__empresa">{empresa}</div>
      <span className="prev-logo__fecha">{fecha}</span>
    </section>
  );
}

/** Dona del estado de la flota con su leyenda alineada en columnas (número y porcentaje a la derecha) */
function DonaPreventivo({ stats }: { stats: { total: number; vencidos: number; porVencer: number; vigentes: number } }) {
  const porciones = porcionesEstado(stats);
  const pctDe = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0);
  const conDatos = porciones.filter(p => p.valor > 0).length;
  return (
    <div className="prev-dona__cuerpo">
      <div className="prev-dona__grafico">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={porciones} dataKey="valor" nameKey="nombre" innerRadius="64%" outerRadius="100%"
              paddingAngle={conDatos > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
              {porciones.map(p => <Cell key={p.nombre} fill={p.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <span className="prev-dona__centro">{stats.total}</span>
      </div>
      <ul className="prev-dona__leyenda">
        {porciones.map(p => (
          <li key={p.nombre}>
            <span className="prev-dona__punto" style={{ background: p.color }} />
            <span className="prev-dona__nombre">{p.nombre}</span>
            <span className="prev-dona__n">{p.valor}</span>
            <span className="prev-dona__pct">{pctDe(p.valor)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Estado de mantenimientos: logo, dona con su leyenda y KPI en cuadrícula */
function EstadoMantenimientos({ stats, empresa, filtrada }: { stats: { total: number; vencidos: number; porVencer: number; vigentes: number }; empresa: string; filtrada: boolean }) {
  const pct = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0);
  const kpis = [
    { label: 'Flota total', valor: stats.total, color: 'var(--label)', icono: <Bus size={18} />, nota: 'unidades activas' },
    { label: 'Vencidos', valor: stats.vencidos, color: COLOR_VENCIDO, icono: <AlertTriangle size={18} />, nota: `${pct(stats.vencidos)}% de la flota` },
    { label: 'Por vencer', valor: stats.porVencer, color: COLOR_POR_VENCER, icono: <Clock size={18} />, nota: `${pct(stats.porVencer)}% de la flota` },
    { label: 'Vigentes', valor: stats.vigentes, color: COLOR_VIGENTE, icono: <ShieldCheck size={18} />, nota: `${pct(stats.vigentes)}% de la flota` },
  ];
  return (
    <div className="prev-stats">
      <LogoEmpresa empresa={empresa} />
      <section className="mant-card prev-dona">
        <div className="prev-dona__cab">
          <span className="prev-dona__titulo"><Gauge size={15} /> Estado de mantenimientos</span>
          <span className="prev-chip">{filtrada ? 'Empresa filtrada' : 'Flota activa'}</span>
        </div>
        <DonaPreventivo stats={stats} />
      </section>
      <div className="prev-kpis">
        {kpis.map(k => (
          <article key={k.label} className="mant-card prev-kpi">
            <div className="prev-kpi__top">
              <span className="prev-kpi__label">{k.label}</span>
              <span className="prev-kpi__icono" style={{ color: k.color }}>{k.icono}</span>
            </div>
            <div className="prev-kpi__valor" style={{ color: k.color }}>{k.valor}</div>
          </article>
        ))}
      </div>
    </div>
  );
}

// ─── Columnas de la tabla (se pueden ocultar; la elección queda en este dispositivo) ───

type ColId = 'placa' | 'fecha' | 'modelo' | 'tipo' | 'kmCambio' | 'kmGps' | 'falta' | 'kmProx' | 'frec' | 'obs' | 'estado' | 'kmRec' | 'ubi';

const COLUMNAS: Array<{ id: ColId; titulo: string }> = [
  { id: 'placa', titulo: 'Placa' },
  { id: 'fecha', titulo: 'Fecha' },
  { id: 'modelo', titulo: 'Modelo' },
  { id: 'tipo', titulo: 'Tipo preventivo' },
  { id: 'kmCambio', titulo: 'Km cambio' },
  { id: 'kmGps', titulo: 'Km actual (GPS)' },
  { id: 'falta', titulo: 'Cuánto falta' },
  { id: 'kmProx', titulo: 'Km próximo' },
  { id: 'frec', titulo: 'Frecuencia' },
  { id: 'obs', titulo: 'Observación' },
  { id: 'estado', titulo: 'Estado' },
  { id: 'kmRec', titulo: 'Km recorrido' },
  { id: 'ubi', titulo: 'Ubicación' },
];

/** Ancho inicial de cada columna (px): lo bastante para el texto. El usuario lo ajusta arrastrando el borde del encabezado */
const ANCHO_COLUMNA: Record<ColId, number> = {
  placa: 104, fecha: 104, modelo: 136, tipo: 230, kmCambio: 116, kmGps: 128, falta: 116, kmProx: 120,
  frec: 110, obs: 200, estado: 116, kmRec: 116, ubi: 230,
};

/** Columnas con números: se muestran en fuente monoespaciada para que las cifras cuadren */
const NUMERICAS = new Set<ColId>(['kmCambio', 'kmGps', 'falta', 'kmProx', 'frec', 'kmRec']);

const CLAVE_COLUMNAS = 'fleet_preventivo_columnas_ocultas';

function leerColumnasOcultas(): Set<ColId> {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_COLUMNAS) || '[]') as ColId[];
    return new Set(guardado);
  } catch {
    return new Set();
  }
}

function guardarColumnasOcultas(ocultas: Set<ColId>) {
  try {
    localStorage.setItem(CLAVE_COLUMNAS, JSON.stringify([...ocultas]));
  } catch { /* sin almacenamiento: la elección dura lo que la pestaña */ }
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

export function FleetrunPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can, user } = useAuth();
  const puedeCrear = can('fleet.crear', 'fleetrun.crear');
  const puedeEditar = can('fleet.editar', 'fleetrun.editar');
  const puedeEliminar = can('fleet.eliminar', 'fleetrun.eliminar');
  const movil = useMediaQuery(MOBILE_QUERY);
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
  const [empresaFiltro, setEmpresaFiltro] = useState('Todas');
  const [historial, setHistorial] = useState(false);
  const [pagina, setPagina]       = useState(1);
  const [abiertas, setAbiertas]   = useState<Set<string>>(() => new Set());
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [ocultas, setOcultas]     = useState<Set<ColId>>(leerColumnasOcultas);
  const [editandoColumnas, setEditandoColumnas] = useState(false);
  const [generando, setGenerando] = useState<'pdf' | 'whatsapp' | null>(null);

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

  const clienteDe = (placa: string) => placasActivas?.get(placa.toUpperCase())?.cliente ?? '';

  // Registros de la empresa elegida (la dona y los KPI se calculan sobre ellos)
  const filasEmpresa = useMemo(
    () => (empresaFiltro === 'Todas' ? filas : filas.filter(f => clienteDe(frPlaca(f)) === empresaFiltro)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, empresaFiltro, placasActivas],
  );

  const ultimoCambio = useMemo(() => ultimoCambioPorPlaca(filas), [filas]);

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

  // KPIs de la flota (de la empresa elegida): misma función que el dashboard de taller
  const stats = useMemo(() => resumenPreventivo(filasEmpresa, placasData, umbrales, metricas, vivo), [filasEmpresa, placasData, umbrales, metricas, vivo]);

  // Registros del estado elegido (sin la empresa ni la búsqueda): de aquí salen las empresas del filtro
  const porEstado = useMemo(() => {
    if (filtro === 'Todos') return datosVista;
    const LABEL_A_ESTADO: Record<string, EstadoFR> = {
      'Vencido': 'vencido', 'Por vencer': 'por_vencer', 'Vigente': 'vigente', 'Sin datos': 'sin_datos',
    };
    const target = LABEL_A_ESTADO[filtro];
    return datosVista.filter(f => {
      const placa = frPlaca(f).toUpperCase();
      const uts   = placasActivas?.get(placa)?.uts || frUts(f);
      return calcularEstado(f, uts, umbrales, metricas, vivo) === target;
    });
  }, [datosVista, filtro, placasActivas, umbrales, metricas, vivo]);

  // Solo las empresas que tienen registros en la lista que se ve
  const empresas = useMemo(() => {
    const set = new Set<string>();
    for (const f of porEstado) {
      const cliente = clienteDe(frPlaca(f));
      if (cliente) set.add(cliente);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [porEstado, placasActivas]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtrado final: empresa elegida (si sigue en la lista) y búsqueda
  const empresaActiva = empresaFiltro === 'Todas' || empresas.includes(empresaFiltro) ? empresaFiltro : 'Todas';
  const filtrados = useMemo(() => {
    let lista = porEstado;
    if (empresaActiva !== 'Todas') lista = lista.filter(f => clienteDe(frPlaca(f)) === empresaActiva);
    if (busqueda) {
      const q = busqueda.toUpperCase();
      lista = lista.filter(f =>
        frPlaca(f).toUpperCase().includes(q) ||
        frTipo(f).toUpperCase().includes(q)  ||
        frUts(f).toUpperCase().includes(q),
      );
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porEstado, empresaActiva, busqueda, placasActivas]);

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

  const columnasVisibles = COLUMNAS.filter(c => !ocultas.has(c.id));
  const columnasTabla: ColumnaTabla[] = [
    ...columnasVisibles.map(c => ({ id: c.id, titulo: c.titulo, ancho: ANCHO_COLUMNA[c.id], minimo: 72, alinear: 'center' as const })),
    { id: 'acciones', titulo: '', ancho: 84, minimo: 84, alinear: 'center' as const },
  ];

  function cambiarFiltro(f: string) { setFiltro(f); setPagina(1); }
  function cambiarBusqueda(v: string) { setBusqueda(v); setPagina(1); }
  function cambiarEmpresa(v: string) { setEmpresaFiltro(v); setPagina(1); }
  function alternarGrupo(placa: string) {
    haptic('selection');
    setAbiertas(prev => { const n = new Set(prev); if (n.has(placa)) n.delete(placa); else n.add(placa); return n; });
  }
  function alternarColumna(id: ColId) {
    setOcultas(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      guardarColumnasOcultas(n);
      return n;
    });
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
      tipo: tipoOracion(frTipo(f)), fecha: frFecha(f), obs: frObs(f),
    };
  }

  /** Filas del reporte F-MAN-006: las visibles con su km, umbral y última fecha de cambio */
  function filasReporte(): FilaReporte[] {
    return filtrados.map(f => {
      const d = datosFila(f);
      const placaInfo = placasActivas?.get(d.placa);
      return {
        placa: d.placa,
        cliente: placaInfo?.cliente || '',
        clase: placaInfo?.tipo || placaInfo?.subTipo || 'CAMIÓN',
        marca: placaInfo?.marca || String(f[5] ?? ''),
        uts: d.uts,
        tipo: frTipo(f),
        fecha: d.fecha,
        kmCambio: d.kmC,
        kmGps: d.kmG,
        kmProx: d.kmP,
        frecuencia: d.frec,
        obs: d.obs,
        ubicacion: d.ubicacion || 'En Ruta',
        esHoras: d.esHoras,
        umbral: umbralDe(d.uts, d.esHoras, umbrales),
        ultimoCambio: ultimoCambio.get(d.placa) || 'Plan inicial',
      };
    });
  }

  async function generarReporte(tipo: 'pdf' | 'whatsapp') {
    setGenerando(tipo);
    try {
      const generar = () => pedirReportePreventivo(filasReporte(), empresa.data ?? '', user?.email ?? '');
      if (tipo === 'pdf') {
        await abrirPdfEnVisor(generar, nombreReportePreventivo());
      } else {
        const r = await compartirPDF(await generar(), nombreReportePreventivo(), 'Estatus de mantenimientos preventivos · F-MAN-006');
        if (r === 'descargado') toast('PDF descargado. Adjúntalo en la conversación de WhatsApp.');
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setGenerando(null);
    }
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

  // ─── Celdas de un registro (tabla y tarjetas usan los mismos datos) ──────────

  function valorColumna(id: ColId, d: ReturnType<typeof datosFila>): ReactNodeLike {
    switch (id) {
      case 'placa': return <span className="prev-placa">{d.placa}</span>;
      case 'fecha': return d.fecha ? d.fecha : <span className="prev-muted">Plan inicial</span>;
      case 'modelo': return d.modelo || '—';
      case 'tipo': return <strong>{d.tipo}</strong>;
      case 'kmCambio': return d.kmC > 0 ? `${d.kmC.toLocaleString('es-PE')}${d.unidad}` : '—';
      case 'kmGps': return d.kmG > 0 ? `${d.kmG.toLocaleString('es-PE')}${d.unidad}` : '—';
      case 'falta': return (
        <span style={{ fontWeight: d.falta < 0 ? 700 : undefined, color: d.falta < 0 ? 'var(--red-ink)' : d.falta === 0 ? 'var(--label-3)' : 'var(--label-1)' }}>
          {d.falta !== 0 ? `${d.falta.toLocaleString('es-PE')}${d.unidad}` : '—'}
        </span>
      );
      case 'kmProx': return d.kmP > 0 ? `${d.kmP.toLocaleString('es-PE')}${d.unidad}` : '—';
      case 'frec': return d.frec > 0 ? `${d.frec.toLocaleString('es-PE')}${d.unidad}` : '—';
      case 'obs': return d.obs || '—';
      case 'estado': return <span style={pildora(colorEstadoFila(d.est))}>{estadoLabel(d.est).toUpperCase()}</span>;
      case 'kmRec': return d.kmRec > 0 ? `${d.kmRec.toLocaleString('es-PE')}${d.unidad}` : '—';
      case 'ubi': return d.ubicacion || '—';
    }
  }

  function accionesRegistro(f: FleetrunFila, placa: string, eliminandoId: string) {
    return (
      <>
        {puedeEditar && (
          <button type="button" className="prev-accion" title="Editar registro" aria-label={`Editar ${placa}`} onClick={() => setFormulario({ registro: f })}>
            <Pencil size={15} />
          </button>
        )}
        {puedeEliminar && (
          <button type="button" className="prev-accion prev-accion--peligro" title="Eliminar registro" aria-label={`Eliminar ${placa}`}
            disabled={eliminando === eliminandoId} onClick={() => eliminarRegistro(f)}>
            <Trash2 size={15} />
          </button>
        )}
      </>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const opcionesFiltro: Array<{ value: string; label: string }> = [
    { value: 'Todos', label: 'Todos' },
    { value: 'Vigente', label: 'Vigentes' },
    { value: 'Por vencer', label: 'Por Vencer' },
    { value: 'Vencido', label: 'Vencidos' },
    ...(stats.sinDatos > 0 ? [{ value: 'Sin datos', label: 'Sin datos' }] : []),
  ];

  const sinRegistros = grupos.length === 0;

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
        <div className="prev-page">

          {/* Logo, dona con su leyenda y KPI (formato del clásico) */}
          {!historial && <EstadoMantenimientos stats={stats} empresa={empresa.data ?? ''} filtrada={empresaFiltro !== 'Todas'} />}

          {/* Filtros, búsqueda y herramientas */}
          <div className="prev-barra">
            {!historial && (
              <div className="prev-barra__estado">
                <SegmentedControl value={filtro} onChange={cambiarFiltro} label="Filtrar por estado" options={opcionesFiltro} />
              </div>
            )}
            {!historial && (
              <div className="prev-barra__empresa">
                <SelectInput aria-label="Filtrar por empresa" value={empresaActiva} onChange={e => cambiarEmpresa(e.target.value)}>
                  <option value="Todas">Todas las empresas</option>
                  {empresas.map(e => <option key={e} value={e}>{e}</option>)}
                </SelectInput>
              </div>
            )}
            <div className="prev-barra__der">
              <div className="prev-barra__buscar">
                <SearchField value={busqueda} onChange={cambiarBusqueda} placeholder="Buscar placa, modelo, tipo…" />
              </div>
              <Button variant={historial ? 'primary' : 'secondary'} icon={<History size={16} />}
                onClick={() => { setHistorial(h => !h); setPagina(1); setBusqueda(''); setFiltro('Todos'); }}>Historial</Button>
              {puedeCrear && <Button variant="secondary" icon={<Upload size={16} />} onClick={() => setImportando(true)}>Importar</Button>}
              <Button variant="secondary" icon={<Download size={16} />} onClick={exportar}>Exportar</Button>
              <Button variant="secondary" className="btn--icono" icon={<Columns3 size={17} />} aria-label="Elegir columnas" title="Elegir columnas"
                onClick={() => setEditandoColumnas(true)} disabled={movil} />
              <Button variant="secondary" className="btn--icono" icon={<FileDown size={17} />} aria-label="Descargar PDF del reporte" title="Descargar PDF del reporte"
                disabled={historial || generando !== null || !filtrados.length} onClick={() => generarReporte('pdf')} />
              <Button variant="secondary" className="btn--icono btn--icono-whatsapp" icon={<MessageCircle size={17} />} aria-label="Enviar reporte por WhatsApp" title="Enviar reporte por WhatsApp"
                disabled={historial || generando !== null || !filtrados.length} onClick={() => generarReporte('whatsapp')} />
            </div>
          </div>

          {/* Tabla agrupada por placa (en celular, tarjetas) */}
          {sinRegistros ? (
            <EmptyState
              icon={busqueda ? <SearchX size={22} /> : <Gauge size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin registros'}
            >
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => cambiarBusqueda('')}>Quitar búsqueda</button>
                : 'Los registros de mantenimiento preventivo aparecerán aquí.'}
            </EmptyState>
          ) : movil ? (
            <div className="prev-cards">
              {vistaGrupos.map(g => {
                const abierta = abiertas.has(g.placa);
                const esHoras = metricas.get(g.placa) === 'horas';
                const cliente = placasActivas?.get(g.placa)?.cliente ?? '';
                const uts = placasActivas?.get(g.placa)?.uts || frUts(g.registros[0]);
                const kmDiaT = kmDiaTexto(kmDia?.get(g.placa), esHoras);
                return (
                  <article key={g.placa} className="prev-card">
                    <button type="button" className="prev-card__cab" aria-expanded={abierta} onClick={() => alternarGrupo(g.placa)}>
                      <span className="prev-placa">{g.placa}</span>
                      <span className="prev-card__info">
                        {cliente && <span className="prev-card__cliente">{cliente}</span>}
                        <span className="prev-card__meta">{uts}{kmDiaT ? ` · ${kmDiaT}` : ''}</span>
                      </span>
                      <span className="prev-card__cuenta">{g.registros.length}</span>
                      {abierta ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                    {abierta && g.registros.map(f => {
                      const d = datosFila(f);
                      return (
                        <div key={d.id || `${d.placa}-${d.tipo}-${d.fecha}`} className="prev-reg">
                          <div className="prev-reg__top">
                            <strong className="prev-reg__tipo">{d.tipo}</strong>
                            <span style={pildora(colorEstadoFila(d.est))}>{estadoLabel(d.est).toUpperCase()}</span>
                          </div>
                          <dl className="prev-reg__datos">
                            <div><dt>Fecha</dt><dd>{valorColumna('fecha', d)}</dd></div>
                            <div><dt>Modelo</dt><dd>{valorColumna('modelo', d)}</dd></div>
                            <div><dt>Km cambio</dt><dd>{valorColumna('kmCambio', d)}</dd></div>
                            <div><dt>Km GPS</dt><dd>{valorColumna('kmGps', d)}</dd></div>
                            <div><dt>Cuánto falta</dt><dd>{valorColumna('falta', d)}</dd></div>
                            <div><dt>Km próximo</dt><dd>{valorColumna('kmProx', d)}</dd></div>
                            <div><dt>Frecuencia</dt><dd>{valorColumna('frec', d)}</dd></div>
                            <div><dt>Km recorrido</dt><dd>{valorColumna('kmRec', d)}</dd></div>
                          </dl>
                          {d.obs && <p className="prev-reg__obs">{d.obs}</p>}
                          <div className="prev-reg__acciones">{accionesRegistro(f, d.placa, d.id)}</div>
                        </div>
                      );
                    })}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="prev-tabla-marco">
            <TablaRedimensionable id="preventivo-tabla" columnas={columnasTabla} ariaLabel="Mantenimiento preventivo por placa" altoMax="72vh">
              {vistaGrupos.map(g => {
                const abierta = abiertas.has(g.placa);
                const esHoras = metricas.get(g.placa) === 'horas';
                const kmDiaT = kmDiaTexto(kmDia?.get(g.placa), esHoras);
                const cliente = placasActivas?.get(g.placa)?.cliente ?? '';
                const uts = placasActivas?.get(g.placa)?.uts || frUts(g.registros[0]);
                return (
                  <Fragment key={g.placa}>
                    <tr className="prev-grupo" onClick={() => alternarGrupo(g.placa)} aria-expanded={abierta}>
                      <td colSpan={columnasTabla.length}>
                        <div className="prev-grupo__cab">
                          {abierta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          <span className="prev-placa">{g.placa}</span>
                          {cliente && <span style={pildora('#475569')}>{cliente}</span>}
                          {uts && <span style={pildora('#0891b2')}>{uts}</span>}
                          {kmDiaT && <span className="prev-muted">{kmDiaT}</span>}
                          <span style={{ ...pildora('#d97706'), marginLeft: 'auto' }}>{g.registros.length} registros</span>
                        </div>
                      </td>
                    </tr>
                    {abierta && g.registros.map(f => {
                      const d = datosFila(f);
                      return (
                        <tr key={d.id || `${d.placa}-${d.tipo}-${d.fecha}`} className="prev-fila">
                          {columnasVisibles.map(c => (
                            <Celda key={c.id} alinear="center" mono={NUMERICAS.has(c.id)}>
                              {valorColumna(c.id, d)}
                            </Celda>
                          ))}
                          <Celda alinear="center">
                            <div className="prev-acciones">{accionesRegistro(f, d.placa, d.id)}</div>
                          </Celda>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </TablaRedimensionable>
            </div>
          )}

          {/* Paginación */}
          {!sinRegistros && (
            <div className="prev-pie">
              <span className="prev-muted">
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
          )}
        </div>
      )}

      <Sheet open={editandoColumnas} onClose={() => setEditandoColumnas(false)} title="Columnas de la tabla">
        <div className="prev-cols">
          {COLUMNAS.map(c => (
            <label key={c.id} className="prev-col">
              <input type="checkbox" checked={!ocultas.has(c.id)} onChange={() => alternarColumna(c.id)} />
              <span>{c.titulo}</span>
            </label>
          ))}
        </div>
      </Sheet>

      <FleetrunFormulario open={!!formulario} registro={formulario?.registro ?? null} usuario={user?.email ?? ''} onClose={() => setFormulario(null)} />
      <ImportarFleetrunSheet open={importando} onClose={() => setImportando(false)} />
    </Page>
  );
}

// Tipo auxiliar para las celdas (cualquier nodo de React)
type ReactNodeLike = import('react').ReactNode;

// Estado preventivo por placa (el peor de sus registros), con la misma regla que esta pantalla. Lo usa el dashboard de taller.
export function useFleetrunStats() {
  const { data } = useFleetrun();
  const { data: placasData } = usePlacas();
  const { data: metricas = new Map<string, string>() } = useMetricas();
  const { data: umbrales = {} } = useFleetrunUmbrales();
  const vivo = useKmVivo();
  return useMemo(() => resumenPreventivo(data ?? [], placasData, umbrales, metricas, vivo), [data, placasData, metricas, umbrales, vivo]);
}
