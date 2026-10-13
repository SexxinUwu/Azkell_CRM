import './mant.css';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, SearchX, Wrench } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { trabajoId, trabajoKmHoras, useTrabajosOT, type TrabajoOT } from './api';

export function TrabajosOtPage() {
  const { data, isLoading, isError, error } = useTrabajosOT();
  const reduce = useReducedMotion();

  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<TrabajoOT | null>(null);

  const trabajos = data ?? [];

  const visibles = useMemo(() => {
    if (!busqueda) return trabajos;
    const q = busqueda.toUpperCase();
    return trabajos.filter(t =>
      trabajoId(t).toUpperCase().includes(q) ||
      (t.placa ?? '').toUpperCase().includes(q) ||
      (t.tecnico ?? '').toUpperCase().includes(q) ||
      (t.tipo_trabajo ?? '').toUpperCase().includes(q) ||
      (t.descripcion ?? '').toUpperCase().includes(q)
    );
  }, [trabajos, busqueda]);

  const soloDetalle = !!seleccionado;

  return (
    <Page>
      {!soloDetalle && (
        <PageHeader
          eyebrow="Mantenimiento"
          title="Trabajos de OT"
          subtitle={isLoading ? 'Cargando…' : `${trabajos.length} trabajos registrados`}
          actions={
            <MenuOtros opciones={[
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/trabajos-ot') },
            ]} />
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : soloDetalle ? (
        <TrabajoDetalle trabajo={seleccionado} onVolver={() => setSeleccionado(null)} />
      ) : trabajos.length === 0 ? (
        <EmptyState icon={<Wrench size={22} />} title="Sin trabajos registrados">
          Los trabajos de OT aparecerán aquí una vez registrados.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="OT, placa, técnico, tipo de trabajo…" />

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
              <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>
                Quitar búsqueda
              </button>
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              <AnimatePresence initial={false}>
                {visibles.map(t => {
                  const id = trabajoId(t);
                  const kmh = trabajoKmHoras(t);
                  return (
                    <motion.div key={id || t.placa} layout={!reduce} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring}>
                      <button type="button" className="ot-fila" onClick={() => { haptic('selection'); setSeleccionado(t); }}>
                        <div className="ot-fila__icono"><Wrench size={16} /></div>
                        <div className="ot-fila__cuerpo">
                          <span className="ot-fila__id">{id}</span>
                          <span className="ot-fila__sub">
                            <span className="ot-fila__placa">{t.placa ?? '—'}</span>
                            {t.tipo_trabajo ? ` · ${t.tipo_trabajo}` : ''}
                            {t.tecnico ? ` · ${t.tecnico}` : ''}
                          </span>
                        </div>
                        <div className="ot-fila__derecha">
                          {t.estado && (
                            <span className="ot-estado ot-estado--neutral" style={{ fontSize: '0.6875rem' }}>{t.estado}</span>
                          )}
                          <span className="ot-fila__fecha">{kmh}</span>
                          {t.costo_total != null && (
                            <span className="ot-fila__costo">S/ {Number(t.costo_total).toFixed(2)}</span>
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
    </Page>
  );
}

// ─── Detalle de trabajo ──────────────────────────────────────────────────────

interface DetalleProps {
  trabajo: TrabajoOT;
  onVolver: () => void;
}

function TrabajoDetalle({ trabajo: t, onVolver }: DetalleProps) {
  const kmh = trabajoKmHoras(t);
  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Trabajos
        </button>
      </div>

      <div className="ot-ficha__hero">
        {t.estado && <span className="ot-estado ot-estado--neutral">{t.estado}</span>}
        <h2 className="ot-ficha__placa">{t.placa ?? '—'}</h2>
        <span className="ot-ficha__id">{trabajoId(t)}</span>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Trabajo</p>
        <div className="tarjeta__lista">
          {t.tipo_trabajo && <div className="dato"><span className="dato__label">Tipo</span><span className="dato__valor">{t.tipo_trabajo}</span></div>}
          {t.descripcion && <div className="dato"><span className="dato__label">Descripción</span><span className="dato__valor">{t.descripcion}</span></div>}
          {t.tecnico && <div className="dato"><span className="dato__label">Técnico</span><span className="dato__valor">{t.tecnico}</span></div>}
          {t.supervisor && <div className="dato"><span className="dato__label">Supervisor</span><span className="dato__valor">{t.supervisor}</span></div>}
          {kmh !== '—' && <div className="dato"><span className="dato__label">Km / Horas</span><span className="dato__valor dato__valor--mono">{kmh}</span></div>}
        </div>
      </div>

      {(t.costo_material != null || t.costo_mano_obra != null || t.costo_total != null) && (
        <div>
          <p className="tarjeta__grupo-titulo">Costos</p>
          <div className="tarjeta__lista">
            {t.costo_material != null && <div className="dato"><span className="dato__label">Materiales</span><span className="dato__valor">S/ {Number(t.costo_material).toFixed(2)}</span></div>}
            {t.costo_mano_obra != null && <div className="dato"><span className="dato__label">Mano de obra</span><span className="dato__valor">S/ {Number(t.costo_mano_obra).toFixed(2)}</span></div>}
            {t.costo_total != null && <div className="dato"><span className="dato__label">Total</span><span className="dato__valor" style={{ fontWeight: 700 }}>S/ {Number(t.costo_total).toFixed(2)}</span></div>}
          </div>
        </div>
      )}

      {t.fecha_ingreso && (
        <div>
          <p className="tarjeta__grupo-titulo">Fecha</p>
          <div className="tarjeta__lista">
            <div className="dato"><span className="dato__label">Ingreso</span><span className="dato__valor dato__valor--mono">{t.fecha_ingreso.split('T')[0]}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
