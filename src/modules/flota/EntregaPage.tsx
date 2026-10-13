import './flota.css';
import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, ClipboardList, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { entregaEstadoColor, useEntregas, type EntregaVehiculo } from './api';

const TODOS = 'Todos';
const FILTROS = [TODOS, 'Activa', 'En uso', 'Cerrada', 'Devuelto'] as const;

export function EntregaPage() {
  const { data, isLoading, isError, error } = useEntregas();
  const [filtro, setFiltro] = useState(TODOS);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<EntregaVehiculo | null>(null);

  const entregas = data ?? [];

  const conteos = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of entregas) m[e.estado] = (m[e.estado] ?? 0) + 1;
    return m;
  }, [entregas]);

  const visibles = useMemo(() => {
    let lista = entregas;
    if (filtro !== TODOS) lista = lista.filter(e => e.estado === filtro);
    if (busqueda) {
      const q = busqueda.toUpperCase();
      lista = lista.filter(e =>
        e.placa.toUpperCase().includes(q) ||
        (e.conductor ?? '').toUpperCase().includes(q) ||
        (e.responsable ?? '').toUpperCase().includes(q)
      );
    }
    return lista;
  }, [entregas, filtro, busqueda]);

  if (seleccionado) {
    return (
      <Page push>
        <EntregaDetalle ent={seleccionado} onVolver={() => setSeleccionado(null)} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Entrega de vehículos"
        subtitle={isLoading ? 'Cargando…' : `${entregas.length} registros`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('flota/entrega-vehiculos') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            {FILTROS.map(f => {
              const cnt = f === TODOS ? entregas.length : (conteos[f] ?? 0);
              if (f !== TODOS && cnt === 0) return null;
              return (
                <button key={f} type="button"
                  className={`chip${filtro === f ? ' chip--active' : ''}`}
                  onClick={() => { setFiltro(f); haptic('selection'); }}>
                  {f} {cnt > 0 && <span className="chip__badge">{cnt}</span>}
                </button>
              );
            })}
          </div>

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, conductor, responsable…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <ClipboardList size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin registros'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Las entregas de vehículos aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              <AnimatePresence mode="popLayout">
                {visibles.map((e) => {
                  const color = entregaEstadoColor(e);
                  return (
                    <motion.button key={String(e.id)} type="button"
                      className="ot-fila"
                      onClick={() => { haptic('selection'); setSeleccionado(e); }}
                      layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div className="ot-fila__icono" style={{ background: `var(--${color}-tint)`, color: `var(--${color}-ink)` }}>
                        <ClipboardList size={16} />
                      </div>
                      <div className="ot-fila__cuerpo">
                        <span className="ot-fila__placa">{e.placa}</span>
                        {e.conductor && <span className="ot-fila__sub">{e.conductor}</span>}
                        {e.responsable && <span className="ot-fila__sub" style={{ color: 'var(--label-2)' }}>{e.responsable}</span>}
                      </div>
                      <div className="ot-fila__derecha">
                        <span className={`ot-estado ot-estado--${color}`}>{e.estado}</span>
                        {e.fecha_entrega && <span className="ot-fila__fecha">{String(e.fecha_entrega).split('T')[0]}</span>}
                      </div>
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

function EntregaDetalle({ ent, onVolver }: { ent: EntregaVehiculo; onVolver: () => void }) {
  const color = entregaEstadoColor(ent);
  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Entrega de vehículos
        </button>
      </div>
      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${color}`}>{ent.estado}</span>
        <h2 className="ot-ficha__placa">{ent.placa}</h2>
        {ent.fecha_entrega && <span className="ot-ficha__id">{String(ent.fecha_entrega).split('T')[0]}</span>}
      </div>
      <div>
        <p className="tarjeta__grupo-titulo">Entrega</p>
        <div className="tarjeta__lista">
          {ent.conductor && <div className="dato"><span className="dato__label">Conductor</span><span className="dato__valor">{ent.conductor}</span></div>}
          {ent.responsable && <div className="dato"><span className="dato__label">Responsable</span><span className="dato__valor">{ent.responsable}</span></div>}
          {ent.fecha_entrega && <div className="dato"><span className="dato__label">Fecha entrega</span><span className="dato__valor">{String(ent.fecha_entrega).split('T')[0]}</span></div>}
          {ent.fecha_devolucion && <div className="dato"><span className="dato__label">Fecha devolución</span><span className="dato__valor">{String(ent.fecha_devolucion).split('T')[0]}</span></div>}
        </div>
      </div>
      {(ent.km_entrega != null || ent.km_devolucion != null) && (
        <div>
          <p className="tarjeta__grupo-titulo">Kilometraje</p>
          <div className="tarjeta__lista">
            {ent.km_entrega != null && <div className="dato"><span className="dato__label">Km entrega</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)' }}>{Number(ent.km_entrega).toLocaleString('es-PE')}</span></div>}
            {ent.km_devolucion != null && <div className="dato"><span className="dato__label">Km devolución</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)' }}>{Number(ent.km_devolucion).toLocaleString('es-PE')}</span></div>}
            {ent.km_entrega != null && ent.km_devolucion != null && (
              <div className="dato">
                <span className="dato__label">Recorrido</span>
                <span className="dato__valor" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {(Number(ent.km_devolucion) - Number(ent.km_entrega)).toLocaleString('es-PE')} km
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      {ent.observaciones && (
        <div>
          <p className="tarjeta__grupo-titulo">Observaciones</p>
          <div className="tarjeta__lista">
            <div className="dato"><span className="dato__valor">{ent.observaciones}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
