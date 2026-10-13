import './flota.css';
import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Gauge, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { ESTADOS_DISP, estadoDispColor, useDisponibilidad, type VehiculoDisponibilidad } from './api';

const TODOS = 'Todos';

export function DisponibilidadPage() {
  const { data, isLoading, isError, error } = useDisponibilidad();
  const [filtro, setFiltro] = useState(TODOS);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<VehiculoDisponibilidad | null>(null);

  const vehiculos = data ?? [];

  const conteos = useMemo(() => {
    const m: Record<string, number> = {};
    for (const v of vehiculos) m[v.estado] = (m[v.estado] ?? 0) + 1;
    return m;
  }, [vehiculos]);

  const visibles = useMemo(() => {
    let lista = vehiculos;
    if (filtro !== TODOS) lista = lista.filter(v => v.estado === filtro);
    if (busqueda) {
      const q = busqueda.toUpperCase();
      lista = lista.filter(v =>
        v.placa.toUpperCase().includes(q) ||
        (v.conductor ?? '').toUpperCase().includes(q) ||
        (v.tipo ?? '').toUpperCase().includes(q) ||
        (v.ubicacion ?? '').toUpperCase().includes(q)
      );
    }
    return lista;
  }, [vehiculos, filtro, busqueda]);

  if (seleccionado) {
    return (
      <Page push>
        <DisponibilidadDetalle veh={seleccionado} onVolver={() => setSeleccionado(null)} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Disponibilidad"
        subtitle={isLoading ? 'Cargando…' : `${vehiculos.length} vehículos`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('flota/disponibilidad') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            {[TODOS, ...ESTADOS_DISP].map(e => {
              const cnt = e === TODOS ? vehiculos.length : (conteos[e] ?? 0);
              return (
                <button key={e} type="button"
                  className={`chip${filtro === e ? ' chip--active' : ''}`}
                  onClick={() => { setFiltro(e); haptic('selection'); }}>
                  {e} {cnt > 0 && <span className="chip__badge">{cnt}</span>}
                </button>
              );
            })}
          </div>

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, conductor, tipo…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <Gauge size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin vehículos'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Los vehículos aparecerán aquí cuando estén registrados.'}
            </EmptyState>
          ) : (
            <div className="disp-grid">
              <AnimatePresence mode="popLayout">
                {visibles.map((v) => {
                  const color = estadoDispColor(v.estado);
                  return (
                    <motion.button key={v.placa} type="button"
                      className="disp-card"
                      style={{ '--disp-color': `var(--${color}-ink)` } as React.CSSProperties}
                      onClick={() => { haptic('selection'); setSeleccionado(v); }}
                      layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span className="disp-card__placa">{v.placa}</span>
                        <span className={`ot-estado ot-estado--${color}`}>{v.estado}</span>
                      </div>
                      <span className="disp-card__tipo">{[v.tipo, v.sub_tipo].filter(Boolean).join(' · ') || '—'}</span>
                      {v.conductor && <span className="disp-card__conductor">{v.conductor}</span>}
                      {v.ubicacion && <span className="disp-card__tipo">{v.ubicacion}</span>}
                    </motion.button>
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

function DisponibilidadDetalle({ veh, onVolver }: { veh: VehiculoDisponibilidad; onVolver: () => void }) {
  const color = estadoDispColor(veh.estado);
  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Disponibilidad
        </button>
      </div>
      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${color}`}>{veh.estado}</span>
        <h2 className="ot-ficha__placa">{veh.placa}</h2>
        {(veh.tipo || veh.sub_tipo) && (
          <span className="ot-ficha__id">{[veh.tipo, veh.sub_tipo].filter(Boolean).join(' · ')}</span>
        )}
      </div>
      <div>
        <p className="tarjeta__grupo-titulo">Detalle</p>
        <div className="tarjeta__lista">
          {veh.conductor && <div className="dato"><span className="dato__label">Conductor asignado</span><span className="dato__valor">{veh.conductor}</span></div>}
          {veh.ubicacion && <div className="dato"><span className="dato__label">Ubicación</span><span className="dato__valor">{veh.ubicacion}</span></div>}
          {veh.fecha_actualizacion && <div className="dato"><span className="dato__label">Actualizado</span><span className="dato__valor">{String(veh.fecha_actualizacion).split('T')[0]}</span></div>}
          {veh.observaciones && <div className="dato"><span className="dato__label">Observaciones</span><span className="dato__valor">{veh.observaciones}</span></div>}
        </div>
      </div>
    </div>
  );
}
