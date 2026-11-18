import '../mantenimiento/mant.css';
import '../../core/ui/acciones-iconos.css';
import '../almacen/almacen.css';
import '../almacen/entradas.css';
import '../gerencia/gerencia-oc.css';
import '../tesoreria/pago.css';
import './seguimiento.css';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, CircleAlert, Coins, FilePlus2, FileCode2, FileText, Package, Pencil, ReceiptText, RefreshCw, Search, SearchX, Send, Trash2, Undo2, Users, Wallet } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { BarraFiltros, GrupoFiltro, HojaFiltros, ListaEleccion } from '../../core/ui/FiltrosListado';
import { IconoFila } from '../../core/ui/IconoFila';
import { Combobox } from '../../core/ui/Combobox';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { formatFechaPe, formatMoneda } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { consultarDocumento } from '../directorio/api';

interface Config {
  modo: 'prueba' | 'produccion'; lista: boolean; motivo: string | null; ruc_emisor: string; razon_social: string;
  series: Record<string, string>; detraccion: { pct: number; minimo: number; cuenta: boolean };
  motivos_nc: Array<{ codigo: string; texto: string; total: boolean }>;
}
interface ServicioPF {
  id: number; codigo_orden: string; fecha: string; cliente_id: number | null; cliente_nombre: string; ruta: string | null; es_retorno: number | boolean | null;
  estado_servicio: string; moneda: string | null; tipo_cambio: number | string | null; costo_flete: number | string; impuesto: string | null; descripcion_carga: string | null;
  cliente_doc: string | null; cliente_direccion: string | null; viaje: string | null;
  // IGV del servicio: Incluye IGV (valor de venta = flete ÷ 1.18), Más IGV (flete = valor de venta) o No aplica
  modo_igv: 'INCLUYE' | 'MAS' | 'NO'; valor_sin_igv: number; total_con_igv: number;
}
interface Comprobante {
  id: number; tipo_doc: '01' | '03' | '07'; numero_completo: string; fecha_emision: string; fecha_vencimiento: string | null; cliente_doc: string; cliente_nombre: string; moneda: string;
  base: number | string; igv: number | string; total: number | string; detraccion_monto: number | string; neto_pendiente: number | string; forma_pago: string; estado: string;
  apisunat_status: string | null; apisunat_faults: string | null; pdf_url: string | null; xml_url: string | null; cdr_url: string | null; doc_ref_numero: string | null; motivo_texto: string | null;
  modo_emision: string | null; usuario: string | null; referencia: string | null; servicios: string | null;
}
interface ClienteReg { id: number; razon_social: string; doc: string; direccion: string }
interface Linea { orden_servicio: string | null; descripcion: string; cantidad: string; valor_unitario: string }

const n = (v: unknown) => Number(v) || 0;
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const hoyIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const esUsd = (m: string | null | undefined) => /D[OÓ]L|USD/i.test(String(m || ''));
const NOMBRE_TIPO: Record<string, string> = { '01': 'Factura', '03': 'Boleta', '07': 'Nota de crédito' };

const COL_PENDIENTES: ColumnaTabla[] = [
  { id: 'sel', titulo: '', ancho: 44, minimo: 40 },
  { id: 'acciones', titulo: 'Acciones', ancho: 90, minimo: 80 },
  { id: 'codigo', titulo: 'Servicio', ancho: 130 },
  { id: 'fecha', titulo: 'Fecha', ancho: 105 },
  { id: 'cliente', titulo: 'Cliente', ancho: 240, minimo: 140 },
  { id: 'ruta', titulo: 'Ruta', ancho: 220, minimo: 140 },
  { id: 'tramo', titulo: 'Ida / regreso', ancho: 110 },
  { id: 'estado', titulo: 'Estado', ancho: 120 },
  { id: 'importe', titulo: 'Total a facturar', ancho: 210, alinear: 'right' },
];
const COL_COMPROBANTES: ColumnaTabla[] = [
  { id: 'acciones', titulo: 'Documentos', ancho: 150, minimo: 130 },
  { id: 'sunat', titulo: 'SUNAT', ancho: 110 },
  { id: 'numero', titulo: 'Comprobante', ancho: 150, minimo: 120 },
  { id: 'tipo', titulo: 'Tipo', ancho: 130 },
  { id: 'ambiente', titulo: 'Ambiente', ancho: 100 },
  { id: 'emision', titulo: 'Emisión', ancho: 105 },
  { id: 'cliente', titulo: 'Cliente', ancho: 240, minimo: 140 },
  { id: 'servicios', titulo: 'Servicios', ancho: 180, minimo: 120 },
  { id: 'total', titulo: 'Total', ancho: 130, alinear: 'right' },
  { id: 'neto', titulo: 'Neto a cobrar', ancho: 130, alinear: 'right' },
  { id: 'vence', titulo: 'Vence', ancho: 105 },
];

