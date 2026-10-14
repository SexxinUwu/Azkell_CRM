import './flota.css';
import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ClipboardCheck, FileSpreadsheet, Plus, SearchX, Trash2, Wrench } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { fallaEstadoColor, useChecklist, type ReporteFalla } from './api';
import { ReporteFallaNuevo } from './ReporteFallaNuevo';
import { GenerarOTsSheet } from './GenerarOTsSheet';

const TODOS = 'Todos';

export function ChecklistPage() {
  const { data, isLoading, isError, error } = useChecklist();
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState(TODOS);
  const [seleccionado, setSeleccionado] = useState<ReporteFalla | null>(null);
  const [porEliminar, setPorEliminar] = useState<ReporteFalla | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [generando, setGenerando] = useState<ReporteFalla | null>(null);
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const puedeEliminar = can('checklist.eliminar');
  const puedeCrear = can('checklist.crear');

  const items = data ?? [];

  const estados = useMemo(() => {
    const set = new Set(items.map(f => f.estado));
    return [TODOS, ...Array.from(set)];
  }, [items]);

  const visibles = useMemo(() => {
    let lista = filtroEstado === TODOS ? items : items.filter(f => f.estado === filtroEstado);
    if (busqueda) {
      const q = busqueda.toUpperCase();
      lista = lista.filter(f =>
        (f.placa_tracto ?? '').toUpperCase().includes(q) ||
        (f.placa_remolque ?? '').toUpperCase().includes(q) ||
        (f.conductor ?? '').toUpperCase().includes(q) ||
        (f.folio ?? '').toUpperCase().includes(q) ||
        (f.fallas_libres_text ?? '').toUpperCase().includes(q)
      );
    }
    return lista;
  }, [items, filtroEstado, busqueda]);

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await api(`/mantenimiento/checklist/${porEliminar.id}`, { method: 'DELETE' });
      haptic('success'); toast(`Reporte ${porEliminar.folio} eliminado`);
      setPorEliminar(null); setSeleccionado(null);
      await qc.invalidateQueries({ queryKey: ['flota', 'checklist'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEliminando(false); }
  }

  async function exportar() {
    try {
      await exportarExcel('Reporte-de-fallas', 'Reportes',
        ['Folio', 'Fecha', 'Estado', 'Tracto', 'Remolque', 'Conductor', 'Procedencia', 'Km inicial', 'Km final', 'Orden de viaje', 'Fallas / observaciones'],
        visibles.map(f => [f.folio, String(f.fecha_reporte ?? '').split('T')[0], f.estado, f.placa_tracto, f.placa_remolque,
          f.conductor, f.procedencia, f.km_inicial, f.km_final, f.orden_viaje, f.fallas_libres_text]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  if (seleccionado) {
    return (
      <Page push>
        <FallaDetalle
          falla={seleccionado}
          onVolver={() => setSeleccionado(null)}
          onEliminar={puedeEliminar ? () => setPorEliminar(seleccionado) : undefined}
          onGenerarOTs={puedeCrear && !/final|anula/i.test(seleccionado.estado) ? () => setGenerando(seleccionado) : undefined}
        />
        {generando && <GenerarOTsSheet falla={generando} open onClose={() => setGenerando(null)} />}
        <ConfirmSheet open={!!porEliminar} onClose={() => !eliminando && setPorEliminar(null)} onConfirm={eliminar} loading={eliminando}
          title={`¿Eliminar ${porEliminar?.folio ?? 'el reporte'}?`} message="Esta acción no se puede deshacer." confirmLabel="Eliminar" />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Reporte de fallas"
        subtitle={isLoading ? 'Cargando…' : `${items.length} reportes`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} reportes`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'Configurar sistemas de revisión', detalle: 'Se abre en la versión actual', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('mantenimiento/checklist') },
            ]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setNuevo(true)}>Nuevo reporte</Button>}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, conductor, folio, falla…" />

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
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Los reportes de fallas aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              {visibles.map((f, i) => {
                const color = fallaEstadoColor(f);
                const placa = f.placa_tracto || f.placa_remolque || '—';
                return (
                  <button key={String(f.id ?? i)} type="button"
                    className="ot-fila"
                    onClick={() => { haptic('selection'); setSeleccionado(f); }}>
                    <div className="ot-fila__icono" style={{ background: `var(--${color}-tint)`, color: `var(--${color}-ink)` }}>
                      <ClipboardCheck size={16} />
                    </div>
                    <div className="ot-fila__cuerpo">
                      <span style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                        <span className="ot-fila__placa">{placa}</span>
                        {f.placa_remolque && f.placa_tracto && (
                          <span className="ot-fila__sub" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>+ {f.placa_remolque}</span>
                        )}
                      </span>
                      {f.conductor && <span className="ot-fila__sub">{f.conductor}</span>}
                      {f.fallas_libres_text && (
                        <span className="ot-fila__sub" style={{ color: 'var(--label-2)', fontSize: '0.8125rem' }}
                          title={f.fallas_libres_text}>
                          {String(f.fallas_libres_text).slice(0, 60)}{String(f.fallas_libres_text).length > 60 ? '…' : ''}
                        </span>
                      )}
                    </div>
                    <div className="ot-fila__derecha">
                      <span className={`ot-estado ot-estado--${color}`}>{f.estado}</span>
                      <span className="ot-fila__sub" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--label-2)' }}>{f.folio}</span>
                      {f.fecha_reporte && <span className="ot-fila__fecha">{String(f.fecha_reporte).split('T')[0]}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      <ReporteFallaNuevo open={nuevo} onClose={() => setNuevo(false)} onHecho={() => qc.invalidateQueries({ queryKey: ['flota', 'checklist'] })} />
    </Page>
  );
}

function FallaDetalle({ falla, onVolver, onEliminar, onGenerarOTs }: {
  falla: ReporteFalla; onVolver: () => void; onEliminar?: () => void; onGenerarOTs?: () => void;
}) {
  const color = fallaEstadoColor(falla);
  const placa = falla.placa_tracto || falla.placa_remolque || '—';

  let fallasTracto: string[] = [];
  let fallasRemolque: string[] = [];
  try {
    const ft = typeof falla.fallas_tracto_json === 'string' ? JSON.parse(falla.fallas_tracto_json as string) : falla.fallas_tracto_json;
    if (Array.isArray(ft)) fallasTracto = ft.flatMap((s: Record<string, unknown>) =>
      Array.isArray(s.items) ? (s.items as Array<{ nombre?: string; ok?: boolean }>).filter(i => !i.ok).map(i => `${s.titulo ?? ''}: ${i.nombre ?? ''}`) : []
    );
  } catch {}
  try {
    const fr = typeof falla.fallas_remolque_json === 'string' ? JSON.parse(falla.fallas_remolque_json as string) : falla.fallas_remolque_json;
    if (Array.isArray(fr)) fallasRemolque = fr.flatMap((s: Record<string, unknown>) =>
      Array.isArray(s.items) ? (s.items as Array<{ nombre?: string; ok?: boolean }>).filter(i => !i.ok).map(i => `${s.titulo ?? ''}: ${i.nombre ?? ''}`) : []
    );
  } catch {}

  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Reporte de fallas
        </button>
        {(onGenerarOTs || onEliminar) && (
          <div className="tarjeta__barra-acciones">
            {onGenerarOTs && <Button variant="primary" icon={<Wrench size={16} />} onClick={onGenerarOTs}>Generar OTs</Button>}
            {onEliminar && <Button variant="secondary" icon={<Trash2 size={16} />} onClick={onEliminar}>Eliminar</Button>}
          </div>
        )}
      </div>
      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${color}`}>{falla.estado}</span>
        <h2 className="ot-ficha__placa">{placa}</h2>
        <span className="ot-ficha__id">{falla.folio}{falla.fecha_reporte ? ` · ${String(falla.fecha_reporte).split('T')[0]}` : ''}</span>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Información</p>
        <div className="tarjeta__lista">
          {falla.conductor && <div className="dato"><span className="dato__label">Conductor</span><span className="dato__valor">{falla.conductor}</span></div>}
          {falla.placa_tracto && <div className="dato"><span className="dato__label">Tracto</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)' }}>{falla.placa_tracto}</span></div>}
          {falla.placa_remolque && <div className="dato"><span className="dato__label">Remolque</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)' }}>{falla.placa_remolque}</span></div>}
          {falla.procedencia && <div className="dato"><span className="dato__label">Procedencia</span><span className="dato__valor">{falla.procedencia}</span></div>}
          {falla.ubicacion_gps && <div className="dato"><span className="dato__label">Ubicación GPS</span><span className="dato__valor">{falla.ubicacion_gps}</span></div>}
          {falla.km_inicial != null && <div className="dato"><span className="dato__label">Km inicial</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)' }}>{Number(falla.km_inicial).toLocaleString('es-PE')}</span></div>}
          {falla.km_final != null && Number(falla.km_final) > 0 && <div className="dato"><span className="dato__label">Km final</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)' }}>{Number(falla.km_final).toLocaleString('es-PE')}</span></div>}
          {falla.orden_viaje && <div className="dato"><span className="dato__label">Orden de viaje</span><span className="dato__valor">{falla.orden_viaje}</span></div>}
        </div>
      </div>

      {(fallasTracto.length > 0 || falla.fallas_libres_text) && (
        <div>
          <p className="tarjeta__grupo-titulo">Fallas reportadas</p>
          <div className="tarjeta__lista">
            {fallasTracto.map((f, i) => (
              <div key={i} className="dato"><span className="dato__valor" style={{ color: 'var(--red-ink)' }}>⚠ {f}</span></div>
            ))}
            {fallasRemolque.map((f, i) => (
              <div key={`r${i}`} className="dato"><span className="dato__valor" style={{ color: 'var(--amber-ink)' }}>⚠ {f}</span></div>
            ))}
            {falla.fallas_libres_text && (
              <div className="dato"><span className="dato__label">Observaciones</span><span className="dato__valor">{falla.fallas_libres_text}</span></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
