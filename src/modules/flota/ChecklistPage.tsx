import './flota.css';
import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, ClipboardCheck, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { fallaEstadoColor, fallaEstadoLabel, useChecklist, type ChecklistFalla } from './api';

const LIMITE = 50;
const TODOS = 'Todos';

export function ChecklistPage() {
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaActiva, setBusquedaActiva] = useState('');
  const [filtroEstado, setFiltroEstado] = useState(TODOS);
  const [seleccionado, setSeleccionado] = useState<ChecklistFalla | null>(null);

  const { data, isLoading, isError, error, isFetching } = useChecklist(pagina, LIMITE, busquedaActiva);
  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.ceil(total / LIMITE) || 1;

  const estados = useMemo(() => {
    const set = new Set(items.map(f => f.estado));
    return [TODOS, ...Array.from(set)];
  }, [items]);

  const visibles = useMemo(() => {
    if (filtroEstado === TODOS) return items;
    return items.filter(f => f.estado === filtroEstado);
  }, [items, filtroEstado]);

  function buscar() {
    setBusquedaActiva(busqueda);
    setPagina(1);
  }

  if (seleccionado) {
    return (
      <Page push>
        <FallaDetalle falla={seleccionado} onVolver={() => setSeleccionado(null)} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Reporte de fallas"
        subtitle={isLoading ? 'Cargando…' : `${total} registros`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/checklist') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            <div style={{ flex: 1 }}>
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, conductor, tipo de falla…" />
            </div>
            <Button variant="primary" onClick={buscar} style={{ flexShrink: 0 }}>Buscar</Button>
          </div>

          {estados.length > 2 && (
            <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
              {estados.map(e => (
                <button key={e} type="button"
                  className={`chip${filtroEstado === e ? ' chip--active' : ''}`}
                  onClick={() => { setFiltroEstado(e); haptic('selection'); }}>
                  {e}
                </button>
              ))}
            </div>
          )}

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <ClipboardCheck size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin reportes'}>
              {busquedaActiva
                ? <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setBusquedaActiva(''); }}>Quitar búsqueda</button>
                : 'Los reportes de fallas de conductores aparecerán aquí.'}
            </EmptyState>
          ) : (
            <>
              <div className="tarjeta__lista" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 150ms' }}>
                {visibles.map((f, i) => {
                  const color = fallaEstadoColor(f);
                  const label = fallaEstadoLabel(f);
                  return (
                    <button key={String(f.id ?? i)} type="button"
                      className="ot-fila"
                      onClick={() => { haptic('selection'); setSeleccionado(f); }}>
                      <div className="ot-fila__icono" style={{ background: `var(--${color}-tint)`, color: `var(--${color}-ink)` }}>
                        <ClipboardCheck size={16} />
                      </div>
                      <div className="ot-fila__cuerpo">
                        <span className="ot-fila__placa">{f.placa ?? '—'}</span>
                        {f.conductor && <span className="ot-fila__sub">{f.conductor}</span>}
                        {f.tipo_falla && <span className="ot-fila__sub" style={{ color: 'var(--label-2)' }}>{f.tipo_falla}</span>}
                      </div>
                      <div className="ot-fila__derecha">
                        <span className={`ot-estado ot-estado--${color}`}>{label}</span>
                        {f.prioridad && f.prioridad !== 'Normal' && (
                          <span className="ot-fila__sub" style={{ fontSize: '0.75rem', color: `var(--${f.prioridad === 'Alta' || f.prioridad === 'Crítica' ? 'red' : 'amber'}-ink)` }}>
                            {f.prioridad}
                          </span>
                        )}
                        {f.fecha && <span className="ot-fila__fecha">{String(f.fecha).split('T')[0]}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              {totalPaginas > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--s-3)', padding: 'var(--s-2) 0' }}>
                  <Button variant="secondary" size="sm" icon={<ArrowLeft size={14} />}
                    disabled={pagina <= 1}
                    onClick={() => setPagina(p => Math.max(1, p - 1))}>
                    Anterior
                  </Button>
                  <span style={{ fontSize: '0.875rem', color: 'var(--label-2)' }}>{pagina} / {totalPaginas}</span>
                  <Button variant="secondary" size="sm"
                    disabled={pagina >= totalPaginas}
                    onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>
                    Siguiente <ArrowRight size={14} />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Page>
  );
}

function FallaDetalle({ falla, onVolver }: { falla: ChecklistFalla; onVolver: () => void }) {
  const color = fallaEstadoColor(falla);
  const label = fallaEstadoLabel(falla);
  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Reporte de fallas
        </button>
      </div>
      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${color}`}>{label}</span>
        <h2 className="ot-ficha__placa">{falla.placa ?? '—'}</h2>
        {falla.fecha && <span className="ot-ficha__id">{String(falla.fecha).split('T')[0]}</span>}
      </div>
      <div>
        <p className="tarjeta__grupo-titulo">Reporte</p>
        <div className="tarjeta__lista">
          {falla.conductor && <div className="dato"><span className="dato__label">Conductor</span><span className="dato__valor">{falla.conductor}</span></div>}
          {falla.tipo_falla && <div className="dato"><span className="dato__label">Tipo de falla</span><span className="dato__valor">{falla.tipo_falla}</span></div>}
          {falla.prioridad && <div className="dato"><span className="dato__label">Prioridad</span><span className="dato__valor" style={{ color: falla.prioridad === 'Alta' || falla.prioridad === 'Crítica' ? 'var(--red-ink)' : undefined, fontWeight: 600 }}>{falla.prioridad}</span></div>}
          {falla.area_responsable && <div className="dato"><span className="dato__label">Área responsable</span><span className="dato__valor">{falla.area_responsable}</span></div>}
          {falla.descripcion && <div className="dato"><span className="dato__label">Descripción</span><span className="dato__valor">{falla.descripcion}</span></div>}
          {falla.observaciones && <div className="dato"><span className="dato__label">Observaciones</span><span className="dato__valor">{falla.observaciones}</span></div>}
        </div>
      </div>
      {falla.imagen_url && (
        <div style={{ paddingTop: 'var(--s-3)' }}>
          <img src={String(falla.imagen_url)} alt="Evidencia de falla"
            style={{ maxWidth: '100%', borderRadius: 'var(--radius-2)', border: '1px solid var(--separator)' }} />
        </div>
      )}
    </div>
  );
}
