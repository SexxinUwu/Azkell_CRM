import '../mantenimiento/mant.css';
import './auditoria.css';
import './auditoria-clasico.css';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Eye, LogIn, ShieldCheck } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { SlideUpModal } from '../../core/ui/SlideUpModal';
import { errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { useToast } from '../../core/ui/Toast';
import { formatFechaHoraPe } from '../../core/lib/format';
import { useLogFirmado, type LogFirmado } from './api';
import {
  etiquetaAccion, etiquetaCampo, etiquetaEntidad, useActividadAudit, useAuditoriaEnVivo, usePersonasAudit, useResumenAudit, useTotalAuditSinFiltros, todosLosEventosAudit,
  ENTIDAD_LABELS, ACCION_LABELS, TAMANOS_AUDIT, TAMANO_AUDIT_DEFAULT, type CategoriaAudit, type EventoAudit, type FiltrosAudit, type OrdenAudit, type ResumenAudit,
} from './auditoriaActividad';

type Vista = 'actividad' | 'firmado';

const FILTROS_VACIOS: FiltrosAudit = { q: '', entity: '', action: '', userId: '', from: '', to: '', categoria: '' };

// Tarjetas de resumen del clásico (mismos colores, íconos y textos)
const TARJETAS_AUDIT: { categoria: CategoriaAudit; clave: keyof ResumenAudit; etiqueta: string; icono: string; color: string; fondo: string }[] = [
  { categoria: '', clave: 'total', etiqueta: 'Total eventos', icono: 'bi-layers-fill', color: '#6366f1', fondo: 'rgba(99,102,241,0.12)' },
  { categoria: 'creo', clave: 'creo', etiqueta: 'Creaciones', icono: 'bi-plus-circle-fill', color: '#16a34a', fondo: 'rgba(34,197,94,0.12)' },
  { categoria: 'modifico', clave: 'modifico', etiqueta: 'Modificaciones', icono: 'bi-pencil-square', color: '#d97706', fondo: 'rgba(245,158,11,0.12)' },
  { categoria: 'elimino', clave: 'elimino', etiqueta: 'Eliminaciones', icono: 'bi-trash3-fill', color: '#dc2626', fondo: 'rgba(239,68,68,0.12)' },
];

// ── Helpers copiados del clásico (modulos/sistema/auditoria/logica.js) ──

const AVATAR_COLORES = ['#6366f1', '#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#0284c7', '#14b8a6', '#e11d48'];

/** _getAuditUserColor */
function colorUsuario(str: string): string {
  const s = String(str || 'A');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xFFFFFF;
  return AVATAR_COLORES[Math.abs(h) % AVATAR_COLORES.length];
}

/** _getAuditUserInitials */
function inicialesUsuario(str: string): string {
  const raw = String(str || 'A').trim();
  const partes = raw.split(/[@.\s_-]+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return (partes[0] || 'AD').slice(0, 2).toUpperCase();
}

/** _formatAuditDate: "dd/mm/aaaa hh:mm:ss" + antigüedad relativa */
function formatoFechaAudit(dateStr: string): { full: string; rel: string } {
  if (!dateStr) return { full: '—', rel: '' };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { full: String(dateStr), rel: '' };
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  const full = `${day}/${month}/${d.getFullYear()} ${hours}:${mins}:${secs}`;
  let rel = '';
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) rel = 'ahora';
  else if (m < 60) rel = `hace ${m}m`;
  else {
    const h = Math.floor(m / 60);
    if (h < 24) rel = `hace ${h}h`;
    else {
      const dias = Math.floor(h / 24);
      if (dias < 7) rel = `hace ${dias}d`;
    }
  }
  return { full, rel };
}

/**
 * _getAccionBadge. La clasificación usa la acción original (CREATE, UPDATE…);
 * el texto que se muestra es la etiqueta en español.
 */
function badgeAccion(raw: string, label: string): { clase: string; icono: string; estilo?: CSSProperties; texto: string } {
  const a = String(raw || '').toUpperCase();
  if (a.includes('CRE') || a.includes('INSERT') || a.includes('NUEV') || a.includes('REGISTR'))
    return { clase: 'audit-badge-action audit-badge-cre', icono: 'bi-plus-circle-fill', texto: label || 'CREÓ' };
  if (a.includes('MODIF') || a.includes('ACTUALIZ') || a.includes('EDIT') || a.includes('CAMBIO'))
    return { clase: 'audit-badge-action audit-badge-mod', icono: 'bi-pencil-square', texto: label || 'MODIFICÓ' };
  if (a.includes('ELIMIN') || a.includes('ANUL') || a.includes('CANCEL') || a.includes('DELETE'))
    return { clase: 'audit-badge-action audit-badge-del', icono: 'bi-trash3-fill', texto: label || 'ELIMINÓ' };
  if (a.includes('SYNC') || a.includes('SINCRONIZ'))
    return { clase: 'audit-badge-action audit-badge-sync', icono: 'bi-cloud-arrow-down-fill', texto: label || 'SINCRONIZÓ' };
  return {
    clase: 'audit-badge-action audit-badge-mod', icono: 'bi-activity', texto: label || 'MODIFICÓ',
    estilo: { background: 'rgba(99,102,241,0.12)', color: '#4f46e5', borderColor: 'rgba(99,102,241,0.3)' },
  };
}

/** Números de página de renderAuditPagination: ventana de 5 con primera/última y «…» */
function ventanaPaginas(actual: number, totalPaginas: number): (number | '…')[] {
  const numeros: (number | '…')[] = [];
  let inicio = Math.max(1, actual - 2);
  const fin = Math.min(totalPaginas, inicio + 5 - 1);
  if (fin - inicio < 5 - 1) inicio = Math.max(1, fin - 5 + 1);
  if (inicio > 1) {
    numeros.push(1);
    if (inicio > 2) numeros.push('…');
  }
  for (let p = inicio; p <= fin; p++) numeros.push(p);
  if (fin < totalPaginas) {
    if (fin < totalPaginas - 1) numeros.push('…');
    numeros.push(totalPaginas);
  }
  return numeros;
}

// Estilos de los botones y campos del clásico (Bootstrap no está cargado en React)
const BTN_PAG: CSSProperties = { borderRadius: 8, fontSize: '0.75rem', padding: '4px 8px', border: '1px solid #6c757d', background: 'transparent', color: '#6c757d', minWidth: 32, cursor: 'pointer' };
const BTN_PAG_ACTIVA: CSSProperties = { ...BTN_PAG, background: '#0d6efd', borderColor: '#0d6efd', color: '#fff', fontWeight: 700 };
const BTN_PAG_OFF: CSSProperties = { ...BTN_PAG, opacity: 0.65, cursor: 'default' };
const BADGE_MONITOREO: CSSProperties = { fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: 2, padding: '0.35em 0.65em', borderRadius: 50, background: '#d1e7dd', color: '#198754', border: '1px solid #a3cfbb', fontWeight: 600 };
const BTN_EXCEL: CSSProperties = { borderRadius: 10, fontWeight: 600, fontSize: '0.875rem', padding: '0.25rem 0.5rem', border: '1px solid #198754', background: 'transparent', color: '#198754', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', boxShadow: '0 .125rem .25rem rgba(0,0,0,.075)' };
const BTN_ACTUALIZAR: CSSProperties = { borderRadius: 10, fontWeight: 600, fontSize: '0.875rem', padding: '0.25rem 0.5rem', border: '1px solid #0d6efd', background: '#0d6efd', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', boxShadow: '0 .125rem .25rem rgba(0,0,0,.075)' };
const CAMPO_CLASICO: CSSProperties = { fontSize: '0.8rem', borderRadius: 10, minWidth: 150, height: 31, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' };
const FECHA_CLASICA: CSSProperties = { width: 130, fontSize: '0.78rem', height: 31, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', padding: '0 6px' };
const ETIQUETA_FILTRO: CSSProperties = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--subtext)' };

/** Valor legible para la tabla de cambios */
function valorLegible(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatFechaHoraPe(v);
  return String(v);
}

/** Detalle del clásico (verDetalleAudit). Módulo y Sub-Módulo no existen en audit_logs. */
function DetalleEvento({ e }: { e: EventoAudit }) {
  const fecha = formatoFechaAudit(e.created_at);
  const badge = badgeAccion(e.action, etiquetaAccion(e.action));
  const cambios = e.changes ? Object.entries(e.changes) : [];
  const fila: CSSProperties = { display: 'flex', marginBottom: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' };
  const rotulo: CSSProperties = { width: 140, fontWeight: 700, color: 'var(--subtext)', fontSize: '0.8rem', textTransform: 'uppercase' };
  const valor: CSSProperties = { flex: 1, fontSize: '0.88rem', color: 'var(--text)', wordBreak: 'break-word' };
  return (
    <div className="audit-detail-modal-card">
      <div className="audit-detail-row" style={fila}><div className="audit-detail-label" style={rotulo}>ID Evento:</div><div className="audit-detail-val" style={valor}><span className="audit-id-badge">#{e.id}</span></div></div>
      <div className="audit-detail-row" style={fila}><div className="audit-detail-label" style={rotulo}>Fecha y Hora:</div><div className="audit-detail-val" style={valor}>{fecha.full} {fecha.rel && <span style={{ fontSize: '0.71rem', color: 'var(--subtext)', marginLeft: 6 }}>{fecha.rel}</span>}</div></div>
      <div className="audit-detail-row" style={fila}><div className="audit-detail-label" style={rotulo}>Usuario:</div><div className="audit-detail-val" style={{ ...valor, fontWeight: 600 }}>{e.user_name || 'Administrador'}</div></div>
      <div className="audit-detail-row" style={fila}><div className="audit-detail-label" style={rotulo}>Acción:</div><div className="audit-detail-val" style={valor}><span className={badge.clase} style={badge.estilo}><i className={`bi ${badge.icono}`} /> {badge.texto}</span></div></div>
      <div className="audit-detail-row" style={{ ...fila, borderBottom: 'none' }}>
        <div className="audit-detail-label" style={rotulo}>Descripción / Detalle:</div>
        <div className="audit-detail-val" style={valor}>
          <div style={{ padding: '0.75rem', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', marginTop: 8 }}>{e.summary || 'Sin detalle adicional'}</div>
          {cambios.length > 0 && (
            <table className="aud-cambios" style={{ marginTop: 8 }}>
              <thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead>
              <tbody>
                {cambios.map(([campo, c]) => (
                  <tr key={campo}><td>{etiquetaCampo(campo)}</td><td>{valorLegible(c.from)}</td><td>{valorLegible(c.to)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/** Actividad: tabla del clásico (ordenar por ID, tamaño de página y paginación numerada) */
function ActividadAuditoria() {
  const toast = useToast();
  const [filtros, setFiltros] = useState<FiltrosAudit>(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState<number>(TAMANO_AUDIT_DEFAULT);
  const [ascOrden, setAscOrden] = useState(false);       // window._auditSortAsc
  const [ordenTocado, setOrdenTocado] = useState(false); // el clásico muestra la flecha neutra hasta el primer clic
  const [detalle, setDetalle] = useState<EventoAudit | null>(null);
  useAuditoriaEnVivo();
  const orden: OrdenAudit = ascOrden ? 'asc' : 'desc';
  const actividad = useActividadAudit(filtros, pagina, tamano, orden);
  const sinFiltros = useTotalAuditSinFiltros();
  const resumen = useResumenAudit(filtros);
  const personas = usePersonasAudit();
  const eventos = actividad.data?.items ?? [];
  const total = actividad.data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  // Si el total baja, vuelve a la última página válida (renderAuditTable clampa _auditPage)
  useEffect(() => { if (actividad.data && pagina > totalPaginas) setPagina(totalPaginas); }, [actividad.data, pagina, totalPaginas]);

  // Mismo ícono de encabezado que el clásico, cargado solo en esta pantalla
  useEffect(() => {
    const id = 'libs-bootstrap-icons';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet'; link.href = '/libs/bootstrap-icons.css';
    document.head.appendChild(link);
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  // Cambiar un filtro vuelve a la página 1 (filtrarAuditFeed)
  const set = (k: keyof FiltrosAudit) => (v: string) => { setFiltros(f => ({ ...f, [k]: v })); setPagina(1); };
  const inicioIdx = (pagina - 1) * tamano;
  const desde = total === 0 ? 0 : inicioIdx + 1;
  const hasta = Math.min(inicioIdx + tamano, total);
  const totalSinFiltros = sinFiltros.data?.total;
  const subtitulo = actividad.isLoading
    ? 'Cargando registros...'
    : `${total} evento${total !== 1 ? 's' : ''}${totalSinFiltros !== undefined && totalSinFiltros !== total ? ` filtrados (de ${totalSinFiltros} totales)` : ''}`;
  const iconoOrden = !ordenTocado ? 'bi-arrow-down-up' : ascOrden ? 'bi-sort-numeric-up' : 'bi-sort-numeric-down';

  // Exporta todos los registros que cumplen los filtros (no solo la página), con fecha y hora de Lima
  async function exportar() {
    try {
      const todos = await todosLosEventosAudit(filtros, orden);
      const aLima = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'America/Lima' });
      await exportarExcel('Auditoria', 'Auditoría', ['ID Evento', 'Fecha y hora', 'Usuario', 'Registro', 'Acción', 'Resumen', 'IP'],
        todos.map(e => [e.id, aLima(e.created_at), e.user_name || '—', ENTIDAD_LABELS[e.entity] ?? e.entity,
          ACCION_LABELS[e.action] ?? e.action, e.summary || '—', e.ip ?? '']));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  function renderPaginacion() {
    const botones: ReactNode[] = [];
    botones.push(
      <button key="ant" type="button" style={pagina <= 1 ? BTN_PAG_OFF : BTN_PAG} disabled={pagina <= 1}
        onClick={() => setPagina(pagina - 1)} aria-label="Página anterior"><i className="bi bi-chevron-left" /></button>,
    );
    ventanaPaginas(pagina, totalPaginas).forEach((n, i) => botones.push(
      n === '…'
        ? <span key={`p-${i}`} style={{ padding: '0 4px', color: 'var(--subtext)' }}>...</span>
        : <button key={n} type="button" style={n === pagina ? BTN_PAG_ACTIVA : BTN_PAG} onClick={() => setPagina(n)}>{n}</button>,
    ));
    botones.push(
      <button key="sig" type="button" style={pagina >= totalPaginas ? BTN_PAG_OFF : BTN_PAG} disabled={pagina >= totalPaginas}
        onClick={() => setPagina(pagina + 1)} aria-label="Página siguiente"><i className="bi bi-chevron-right" /></button>,
    );
    return botones;
  }

  return (
    <div id="moduloAuditoria" style={{ '--bg': '#f2f2f7', '--surface': '#ffffff', '--text': '#000000', '--subtext': '#8e8e93', '--border': '#e5e5ea' } as CSSProperties}>
      {/* Encabezado principal (clásico) */}
      <div className="audit-top-header">
        <div className="audit-title-area">
          <div className="audit-icon-box"><i className="bi bi-shield-check" /></div>
          <div>
            <h4 className="mb-0 fw-bold" style={{ fontSize: '1.15rem', color: 'var(--text)', margin: 0, fontWeight: 700 }}>Auditoría y Registro de Actividad</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span id="audit-subtitle" style={{ fontSize: '0.78rem', color: 'var(--subtext)' }}>{subtitulo}</span>
              <span style={BADGE_MONITOREO}><i className="bi bi-dot" /> Monitoreo Activo</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" style={BTN_EXCEL} onClick={exportar} disabled={total === 0} title="Descargar reporte en formato Excel (.xlsx)">
            <i className="bi bi-file-earmark-excel-fill" /> Exportar Excel
          </button>
          <button type="button" style={BTN_ACTUALIZAR} onClick={() => { actividad.refetch(); sinFiltros.refetch(); resumen.refetch(); }} title="Recargar eventos">
            <i className={`bi bi-arrow-clockwise${actividad.isFetching ? ' bi-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>

      {/* Tarjetas de resumen (clásico): cada una filtra por su categoría; «Total» quita el filtro */}
      <div className="audit-kpi-grid">
        {TARJETAS_AUDIT.map(t => {
          const activa = filtros.categoria === t.categoria;
          const valor = resumen.data?.[t.clave];
          return (
            <button key={t.categoria || 'todas'} type="button" className={`audit-kpi-card${activa ? ' active' : ''}`} aria-pressed={activa}
              onClick={() => { setFiltros(f => ({ ...f, categoria: t.categoria })); setPagina(1); }}
              style={{ cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit', width: '100%' }}>
              <div className="audit-kpi-icon" style={{ background: t.fondo, color: t.color }}><i className={`bi ${t.icono}`} /></div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--subtext)', textTransform: 'uppercase' }}>{t.etiqueta}</div>
                <div className="fw-bold" style={{ fontSize: '1.25rem', color: t.categoria ? t.color : 'var(--text)' }}>
                  {valor === undefined ? '…' : valor.toLocaleString('es-PE')}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Barra de herramientas y filtros (clásico) + filtros que ya existían en React */}
      <div className="audit-toolbar">
        <div className="audit-toolbar-row">
          <div className="audit-search-input">
            <i className="bi bi-search" />
            <input type="text" className="form-control form-control-sm" id="auditSearch" value={filtros.q}
              placeholder="Buscar por ID, usuario, módulo, sub-módulo, detalle..."
              onChange={e => set('q')(e.target.value)} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={ETIQUETA_FILTRO}>Desde:</span>
              <input type="date" id="auditFechaDesde" style={FECHA_CLASICA} value={filtros.from} max={filtros.to || undefined}
                onChange={e => set('from')(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={ETIQUETA_FILTRO}>Hasta:</span>
              <input type="date" id="auditFechaHasta" style={FECHA_CLASICA} value={filtros.to} min={filtros.from || undefined}
                onChange={e => set('to')(e.target.value)} />
            </div>
            <button type="button" title="Limpiar fechas" style={BTN_PAG}
              onClick={() => { setFiltros(f => ({ ...f, from: '', to: '' })); setPagina(1); }}>
              <i className="bi bi-x-circle" />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <SelectInput value={filtros.entity} onChange={e => set('entity')(e.target.value)} aria-label="Módulo" style={CAMPO_CLASICO}>
              <option value="">Todos los módulos</option>
              {Object.keys(ENTIDAD_LABELS).map(k => <option key={k} value={k}>{ENTIDAD_LABELS[k]}</option>)}
            </SelectInput>
            <SelectInput value={filtros.action} onChange={e => set('action')(e.target.value)} aria-label="Acción" style={CAMPO_CLASICO}>
              <option value="">Todas las acciones</option>
              {Object.keys(ACCION_LABELS).map(k => <option key={k} value={k}>{ACCION_LABELS[k]}</option>)}
            </SelectInput>
            {(personas.data?.length ?? 0) > 0 && (
              <SelectInput value={filtros.userId} onChange={e => set('userId')(e.target.value)} aria-label="Persona" style={CAMPO_CLASICO}>
                <option value="">Todas las personas</option>
                {personas.data!.map(p => <option key={p.user_id} value={String(p.user_id)}>{p.user_name}</option>)}
              </SelectInput>
            )}
          </div>
        </div>
      </div>

      {/* Tabla (clásico) */}
      <div className="audit-table-card">
        <div className="audit-table-responsive">
          <table className="audit-table" id="auditTable">
            <thead>
              <tr>
                <th style={{ width: 75, cursor: 'pointer' }} onClick={() => { setAscOrden(a => !a); setOrdenTocado(true); }} title="Clic para ordenar">
                  # ID <i className={`bi ${iconoOrden} ms-1`} id="audit-sort-icon" style={{ marginLeft: 4 }} />
                </th>
                <th style={{ width: 165 }}>Fecha y Hora</th>
                <th style={{ width: 210 }}>Usuario</th>
                <th style={{ width: 130 }}>Acción</th>
                <th style={{ width: 150 }}>Módulo</th>
                <th>Detalle de la Operación</th>
                <th style={{ width: 70, textAlign: 'center' }}>Ver</th>
              </tr>
            </thead>
            <tbody id="auditTableBody">
              {actividad.isLoading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--subtext)' }}>Cargando historial de auditoría...</td></tr>
              ) : actividad.isError ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '3rem 0', color: '#dc3545' }}>
                  <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: '1.75rem', display: 'block', marginBottom: 8 }} />
                  Error al cargar registros: {errorMessage(actividad.error)}
                </td></tr>
              ) : eventos.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--subtext)' }}>
                  <i className="bi bi-inbox" style={{ fontSize: '2rem', opacity: 0.25, display: 'block', marginBottom: 8 }} />
                  No se encontraron eventos con los filtros seleccionados.
                </td></tr>
              ) : eventos.map(r => {
                const fecha = formatoFechaAudit(r.created_at);
                const uName = r.user_name || 'Administrador';
                const badge = badgeAccion(r.action, etiquetaAccion(r.action));
                return (
                  <tr key={r.id}>
                    <td><span className="audit-id-badge">#{r.id}</span></td>
                    <td>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.83rem' }}>{fecha.full}</div>
                      {fecha.rel && <div style={{ fontSize: '0.71rem', color: 'var(--subtext)' }}>{fecha.rel}</div>}
                    </td>
                    <td>
                      <div className="audit-user-cell">
                        <div className="audit-avatar-circle" style={{ background: colorUsuario(uName) }} title={uName}>{inicialesUsuario(uName)}</div>
                        <div className="audit-user-name" title={uName}>{uName}</div>
                      </div>
                    </td>
                    <td><span className={badge.clase} style={badge.estilo}><i className={`bi ${badge.icono}`} /> {badge.texto}</span></td>
                    <td>{etiquetaEntidad(r.entity)}</td>
                    <td><div className="audit-detail-cell">{r.summary || '—'}</div></td>
                    <td style={{ textAlign: 'center' }}>
                      <button type="button" title="Ver detalle completo" onClick={() => setDetalle(r)}
                        style={{ borderRadius: 6, fontSize: '0.75rem', padding: '4px 8px', border: '1px solid #0d6efd', background: 'transparent', color: '#0d6efd', cursor: 'pointer' }}>
                        <i className="bi bi-eye" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pie: tamaño de página, rango y paginación numerada (clásico) */}
        <div className="audit-table-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Mostrar</span>
            <select className="form-select form-select-sm" id="auditPageSize" value={tamano}
              style={{ width: 75, fontSize: '0.78rem', height: 31, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
              onChange={e => { setTamano(Number(e.target.value)); setPagina(1); }}>
              {TAMANOS_AUDIT.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span id="audit-pagination-info">{total > 0 ? `Mostrando ${desde} - ${hasta} de ${total}` : 'Mostrando 0 de 0'}</span>
          </div>
          <div id="audit-pagination-controls" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {renderPaginacion()}
          </div>
        </div>
      </div>

      <SlideUpModal open={detalle !== null} onClose={() => setDetalle(null)} title={detalle ? `Detalle de Auditoría #${detalle.id}` : ''}>
        {detalle && <DetalleEvento e={detalle} />}
      </SlideUpModal>
    </div>
  );
}

function FilaFirmada({ f }: { f: LogFirmado }) {
  const { Icono, tono } = f.accion?.toUpperCase().includes('LOGIN') ? { Icono: LogIn, tono: 'verde' } : { Icono: Eye, tono: 'gris' };
  const fecha = new Date(f.created_at);
  return (
    <article className="aud-evento">
      <span className={`aud-evento__icono aud-evento__icono--${tono}`}><Icono size={17} strokeWidth={2} /></span>
      <div className="aud-evento__cuerpo">
        <div className="aud-evento__texto">{f.usuario || 'Sistema'} · {f.metodo} {f.ruta}</div>
        <div className="aud-evento__meta">
          {[f.accion, formatFechaHoraPe(fecha), f.ip, f.status_codigo ? `HTTP ${f.status_codigo}` : ''].filter(Boolean).join(' · ')}
        </div>
        {(f.antes || f.despues || f.detalle) && (
          <details className="aud-evento__detalle">
            <summary>Antes / después</summary>
            <div><strong>Antes</strong><pre>{f.antes || '—'}</pre></div>
            <div><strong>Después</strong><pre>{f.despues || f.detalle || '—'}</pre></div>
            <code title={f.firma_estado ?? f.firma}>Firma {(f.firma_estado ?? f.firma).slice(0, 12)}</code>
          </details>
        )}
      </div>
    </article>
  );
}

function RegistroFirmado({ q }: { q: string }) {
  const log = useLogFirmado(q || undefined, true);
  if (log.isLoading) return <PageLoader />;
  if (log.isError) return <Notice tone="error">{errorMessage(log.error)}</Notice>;
  const filas: LogFirmado[] = log.data ?? [];
  return filas.length === 0 ? (
    <EmptyState icon={<ShieldCheck size={22} />} title="Sin registros">No hay mutaciones registradas.</EmptyState>
  ) : (
    <div className="aud-dia"><div className="aud-lista">{filas.map(f => <FilaFirmada key={f.id} f={f} />)}</div></div>
  );
}

// Sistema › Auditoría: quién hizo qué y cuándo. Solo lectura.
export function AuditoriaPage() {
  const [vista, setVista] = useState<Vista>('actividad');
  const [busqueda, setBusqueda] = useState('');
  const selector = (
    <div className="aud-filtros">
      <SegmentedControl<Vista> label="Vista" value={vista} onChange={setVista}
        options={[{ value: 'actividad', label: 'Actividad' }, { value: 'firmado', label: 'Registro firmado' }]} />
    </div>
  );
  if (vista === 'actividad') return <>{selector}<ActividadAuditoria /></>;
  return (
    <Page>
      <PageHeader
        eyebrow="Sistema"
        title="Auditoría"
        subtitle="Quién hizo qué y cuándo. Los registros no se pueden editar ni borrar."
      />
      {selector}
      <div className="aud-filtros"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar en el registro firmado" /></div>
      <RegistroFirmado q={busqueda} />
    </Page>
  );
}
