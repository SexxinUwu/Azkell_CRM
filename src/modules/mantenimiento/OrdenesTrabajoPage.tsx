import { formatFechaPe, formatSoles } from '../../core/lib/format';
import './mant.css';
import '../almacen/almacen.css'; // estilos de tabla (.inv-kardex) que usa la lista de OT
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, BookOpen, CheckCircle2, Eye, Filter, Lock, Pause, Play, Plus, ScrollText, SearchX, Trash2, XCircle } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { ChoiceChips } from '../../core/ui/Chips';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { MOBILE_QUERY, useMediaQuery } from '../../core/lib/useMediaQuery';
import { CerrarOTSheet, PausarOTSheet } from './OTAcciones';
import { haptic } from '../../core/lib/haptics';
import { ejecutarAccionOT, eliminarOT, otDetalles, otFecha, otId, otTipo, useOrdenesTrabajoData, type AccionOT, type DetallesOT, type OrdenTrabajo } from './api';
import { ETIQUETA_ACCION, OTDetalle } from './OTDetalle';
import { exportarReportesOT } from './exportarOT';
import { abrirPdfReportesOT } from './exportarPDFOT';
import { LogoArchivo } from './NeumaticosRequerimiento';

// ─── Tipos adicionales ────────────────────────────────────────────────────────

/** Kilometraje o horas de motor de la OT, igual que la pantalla clásica: si tiene horas de motor, se muestran en hrs */
function kmOHoras(det: DetallesOT): string {
  if (det.horas_motor) {
    const h = Number(det.horas_motor);
    return `${isNaN(h) ? String(det.horas_motor) : h.toLocaleString('es-PE')} hrs`;
  }
  const km = Number(det.km_ingreso ?? det.km ?? 0);
  return km > 0 ? `${km.toLocaleString('es-PE')} km` : '—';
}

