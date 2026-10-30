import './checklist.css';
import './ce-portal-lista.css';
import '../../core/ui/acciones-iconos.css';
import '../almacen/almacen.css';
import '../almacen/entradas.css';
import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCheck, ClipboardCheck, ClipboardList, Clock, Eye, FileDown, FileSpreadsheet, Mail, MapPin, Plus, RefreshCw, SearchX, SlidersHorizontal, Trash2, Wrench } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, TextInput } from '../../core/ui/Field';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { MenuOtros, type OpcionOtros } from '../../core/ui/MenuOtros';
import { KpiTarjeta } from '../../core/ui/KpiTarjeta';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { compartirPDF, descargarArchivo } from '../../core/lib/pdf';
import { exportarExcel } from '../../core/lib/excel';
import { formatFechaHoraPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { usePlacas } from '../placas/api';
import { useChecklist, useConfigSistemas, type ReporteFalla } from './api';
import { ReporteFallaNuevo } from './ReporteFallaNuevo';
import { GenerarOTsSheet } from './GenerarOTsSheet';
import { ChecklistDetalle, leerOts } from './ChecklistDetalle';
import { AgregarFallasSheet } from './AgregarFallasSheet';
import { ChecklistPlantilla } from './ChecklistPlantilla';
import { EnviarFallaSheet } from './EnviarFallaSheet';
import { leerFallas, pdfFman, textoFman } from './fman';

type AccionFila = 'detalle' | 'pdf' | 'agregar' | 'ots' | 'correo' | 'eliminar';
type Vista = 'lista' | 'plantilla';
type FiltroEstado = 'TODOS' | 'Pendiente' | 'En Proceso' | 'Finalizado';
interface Permisos { editar: boolean; ots: boolean; eliminar: boolean }

// Empresas del filtro (las mismas del clásico)
const EMPRESAS = ['MARSISA S.A.C.', 'ROSYMAR PERU S.A.C.', 'TRAHESA S.A.C.', 'YOGUI TRANSPORT S.A.C.'];
const CLAVES_EMPRESA: Array<[string, string]> = [['MARSISA', EMPRESAS[0]], ['ROSYMAR', EMPRESAS[1]], ['TRAHESA', EMPRESAS[2]], ['YOGUI', EMPRESAS[3]]];
/** Desde esta anchura se muestra la tabla; antes, tarjetas (igual que Órdenes de compra) */
const TABLA_QUERY = '(min-width: 768px)';

const limpia = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
/** Primer día del mes en curso (Lima): el rango por defecto va del inicio del mes a hoy */
const inicioMes = () => `${hoyLima().slice(0, 7)}-01`;
const estadoDe = (f: ReporteFalla) => f.estado || 'Pendiente';
const etiquetaEstado = (e: string) => (e === 'En Proceso' ? 'En taller' : e);
const colorEstado = (e: string) => (e === 'Pendiente' ? 'amber' : e === 'En Proceso' ? 'blue' : e === 'Finalizado' ? 'green' : 'neutral');
const TONO_ESTADO: Record<string, string> = { amber: 'badge--amber', blue: 'oc-estado--azul', green: 'oc-estado--verde', neutral: 'oc-estado--gris' };

function canonEmpresa(raw: unknown): string {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s || s === '-') return '';
  const r = limpia(s);
  for (const [clave, nombre] of CLAVES_EMPRESA) if (r.includes(clave)) return nombre;
  return s;
}

const COLUMNAS: ColumnaTabla[] = [
  { id: 'acciones', titulo: 'Acciones', ancho: 72, minimo: 64, alinear: 'center' },
  { id: 'folio', titulo: 'Folio', ancho: 150 },
  { id: 'fecha', titulo: 'Fecha', ancho: 160 },
  { id: 'tracto', titulo: 'Tracto', ancho: 110 },
  { id: 'remolque', titulo: 'Remolque', ancho: 120 },
  { id: 'conductor', titulo: 'Conductor / Ruta', ancho: 240 },
  { id: 'estado', titulo: 'Estado', ancho: 120, alinear: 'center' },
  { id: 'ots', titulo: 'OTs generadas', ancho: 230 },
  { id: 'creado', titulo: 'Usuario de creación', ancho: 200 },
];

