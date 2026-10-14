import './mant.css';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, CircleAlert, FileSpreadsheet, History, Pencil, Plus, SearchX, Wrench, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import {
  cancelarPlan, completarPlan, planEstado, planEstadoColor, usePlanificacion,
  type EstadoPlan, type PlanificacionItem,
} from './api';
import { PlanificacionFormulario } from './PlanificacionFormulario';
import { ImportarPlanificacionSheet } from './ImportarPlanificacionSheet';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const LABEL_ESTADO: Record<EstadoPlan, string> = {
  completada: 'Completada', cancelada: 'Cancelada', diferida: 'Diferida',
  atrasada: 'Atrasada', porvencer: 'Por vencer', vigente: 'Vigente', programada: 'Programada',
};
const dia = (s: string | null | undefined) => (s ? String(s).split('T')[0] : '—');

export function PlanificacionPage() {
  const navigate = useNavigate();
  const hoy = new Date();
  const { can, user } = useAuth();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<'todos' | EstadoPlan>('todos');
  const [seleccionadoId, setSeleccionadoId] = useState<string | number | null>(null);
  const [formulario, setFormulario] = useState<{ plan: PlanificacionItem | null } | null>(null);
  const [importando, setImportando] = useState(false);
  const toast = useToast();

  const { data, isLoading, isError, error } = usePlanificacion(mes, anio);
  const planes = data ?? [];
  const seleccionado = planes.find(p => p.id === seleccionadoId) ?? null;

  const conEstado = useMemo(() => planes.map(p => ({ p, est: planEstado(p) })), [planes]);
  const conteo = useMemo(() => {
    const c: Partial<Record<EstadoPlan, number>> = {};
    conEstado.forEach(({ est }) => { c[est] = (c[est] ?? 0) + 1; });
    return c;
  }, [conEstado]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    return conEstado.filter(({ p, est }) =>
      (filtro === 'todos' || est === filtro) &&
      (!q || (p.placa ?? '').toUpperCase().includes(q) || (p.tipo_mp ?? '').toUpperCase().includes(q) ||
        (p.tecnico_asignado ?? '').toUpperCase().includes(q)));
  }, [conEstado, busqueda, filtro]);

  const anios = Array.from({ length: 4 }, (_, i) => hoy.getFullYear() - 1 + i);
  const puedeCrear = can('plan.crear');

  async function exportar() {
    try {
      await exportarExcel(`Planificacion-${anio}-${String(mes).padStart(2, '0')}`, 'Planificación',
        ['Placa', 'Tipo MP', 'Estado', 'Inicio ventana', 'Fin ventana', 'Km estimado', 'Técnico', 'Prioridad', 'Fecha real', 'Km real', 'Observaciones'],
        visibles.map(({ p, est }) => [p.placa, p.tipo_mp, LABEL_ESTADO[est], dia(p.fecha_inicio_ventana), dia(p.fecha_fin_ventana),
          p.km_estimado, p.tecnico_asignado, p.prioridad, dia(p.fecha_real_ejecucion), p.km_real_ejecucion, p.observaciones_plan]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      {!seleccionado && (
        <PageHeader
          eyebrow="Mantenimiento"
          title="Planificación"
          subtitle={isLoading ? 'Cargando…' : `${planes.length} planes — ${MESES[mes - 1]} ${anio}${conteo.atrasada ? ` · ${conteo.atrasada} atrasados` : ''}`}
          actions={
            <>
              <MenuOtros opciones={[
                { label: 'Exportar Excel', detalle: `${visibles.length} planes`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
                { label: 'Importar desde Excel', icon: <FileSpreadsheet size={17} />, separado: true, onSelect: () => setImportando(true) },
                { label: 'Tipos de MP y alertas', icon: <Wrench size={17} />, onSelect: () => navigate('/mantenimiento/tipos-mp') },
              ]} />
              {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ plan: null })}>Programar</Button>}
            </>
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : seleccionado ? (
        <PlanDetalle
          plan={seleccionado}
          puedeEditar={can('plan.editar')}
          puedeCancelar={can('plan.eliminar', 'plan.editar')}
          usuario={user?.name ?? ''}
          onVolver={() => setSeleccionadoId(null)}
          onReprogramar={() => setFormulario({ plan: seleccionado })}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <SelectInput value={mes} onChange={e => setMes(Number(e.target.value))} aria-label="Mes" style={{ width: 'auto' }}>
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </SelectInput>
            <SelectInput value={anio} onChange={e => setAnio(Number(e.target.value))} aria-label="Año" style={{ width: 'auto' }}>
              {anios.map(a => <option key={a} value={a}>{a}</option>)}
            </SelectInput>
            <SelectInput value={filtro} onChange={e => setFiltro(e.target.value as 'todos' | EstadoPlan)} aria-label="Estado" style={{ width: 'auto' }}>
              <option value="todos">Todos los estados</option>
              {(Object.keys(LABEL_ESTADO) as EstadoPlan[]).map(k => (
                <option key={k} value={k}>{LABEL_ESTADO[k]}{conteo[k] ? ` (${conteo[k]})` : ''}</option>
              ))}
            </SelectInput>
          </div>

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, tipo de MP, técnico…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda || filtro !== 'todos' ? <SearchX size={22} /> : <History size={22} />}
              title={busqueda || filtro !== 'todos' ? 'Sin coincidencias' : 'Sin planes para este periodo'}>
              {busqueda || filtro !== 'todos'
                ? <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setFiltro('todos'); }}>Quitar filtros</button>
                : puedeCrear ? <>Programa uno con <strong>Programar</strong>, o prueba otro mes.</> : 'Prueba otro mes o año.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              {visibles.map(({ p, est }) => (
                <button key={String(p.id)} type="button" className="ot-fila"
                  onClick={() => { haptic('selection'); setSeleccionadoId(p.id); }}>
                  <div className="ot-fila__icono"><CalendarClock size={16} /></div>
                  <div className="ot-fila__cuerpo">
                    <span className="ot-fila__id">{p.placa}</span>
                    <span className="ot-fila__sub">{p.tipo_mp}{p.tecnico_asignado ? ` · ${p.tecnico_asignado}` : ''}</span>
                  </div>
                  <div className="ot-fila__derecha">
                    <span className={`ot-estado ot-estado--${planEstadoColor(est)}`}>{LABEL_ESTADO[est]}</span>
                    <span className="ot-fila__fecha">{dia(p.fecha_fin_ventana)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <PlanificacionFormulario
        open={!!formulario}
        plan={formulario?.plan ?? null}
        usuario={user?.name ?? ''}
        onClose={() => setFormulario(null)}
      />
      <ImportarPlanificacionSheet open={importando} onClose={() => setImportando(false)} mesInicial={mes} anioInicial={anio} />
    </Page>
  );
}

function PlanDetalle({ plan: p, puedeEditar, puedeCancelar, usuario, onVolver, onReprogramar }: {
  plan: PlanificacionItem; puedeEditar: boolean; puedeCancelar: boolean; usuario: string;
  onVolver: () => void; onReprogramar: () => void;
}) {
  const est = planEstado(p);
  const col = planEstadoColor(est);
  const abierto = est !== 'completada' && est !== 'cancelada';
  const [completando, setCompletando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Planificación
        </button>
        <div className="tarjeta__barra-acciones">
          {abierto && puedeEditar && (
            <MenuOtros opciones={[
              { label: 'Reprogramar', icon: <Pencil size={17} />, onSelect: onReprogramar },
              puedeCancelar && { label: 'Cancelar plan', icon: <XCircle size={17} />, destructiva: true, separado: true, onSelect: () => setCancelando(true) },
            ]} />
          )}
          {abierto && puedeEditar && (
            <Button variant="primary" icon={<CheckCircle2 size={16} />} onClick={() => setCompletando(true)}>Completar</Button>
          )}
        </div>
      </div>

      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${col}`}>{LABEL_ESTADO[est]}</span>
        <h2 className="ot-ficha__placa">{p.placa}</h2>
        <span className="ot-ficha__id">{p.tipo_mp}{p.prioridad && p.prioridad !== 'Normal' ? ` · ${p.prioridad}` : ''}</span>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Plan</p>
        <div className="tarjeta__lista">
          {p.tecnico_asignado && <div className="dato"><span className="dato__label">Técnico</span><span className="dato__valor">{p.tecnico_asignado}</span></div>}
          {p.cliente && <div className="dato"><span className="dato__label">Cliente</span><span className="dato__valor">{p.cliente}</span></div>}
          {p.km_estimado != null && <div className="dato"><span className="dato__label">Km estimado</span><span className="dato__valor dato__valor--mono">{Number(p.km_estimado).toLocaleString('es-PE')}</span></div>}
          <div className="dato"><span className="dato__label">Ventana</span><span className="dato__valor dato__valor--mono">{dia(p.fecha_inicio_ventana)} → {dia(p.fecha_fin_ventana)}</span></div>
        </div>
      </div>

      {est === 'completada' && (
        <div>
          <p className="tarjeta__grupo-titulo">Ejecución</p>
          <div className="tarjeta__lista">
            {p.fleetrun_id_ejecutado && <div className="dato"><span className="dato__label">Fleetrun</span><span className="dato__valor dato__valor--mono">{p.fleetrun_id_ejecutado}</span></div>}
            <div className="dato"><span className="dato__label">Fecha real</span><span className="dato__valor dato__valor--mono">{dia(p.fecha_real_ejecucion)}</span></div>
            {p.km_real_ejecucion != null && <div className="dato"><span className="dato__label">Km real</span><span className="dato__valor dato__valor--mono">{Number(p.km_real_ejecucion).toLocaleString('es-PE')}</span></div>}
            {p.desviacion_dias != null && <div className="dato"><span className="dato__label">Desviación</span><span className="dato__valor">{p.desviacion_dias} días{p.desviacion_km != null ? ` · ${p.desviacion_km} km` : ''}</span></div>}
          </div>
        </div>
      )}

      {est === 'cancelada' && p.motivo_cancelacion && (
        <Notice tone="neutral">Motivo de cancelación: {p.motivo_cancelacion}</Notice>
      )}

      {p.observaciones_plan && (
        <div>
          <p className="tarjeta__grupo-titulo">Observaciones</p>
          <div className="tarjeta__lista">
            <div className="dato"><span className="dato__valor" style={{ whiteSpace: 'pre-wrap' }}>{p.observaciones_plan}</span></div>
          </div>
        </div>
      )}

      <CompletarSheet plan={p} usuario={usuario} open={completando} onClose={() => setCompletando(false)} />
      <CancelarSheet plan={p} usuario={usuario} open={cancelando} onClose={() => setCancelando(false)} />
    </div>
  );
}

function CompletarSheet({ plan, usuario, open, onClose }: { plan: PlanificacionItem; usuario: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [fleetrun, setFleetrun] = useState('');
  const [fecha, setFecha] = useState('');
  const [km, setKm] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFleetrun(''); setFecha(new Date().toISOString().slice(0, 10)); setKm(''); setError(null);
  }, [open]);

  async function enviar() {
    if (!fleetrun.trim()) { setError('Indica el código del registro Fleetrun con el que se ejecutó.'); return; }
    setEnviando(true); setError(null);
    try {
      await completarPlan(plan.id, {
        fleetrun_id: fleetrun.trim(), fecha_real: fecha || undefined,
        km_real: km ? parseInt(km.replace(/\D/g, ''), 10) : undefined, usuario,
      });
      haptic('success');
      toast('Plan completado. Se generó el próximo mantenimiento.');
      await qc.invalidateQueries({ queryKey: ['mant', 'planificacion'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={`Completar ${plan.tipo_mp}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={enviar} loading={enviando}>Marcar completado</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Código del registro Fleetrun" wide hint="El mantenimiento ejecutado, tal como está en Fleetrun">
          {p => <TextInput {...p} value={fleetrun} onChange={e => setFleetrun(e.target.value)} autoFocus />}
        </Field>
        <Field label="Fecha real">{p => <TextInput {...p} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />}</Field>
        <Field label="Km real">{p => <TextInput {...p} inputMode="numeric" value={km} onChange={e => setKm(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}

function CancelarSheet({ plan, usuario, open, onClose }: { plan: PlanificacionItem; usuario: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setMotivo(''); setError(null); } }, [open]);

  async function enviar() {
    if (!motivo.trim()) { setError('Escribe el motivo de la cancelación.'); return; }
    setEnviando(true); setError(null);
    try {
      await cancelarPlan(plan.id, { motivo: motivo.trim(), usuario });
      haptic('success');
      toast('Plan cancelado');
      await qc.invalidateQueries({ queryKey: ['mant', 'planificacion'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Cancelar plan"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Volver</Button>
        <Button variant="destructive" onClick={enviar} loading={enviando}>Cancelar plan</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Motivo" wide hint={`${plan.placa} · ${plan.tipo_mp}`}>
          {p => <TextInput {...p} value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />}
        </Field>
      </div>
    </Sheet>
  );
}
