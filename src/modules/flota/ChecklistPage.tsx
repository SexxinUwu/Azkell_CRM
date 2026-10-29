import './checklist.css';
import './ce-portal-lista.css';
import '../../core/ui/acciones-iconos.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCheck, ClipboardCheck, Clock, Eye, FileSpreadsheet, FileText, Mail, MapPin, MoreVertical, Pencil, Plus, RefreshCw, SearchX, SlidersHorizontal, Trash2, Wrench } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { compartirPDF, descargarArchivo } from '../../core/lib/pdf';
import { exportarExcel } from '../../core/lib/excel';
import { formatFechaHoraPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { MOBILE_QUERY, useMediaQuery } from '../../core/lib/useMediaQuery';
import { usePlacas } from '../placas/api';
import { useChecklist, useConfigSistemas, type ReporteFalla } from './api';
import { ReporteFallaNuevo } from './ReporteFallaNuevo';
import { GenerarOTsSheet } from './GenerarOTsSheet';
import { ChecklistDetalle, leerOts } from './ChecklistDetalle';
import { ChecklistPlantilla } from './ChecklistPlantilla';
import { EnviarFallaSheet } from './EnviarFallaSheet';
import { leerFallas, pdfFman, textoFman } from './fman';

type AccionFila = 'detalle' | 'pdf' | 'editar' | 'ots' | 'correo' | 'eliminar';
type Vista = 'lista' | 'plantilla';
type FiltroEstado = 'TODOS' | 'Pendiente' | 'En Proceso' | 'Finalizado';
interface Permisos { editar: boolean; ots: boolean; eliminar: boolean }

// Empresas del filtro (las mismas del clásico)
const EMPRESAS = ['MARSISA S.A.C.', 'ROSYMAR PERU S.A.C.', 'TRAHESA S.A.C.', 'YOGUI TRANSPORT S.A.C.'];
const CLAVES_EMPRESA: Array<[string, string]> = [['MARSISA', EMPRESAS[0]], ['ROSYMAR', EMPRESAS[1]], ['TRAHESA', EMPRESAS[2]], ['YOGUI', EMPRESAS[3]]];

const limpia = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const estadoDe = (f: ReporteFalla) => f.estado || 'Pendiente';
const etiquetaEstado = (e: string) => (e === 'En Proceso' ? 'En taller' : e);
const colorEstado = (e: string) => (e === 'Pendiente' ? 'amber' : e === 'En Proceso' ? 'blue' : e === 'Finalizado' ? 'green' : 'neutral');

function canonEmpresa(raw: unknown): string {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s || s === '-') return '';
  const r = limpia(s);
  for (const [clave, nombre] of CLAVES_EMPRESA) if (r.includes(clave)) return nombre;
  return s;
}

const COLUMNAS: ColumnaTabla[] = [
  { id: 'folio', titulo: 'Folio', ancho: 170 },
  { id: 'fecha', titulo: 'Fecha', ancho: 150 },
  { id: 'tracto', titulo: 'Tracto', ancho: 120 },
  { id: 'remolque', titulo: 'Remolque', ancho: 120 },
  { id: 'conductor', titulo: 'Conductor / Ruta', ancho: 250 },
  { id: 'estado', titulo: 'Estado', ancho: 130, alinear: 'center' },
  { id: 'ots', titulo: 'OTs generadas', ancho: 230 },
  { id: 'acc', titulo: 'Acciones', ancho: 150, alinear: 'center' },
];