type TonoEstado = 'green' | 'amber' | 'red' | 'gray';
function estadoDe(c: Comprobante): { texto: string; tono: TonoEstado } {
  if (c.estado === 'ANULADO') return { texto: 'Anulada', tono: 'gray' };
  if (c.estado === 'RECHAZADO' || c.apisunat_status === 'RECHAZADO') return { texto: 'Rechazada', tono: 'red' };
  if (c.apisunat_status === 'ACEPTADO') return { texto: 'Aceptada', tono: 'green' };
  return { texto: 'Enviada', tono: 'amber' };
}
/** Estado en SUNAT como una pastilla de color, igual que en Guías de remisión */
function PastillaSunat({ c }: { c: Comprobante }) {
  const e = estadoDe(c);
  return <span title={c.apisunat_faults || undefined} style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: `var(--${e.tono}-tint)`, color: `var(--${e.tono}-ink)`, fontSize: '0.6875rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{e.texto}</span>;
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inicioMesIso = () => { const d = new Date(); d.setDate(1); return iso(d); };
const fechaCorta = (f?: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—');
const abrir = (url?: string | null) => { if (url) window.open(url, '_blank', 'noopener'); };
const SECCION_KEY = 'fleet_facturacion_vista';
const vistaGuardada = (): 'pendientes' | 'comprobantes' => { try { return localStorage.getItem(SECCION_KEY) === 'comprobantes' ? 'comprobantes' : 'pendientes'; } catch { return 'pendientes'; } };

/** Operaciones › Facturación: con el mismo diseño de Guías de remisión. Dos secciones: los servicios por facturar y los comprobantes emitidos con su estado en SUNAT. */
export function FacturacionPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const puedeEmitir = can('op_facturacion.crear');
  const [vista, setVista] = useState<'pendientes' | 'comprobantes'>(vistaGuardada);
  const [busqueda, setBusqueda] = useState('');
  // Rango de fechas de emisión de los comprobantes: por defecto, del primer día del mes a hoy
  const [desde, setDesde] = useState(inicioMesIso);
  const [hasta, setHasta] = useState(hoyIso);
  const [filtrando, setFiltrando] = useState(false);
  const [estadoSrv, setEstadoSrv] = useState('');
  const [igvF, setIgvF] = useState('');
  const [sunat, setSunat] = useState('');
  const [tipoF, setTipoF] = useState('');
  const [ambiente, setAmbiente] = useState('');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [emitir, setEmitir] = useState<{ servicios: ServicioPF[] } | null>(null);
  const [nc, setNc] = useState<Comprobante | null>(null);
  const [sincronizando, setSincronizando] = useState<number | 'todas' | null>(null);

  const config = useQuery({ queryKey: ['facturacion', 'config'], queryFn: () => api<Config>('/facturacion/config'), staleTime: 60_000 });
  const pend = useQuery({ queryKey: ['facturacion', 'por-facturar'], queryFn: () => api<{ data: ServicioPF[] }>('/facturacion/por-facturar').then(r => r.data ?? []), staleTime: 15_000, refetchOnMount: 'always' });
  const comps = useQuery({ queryKey: ['facturacion', 'lista'], queryFn: () => api<{ data: Comprobante[] }>('/facturacion').then(r => r.data ?? []), staleTime: 15_000, refetchOnMount: 'always' });
  const cfg = config.data;
  const esPend = vista === 'pendientes';

  const todosPend = pend.data ?? [];
  const todosComp = comps.data ?? [];
  const enRango = (c: Comprobante) => (!desde || c.fecha_emision >= desde) && (!hasta || c.fecha_emision <= hasta);
  const compRango = useMemo(() => todosComp.filter(enRango), [todosComp, desde, hasta]); // eslint-disable-line react-hooks/exhaustive-deps
  const fueraDeRango = todosComp.length - compRango.length;
  const esMes = desde === inicioMesIso() && hasta === hoyIso();

  const pendientesVis = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    return todosPend.filter(s => (!estadoSrv || s.estado_servicio === estadoSrv) && (!igvF || s.modo_igv === igvF)
      && (!t || sinTildes(`${s.codigo_orden} ${s.cliente_nombre} ${s.ruta ?? ''} ${s.cliente_doc ?? ''}`).includes(t)));
  }, [todosPend, busqueda, estadoSrv, igvF]);
  const comprobantesVis = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    return compRango.filter(c => (!sunat || estadoDe(c).texto === sunat) && (!tipoF || c.tipo_doc === tipoF) && (!ambiente || (c.modo_emision ?? '') === ambiente)
      && (!t || sinTildes(`${c.numero_completo} ${c.cliente_nombre} ${c.cliente_doc} ${c.servicios ?? ''} ${c.referencia ?? ''}`).includes(t)));
  }, [compRango, busqueda, sunat, tipoF, ambiente]);

  const activos = (esPend ? [estadoSrv, igvF] : [sunat, tipoF, ambiente]).filter(Boolean).length;
  const limpiar = () => { setEstadoSrv(''); setIgvF(''); setSunat(''); setTipoF(''); setAmbiente(''); };
  const cuentaP = (f: (s: ServicioPF) => boolean) => todosPend.filter(f).length;
  const cuentaC = (f: (c: Comprobante) => boolean) => compRango.filter(f).length;
  const enviadas = compRango.filter(c => estadoDe(c).texto === 'Enviada');
  const elegidos = todosPend.filter(s => seleccion.has(s.codigo_orden));
  const clienteElegido = elegidos[0]?.cliente_nombre ?? null;

  const cambiarVista = (v: 'pendientes' | 'comprobantes') => {
    setVista(v); setBusqueda('');
    try { localStorage.setItem(SECCION_KEY, v); } catch { /* sin almacenamiento */ }
  };
  const alternar = (s: ServicioPF) => setSeleccion(prev => { const x = new Set(prev); if (x.has(s.codigo_orden)) x.delete(s.codigo_orden); else x.add(s.codigo_orden); return x; });
  const refrescar = () => { void qc.invalidateQueries({ queryKey: ['facturacion'] }); };

  async function sincronizar(c: Comprobante) {
    setSincronizando(c.id);
    try {
      const r = await api<{ ok?: boolean; error?: string; message?: string }>(`/facturacion/${c.id}/sincronizar`, { method: 'POST', body: {} });
      if (r.ok === false) throw new Error(r.error || 'No se pudo consultar a APISUNAT');
      haptic('success'); toast(r.message || 'Estado actualizado'); refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); } finally { setSincronizando(null); }
  }
  async function sincronizarPendientes() {
    setSincronizando('todas');
    try {
      const r = await api<{ actualizados: number; total: number }>('/facturacion/sincronizar-pendientes', { method: 'POST', body: {} });
      haptic('success'); toast(r.total ? `Se actualizaron ${r.actualizados} de ${r.total} comprobantes` : 'No hay comprobantes pendientes en SUNAT'); refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); } finally { setSincronizando(null); }
  }

  const modoTxt = cfg ? (cfg.modo === 'produccion' ? 'Producción' : 'Modo prueba, sin validez tributaria') : '';
  const subtitulo = (esPend ? pend.isLoading : comps.isLoading) ? 'Cargando…'
    : esPend ? `${todosPend.length} ${todosPend.length === 1 ? 'servicio por facturar' : 'servicios por facturar'}${cfg ? ` · ${cfg.razon_social} · ${modoTxt}` : ''}`
      : `${compRango.length} ${compRango.length === 1 ? 'comprobante' : 'comprobantes'}${enviadas.length ? ` · ${enviadas.length} pendientes en SUNAT` : ''}${cfg ? ` · ${modoTxt}` : ''}`;

  return (
    <Page>
      <PageHeader eyebrow="Operaciones" title="Facturación" subtitle={subtitulo}
        actions={
          <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => { void sincronizarPendientes(); }} loading={sincronizando === 'todas'} disabled={!enviadas.length}>Actualizar estados</Button>
            {puedeEmitir && <Button variant="primary" icon={<FilePlus2 size={16} />} disabled={!cfg?.lista} onClick={() => setEmitir({ servicios: [] })}>Factura libre</Button>}
          </div>
        } />

      {cfg && !cfg.lista && <Notice tone="error" icon={<CircleAlert size={16} />}>{cfg.motivo}</Notice>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder={esPend ? 'Servicio, cliente, RUC o ruta' : 'Número, cliente, RUC o servicio'} activos={activos} onAbrirFiltros={() => setFiltrando(true)}>
          <SegmentedControl label="Sección de facturación" value={vista} onChange={cambiarVista}
            options={[{ value: 'pendientes', label: `Por facturar · ${todosPend.length}` }, { value: 'comprobantes', label: `Comprobantes · ${compRango.length}` }]} />
          {!esPend && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <TextInput type="date" aria-label="Emitidos desde" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} style={{ width: 150 }} />
              <span className="t-footnote c-secondary" aria-hidden>→</span>
              <TextInput type="date" aria-label="Emitidos hasta" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} style={{ width: 150 }} />
            </span>
          )}
        </BarraFiltros>
        {!esPend && (fueraDeRango > 0 || !esMes) && (
          <p className="t-footnote c-secondary" style={{ margin: 0 }}>
            {fueraDeRango > 0 ? `Hay ${fueraDeRango} ${fueraDeRango === 1 ? 'comprobante' : 'comprobantes'} fuera de estas fechas. ` : ''}
            {desde || hasta ? <button type="button" onClick={() => { setDesde(''); setHasta(''); }} style={{ all: 'unset', cursor: 'pointer', color: 'var(--blue-ink, #0a63c9)', fontWeight: 600 }}>Ver todos</button> : null}
            {!esMes ? <>{desde || hasta ? ' · ' : ''}<button type="button" onClick={() => { setDesde(inicioMesIso()); setHasta(hoyIso()); }} style={{ all: 'unset', cursor: 'pointer', color: 'var(--blue-ink, #0a63c9)', fontWeight: 600 }}>Volver a este mes</button></> : null}
          </p>
        )}

        <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={activos} onLimpiar={limpiar} resultado={esPend ? pendientesVis.length : comprobantesVis.length} unidad={esPend ? 'servicio' : 'comprobante'}>
          {esPend ? (
            <>
              <GrupoFiltro titulo="Estado del servicio">
                <ListaEleccion value={estadoSrv} onChange={setEstadoSrv} opciones={[
                  { value: '', label: 'Todos', count: todosPend.length },
                  { value: 'ENTREGADO', label: 'Entregado', count: cuentaP(s => s.estado_servicio === 'ENTREGADO') },
                  { value: 'EN_EJECUCION', label: 'En ejecución', count: cuentaP(s => s.estado_servicio === 'EN_EJECUCION') },
                ]} />
              </GrupoFiltro>
              <GrupoFiltro titulo="IGV del servicio">
                <ListaEleccion value={igvF} onChange={setIgvF} opciones={[
                  { value: '', label: 'Todos', count: todosPend.length },
                  { value: 'INCLUYE', label: 'Incluye IGV', count: cuentaP(s => s.modo_igv === 'INCLUYE') },
                  { value: 'MAS', label: 'Más IGV', count: cuentaP(s => s.modo_igv === 'MAS') },
                  { value: 'NO', label: 'No aplica', count: cuentaP(s => s.modo_igv === 'NO') },
                ]} />
              </GrupoFiltro>
            </>
          ) : (
            <>
              <GrupoFiltro titulo="Estado en SUNAT">
                <ListaEleccion value={sunat} onChange={setSunat} opciones={[{ value: '', label: 'Todos', count: compRango.length }, ...['Aceptada', 'Enviada', 'Rechazada', 'Anulada'].map(e => ({ value: e, label: e, count: cuentaC(c => estadoDe(c).texto === e) }))]} />
              </GrupoFiltro>
              <GrupoFiltro titulo="Tipo de comprobante">
                <ListaEleccion value={tipoF} onChange={setTipoF} opciones={[{ value: '', label: 'Todos', count: compRango.length }, ...(['01', '03', '07'] as const).map(t => ({ value: t as string, label: NOMBRE_TIPO[t], count: cuentaC(c => c.tipo_doc === t) }))]} />
              </GrupoFiltro>
              <GrupoFiltro titulo="Ambiente">
                <ListaEleccion value={ambiente} onChange={setAmbiente} opciones={[
                  { value: '', label: 'Todos', count: compRango.length },
                  { value: 'produccion', label: 'Producción', count: cuentaC(c => c.modo_emision === 'produccion') },
                  { value: 'prueba', label: 'Prueba', count: cuentaC(c => c.modo_emision === 'prueba') },
                ]} />
              </GrupoFiltro>
            </>
          )}
        </HojaFiltros>

        {esPend ? (
          pend.isError ? <Notice tone="error">{errorMessage(pend.error)}</Notice> : pend.isLoading ? <PageLoader /> : pendientesVis.length === 0 ? (
            <EmptyState icon={busqueda || activos ? <SearchX size={22} /> : <ReceiptText size={22} />} title={busqueda || activos ? 'Sin coincidencias' : 'No hay servicios por facturar'}>
              {busqueda || activos ? 'Prueba con otra búsqueda o quita los filtros.' : 'Cuando un servicio quede entregado y tenga su flete, aparecerá aquí. También puedes emitir una factura libre.'}
            </EmptyState>
          ) : (
            <>
              {puedeEmitir && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
                  <Button variant="primary" icon={<FilePlus2 size={16} />} disabled={!elegidos.length || !cfg?.lista} onClick={() => setEmitir({ servicios: elegidos })}>
                    {elegidos.length ? `Facturar ${elegidos.length} ${elegidos.length === 1 ? 'servicio' : 'servicios'}` : 'Elige los servicios a facturar'}
                  </Button>
                  {clienteElegido && <span className="t-footnote c-secondary">Cliente: {clienteElegido}. Una factura es de un solo cliente.</span>}
                  {elegidos.length > 0 && <Button variant="plain" size="sm" onClick={() => setSeleccion(new Set())}>Quitar selección</Button>}
                </div>
              )}
              <TablaRedimensionable id="facturacion-pendientes-v2" columnas={COL_PENDIENTES} ariaLabel="Servicios por facturar" className="tabla-redim--compacta">
                {pendientesVis.map(s => {
                  const otro = !!clienteElegido && clienteElegido !== s.cliente_nombre;
                  return (
                    <tr key={s.codigo_orden} className="tabla-redim__fila--click" style={otro ? { opacity: 0.45 } : undefined} onClick={() => { if (puedeEmitir && !otro) alternar(s); }}>
                      <Celda><input type="checkbox" aria-label={`Elegir ${s.codigo_orden}`} checked={seleccion.has(s.codigo_orden)} disabled={!puedeEmitir || otro} onChange={() => alternar(s)} onClick={e => e.stopPropagation()} /></Celda>
                      <Celda>{puedeEmitir && <IconoFila texto="Facturar este servicio" tono="verde" icono={<FilePlus2 size={15} />} onClick={() => { if (cfg?.lista) setEmitir({ servicios: [s] }); }} />}</Celda>
                      <Celda mono>{s.codigo_orden}</Celda>
                      <Celda mono>{fechaCorta(s.fecha)}</Celda>
                      <Celda>{s.cliente_nombre || '—'}{!s.cliente_doc && <span title="El cliente no tiene RUC registrado" style={{ marginLeft: 6, color: 'var(--red-ink)' }}><CircleAlert size={13} aria-label="Sin RUC" /></span>}</Celda>
                      <Celda>{s.ruta || '—'}</Celda>
                      <Celda>{s.es_retorno ? 'Regreso' : 'Ida'}</Celda>
                      <Celda><PastillaTono tono={s.estado_servicio === 'ENTREGADO' ? 'green' : 'amber'} texto={s.estado_servicio === 'ENTREGADO' ? 'Entregado' : 'En ejecución'} /></Celda>
                      <Celda alinear="right" mono>{formatMoneda(n(s.total_con_igv), esUsd(s.moneda) ? 'USD' : 'PEN')} <span className="t-footnote c-secondary" style={{ marginLeft: 6 }}>{s.modo_igv === 'INCLUYE' ? 'incluye IGV' : s.modo_igv === 'MAS' ? 'más IGV' : 'sin IGV'}</span></Celda>
                    </tr>
                  );
                })}
              </TablaRedimensionable>
            </>
          )
        ) : (
          comps.isError ? <Notice tone="error">{errorMessage(comps.error)}</Notice> : comps.isLoading ? <PageLoader /> : comprobantesVis.length === 0 ? (
            <EmptyState icon={busqueda || activos ? <SearchX size={22} /> : <FileText size={22} />} title={busqueda || activos ? 'Sin coincidencias' : 'Aún no hay comprobantes'}>
              {busqueda || activos ? 'Prueba con otra búsqueda o quita los filtros.' : 'Las facturas y notas de crédito que emitas quedarán aquí con su estado en SUNAT.'}
            </EmptyState>
          ) : (
            <TablaRedimensionable id="facturacion-comprobantes-v2" columnas={COL_COMPROBANTES} ariaLabel="Comprobantes emitidos" className="tabla-redim--compacta">
              {comprobantesVis.map(c => {
                const mon = esUsd(c.moneda) ? 'USD' : 'PEN';
                const e = estadoDe(c);
                return (
                  <tr key={c.id}>
                    <Celda>
                      <span style={{ display: 'inline-flex', gap: 2 }}>
                        {c.pdf_url && <IconoFila texto="PDF de APISUNAT" tono="rojo" icono={<FileText size={15} />} onClick={() => abrir(c.pdf_url)} />}
                        {c.xml_url && <IconoFila texto="Descargar el XML firmado" tono="violeta" icono={<FileCode2 size={15} />} onClick={() => abrir(c.xml_url)} />}
                        {c.cdr_url && <IconoFila texto="Constancia de recepción de SUNAT" tono="verde" icono={<CheckCircle2 size={15} />} onClick={() => abrir(c.cdr_url)} />}
                        {puedeEmitir && c.apisunat_status !== 'ACEPTADO' && e.texto === 'Enviada' && <IconoFila texto="Actualizar estado en SUNAT" tono="azul" icono={<Search size={15} />} cargando={sincronizando === c.id} onClick={() => { void sincronizar(c); }} />}
                        {puedeEmitir && c.tipo_doc !== '07' && c.estado === 'EMITIDO' && c.apisunat_status !== 'RECHAZADO' && <IconoFila texto="Emitir nota de crédito" tono="ambar" icono={<Undo2 size={15} />} onClick={() => setNc(c)} />}
                      </span>
                    </Celda>
                    <Celda><PastillaSunat c={c} /></Celda>
                    <Celda mono>{c.numero_completo}</Celda>
                    <Celda>{NOMBRE_TIPO[c.tipo_doc]}{c.tipo_doc === '07' && c.doc_ref_numero ? <span className="t-footnote c-secondary"> · {c.doc_ref_numero}</span> : null}</Celda>
                    <Celda>{c.modo_emision === 'produccion' ? 'Producción' : c.modo_emision === 'prueba' ? 'Prueba' : '—'}</Celda>
                    <Celda mono>{fechaCorta(c.fecha_emision)}</Celda>
                    <Celda>{c.cliente_nombre}</Celda>
                    <Celda mono>{c.servicios || (c.tipo_doc === '07' ? c.motivo_texto : null) || '—'}</Celda>
                    <Celda alinear="right" mono>{c.tipo_doc === '07' ? '− ' : ''}{formatMoneda(n(c.total), mon)}</Celda>
                    <Celda alinear="right" mono>{c.tipo_doc === '07' ? '—' : formatMoneda(n(c.neto_pendiente), mon)}</Celda>
                    <Celda mono>{fechaCorta(c.fecha_vencimiento)}</Celda>
                  </tr>
                );
              })}
            </TablaRedimensionable>
          )
        )}
      </div>

      {cfg && <EmitirSheet open={!!emitir} servicios={emitir?.servicios ?? []} config={cfg} onClose={() => setEmitir(null)}
        onEmitido={() => { setEmitir(null); setSeleccion(new Set()); cambiarVista('comprobantes'); setDesde(inicioMesIso()); setHasta(hoyIso()); refrescar(); }} />}
      {cfg && <NotaCreditoSheet comprobante={nc} config={cfg} onClose={() => setNc(null)} onEmitida={() => { setNc(null); refrescar(); }} />}
    </Page>
  );
}

