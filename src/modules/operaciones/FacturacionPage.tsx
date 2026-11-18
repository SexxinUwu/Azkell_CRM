import '../mantenimiento/mant.css';
import '../../core/ui/acciones-iconos.css';
import '../almacen/almacen.css';
import '../almacen/entradas.css';
import '../gerencia/gerencia-oc.css';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FilePlus2, FileText, ReceiptText, RefreshCw, SearchX, Send, Undo2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { BarraFiltros } from '../../core/ui/FiltrosListado';
import { Combobox } from '../../core/ui/Combobox';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { KpiTarjeta } from '../../core/ui/KpiTarjeta';
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
  { id: 'codigo', titulo: 'Servicio', ancho: 130 },
  { id: 'fecha', titulo: 'Fecha', ancho: 105 },
  { id: 'cliente', titulo: 'Cliente', ancho: 240 },
  { id: 'ruta', titulo: 'Ruta', ancho: 220 },
  { id: 'tramo', titulo: 'Ida / regreso', ancho: 110 },
  { id: 'estado', titulo: 'Estado', ancho: 120 },
  { id: 'importe', titulo: 'Flete (sin IGV)', ancho: 140, alinear: 'right' },
];
const COL_COMPROBANTES: ColumnaTabla[] = [
  { id: 'numero', titulo: 'Comprobante', ancho: 150 },
  { id: 'tipo', titulo: 'Tipo', ancho: 130 },
  { id: 'fecha', titulo: 'Emisión', ancho: 105 },
  { id: 'cliente', titulo: 'Cliente', ancho: 240 },
  { id: 'servicios', titulo: 'Servicios', ancho: 170 },
  { id: 'total', titulo: 'Total', ancho: 130, alinear: 'right' },
  { id: 'estado', titulo: 'SUNAT', ancho: 130 },
  { id: 'docs', titulo: 'Documentos', ancho: 200, alinear: 'center' },
];

function estadoDe(c: Comprobante): { texto: string; tono: 'green' | 'amber' | 'red' | 'gray' } {
  if (c.estado === 'ANULADO') return { texto: 'Anulado', tono: 'gray' };
  if (c.estado === 'RECHAZADO' || c.apisunat_status === 'RECHAZADO') return { texto: 'Rechazado', tono: 'red' };
  if (c.apisunat_status === 'ACEPTADO') return { texto: 'Aceptado', tono: 'green' };
  return { texto: 'En SUNAT', tono: 'amber' };
}

