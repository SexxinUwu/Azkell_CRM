import './mant.css';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ScrollText, SearchX, Wrench } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
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

const ETIQUETA_ACCION: Record<AccionOT, string> = {
  iniciar:    'Iniciar OT',
  pausar:     'Pausar',
  reanudar:   'Reanudar',
  cerrar:     'Cerrar',
  anular:     'Anular',
  reactivar:  'Reactivar',
};

const FILTROS_ESTADO = ['Todas', 'Pendiente', 'En Proceso', 'Pausada', 'Finalizado', 'Cerrada', 'Anulado'] as const;

export function OrdenesTrabajoPage() {
  const { data, isLoading, isError, error } = useOrdenesTrabajoData();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('Todas');
  const [seleccionada, setSeleccionada] = useState<OrdenTrabajo | null>(null);
  const [confirmando, setConfirmando] = useState<{ accion: AccionOT; ot: OrdenTrabajo } | null>(null);
  const [eliminando, setEliminando] = useState<OrdenTrabajo | null>(null);
  const [ejecutando, setEjecutando] = useState(false);

  const ots = data ?? [];

  const visibles = useMemo(() => {
    return ots.filter(o => {
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
    });
  }, [ots, filtroEstado, busqueda]);

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

  const puedeEditar = can('ot.e') || can('reportes_ot.e');
  const puedeEliminar = can('ot.d') || can('reportes_ot.d');
  const soloDetalle = !!seleccionada;

  return (
    <Page>
      {!soloDetalle && (
        <PageHeader
          eyebrow="Mantenimiento"
          title="Órdenes de trabajo"
          subtitle={isLoading ? 'Cargando…' : `${ots.length} órdenes registradas`}
          actions={
            <MenuOtros opciones={[
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/reportes-ot') },
            ]} />
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
      ) : ots.length === 0 ? (
        <EmptyState icon={<ScrollText size={22} />} title="Sin órdenes de trabajo">
          Las órdenes de trabajo registradas aparecerán aquí.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="OT, placa, técnico…" />

          {/* Filtro de estado */}
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            {FILTROS_ESTADO.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => setFiltroEstado(e)}
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: 'var(--r-full)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: filtroEstado === e ? 'var(--ink)' : 'var(--fill)',
                  color: filtroEstado === e ? 'var(--label-inverse)' : 'var(--label-2)',
                }}
              >
                {e}
              </button>
            ))}
          </div>

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
              <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setFiltroEstado('Todas'); }}>
                Quitar filtros
              </button>
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
        </div>
      )}

      {/* Confirmación de acción */}
      <ConfirmSheet
        open={!!confirmando}
        onClose={() => !ejecutando && setConfirmando(null)}
        onConfirm={() => confirmando && ejecutar(confirmando.accion, confirmando.ot)}
        loading={ejecutando}
        title={confirmando ? `${ETIQUETA_ACCION[confirmando.accion]} — ${otId(confirmando.ot)}` : ''}
        message={confirmando ? `¿Confirmas la acción "${ETIQUETA_ACCION[confirmando.accion]}" en la OT ${otId(confirmando.ot)} (placa: ${confirmando.ot.placa})?` : ''}
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
  const acciones = accionesDisponibles(ot.estado);
  const col = estadoColor(ot.estado);
  const det = otDetalles(ot);

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
  ].filter(Boolean) as Parameters<typeof MenuOtros>[0]['opciones'];

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
        <span className="ot-ficha__id">{otId(ot)}</span>
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
    </div>
  );
}
