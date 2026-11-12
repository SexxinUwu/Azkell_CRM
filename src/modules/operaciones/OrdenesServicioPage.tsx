import '../mantenimiento/mant.css';
import '../../core/ui/acciones-iconos.css';
import './servicios.css';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CircleAlert, FileSpreadsheet, Link2, Link2Off, PackageCheck, Pencil, Play, Plus, Route, ScrollText, SearchX, Wand2, XCircle } from 'lucide-react';
import { OrdenServicioSheet, type OrdenParaEditar } from './OrdenServicioSheet';
import { AccionesCabecera } from '../../core/ui/AccionesCabecera';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, TextInput } from '../../core/ui/Field';
import { ChoiceChips } from '../../core/ui/Chips';
import { Combobox } from '../../core/ui/Combobox';
import { BarraFiltros, GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { TooltipFijo } from '../../core/ui/TooltipFijo';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { dayKey } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';

interface Orden {
  id: number; codigo_orden: string; fecha_fmt: string | null; fecha_entrega_fmt: string | null; cliente_nombre: string | null; tipo_servicio: string | null;
  estado_servicio: string | null; es_retorno: number | boolean | null; origen: string | null; destino: string | null; descripcion_carga: string | null;
  peso_estimado: number | string | null; moneda: string | null; tipo_cambio: number | string | null; costo_flete: number | string | null; impuesto: string | null;
  destinatario: string | null; remitente_generador: string | null; observaciones: string | null;
  viaje: string | null; viajes_n: number; viaje_estado: string | null; conductor: string | null; placa_tracto: string | null; placa_carreta: string | null;
  ejecucion: string | null; tercero_nombre: string | null;
}
interface Detalle extends Orden { viajes?: { viaje: string; estado: string | null; conductor: string | null; placa_tracto: string | null; ejecucion: string | null; tercero_nombre: string | null }[] }
interface ViajeAbierto { viaje: string; fecha_viaje: string | null; conductor: string | null; placa_tracto: string | null; ruta: string | null; estado: string }

const ESTADOS = ['PENDIENTE', 'PROGRAMADO', 'EN_EJECUCION', 'ENTREGADO', 'ANULADO'] as const;
const ETIQUETA: Record<string, string> = { PENDIENTE: 'Pendiente', PROGRAMADO: 'Programado', EN_EJECUCION: 'En ejecución', ENTREGADO: 'Entregado', ANULADO: 'Anulado' };
const TONO: Record<string, string> = { PENDIENTE: 'amber', PROGRAMADO: 'accent', EN_EJECUCION: 'accent', ENTREGADO: 'green', ANULADO: 'gray' };
const n = (v: unknown) => Number(v) || 0;
const estadoDe = (o: Orden) => String(o.estado_servicio ?? 'PENDIENTE').toUpperCase();
const simbolo = (m: string | null) => (/DOL/i.test(String(m ?? '')) ? 'US$' : 'S/');
const dinero = (o: Orden) => `${simbolo(o.moneda)} ${n(o.costo_flete).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cerrado = (e: string) => e === 'ENTREGADO' || e === 'ANULADO';
const etiquetaTipo = (t: string | null) => (/LOCAL/i.test(String(t ?? '')) ? 'Local' : /NACIONAL/i.test(String(t ?? '')) ? 'Nacional' : t || '—');

function Pastilla({ estado }: { estado: string }) {
  const t = TONO[estado] ?? 'gray';
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: `var(--${t}-tint)`, color: `var(--${t}-ink)`, fontSize: '0.6875rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{ETIQUETA[estado] ?? estado}</span>;
}

// Avance del servicio en cuatro pasos (pendiente, programado, en ejecución, entregado)
function Pasos({ estado }: { estado: string }) {
  const idx = Math.max(0, ['PENDIENTE', 'PROGRAMADO', 'EN_EJECUCION', 'ENTREGADO'].indexOf(estado));
  return (
    <div>
      <div className="os-pasos" role="img" aria-label={`Avance: ${ETIQUETA[estado] ?? estado}`}>
        {[0, 1, 2, 3].map(i => <span key={i} className={`os-paso${estado !== 'ANULADO' && i <= idx ? ' os-paso--on' : ''}`} />)}
      </div>
      <div className="os-pasos-leyenda"><span>Pendiente</span><span>Programado</span><span>En ejecución</span><span>Entregado</span></div>
    </div>
  );
}

// Acción de icono dentro de una fila de la tabla: nombre al pasar el mouse
function IconoFila({ texto, tono, icono, onClick, cargando }: { texto: string; tono: string; icono: ReactNode; onClick: () => void; cargando?: boolean }) {
  return (
    <TooltipFijo texto={texto}>
      <button type="button" className={`acciones-iconos__boton acciones-iconos__boton--libre acciones-iconos__boton--${tono}`} aria-label={texto} disabled={cargando}
        style={{ width: 32, height: 32 }} onClick={ev => { ev.stopPropagation(); onClick(); }}>{icono}</button>
    </TooltipFijo>
  );
}

// Elegir un viaje abierto para sumar el servicio
function AsignarViajeSheet({ orden, onClose, onAsignado }: { orden: Orden | null; onClose: () => void; onAsignado: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const viajes = useQuery<ViajeAbierto[]>({
    queryKey: ['operaciones', 'viajes-abiertos'], enabled: !!orden, staleTime: 10_000,
    queryFn: () => api<{ data?: ViajeAbierto[] }>('/operaciones/ordenes-viaje', { query: { limit: 200 } })
      .then(r => (r.data ?? []).filter(v => ['ACTIVO', 'INICIADO'].includes(String(v.estado).toUpperCase()))),
  });
  useEffect(() => { if (orden) setQ(''); }, [orden]);
  const t = q.trim().toLowerCase();
  const lista = (viajes.data ?? []).filter(v => !t || [v.viaje, v.conductor, v.placa_tracto, v.ruta].some(x => String(x ?? '').toLowerCase().includes(t)));

  async function elegir(v: ViajeAbierto) {
    if (!orden) return;
    setEnviando(v.viaje);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/operaciones/ordenes-servicio/${orden.id}/asignar-viaje`, { method: 'POST', body: { viaje: v.viaje } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo asignar');
      haptic('success'); toast(`Servicio asignado al viaje ${v.viaje}`); onAsignado();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEnviando(null); }
  }

  return (
    <Sheet open={!!orden} onClose={() => !enviando && onClose()} title="Asignar a un viaje">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <p className="t-callout c-secondary" style={{ margin: 0 }}>Orden <strong className="c-primary">{orden?.codigo_orden}</strong> · {orden?.origen} → {orden?.destino}</p>
        <SearchField value={q} onChange={setQ} placeholder="Viaje, conductor, placa o ruta…" />
        {viajes.isLoading ? <PageLoader /> : lista.length === 0 ? (
          <EmptyState icon={<Route size={22} />} title="No hay viajes abiertos">Cierra esta hoja y usa «Generar viaje» para crear uno con los datos de la orden.</EmptyState>
        ) : lista.map(v => (
          <button key={v.viaje} type="button" className="os-viaje" style={{ border: 0, cursor: 'pointer', textAlign: 'left' }} disabled={!!enviando} onClick={() => elegir(v)}>
            <span className="os-viaje__datos">
              <span className="os-viaje__codigo">{v.viaje}</span>
              <span className="os-viaje__detalle">{[v.conductor, v.placa_tracto, v.ruta].filter(Boolean).join(' · ') || 'Sin conductor ni unidad todavía'}</span>
            </span>
            {enviando === v.viaje ? <span className="spinner" aria-hidden /> : <ArrowRight size={16} aria-hidden />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// Confirmación para iniciar el servicio: fecha de inicio y confirmación explícita
function IniciarServicioSheet({ orden, onClose, onIniciado }: { orden: Orden | null; onClose: () => void; onIniciado: () => void }) {
  const toast = useToast();
  const [fecha, setFecha] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (orden) { setFecha(dayKey(new Date())); setConfirmado(false); setError(null); } }, [orden]);

  async function iniciar() {
    if (!orden) return;
    if (!fecha) { setError('Indica la fecha de inicio.'); return; }
    if (!confirmado) { setError('Debes confirmar que deseas realizar esta operación.'); return; }
    setError(null); setEnviando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/operaciones/ordenes-servicio/${orden.id}/estado`, { method: 'PUT', body: { estado_servicio: 'EN_EJECUCION', fecha_inicio: fecha } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo iniciar el servicio');
      haptic('success'); toast(`Orden ${orden.codigo_orden}: en ejecución`); onIniciado();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={!!orden} onClose={() => !enviando && onClose()} title="Iniciar servicio"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button><Button variant="primary" icon={<Play size={16} />} onClick={iniciar} loading={enviando}>Iniciar ahora</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <p className="t-callout c-secondary" style={{ margin: 0 }}>Orden <strong className="c-primary">{orden?.codigo_orden}</strong> · viaje <strong className="c-primary">{orden?.viaje}</strong></p>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
        <Field label="Fecha de inicio *">{p => <TextInput {...p} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />}</Field>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={confirmado} onChange={e => { setConfirmado(e.target.checked); setError(null); }} />
          <span>Confirmo realizar esta operación</span>
        </label>
        <p className="t-footnote c-secondary" style={{ margin: 0 }}>El viaje pasa a iniciado y se registra la cuenta por cobrar en Tesorería.</p>
      </div>
    </Sheet>
  );
}

const COLUMNAS: ColumnaTabla[] = [
  { id: 'estado', titulo: 'Estado', ancho: 130 },
  { id: 'codigo', titulo: 'Orden', ancho: 150, minimo: 120 },
  { id: 'fecha', titulo: 'Fecha', ancho: 110 },
  { id: 'cliente', titulo: 'Cliente', ancho: 220, minimo: 140 },
  { id: 'tramo', titulo: 'Tramo', ancho: 240, minimo: 150 },
  { id: 'viaje', titulo: 'Viaje', ancho: 140 },
  { id: 'unidad', titulo: 'Unidad y conductor', ancho: 210 },
  { id: 'flete', titulo: 'Flete', ancho: 130, alinear: 'right' },
  { id: 'acciones', titulo: 'Acciones', ancho: 150, minimo: 120 },
];

// Operaciones › Órdenes de servicio: el pedido del cliente. Se programa en un viaje (existente o nuevo), se ejecuta y se entrega.
export function OrdenesServicioPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{ orden: OrdenParaEditar | null } | null>(null);
  const [iniciar, setIniciar] = useState<Orden | null>(null);
  const [asignar, setAsignar] = useState<Orden | null>(null);
  const [anular, setAnular] = useState<Orden | null>(null);
  const [entregar, setEntregar] = useState<Orden | null>(null);
  const [filtrando, setFiltrando] = useState(false);
  const [tipo, setTipo] = useState<'' | 'NACIONAL' | 'LOCAL'>('');
  const [sentido, setSentido] = useState<'' | 'IDA' | 'RETORNO'>('');
  const [conViaje, setConViaje] = useState<'' | 'con' | 'sin'>('');
  const [cliente, setCliente] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const lista = useQuery<Orden[]>({
    queryKey: ['operaciones', 'ordenes-servicio', q],
    queryFn: () => api<{ data?: Orden[] }>(`/operaciones/ordenes-servicio${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(r => r.data ?? []),
    staleTime: 20_000,
  });
  const det = useQuery<Detalle>({
    queryKey: ['operaciones', 'orden-servicio', abiertoId], enabled: abiertoId != null,
    queryFn: () => api<{ data: Detalle }>(`/operaciones/ordenes-servicio/${abiertoId}`).then(r => r.data),
  });

  const datos = lista.data ?? [];
  const clientes = useMemo(() => [...new Set(datos.map(o => (o.cliente_nombre ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [datos]);
  const visibles = useMemo(() => datos.filter(o => {
    if (estado && estadoDe(o) !== estado) return false;
    if (tipo && !String(o.tipo_servicio ?? '').toUpperCase().includes(tipo)) return false;
    if (sentido && Boolean(o.es_retorno) !== (sentido === 'RETORNO')) return false;
    if (conViaje && Boolean(o.viaje) !== (conViaje === 'con')) return false;
    if (cliente && (o.cliente_nombre ?? '').trim() !== cliente) return false;
    if (desde && (o.fecha_fmt ?? '') < desde) return false;
    if (hasta && (o.fecha_fmt ?? '') > hasta) return false;
    return true;
  }), [datos, estado, tipo, sentido, conViaje, cliente, desde, hasta]);
  const filtrosActivos = [tipo, sentido, conViaje, cliente, desde, hasta].filter(Boolean).length;
  const limpiarFiltros = () => { setTipo(''); setSentido(''); setConViaje(''); setCliente(''); setDesde(''); setHasta(''); };
  const conteo = useMemo(() => Object.fromEntries(ESTADOS.map(e => [e, datos.filter(o => estadoDe(o) === e).length])), [datos]);
  const puedeEditar = can('op_ordenes_servicio.editar', 'op_ordenes_servicio.crear', 'op_ordenes_viaje.editar');
  const puedeCrear = can('op_ordenes_servicio.crear', 'op_ordenes_servicio.editar', 'op_ordenes_viaje.editar');
  const abierta = datos.find(o => o.id === abiertoId) ?? null;
  const o = det.data ?? abierta;
  const refrescar = () => qc.invalidateQueries({ queryKey: ['operaciones'] });

  async function lanzar(clave: string, fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, aviso: string) {
    setOcupado(clave);
    try {
      const r = await fn();
      if (r.ok === false) throw new Error(r.error || 'No se pudo completar la acción');
      haptic('success'); toast(r.message || aviso); await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(null); }
  }
  const cambiarEstado = (x: Orden, nuevo: string, aviso: string) =>
    lanzar(`${x.id}-${nuevo}`, () => api(`/operaciones/ordenes-servicio/${x.id}/estado`, { method: 'PUT', body: { estado_servicio: nuevo } }), aviso);
  const generarViaje = (x: Orden) =>
    lanzar(`${x.id}-gen`, () => api(`/operaciones/ordenes-servicio/${x.id}/generar-viaje`, { method: 'POST' }), 'Viaje generado');
  const quitarDelViaje = (x: Orden) =>
    lanzar(`${x.id}-quitar`, () => api(`/operaciones/ordenes-servicio/${x.id}/viaje/${encodeURIComponent(x.viaje ?? '')}`, { method: 'DELETE' }), 'Servicio quitado del viaje');

  async function editarFila(id: number) {
    try {
      const r = await api<{ data: Detalle }>(`/operaciones/ordenes-servicio/${id}`);
      setFormulario({ orden: r.data as unknown as OrdenParaEditar });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
  }

  async function exportar() {
    try {
      await exportarExcel('Ordenes-de-servicio', 'Órdenes',
        ['Orden', 'Fecha', 'Cliente', 'Tipo', 'Sentido', 'Origen', 'Destino', 'Carga', 'Peso (kg)', 'Estado', 'Viaje', 'Conductor', 'Tracto', 'Moneda', 'Flete'],
        visibles.map(x => [x.codigo_orden, x.fecha_fmt, x.cliente_nombre, x.tipo_servicio, x.es_retorno ? 'Retorno' : 'Ida', x.origen, x.destino, x.descripcion_carga, n(x.peso_estimado),
          ETIQUETA[estadoDe(x)], x.viaje, x.conductor, x.placa_tracto, x.moneda, n(x.costo_flete)]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const fila = (label: string, valor: unknown, mono = false) => (valor === null || valor === undefined || valor === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{String(valor)}</span></div>
  ));
  const est = abierta ? estadoDe(abierta) : 'PENDIENTE';

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Órdenes de servicio"
        subtitle={lista.isLoading ? 'Cargando…' : `${datos.length} órdenes · ${conteo.EN_EJECUCION ?? 0} en ejecución · ${conteo.PENDIENTE ?? 0} por programar`}
        actions={
          <>
            <AccionesCabecera etiqueta="Acciones de órdenes de servicio" acciones={[{ label: 'Exportar Excel', icon: <FileSpreadsheet size={17} />, tono: 'verde', onClick: exportar }]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ orden: null })}>Nueva orden</Button>}
          </>
        }
      />

      <OrdenServicioSheet open={!!formulario} orden={formulario?.orden ?? null} onClose={() => setFormulario(null)} />
      <AsignarViajeSheet orden={asignar} onClose={() => setAsignar(null)} onAsignado={() => { setAsignar(null); void refrescar(); }} />
      <IniciarServicioSheet orden={iniciar} onClose={() => setIniciar(null)} onIniciado={() => { setIniciar(null); void refrescar(); }} />
      <ConfirmSheet open={!!anular} onClose={() => setAnular(null)} title="Anular orden" confirmLabel="Anular orden" loading={!!ocupado}
        message={`Se anula la orden ${anular?.codigo_orden ?? ''} y se quita de su viaje. No se puede deshacer.`}
        onConfirm={async () => { if (anular) { await cambiarEstado(anular, 'ANULADO', 'Orden anulada'); setAnular(null); setAbiertoId(null); } }} />
      <ConfirmSheet open={!!entregar} onClose={() => setEntregar(null)} title="Marcar como entregada" confirmLabel="Marcar entregada" loading={!!ocupado}
        message={`Confirmas que la carga de la orden ${entregar?.codigo_orden ?? ''} ya fue entregada al cliente.`}
        onConfirm={async () => { if (entregar) { await cambiarEstado(entregar, 'ENTREGADO', 'Orden entregada'); setEntregar(null); } }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          {[['', 'Todas', datos.length], ...ESTADOS.map(e => [e, ETIQUETA[e], conteo[e] ?? 0])].map(([val, label, c]) => (
            <button key={String(val)} type="button" className={`os-chip${estado === val ? ' os-chip--on' : ''}`} aria-pressed={estado === val} onClick={() => setEstado(String(val))}>
              {label} <span className="os-chip__n">{c}</span>
            </button>
          ))}
        </div>

        <BarraFiltros busqueda={busqueda} placeholder="Orden, cliente, tramo, viaje, conductor o placa…" activos={filtrosActivos} onAbrirFiltros={() => setFiltrando(true)}
          onBusqueda={v => { setBusqueda(v); window.clearTimeout((window as unknown as { _osT?: number })._osT); (window as unknown as { _osT?: number })._osT = window.setTimeout(() => setQ(v.trim()), 350); }} />

        <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={filtrosActivos} onLimpiar={limpiarFiltros} resultado={visibles.length} unidad="orden">
          <GrupoFiltro titulo="Tipo de servicio">
            <ChoiceChips label="Tipo de servicio" value={tipo} onChange={setTipo}
              options={[{ value: '', label: 'Todos' }, { value: 'NACIONAL', label: 'Nacional' }, { value: 'LOCAL', label: 'Local' }]} />
          </GrupoFiltro>
          <GrupoFiltro titulo="Sentido">
            <ChoiceChips label="Sentido" value={sentido} onChange={setSentido}
              options={[{ value: '', label: 'Todos' }, { value: 'IDA', label: 'Ida' }, { value: 'RETORNO', label: 'Retorno con carga' }]} />
          </GrupoFiltro>
          <GrupoFiltro titulo="Viaje">
            <ChoiceChips label="Viaje" value={conViaje} onChange={setConViaje}
              options={[{ value: '', label: 'Todos' }, { value: 'sin', label: 'Sin viaje' }, { value: 'con', label: 'Con viaje' }]} />
          </GrupoFiltro>
          <GrupoFiltro titulo="Fecha del servicio">
            <div className="os-fila">
              <Field label="Desde">{p => <TextInput {...p} type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} />}</Field>
              <Field label="Hasta">{p => <TextInput {...p} type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} />}</Field>
            </div>
          </GrupoFiltro>
          {clientes.length > 1 && (
            <GrupoFiltro titulo="Cliente">
              <Combobox options={clientes.map(c => ({ value: c, label: c }))} value={cliente || null} placeholder="Todos los clientes" onChange={v => setCliente(v ?? '')} />
            </GrupoFiltro>
          )}
        </HojaFiltros>

        {lista.isLoading ? <PageLoader /> : lista.isError ? <Notice tone="error">{errorMessage(lista.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || estado || filtrosActivos ? <SearchX size={22} /> : <ScrollText size={22} />} title={busqueda || estado || filtrosActivos ? 'Sin coincidencias' : 'Sin órdenes de servicio'}>
            {puedeCrear ? 'Crea la primera con el botón «Nueva orden».' : 'Aún no hay órdenes registradas.'}
          </EmptyState>
        ) : (
          <TablaRedimensionable id="ordenes-servicio-v2" columnas={COLUMNAS} ariaLabel="Órdenes de servicio">
            {visibles.map(x => {
              const e = estadoDe(x);
              const libre = puedeEditar && !cerrado(e);
              return (
                <tr key={x.id} className="tabla-redim__fila--click" onClick={() => { haptic('selection'); setAbiertoId(x.id); }}>
                  <Celda><Pastilla estado={e} /></Celda>
                  <Celda mono>{x.codigo_orden}{x.es_retorno ? ' · retorno' : ''}</Celda>
                  <Celda mono>{x.fecha_fmt || '—'}</Celda>
                  <Celda>{x.cliente_nombre || 'Sin cliente'}</Celda>
                  <Celda>{[x.origen, x.destino].filter(Boolean).join(' → ') || '—'}</Celda>
                  <Celda mono>{x.viaje ? `${x.viaje}${x.viajes_n > 1 ? ` +${x.viajes_n - 1}` : ''}` : '—'}</Celda>
                  <Celda>
                    {x.placa_tracto ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><LicensePlate plate={x.placa_tracto} size="sm" />{x.conductor}</span>
                      : x.tercero_nombre ? x.tercero_nombre : '—'}
                  </Celda>
                  <Celda alinear="right" mono>{dinero(x)}</Celda>
                  <Celda>
                    <span style={{ display: 'inline-flex', gap: 2 }}>
                      {libre && !x.viaje && <IconoFila texto="Generar viaje" tono="violeta" icono={<Wand2 size={17} />} cargando={ocupado === `${x.id}-gen`} onClick={() => generarViaje(x)} />}
                      {libre && !x.viaje && <IconoFila texto="Asignar a un viaje" tono="azul" icono={<Link2 size={17} />} onClick={() => setAsignar(x)} />}
                      {libre && e === 'PROGRAMADO' && <IconoFila texto="Iniciar servicio" tono="verde" icono={<Play size={17} />} onClick={() => setIniciar(x)} />}
                      {puedeEditar && e === 'EN_EJECUCION' && <IconoFila texto="Marcar entregada" tono="verde" icono={<PackageCheck size={17} />} onClick={() => setEntregar(x)} />}
                      {libre && <IconoFila texto="Editar" tono="ambar" icono={<Pencil size={16} />} onClick={() => editarFila(x.id)} />}
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
          puedeEditar && abierta && !cerrado(est) ? (
            <>
              <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => { if (det.data) { setFormulario({ orden: det.data as unknown as OrdenParaEditar }); setAbiertoId(null); } }} disabled={!det.data}>Editar</Button>
              <Button variant="secondary" icon={<XCircle size={16} />} onClick={() => setAnular(abierta)}>Anular</Button>
              {est === 'PROGRAMADO' && <Button variant="primary" icon={<Play size={16} />} onClick={() => setIniciar(abierta)}>Iniciar</Button>}
              {est === 'EN_EJECUCION' && <Button variant="primary" icon={<PackageCheck size={16} />} onClick={() => setEntregar(abierta)}>Marcar entregada</Button>}
            </>
          ) : <Button variant="secondary" onClick={() => setAbiertoId(null)}>Cerrar</Button>
        }>
        {o && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <Pasos estado={estadoDe(o)} />
            <div className="os-viaje">
              <span className="os-viaje__datos">
                <span className="os-viaje__codigo">{o.viaje ? `Viaje ${o.viaje}` : 'Sin viaje todavía'}</span>
                <span className="os-viaje__detalle">
                  {o.viaje
                    ? ([o.conductor, o.placa_tracto, o.ejecucion === 'TERCERO' ? `Tercero${o.tercero_nombre ? `: ${o.tercero_nombre}` : ''}` : null].filter(Boolean).join(' · ') || 'Aún sin conductor ni unidad')
                    : 'Asígnala a un viaje abierto o genera uno nuevo con sus datos.'}
                </span>
              </span>
              <span style={{ display: 'inline-flex', gap: 'var(--s-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {o.viaje && <Button variant="secondary" size="sm" icon={<Route size={15} />} onClick={() => navigate('/operaciones/ordenes-viaje')}>Ver viajes</Button>}
                {puedeEditar && !cerrado(est) && o.viaje && ['PENDIENTE', 'PROGRAMADO'].includes(est) && (
                  <Button variant="plain" size="sm" icon={<Link2Off size={15} />} loading={ocupado === `${o.id}-quitar`} onClick={() => quitarDelViaje(o)}>Quitar</Button>
                )}
                {puedeEditar && !cerrado(est) && !o.viaje && (
                  <>
                    <Button variant="secondary" size="sm" icon={<Link2 size={15} />} onClick={() => setAsignar(o)}>Asignar</Button>
                    <Button variant="primary" size="sm" icon={<Wand2 size={15} />} loading={ocupado === `${o.id}-gen`} onClick={() => generarViaje(o)}>Generar viaje</Button>
                  </>
                )}
              </span>
            </div>
            <div className="tarjeta__lista">
              {fila('Cliente', o.cliente_nombre)}{fila('Servicio', `${etiquetaTipo(o.tipo_servicio)}${o.es_retorno ? ' · retorno con carga' : ''}`)}
              {fila('Origen', o.origen)}{fila('Destino', o.destino)}{fila('Remitente', o.remitente_generador)}{fila('Destinatario', o.destinatario)}
              {fila('Carga', o.descripcion_carga)}{fila('Peso estimado', n(o.peso_estimado) ? `${n(o.peso_estimado).toLocaleString('es-PE')} kg` : null)}
              {fila('Fecha', [o.fecha_fmt, o.fecha_entrega_fmt].filter(Boolean).join(' → '), true)}
              {fila('Flete', `${dinero(o)} · ${o.impuesto ?? ''}`)}{fila('Observaciones', o.observaciones)}
            </div>
            {det.isLoading && <PageLoader />}
          </div>
        )}
      </Sheet>
    </Page>
  );
}
