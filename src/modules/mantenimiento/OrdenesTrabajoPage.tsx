import './mant.css';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowUpRight, BookOpen, Plus, ScrollText, SearchX, Wrench } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { ChoiceChips } from '../../core/ui/Chips';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import {
  ejecutarAccionOT, eliminarOT, etiquetaEstado, FILTROS_OT,
  estadoColor, otDetalles, otFecha, otId, otTipo,
  useOrdenesTrabajoData,
  type AccionOT, type OrdenTrabajo,
} from './api';
import { ETIQUETA_ACCION, OTDetalle } from './OTDetalle';
import { useInspecciones, clavePlaca } from '../inspecciones/api';

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

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIPOS_OT  = ['Correctivo', 'Preventivo', 'Predictivo', 'Auxilio Ruta', 'Emergencia', 'Inspección', 'Otro'];
const TABS_MAIN = ['OTs', 'Backlog'] as const;

// ─── Componente principal ─────────────────────────────────────────────────────

export function OrdenesTrabajoPage() {
  const location = useLocation();
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
  const [nRampa, setNRampa]     = useState('');
  const [nBacklog, setNBacklog] = useState<number[]>([]);

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
    const st = location.state as { nuevaOT?: boolean; abrirOT?: string } | null;
    if (!st?.nuevaOT && !st?.abrirOT) return;
    if (st.nuevaOT) setModalOT(true);
    if (st.abrirOT) setOtPorAbrir(st.abrirOT);
    navegar(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navegar]);
  useEffect(() => {
    if (!otPorAbrir || !data) return;
    const ot = data.find(o => otId(o) === otPorAbrir);
    if (ot) setSeleccionada(ot);
    setOtPorAbrir(null);
  }, [otPorAbrir, data]);

  // Datos para el formulario de Nueva OT: inspecciones, averías pendientes de la placa elegida
  const { data: inspecciones } = useInspecciones();
  const { data: backlogPlaca = [] } = useBacklog(nPlaca || undefined);
  const pendientesPlaca = backlogPlaca.filter(b => b.estado === 'Pendiente' && !b.ticket_ot);

  /** Último kilometraje conocido de la placa: la inspección o la OT más reciente */
  function kmSugerido(placa: string): { km: number; fuente: string } | null {
    const clave = clavePlaca(placa);
    if (!clave) return null;
    const candidatos: Array<{ km: number; fecha: number; fuente: string }> = [];
    (inspecciones ?? []).forEach(i => {
      if (clavePlaca(i.placa) === clave && i.km && i.fecha) candidatos.push({ km: i.km, fecha: i.fecha.getTime(), fuente: `inspección ${i.id}` });
    });
    ots.forEach(o => {
      const km = Number(otDetalles(o).km) || 0;
      const fecha = Date.parse(otFecha(o));
      if (clavePlaca(o.placa) === clave && km > 0 && !Number.isNaN(fecha)) candidatos.push({ km, fecha, fuente: `OT ${otId(o)}` });
    });
    // Más reciente primero; a igual fecha, el kilometraje mayor (el odómetro no baja)
    candidatos.sort((a, b) => b.fecha - a.fecha || b.km - a.km);
    return candidatos[0] ? { km: candidatos[0].km, fuente: candidatos[0].fuente } : null;
  }
  const sugerenciaKm = nPlaca ? kmSugerido(nPlaca) : null;

  function elegirPlaca(placa: string) {
    setNPlaca(placa);
    setNBacklog([]);
    const sug = kmSugerido(placa);
    if (sug && !nKm) setNKm(String(sug.km));
  }

  const estadosFiltro: readonly string[] | null = FILTROS_OT.find(f => f.clave === filtroEstado)?.estados ?? null;
  const conteoFiltro = (clave: string) => {
    const f = FILTROS_OT.find(x => x.clave === clave);
    return f?.estados ? ots.filter(o => (f.estados as readonly string[]).includes(o.estado)).length : ots.length;
  };

  const visibles = useMemo(() => ots.filter(o => {
    const passEstado = !estadosFiltro || estadosFiltro.includes(o.estado);
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
          id_rampa:      nRampa ? Number(nRampa) : undefined,
        },
      });
      if (res?.ok) {
        // Averías importadas del backlog: quedan enlazadas a la nueva OT y en curso
        const importados = pendientesPlaca.filter(b => nBacklog.includes(b.id));
        const resultados = await Promise.allSettled(importados.map(b =>
          api(`/ot-backlog/${b.id}`, {
            method: 'PUT',
            body: { placa: b.placa, tarea: b.tarea, tema: b.tema ?? '', km: b.km ?? 0, reportado_por: b.reportado_por ?? '', ticket_ot: res.id_ot, estado: 'En Progreso' },
          })));
        const fallidos = resultados.filter(r => r.status === 'rejected').length;
        const ok = importados.length - fallidos;
        toast(`OT ${res.id_ot} creada${ok ? ` · ${ok} avería${ok === 1 ? '' : 's'} importada${ok === 1 ? '' : 's'}` : ''}${fallidos ? ` · ${fallidos} sin importar` : ''}`, fallidos ? 'error' : undefined);
        haptic('success');
        setModalOT(false);
        setNBacklog([]);
        setNRampa('');
        qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
        qc.invalidateQueries({ queryKey: ['mant', 'ot-backlog'] });
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
  // Se busca la OT en los datos actuales: el detalle refleja pausas y cierres tras cada acción
  const otActual = seleccionada ? (ots.find(o => otId(o) === otId(seleccionada)) ?? seleccionada) : null;
  const soloDetalle  = !!otActual;

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
      ) : otActual ? (
        <OTDetalle
          ot={otActual}
          onVolver={() => setSeleccionada(null)}
          puedeEditar={puedeEditar}
          puedeEliminar={puedeEliminar}
          onAccion={(accion) => setConfirmando({ accion, ot: otActual })}
          onEliminar={() => setEliminando(otActual)}
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

              <ChoiceChips<string>
                label="Estado de la OT"
                value={filtroEstado}
                onChange={setFiltroEstado}
                options={FILTROS_OT.map(f => ({ value: f.clave, label: `${f.etiqueta} · ${conteoFiltro(f.clave)}` }))}
              />

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
                              <span className={`ot-estado ot-estado--${col}`}>{etiquetaEstado(o.estado)}</span>
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
            <PlacaPicker value={nPlaca} onChange={elegirPlaca} opciones={(placas ?? []).map(p => ({ placa: p }))} />
          </SimpleLabel>

          {/* Tipo y subtipo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SimpleLabel label="Tipo de OT">
              <ChoiceChips<string> label="Tipo de OT" value={nTipoOT} onChange={setNTipoOT}
                options={TIPOS_OT.map(t => ({ value: t, label: t }))} />
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

          {sugerenciaKm && (
            <p className="t-footnote c-secondary" style={{ marginTop: -6 }}>
              Último registro de la unidad: {sugerenciaKm.km.toLocaleString('es-PE')} km ({sugerenciaKm.fuente}). Puedes cambiarlo.
            </p>
          )}

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

          {/* Asignación de rampa */}
          <SimpleLabel label="Rampa asignada">
            <SelectInput value={nRampa} onChange={e => setNRampa(e.target.value)}>
              <option value="">Sin rampa por ahora</option>
              {(catsTaller?.rampas ?? []).map(r => (
                <option key={r.id} value={String(r.id)}>{r.rampa}</option>
              ))}
            </SelectInput>
          </SimpleLabel>

          {/* Averías pendientes del backlog de la unidad: se importan a la OT con un clic */}
          {nPlaca && pendientesPlaca.length > 0 && (
            <div className="ot-form__bloque">
              <span className="ot-form__etiqueta">Averías pendientes de esta unidad · {nBacklog.length} de {pendientesPlaca.length} importadas</span>
              <div className="ot-form__lista">
                {pendientesPlaca.map(b => (
                  <label key={b.id} className="ot-check">
                    <input type="checkbox" checked={nBacklog.includes(b.id)}
                      onChange={e => setNBacklog(prev => (e.target.checked ? [...prev, b.id] : prev.filter(x => x !== b.id)))} />
                    <span>{b.tarea}{b.tema ? <small> · {b.tema}</small> : null}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

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