/** Reporte de fallas: calca de la pantalla del clásico con el diseño de Órdenes de compra (totales, filtros, tabla, plantilla, formulario, OTs y PDF). */
export function ChecklistPage() {
  const [vista, setVista] = useState<Vista>('lista');
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoyLima());
  const { data, isLoading, isError, error, isFetching } = useChecklist(desde, hasta);
  const cfg = useConfigSistemas();
  const placas = usePlacas();
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('TODOS');
  const [filtroEmpresa, setFiltroEmpresa] = useState('TODAS');
  const [detalleId, setDetalleId] = useState<string | number | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [agregando, setAgregando] = useState<ReporteFalla | null>(null);
  const [generando, setGenerando] = useState<ReporteFalla | null>(null);
  const [correo, setCorreo] = useState<ReporteFalla | null>(null);
  const [porEliminar, setPorEliminar] = useState<ReporteFalla | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [exportando, setExportando] = useState(false);
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const esTabla = useMediaQuery(TABLA_QUERY);
  const puedeCrear = can('checklist.crear');
  const permisos: Permisos = {
    editar: can('checklist.editar', 'checklist.crear'),
    ots: puedeCrear,
    eliminar: can('checklist.eliminar'),
  };

  const items = useMemo(() => data ?? [], [data]);
  // Empresa de cada reporte: la del propio reporte o la del cliente de su placa
  const clientePorPlaca = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of placas.data ?? []) m.set(limpia(p.placa), p.cliente);
    return m;
  }, [placas.data]);
  const empresaDe = (f: ReporteFalla) => canonEmpresa(f.empresa) || canonEmpresa(f.empresa_tracto) || canonEmpresa(f.empresa_remolque)
    || canonEmpresa(clientePorPlaca.get(limpia(f.placa_tracto))) || canonEmpresa(clientePorPlaca.get(limpia(f.placa_remolque)));

  // Totales según la empresa elegida (como el clásico)
  const porEmpresa = useMemo(() => (filtroEmpresa === 'TODAS' ? items : items.filter(f => empresaDe(f) === filtroEmpresa)), [items, filtroEmpresa, clientePorPlaca]);
  const cifras = {
    total: porEmpresa.length,
    pendientes: porEmpresa.filter(f => estadoDe(f) === 'Pendiente').length,
    proceso: porEmpresa.filter(f => estadoDe(f) === 'En Proceso').length,
    finalizados: porEmpresa.filter(f => estadoDe(f) === 'Finalizado').length,
  };

  const visibles = useMemo(() => {
    let lista = filtroEstado === 'TODOS' ? porEmpresa : porEmpresa.filter(f => estadoDe(f) === filtroEstado);
    const q = busqueda.trim().toUpperCase();
    if (q) {
      lista = lista.filter(f => [f.folio, f.placa_tracto, f.placa_remolque, f.conductor, f.procedencia, empresaDe(f)]
        .some(x => String(x ?? '').toUpperCase().includes(q)));
    }
    return lista;
  }, [porEmpresa, filtroEstado, busqueda, clientePorPlaca]);

  const detalle = items.find(f => String(f.id) === String(detalleId)) ?? null;
  const formulario = (
    <ReporteFallaNuevo open={nuevo} reporte={null} onClose={() => setNuevo(false)}
      onHecho={() => qc.invalidateQueries({ queryKey: ['flota', 'checklist'] })} />
  );

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await api(`/mantenimiento/checklist/${porEliminar.id}`, { method: 'DELETE' });
      haptic('success'); toast(`Reporte ${porEliminar.folio} eliminado`);
      setPorEliminar(null); setDetalleId(null);
      await qc.invalidateQueries({ queryKey: ['flota', 'checklist'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEliminando(false); }
  }

  // PDF oficial F-MAN-001: se descarga o se comparte por WhatsApp
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

  // Excel: todo el rango de fechas cargado, como el clásico
  async function exportar() {
    setExportando(true);
    try {
      await exportarExcel('Reporte-de-fallas', 'Reportes', [
        'FOLIO', 'ORDEN DE VIAJE', 'FECHA Y HORA', 'PLACA TRACTO', 'PLACA REMOLQUE / CARRETA', 'CONDUCTOR', 'PROCEDENCIA / RUTA',
        'KILOMETRAJE', 'HORAS MOTOR', 'FALLAS TRACTO', 'FALLAS REMOLQUE', 'TOTAL FALLAS', 'ESTADO', 'OTS GENERADAS', 'CREADO POR',
      ], items.map(f => {
        const fT = leerFallas(f.fallas_tracto_json).length;
        const fR = leerFallas(f.fallas_remolque_json).length;
        const ots = leerOts(f.ots_generadas_json).map(o => `${o.idOt} (${o.placa || ''})`).join(', ');
        return [
          f.folio || `F-${f.id}`, f.orden_viaje || 'SIN VIAJE', formatFechaHoraPe(f.fecha_reporte), f.placa_tracto || '—', f.placa_remolque || '—',
          f.conductor || '—', f.procedencia || '—', f.km_inicial ? Number(f.km_inicial) : 0, f.horas_motor != null ? String(f.horas_motor) : '—',
          fT, fR, fT + fR, estadoDe(f).toUpperCase(), ots || 'NINGUNA', String(f.creado_por ?? 'SISTEMA'),
        ];
      }));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
    finally { setExportando(false); }
  }

  function esteMes() { setDesde(inicioMes()); setHasta(hoyLima()); }

  function accion(a: AccionFila, f: ReporteFalla) {
    if (a === 'detalle') setDetalleId(f.id);
    else if (a === 'pdf') pdf(f, 'descargar');
    else if (a === 'agregar') setAgregando(f);
    else if (a === 'ots') setGenerando(f);
    else if (a === 'correo') setCorreo(f);
    else if (a === 'eliminar') setPorEliminar(f);
  }

  /** Acciones de cada reporte: mismo menú «⋯» que Órdenes de compra */
  function opcionesDe(f: ReporteFalla): Array<OpcionOtros | false | null | undefined> {
    const final = /final|anula/i.test(f.estado);
    return [
      { label: 'Ver detalle', icon: <Eye size={17} />, onSelect: () => accion('detalle', f) },
      { label: 'Imprimir PDF F-MAN-001', icon: <FileDown size={17} />, disabled: !cfg.data || generandoPdf, onSelect: () => accion('pdf', f) },
      permisos.editar && !final && { label: 'Agregar fallas', icon: <Plus size={17} />, onSelect: () => accion('agregar', f) },
      permisos.ots && { label: 'Generar / ver OTs', icon: <Wrench size={17} />, onSelect: () => accion('ots', f) },
      { label: 'Enviar por correo', icon: <Mail size={17} />, onSelect: () => accion('correo', f) },
      permisos.eliminar && { label: 'Eliminar', icon: <Trash2 size={17} />, destructiva: true, separado: true, onSelect: () => accion('eliminar', f) },
    ];
  }

  if (vista === 'plantilla') {
    return (
      <Page>
        <ChecklistPlantilla puedeEditar={permisos.editar} onVolver={() => setVista('lista')} />
      </Page>
    );
  }

  const cargando = isLoading;
  const pendientesTotal = items.filter(f => estadoDe(f) === 'Pendiente').length;
  const kpis: Array<{ id: string; filtro: FiltroEstado; etiqueta: string; valor: number; sub: string; tono?: 'ok' | 'warning' | 'valor'; icono: ReactNode }> = [
    { id: 'total', filtro: 'TODOS', etiqueta: 'Total reportes', valor: cifras.total, sub: 'Del rango seleccionado', icono: <ClipboardList size={18} /> },
    { id: 'pend', filtro: 'Pendiente', etiqueta: 'Pendientes', valor: cifras.pendientes, sub: 'Estado pendiente', tono: 'warning', icono: <Clock size={18} /> },
    { id: 'proc', filtro: 'En Proceso', etiqueta: 'En taller / OTs', valor: cifras.proceso, sub: 'Estado en taller', tono: 'valor', icono: <Wrench size={18} /> },
    { id: 'fin', filtro: 'Finalizado', etiqueta: 'Finalizados', valor: cifras.finalizados, sub: 'Estado finalizado', tono: 'ok', icono: <CheckCheck size={18} /> },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Reporte de fallas"
        subtitle={cargando ? 'Cargando…' : `${items.length} ${items.length === 1 ? 'reporte' : 'reportes'}${pendientesTotal ? ` · ${pendientesTotal} pendientes` : ''}`}
        actions={
          <>
            <div className="oc-acciones">
              <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--verde"
                data-tip="Exportar Excel" aria-label="Exportar Excel" disabled={exportando || items.length === 0} onClick={exportar}>
                <FileSpreadsheet size={17} />
              </button>
              <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--azul"
                data-tip="Plantilla" aria-label="Plantilla de reporte de fallas" onClick={() => { haptic('selection'); setVista('plantilla'); }}>
                <SlidersHorizontal size={17} />
              </button>
              <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--celeste"
                data-tip="Actualizar" aria-label="Actualizar" disabled={isFetching} onClick={() => { haptic('selection'); qc.invalidateQueries({ queryKey: ['flota', 'checklist'] }); }}>
                <RefreshCw size={17} className={isFetching ? 'cep-girando' : undefined} />
              </button>
            </div>
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => { haptic('selection'); setNuevo(true); }}>Nuevo reporte</Button>}
          </>
        }
      />

      <div className="inv-kpis" style={{ marginBottom: 'var(--s-4)' }}>
        {kpis.map(k => (
          <KpiTarjeta key={k.id} className="ck-kpi" etiqueta={k.etiqueta} valor={String(k.valor)} sub={k.sub} icono={k.icono} tono={k.tono}
            activo={filtroEstado === k.filtro} onClick={() => { haptic('selection'); setFiltroEstado(k.filtro); }} />
        ))}
      </div>

      <div className="ck-filtros" style={{ marginBottom: 'var(--s-4)' }}>
        <div className="ck-filtros__buscar">
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar folio, placa, conductor…" />
        </div>
        <div className="ck-filtros__fila">
          <div className="ck-rango">
            <TextInput type="date" aria-label="Desde" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} />
            <span className="t-footnote c-secondary">a</span>
            <TextInput type="date" aria-label="Hasta" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} />
            <Button variant="secondary" size="sm" onClick={esteMes}>Este mes</Button>
          </div>
          <div className="ck-empresas" role="group" aria-label="Empresa">
            {['TODAS', ...EMPRESAS].map(e => (
              <button key={e} type="button" aria-pressed={filtroEmpresa === e}
                className={`ck-empresas__op${filtroEmpresa === e ? ' ck-empresas__op--activa' : ''}`}
                onClick={() => { haptic('selection'); setFiltroEmpresa(e); }}>
                {e === 'TODAS' ? 'Todas' : e}
              </button>
            ))}
          </div>
          <span className="badge" style={{ marginLeft: 'auto' }}>
            {cargando ? 'Cargando…' : `${visibles.length} ${visibles.length === 1 ? 'reporte' : 'reportes'}`}
          </span>
        </div>
      </div>

      {isError ? <Notice tone="error">{errorMessage(error)}</Notice> : cargando ? <PageLoader variante="camion" /> : visibles.length === 0 ? (
        <EmptyState icon={busqueda ? <SearchX size={22} /> : <ClipboardCheck size={22} />} title={busqueda ? 'Sin coincidencias' : 'Sin reportes'}>
          {busqueda
            ? <Button variant="secondary" size="sm" onClick={() => setBusqueda('')}>Quitar búsqueda</Button>
            : 'No hay reportes de fallas en este rango de fechas.'}
        </EmptyState>
      ) : esTabla ? (
        <TablaRedimensionable id="checklist-fallas" columnas={COLUMNAS} ariaLabel="Reportes de fallas" altoMax="68vh">
          {visibles.map(f => (
            <tr key={String(f.id)}>
              <Celda alinear="center"><MenuOtros soloIcono label="Acciones" opciones={opcionesDe(f)} /></Celda>
              <Celda>
                <button type="button" className="oc-codigo" onClick={() => accion('detalle', f)} title="Ver detalle">{f.folio}</button>
                {f.orden_viaje && <span className="t-footnote c-secondary" style={{ display: 'block' }}>{f.orden_viaje}</span>}
              </Celda>
              <Celda>{formatFechaHoraPe(f.fecha_reporte)}</Celda>
              <Celda mono>{f.placa_tracto || '—'}</Celda>
              <Celda mono>{f.placa_remolque || '—'}</Celda>
              <Celda>
                <span style={{ display: 'block', fontWeight: 600 }}>{f.conductor || 'Sin conductor'}</span>
                <span className="t-footnote c-secondary"><MapPin size={12} /> {f.procedencia || 'En ruta'}</span>
              </Celda>
              <Celda alinear="center"><EstadoBadge estado={estadoDe(f)} /></Celda>
              <Celda><OtsChips falla={f} /></Celda>
              <Celda>{quienYCuando(f)}</Celda>
            </tr>
          ))}
        </TablaRedimensionable>
      ) : (
        <div className="oc-tarjetas-lista">
          {visibles.map(f => (
            <TarjetaFalla key={String(f.id)} falla={f} opciones={opcionesDe(f)} pdfListo={!!cfg.data && !generandoPdf}
              onDetalle={() => accion('detalle', f)} onPdf={() => accion('pdf', f)} />
          ))}
        </div>
      )}

      {formulario}
      {detalle && (
        <ChecklistDetalle falla={detalle} open
          puedeEditar={permisos.editar} puedeOTs={permisos.ots} puedeEliminar={permisos.eliminar}
          pdfListo={!!cfg.data && !generandoPdf}
          onClose={() => setDetalleId(null)}
          onAgregarFallas={() => { setDetalleId(null); setAgregando(detalle); }}
          onGenerarOTs={() => { setDetalleId(null); setGenerando(detalle); }}
          onPdf={() => pdf(detalle, 'descargar')}
          onWhatsApp={() => pdf(detalle, 'whatsapp')}
          onCorreo={() => { setDetalleId(null); setCorreo(detalle); }}
          onEliminar={() => setPorEliminar(detalle)} />
      )}
      {agregando && <AgregarFallasSheet falla={agregando} open onClose={() => setAgregando(null)} />}
      {generando && <GenerarOTsSheet falla={generando} open onClose={() => setGenerando(null)} />}
      {correo && cfg.data && <EnviarFallaSheet falla={correo} cfg={cfg.data} open onClose={() => setCorreo(null)} />}
      <ConfirmSheet open={!!porEliminar} onClose={() => !eliminando && setPorEliminar(null)} onConfirm={eliminar} loading={eliminando}
        title={`¿Eliminar ${porEliminar?.folio ?? 'el reporte'}?`} message="Esta acción no se puede deshacer. El reporte se elimina del sistema." confirmLabel="Eliminar" />
    </Page>
  );
}

