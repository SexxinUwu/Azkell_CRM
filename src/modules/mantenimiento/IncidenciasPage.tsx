import './mant.css';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Plus, ShieldCheck } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { useIncidencias, type IncidenciaRuta } from './api';

const LIMITE = 50;
const SOLUCION_INICIAL = { fecha_falla: '', placa: '', conductor: '', motivo: '', falla: '', ubicacion: '', area_responsable: 'Mantenimiento', solucionado: 'Pendiente', observaciones: '' };

interface CatalogoIncidencias {
  data: { placa: string; marca: string; tipo: string }[];
  conductores: string[];
}

const campo = { width: '100%', boxSizing: 'border-box' as const, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', fontSize: '0.875rem' };
const etiqueta = { fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', display: 'block', marginBottom: 4 };

export function IncidenciasPage() {
  const qc = useQueryClient();
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaActiva, setBusquedaActiva] = useState('');
  const [seleccionada, setSeleccionada] = useState<IncidenciaRuta | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(SOLUCION_INICIAL);
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const { data, isLoading, isError, error, isFetching } = useIncidencias(pagina, LIMITE, busquedaActiva);
  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.ceil(total / LIMITE) || 1;

  const catalogo = useQuery<CatalogoIncidencias>({
    queryKey: ['mant', 'incidencias', 'catalogo'],
    queryFn: () => api<CatalogoIncidencias>('/mantenimiento/incidencias-ruta/catalogo-placas'),
    enabled: mostrarForm,
    staleTime: 5 * 60_000,
  });

  function buscar() {
    setBusquedaActiva(busqueda);
    setPagina(1);
  }

  function abrirRegistro() {
    setForm(SOLUCION_INICIAL);
    setErrorForm('');
    setMostrarForm(true);
  }

  async function registrar(e: FormEvent) {
    e.preventDefault();
    if (!form.fecha_falla || !form.placa) {
      setErrorForm('Fecha de falla y placa son obligatorios.');
      return;
    }
    setEnviando(true);
    setErrorForm('');
    try {
      await api('/mantenimiento/incidencias-ruta', { method: 'POST', body: form });
      qc.invalidateQueries({ queryKey: ['mant', 'incidencias'] });
      setMostrarForm(false);
    } catch (err) {
      setErrorForm(errorMessage(err));
    } finally {
      setEnviando(false);
    }
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
              { label: 'Registrar incidencia', icon: <Plus size={17} />, onSelect: abrirRegistro },
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

      <Sheet
        open={mostrarForm}
        onClose={() => setMostrarForm(false)}
        title="Registrar incidencia en ruta"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMostrarForm(false)}>Cancelar</Button>
            <Button variant="primary" loading={enviando} onClick={() => document.getElementById('form-registrar-incidencia')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))}>
              Registrar
            </Button>
          </>
        }
      >
        <form id="form-registrar-incidencia" onSubmit={registrar} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          {errorForm && <Notice tone="error">{errorForm}</Notice>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={etiqueta}>Fecha y hora de la falla *</label>
              <input type="datetime-local" value={form.fecha_falla} onChange={e => setForm(f => ({ ...f, fecha_falla: e.target.value }))} required style={campo} />
            </div>
            <div>
              <label style={etiqueta}>Placa *</label>
              <select value={form.placa} onChange={e => setForm(f => ({ ...f, placa: e.target.value }))} required style={campo}>
                <option value="">Selecciona una placa</option>
                {(catalogo.data?.data ?? []).map(p => <option key={p.placa} value={p.placa}>{p.placa}{p.marca ? ` · ${p.marca}` : ''}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={etiqueta}>Conductor</label>
              <select value={form.conductor} onChange={e => setForm(f => ({ ...f, conductor: e.target.value }))} style={campo}>
                <option value="">Sin asignar</option>
                {(catalogo.data?.conductores ?? []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={etiqueta}>Ubicación</label>
              <input value={form.ubicacion} onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))} placeholder="Ruta, km o punto de referencia" style={campo} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={etiqueta}>Motivo</label>
              <input value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Ej: Parada por falla" style={campo} />
            </div>
            <div>
              <label style={etiqueta}>Falla</label>
              <input value={form.falla} onChange={e => setForm(f => ({ ...f, falla: e.target.value }))} placeholder="Ej: Fuga de aceite" style={campo} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={etiqueta}>Área responsable</label>
              <input value={form.area_responsable} onChange={e => setForm(f => ({ ...f, area_responsable: e.target.value }))} style={campo} />
            </div>
            <div>
              <label style={etiqueta}>Estado</label>
              <select value={form.solucionado} onChange={e => setForm(f => ({ ...f, solucionado: e.target.value }))} style={campo}>
                <option value="Pendiente">Pendiente</option>
                <option value="Atendido">Atendido</option>
              </select>
            </div>
          </div>

          <div>
            <label style={etiqueta}>Observaciones</label>
            <textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} rows={3} style={{ ...campo, resize: 'vertical' }} />
          </div>
        </form>
      </Sheet>
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
