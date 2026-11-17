import '../mantenimiento/mant.css';
import '../../core/ui/acciones-iconos.css';
import '../almacen/almacen.css';
import '../almacen/entradas.css';
import '../gerencia/gerencia-oc.css';
import './solicitudes.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, ClipboardList, FilePlus2, RefreshCw, SearchX, XCircle } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { BarraFiltros } from '../../core/ui/FiltrosListado';
import { KpiTarjeta } from '../../core/ui/KpiTarjeta';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage } from '../../core/api/client';
import { anchoAjustado } from '../../core/lib/anchoColumnas';
import { formatFechaPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { claveSolicitudes, useSolicitudes, type Solicitud } from './api';
import { NuevaSolicitudSheet } from './NuevaSolicitudSheet';
import { claseEstado, DetalleSolicitudSheet, textoEstado } from './DetalleSolicitudSheet';

/** Quien pidió ve «En revisión» mientras Gerencia no responde: así queda claro que todavía no se registró */
const estadoPropio = (e: Solicitud['estado']) => (e === 'PENDIENTE' ? 'EN REVISIÓN' : textoEstado(e));
const fecha = (s: Solicitud) => (s.created_at ? formatFechaPe(String(s.created_at).split('T')[0]) : '—');

interface Col { id: string; titulo: string; min: number; max: number; texto: (s: Solicitud) => string; bold?: boolean; mono?: boolean; px?: number; extra?: number }
const COLS: Col[] = [
  { id: 'codigo', titulo: 'Solicitud', min: 120, max: 170, texto: s => s.codigo, mono: true, bold: true, px: 15 },
  { id: 'fecha', titulo: 'Fecha', min: 100, max: 140, texto: fecha },
  { id: 'tipo', titulo: 'Qué pediste', min: 150, max: 230, texto: s => s.tipo_etiqueta, bold: true, px: 11, extra: 20 },
  { id: 'titulo', titulo: 'Detalle', min: 180, max: 460, texto: s => s.titulo },
    { id: 'estado', titulo: 'Estado', min: 110, max: 160, texto: s => estadoPropio(s.estado), bold: true, px: 11, extra: 26 },
  { id: 'revisado', titulo: 'Revisada por', min: 120, max: 240, texto: s => s.revisado_por || '—' },
];

/** Solicitudes: cualquier usuario pide (agregar proveedor, cliente o cuenta bancaria) y su encargado aprueba */
export function SolicitudesPage() {
  const qc = useQueryClient();
  // Cada usuario ve solo lo que subió él; las aprueba Gerencia › Aprobación de solicitudes
  const { data, isLoading, isError, error } = useSolicitudes('mias');
  const [busqueda, setBusqueda] = useState('');
  const [nueva, setNueva] = useState(false);
  const [abiertaId, setAbiertaId] = useState<number | null>(null);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const todas = data ?? [];
    return q ? todas.filter(s => `${s.codigo} ${s.titulo} ${s.solicitante} ${s.tipo_etiqueta} ${s.estado}`.toLowerCase().includes(q)) : todas;
  }, [data, busqueda]);
  const conteo = useMemo(() => ({
    pendientes: (data ?? []).filter(s => s.estado === 'PENDIENTE').length,
    aprobadas: (data ?? []).filter(s => s.estado === 'APROBADA').length,
    rechazadas: (data ?? []).filter(s => s.estado === 'RECHAZADA').length,
  }), [data]);

  const columnas = useMemo<ColumnaTabla[]>(() => COLS.map(c => {
    const ancho = anchoAjustado({ titulo: c.titulo, textos: lista.map(c.texto), min: c.min, max: c.max, mono: c.mono, bold: c.bold, px: c.px, extra: c.extra });
    return { id: c.id, titulo: c.titulo, ancho, minimo: Math.min(c.min, ancho) };
  }), [lista]);

  return (
    <Page>
      <PageHeader
        eyebrow="Solicitudes"
        title="Mis solicitudes"
        subtitle={isLoading ? 'Cargando…' : `${(data ?? []).length} ${(data ?? []).length === 1 ? 'solicitud' : 'solicitudes'}${conteo.pendientes ? ` · ${conteo.pendientes} por aprobar` : ''}`}
        actions={
          <>
            <div className="oc-acciones oc-acciones--sinfondo">
              <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--celeste" data-tip="Actualizar" aria-label="Actualizar" onClick={() => { void qc.invalidateQueries({ queryKey: claveSolicitudes }); }}>
                <RefreshCw size={17} />
              </button>
            </div>
            <Button variant="primary" icon={<FilePlus2 size={16} />} onClick={() => setNueva(true)}>Nueva solicitud</Button>
          </>
        }
      />

      {isError ? <Notice tone="error">{errorMessage(error)}</Notice> : (
        <div>
          <div className="inv-kpis" style={{ marginBottom: 'var(--s-4)' }}>
            <KpiTarjeta etiqueta="En revisión" valor={String(conteo.pendientes)} sub="Esperando la respuesta de Gerencia" icono={<ClipboardList size={18} />} tono="warning" />
            <KpiTarjeta etiqueta="Aprobadas" valor={String(conteo.aprobadas)} sub="Ya registradas en el sistema" icono={<CircleCheck size={18} />} />
            <KpiTarjeta etiqueta="Rechazadas" valor={String(conteo.rechazadas)} sub="Con su motivo" icono={<XCircle size={18} />} />
          </div>

          <div style={{ marginBottom: 'var(--s-4)' }}>
            <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Código, detalle, solicitante o tipo" activos={0} onAbrirFiltros={() => undefined}>
              <span className="badge">{lista.length} {lista.length === 1 ? 'registro' : 'registros'}</span>
            </BarraFiltros>
          </div>

          {isLoading ? <PageLoader /> : lista.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <ClipboardList size={22} />} title={busqueda ? 'Ninguna solicitud coincide' : 'Aún no has pedido nada'}>
              {busqueda ? null : <>Crea la primera con <strong>Nueva solicitud</strong>.</>}
            </EmptyState>
          ) : (
            <TablaRedimensionable id="solicitudes-v1" columnas={columnas} ariaLabel="Solicitudes" altoMax="68vh">
              {lista.map(s => (
                <tr key={s.id} className="tabla-redim__fila--click" onClick={() => { haptic('selection'); setAbiertaId(s.id); }}>
                  <Celda><button type="button" className="oc-codigo" onClick={e => { e.stopPropagation(); setAbiertaId(s.id); }}>{s.codigo}</button></Celda>
                  <Celda>{fecha(s)}</Celda>
                  <Celda><span className="oc-chip">{s.tipo_etiqueta}</span></Celda>
                  <Celda>{s.titulo}</Celda>
                  <Celda><span className={`badge ${claseEstado(s.estado)}`} style={{ whiteSpace: 'nowrap' }}>{estadoPropio(s.estado)}</span></Celda>
                  <Celda>{s.revisado_por || '—'}</Celda>
                </tr>
              ))}
            </TablaRedimensionable>
          )}
        </div>
      )}

      <NuevaSolicitudSheet open={nueva} onClose={() => setNueva(false)} />
      <DetalleSolicitudSheet id={abiertaId} onClose={() => setAbiertaId(null)} />
    </Page>
  );
}