interface BacklogItem {
  id: number;
  backlog_id: string;
  placa: string;
  km: number | null;
  tema: string | null;
  tarea: string;
  reportado_por: string | null;
  fecha_reporte: string | null;
  estado: string;
  ticket_ot: string | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function usePlacasLista() {
  return useQuery<string[]>({
    queryKey: ['placas-lista'],
    queryFn: () => api<{ data?: string[] }>('/placas-lista').then(r => r.data ?? []),
    staleTime: 300_000,
  });
}

function useBacklog(placa?: string) {
  return useQuery<BacklogItem[]>({
    queryKey: ['mant', 'ot-backlog', placa],
    queryFn: () => {
      const params = placa ? `?placa=${encodeURIComponent(placa)}` : '';
      return api<BacklogItem[]>(`/ot-backlog${params}`);
    },
    staleTime: 30_000,
  });
}

// ─── Constantes ───────────────────────────────────────────────────────────────


// Pestañas de estado (igual que el clásico). 'Todas' no filtra por estado.
const ESTADOS_PESTANA: Record<string, readonly string[]> = {
  Pendientes: ['Pendiente'],
  'En Proceso': ['En Proceso', 'Pausada'],
  Finalizadas: ['Finalizado', 'Cerrada'],
};
const PESTANAS_OT: Array<{ clave: string; etiqueta: string }> = [
  { clave: 'Todas', etiqueta: 'Todos' },
  { clave: 'Pendientes', etiqueta: 'Pendientes' },
  { clave: 'En Proceso', etiqueta: 'En Proceso' },
  { clave: 'Finalizadas', etiqueta: 'Finalizadas' },
];

/** Hoy en Lima (AAAA-MM-DD) */
const hoyLima = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
/** Último día del mes AAAA-MM */
const finDeMes = (mes: string) => { const [a, m] = mes.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };

// ─── Componente principal ─────────────────────────────────────────────────────

/** Acciones de la fila según el estado, como rotBotonesAccion del clásico. Finalizada muestra Reactivar junto a la píldora. */
function AccionesFila({ estado, onAccion, disabled }: { estado: string; onAccion: (a: AccionOT) => void; disabled: boolean }) {
  const boton = (accion: AccionOT, Icono: typeof Play, texto: string) => (
    <button type="button" disabled={disabled} onClick={() => onAccion(accion)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 12px', marginRight: 6, borderRadius: 999, border: '1px solid var(--separator)', background: 'var(--surface)', color: 'var(--label)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
      <Icono size={14} />{texto}
    </button>
  );
  const pildora = (Icono: typeof Play, texto: string, color: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', marginRight: 6, borderRadius: 999, background: color, color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>
      <Icono size={13} />{texto}
    </span>
  );
  if (estado === 'En Proceso') return <>{boton('pausar', Pause, 'Pausar')}{boton('cerrar', Lock, 'Cerrar')}</>;
  if (estado === 'Pausada') return <>{boton('reanudar', Play, 'Reanudar')}{boton('cerrar', Lock, 'Cerrar')}</>;
  if (estado === 'Finalizado' || estado === 'Cerrada') return pildora(CheckCircle2, 'Finalizado', 'var(--green-ink)');
  if (estado === 'Anulado') return pildora(XCircle, 'Anulado', 'var(--label-3)');
  return boton('iniciar', Play, 'Iniciar');
}

export function OrdenesTrabajoPage() {
  const location = useLocation();
  const { data, isLoading, isError, error } = useOrdenesTrabajoData();
  const { can, user } = useAuth();
  const esMovil = useMediaQuery(MOBILE_QUERY);
  const qc    = useQueryClient();
  const toast = useToast();

  const { data: placas }    = usePlacasLista();

  // ?tab=backlog abre directamente la pestaña de Backlog (enlace desde el menú)
  const [tab, setTab]           = useState<'OTs' | 'Backlog'>(() => (location.search.includes('tab=backlog') ? 'Backlog' : 'OTs'));
  useEffect(() => { if (location.search.includes('tab=backlog')) setTab('Backlog'); }, [location.search]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('Todas');
  const [fOT, setFOT]           = useState('');
  const [fPlaca, setFPlaca]     = useState('');
  const [fMes, setFMes]         = useState('');
  const [fDesde, setFDesde]     = useState('');
  const [fHasta, setFHasta]     = useState('');
  const [panelFiltros, setPanelFiltros] = useState(false);
  const [seleccionada, setSeleccionada] = useState<OrdenTrabajo | null>(null);
  const [confirmando, setConfirmando]   = useState<{ accion: AccionOT; ot: OrdenTrabajo } | null>(null);
  // Pausar y Cerrar usan sus modales (motivo y checklist), como el clásico
  const [accionSheet, setAccionSheet] = useState<{ accion: 'pausar' | 'cerrar'; ot: OrdenTrabajo } | null>(null);
  const abrirAccion = (accion: AccionOT, ot: OrdenTrabajo) => {
    if (accion === 'pausar' || accion === 'cerrar') setAccionSheet({ accion, ot });
    else setConfirmando({ accion, ot });
  };
  const [eliminando, setEliminando]     = useState<OrdenTrabajo | null>(null);
  const [ejecutando, setEjecutando]     = useState(false);


  // Modal crear backlog
  const [modalBK, setModalBK]   = useState(false);
  const [guardandoBK, setGuardandoBK] = useState(false);
  const [bkPlaca, setBkPlaca]   = useState('');
  const [bkTarea, setBkTarea]   = useState('');
  const [bkTema, setBkTema]     = useState('');
  const [bkKm, setBkKm]         = useState('');
  const [bkReportado, setBkReportado] = useState('');

  const ots = data ?? [];

  // Desde el dashboard: [N] abre la hoja de nueva OT y "Ver OT" abre esa OT. El estado de navegación
  // se limpia con replace para que la acción no se repita al recargar o volver atrás.
  const navegar = useNavigate();
  const [otPorAbrir, setOtPorAbrir] = useState<string | null>(null);
  useEffect(() => {
    const st = location.state as { abrirOT?: string } | null;
    if (!st?.abrirOT) return;
    setOtPorAbrir(st.abrirOT);
    navegar(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navegar]);
  useEffect(() => {
    if (!otPorAbrir || !data) return;
    const ot = data.find(o => otId(o) === otPorAbrir);
    if (ot) setSeleccionada(ot);
    setOtPorAbrir(null);
  }, [otPorAbrir, data]);

  const estadosFiltro: readonly string[] | null = ESTADOS_PESTANA[filtroEstado] ?? null;

  // Rango de fechas: con mes o rango elegido, ese manda. Si no hay: 'Todos' y 'Finalizadas' muestran solo hoy;
  // 'Pendientes' y 'En Proceso' muestran desde la fecha del más antiguo de su estado hasta hoy.
  const rango = useMemo(() => {
    const hoy = hoyLima();
    if (fDesde || fHasta || fMes) {
      return { desde: fDesde || (fMes ? fMes + '-01' : ''), hasta: fHasta || (fMes ? finDeMes(fMes) : hoy) };
    }
    const est = filtroEstado === 'Pendientes' || filtroEstado === 'En Proceso' ? ESTADOS_PESTANA[filtroEstado] : undefined;
    if (est) {
      const fechas = ots.filter(o => est.includes(o.estado)).map(otFecha).filter(f => f !== '—').sort();
      return { desde: fechas[0] ?? hoy, hasta: hoy };
    }
    return { desde: hoy, hasta: hoy };
  }, [fDesde, fHasta, fMes, filtroEstado, ots]);

  const visibles = useMemo(() => ots.filter(o => {
    const passEstado = !estadosFiltro || estadosFiltro.includes(o.estado);
    if (!passEstado) return false;
    const fecha = otFecha(o);
    if (fecha === '—' || fecha < rango.desde || fecha > rango.hasta) return false;
    if (fOT && !otId(o).toUpperCase().includes(fOT.toUpperCase())) return false;
    if (fPlaca && !(o.placa ?? '').toUpperCase().includes(fPlaca.toUpperCase())) return false;
    if (!busqueda) return true;
    const q = busqueda.toUpperCase();
    return (
      otId(o).toUpperCase().includes(q) ||
      (o.placa ?? '').toUpperCase().includes(q) ||
      (o.tecnico ?? '').toUpperCase().includes(q) ||
      (o.supervisor ?? '').toUpperCase().includes(q) ||
      otTipo(o).toUpperCase().includes(q)
    );
  }), [ots, filtroEstado, busqueda, rango, fOT, fPlaca, estadosFiltro]);

  const textoFiltros = (): string[] => {
    const t: string[] = [];
    if (busqueda) t.push('Búsqueda: ' + busqueda);
    if (fOT) t.push('N° OT: ' + fOT);
    if (fPlaca) t.push('Placa: ' + fPlaca);
    t.push('Estado: ' + (PESTANAS_OT.find(p => p.clave === filtroEstado)?.etiqueta ?? 'Todos'));
    t.push('Desde: ' + rango.desde + '  Hasta: ' + rango.hasta);
    return t;
  };


  async function ejecutar(accion: AccionOT, ot: OrdenTrabajo) {
    setEjecutando(true);
    try {
      await ejecutarAccionOT(otId(ot), accion);
      toast('OT actualizada');
      haptic('success');
      setSeleccionada(null);
      setConfirmando(null);
      await qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setEjecutando(false);
    }
  }

  async function confirmarEliminar() {
    if (!eliminando) return;
    setEjecutando(true);
    try {
      await eliminarOT(otId(eliminando));
      toast('OT eliminada');
      haptic('success');
      if (seleccionada && otId(seleccionada) === otId(eliminando)) setSeleccionada(null);
      setEliminando(null);
      await qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setEjecutando(false);
    }
  }

  async function crearBacklog() {
    if (!bkPlaca || !bkTarea) { toast('Placa y tarea son requeridos', 'error'); return; }
    setGuardandoBK(true);
    try {
      await api('/ot-backlog', {
        method: 'POST',
        body: {
          placa:        bkPlaca.toUpperCase(),
          tarea:        bkTarea,
          tema:         bkTema || undefined,
          km:           bkKm ? Number(bkKm) : undefined,
          reportado_por: bkReportado || undefined,
          estado:       'Pendiente',
        },
      });
      toast('Ítem de backlog creado');
      setModalBK(false);
      setBkPlaca(''); setBkTarea(''); setBkTema(''); setBkKm(''); setBkReportado('');
      qc.invalidateQueries({ queryKey: ['mant', 'ot-backlog'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setGuardandoBK(false);
    }
  }

  const puedeEditar  = can('ot.e') || can('reportes_ot.e');
  const puedeEliminar = can('ot.d') || can('reportes_ot.d');
  // Se busca la OT en los datos actuales: el detalle refleja pausas y cierres tras cada acción
  const otActual = seleccionada ? (ots.find(o => otId(o) === otId(seleccionada)) ?? seleccionada) : null;
  const soloDetalle  = !!otActual;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Page>
      {!soloDetalle && (
        <PageHeader
          eyebrow="Mantenimiento"
          title={tab === 'Backlog' ? 'Backlog pendientes' : 'Órdenes de trabajo'}
          subtitle={tab === 'Backlog' ? 'Averías reportadas que aún no tienen OT' : 'Órdenes de trabajo, seguimiento técnico y registro de mantenimiento'}
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {tab === 'Backlog' && (
                <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setModalBK(true)}>
                  Agregar tarea
                </Button>
              )}
              <Button variant="secondary" iconOnly icon={<LogoArchivo tipo="excel" />} disabled={visibles.length === 0}
                aria-label="Exportar a Excel" title="Exportar a Excel" style={{ minHeight: 44, minWidth: 44 }}
                onClick={async () => { try { await exportarReportesOT(visibles); haptic('success'); } catch (err) { toast(errorMessage(err), 'error'); } }} />
              <Button variant="secondary" iconOnly icon={<LogoArchivo tipo="pdf" />} disabled={visibles.length === 0}
                aria-label="Abrir PDF" title="Abrir PDF" style={{ minHeight: 44, minWidth: 44 }}
                onClick={() => abrirPdfReportesOT(visibles, textoFiltros()).catch(err => toast(errorMessage(err), 'error'))} />
            </div>
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : otActual ? (
        <OTDetalle
          ot={otActual}
          onVolver={() => setSeleccionada(null)}
          puedeEditar={puedeEditar}
          puedeEliminar={puedeEliminar}
          onAccion={(accion) => abrirAccion(accion, otActual)}
          onEliminar={() => setEliminando(otActual)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {/* Resumen del listado (como el clásico): total, correctivos, preventivos y costo */}
          {tab === 'OTs' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: 'var(--s-2)' }}>
              {[
                { t: 'Total órdenes', v: String(visibles.length), c: 'var(--label)' },
                { t: 'Correctivos', v: String(visibles.filter(o => String(otDetalles(o).tipo_ot ?? '').toLowerCase() === 'correctivo').length), c: 'var(--red-ink)' },
                { t: 'Preventivos', v: String(visibles.filter(o => String(otDetalles(o).tipo_ot ?? '').toLowerCase() === 'preventivo').length), c: 'var(--green-ink)' },
                { t: 'Costo total', v: formatSoles(visibles.reduce((sum, o) => sum + (Number(o.costo_total_pen ?? o.costo_total ?? 0) || 0), 0)), c: 'var(--accent)' },
              ].map(k => (
                <div key={k.t} className="card" style={{ padding: 'var(--s-3)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', fontWeight: 600 }}>{k.t}</div>
                  <div style={{ fontSize: '1.375rem', fontWeight: 700, color: k.c, fontFamily: 'var(--font-mono)' }}>{k.v}</div>
                </div>
              ))}
            </div>
          )}

          {tab === 'OTs' ? (
            <>
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="OT, placa, técnico…" />

              <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                <ChoiceChips<string>
                  label="Estado de la OT"
                  value={filtroEstado}
                  onChange={setFiltroEstado}
                  options={PESTANAS_OT.map(p => ({ value: p.clave, label: p.etiqueta }))}
                />
                <Button variant={panelFiltros ? 'primary' : 'secondary'} size="sm" icon={<Filter size={14} />} onClick={() => setPanelFiltros(v => !v)}>Filtros</Button>
              </div>
              {panelFiltros && (
                <div className="card" style={{ padding: 'var(--s-3)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: 'var(--s-2)', alignItems: 'end' }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)' }}>N° ORDEN
                    <input value={fOT} onChange={e => setFOT(e.target.value)} placeholder="Ej. OT-2026-0001" style={{ minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid var(--separator)' }} />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)' }}>PLACA
                    <input value={fPlaca} onChange={e => setFPlaca(e.target.value.toUpperCase())} placeholder="Ej. A1B-234" style={{ minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid var(--separator)' }} />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)' }}>MES
                    <input type="month" value={fMes} onChange={e => { setFMes(e.target.value); setFDesde(''); setFHasta(''); }} style={{ minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid var(--separator)' }} />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)' }}>DESDE
                    <input type="date" value={fDesde || rango.desde} onChange={e => { setFDesde(e.target.value); setFMes(''); }} style={{ minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid var(--separator)' }} />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)' }}>HASTA
                    <input type="date" value={fHasta || rango.hasta} onChange={e => { setFHasta(e.target.value); setFMes(''); }} style={{ minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid var(--separator)' }} />
                  </label>
                  <Button variant="secondary" icon={<Trash2 size={14} />} onClick={() => { setFOT(''); setFPlaca(''); setFMes(''); setFDesde(''); setFHasta(''); }}>Limpiar filtros</Button>
                </div>
              )}

              {visibles.length === 0 ? (
                <EmptyState icon={busqueda || filtroEstado !== 'Todas' ? <SearchX size={22} /> : <ScrollText size={22} />}
                  title={busqueda || filtroEstado !== 'Todas' ? 'Sin coincidencias' : 'Sin órdenes de trabajo'}>
                  {(busqueda || filtroEstado !== 'Todas')
                    ? <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setFiltroEstado('Todas'); }}>Quitar filtros</button>
                    : null}
                </EmptyState>
              ) : (
                <>
                {esMovil ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {visibles.map(o => {
                      const det = otDetalles(o);
                      const obs = String(det.motivo ?? o.observaciones ?? '')
                        .replace(/\[[^\]]*\]\s*/g, '')
                        .replace(/•\s*/g, '')
                        .replace(/(falla manual|manual)\s*:\s*/gi, '')
                        .trim();
                      return (
                        <div key={otId(o)} onClick={() => { haptic('selection'); setSeleccionada(o); }}
                          style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>{otId(o)}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--label-2)' }}>{otFecha(o)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem' }}>{o.placa}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green-ink)' }}>{formatSoles(Number(o.costo_total_pen ?? o.costo_total ?? 0) || 0)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--label-2)' }}>
                            {otTipo(o)}{kmOHoras(det) !== '—' ? ` · ${kmOHoras(det)}` : ''}
                          </div>
                          {obs && <div style={{ fontSize: 13, color: 'var(--label)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{obs}</div>}
                          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            <AccionesFila estado={o.estado} disabled={ejecutando} onAccion={a => abrirAccion(a, o)} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                <div className="tarjeta__lista" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table className="inv-kardex" style={{ minWidth: '78rem' }}>
                    <thead style={{ textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 800 }}>
                      <tr>
                        <th style={{ textAlign: 'center' }}>Acciones</th><th>N° OT</th><th>Fecha</th><th>Placa</th><th style={{ textAlign: 'right' }}>Kilometraje</th>
                        <th>Tipo / Sub tipo</th><th>Supervisor</th><th>Status rampa</th><th>Motivo de Ingreso</th>
                        <th style={{ textAlign: 'right' }}>Costo total</th><th style={{ width: 56, textAlign: 'center' }}>Ver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map(o => {
                        const det = otDetalles(o);
                        const obs = String(det.motivo ?? o.observaciones ?? '')
                          .replace(/\[[^\]]*\]\s*/g, '')
                          .replace(/•\s*/g, '')
                          .replace(/(falla manual|manual)\s*:\s*/gi, '')
                          .trim();
                        return (
                          <tr key={otId(o)} onClick={() => { haptic('selection'); setSeleccionada(o); }} style={{ cursor: 'pointer' }}>
                            <td style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                              <AccionesFila estado={o.estado} disabled={ejecutando} onAccion={a => abrirAccion(a, o)} />
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>{otId(o)}{o.reporte_desvinculado && <> <Badge tone="amber">Reporte desvinculado</Badge></>}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--label-2)' }}>{otFecha(o)}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{o.placa}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{kmOHoras(det)}</td>
                            <td style={{ fontWeight: 600 }}>{otTipo(o)}</td>
                            <td style={{ fontSize: '0.8125rem' }}>{String(det.supervisor ?? o.supervisor ?? '—')}</td>
                            <td style={{ fontSize: '0.8125rem' }}>{String(o.situacion ?? '—')}</td>
                            <td style={{ maxWidth: '18rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem', color: 'var(--label-2)' }} title={obs}>{obs || '—'}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green-ink)' }}>{formatSoles(Number(o.costo_total_pen ?? o.costo_total ?? 0) || 0)}</td>
                            <td style={{ textAlign: 'center' }}>
                              <button type="button" aria-label={`Ver ${otId(o)}`} title="Ver OT" onClick={e => { e.stopPropagation(); haptic('selection'); setSeleccionada(o); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', minWidth: 44, minHeight: 44 }}>
                                <Eye size={17} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                )}
                </>
              )}
            </>
          ) : (
            <BacklogTab onCrear={() => setModalBK(true)} qc={qc} toast={toast} />
          )}
        </div>
      )}


      {/* ── Modal Crear Backlog ── */}
      <Sheet
        open={modalBK}
        onClose={() => setModalBK(false)}
        title="Agregar tarea al backlog"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setModalBK(false)} disabled={guardandoBK}>Cancelar</Button>
            <Button variant="primary" onClick={crearBacklog} loading={guardandoBK}>Agregar</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SimpleLabel label="Placa *">
            <PlacaPicker value={bkPlaca} onChange={setBkPlaca} opciones={(placas ?? []).map(p => ({ placa: p }))} />
          </SimpleLabel>
          <SimpleLabel label="Tarea / Descripción *">
            <TextInput value={bkTarea} onChange={e => setBkTarea(e.target.value)} placeholder="Describe el trabajo pendiente…" />
          </SimpleLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SimpleLabel label="Tema / Categoría">
              <TextInput value={bkTema} onChange={e => setBkTema(e.target.value)} placeholder="Motor, frenos, etc." />
            </SimpleLabel>
            <SimpleLabel label="KM al reportar">
              <TextInput type="number" value={bkKm} onChange={e => setBkKm(e.target.value)} placeholder="0" min="0" />
            </SimpleLabel>
          </div>
          <SimpleLabel label="Reportado por">
            <TextInput value={bkReportado} onChange={e => setBkReportado(e.target.value)} placeholder="Nombre del conductor / supervisor" />
          </SimpleLabel>
        </div>
      </Sheet>

      {accionSheet?.accion === 'pausar' && (
        <PausarOTSheet ot={accionSheet.ot} open onClose={() => setAccionSheet(null)} usuario={user?.name ?? ''} />
      )}
      {accionSheet?.accion === 'cerrar' && (
        <CerrarOTSheet ot={accionSheet.ot} open onClose={() => setAccionSheet(null)} usuario={user?.name ?? ''} />
      )}

      {/* Confirmación acción */}
      <ConfirmSheet
        open={!!confirmando}
        onClose={() => !ejecutando && setConfirmando(null)}
        onConfirm={() => confirmando && ejecutar(confirmando.accion, confirmando.ot)}
        loading={ejecutando}
        title={confirmando ? `${ETIQUETA_ACCION[confirmando.accion]} — ${otId(confirmando.ot)}` : ''}
        message={confirmando ? `¿Confirmas "${ETIQUETA_ACCION[confirmando.accion]}" en la OT ${otId(confirmando.ot)} (placa: ${confirmando.ot.placa})?` : ''}
        confirmLabel={confirmando ? ETIQUETA_ACCION[confirmando.accion] : 'Confirmar'}
      />

      <ConfirmSheet
        open={!!eliminando}
        onClose={() => !ejecutando && setEliminando(null)}
        onConfirm={confirmarEliminar}
        loading={ejecutando}
        title={`¿Eliminar OT "${eliminando ? otId(eliminando) : ''}"?`}
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </Page>
  );
}

// ─── Label helper simple ─────────────────────────────────────────────────────

function SimpleLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: 'var(--label-2)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Tab Backlog ──────────────────────────────────────────────────────────────

function BacklogTab({ onCrear, qc, toast }: { onCrear: () => void; qc: ReturnType<typeof useQueryClient>; toast: (msg: string, tone?: 'error') => void }) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const { data, isLoading } = useBacklog();
  const items = data ?? [];

  const visibles = useMemo(() => {
    return items.filter(it => {
      const passEst = filtroEstado === 'Todos' || it.estado === filtroEstado;
      if (!passEst) return false;
      if (!busqueda) return true;
      const q = busqueda.toUpperCase();
      return (
        it.placa.toUpperCase().includes(q) ||
        it.tarea.toUpperCase().includes(q) ||
        (it.tema ?? '').toUpperCase().includes(q)
      );
    });
  }, [items, filtroEstado, busqueda]);

  async function cambiarEstado(id: number, estado: string) {
    try {
      await api(`/ot-backlog/${id}`, { method: 'PUT', body: { estado } });
      qc.invalidateQueries({ queryKey: ['mant', 'ot-backlog'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  const ESTADOS_BK = ['Todos', 'Pendiente', 'En Progreso', 'Completado', 'Cancelado'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, tarea, tema…" />

      <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
        {ESTADOS_BK.map(e => (
          <button key={e} type="button" onClick={() => setFiltroEstado(e)}
            style={{
              padding: '0.25rem 0.75rem', borderRadius: 'var(--r-full)', fontSize: '0.8125rem',
              fontWeight: 600, border: 'none', cursor: 'pointer',
              background: filtroEstado === e ? 'var(--ink)' : 'var(--fill)',
              color: filtroEstado === e ? 'var(--label-inverse)' : 'var(--label-2)',
            }}>
            {e}
          </button>
        ))}
      </div>

      {isLoading ? <PageLoader /> : visibles.length === 0 ? (
        <EmptyState icon={busqueda ? <SearchX size={22} /> : <BookOpen size={22} />}
          title={busqueda ? 'Sin coincidencias' : 'Backlog vacío'}>
          {!busqueda && <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={onCrear}>Agregar tarea</Button>}
        </EmptyState>
      ) : (
        <div className="tarjeta__lista">
          {visibles.map(it => {
            const col = it.estado === 'Completado' ? 'green'
              : it.estado === 'Cancelado' ? 'gray'
              : it.estado === 'En Progreso' ? 'blue'
              : 'yellow';
            return (
              <div key={it.id} className="ot-fila" style={{ cursor: 'default' }}>
                <div className="ot-fila__icono" style={{ background: `var(--${col}-tint)`, color: `var(--${col}-ink)` }}>
                  <AlertCircle size={15} />
                </div>
                <div className="ot-fila__cuerpo">
                  <span className="ot-fila__id">{it.placa}</span>
                  <span className="ot-fila__sub">
                    {it.tema ? `[${it.tema}] ` : ''}{it.tarea}
                    {it.km ? ` · ${Number(it.km).toLocaleString('es-PE')} km` : ''}
                  </span>
                </div>
                <div className="ot-fila__derecha">
                  <SelectInput
                    value={it.estado}
                    onChange={e => cambiarEstado(it.id, e.target.value)}
                    style={{ fontSize: '0.78rem', padding: '2px 6px' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {['Pendiente', 'En Progreso', 'Completado', 'Cancelado'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </SelectInput>
                  <span className="ot-fila__fecha">{formatFechaPe(it.fecha_reporte)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
