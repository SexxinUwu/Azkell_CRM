import './mant.css';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowUpRight, BookOpen, Package, Plus, ScrollText, SearchX, Wrench } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import {
  accionesDisponibles, ejecutarAccionOT, eliminarOT,
  estadoColor, otDetalles, otFecha, otId, otTipo,
  useOrdenesTrabajoData,
  type AccionOT, type OrdenTrabajo,
} from './api';

// ─── Tipos adicionales ────────────────────────────────────────────────────────

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

interface MaterialSalida {
  id: string;
  fecha: string;
  placa: string | null;
  responsable: string | null;
  moneda: string;
  total_pen: number;
  estado: string;
  items: { descripcion: string; cantidad: number; costo_unitario: number; importe: number }[];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function usePlacasLista() {
  return useQuery<string[]>({
    queryKey: ['placas-lista'],
    queryFn: () => api<{ data?: string[] }>('/placas-lista').then(r => r.data ?? []),
    staleTime: 300_000,
  });
}

function useCatalogosTaller() {
  return useQuery<{ rampas: { id: number; rampa: string }[]; situaciones: { id: number; descripcion: string }[] }>({
    queryKey: ['catalogos-taller'],
    queryFn: () => api('/catalogos_taller'),
    staleTime: 600_000,
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

function useMateriales(ticketOt?: string) {
  return useQuery<MaterialSalida[]>({
    queryKey: ['mant', 'ot-materiales', ticketOt],
    queryFn: () => api<MaterialSalida[]>(`/taller/ot-materiales?ticket_ot=${encodeURIComponent(ticketOt ?? '')}`),
    enabled: !!ticketOt,
    staleTime: 30_000,
  });
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ETIQUETA_ACCION: Record<AccionOT, string> = {
  iniciar:   'Iniciar OT',
  pausar:    'Pausar',
  reanudar:  'Reanudar',
  cerrar:    'Cerrar',
  anular:    'Anular',
  reactivar: 'Reactivar',
};

const FILTROS_ESTADO = ['Todas', 'Pendiente', 'En Proceso', 'Pausada', 'Finalizado', 'Cerrada', 'Anulado'] as const;

const TIPOS_OT  = ['Correctivo', 'Preventivo', 'Predictivo', 'Emergencia', 'Inspección', 'Otro'];
const TABS_MAIN = ['OTs', 'Backlog'] as const;

// ─── Componente principal ─────────────────────────────────────────────────────

export function OrdenesTrabajoPage() {
  const { data, isLoading, isError, error } = useOrdenesTrabajoData();
  const { can } = useAuth();
  const qc    = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();

  const { data: placas }    = usePlacasLista();
  const { data: catsTaller } = useCatalogosTaller();

  const [tab, setTab]           = useState<typeof TABS_MAIN[number]>('OTs');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('Todas');
  const [seleccionada, setSeleccionada] = useState<OrdenTrabajo | null>(null);
  const [confirmando, setConfirmando]   = useState<{ accion: AccionOT; ot: OrdenTrabajo } | null>(null);
  const [eliminando, setEliminando]     = useState<OrdenTrabajo | null>(null);
  const [ejecutando, setEjecutando]     = useState(false);

  // Modal crear OT
  const [modalOT, setModalOT]   = useState(false);
  const [guardandoOT, setGuardandoOT] = useState(false);
  const [nPlaca, setNPlaca]     = useState('');
  const [nTipoOT, setNTipoOT]   = useState('Correctivo');
  const [nSubTipo, setNSubTipo] = useState('');
  const [nKm, setNKm]           = useState('');
  const [nHoras, setNHoras]     = useState('');
  const [nTecnico, setNTecnico] = useState('');
  const [nSupervisor, setNSupervisor] = useState('');
  const [nSituacion, setNSituacion]   = useState('');
  const [nFecha, setNFecha]     = useState(() => new Date().toISOString().split('T')[0]);
  const [nObs, setNObs]         = useState('');

  // Modal crear backlog
  const [modalBK, setModalBK]   = useState(false);
  const [guardandoBK, setGuardandoBK] = useState(false);
  const [bkPlaca, setBkPlaca]   = useState('');
  const [bkTarea, setBkTarea]   = useState('');
  const [bkTema, setBkTema]     = useState('');
  const [bkKm, setBkKm]         = useState('');
  const [bkReportado, setBkReportado] = useState('');

  const ots = data ?? [];

  const visibles = useMemo(() => ots.filter(o => {
    const passEstado = filtroEstado === 'Todas' || o.estado === filtroEstado;
    if (!passEstado) return false;
    if (!busqueda) return true;
    const q = busqueda.toUpperCase();
    return (
      otId(o).toUpperCase().includes(q) ||
      (o.placa ?? '').toUpperCase().includes(q) ||
      (o.tecnico ?? '').toUpperCase().includes(q) ||
      (o.supervisor ?? '').toUpperCase().includes(q) ||
      otTipo(o).toUpperCase().includes(q)
    );
  }), [ots, filtroEstado, busqueda]);

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

  async function crearOT() {
    if (!nPlaca) { toast('Selecciona una placa', 'error'); return; }
    setGuardandoOT(true);
    try {
      const detalles_json = {
        tipo_ot:   nTipoOT,
        sub_tipo:  nSubTipo || undefined,
        km:        nKm   ? Number(nKm)   : undefined,
        horas_motor: nHoras ? Number(nHoras) : undefined,
        situacion: nSituacion || undefined,
      };
      const res = await api<{ ok: boolean; id_ot: string }>('/ordenes-trabajo', {
        method: 'POST',
        body: {
          placa:         nPlaca.toUpperCase(),
          estado:        'Pendiente',
          fecha_ingreso: nFecha,
          creado_por:    '',
          detalles_json,
          tecnico:       nTecnico || undefined,
          supervisor:    nSupervisor || undefined,
          observaciones: nObs || undefined,
        },
      });
      if (res?.ok) {
        toast(`OT ${res.id_ot} creada`);
        haptic('success');
        setModalOT(false);
        qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setGuardandoOT(false);
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
  const puedeCrear   = can('ot.c') || can('reportes_ot.c') || can('admin');
  const soloDetalle  = !!seleccionada;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Page>
      {!soloDetalle && (
        <PageHeader
          eyebrow="Mantenimiento"
          title="Órdenes de trabajo"
          subtitle={isLoading ? 'Cargando…' : `${ots.length} órdenes registradas`}
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {puedeCrear && tab === 'OTs' && (
                <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setModalOT(true)}>
                  Nueva OT
                </Button>
              )}
              {tab === 'Backlog' && (
                <Button variant="accent" size="sm" icon={<Plus size={15} />} onClick={() => setModalBK(true)}>
                  Agregar tarea
                </Button>
              )}
              <MenuOtros opciones={[
                { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />,
                  onSelect: () => abrirClasico('mantenimiento/reportes-ot') },
              ]} />
            </div>
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : soloDetalle ? (
        <OTDetalle
          ot={seleccionada}
          onVolver={() => setSeleccionada(null)}
          puedeEditar={puedeEditar}
          puedeEliminar={puedeEliminar}
          onAccion={(accion) => setConfirmando({ accion, ot: seleccionada })}
          onEliminar={() => setEliminando(seleccionada)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {/* Tabs OTs / Backlog */}
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            {TABS_MAIN.map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                style={{
                  padding: '0.375rem 1rem', borderRadius: 'var(--r-full)', fontSize: '0.875rem',
                  fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: tab === t ? 'var(--ink)' : 'var(--fill)',
                  color: tab === t ? 'var(--label-inverse)' : 'var(--label-2)',
                }}>
                {t === 'OTs' ? <><ScrollText size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />OTs</> : <><BookOpen size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />Backlog</>}
              </button>
            ))}
          </div>

          {tab === 'OTs' ? (
            <>
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="OT, placa, técnico…" />

              <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
                {FILTROS_ESTADO.map(e => (
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

              {visibles.length === 0 ? (
                <EmptyState icon={busqueda || filtroEstado !== 'Todas' ? <SearchX size={22} /> : <ScrollText size={22} />}
                  title={busqueda || filtroEstado !== 'Todas' ? 'Sin coincidencias' : 'Sin órdenes de trabajo'}>
                  {(busqueda || filtroEstado !== 'Todas')
                    ? <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setFiltroEstado('Todas'); }}>Quitar filtros</button>
                    : puedeCrear && <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setModalOT(true)}>Nueva OT</Button>}
                </EmptyState>
              ) : (
                <div className="tarjeta__lista">
                  <AnimatePresence initial={false}>
                    {visibles.map(o => {
                      const col = estadoColor(o.estado);
                      return (
                        <motion.div key={otId(o)} layout={!reduce} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring}>
                          <button type="button" className="ot-fila" onClick={() => { haptic('selection'); setSeleccionada(o); }}>
                            <div className="ot-fila__icono"><Wrench size={16} /></div>
                            <div className="ot-fila__cuerpo">
                              <span className="ot-fila__id">{otId(o)}</span>
                              <span className="ot-fila__sub">
                                <span className="ot-fila__placa">{o.placa}</span>
                                {' · '}{otTipo(o)}
                                {o.tecnico ? ` · ${o.tecnico}` : ''}
                              </span>
                            </div>
                            <div className="ot-fila__derecha">
                              <span className={`ot-estado ot-estado--${col}`}>{o.estado}</span>
                              <span className="ot-fila__fecha">{otFecha(o)}</span>
                              {o.costo_total != null && (
                                <span className="ot-fila__costo">S/ {Number(o.costo_total).toFixed(2)}</span>
                              )}
                            </div>
                          </button>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </>
          ) : (
            <BacklogTab onCrear={() => setModalBK(true)} qc={qc} toast={toast} />
          )}
        </div>
      )}

      {/* ── Modal Crear OT ── */}
      <Sheet
        open={modalOT}
        onClose={() => setModalOT(false)}
        title="Nueva orden de trabajo"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setModalOT(false)} disabled={guardandoOT}>Cancelar</Button>
            <Button variant="primary" onClick={crearOT} loading={guardandoOT}>Crear OT</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Placa */}
          <SimpleLabel label="Placa *">
            <SelectInput value={nPlaca} onChange={e => setNPlaca(e.target.value)}>
              <option value="">Selecciona placa…</option>
              {(placas ?? []).map(p => <option key={p} value={p}>{p}</option>)}
            </SelectInput>
          </SimpleLabel>

          {/* Tipo y subtipo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SimpleLabel label="Tipo de OT">
              <SelectInput value={nTipoOT} onChange={e => setNTipoOT(e.target.value)}>
                {TIPOS_OT.map(t => <option key={t} value={t}>{t}</option>)}
              </SelectInput>
            </SimpleLabel>
            <SimpleLabel label="Sub-tipo">
              <TextInput value={nSubTipo} onChange={e => setNSubTipo(e.target.value)} placeholder="Ej. Cambio de aceite" />
            </SimpleLabel>
          </div>

          {/* KM / Horas motor */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SimpleLabel label="KM actual">
              <TextInput type="number" value={nKm} onChange={e => setNKm(e.target.value)} placeholder="0" min="0" />
            </SimpleLabel>
            <SimpleLabel label="Horas motor">
              <TextInput type="number" value={nHoras} onChange={e => setNHoras(e.target.value)} placeholder="0" min="0" />
            </SimpleLabel>
          </div>

          {/* Técnico / Supervisor */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SimpleLabel label="Técnico asignado">
              <TextInput value={nTecnico} onChange={e => setNTecnico(e.target.value)} placeholder="Nombre del técnico" />
            </SimpleLabel>
            <SimpleLabel label="Supervisor">
              <TextInput value={nSupervisor} onChange={e => setNSupervisor(e.target.value)} placeholder="Nombre del supervisor" />
            </SimpleLabel>
          </div>

          {/* Situación / Fecha */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SimpleLabel label="Situación">
              <SelectInput value={nSituacion} onChange={e => setNSituacion(e.target.value)}>
                <option value="">Sin situación</option>
                {(catsTaller?.situaciones ?? []).map(s => (
                  <option key={s.id} value={s.descripcion}>{s.descripcion}</option>
                ))}
              </SelectInput>
            </SimpleLabel>
            <SimpleLabel label="Fecha de ingreso">
              <TextInput type="date" value={nFecha} onChange={e => setNFecha(e.target.value)} />
            </SimpleLabel>
          </div>

          {/* Observaciones */}
          <SimpleLabel label="Observaciones">
            <TextInput value={nObs} onChange={e => setNObs(e.target.value)} placeholder="Falla reportada, trabajos a realizar…" />
          </SimpleLabel>
        </div>
      </Sheet>

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
            <SelectInput value={bkPlaca} onChange={e => setBkPlaca(e.target.value)}>
              <option value="">Selecciona placa…</option>
              {(placas ?? []).map(p => <option key={p} value={p}>{p}</option>)}
            </SelectInput>
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
                  <span className="ot-fila__fecha">{it.fecha_reporte?.split('T')[0] ?? '—'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Detalle de OT ───────────────────────────────────────────────────────────

interface DetalleProps {
  ot: OrdenTrabajo;
  onVolver: () => void;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  onAccion: (a: AccionOT) => void;
  onEliminar: () => void;
}

function OTDetalle({ ot, onVolver, puedeEditar, puedeEliminar, onAccion, onEliminar }: DetalleProps) {
  const acciones  = accionesDisponibles(ot.estado);
  const col       = estadoColor(ot.estado);
  const det       = otDetalles(ot);
  const idOt      = otId(ot);

  const { data: materiales, isLoading: loadMat } = useMateriales(idOt);

  const opcionesOtros = [
    ...acciones
      .filter(a => a !== 'iniciar')
      .map(a => ({
        label: ETIQUETA_ACCION[a],
        destructiva: a === 'anular',
        separado: a === 'anular',
        onSelect: () => onAccion(a),
      })),
    puedeEliminar && ot.estado === 'Anulado' && {
      label: 'Eliminar',
      destructiva: true,
      separado: true,
      onSelect: onEliminar,
    },
    {
      label: 'Abrir en versión actual',
      icon: <ArrowUpRight size={15} />,
      onSelect: () => abrirClasico('mantenimiento/reportes-ot'),
    },
  ].filter(Boolean) as Parameters<typeof MenuOtros>[0]['opciones'];

  const totalMat = (materiales ?? []).reduce((s, m) => s + Number(m.total_pen || 0), 0);

  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Órdenes
        </button>
        <div className="tarjeta__barra-acciones">
          {puedeEditar && acciones.includes('iniciar') && (
            <Button variant="primary" size="sm" onClick={() => onAccion('iniciar')}>
              Iniciar OT
            </Button>
          )}
          {opcionesOtros.length > 0 && <MenuOtros opciones={opcionesOtros} />}
        </div>
      </div>

      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${col}`} style={{ fontSize: '0.75rem' }}>{ot.estado}</span>
        <h2 className="ot-ficha__placa">{ot.placa}</h2>
        <span className="ot-ficha__id">{idOt}</span>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">General</p>
        <div className="tarjeta__lista">
          {det.tipo_ot && <div className="dato"><span className="dato__label">Tipo</span><span className="dato__valor">{det.tipo_ot}</span></div>}
          {det.sub_tipo && <div className="dato"><span className="dato__label">Sub-tipo</span><span className="dato__valor">{det.sub_tipo}</span></div>}
          {ot.tecnico && <div className="dato"><span className="dato__label">Técnico</span><span className="dato__valor">{ot.tecnico}</span></div>}
          {ot.supervisor && <div className="dato"><span className="dato__label">Supervisor</span><span className="dato__valor">{ot.supervisor}</span></div>}
          {ot.situacion && <div className="dato"><span className="dato__label">Situación</span><span className="dato__valor">{ot.situacion}</span></div>}
          {ot.aprobacion && <div className="dato"><span className="dato__label">Aprobación</span><span className="dato__valor">{ot.aprobacion}</span></div>}
        </div>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Datos técnicos</p>
        <div className="tarjeta__lista">
          {(det.km || det.horas_motor) && (
            det.horas_motor
              ? <div className="dato"><span className="dato__label">Horas motor</span><span className="dato__valor dato__valor--mono">{String(det.horas_motor)}</span></div>
              : <div className="dato"><span className="dato__label">Kilómetros</span><span className="dato__valor dato__valor--mono">{String(det.km)}</span></div>
          )}
          {ot.id_rampa && <div className="dato"><span className="dato__label">Rampa</span><span className="dato__valor dato__valor--mono">{ot.id_rampa}</span></div>}
          {ot.costo_total != null && (
            <div className="dato"><span className="dato__label">Costo total</span><span className="dato__valor" style={{ fontWeight: 700 }}>S/ {Number(ot.costo_total).toFixed(2)}</span></div>
          )}
        </div>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Fechas</p>
        <div className="tarjeta__lista">
          {otFecha(ot) !== '—' && <div className="dato"><span className="dato__label">Ingreso</span><span className="dato__valor dato__valor--mono">{otFecha(ot)}</span></div>}
          {ot.fecha_inicio_ot && <div className="dato"><span className="dato__label">Inicio</span><span className="dato__valor dato__valor--mono">{ot.fecha_inicio_ot.split('T')[0]}</span></div>}
          {ot.fecha_hora_salida && <div className="dato"><span className="dato__label">Salida</span><span className="dato__valor dato__valor--mono">{ot.fecha_hora_salida.split('T')[0]}</span></div>}
        </div>
      </div>

      {ot.observaciones && (
        <div>
          <p className="tarjeta__grupo-titulo">Observaciones</p>
          <div className="tarjeta__lista">
            <div className="dato"><span className="dato__valor" style={{ whiteSpace: 'pre-wrap' }}>{ot.observaciones}</span></div>
          </div>
        </div>
      )}

      {/* Materiales despachados */}
      <div>
        <p className="tarjeta__grupo-titulo" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Package size={14} /> Materiales despachados
          {totalMat > 0 && <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--accent)' }}>S/ {totalMat.toFixed(2)}</span>}
        </p>
        {loadMat ? (
          <div style={{ padding: '8px 0', color: 'var(--label-3)', fontSize: '0.85rem' }}>Cargando…</div>
        ) : !materiales || materiales.length === 0 ? (
          <div style={{ padding: '8px 0', color: 'var(--label-3)', fontSize: '0.85rem' }}>Sin materiales registrados en esta OT</div>
        ) : (
          <div className="tarjeta__lista" style={{ overflowX: 'auto' }}>
            {materiales.map(sal => (
              <div key={sal.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--separator)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent)' }}>{sal.id}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--label-2)' }}>{sal.fecha} · {sal.estado}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>S/ {Number(sal.total_pen).toFixed(2)}</span>
                </div>
                {sal.items.length > 0 && (
                  <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: 'var(--label-3)' }}>
                        <th style={{ textAlign: 'left', paddingBottom: 4 }}>Repuesto / Insumo</th>
                        <th style={{ textAlign: 'right', paddingBottom: 4 }}>Cant.</th>
                        <th style={{ textAlign: 'right', paddingBottom: 4 }}>C.Unit.</th>
                        <th style={{ textAlign: 'right', paddingBottom: 4 }}>Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sal.items.map((it, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: '2px 0' }}>{it.descripcion || '—'}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{it.cantidad}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--label-2)' }}>S/ {Number(it.costo_unitario).toFixed(2)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>S/ {Number(it.importe).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
