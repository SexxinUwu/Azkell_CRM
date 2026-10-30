import '../mantenimiento/mant.css';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, FileSpreadsheet, Pencil, Play, Plus, ScrollText, SearchX, XCircle } from 'lucide-react';
import { OrdenServicioSheet, type OrdenParaEditar } from './OrdenServicioSheet';
import { CocheraExpressSheet, type CocheraDatos } from './CocheraExpressSheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, TextInput } from '../../core/ui/Field';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { dayKey } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';

// Confirmación para iniciar el servicio (igual que el clásico): fecha de inicio y confirmación explícita.
// Al iniciar, el servidor devuelve los datos de la caja de cochera si la orden tiene viaje.
function IniciarServicioSheet({ orden, onClose, onIniciado }: { orden: Orden | null; onClose: () => void; onIniciado: (cochera: CocheraDatos | null) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [fecha, setFecha] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orden) { setFecha(dayKey(new Date())); setConfirmado(false); setError(null); }
  }, [orden]);

  async function iniciar() {
    if (!orden) return;
    if (!fecha) { setError('Indica la fecha de inicio.'); return; }
    if (!confirmado) { setError('Debes confirmar que deseas realizar esta operación.'); return; }
    setError(null);
    setEnviando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string; cochera?: CocheraDatos | null }>(`/operaciones/ordenes-servicio/${orden.id}/estado`,
        { method: 'PUT', body: { estado_servicio: 'INICIADO', fecha_inicio: fecha } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo iniciar el servicio');
      haptic('success'); toast(`Orden ${orden.codigo_orden}: iniciada`);
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
      onIniciado(r.cochera ?? null);
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={!!orden} onClose={() => !enviando && onClose()} title="Iniciar servicio"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={<Play size={16} />} onClick={iniciar} loading={enviando}>Iniciar ahora</Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <p className="t-callout c-secondary" style={{ margin: 0 }}>Orden <strong className="c-primary">{orden?.codigo_orden ?? '—'}</strong></p>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
        <Field label="Fecha de inicio *">{p => <TextInput {...p} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />}</Field>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={confirmado} onChange={e => { setConfirmado(e.target.checked); setError(null); }} />
          <span>Confirmo realizar esta operación</span>
        </label>
        <p className="t-footnote c-secondary" style={{ margin: 0 }}>Esta acción no se podrá revertir.</p>
      </div>
    </Sheet>
  );
}

interface Orden {
  id: number; codigo_orden: string; fecha_fmt: string | null; fecha_fin_fmt: string | null; cliente_nombre: string | null; tipo_servicio: string | null;
  estado_servicio: string | null; viaje_asignado: string | null; conductor: string | null; placa_tracto: string | null; placa_carreta: string | null;
  moneda: string | null; costo_flete: number | string | null; impuesto: number | string | null; puntos_carga: string | null; puntos_destino: string | null;
  destinatario: string | null; observaciones: string | null; carga_doc: number; peso_documentos: number | string; volumen_documentos: number | string;
  es_retorno: number | boolean | null; modalidad_ejecucion: string | null; tipo_contratacion: string | null;
}
interface Detalle extends Orden {
  documentos?: { id: number; numero_documento?: string; guia?: string; descripcion?: string; peso?: number | string; volumen?: number | string; fecha_carga_fmt?: string; fecha_entrega_fmt?: string }[];
  rutas?: { id: number; ruta: string; distancia_km?: number | string; galones?: number | string }[];
}

const ESTADOS = ['PENDIENTE', 'INICIADO', 'FINALIZADO', 'ANULADO'];
const n = (v: unknown) => Number(v) || 0;
const color = (e: string | null) => ({ PENDIENTE: 'amber', INICIADO: 'accent', FINALIZADO: 'green', ANULADO: 'gray' }[String(e ?? '').toUpperCase()] ?? 'gray');
const estadoDe = (o: Orden) => String(o.estado_servicio ?? 'PENDIENTE').toUpperCase();
const simboloMoneda = (m: string | null) => (/DOL/i.test(String(m ?? '')) ? 'US$' : 'S/');

// Pastilla de color del tema (mismos tonos que el resto de la app)
function Pastilla({ tono, children }: { tono: string; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: `var(--${tono}-tint)`, color: `var(--${tono}-ink)`, fontSize: '0.6875rem', fontWeight: 700 }}>
      {children}
    </span>
  );
}