/** Estado del reporte con el mismo color que las órdenes de compra */
function EstadoBadge({ estado }: { estado: string }) {
  return <span className={`badge ${TONO_ESTADO[colorEstado(estado)] ?? ''}`.trim()}>{etiquetaEstado(estado)}</span>;
}

/** Quién registró el reporte y a qué hora (la hora es la de creación, en Lima) */
function quienYCuando(f: ReporteFalla) {
  const cuando = f.creado_en ? formatFechaHoraPe(String(f.creado_en)) : '';
  return (
    <>
      {f.creado_por ? String(f.creado_por) : '—'}
      {cuando && <span className="t-footnote c-secondary" style={{ display: 'block' }}>{cuando}</span>}
    </>
  );
}

/** OTs generadas del reporte: chips con número y placa */
function OtsChips({ falla }: { falla: ReporteFalla }) {
  const ots = leerOts(falla.ots_generadas_json);
  if (ots.length === 0) return <span className="ck-ot ck-ot--vacio">Sin OTs</span>;
  return (
    <span className="ck-ots">
      {ots.map(o => <span key={o.idOt} className="ck-ot">{o.idOt}{o.placa ? ` (${o.placa})` : ''}</span>)}
    </span>
  );
}

/** Reporte en pantallas pequeñas: tarjeta igual que las órdenes de compra */
function TarjetaFalla({ falla: f, opciones, pdfListo, onDetalle, onPdf }: {
  falla: ReporteFalla; opciones: Array<OpcionOtros | false | null | undefined>; pdfListo: boolean; onDetalle: () => void; onPdf: () => void;
}) {
  return (
    <article className="oc-tarjeta-orden">
      <div className="oc-tarjeta-orden__cab">
        <button type="button" className="oc-codigo" onClick={onDetalle}>{f.folio}</button>
        <EstadoBadge estado={estadoDe(f)} />
      </div>
      <div className="oc-chips">
        <span className="oc-chip oc-chip--mono">{f.placa_tracto || '—'}</span>
        {f.placa_remolque && <span className="oc-chip oc-chip--mono">{f.placa_remolque}</span>}
      </div>
      <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{f.conductor || 'Sin conductor'}</span>
      <span className="t-footnote c-secondary"><MapPin size={12} /> {f.procedencia || 'En ruta'}</span>
      <span className="t-footnote c-secondary">{formatFechaHoraPe(f.fecha_reporte)}</span>
      <OtsChips falla={f} />
      <div className="oc-tarjeta-orden__pie">
        <div className="oc-tarjeta-orden__acciones" style={{ marginLeft: 'auto' }}>
          <Button size="sm" variant="secondary" icon={<Eye size={14} />} onClick={onDetalle}>Detalle</Button>
          <Button size="sm" variant="secondary" icon={<FileDown size={14} />} disabled={!pdfListo} onClick={onPdf}>PDF</Button>
          <MenuOtros soloIcono label="Acciones" opciones={opciones} />
        </div>
      </div>
    </article>
  );
}