/** Pastilla de color (mismo estilo que el estado de las guías) */
function PastillaTono({ tono, texto }: { tono: TonoEstado; texto: string }) {
  return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: `var(--${tono}-tint)`, color: `var(--${tono}-ink)`, fontSize: '0.6875rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{texto}</span>;
}

/** Factura o boleta, con el mismo estilo de «Procesar pago»: datos en lectura con «Editar», detalle de líneas, resumen y confirmación */
function EmitirSheet({ open, servicios, config, onClose, onEmitido }: { open: boolean; servicios: ServicioPF[]; config: Config; onClose: () => void; onEmitido: () => void }) {
  const toast = useToast();
  const libre = servicios.length === 0;
  const [tipo, setTipo] = useState<'01' | '03'>('01');
  const [doc, setDoc] = useState('');
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN');
  const [tc, setTc] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [forma, setForma] = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [dias, setDias] = useState('30');
  const [detPct, setDetPct] = useState('0');
  const [oc, setOc] = useState('');
  const [referencia, setReferencia] = useState('');
  const [obs, setObs] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [clienteSel, setClienteSel] = useState<string | null>(null);
  // El RUC lo escribió la persona (si no, viene del servicio): al cambiarlo se reemplazan el nombre y la dirección con los del nuevo documento
  const [tocoDoc, setTocoDoc] = useState(false);
  const [consulta, setConsulta] = useState<{ ok: boolean; texto: string } | null>(null);
  // Cada bloque se ve en lectura y se abre con «Editar», como en Procesar pago
  const [editCliente, setEditCliente] = useState(false);
  const [editCond, setEditCond] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  // Solo en factura libre: venta sin IGV (inafecta o exonerada). Con servicios, el IGV sale de cada servicio
  const [sinIgv, setSinIgv] = useState(false);
  const clientes = useQuery({ queryKey: ['facturacion', 'clientes'], enabled: open, staleTime: 120_000, queryFn: () => api<{ data: ClienteReg[] }>('/facturacion/clientes').then(r => r.data ?? []) });

  useEffect(() => {
    if (!open) return;
    setError(null); setTipo('01'); setClienteSel(null); setTocoDoc(false); setConsulta(null); setFecha(hoyIso()); setForma('CONTADO'); setDias('30'); setOc(''); setReferencia(''); setObs(''); setConfirmado(false); setSinIgv(false);
    if (libre) {
      setDoc(''); setNombre(''); setDireccion(''); setMoneda('PEN'); setTc(''); setDetPct('0'); setEditCliente(true); setEditCond(true);
      setLineas([{ orden_servicio: null, descripcion: '', cantidad: '1', valor_unitario: '' }]);
      return;
    }
    const s0 = servicios[0];
    const d0 = String(s0.cliente_doc || '').replace(/\D/g, '');
    setDoc(d0); setNombre(s0.cliente_nombre); setDireccion(String(s0.cliente_direccion || ''));
    setEditCliente(!d0 || !s0.cliente_nombre); setEditCond(false);
    setMoneda(esUsd(s0.moneda) ? 'USD' : 'PEN'); setTc(esUsd(s0.moneda) && n(s0.tipo_cambio) > 0 ? String(n(s0.tipo_cambio)) : '');
    setDetPct(String(config.detraccion.pct));
    setLineas(servicios.map(s => ({
      orden_servicio: s.codigo_orden,
      descripcion: `SERVICIO DE TRANSPORTE DE CARGA${s.ruta ? ` ${s.ruta}` : ''}${s.es_retorno ? ' (REGRESO)' : ''} - ${s.codigo_orden}`,
      cantidad: '1', valor_unitario: String(s.valor_sin_igv),
    })));
    setReferencia(servicios.map(s => s.codigo_orden).join(', ').slice(0, 120));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al completarse el RUC (o el DNI en boleta): primero se busca en los clientes registrados y, si no está, en SUNAT o RENIEC
  useEffect(() => {
    if (!open) return;
    const largo = tipo === '01' ? 11 : 8;
    if (doc.length !== largo) { setConsulta(null); return; }
    const aplicar = (n: string, d: string) => {
      setNombre(prev => (tocoDoc ? (n || prev) : (prev || n)));
      setDireccion(prev => (tocoDoc ? (d || prev) : (prev || d)));
    };
    const local = (clientes.data ?? []).find(c => c.doc === doc);
    if (local) { aplicar(local.razon_social, local.direccion); setConsulta({ ok: true, texto: 'Cliente registrado' }); return; }
    if (!tocoDoc && nombre && direccion) return;
    let vivo = true;
    setConsulta({ ok: true, texto: 'Buscando en ' + (tipo === '01' ? 'SUNAT' : 'RENIEC') + '…' });
    const t = window.setTimeout(async () => {
      try {
        const r = await consultarDocumento(doc);
        if (!vivo) return;
        aplicar(r.razon_social, r.direccion);
        setConsulta({ ok: true, texto: `${r.tipo === 'RUC' ? 'SUNAT' : 'RENIEC'}${r.estado ? `: ${r.estado}` : ''}${r.condicion ? ` · ${r.condicion}` : ''}` });
      } catch (err) { if (vivo) setConsulta({ ok: false, texto: errorMessage(err) }); }
    }, 350);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [doc, tipo, open, tocoDoc, clientes.data]); // eslint-disable-line react-hooks/exhaustive-deps

  function elegirCliente(id: string | null) {
    setClienteSel(id);
    const c = (clientes.data ?? []).find(x => String(x.id) === id);
    if (!c) return;
    setTocoDoc(true); setDoc(c.doc.replace(/\D/g, '')); setNombre(c.razon_social); setDireccion(c.direccion || '');
    if (c.doc.replace(/\D/g, '').length === 8) setTipo('03');
  }

  // IGV del servicio: «Incluye IGV» (el valor de venta es el flete ÷ 1.18), «Más IGV» (el flete ya es el valor de venta) o «No aplica»
  const modos = new Set(servicios.map(s => s.modo_igv));
  const mixto = modos.size > 1;
  const afecto = libre ? !sinIgv : !(modos.size === 1 && modos.has('NO'));
  const base = r2(lineas.reduce((s, l) => s + r2(n(l.cantidad) * n(l.valor_unitario)), 0));
  const igv = afecto ? r2(lineas.reduce((s, l) => s + r2(n(l.cantidad) * n(l.valor_unitario) * 0.18), 0)) : 0;
  const total = r2(base + igv);
  const totalSoles = moneda === 'USD' ? r2(total * n(tc)) : total;
  const pctDet = tipo === '01' ? n(detPct) : 0;
  const detraccion = pctDet > 0 ? Math.round(totalSoles * pctDet / 100) : 0;
  const neto = moneda === 'USD' ? total : r2(total - detraccion);
  const sugiereDetraccion = tipo === '01' && totalSoles >= config.detraccion.minimo && pctDet === 0;
  const venceEl = forma === 'CREDITO' && n(dias) > 0 ? (() => { const d = new Date(`${fecha}T12:00:00`); d.setDate(d.getDate() + n(dias)); return d.toLocaleDateString('en-CA'); })() : null;
  const nombreTipo = tipo === '01' ? 'factura' : 'boleta';

  function setLinea(i: number, parche: Partial<Linea>) { setLineas(l => l.map((x, j) => (j === i ? { ...x, ...parche } : x))); }

  async function enviar() {
    setError(null);
    if (mixto) { setError('Los servicios elegidos tratan el IGV de forma distinta (incluye IGV, más IGV o no aplica): factúralos por separado.'); return; }
    if (tipo === '01' && !/^\d{11}$/.test(doc)) { setError('El RUC del cliente debe tener 11 dígitos.'); setEditCliente(true); return; }
    if (!nombre.trim()) { setError('Falta la razón social del cliente.'); setEditCliente(true); return; }
    if (lineas.some(l => !l.descripcion.trim() || !(n(l.valor_unitario) > 0) || !(n(l.cantidad) > 0))) { setError('Cada línea necesita descripción, cantidad y valor mayores a cero.'); return; }
    if (moneda === 'USD' && !(n(tc) > 0)) { setError('Indica el tipo de cambio.'); setEditCond(true); return; }
    if (pctDet > 0 && !config.detraccion.cuenta) { setError('Falta la cuenta de detracciones: regístrala en Tesorería › Bancos (tipo «Detracciones»).'); return; }
    if (!confirmado) { setError(`Marca la casilla para confirmar la emisión de la ${nombreTipo}.`); haptic('warning'); return; }
    setEnviando(true);
    try {
      const r = await api<{ message?: string }>('/facturacion/emitir', {
        method: 'POST',
        body: {
          tipo_doc: tipo, moneda, tipo_cambio: moneda === 'USD' ? n(tc) : undefined, fecha_emision: fecha, forma_pago: forma, dias_credito: forma === 'CREDITO' ? n(dias) : 0,
          detraccion_pct: pctDet, orden_compra: oc, referencia, observacion: obs, afecto_igv: afecto,
          cliente: { id: servicios[0]?.cliente_id ?? null, doc, nombre, direccion },
          items: lineas.map(l => ({ orden_servicio: l.orden_servicio, descripcion: l.descripcion, cantidad: n(l.cantidad), valor_unitario: n(l.valor_unitario) })),
        },
      });
      haptic('success'); toast(r.message || 'Comprobante enviado'); onEmitido();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); } finally { setEnviando(false); }
  }

  const etiquetaIgv = (m: ServicioPF['modo_igv']) => (m === 'INCLUYE' ? 'El flete incluye IGV' : m === 'MAS' ? 'El flete es sin IGV (se suma 18 %)' : 'Sin IGV');
  const tituloSeccion = (icono: React.ReactNode, texto: string, accion?: React.ReactNode) => (
    <h3 className="ga-sec__titulo"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{icono} {texto}</span>{accion}</h3>
  );

  return (
    <Sheet ancho open={open} onClose={() => !enviando && onClose()} title={libre ? 'Factura libre' : `Facturar ${servicios.length} ${servicios.length === 1 ? 'servicio' : 'servicios'}`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={<Send size={16} />} loading={enviando} onClick={() => { void enviar(); }}>Emitir {nombreTipo}</Button>
      </>}>
      <div className="ga-det pp-hoja">
        <div className="ga-det__col">
          <div className="ga-det__cab">
            <Badge tone="accent">{tipo === '01' ? 'Factura' : 'Boleta'} {config.series[tipo]}</Badge>
            {config.modo === 'prueba' && <Badge tone="amber">Modo prueba</Badge>}
            <span className="ga-det__emitido">Emisión {formatFechaPe(fecha)}</span>
          </div>
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
          {mixto && <Notice tone="error">Estos servicios tratan el IGV de forma distinta. Una factura necesita el mismo tratamiento: factúralos por separado.</Notice>}

          <section className="ga-sec" aria-label="Cliente">
            {tituloSeccion(<Users size={16} aria-hidden />, 'Cliente',
              <Button variant="plain" size="sm" icon={editCliente ? <Check size={14} /> : <Pencil size={14} />} onClick={() => setEditCliente(e => !e)}>{editCliente ? 'Listo' : 'Editar'}</Button>)}
            {!editCliente ? (
              <dl className="pp-dl">
                <dt>Cliente</dt>
                <dd><b>{nombre || '—'}</b>{consulta?.ok && consulta.texto && <span>{consulta.texto}</span>}</dd>
                <dt>{tipo === '01' ? 'RUC' : 'DNI'}</dt>
                <dd><b>{doc || '—'}</b></dd>
                <dt>Dirección</dt>
                <dd><b>{direccion || 'Sin dirección'}</b></dd>
              </dl>
            ) : (
              <>
                <SegmentedControl block label="Comprobante" value={tipo} onChange={v => setTipo(v as '01' | '03')} options={[{ value: '01', label: 'Factura' }, { value: '03', label: 'Boleta' }]} />
                <Field label="Cliente registrado" hint="Elígelo para completar su RUC y su dirección, o escribe el RUC abajo">
                  {p => <Combobox {...p} options={(clientes.data ?? []).map(c => ({ value: String(c.id), label: c.razon_social, description: c.doc }))} value={clienteSel} onChange={elegirCliente}
                    placeholder="Busca por nombre o RUC" loading={clientes.isLoading} enHoja compacta tituloHoja="Elegir cliente" />}
                </Field>
                <div className="ga-dos">
                  <Field label={tipo === '01' ? 'RUC *' : 'DNI (opcional hasta S/ 700)'} hint={consulta?.ok ? consulta.texto : undefined} error={consulta && !consulta.ok ? consulta.texto : undefined}>{p => <TextInput {...p} inputMode="numeric" maxLength={tipo === '01' ? 11 : 8} value={doc} onChange={e => { setDoc(e.target.value.replace(/\D/g, '')); setTocoDoc(true); setClienteSel(null); }} />}</Field>
                  <Field label="Razón social / nombre *">{p => <TextInput {...p} value={nombre} onChange={e => setNombre(e.target.value)} />}</Field>
                </div>
                <Field label="Dirección">{p => <TextInput {...p} value={direccion} onChange={e => setDireccion(e.target.value)} />}</Field>
              </>
            )}
          </section>

          <section className="ga-sec" aria-label="Detalle del comprobante">
            {tituloSeccion(<Package size={16} aria-hidden />, 'Detalle del comprobante', <span className="ga-sec__cuenta">{lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'} · valores sin IGV</span>)}
            <div className="ga-tabla-wrap">
              <table className="ga-tabla">
                <thead><tr><th>Descripción</th><th className="num" style={{ width: 64 }}>Cant.</th><th className="num" style={{ width: 120 }}>Valor unit.</th><th className="num" style={{ width: 120 }}>Importe</th><th style={{ width: 36 }} aria-label="Quitar" /></tr></thead>
                <tbody>
                  {lineas.map((l, i) => {
                    const s = servicios.find(x => x.codigo_orden === l.orden_servicio);
                    return (
                      <tr key={i}>
                        <td>
                          <TextInput aria-label="Descripción" value={l.descripcion} onChange={e => setLinea(i, { descripcion: e.target.value })} />
                          {s && <span className="t-footnote c-secondary" style={{ display: 'block', marginTop: 4 }}>Flete acordado {formatMoneda(n(s.costo_flete), moneda)} · {etiquetaIgv(s.modo_igv)}</span>}
                        </td>
                        <td className="num">{s ? l.cantidad : <TextInput aria-label="Cantidad" inputMode="decimal" value={l.cantidad} onChange={e => setLinea(i, { cantidad: e.target.value })} />}</td>
                        <td className="num">{s ? formatMoneda(n(l.valor_unitario), moneda) : <TextInput aria-label="Valor unitario" inputMode="decimal" value={l.valor_unitario} onChange={e => setLinea(i, { valor_unitario: e.target.value })} />}</td>
                        <td className="num">{formatMoneda(r2(n(l.cantidad) * n(l.valor_unitario)), moneda)}</td>
                        <td>{!s && lineas.length > 1 && <Button variant="plain" size="sm" iconOnly icon={<Trash2 size={14} />} aria-label="Quitar línea" onClick={() => setLineas(x => x.filter((_, j) => j !== i))} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
              <Button variant="plain" size="sm" onClick={() => setLineas(l => [...l, { orden_servicio: null, descripcion: '', cantidad: '1', valor_unitario: '' }])}>+ Agregar línea</Button>
              {!libre && <span className="t-footnote c-secondary">Para un adicional, una estadía o un peaje: escríbelo con su valor sin IGV.</span>}
            </div>
            {!libre && modos.size === 1 && modos.has('INCLUYE') && <p className="t-footnote c-secondary" style={{ margin: 0 }}>El flete acordado ya incluye IGV: el valor de venta es el flete ÷ 1.18 y el IGV el resto, así el total facturado es el mismo flete.</p>}
          </section>

          <section className="ga-sec" aria-label="Condiciones">
            {tituloSeccion(<Wallet size={16} aria-hidden />, 'Condiciones',
              <Button variant="plain" size="sm" icon={editCond ? <Check size={14} /> : <Pencil size={14} />} onClick={() => setEditCond(e => !e)}>{editCond ? 'Listo' : 'Editar'}</Button>)}
            {!editCond ? (
              <dl className="pp-dl">
                <dt>Emisión</dt>
                <dd><b>{formatFechaPe(fecha)}</b></dd>
                <dt>Forma de pago</dt>
                <dd><b>{forma === 'CREDITO' ? `Crédito a ${n(dias)} días` : 'Contado'}</b>{venceEl && <span>Vence el {formatFechaPe(venceEl)}</span>}</dd>
                <dt>Moneda</dt>
                <dd><b>{moneda === 'USD' ? `Dólares · T.C. ${tc || '—'}` : 'Soles'}</b></dd>
                {libre && <><dt>IGV</dt><dd><b>{sinIgv ? 'Sin IGV (inafecta o exonerada)' : 'Gravado 18 %'}</b></dd></>}
                {tipo === '01' && <><dt>Detracción</dt><dd><b>{pctDet > 0 ? `${pctDet} % · ${formatMoneda(detraccion, 'PEN')}` : 'Sin detracción'}</b>{pctDet > 0 && <span>Se deposita en la cuenta del Banco de la Nación</span>}</dd></>}
                {(oc || obs) && <><dt>Referencias</dt><dd>{oc && <b>OC del cliente: {oc}</b>}{obs && <span>{obs}</span>}</dd></>}
              </dl>
            ) : (
              <>
                <div className="ga-dos">
                  <Field label="Fecha de emisión" hint="SUNAT acepta hasta 3 días atrás">{p => <TextInput {...p} type="date" max={hoyIso()} value={fecha} onChange={e => setFecha(e.target.value)} />}</Field>
                  <Field label="Moneda">{p => <SelectInput {...p} value={moneda} onChange={e => setMoneda(e.target.value as 'PEN' | 'USD')}><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></SelectInput>}</Field>
                  {moneda === 'USD' && <Field label="Tipo de cambio (S/ por US$)">{p => <TextInput {...p} inputMode="decimal" value={tc} onChange={e => setTc(e.target.value)} />}</Field>}
                  {libre && <Field label="IGV" hint="Sin IGV es para ventas inafectas o exoneradas">{p => <SelectInput {...p} value={sinIgv ? 'SIN' : 'GRAVADO'} onChange={e => setSinIgv(e.target.value === 'SIN')}><option value="GRAVADO">Gravado 18 %</option><option value="SIN">Sin IGV</option></SelectInput>}</Field>}
                  <Field label="Forma de pago">{p => <SelectInput {...p} value={forma} onChange={e => setForma(e.target.value as 'CONTADO' | 'CREDITO')}><option value="CONTADO">Contado</option><option value="CREDITO">Crédito</option></SelectInput>}</Field>
                  {forma === 'CREDITO' && <Field label="Días de crédito" hint="Vence la fecha de emisión más estos días">{p => <TextInput {...p} inputMode="numeric" value={dias} onChange={e => setDias(e.target.value.replace(/\D/g, ''))} />}</Field>}
                  {tipo === '01' && <Field label="Detracción (%)" hint={`Transporte de carga: ${config.detraccion.pct} % desde S/ ${config.detraccion.minimo}`}>{p => <TextInput {...p} inputMode="decimal" value={detPct} onChange={e => setDetPct(e.target.value)} />}</Field>}
                  <Field label="Orden de compra del cliente (opcional)">{p => <TextInput {...p} value={oc} onChange={e => setOc(e.target.value)} />}</Field>
                </div>
                <Field label="Observación (opcional)">{p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} />}</Field>
              </>
            )}
            {sugiereDetraccion && <Notice tone="accent">Este monto supera S/ {config.detraccion.minimo}: normalmente el transporte de carga lleva detracción del {config.detraccion.pct} %. Si corresponde, actívala en «Editar».</Notice>}
            {pctDet > 0 && !config.detraccion.cuenta && <Notice tone="error">Falta la cuenta de detracciones de la empresa: regístrala en Tesorería › Bancos (tipo «Detracciones»).</Notice>}
          </section>
        </div>

        <div className="ga-det__col">
          <section className="ga-sec" aria-label="Resumen del comprobante">
            {tituloSeccion(<Coins size={16} aria-hidden />, 'Resumen del comprobante')}
            <div className="ga-resumen">
              <div className="ga-resumen__fila"><span>Valor de venta</span><b>{formatMoneda(base, moneda)}</b></div>
              <div className="ga-resumen__fila"><span>IGV 18 %{afecto ? '' : ' (sin IGV)'}</span><b>{formatMoneda(igv, moneda)}</b></div>
              <div className="ga-resumen__total"><span>Total a facturar</span><b>{formatMoneda(total, moneda)}</b></div>
              {detraccion > 0 && <div className="ga-resumen__fila"><span>Detracción {pctDet} % (en soles)</span><b>− {formatMoneda(detraccion, 'PEN')}</b></div>}
              {(detraccion > 0 || forma === 'CREDITO') && <div className="ga-resumen__fila"><span>Neto a cobrar</span><b>{formatMoneda(neto, moneda)}</b></div>}
            </div>
          </section>

          <section className="ga-sec" aria-label="Confirmación">
            <label className="pago-proc__confirmar">
              <input type="checkbox" checked={confirmado} onChange={e => { setConfirmado(e.target.checked); setError(null); }} />
              <span>Confirmo emitir esta {nombreTipo} a SUNAT. Un comprobante emitido no se borra: se corrige con una nota de crédito.</span>
            </label>
            <p className="t-footnote c-secondary" style={{ margin: 0 }}>El número lo asigna APISUNAT al emitir (serie {config.series[tipo]}). Si SUNAT no lo acepta, no se guarda y los servicios siguen por facturar.</p>
          </section>
        </div>
      </div>
    </Sheet>
  );
}

/** Nota de crédito: anula la factura (total) o baja su valor (parcial). Los servicios vuelven a «por facturar» cuando SUNAT acepta la anulación total. */
function NotaCreditoSheet({ comprobante: c, config, onClose, onEmitida }: { comprobante: Comprobante | null; config: Config; onClose: () => void; onEmitida: () => void }) {
  const toast = useToast();
  const [motivo, setMotivo] = useState('01');
  const [monto, setMonto] = useState('');
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (c) { setMotivo('01'); setMonto(''); setTexto(''); setError(null); } }, [c]);
  const m = config.motivos_nc.find(x => x.codigo === motivo);
  const mon = c && esUsd(c.moneda) ? 'USD' : 'PEN';

  async function emitir() {
    if (!c) return;
    setError(null);
    if (m && !m.total && !(n(monto) > 0)) { setError('Indica el monto sin IGV a descontar.'); return; }
    setEnviando(true);
    try {
      const r = await api<{ message?: string }>(`/facturacion/${c.id}/nota-credito`, { method: 'POST', body: { motivo_codigo: motivo, monto_base: m && !m.total ? n(monto) : undefined, motivo_texto: texto } });
      haptic('success'); toast(r.message || 'Nota de crédito enviada'); onEmitida();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); } finally { setEnviando(false); }
  }

  return (
    <Sheet open={!!c} onClose={() => !enviando && onClose()} title={c ? `Nota de crédito · ${c.numero_completo}` : 'Nota de crédito'}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={<Send size={16} />} loading={enviando} onClick={() => { void emitir(); }}>Emitir nota de crédito</Button>
      </>}>
      {c && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
          <Notice>{NOMBRE_TIPO[c.tipo_doc]} {c.numero_completo} · {c.cliente_nombre} · {formatMoneda(n(c.total), mon)}</Notice>
          <Field label="Motivo">{p => <SelectInput {...p} value={motivo} onChange={e => setMotivo(e.target.value)}>{config.motivos_nc.map(x => <option key={x.codigo} value={x.codigo}>{x.texto}{x.total ? '' : ' (parcial)'}</option>)}</SelectInput>}</Field>
          {m && !m.total && <Field label="Monto a descontar (sin IGV)" hint={`Hasta ${formatMoneda(n(c.base), mon)}`}>{p => <TextInput {...p} inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} />}</Field>}
          <Field label="Detalle del motivo (opcional)">{p => <TextInput {...p} value={texto} onChange={e => setTexto(e.target.value)} />}</Field>
          <p className="t-footnote c-secondary" style={{ margin: 0 }}>{m?.total ? 'Se emite por el total del comprobante. Cuando SUNAT la acepte, la factura queda anulada y sus servicios vuelven a «por facturar».' : 'Baja el valor del comprobante por el monto indicado; los servicios siguen facturados.'}</p>
        </div>
      )}
    </Sheet>
  );
}