/** Reporte de fallas: calca de la pantalla del clásico (totales, filtros, tabla, plantilla, formulario, OTs y PDF). */
export function ChecklistPage() {
  const [vista, setVista] = useState<Vista>('lista');
  const [desde, setDesde] = useState(hoyLima());
  const [hasta, setHasta] = useState(hoyLima());
  const { data, isLoading, isError, error, isFetching } = useChecklist(desde, hasta);
  const cfg = useConfigSistemas();
  const placas = usePlacas();
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('TODOS');
  const [filtroEmpresa, setFiltroEmpresa] = useState('TODAS');
  const [detalleId, setDetalleId] = useState<string | number | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<ReporteFalla | null>(null);
  const [generando, setGenerando] = useState<ReporteFalla | null>(null);
  const [correo, setCorreo] = useState<ReporteFalla | null>(null);
  const [porEliminar, setPorEliminar] = useState<ReporteFalla | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [exportando, setExportando] = useState(false);
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const movil = useMediaQuery(MOBILE_QUERY);
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
  }, [porEmpresa, filtroEstado, busqueda]);

  const detalle = items.find(f => String(f.id) === String(detalleId)) ?? null;
  const formulario = (
    <ReporteFallaNuevo open={nuevo || !!editando} reporte={editando} onClose={() => { setNuevo(false); setEditando(null); }}
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

  function hoy() { setDesde(hoyLima()); setHasta(hoyLima()); }

  function accion(a: AccionFila, f: ReporteFalla) {
    if (a === 'detalle') setDetalleId(f.id);
    else if (a === 'pdf') pdf(f, 'descargar');
    else if (a === 'editar') setEditando(f);
    else if (a === 'ots') setGenerando(f);
    else if (a === 'correo') setCorreo(f);
    else if (a === 'eliminar') setPorEliminar(f);
  }

  if (vista === 'plantilla') {
    return (
      <Page>
        <ChecklistPlantilla puedeEditar={permisos.editar} onVolver={() => setVista('lista')} />
      </Page>
    );
  }

  const kpis = [
    { id: 'total', filtro: 'TODOS' as FiltroEstado, etiqueta: 'Total reportes', valor: cifras.total, fondo: 'var(--blue-tint)', color: 'var(--blue-ink)', Icono: FileText },
    { id: 'pend', filtro: 'Pendiente' as FiltroEstado, etiqueta: 'Pendientes', valor: cifras.pendientes, fondo: 'var(--amber-tint)', color: 'var(--amber-ink)', Icono: Clock },
    { id: 'proc', filtro: 'En Proceso' as FiltroEstado, etiqueta: 'En taller / OTs', valor: cifras.proceso, fondo: 'var(--accent-tint, var(--blue-tint))', color: 'var(--accent)', Icono: Wrench },
    { id: 'fin', filtro: 'Finalizado' as FiltroEstado, etiqueta: 'Finalizados', valor: cifras.finalizados, fondo: 'var(--green-tint)', color: 'var(--green-ink)', Icono: CheckCheck },
  ];
  const cargando = isLoading;

  return (
    <Page>
      <header className="cep-header">
        <div className="cep-header__izq">
          <span className="cep-header__icono" aria-hidden><ClipboardCheck size={22} /></span>
          <div>
            <h2 className="cep-header__titulo">Reporte de Fallas</h2>
            <p className="cep-header__sub">Control de incidencias de flota y órdenes de servicio</p>
          </div>
        </div>
        <div className="cep-header__acciones">
          <div className="acciones-iconos">
            <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--violeta"
              data-tip="Actualizar" aria-label="Actualizar" disabled={isFetching} onClick={() => { haptic('selection'); qc.invalidateQueries({ queryKey: ['flota', 'checklist'] }); }}>
              <RefreshCw size={17} className={isFetching ? 'cep-girando' : undefined} />
            </button>
            <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--ambar"
              data-tip="Plantilla" aria-label="Plantilla de reporte de fallas" onClick={() => { haptic('selection'); setVista('plantilla'); }}>
              <SlidersHorizontal size={17} />
            </button>
            <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--verde"
              data-tip="Exportar Excel" aria-label="Exportar Excel" disabled={exportando || items.length === 0} onClick={exportar}>
              <FileSpreadsheet size={17} />
            </button>
          </div>
          {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => { haptic('selection'); setNuevo(true); }}>Nuevo reporte</Button>}
        </div>
      </header>

      <div className="cep-kpis">
        {kpis.map(k => (
          <button key={k.id} type="button" aria-pressed={filtroEstado === k.filtro}
            className={`cep-kpi ck-kpi--boton${filtroEstado === k.filtro ? ' ck-kpi--activo' : ''}`}
            onClick={() => { haptic('selection'); setFiltroEstado(k.filtro); }}>
            <span className="cep-kpi__icono" style={{ background: k.fondo, color: k.color }} aria-hidden><k.Icono size={18} /></span>
            <div className="cep-kpi__cuerpo">
              <span className="cep-kpi__valor">{k.valor}</span>
              <span className="cep-kpi__etiqueta">{k.etiqueta}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="cep-barra" style={{ flexWrap: 'wrap' }}>
        <div className="cep-barra__buscar">
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar folio, placa, conductor..." />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <input type="date" className="input" aria-label="Desde" title="Desde" value={desde} max={hasta || undefined}
            onChange={e => setDesde(e.target.value)} />
          <span className="t-footnote c-secondary">a</span>
          <input type="date" className="input" aria-label="Hasta" title="Hasta" value={hasta} min={desde || undefined}
            onChange={e => setHasta(e.target.value)} />
          <Button variant="secondary" size="sm" onClick={hoy}>Hoy</Button>
        </div>
        <span className="cep-barra__conteo">{cargando ? 'Cargando…' : `${visibles.length} ${visibles.length === 1 ? 'reporte' : 'reportes'}`}</span>
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

      {isError ? <Notice tone="error">{errorMessage(error)}</Notice> : cargando ? <PageLoader variante="camion" /> : visibles.length === 0 ? (
        <EmptyState icon={busqueda ? <SearchX size={22} /> : <ClipboardCheck size={22} />} title={busqueda ? 'Sin coincidencias' : 'Sin reportes'}>
          {busqueda
            ? <Button variant="secondary" size="sm" onClick={() => setBusqueda('')}>Quitar búsqueda</Button>
            : 'No hay reportes de fallas en este rango de fechas.'}
        </EmptyState>
      ) : movil ? (
        <ul className="cep-lista" aria-label="Reportes de fallas">
          {visibles.map(f => (
            <li key={String(f.id)} className="cep-lista__item" onClick={() => accion('detalle', f)} style={{ cursor: 'pointer' }}>
              <div className="cep-lista__cuerpo">
                <div className="cep-lista__fila">
                  <span className="cep-placa">{f.placa_tracto || '—'}</span>
                  {f.placa_remolque && <span className="cep-inv">+ {f.placa_remolque}</span>}
                </div>
                <span className="cep-lista__titulo">{f.conductor || 'Sin conductor'}</span>
                <span className="cep-lista__sub"><MapPin size={12} /> {f.procedencia || 'En ruta'}</span>
                <span className="cep-lista__sub">{f.folio} · {formatFechaHoraPe(f.fecha_reporte)}</span>
                <OtsChips falla={f} />
              </div>
              <div className="cep-lista__acciones" onClick={e => e.stopPropagation()}>
                <span className={`ot-estado ot-estado--${colorEstado(estadoDe(f))}`}>{etiquetaEstado(estadoDe(f))}</span>
                <AccionesFila falla={f} pdfListo={!!cfg.data && !generandoPdf} permisos={permisos} onAccion={accion} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <TablaRedimensionable id="checklist-fallas" columnas={COLUMNAS} ariaLabel="Reportes de fallas" altoMax="68vh">
          {visibles.map(f => (
            <tr key={String(f.id)} onClick={() => accion('detalle', f)} style={{ cursor: 'pointer' }}>
              <Celda mono>
                <span className="cep-inv">{f.folio}</span>
                {f.orden_viaje && <span className="t-footnote c-secondary" style={{ display: 'block' }}>{f.orden_viaje}</span>}
              </Celda>
              <Celda mono>{formatFechaHoraPe(f.fecha_reporte)}</Celda>
              <Celda><span className="cep-placa">{f.placa_tracto || '—'}</span></Celda>
              <Celda><span className="cep-placa">{f.placa_remolque || '—'}</span></Celda>
              <Celda>
                <span className="cep-recorte" style={{ fontWeight: 600 }}>{f.conductor || 'Sin conductor'}</span>
                <span className="cep-recorte cep-muted" style={{ display: 'block', fontSize: '0.8125rem' }}><MapPin size={12} /> {f.procedencia || 'En ruta'}</span>
              </Celda>
              <Celda alinear="center"><span className={`ot-estado ot-estado--${colorEstado(estadoDe(f))}`}>{etiquetaEstado(estadoDe(f))}</span></Celda>
              <Celda><OtsChips falla={f} /></Celda>
              <Celda alinear="center">
                <AccionesFila falla={f} pdfListo={!!cfg.data && !generandoPdf} permisos={permisos} onAccion={accion} />
              </Celda>
            </tr>
          ))}
        </TablaRedimensionable>
      )}

      {formulario}
      {detalle && (
        <ChecklistDetalle falla={detalle} open
          puedeEditar={permisos.editar} puedeOTs={permisos.ots} puedeEliminar={permisos.eliminar}
          pdfListo={!!cfg.data && !generandoPdf}
          onClose={() => setDetalleId(null)}
          onEditar={() => { setDetalleId(null); setEditando(detalle); }}
          onGenerarOTs={() => { setDetalleId(null); setGenerando(detalle); }}
          onPdf={() => pdf(detalle, 'descargar')}
          onWhatsApp={() => pdf(detalle, 'whatsapp')}
          onCorreo={() => { setDetalleId(null); setCorreo(detalle); }}
          onEliminar={() => setPorEliminar(detalle)} />
      )}
      {generando && <GenerarOTsSheet falla={generando} open onClose={() => setGenerando(null)} />}
      {correo && cfg.data && <EnviarFallaSheet falla={correo} cfg={cfg.data} open onClose={() => setCorreo(null)} />}
      <ConfirmSheet open={!!porEliminar} onClose={() => !eliminando && setPorEliminar(null)} onConfirm={eliminar} loading={eliminando}
        title={`¿Eliminar ${porEliminar?.folio ?? 'el reporte'}?`} message="Esta acción no se puede deshacer. El reporte se elimina del sistema." confirmLabel="Eliminar" />
    </Page>
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

/** Acciones de cada fila: PDF directo y menú con el resto */
function AccionesFila({ falla, pdfListo, permisos, onAccion }: {
  falla: ReporteFalla; pdfListo: boolean; permisos: Permisos; onAccion: (a: AccionFila, f: ReporteFalla) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const final = /final|anula/i.test(falla.estado);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);

  const ir = (a: AccionFila) => { setAbierto(false); haptic('selection'); onAccion(a, falla); };

  return (
    <div className="cep-acciones" role="group" aria-label={`Acciones del reporte ${falla.folio}`} onClick={e => e.stopPropagation()}>
      <Button variant="plain" size="sm" iconOnly icon={<FileText size={16} />} title="Descargar PDF F-MAN-001"
        aria-label={`PDF del reporte ${falla.folio}`} disabled={!pdfListo} onClick={() => ir('pdf')} />
      <div className="ck-menu" ref={ref}>
        <Button variant="plain" size="sm" iconOnly icon={<MoreVertical size={16} />} title="Más acciones"
          aria-label={`Más acciones del reporte ${falla.folio}`} aria-haspopup="menu" aria-expanded={abierto}
          onClick={() => { haptic('selection'); setAbierto(a => !a); }} />
        {abierto && (
          <div className="ck-menu__lista" role="menu">
            <button type="button" role="menuitem" className="ck-menu__op" onClick={() => ir('detalle')}><Eye size={16} /> Ver detalle</button>
            {permisos.editar && !final && <button type="button" role="menuitem" className="ck-menu__op" onClick={() => ir('editar')}><Pencil size={16} /> Editar reporte</button>}
            {permisos.ots && <button type="button" role="menuitem" className="ck-menu__op" onClick={() => ir('ots')}><Wrench size={16} /> Generar / ver OTs</button>}
            <button type="button" role="menuitem" className="ck-menu__op" onClick={() => ir('correo')}><Mail size={16} /> Enviar por correo</button>
            {permisos.eliminar && (
              <button type="button" role="menuitem" className="ck-menu__op ck-menu__op--peligro" onClick={() => ir('eliminar')}><Trash2 size={16} /> Eliminar</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
