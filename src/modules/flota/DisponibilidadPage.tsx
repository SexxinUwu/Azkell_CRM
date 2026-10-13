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
import { estadoDispColor, useDisponibilidad, type VehiculoDisponibilidad } from './api';

const TODOS = 'Todos';
const FILTROS = [TODOS, 'En Base', 'En Ruta', 'En Mantenimiento'] as const;

export function DisponibilidadPage() {
  const { data, isLoading, isError, error, dataUpdatedAt } = useDisponibilidad();
  const [filtro, setFiltro] = useState(TODOS);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<VehiculoDisponibilidad | null>(null);

  const vehiculos = data ?? [];

  const conteos = useMemo(() => {
    const m: Record<string, number> = { 'En Base': 0, 'En Ruta': 0, 'En Mantenimiento': 0 };
    for (const v of vehiculos) {
      const e = (v.estado || '').toLowerCase();
      if (e.includes('ruta')) m['En Ruta'] = (m['En Ruta'] ?? 0) + 1;
      else if (e.includes('mantenimiento') || e.includes('taller')) m['En Mantenimiento'] = (m['En Mantenimiento'] ?? 0) + 1;
      else m['En Base'] = (m['En Base'] ?? 0) + 1;
    }
    return m;
  }, [vehiculos]);

  const visibles = useMemo(() => {
    let lista = vehiculos;
    if (filtro !== TODOS) {
      lista = lista.filter(v => {
        const e = (v.estado || '').toLowerCase();
        if (filtro === 'En Ruta') return e.includes('ruta');
        if (filtro === 'En Mantenimiento') return e.includes('mantenimiento') || e.includes('taller');
        return !e.includes('ruta') && !e.includes('mantenimiento') && !e.includes('taller');
      });
    }
    if (busqueda) {
      const q = busqueda.toUpperCase();
      lista = lista.filter(v =>
        v.placa_camion.toUpperCase().includes(q) ||
        v.placa_carreta.toUpperCase().includes(q) ||
        (v.conductor_asignado || '').toUpperCase().includes(q) ||
        (v.empresa || '').toUpperCase().includes(q)
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

  const actualizado = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Disponibilidad"
        subtitle={isLoading ? 'Cargando…' : `${vehiculos.length} unidades${actualizado ? ` · ${actualizado}` : ''}`}
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
            {FILTROS.map(f => {
              const cnt = f === TODOS ? vehiculos.length : (conteos[f] ?? 0);
              const color = f === TODOS ? '' : estadoDispColor(f);
              return (
                <button key={f} type="button"
                  className={`chip${filtro === f ? ' chip--active' : ''}`}
                  onClick={() => { setFiltro(f); haptic('selection'); }}>
                  {f !== TODOS && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: `var(--${color}-ink)`, marginRight: 4 }} />}
                  {f} <span className="chip__badge">{cnt}</span>
                </button>
              );
            })}
          </div>

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, conductor, empresa…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <Gauge size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin vehículos'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'No hay vehículos para los filtros actuales.'}
            </EmptyState>
          ) : (
            <div className="disp-grid">
              <AnimatePresence mode="popLayout">
                {visibles.map((v, i) => {
                  const color = estadoDispColor(v.estado);
                  const placaPrincipal = v.placa_camion || v.placa_carreta;
                  return (
                    <motion.button key={`${placaPrincipal}-${i}`} type="button"
                      className="disp-card"
                      style={{ '--disp-color': `var(--${color}-ink)` } as React.CSSProperties}
                      onClick={() => { haptic('selection'); setSeleccionado(v); }}
                      layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span className="disp-card__placa">{placaPrincipal || '—'}</span>
                        <span className={`ot-estado ot-estado--${color}`}>{v.estado}</span>
                      </div>
                      {v.placa_carreta && v.placa_camion && (
                        <span className="disp-card__tipo" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                          + {v.placa_carreta}
                        </span>
                      )}
                      <span className="disp-card__tipo">{[v.sub_tipo, v.marca].filter(Boolean).join(' · ') || v.tipo_unidad || '—'}</span>
                      {v.conductor_asignado && <span className="disp-card__conductor">{v.conductor_asignado}</span>}
                      {v.empresa && v.empresa !== v.conductor_asignado && (
                        <span className="disp-card__tipo">{v.empresa}</span>
                      )}
                      {v.observaciones && <span className="disp-card__tipo" style={{ color: 'var(--label-2)', fontSize: '0.75rem' }}>{v.observaciones}</span>}
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
  const placaPrincipal = veh.placa_camion || veh.placa_carreta;
  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Disponibilidad
        </button>
      </div>
      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${color}`}>{veh.estado}</span>
        <h2 className="ot-ficha__placa">{placaPrincipal}</h2>
        <span className="ot-ficha__id">{[veh.sub_tipo, veh.tipo_unidad].filter(Boolean).join(' · ')}</span>
      </div>
      <div>
        <p className="tarjeta__grupo-titulo">Unidad</p>
        <div className="tarjeta__lista">
          {veh.placa_camion && <div className="dato"><span className="dato__label">Placa camión</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{veh.placa_camion}</span></div>}
          {veh.placa_carreta && <div className="dato"><span className="dato__label">Placa carreta</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)' }}>{veh.placa_carreta}</span></div>}
          {veh.marca && <div className="dato"><span className="dato__label">Marca</span><span className="dato__valor">{veh.marca}</span></div>}
          {veh.empresa && <div className="dato"><span className="dato__label">Empresa</span><span className="dato__valor">{veh.empresa}</span></div>}
          {veh.capacidad_tanque && veh.capacidad_tanque !== '—' && <div className="dato"><span className="dato__label">Capacidad tanque</span><span className="dato__valor">{veh.capacidad_tanque}</span></div>}
        </div>
      </div>
      <div>
        <p className="tarjeta__grupo-titulo">Estado actual</p>
        <div className="tarjeta__lista">
          {veh.conductor_asignado && <div className="dato"><span className="dato__label">Conductor</span><span className="dato__valor">{veh.conductor_asignado}</span></div>}
          {veh.observaciones && <div className="dato"><span className="dato__label">Observaciones</span><span className="dato__valor">{veh.observaciones}</span></div>}
          {!veh.conductor_asignado && !veh.observaciones && (
            <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Sin detalles adicionales</span></div>
          )}
        </div>
      </div>
    </div>
  );
}