/** Operaciones › Facturación: factura, boleta y nota de crédito electrónicas por APISUNAT. */
export function FacturacionPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const puedeEmitir = can('op_facturacion.crear');
  const [vista, setVista] = useState<'pendientes' | 'comprobantes'>('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [emitir, setEmitir] = useState<{ servicios: ServicioPF[] } | null>(null);
  const [nc, setNc] = useState<Comprobante | null>(null);
  const [actualizando, setActualizando] = useState(false);

  const config = useQuery({ queryKey: ['facturacion', 'config'], queryFn: () => api<Config>('/facturacion/config'), staleTime: 60_000 });
  const pend = useQuery({ queryKey: ['facturacion', 'por-facturar'], queryFn: () => api<{ data: ServicioPF[] }>('/facturacion/por-facturar').then(r => r.data ?? []), staleTime: 15_000, refetchOnMount: 'always' });
  const comps = useQuery({ queryKey: ['facturacion', 'lista'], queryFn: () => api<{ data: Comprobante[] }>('/facturacion').then(r => r.data ?? []), staleTime: 15_000, refetchOnMount: 'always' });

  const q = busqueda.trim().toLowerCase();
  const pendientes = useMemo(() => (pend.data ?? []).filter(s => !q || `${s.codigo_orden} ${s.cliente_nombre} ${s.ruta ?? ''}`.toLowerCase().includes(q)), [pend.data, q]);
  const comprobantes = useMemo(() => (comps.data ?? []).filter(c => !q || `${c.numero_completo} ${c.cliente_nombre} ${c.cliente_doc} ${c.servicios ?? ''}`.toLowerCase().includes(q)), [comps.data, q]);
  const elegidos = (pend.data ?? []).filter(s => seleccion.has(s.codigo_orden));
  const clienteElegido = elegidos[0]?.cliente_nombre ?? null;
  const porSunat = (comps.data ?? []).filter(c => estadoDe(c).texto === 'En SUNAT').length;
  const totalMes = (comps.data ?? []).filter(c => c.tipo_doc !== '07' && c.estado !== 'ANULADO' && c.estado !== 'RECHAZADO' && c.fecha_emision.slice(0, 7) === hoyIso().slice(0, 7) && !esUsd(c.moneda)).reduce((s, c) => s + n(c.total), 0);

  function alternar(s: ServicioPF) {
    setSeleccion(prev => {
      const x = new Set(prev);
      if (x.has(s.codigo_orden)) x.delete(s.codigo_orden); else x.add(s.codigo_orden);
      return x;
    });
  }
  const refrescar = () => { void qc.invalidateQueries({ queryKey: ['facturacion'] }); };

  async function actualizarEstados() {
    setActualizando(true);
    try {
      const r = await api<{ actualizados: number; total: number }>('/facturacion/sincronizar-pendientes', { method: 'POST', body: {} });
      toast(r.total ? `Se consultaron ${r.actualizados} de ${r.total} comprobantes` : 'No hay comprobantes pendientes de SUNAT');
      refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); } finally { setActualizando(false); }
  }

  const cfg = config.data;
  return (
    <Page>
      <PageHeader eyebrow="Operaciones" title="Facturación"
        subtitle={cfg ? `${cfg.razon_social || 'Empresa'} · ${cfg.modo === 'produccion' ? 'Producción' : 'Modo prueba (sin validez tributaria)'}` : 'Cargando…'}
        actions={
          <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            <div className="oc-acciones oc-acciones--sinfondo">
              <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--celeste" data-tip="Actualizar estados en SUNAT" aria-label="Actualizar estados en SUNAT" disabled={actualizando} onClick={() => { void actualizarEstados(); }}>
                <RefreshCw size={17} />
              </button>
            </div>
            {puedeEmitir && <Button variant="primary" icon={<FilePlus2 size={16} />} disabled={!cfg?.lista} onClick={() => setEmitir({ servicios: [] })}>Factura libre</Button>}
          </div>
        } />

      {cfg && !cfg.lista && <Notice tone="error" icon={<CircleAlert size={16} />}>{cfg.motivo}</Notice>}
      {cfg?.lista && cfg.modo === 'prueba' && <Notice tone="accent">Estás en modo prueba: lo que emitas no va a SUNAT ni tiene validez tributaria. Cámbialo en Sistema › Integraciones cuando todo esté probado.</Notice>}

      <div className="inv-kpis" style={{ margin: 'var(--s-4) 0' }}>
        <KpiTarjeta etiqueta="Por facturar" valor={String((pend.data ?? []).length)} sub="Servicios entregados sin comprobante" icono={<ReceiptText size={18} />} />
        <KpiTarjeta etiqueta="Facturado este mes" valor={formatMoneda(totalMes, 'PEN')} sub="Facturas y boletas en soles" icono={<FileText size={18} />} />
        <KpiTarjeta etiqueta="En SUNAT" valor={String(porSunat)} sub="Esperando respuesta" icono={<Send size={18} />} tono={porSunat ? 'warning' : undefined} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder={vista === 'pendientes' ? 'Servicio, cliente o ruta' : 'Número, cliente, RUC o servicio'} activos={0} onAbrirFiltros={() => undefined}>
          <SegmentedControl label="Vista" value={vista} onChange={v => setVista(v as 'pendientes' | 'comprobantes')}
            options={[{ value: 'pendientes', label: 'Por facturar' }, { value: 'comprobantes', label: 'Comprobantes' }]} />
        </BarraFiltros>

        {vista === 'pendientes' ? (
          pend.isError ? <Notice tone="error">{errorMessage(pend.error)}</Notice> : pend.isLoading ? <PageLoader /> : pendientes.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <ReceiptText size={22} />} title={busqueda ? 'Ningún servicio coincide' : 'No hay servicios por facturar'}>
              {busqueda ? null : 'Cuando un servicio quede entregado y tenga su flete, aparecerá aquí. También puedes emitir una factura libre.'}
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
              <TablaRedimensionable id="facturacion-pendientes-v1" columnas={COL_PENDIENTES} ariaLabel="Servicios por facturar" altoMax="62vh" className="tabla-redim--compacta">
                {pendientes.map(s => {
                  const otro = !!clienteElegido && clienteElegido !== s.cliente_nombre;
                  return (
                    <tr key={s.codigo_orden} className="tabla-redim__fila--click" style={otro ? { opacity: 0.45 } : undefined} onClick={() => { if (puedeEmitir && !otro) alternar(s); }}>
                      <Celda><input type="checkbox" aria-label={`Elegir ${s.codigo_orden}`} checked={seleccion.has(s.codigo_orden)} disabled={!puedeEmitir || otro} onChange={() => alternar(s)} onClick={e => e.stopPropagation()} /></Celda>
                      <Celda mono>{s.codigo_orden}</Celda>
                      <Celda>{formatFechaPe(s.fecha)}</Celda>
                      <Celda>{s.cliente_nombre || '—'}{!s.cliente_doc && <span title="El cliente no tiene RUC registrado" style={{ marginLeft: 6, color: 'var(--red-ink)' }}><CircleAlert size={13} aria-label="Sin RUC" /></span>}</Celda>
                      <Celda>{s.ruta || '—'}</Celda>
                      <Celda><span className="oc-chip">{s.es_retorno ? 'Regreso' : 'Ida'}</span></Celda>
                      <Celda><Badge tone={s.estado_servicio === 'ENTREGADO' ? 'green' : 'amber'}>{s.estado_servicio === 'ENTREGADO' ? 'Entregado' : 'En ejecución'}</Badge></Celda>
                      <Celda alinear="right" mono>{formatMoneda(n(s.costo_flete), esUsd(s.moneda) ? 'USD' : 'PEN')}</Celda>
                    </tr>
                  );
                })}
              </TablaRedimensionable>
            </>
          )
        ) : (
          comps.isError ? <Notice tone="error">{errorMessage(comps.error)}</Notice> : comps.isLoading ? <PageLoader /> : comprobantes.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <ReceiptText size={22} />} title={busqueda ? 'Ningún comprobante coincide' : 'Aún no hay comprobantes'}>
              {busqueda ? null : 'Las facturas y notas de crédito que emitas quedarán aquí con su estado en SUNAT.'}
            </EmptyState>
          ) : (
            <TablaRedimensionable id="facturacion-comprobantes-v1" columnas={COL_COMPROBANTES} ariaLabel="Comprobantes emitidos" altoMax="68vh" className="tabla-redim--compacta">
              {comprobantes.map(c => {
                const e = estadoDe(c);
                const mon = esUsd(c.moneda) ? 'USD' : 'PEN';
                return (
                  <tr key={c.id}>
                    <Celda mono><strong>{c.numero_completo}</strong>{c.modo_emision === 'prueba' && <span className="oc-chip" style={{ marginLeft: 6 }}>Prueba</span>}</Celda>
                    <Celda>{NOMBRE_TIPO[c.tipo_doc]}{c.tipo_doc === '07' && c.doc_ref_numero ? <span className="t-footnote c-secondary"> · {c.doc_ref_numero}</span> : null}</Celda>
                    <Celda>{formatFechaPe(c.fecha_emision)}</Celda>
                    <Celda>{c.cliente_nombre}</Celda>
                    <Celda>{c.servicios || (c.tipo_doc === '07' ? c.motivo_texto : null) || '—'}</Celda>
                    <Celda alinear="right" mono>{c.tipo_doc === '07' ? '− ' : ''}{formatMoneda(n(c.total), mon)}</Celda>
                    <Celda><span title={c.apisunat_faults || undefined}><Badge tone={e.tono}>{e.texto}</Badge></span></Celda>
                    <Celda alinear="center">
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                        {c.pdf_url && <a href={c.pdf_url} target="_blank" rel="noreferrer" className="oc-adj oc-adj--rojo">PDF</a>}
                        {c.xml_url && <a href={c.xml_url} target="_blank" rel="noreferrer" className="oc-adj oc-adj--verde">XML</a>}
                        {c.cdr_url && <a href={c.cdr_url} target="_blank" rel="noreferrer" className="oc-adj oc-adj--verde">CDR</a>}
                        {puedeEmitir && c.tipo_doc !== '07' && c.estado === 'EMITIDO' && c.apisunat_status !== 'RECHAZADO' && (
                          <button type="button" className="oc-adj" style={{ cursor: 'pointer', font: 'inherit' }} title="Emitir nota de crédito" onClick={() => setNc(c)}><Undo2 size={12} aria-hidden /> Nota de crédito</button>
                        )}
                      </span>
                    </Celda>
                  </tr>
                );
              })}
            </TablaRedimensionable>
          )
        )}
      </div>

      {cfg && <EmitirSheet open={!!emitir} servicios={emitir?.servicios ?? []} config={cfg} onClose={() => setEmitir(null)}
        onEmitido={() => { setEmitir(null); setSeleccion(new Set()); setVista('comprobantes'); refrescar(); }} />}
      {cfg && <NotaCreditoSheet comprobante={nc} config={cfg} onClose={() => setNc(null)} onEmitida={() => { setNc(null); refrescar(); }} />}
    </Page>
  );
}

