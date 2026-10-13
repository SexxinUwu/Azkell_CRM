import './mant.css';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { useIncidencias, type IncidenciaRuta } from './api';

const LIMITE = 50;

export function IncidenciasPage() {
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaActiva, setBusquedaActiva] = useState('');
  const [seleccionada, setSeleccionada] = useState<IncidenciaRuta | null>(null);

  const { data, isLoading, isError, error, isFetching } = useIncidencias(pagina, LIMITE, busquedaActiva);
  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.ceil(total / LIMITE) || 1;

  function buscar() {
    setBusquedaActiva(busqueda);
    setPagina(1);
  }

  const soloDetalle = !!seleccionada;

  return (
    <Page>
      {!soloDetalle && (
        <PageHeader
          eyebrow="Mantenimiento"
          title="Incidencias en ruta"
          subtitle={isLoading ? 'Cargando…' : `${total} registros`}
          actions={
            <MenuOtros opciones={[
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/incidencias-ruta') },
            ]} />
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : soloDetalle ? (
        <IncidenciaDetalle inc={seleccionada} onVolver={() => setSeleccionada(null)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            <div style={{ flex: 1 }}>
              <SearchField
                value={busqueda}
                onChange={setBusqueda}
                placeholder="Placa, conductor, motivo, falla…"
              />
            </div>
            <Button variant="primary" onClick={buscar} style={{ flexShrink: 0 }}>
              Buscar
            </Button>
          </div>

          {items.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={22} />} title="Sin incidencias">
              {busquedaActiva
                ? <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setBusquedaActiva(''); }}>Quitar búsqueda</button>
                : 'No hay incidencias registradas para los filtros actuales.'}
            </EmptyState>
          ) : (
            <>
              <div className="tarjeta__lista" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 150ms' }}>
                {items.map((inc, i) => {
                  const atendido = inc.solucionado !== 'Pendiente';
                  const tono = atendido ? 'green' : 'red';
                  return (
                    <button key={String(inc.id ?? i)} type="button" className="ot-fila"
                      onClick={() => { haptic('selection'); setSeleccionada(inc); }}>
                      <div className="ot-fila__icono" style={{ background: `var(--${tono}-tint)`, color: `var(--${tono}-ink)` }}>
                        <ShieldCheck size={16} />
                      </div>
                      <div className="ot-fila__cuerpo">
                        <span className="ot-fila__sub" style={{ display: 'flex', gap: '0.375rem' }}>
                          <span className="ot-fila__placa">{inc.placa ?? '—'}</span>
                          {inc.conductor ? ` · ${inc.conductor}` : ''}
                        </span>
                        <span className="ot-fila__sub">
                          {inc.motivo ?? '—'}
                          {inc.falla ? ` — ${inc.falla}` : ''}
                        </span>
                      </div>
                      <div className="ot-fila__derecha">
                        <span className={`ot-estado ot-estado--${tono}`}>{atendido ? 'Atendido' : 'Pendiente'}</span>
                        {inc.total_costo != null && Number(inc.total_costo) > 0 && (
                          <span className="ot-fila__costo">S/ {Number(inc.total_costo).toFixed(2)}</span>
                        )}
                        <span className="ot-fila__fecha">{String(inc.fecha_falla ?? '—').split('T')[0]}</span>
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
                  <span style={{ fontSize: '0.875rem', color: 'var(--label-2)' }}>
                    {pagina} / {totalPaginas}
                  </span>
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

function IncidenciaDetalle({ inc, onVolver }: { inc: IncidenciaRuta; onVolver: () => void }) {
  const atendido = inc.solucionado !== 'Pendiente';
  const tono = atendido ? 'green' : 'red';
  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Incidencias
        </button>
      </div>
      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${tono}`}>{atendido ? 'Atendido' : 'Pendiente'}</span>
        <h2 className="ot-ficha__placa">{inc.placa ?? '—'}</h2>
        <span className="ot-ficha__id">{String(inc.fecha_falla ?? '').split('T')[0]}</span>
      </div>
      <div>
        <p className="tarjeta__grupo-titulo">Incidencia</p>
        <div className="tarjeta__lista">
          {inc.conductor && <div className="dato"><span className="dato__label">Conductor</span><span className="dato__valor">{inc.conductor}</span></div>}
          {inc.ubicacion && <div className="dato"><span className="dato__label">Ubicación</span><span className="dato__valor">{inc.ubicacion}</span></div>}
          {inc.motivo && <div className="dato"><span className="dato__label">Motivo</span><span className="dato__valor">{inc.motivo}</span></div>}
          {inc.falla && <div className="dato"><span className="dato__label">Falla</span><span className="dato__valor">{inc.falla}</span></div>}
          {inc.area_responsable && <div className="dato"><span className="dato__label">Área responsable</span><span className="dato__valor">{inc.area_responsable}</span></div>}
          {inc.total_costo != null && Number(inc.total_costo) > 0 && (
            <div className="dato"><span className="dato__label">Costo total</span><span className="dato__valor" style={{ fontWeight: 700 }}>S/ {Number(inc.total_costo).toFixed(2)}</span></div>
          )}
        </div>
      </div>
    </div>
  );
}