const COLUMNAS: ColumnaTabla[] = [
  { id: 'estado', titulo: 'Estado', ancho: 130 },
  { id: 'codigo', titulo: 'Código de orden', ancho: 160, minimo: 120 },
  { id: 'fecha', titulo: 'Fecha', ancho: 120 },
  { id: 'cliente', titulo: 'Cliente', ancho: 240, minimo: 140 },
  { id: 'servicio', titulo: 'Tipo de servicio', ancho: 180 },
  { id: 'viaje', titulo: 'Viaje asignado', ancho: 150 },
  { id: 'tracto', titulo: 'Tracto', ancho: 130 },
  { id: 'carreta', titulo: 'Carreta', ancho: 130 },
  { id: 'conductor', titulo: 'Conductor', ancho: 200 },
  { id: 'flete', titulo: 'Flete', ancho: 150, alinear: 'right' },
  { id: 'acciones', titulo: 'Acciones', ancho: 150, minimo: 120 },
];

// Operaciones › Órdenes de servicio: consulta, seguimiento de estado, alta/edición con rutas y guías, y exportación.
export function OrdenesServicioPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [formulario, setFormulario] = useState<{ orden: OrdenParaEditar | null } | null>(null);
  const [iniciar, setIniciar] = useState<Orden | null>(null);
  const [cocheraDatos, setCocheraDatos] = useState<CocheraDatos | null>(null);

  const lista = useQuery<Orden[]>({
    queryKey: ['operaciones', 'ordenes-servicio', q],
    queryFn: () => api<{ data?: Orden[] }>(`/operaciones/ordenes-servicio${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(r => r.data ?? []),
    staleTime: 20_000,
  });
  const det = useQuery<Detalle>({
    queryKey: ['operaciones', 'orden-servicio', abiertoId],
    enabled: abiertoId != null,
    queryFn: () => api<{ data: Detalle }>(`/operaciones/ordenes-servicio/${abiertoId}`).then(r => r.data),
  });

  const datos = lista.data ?? [];
  const visibles = useMemo(() => datos.filter(o => !estado || estadoDe(o) === estado), [datos, estado]);
  const conteo = useMemo(() => Object.fromEntries(ESTADOS.map(e => [e, datos.filter(o => estadoDe(o) === e).length])), [datos]);
  const puedeEditar = can('op_ordenes_servicio.editar', 'op_ordenes_servicio.crear', 'op_ordenes_viaje.editar');
  const puedeCrear = can('op_ordenes_servicio.crear', 'op_ordenes_servicio.editar', 'op_ordenes_viaje.editar');
  const abierta = datos.find(o => o.id === abiertoId) ?? null;
  const o = det.data ?? abierta;

  async function cambiarEstado(orden: Orden, nuevo: string) {
    setOcupado(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/operaciones/ordenes-servicio/${orden.id}/estado`, { method: 'PUT', body: { estado_servicio: nuevo } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo cambiar el estado');
      haptic('success'); toast(`Orden ${orden.codigo_orden}: ${nuevo.toLowerCase()}`);
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  // Editar desde la fila: se carga el detalle (rutas y documentos) antes de abrir el formulario
  async function editarFila(id: number) {
    try {
      const r = await api<{ data: Detalle }>(`/operaciones/ordenes-servicio/${id}`);
      setFormulario({ orden: r.data as unknown as OrdenParaEditar });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
  }

  // Tras iniciar: se cierra la confirmación y, si el servidor trae datos de cochera, se abre la caja express (como el clásico)
  function alIniciar(cochera: CocheraDatos | null) {
    setIniciar(null);
    if (cochera) window.setTimeout(() => setCocheraDatos(cochera), 350);
  }

  async function exportar() {
    try {
      await exportarExcel('Ordenes-de-servicio', 'Órdenes',
        ['Orden', 'Fecha', 'Cliente', 'Servicio', 'Estado', 'Viaje', 'Conductor', 'Tracto', 'Carreta', 'Moneda', 'Flete', 'Documentos', 'Peso (kg)', 'Origen', 'Destino'],
        visibles.map(x => [x.codigo_orden, x.fecha_fmt, x.cliente_nombre, x.tipo_servicio, x.estado_servicio, x.viaje_asignado, x.conductor, x.placa_tracto, x.placa_carreta,
          x.moneda, n(x.costo_flete), n(x.carga_doc), n(x.peso_documentos), x.puntos_carga, x.puntos_destino]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const fila = (label: string, valor: unknown, mono = false) => (valor === null || valor === undefined || valor === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{String(valor)}</span></div>
  ));
  const est = String(abierta?.estado_servicio ?? 'PENDIENTE').toUpperCase();

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Órdenes de servicio"
        subtitle={lista.isLoading ? 'Cargando…' : `${datos.length} órdenes · ${conteo.INICIADO ?? 0} en curso`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} órdenes`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
            ]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ orden: null })}>Nueva orden</Button>}
          </>
        }
      />

      <OrdenServicioSheet open={!!formulario} orden={formulario?.orden ?? null} onClose={() => setFormulario(null)} />
      <IniciarServicioSheet orden={iniciar} onClose={() => setIniciar(null)} onIniciado={alIniciar} />
      <CocheraExpressSheet open={!!cocheraDatos} datos={cocheraDatos} onClose={() => setCocheraDatos(null)} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          {[['', 'Todas', datos.length], ...ESTADOS.map(e => [e, e.charAt(0) + e.slice(1).toLowerCase() + 's', conteo[e] ?? 0])].map(([val, label, c]) => (
            <button key={String(val)} type="button" onClick={() => setEstado(String(val))}
              style={{ padding: '0.375rem 0.875rem', borderRadius: 'var(--r-full)', fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                background: estado === val ? 'var(--ink)' : 'var(--fill)', color: estado === val ? 'var(--label-inverse)' : 'var(--label-2)' }}>
              {label} <span style={{ opacity: 0.7, marginLeft: 4 }}>{c}</span>
            </button>
          ))}
        </div>

        <SearchField value={busqueda} placeholder="Orden, cliente, conductor, viaje o servicio…"
          onChange={v => { setBusqueda(v); window.clearTimeout((window as unknown as { _osT?: number })._osT); (window as unknown as { _osT?: number })._osT = window.setTimeout(() => setQ(v.trim()), 350); }} />

        {lista.isLoading ? <PageLoader /> : lista.isError ? <Notice tone="error">{errorMessage(lista.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || estado ? <SearchX size={22} /> : <ScrollText size={22} />} title={busqueda || estado ? 'Sin coincidencias' : 'Sin órdenes de servicio'}>
            {puedeCrear ? 'Crea la primera con el botón «Nueva orden».' : 'Aún no hay órdenes registradas.'}
          </EmptyState>
        ) : (
          <TablaRedimensionable id="ordenes-servicio" columnas={COLUMNAS} ariaLabel="Órdenes de servicio">
            {visibles.map(x => {
              const e = estadoDe(x);
              return (
                <tr key={x.id} className="tabla-redim__fila--click" onClick={() => { haptic('selection'); setAbiertoId(x.id); }}>
                  <Celda><Pastilla tono={color(e)}>{e}</Pastilla></Celda>
                  <Celda mono>{x.codigo_orden}</Celda>
                  <Celda mono>{x.fecha_fmt || '—'}</Celda>
                  <Celda>{x.cliente_nombre || 'Sin cliente'}</Celda>
                  <Celda>{x.tipo_servicio || '—'}</Celda>
                  <Celda mono>{x.viaje_asignado || '—'}</Celda>
                  <Celda><LicensePlate plate={x.placa_tracto ?? ''} size="sm" /></Celda>
                  <Celda><LicensePlate plate={x.placa_carreta ?? ''} size="sm" /></Celda>
                  <Celda>{x.conductor || '—'}</Celda>
                  <Celda alinear="right" mono>{simboloMoneda(x.moneda)} {n(x.costo_flete).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Celda>
                  <Celda>
                    <span style={{ display: 'inline-flex', gap: 'var(--s-1)' }} onClick={ev => ev.stopPropagation()}>
                      {puedeEditar && e !== 'FINALIZADO' && e !== 'ANULADO' && (
                        <Button variant="secondary" icon={<Pencil size={15} />} aria-label={`Editar orden ${x.codigo_orden}`} onClick={() => editarFila(x.id)}>{''}</Button>
                      )}
                      {puedeEditar && e === 'PENDIENTE' && (
                        <Button variant="secondary" icon={<Play size={15} />} aria-label={`Iniciar orden ${x.codigo_orden}`} onClick={() => setIniciar(x)}>{''}</Button>
                      )}
                      {puedeEditar && e === 'INICIADO' && (
                        <Button variant="secondary" icon={<CheckCircle2 size={15} />} aria-label={`Finalizar orden ${x.codigo_orden}`} loading={ocupado} onClick={() => cambiarEstado(x, 'FINALIZADO')}>{''}</Button>
                      )}
                    </span>
                  </Celda>
                </tr>
              );
            })}
          </TablaRedimensionable>
        )}
      </div>

      <Sheet open={!!abierta} onClose={() => setAbiertoId(null)} title={abierta ? `Orden ${abierta.codigo_orden}` : ''}
        footer={
          puedeEditar && abierta && est !== 'FINALIZADO' && est !== 'ANULADO' ? (
            <>
              <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => { if (det.data) { setFormulario({ orden: det.data as unknown as OrdenParaEditar }); setAbiertoId(null); } }} disabled={!det.data}>Editar</Button>
              <Button variant="secondary" icon={<XCircle size={16} />} onClick={() => cambiarEstado(abierta, 'ANULADO')} loading={ocupado}>Anular</Button>
              {est === 'PENDIENTE' && <Button variant="primary" icon={<Play size={16} />} onClick={() => setIniciar(abierta)} loading={ocupado}>Iniciar</Button>}
              {est === 'INICIADO' && <Button variant="primary" icon={<CheckCircle2 size={16} />} onClick={() => cambiarEstado(abierta, 'FINALIZADO')} loading={ocupado}>Finalizar</Button>}
            </>
          ) : <Button variant="secondary" onClick={() => setAbiertoId(null)}>Cerrar</Button>
        }>
        {o && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <div className="inv-metricas">
              <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.0625rem', color: `var(--${color(est)}-ink)` }}>{est}</span><span className="inv-metrica__label">Estado</span></div>
              <div className="inv-metrica"><span className="inv-metrica__num">{n(o.carga_doc)}</span><span className="inv-metrica__label">Documentos</span></div>
              <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.0625rem' }}>{n(o.peso_documentos).toLocaleString('es-PE')} kg</span><span className="inv-metrica__label">Peso</span></div>
            </div>
            <div className="tarjeta__lista">
              {fila('Cliente', o.cliente_nombre)}{fila('Servicio', o.tipo_servicio)}{fila('Modalidad', [o.tipo_contratacion, o.modalidad_ejecucion].filter(Boolean).join(' · '))}
              {fila('Viaje', o.viaje_asignado, true)}{fila('Conductor', o.conductor)}{fila('Tracto / carreta', [o.placa_tracto, o.placa_carreta].filter(Boolean).join(' / '), true)}
              {fila('Fecha', [o.fecha_fmt, o.fecha_fin_fmt].filter(Boolean).join(' → '), true)}{fila('Origen', o.puntos_carga)}{fila('Destino', o.puntos_destino)}{fila('Destinatario', o.destinatario)}
              {fila('Flete', `${simboloMoneda(o.moneda)} ${n(o.costo_flete).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`)}{fila('Observaciones', o.observaciones)}
            </div>
            {det.isLoading && <PageLoader />}
            {(det.data?.rutas ?? []).length > 0 && (
              <div>
                <p className="tarjeta__grupo-titulo">Rutas ({det.data!.rutas!.length})</p>
                <div className="tarjeta__lista">
                  {det.data!.rutas!.map(r => <div key={r.id} className="dato"><span className="dato__label">{r.ruta}</span><span className="dato__valor">{n(r.distancia_km)} km · {n(r.galones)} gl</span></div>)}
                </div>
              </div>
            )}
            {(det.data?.documentos ?? []).length > 0 && (
              <div>
                <p className="tarjeta__grupo-titulo">Documentos de carga ({det.data!.documentos!.length})</p>
                <div className="tarjeta__lista">
                  {det.data!.documentos!.map(d => (
                    <div key={d.id} className="dato">
                      <span className="dato__label">{d.numero_documento || d.guia || d.descripcion || `Documento ${d.id}`}</span>
                      <span className="dato__valor">{n(d.peso).toLocaleString('es-PE')} kg · {n(d.volumen)} m³ {d.fecha_carga_fmt ? `· carga ${d.fecha_carga_fmt}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </Page>
  );
}
