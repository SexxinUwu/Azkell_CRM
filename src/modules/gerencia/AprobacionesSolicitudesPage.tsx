import '../mantenimiento/mant.css';
import './gerencia.css';
import './gerencia-oc.css';
import '../almacen/entradas.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ClipboardList, RefreshCw, SearchX, ShieldCheck } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page } from '../../core/ui/Display';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage } from '../../core/api/client';
import { anchoAjustado } from '../../core/lib/anchoColumnas';
import { formatFechaHoraPe, formatFechaPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { claveSolicitudes, useSolicitudes, type Solicitud } from '../solicitudes/api';
import { claseEstado, DetalleSolicitudSheet, textoEstado } from '../solicitudes/DetalleSolicitudSheet';

type Pestana = 'todas' | 'pendientes' | 'aprobadas' | 'rechazadas';
const PASA: Record<Pestana, (s: Solicitud) => boolean> = {
  todas: () => true,
  pendientes: s => s.estado === 'PENDIENTE',
  aprobadas: s => s.estado === 'APROBADA',
  rechazadas: s => s.estado === 'RECHAZADA' || s.estado === 'CANCELADA',
};
const PESTANAS: Array<{ key: Pestana; etiqueta: string }> = [
  { key: 'pendientes', etiqueta: 'Por aprobar' }, { key: 'aprobadas', etiqueta: 'Aprobadas' },
  { key: 'rechazadas', etiqueta: 'Rechazadas / canceladas' }, { key: 'todas', etiqueta: 'Historial completo' },
];
const dia = (v: string | null) => (v ? String(v).slice(0, 10) : '');

interface Col { id: string; titulo: string; min: number; max: number; texto: (s: Solicitud) => string; bold?: boolean; mono?: boolean; px?: number; extra?: number }
const COLS: Col[] = [
  { id: 'codigo', titulo: 'Solicitud', min: 120, max: 170, texto: s => s.codigo, mono: true, bold: true, px: 15 },
  { id: 'fecha', titulo: 'Fecha', min: 100, max: 140, texto: s => (s.created_at ? formatFechaPe(dia(s.created_at)) : '—') },
  { id: 'tipo', titulo: 'Tipo', min: 150, max: 230, texto: s => s.tipo_etiqueta, bold: true, px: 11, extra: 20 },
  { id: 'titulo', titulo: 'Detalle', min: 180, max: 460, texto: s => s.titulo },
  { id: 'solicitante', titulo: 'Pedida por', min: 120, max: 240, texto: s => s.solicitante },
  { id: 'estado', titulo: 'Estado', min: 110, max: 160, texto: s => textoEstado(s.estado), bold: true, px: 11, extra: 26 },
  { id: 'revisado', titulo: 'Revisada por', min: 120, max: 240, texto: s => s.revisado_por || '—' },
  { id: 'fechaRev', titulo: 'Fecha de respuesta', min: 140, max: 200, texto: s => (s.revisado_en ? formatFechaHoraPe(s.revisado_en) : '—'), mono: true },
  { id: 'comentario', titulo: 'Comentario', min: 140, max: 420, texto: s => s.comentario_revision || '—' },
];

/** Gerencia › Aprobación de solicitudes: todas las solicitudes del sistema, con su historial; aquí se aprueban o rechazan */
export function AprobacionesSolicitudesPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useSolicitudes('gerencia');
  const [pestana, setPestana] = useState<Pestana>('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [abiertaId, setAbiertaId] = useState<number | null>(null);

  const todas = useMemo(() => data ?? [], [data]);
  const enRango = useMemo(() => todas.filter(s => {
    const f = dia(s.created_at);
    return (!desde || f >= desde) && (!hasta || f <= hasta);
  }), [todas, desde, hasta]);
  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return enRango.filter(PASA[pestana]).filter(s => !q || `${s.codigo} ${s.titulo} ${s.solicitante} ${s.tipo_etiqueta} ${s.revisado_por ?? ''}`.toLowerCase().includes(q));
  }, [enRango, pestana, busqueda]);
  const conteo = (p: Pestana) => enRango.filter(PASA[p]).length;

  const columnas = useMemo<ColumnaTabla[]>(() => COLS.map(c => {
    const ancho = anchoAjustado({ titulo: c.titulo, textos: lista.map(c.texto), min: c.min, max: c.max, mono: c.mono, bold: c.bold, px: c.px, extra: c.extra });
    return { id: c.id, titulo: c.titulo, ancho, minimo: Math.min(c.min, ancho) };
  }), [lista]);

  const indicadores = [
    { tono: 'ambar', etiqueta: 'Por aprobar', pill: 'Por revisar', n: conteo('pendientes') },
    { tono: 'verde', etiqueta: 'Aprobadas', pill: 'Registradas', n: conteo('aprobadas') },
    { tono: 'rojo', etiqueta: 'Rechazadas', pill: 'Con motivo', n: enRango.filter(s => s.estado === 'RECHAZADA').length },
    { tono: 'indigo', etiqueta: 'Historial', pill: 'Todas', n: enRango.length },
  ];
  const hayFiltros = !!busqueda || !!desde || !!hasta || pestana !== 'pendientes';

  return (
    <Page>
      <div className="ga-page">
        <header className="ga-cab">
          <div>
            <span className="ga-pill"><ShieldCheck size={13} aria-hidden /> Dirección ejecutiva</span>
            <h1 className="ga-titulo">Aprobación de solicitudes</h1>
            <p className="ga-sub">
              Todo lo que pide el equipo (proveedores, clientes y cuentas bancarias) pasa por aquí antes de registrarse
              {conteo('pendientes') > 0 ? ` · ${conteo('pendientes')} por aprobar` : ''}
            </p>
          </div>
          <div className="ga-acciones">
            <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => { void qc.invalidateQueries({ queryKey: claveSolicitudes }); }}>Actualizar</Button>
          </div>
        </header>

        {isError ? <Notice tone="error">{errorMessage(error)}</Notice> : isLoading ? <PageLoader /> : (
          <>
            <div className="ga-kpis">
              {indicadores.map(k => (
                <div key={k.etiqueta} className={`ga-kpi ga-kpi--${k.tono}`}>
                  <div className="ga-kpi__cab"><span className="ga-kpi__etiqueta">{k.etiqueta}</span><span className="ga-kpi__pill">{k.pill}</span></div>
                  <span className="ga-kpi__valor">{k.n}</span>
                  <span className="ga-kpi__unidad">{k.n === 1 ? 'solicitud' : 'solicitudes'}</span>
                </div>
              ))}
            </div>

            <div className="ga-filtros">
              <div className="ga-filtros__fila">
                <div className="ga-campo">
                  <span className="ga-campo__etiqueta">Fecha desde</span>
                  <input type="date" className="input" aria-label="Fecha desde" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} />
                </div>
                <div className="ga-campo">
                  <span className="ga-campo__etiqueta">Fecha hasta</span>
                  <input type="date" className="input" aria-label="Fecha hasta" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} />
                </div>
                <div className="ga-campo ga-buscar">
                  <span className="ga-campo__etiqueta">Búsqueda rápida</span>
                  <input type="search" className="input" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Código, detalle, solicitante, tipo o quien la revisó" aria-label="Buscar solicitudes" />
                </div>
              </div>
              <div className="ga-tabs" role="group" aria-label="Filtrar por estado">
                {PESTANAS.map(p => (
                  <button key={p.key} type="button" className="ga-tab" aria-pressed={pestana === p.key} onClick={() => { haptic('selection'); setPestana(p.key); }}>
                    {p.etiqueta} <span className="ga-tab__n">{conteo(p.key)}</span>
                  </button>
                ))}
                {hayFiltros && <button type="button" className="ga-limpiar" onClick={() => { setBusqueda(''); setDesde(''); setHasta(''); setPestana('pendientes'); }}>Limpiar filtros</button>}
              </div>
            </div>

            {lista.length === 0 ? (
              <EmptyState icon={hayFiltros ? <SearchX size={22} /> : <ClipboardList size={22} />} title={pestana === 'pendientes' && !busqueda ? 'No hay solicitudes por aprobar' : 'Ninguna solicitud coincide'}>
                {pestana === 'pendientes' ? 'Cuando alguien pida algo, aparecerá aquí.' : null}
              </EmptyState>
            ) : (
              <TablaRedimensionable id="gerencia-solicitudes-v1" columnas={columnas} ariaLabel="Solicitudes" altoMax="68vh">
                {lista.map(s => (
                  <tr key={s.id} className="tabla-redim__fila--click" onClick={() => { haptic('selection'); setAbiertaId(s.id); }}>
                    <Celda><button type="button" className="oc-codigo" onClick={e => { e.stopPropagation(); setAbiertaId(s.id); }}>{s.codigo}</button></Celda>
                    <Celda>{s.created_at ? formatFechaPe(dia(s.created_at)) : '—'}</Celda>
                    <Celda><span className="oc-chip">{s.tipo_etiqueta}</span></Celda>
                    <Celda>{s.titulo}</Celda>
                    <Celda>{s.solicitante}</Celda>
                    <Celda><span className={`badge ${claseEstado(s.estado)}`} style={{ whiteSpace: 'nowrap' }}>{textoEstado(s.estado)}</span></Celda>
                    <Celda>{s.revisado_por || '—'}</Celda>
                    <Celda mono>{s.revisado_en ? formatFechaHoraPe(s.revisado_en) : '—'}</Celda>
                    <Celda>{s.comentario_revision || '—'}</Celda>
                  </tr>
                ))}
              </TablaRedimensionable>
            )}
          </>
        )}
      </div>

      <DetalleSolicitudSheet id={abiertaId} onClose={() => setAbiertaId(null)} />
    </Page>
  );
}
