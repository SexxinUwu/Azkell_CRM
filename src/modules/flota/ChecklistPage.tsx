import './flota.css';
import '../mantenimiento/mant.css';
import './fman.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, ListChecks, FileSpreadsheet, FileText, MessageCircle, Pencil, Plus, SearchX, Trash2, Wrench } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { compartirPDF, descargarArchivo } from '../../core/lib/pdf';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { fallaEstadoColor, useChecklist, useConfigSistemas, type ReporteFalla } from './api';
import { ReporteFallaNuevo } from './ReporteFallaNuevo';
import { GenerarOTsSheet } from './GenerarOTsSheet';
import { ConfigSistemasSheet } from './ConfigSistemasSheet';
import { leerFallas, pdfFman, textoFman, type FallaGuardada } from './fman';
import { formatFechaHoraPe } from '../../core/lib/format';

const TODOS = 'Todos';

export function ChecklistPage() {
  // Por defecto, los reportes del día de hoy (hora de Lima); para otro periodo se cambian las fechas
  const hoyLima = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const [desde, setDesde] = useState(hoyLima);
  const [hasta, setHasta] = useState(hoyLima);
  const { data, isLoading, isError, error } = useChecklist(desde, hasta);
  const cfg = useConfigSistemas();
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState(TODOS);
  const [filtroEmpresa, setFiltroEmpresa] = useState(TODOS);
  const [seleccionadoId, setSeleccionadoId] = useState<string | number | null>(null);
  const [porEliminar, setPorEliminar] = useState<ReporteFalla | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<ReporteFalla | null>(null);
  const [generando, setGenerando] = useState<ReporteFalla | null>(null);
  const [configurando, setConfigurando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const puedeEliminar = can('checklist.eliminar');
  const puedeCrear = can('checklist.crear');
  const puedeEditar = can('checklist.editar', 'checklist.crear');

  const items = data ?? [];
  // El detalle siempre muestra la versión más reciente del reporte (tras editar o generar OTs)
  const seleccionado = items.find(f => String(f.id) === String(seleccionadoId)) ?? null;

  const estados = useMemo(() => [TODOS, ...Array.from(new Set(items.map(f => f.estado)))], [items]);
  const empresas = useMemo(() => [TODOS, ...Array.from(new Set(items.map(f => f.empresa ?? '').filter(Boolean))).sort()], [items]);

  const visibles = useMemo(() => {
    let lista = filtroEstado === TODOS ? items : items.filter(f => f.estado === filtroEstado);
    if (filtroEmpresa !== TODOS) lista = lista.filter(f => f.empresa === filtroEmpresa);
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
  }, [items, filtroEstado, filtroEmpresa, busqueda]);

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await api(`/mantenimiento/checklist/${porEliminar.id}`, { method: 'DELETE' });
      haptic('success'); toast(`Reporte ${porEliminar.folio} eliminado`);
      setPorEliminar(null); setSeleccionadoId(null);
      await qc.invalidateQueries({ queryKey: ['flota', 'checklist'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEliminando(false); }
  }

  async function exportar() {
    try {
      await exportarExcel('Reporte-de-fallas', 'Reportes',
        ['Folio', 'Fecha', 'Estado', 'Tracto', 'Remolque', 'Conductor', 'Procedencia', 'Km inicial', 'Km final', 'Orden de viaje', 'Fallas / observaciones'],
        visibles.map(f => [f.folio, formatFechaHoraPe(f.fecha_reporte), f.estado, f.placa_tracto, f.placa_remolque,
          f.conductor, f.procedencia, f.km_inicial, f.km_final, f.orden_viaje, f.fallas_libres_text]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  // PDF oficial F-MAN-001 del reporte: se descarga o se comparte por WhatsApp
  async function pdf(f: ReporteFalla, modo: 'descargar' | 'whatsapp') {
    if (!cfg.data) { toast('Cargando la configuración de sistemas…', 'error'); return; }
    setGenerandoPdf(true);
    try {
      const blob = await pdfFman(f, cfg.data);
      const nombre = `F-MAN-001 ${f.folio}.pdf`;
      if (modo === 'descargar') {
        descargarArchivo(blob, nombre);
      } else {
        const r = await compartirPDF(blob, nombre, textoFman(f));
        if (r === 'descargado') toast('PDF descargado. Adjúntalo en la conversación de WhatsApp.');
      }
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setGenerandoPdf(false); }
  }

  const formulario = (
    <ReporteFallaNuevo open={nuevo || !!editando} reporte={editando} onClose={() => { setNuevo(false); setEditando(null); }}
      onHecho={() => qc.invalidateQueries({ queryKey: ['flota', 'checklist'] })} />
  );

  if (seleccionado) {
    const estadoFinal = /final|anula/i.test(seleccionado.estado);
    return (
      <Page push>
        <FallaDetalle
          falla={seleccionado}
          pdfListo={!!cfg.data && !generandoPdf}
          onVolver={() => setSeleccionadoId(null)}
          onEditar={puedeEditar && !estadoFinal ? () => setEditando(seleccionado) : undefined}
          onEliminar={puedeEliminar ? () => setPorEliminar(seleccionado) : undefined}
          onGenerarOTs={puedeCrear && !estadoFinal ? () => setGenerando(seleccionado) : undefined}
          onPdf={() => pdf(seleccionado, 'descargar')}
          onWhatsApp={() => pdf(seleccionado, 'whatsapp')}
        />
        {generando && <GenerarOTsSheet falla={generando} open onClose={() => setGenerando(null)} />}
        {formulario}
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
              ...(puedeEditar ? [{ label: 'Configurar sistemas de revisión', detalle: 'Tracto y remolque', icon: <ListChecks size={17} />, separado: true, onSelect: () => setConfigurando(true) }] : []),
            ]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setNuevo(true)}>Nuevo reporte</Button>}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /></label>
            <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></label>
            <Button variant="secondary" onClick={() => { setDesde(hoyLima); setHasta(hoyLima); }}>Hoy</Button>
          </div>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, conductor, folio, falla…" />

          {estados.length > 2 && (
            <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
              {estados.map(e => (
                <button key={e} type="button"
                  className={`chip pressable${filtroEstado === e ? ' chip--active' : ''}`}
                  onClick={() => { setFiltroEstado(e); haptic('selection'); }}>
                  {e}
                </button>
              ))}
            </div>
          )}

          {empresas.length > 2 && (
            <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }} aria-label="Empresa">
              {empresas.map(e => (
                <button key={e} type="button"
                  className={`chip pressable${filtroEmpresa === e ? ' chip--active' : ''}`}
                  onClick={() => { setFiltroEmpresa(e); haptic('selection'); }}>
                  {e === TODOS ? 'Todas las empresas' : e}
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
                const fallas = [...leerFallas(f.fallas_tracto_json), ...leerFallas(f.fallas_remolque_json)];
                const resumen = fallas.length
                  ? fallas.map(x => x.item).filter(Boolean).slice(0, 2).join(' · ')
                  : (f.fallas_libres_text ?? '');
                return (
                  <button key={String(f.id ?? i)} type="button"
                    className="ot-fila pressable"
                    onClick={() => { haptic('selection'); setSeleccionadoId(f.id); }}>
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
                      {resumen && (
                        <span className="ot-fila__sub" style={{ color: 'var(--label-2)', fontSize: '0.8125rem' }}
                          title={resumen}>
                          {resumen.slice(0, 60)}{resumen.length > 60 ? '…' : ''}
                        </span>
                      )}
                    </div>
                    <div className="ot-fila__derecha">
                      <span className={`ot-estado ot-estado--${color}`}>{f.estado}</span>
                      <span className="ot-fila__sub" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--label-2)' }}>{f.folio}</span>
                      {f.fecha_reporte && <span className="ot-fila__fecha">{formatFechaHoraPe(f.fecha_reporte)}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {formulario}
      <ConfigSistemasSheet open={configurando} onClose={() => setConfigurando(false)} />
    </Page>
  );
}

function FallaDetalle({ falla, pdfListo, onVolver, onEditar, onEliminar, onGenerarOTs, onPdf, onWhatsApp }: {
  falla: ReporteFalla; pdfListo: boolean; onVolver: () => void;
  onEditar?: () => void; onEliminar?: () => void; onGenerarOTs?: () => void; onPdf: () => void; onWhatsApp: () => void;
}) {
  const color = fallaEstadoColor(falla);
  const placa = falla.placa_tracto || falla.placa_remolque || '—';
  const tracto = leerFallas(falla.fallas_tracto_json);
  const remolque = leerFallas(falla.fallas_remolque_json);
  const linea = (f: FallaGuardada, i: number, color: string) => (
    <div key={i} className="dato" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <span className="dato__valor" style={{ color: `var(--${color}-ink)` }}>⚠ {f.sistema ? `${f.sistema}: ` : ''}{f.item}</span>
      {f.obs && f.obs !== f.item && <span className="t-footnote c-secondary">{f.obs}</span>}
    </div>
  );

  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Reporte de fallas
        </button>
        <div className="tarjeta__barra-acciones" style={{ flexWrap: 'wrap' }}>
          <Button variant="secondary" icon={<FileText size={16} />} onClick={onPdf} disabled={!pdfListo}>PDF F-MAN-001</Button>
          <Button variant="secondary" icon={<MessageCircle size={16} />} onClick={onWhatsApp} disabled={!pdfListo}>WhatsApp</Button>
          {onEditar && <Button variant="secondary" icon={<Pencil size={16} />} onClick={onEditar}>Editar</Button>}
          {onGenerarOTs && <Button variant="primary" icon={<Wrench size={16} />} onClick={onGenerarOTs}>Generar OTs</Button>}
          {onEliminar && <Button variant="secondary" icon={<Trash2 size={16} />} onClick={onEliminar}>Eliminar</Button>}
        </div>
      </div>
      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${color}`}>{falla.estado}</span>
        <h2 className="ot-ficha__placa">{placa}</h2>
        <span className="ot-ficha__id">{falla.folio}{falla.fecha_reporte ? ` · ${formatFechaHoraPe(falla.fecha_reporte)}` : ''}</span>
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

      {(tracto.length > 0 || remolque.length > 0 || falla.fallas_libres_text) && (
        <div>
          <p className="tarjeta__grupo-titulo">Fallas reportadas</p>
          <div className="tarjeta__lista">
            {tracto.map((f, i) => linea(f, i, 'red'))}
            {remolque.map((f, i) => linea(f, 1000 + i, 'amber'))}
            {falla.fallas_libres_text && (
              <div className="dato"><span className="dato__label">Observaciones</span><span className="dato__valor">{falla.fallas_libres_text}</span></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