/** Factura o boleta: parte de los servicios elegidos y deja revisar cada línea, el crédito y la detracción antes de enviar */
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
  const clientes = useQuery({ queryKey: ['facturacion', 'clientes'], enabled: open, staleTime: 120_000, queryFn: () => api<{ data: ClienteReg[] }>('/facturacion/clientes').then(r => r.data ?? []) });

  useEffect(() => {
    if (!open) return;
    setError(null); setTipo('01'); setClienteSel(null); setTocoDoc(false); setConsulta(null); setFecha(hoyIso()); setForma('CONTADO'); setDias('30'); setOc(''); setReferencia(''); setObs('');
    if (libre) {
      setDoc(''); setNombre(''); setDireccion(''); setMoneda('PEN'); setTc(''); setDetPct('0');
      setLineas([{ orden_servicio: null, descripcion: '', cantidad: '1', valor_unitario: '' }]);
      return;
    }
    const s0 = servicios[0];
    setDoc(String(s0.cliente_doc || '').replace(/\D/g, '')); setNombre(s0.cliente_nombre); setDireccion(String(s0.cliente_direccion || ''));
    setMoneda(esUsd(s0.moneda) ? 'USD' : 'PEN'); setTc(esUsd(s0.moneda) && n(s0.tipo_cambio) > 0 ? String(n(s0.tipo_cambio)) : '');
    setDetPct(String(config.detraccion.pct));
    setLineas(servicios.map(s => ({
      orden_servicio: s.codigo_orden,
      descripcion: `SERVICIO DE TRANSPORTE DE CARGA${s.ruta ? ` ${s.ruta}` : ''}${s.es_retorno ? ' (REGRESO)' : ''} - ${s.codigo_orden}`,
      cantidad: '1', valor_unitario: String(n(s.costo_flete)),
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

  const afecto = !servicios.some(s => /inafect|exoner/i.test(String(s.impuesto || '')));
  const base = r2(lineas.reduce((s, l) => s + r2(n(l.cantidad) * n(l.valor_unitario)), 0));
  const igv = afecto ? r2(lineas.reduce((s, l) => s + r2(r2(n(l.cantidad) * n(l.valor_unitario)) * 0.18), 0)) : 0;
  const total = r2(base + igv);
  const totalSoles = moneda === 'USD' ? r2(total * n(tc)) : total;
  const pctDet = tipo === '01' ? n(detPct) : 0;
  const detraccion = pctDet > 0 ? Math.round(totalSoles * pctDet / 100) : 0;
  const neto = moneda === 'USD' ? total : r2(total - detraccion);
  const sugiereDetraccion = tipo === '01' && totalSoles >= config.detraccion.minimo && pctDet === 0;

  function setLinea(i: number, parche: Partial<Linea>) { setLineas(l => l.map((x, j) => (j === i ? { ...x, ...parche } : x))); }

  async function enviar() {
    setError(null);
    if (tipo === '01' && !/^\d{11}$/.test(doc)) { setError('El RUC del cliente debe tener 11 dígitos.'); return; }
    if (!nombre.trim()) { setError('Falta la razón social del cliente.'); return; }
    if (lineas.some(l => !l.descripcion.trim() || !(n(l.valor_unitario) > 0) || !(n(l.cantidad) > 0))) { setError('Cada línea necesita descripción, cantidad y valor mayores a cero.'); return; }
    if (moneda === 'USD' && !(n(tc) > 0)) { setError('Indica el tipo de cambio.'); return; }
    if (pctDet > 0 && !config.detraccion.cuenta) { setError('Falta la cuenta de detracciones: regístrala en Tesorería › Bancos (tipo «Detracciones»).'); return; }
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

  return (
    <Sheet ancho open={open} onClose={() => !enviando && onClose()} title={libre ? 'Factura libre' : `Facturar ${servicios.length} ${servicios.length === 1 ? 'servicio' : 'servicios'}`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={<Send size={16} />} loading={enviando} onClick={() => { void enviar(); }}>Emitir {tipo === '01' ? 'factura' : 'boleta'}</Button>
      </>}>
      <div className="ga-det">
        <div className="ga-det__col">
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
          <section className="ga-sec" aria-label="Cliente">
            <h3 className="ga-sec__titulo"><span>Cliente</span></h3>
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
          </section>

          <section className="ga-sec" aria-label="Detalle">
            <h3 className="ga-sec__titulo"><span>Detalle del comprobante</span><span className="ga-sec__cuenta">Valores sin IGV</span></h3>
            <div className="ga-tabla-wrap">
              <table className="ga-tabla">
                <thead><tr><th>Descripción</th><th className="num" style={{ width: 80 }}>Cant.</th><th className="num" style={{ width: 130 }}>Valor unit.</th><th className="num" style={{ width: 120 }}>Importe</th></tr></thead>
                <tbody>
                  {lineas.map((l, i) => (
                    <tr key={i}>
                      <td><TextInput aria-label="Descripción" value={l.descripcion} onChange={e => setLinea(i, { descripcion: e.target.value })} /></td>
                      <td><TextInput aria-label="Cantidad" inputMode="decimal" value={l.cantidad} onChange={e => setLinea(i, { cantidad: e.target.value })} /></td>
                      <td><TextInput aria-label="Valor unitario" inputMode="decimal" value={l.valor_unitario} onChange={e => setLinea(i, { valor_unitario: e.target.value })} /></td>
                      <td className="num">{formatMoneda(r2(n(l.cantidad) * n(l.valor_unitario)), moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {libre && <Button variant="plain" size="sm" onClick={() => setLineas(l => [...l, { orden_servicio: null, descripcion: '', cantidad: '1', valor_unitario: '' }])}>+ Agregar línea</Button>}
          </section>

          <section className="ga-sec" aria-label="Condiciones">
            <h3 className="ga-sec__titulo"><span>Condiciones</span></h3>
            <div className="ga-dos">
              <Field label="Fecha de emisión" hint="SUNAT acepta hasta 3 días atrás">{p => <TextInput {...p} type="date" max={hoyIso()} value={fecha} onChange={e => setFecha(e.target.value)} />}</Field>
              <Field label="Moneda">{p => <SelectInput {...p} value={moneda} onChange={e => setMoneda(e.target.value as 'PEN' | 'USD')}><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></SelectInput>}</Field>
              {moneda === 'USD' && <Field label="Tipo de cambio (S/ por US$)">{p => <TextInput {...p} inputMode="decimal" value={tc} onChange={e => setTc(e.target.value)} />}</Field>}
              <Field label="Forma de pago">{p => <SelectInput {...p} value={forma} onChange={e => setForma(e.target.value as 'CONTADO' | 'CREDITO')}><option value="CONTADO">Contado</option><option value="CREDITO">Crédito</option></SelectInput>}</Field>
              {forma === 'CREDITO' && <Field label="Días de crédito" hint="Vence el día de la fecha de emisión más estos días">{p => <TextInput {...p} inputMode="numeric" value={dias} onChange={e => setDias(e.target.value.replace(/\D/g, ''))} />}</Field>}
              {tipo === '01' && <Field label="Detracción (%)" hint={`Transporte de carga: ${config.detraccion.pct} % desde S/ ${config.detraccion.minimo}`}>{p => <TextInput {...p} inputMode="decimal" value={detPct} onChange={e => setDetPct(e.target.value)} />}</Field>}
              <Field label="Orden de compra del cliente (opcional)">{p => <TextInput {...p} value={oc} onChange={e => setOc(e.target.value)} />}</Field>
            </div>
            <Field label="Observación (opcional)">{p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} />}</Field>
            {sugiereDetraccion && <Notice tone="accent">Este monto supera S/ {config.detraccion.minimo}: normalmente el transporte de carga lleva detracción del {config.detraccion.pct} %. Si corresponde, escríbela arriba.</Notice>}
            {pctDet > 0 && !config.detraccion.cuenta && <Notice tone="error">Falta la cuenta de detracciones de la empresa: regístrala en Tesorería › Bancos (tipo «Detracciones»).</Notice>}
          </section>
        </div>

        <div className="ga-det__col">
          <section className="ga-sec" aria-label="Totales">
            <h3 className="ga-sec__titulo"><span>Resumen</span></h3>
            <div className="ga-resumen">
              <div className="ga-resumen__fila"><span>Valor de venta</span><b>{formatMoneda(base, moneda)}</b></div>
              <div className="ga-resumen__fila"><span>IGV 18 %{afecto ? '' : ' (inafecto)'}</span><b>{formatMoneda(igv, moneda)}</b></div>
              <div className="ga-resumen__total"><span>Importe total</span><b>{formatMoneda(total, moneda)}</b></div>
              {detraccion > 0 && <div className="ga-resumen__fila"><span>Detracción {pctDet} % (en soles)</span><b>{formatMoneda(detraccion, 'PEN')}</b></div>}
              {(detraccion > 0 || forma === 'CREDITO') && <div className="ga-resumen__fila"><span>Neto pendiente de pago</span><b>{formatMoneda(neto, moneda)}</b></div>}
            </div>
            <p className="t-footnote c-secondary" style={{ margin: 0 }}>Serie {config.series[tipo]}. El número lo asigna APISUNAT al emitir. Si SUNAT no lo acepta, no se guarda y los servicios siguen por facturar.</p>
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
