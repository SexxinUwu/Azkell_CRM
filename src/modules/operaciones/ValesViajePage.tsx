import '../mantenimiento/mant.css';
import '../../core/ui/acciones-iconos.css';
import './servicios.css';
import './seguimiento.css';
import './vale-ticket.css';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Ban, Check, CheckCircle2, CircleAlert, ClipboardList, Coins, Fuel, Pencil, Satellite, Image as ImagenIcono, Plus, SearchX, Sparkles, UploadCloud, UserRound, Store, FileText, FileCheck, Truck, Wallet } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { BarraFiltros } from '../../core/ui/FiltrosListado';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import '../almacen/entradas.css';
import '../gerencia/gerencia-oc.css';
import '../tesoreria/pago.css';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { useEmpresaCuentas } from '../almacen/api';
import { etiquetaCuentaEmpresa } from '../almacen/entradaReglas';
import { AUTORIZAN, COMPROBANTES, MODALIDADES } from '../tesoreria/caja-lib';

interface Alerta { nivel: 'rojo' | 'ambar'; texto: string }
interface Vale {
  id: number; codigo: string; viaje: string; placa: string; conductor: string; fecha: string; hora: string | null;
  estacion_nombre: string; estacion_ruc: string | null; combustible: string | null; galones: number | string; precio_galon: number | string; total: number | string; moneda: string;
  km_odometro: number | null; numero_voucher: string | null; pagar_a: 'CONDUCTOR' | 'ESTACION'; beneficiario_nombre: string;
  estado: 'PENDIENTE' | 'APROBADO' | 'PAGADO' | 'ANULADO'; caja_codigo: string; alertas: Alerta[]; voucher_url_firmada: string | null; pago_voucher_firmada: string | null; orden_servicio?: string | null; estacion_sede?: string | null;
}
interface ServicioViaje { orden: string; es_retorno: boolean; cliente: string | null; ruta: string | null }
interface ViajeOpc { servicios?: ServicioViaje[]; viaje: string; placa_tracto: string; conductor: string; ruta: string | null; fecha_viaje: string | null; conductor_doc: string | null; ultimo_km: number | null }
interface Lectura {
  estacion_nombre: string | null; estacion_ruc: string | null; fecha: string | null; hora: string | null; numero_voucher: string | null; placa: string | null; combustible: string | null;
  galones: number | null; precio_galon: number | null; total: number | null; moneda: string; km_odometro: number | null; conductor_doc: string | null;
}

const COLUMNAS: ColumnaTabla[] = [
  { id: 'estado', titulo: 'Estado', ancho: 130 },
  { id: 'codigo', titulo: 'Vale', ancho: 140 },
  { id: 'fecha', titulo: 'Fecha', ancho: 105 },
  { id: 'viaje', titulo: 'Viaje', ancho: 130 },
  { id: 'servicio', titulo: 'Servicio', ancho: 130 },
  { id: 'placa', titulo: 'Placa', ancho: 110 },
  { id: 'conductor', titulo: 'Conductor', ancho: 190, minimo: 120 },
  { id: 'estacion', titulo: 'Estación', ancho: 200, minimo: 120 },
  { id: 'galones', titulo: 'Galones', ancho: 95, alinear: 'right' },
  { id: 'precio', titulo: 'Precio', ancho: 90, alinear: 'right' },
  { id: 'total', titulo: 'Total', ancho: 110, alinear: 'right' },
  { id: 'km', titulo: 'Km', ancho: 95, alinear: 'right' },
  { id: 'pagara', titulo: 'Pagar a', ancho: 210, minimo: 130 },
  { id: 'comprobante', titulo: 'Comprobante', ancho: 130, alinear: 'center' },
  { id: 'voucher', titulo: 'Voucher', ancho: 110, alinear: 'center' },
];
const TONO: Record<Vale['estado'], 'amber' | 'accent' | 'green' | 'gray'> = { PENDIENTE: 'amber', APROBADO: 'accent', PAGADO: 'green', ANULADO: 'gray' };
const ETIQUETA: Record<Vale['estado'], string> = { PENDIENTE: 'Pendiente', APROBADO: 'Aprobado', PAGADO: 'Pagado', ANULADO: 'Anulado' };
// Combustibles que se usan en el Perú. La cantidad va en galones, salvo GNV (m³) y GNL (kg).
const COMBUSTIBLES = ['Diésel B5', 'Diésel B5 S-50', 'Gasolina regular', 'Gasolina premium', 'GNV', 'GLP', 'GNL', 'Úrea / AdBlue'];
const OPCIONES_COMBUSTIBLE = [
  { value: 'Diésel B5', label: 'Diésel B5', description: 'Camiones y tractos (el más usado)' },
  { value: 'Diésel B5 S-50', label: 'Diésel B5 S-50', description: 'Diésel de bajo azufre' },
  { value: 'Gasolina regular', label: 'Gasolina regular', description: '84 / 90 octanos' },
  { value: 'Gasolina premium', label: 'Gasolina premium', description: '95 / 97 / 98 octanos' },
  { value: 'GNV', label: 'GNV', description: 'Gas natural vehicular · m³' },
  { value: 'GLP', label: 'GLP', description: 'Gas licuado de petróleo' },
  { value: 'GNL', label: 'GNL', description: 'Gas natural licuado · kg' },
  { value: 'Úrea / AdBlue', label: 'Úrea / AdBlue', description: 'Fluido para el sistema SCR' },
];
const unidadDe = (c: string) => (c === 'GNV' ? 'm³' : c === 'GNL' ? 'kg' : 'gal');
function combustibleDe(v: string): string {
  if (COMBUSTIBLES.includes(v)) return v;
  const x = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!x.trim()) return '';
  if (/urea|adblue|ad blue/.test(x)) return 'Úrea / AdBlue';
  if (/gnv/.test(x)) return 'GNV';
  if (/gnl/.test(x)) return 'GNL';
  if (/glp|gas licuado/.test(x)) return 'GLP';
  if (/premium|9[578]/.test(x)) return 'Gasolina premium';
  if (/regular|gasolina|90|84/.test(x)) return 'Gasolina regular';
  if (/s-?50/.test(x)) return 'Diésel B5 S-50';
  if (/diesel|d2|b5|petroleo/.test(x)) return 'Diésel B5';
  return '';
}
const n = (v: unknown) => Number(v) || 0;
const fmt = (v: unknown, d = 2) => n(v).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
const monto = (v: Vale) => `${/D[OÓ]L/i.test(v.moneda) ? 'US$' : 'S/'} ${fmt(v.total)}`;
const fechaCorta = (f?: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—');
const hoyIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

const useVales = () => useQuery<Vale[]>({ queryKey: ['operaciones', 'vales-viaje'], staleTime: 15_000, queryFn: () => api<{ data?: Vale[] }>('/operaciones/vales').then(r => r.data ?? []) });

export function ValesViajePage() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const vales = useVales();
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<'' | Vale['estado']>('');
  const [nuevo, setNuevo] = useState(false);
  const [anulando, setAnulando] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<Vale | null>(null);
  const puedeCrear = can('combustible_vales.crear', 'op_guias_remision.crear', 'operaciones.crear');
  const lista = vales.data ?? [];

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return lista.filter(v => (!estado || v.estado === estado) && (!q || [v.codigo, v.viaje, v.placa, v.conductor, v.estacion_nombre, v.numero_voucher, v.beneficiario_nombre].some(x => String(x ?? '').toLowerCase().includes(q))));
  }, [lista, busqueda, estado]);
  const vigentes = lista.filter(v => v.estado !== 'ANULADO');
  const galones = vigentes.reduce((t, v) => t + n(v.galones), 0);
  const total = vigentes.reduce((t, v) => t + n(v.total), 0);

  async function anular(v: Vale) {
    const motivo = window.prompt(`Motivo para anular el vale ${v.codigo}:`);
    if (!motivo || !motivo.trim()) return;
    setAnulando(v.id);
    try {
      await api(`/operaciones/vales/${v.id}/anular`, { method: 'POST', body: { motivo: motivo.trim() } });
      haptic('success'); toast('Vale anulado');
      await qc.invalidateQueries({ queryKey: ['operaciones', 'vales-viaje'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); } finally { setAnulando(null); }
  }

  return (
    <Page>
      <PageHeader eyebrow="Operaciones" title="Vales de combustible"
        subtitle={vales.isLoading ? 'Cargando…' : `${vigentes.length} ${vigentes.length === 1 ? 'vale' : 'vales'} · ${fmt(galones, 1)} gal · S/ ${fmt(total)}`}
        actions={puedeCrear ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => setNuevo(true)}>Nuevo vale</Button> : undefined} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Vale, viaje, placa, conductor o estación" activos={0} onAbrirFiltros={() => undefined}>
          <SegmentedControl label="Estado" value={estado} onChange={v => setEstado(v as '' | Vale['estado'])}
            options={[{ value: '', label: 'Todos' }, { value: 'PENDIENTE', label: 'Pendientes' }, { value: 'APROBADO', label: 'Aprobados' }, { value: 'PAGADO', label: 'Pagados' }]} />
        </BarraFiltros>
        {vales.isLoading ? <PageLoader /> : vales.isError ? <Notice tone="error">{errorMessage(vales.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || estado ? <SearchX size={22} /> : <Fuel size={22} />} title={busqueda || estado ? 'Sin coincidencias' : 'Aún no hay vales de combustible'}>
            {busqueda || estado ? 'Prueba con otra búsqueda.' : puedeCrear ? 'Pulsa «Nuevo vale», elige el viaje y sube la foto del voucher: la IA lee los datos y solo confirmas.' : 'Todavía no se registró ningún vale.'}
          </EmptyState>
        ) : (
          <TablaRedimensionable id="vales-viaje-v1" columnas={COLUMNAS} ariaLabel="Vales de combustible" className="tabla-redim--compacta">
            {visibles.map(v => (
              <tr key={v.id}>
                <Celda><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}><Badge tone={TONO[v.estado]}>{ETIQUETA[v.estado]}</Badge>{v.alertas.some(a => a.nivel === 'rojo') && <span title={v.alertas.map(a => a.texto).join(' · ')} style={{ display: 'inline-flex', color: 'var(--red-ink)' }}><CircleAlert size={14} aria-label="Con avisos" /></span>}</span></Celda>
                <Celda mono><button type="button" className="oc-adj oc-adj--verde" style={{ cursor: 'pointer', font: 'inherit' }} title="Ver detalle del vale" onClick={() => setDetalle(v)}>{v.codigo}</button></Celda>
                <Celda mono>{fechaCorta(v.fecha)}</Celda>
                <Celda mono>{v.viaje}</Celda>
                <Celda mono>{v.orden_servicio || '—'}</Celda>
                <Celda>{v.placa ? <LicensePlate plate={v.placa} size="sm" /> : '—'}</Celda>
                <Celda>{v.conductor || '—'}</Celda>
                <Celda>{v.estacion_nombre || '—'}{v.estacion_sede ? ` · ${v.estacion_sede}` : ''}</Celda>
                <Celda alinear="right" mono>{fmt(v.galones, 2)}</Celda>
                <Celda alinear="right" mono>{fmt(v.precio_galon)}</Celda>
                <Celda alinear="right" mono>{monto(v)}</Celda>
                <Celda alinear="right" mono>{v.km_odometro != null ? v.km_odometro.toLocaleString('es-PE') : '—'}</Celda>
                <Celda><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{v.pagar_a === 'CONDUCTOR' ? <UserRound size={14} aria-hidden /> : <Store size={14} aria-hidden />}{v.beneficiario_nombre}</span></Celda>
                <Celda alinear="center">{v.voucher_url_firmada ? <a href={v.voucher_url_firmada} target="_blank" rel="noreferrer" className="oc-adj oc-adj--verde">Ver comprobante</a> : <span style={{ color: 'var(--label-2)' }}>—</span>}</Celda>
                <Celda alinear="center">{v.pago_voucher_firmada ? <a href={v.pago_voucher_firmada} target="_blank" rel="noreferrer" className="oc-adj oc-adj--rojo">Ver voucher</a> : <span style={{ color: 'var(--label-2)' }}>{v.estado === 'PAGADO' ? 'Sin voucher' : '—'}</span>}</Celda>
              </tr>
            ))}
          </TablaRedimensionable>
        )}
      </div>
      <NuevoValeSheet open={nuevo} onClose={() => setNuevo(false)} />
      <ValeDetalleSheet vale={detalle} onClose={() => setDetalle(null)} puedeAnular={puedeCrear} anulando={anulando === detalle?.id} onAnular={v => { void anular(v).then(() => setDetalle(null)); }} />
    </Page>
  );
}

/** Detalle de un vale, con el mismo diseño que «Procesar pago» de Pago de requerimientos */
function ValeDetalleSheet({ vale, onClose, puedeAnular, anulando, onAnular }: { vale: Vale | null; onClose: () => void; puedeAnular: boolean; anulando: boolean; onAnular: (v: Vale) => void }) {
  const v = vale;
  const rojos = v ? v.alertas.filter(a => a.nivel === 'rojo') : [];
  const docs = v ? [
    { titulo: 'Comprobante del vale', url: v.voucher_url_firmada, Icono: FileText },
    { titulo: 'Voucher del pago', url: v.pago_voucher_firmada, Icono: FileCheck },
  ] : [];
  return (
    <Sheet ancho open={!!v} onClose={onClose} title={v ? `Vale · ${v.codigo}` : 'Vale'}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        {v && puedeAnular && v.estado !== 'ANULADO' && v.estado !== 'PAGADO' && <Button variant="danger" icon={<Ban size={16} />} loading={anulando} onClick={() => onAnular(v)}>Anular vale</Button>}
      </>}>
      {v && (
        <div className="ga-det pp-hoja">
          <div className="ga-det__col">
            <div className="ga-det__cab">
              <Badge tone={TONO[v.estado]}>{ETIQUETA[v.estado]}</Badge>
              {v.caja_codigo && <Badge tone="gray">Caja {v.caja_codigo}</Badge>}
              <span className="ga-det__emitido">Cargado el {fechaCorta(v.fecha)}{v.hora ? ` · ${v.hora}` : ''}</span>
            </div>
            {rojos.length > 0 && <Notice tone="error" icon={<CircleAlert size={16} />}>{rojos.map(a => <div key={a.texto}>{a.texto}</div>)}</Notice>}

            <section className="ga-sec" aria-label="Viaje y unidad">
              <h3 className="ga-sec__titulo"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Truck size={16} aria-hidden /> Viaje y unidad</span></h3>
              <dl className="pp-dl">
                <dt>Viaje</dt>
                <dd><b>{v.viaje || '—'}</b>{v.orden_servicio && <span>Servicio {v.orden_servicio}</span>}</dd>
                <dt>Unidad</dt>
                <dd><span>{v.placa ? <LicensePlate plate={v.placa} size="sm" /> : '—'}</span><span>Conductor: {v.conductor || '—'}</span></dd>
              </dl>
            </section>

            <section className="ga-sec" aria-label="Consumo">
              <h3 className="ga-sec__titulo"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Fuel size={16} aria-hidden /> Consumo</span></h3>
              <dl className="pp-dl">
                <dt>Estación</dt>
                <dd><b>{v.estacion_nombre || '—'}</b>{(v.estacion_sede || v.estacion_ruc) && <span>{[v.estacion_sede, v.estacion_ruc ? `RUC ${v.estacion_ruc}` : ''].filter(Boolean).join(' · ')}</span>}</dd>
                <dt>Combustible</dt>
                <dd><b>{v.combustible || '—'}</b><span>{fmt(v.galones, 2)} gal × {fmt(v.precio_galon)}{v.km_odometro != null ? ` · Odómetro ${v.km_odometro.toLocaleString('es-PE')} km` : ''}</span></dd>
                <dt>N° de voucher</dt>
                <dd><b>{v.numero_voucher || '—'}</b></dd>
              </dl>
            </section>
          </div>

          <div className="ga-det__col">
            <section className="ga-sec" aria-label="Pago">
              <h3 className="ga-sec__titulo"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Wallet size={16} aria-hidden /> Pago</span></h3>
              <dl className="pp-dl">
                <dt>Se paga a</dt>
                <dd><b>{v.beneficiario_nombre || '—'}</b><span>{v.pagar_a === 'CONDUCTOR' ? 'Conductor (reembolso)' : 'Estación de servicio'}</span></dd>
              </dl>
              <div className="ga-resumen">
                <div className="ga-resumen__fila"><span>Galones</span><b>{fmt(v.galones, 2)}</b></div>
                <div className="ga-resumen__fila"><span>Precio por galón</span><b>{fmt(v.precio_galon)}</b></div>
                <div className="ga-resumen__total"><span>Total del vale</span><b>{monto(v)}</b></div>
              </div>
              {v.estado === 'PAGADO' && <p className="t-footnote c-secondary" style={{ margin: 0 }}><CheckCircle2 size={13} style={{ verticalAlign: '-2px' }} /> Pagado por Tesorería.</p>}
            </section>

            <section className="ga-sec" aria-label="Documentos">
              <h3 className="ga-sec__titulo">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardList size={16} aria-hidden /> Documentos</span>
                <span className="ga-sec__cuenta">{docs.filter(d => !!d.url).length} adjuntos</span>
              </h3>
              <div className="ga-docs">
                {docs.map(({ titulo, url, Icono }) => (
                  <div key={titulo} className={`ga-doc ${url ? '' : 'ga-doc--falta'}`}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icono size={16} aria-hidden /> {titulo}</span>
                    {url ? <a href={url} target="_blank" rel="noopener noreferrer">Ver archivo</a> : <span>Sin archivo</span>}
                  </div>
                ))}
              </div>
            </section>
            <p className="t-footnote c-secondary" style={{ margin: 0 }}><Coins size={13} style={{ verticalAlign: '-2px' }} /> El dinero lo mueve la caja; el código del vale solo lo vincula al viaje.</p>
          </div>
        </div>
      )}
    </Sheet>
  );
}

interface Form {
  viaje: string; placa: string; conductor: string; conductor_doc: string; fecha: string; hora: string; estacion_nombre: string; estacion_ruc: string; combustible: string;
  galones: string; precio_galon: string; total: string; moneda: string; km_odometro: string; numero_voucher: string; placa_voucher: string; observacion: string;
  pagar_a: 'CONDUCTOR' | 'ESTACION'; beneficiario_nombre: string; beneficiario_doc: string;
  // Lo que pide la caja
  autoriza: string; modalidad_pago: string; cuenta_destino: string; cuenta_empresa: string; tipo_comprobante: string;
  // Servicio (ida o regreso) al que pertenece el vale
  orden_servicio: string;
  // Estación de servicio (sede) del proveedor donde se cargó
  estacion_sede: string;
}
const VACIO: Form = {
  viaje: '', placa: '', conductor: '', conductor_doc: '', fecha: '', hora: '', estacion_nombre: '', estacion_ruc: '', combustible: '', galones: '', precio_galon: '', total: '', moneda: 'SOLES',
  km_odometro: '', numero_voucher: '', placa_voucher: '', observacion: '', pagar_a: 'ESTACION', beneficiario_nombre: '', beneficiario_doc: '',
  autoriza: '', modalidad_pago: 'TRANSFERENCIA BANCARIA', cuenta_destino: '', cuenta_empresa: '', tipo_comprobante: '', orden_servicio: '', estacion_sede: '',
};
const t = (v: unknown) => (v == null ? '' : String(v));
const PASOS = ['Viaje y voucher', 'Consumo', 'Proveedor y pago', 'Confirmar'];
interface Benef { estaciones?: string[]; nombre: string; doc: string | null; cuentas: Array<{ label: string; usd: boolean; principal?: boolean }> }
/** Tipo de comprobante según la serie del voucher (F… factura, B… boleta) */
const comprobanteDe = (nro: string) => (/^F/i.test(nro) ? 'FACTURA' : /^B/i.test(nro) ? 'BOLETA DE VENTA' : '');
// Lo que la caja guarda como motivo y submotivo según el combustible (el centro de costo es CC-300)
const subMotivoCaja = (c: string) => (c === 'Úrea / AdBlue' ? 'Úrea / AdBlue' : /^Gasolina/.test(c) ? 'Gasolina vehículos auxiliares/supervisión' : 'Diésel B5 / Gasolina de ruta');

function NuevoValeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [paso, setPaso] = useState(0);
  const [leyendo, setLeyendo] = useState(false);
  const [f, setF] = useState<Form>(VACIO);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [iaJson, setIaJson] = useState('');
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [km, setKm] = useState<number | null>(null);
  const [gps, setGps] = useState<{ km: number; hace: number | null } | null>(null);
  const [gpsCargando, setGpsCargando] = useState(false);
  const [registrado, setRegistrado] = useState<{ codigo: string } | null>(null);

  const reiniciar = () => { setPaso(0); setLeyendo(false); setF(VACIO); setArchivo(null); setIaJson(''); setAlertas([]); setError(null); setGuardando(false); setKm(null); setGps(null); setRegistrado(null); };
  useEffect(() => { if (open) reiniciar(); }, [open]);

  const viajes = useQuery<ViajeOpc[]>({ queryKey: ['operaciones', 'vales-viajes'], enabled: open, staleTime: 30_000, queryFn: () => api<{ data?: ViajeOpc[] }>('/operaciones/vales/viajes').then(r => r.data ?? []) });
  const bens = useQuery<Benef[]>({ queryKey: ['operaciones', 'vales-ben', f.pagar_a], enabled: open && paso >= 2, staleTime: 60_000,
    queryFn: () => api<{ data?: Benef[] }>('/operaciones/vales/beneficiarios', { query: { tipo: f.pagar_a } }).then(r => r.data ?? []) });
  const cuentasEmpresa = useEmpresaCuentas();

  const set = (p: Partial<Form>) => setF(x => ({ ...x, ...p }));
  const viajeActual = viajes.data?.find(v => v.viaje === f.viaje);
  const unidad = unidadDe(f.combustible);

  async function traerKmGps(placa: string, sobrescribir = false) {
    if (!placa) return;
    setGpsCargando(true);
    try {
      const r = await api<{ ok: boolean; km?: number | null; hace_minutos?: number | null; error?: string }>('/operaciones/vales/gps-km', { query: { placa } });
      if (r.ok && r.km) { setGps({ km: r.km, hace: r.hace_minutos ?? null }); setF(x => (sobrescribir || !x.km_odometro ? { ...x, km_odometro: String(r.km) } : x)); }
      else setGps(null);
    } catch { setGps(null); } finally { setGpsCargando(false); }
  }

  function elegirViaje(codigo: string | null) {
    const v = viajes.data?.find(x => x.viaje === codigo);
    if (!v) { set({ viaje: '' }); return; }
    set({ viaje: v.viaje, placa: v.placa_tracto, conductor: v.conductor, conductor_doc: t(v.conductor_doc), orden_servicio: v.servicios?.length === 1 ? v.servicios[0].orden : '' });
    setKm(v.ultimo_km);
    void traerKmGps(v.placa_tracto);
  }

  async function leer(a: File) {
    setArchivo(a); setError(null); setLeyendo(true);
    try {
      const cuerpo = new FormData();
      cuerpo.append('archivo', a); cuerpo.append('placa', f.placa);
      const r = await api<{ datos: Lectura; proveedor: { nombre: string; doc: string | null } | null; alertas: Alerta[] }>('/operaciones/vales/leer', { method: 'POST', body: cuerpo });
      const d = r.datos;
      const estacion = r.proveedor?.nombre || t(d.estacion_nombre);
      const ruc = t(r.proveedor?.doc || d.estacion_ruc);
      setIaJson(JSON.stringify(d));
      setF(x => ({
        ...x, estacion_nombre: estacion, estacion_ruc: ruc, fecha: t(d.fecha) || hoyIso(), hora: t(d.hora), combustible: combustibleDe(t(d.combustible)),
        galones: t(d.galones), precio_galon: t(d.precio_galon), total: t(d.total), km_odometro: d.km_odometro ? t(d.km_odometro) : x.km_odometro, numero_voucher: t(d.numero_voucher), placa_voucher: t(d.placa),
        conductor_doc: x.conductor_doc || t(d.conductor_doc), tipo_comprobante: comprobanteDe(t(d.numero_voucher)) || x.tipo_comprobante,
        beneficiario_nombre: x.pagar_a === 'ESTACION' ? estacion : x.beneficiario_nombre, beneficiario_doc: x.pagar_a === 'ESTACION' ? ruc : x.beneficiario_doc,
      }));
      setAlertas(r.alertas ?? []); haptic('success'); setPaso(1);
    } catch (err) { setError(errorMessage(err)); haptic('warning'); } finally { setLeyendo(false); }
  }

  // Galones × precio calcula el total mientras se escribe (la persona puede corregirlo)
  const recalcular = (p: Partial<Form>) => {
    const g = n((p.galones ?? f.galones).replace(',', '.')), pr = n((p.precio_galon ?? f.precio_galon).replace(',', '.'));
    set({ ...p, ...(g > 0 && pr > 0 ? { total: (Math.round(g * pr * 100) / 100).toFixed(2) } : {}) });
  };

  // A quién se le paga: la lista trae sus cuentas; al elegir se propone la primera en soles
  function elegirBeneficiario(nombre: string | null, crear = false) {
    const b = (bens.data ?? []).find(x => x.nombre === nombre);
    const cuenta = b ? (b.cuentas.find(c => c.principal) ?? b.cuentas.find(c => !c.usd) ?? b.cuentas[0])?.label ?? '' : '';
    set({
      beneficiario_nombre: nombre ?? '', beneficiario_doc: t(b?.doc), cuenta_destino: crear ? '' : cuenta,
      estacion_sede: b?.estaciones?.length === 1 ? b.estaciones[0] : '',
      ...(f.pagar_a === 'ESTACION' ? { estacion_nombre: nombre ?? '', estacion_ruc: b?.doc ? t(b.doc) : f.estacion_ruc } : {}),
    });
  }
  function cambiarPagarA(p: 'CONDUCTOR' | 'ESTACION') {
    set(p === 'CONDUCTOR'
      ? { pagar_a: p, beneficiario_nombre: f.conductor, beneficiario_doc: f.conductor_doc, cuenta_destino: '' }
      : { pagar_a: p, beneficiario_nombre: f.estacion_nombre, beneficiario_doc: f.estacion_ruc, cuenta_destino: '' });
  }
  const benActual = (bens.data ?? []).find(b => b.nombre === f.beneficiario_nombre) ?? null;
  // Si se escribe un RUC completo que está en la lista de proveedores, se elige solo
  useEffect(() => {
    if (f.pagar_a !== 'ESTACION' || f.beneficiario_nombre || !/^\d{11}$/.test(f.estacion_ruc) || !bens.data) return;
    const b = bens.data.find(x => x.doc === f.estacion_ruc);
    if (b) elegirBeneficiario(b.nombre);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.estacion_ruc, bens.data]);
  // Preselecciona la cuenta de la empresa en soles si hay una sola
  const cuentasSoles = useMemo(() => (cuentasEmpresa.data ?? []).map(etiquetaCuentaEmpresa).filter(c => /SOLES/i.test(c)), [cuentasEmpresa.data]);
  useEffect(() => { if (paso >= 2 && !f.cuenta_empresa && cuentasSoles.length === 1) setF(x => ({ ...x, cuenta_empresa: cuentasSoles[0] })); }, [paso, cuentasSoles, f.cuenta_empresa]);

  function validarConsumo(): string | null {
    if (!f.viaje) return 'Elige el viaje.';
    if ((viajeActual?.servicios?.length ?? 0) > 0 && !f.orden_servicio) return 'Elige a qué servicio pertenece el vale (ida o regreso).';
    if (!f.combustible) return 'Elige el tipo de combustible.';
    if (!(n(f.galones) > 0)) return 'Indica la cantidad.';
    if (!(n(f.total) > 0)) return 'Indica el total.';
    if (!f.fecha) return 'Indica la fecha.';
    return null;
  }
  function validarPago(): string | null {
    if (!f.beneficiario_nombre.trim()) return f.pagar_a === 'CONDUCTOR' ? 'Elige el conductor al que se le paga.' : 'Elige la estación (proveedor) a la que se le paga.';
    if (f.pagar_a === 'ESTACION' && (benActual?.estaciones?.length ?? 0) > 0 && !f.estacion_sede) return 'Elige la estación de servicio (sede) donde se cargó.';
    if (!f.cuenta_empresa) return 'Elige la cuenta de la empresa desde la que se paga.';
    if (!f.autoriza) return 'Elige quién autoriza.';
    return null;
  }
  function siguiente(desde: number) {
    const e = desde === 1 ? validarConsumo() : desde === 2 ? validarPago() : null;
    if (e) { setError(e); haptic('warning'); return; }
    setError(null); haptic('selection'); setPaso(desde + 1);
  }

  async function guardar(confirmar: boolean) {
    setError(null);
    setGuardando(true);
    try {
      const cuerpo = new FormData();
      Object.entries(f).forEach(([k, v]) => cuerpo.append(k, String(v)));
      if (!f.tipo_comprobante) cuerpo.set('tipo_comprobante', comprobanteDe(f.numero_voucher));
      if (archivo) cuerpo.append('voucher', archivo);
      cuerpo.append('ia_json', iaJson);
      if (confirmar) cuerpo.append('confirmar_alertas', '1');
      const r = await api<{ ok?: boolean; codigo?: string; error?: string }>('/operaciones/vales', { method: 'POST', body: cuerpo });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar el vale');
      haptic('success');
      await qc.invalidateQueries({ queryKey: ['operaciones', 'vales-viaje'] });
      setRegistrado({ codigo: r.codigo ?? '' }); setPaso(4);
    } catch (err) {
      const cuerpoErr = (err as { body?: { alertas?: Alerta[] } }).body;
      if (cuerpoErr?.alertas) setAlertas(cuerpoErr.alertas);
      setError(errorMessage(err)); haptic('warning');
    } finally { setGuardando(false); }
  }

  const hayRojo = alertas.some(a => a.nivel === 'rojo');
  const opcionesViaje = (viajes.data ?? []).map(v => ({ value: v.viaje, label: v.viaje, description: [v.placa_tracto, v.conductor, v.ruta].filter(Boolean).join(' · ') }));
  const opcionesBen = (bens.data ?? []).map(b => ({ value: b.nombre, label: b.nombre, description: b.doc ?? undefined, keywords: b.doc ?? undefined }));

  const footer = paso === 0 ? <Button variant="secondary" onClick={onClose} disabled={leyendo}>Cancelar</Button>
    : paso === 1 ? (<><Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => setPaso(0)}>Otra foto</Button><Button variant="primary" onClick={() => siguiente(1)}>Siguiente</Button></>)
    : paso === 2 ? (<><Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => setPaso(1)}>Atrás</Button><Button variant="primary" onClick={() => siguiente(2)}>Revisar</Button></>)
    : paso === 3 ? (<><Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setPaso(2)} disabled={guardando}>Corregir</Button>
        <Button variant="primary" onClick={() => guardar(hayRojo)} loading={guardando}>{hayRojo ? 'Registrar de todos modos' : 'Registrar vale'}</Button></>)
    : (<><Button variant="secondary" onClick={onClose}>Cerrar</Button><Button variant="primary" icon={<Plus size={16} />} onClick={reiniciar}>Otro vale</Button></>);

  const cuentasBen = benActual?.cuentas ?? [];
  // La cuenta principal queda elegida de verdad (no solo a la vista): pasa al cambiar a «Conductor», al llegar la lista o al volver al paso
  useEffect(() => {
    if (paso < 2 || f.cuenta_destino || !benActual || cuentasBen.length === 0) return;
    const c = cuentasBen.find(x => x.principal) ?? cuentasBen.find(x => !x.usd) ?? cuentasBen[0];
    if (c) setF(x => ({ ...x, cuenta_destino: c.label }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, f.beneficiario_nombre, f.pagar_a, f.cuenta_destino, bens.data]);

  return (
    <Sheet ancho open={open} onClose={() => !guardando && !leyendo && onClose()} title="Nuevo vale de combustible" footer={footer}>
      <div className="gr gr--compacto">
        {paso < 4 && (
          <ol className="vs-pasos" aria-label="Pasos">
            {PASOS.map((nombre, i) => <li key={nombre} className={i === paso ? 'vs-pasos__on' : i < paso ? 'vs-pasos__hecho' : ''}><span>{i < paso ? <Check size={12} aria-hidden /> : i + 1}</span>{nombre}</li>)}
          </ol>
        )}
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

        {/* Paso 1: viaje y voucher */}
        {paso === 0 && !leyendo && (
          <>
            <section className="os-seccion">
              <h3 className="os-seccion__titulo">Viaje</h3>
              <div className="os-seccion__cuerpo">
                {viajes.isError && <Notice tone="error">No se pudieron cargar los viajes: {errorMessage(viajes.error)}</Notice>}
                <Field label="Viaje *" hint={viajeActual ? [viajeActual.placa_tracto, viajeActual.conductor].filter(Boolean).join(' · ') : 'Se llenan solos la placa y el conductor'}>
                  {p => <Combobox {...p} options={opcionesViaje} value={f.viaje || null} onChange={elegirViaje} placeholder="Busca por viaje, placa o conductor" loading={viajes.isFetching} enHoja compacta tituloHoja="Elegir viaje" />}
                </Field>
                {(viajeActual?.servicios?.length ?? 0) > 0 && (
                  <Field label="¿A qué servicio pertenece? *" hint={viajeActual!.servicios!.length === 1 ? 'El viaje lleva un solo servicio' : 'Elige si el vale es de la ida o del regreso: así se sabe cuánto costó cada uno'}>
                    {p => <Combobox {...p} options={viajeActual!.servicios!.map(x => ({ value: x.orden, label: `${x.orden} · ${x.es_retorno ? 'Regreso' : 'Ida'}`, description: [x.cliente, x.ruta].filter(Boolean).join(' · ') || undefined }))}
                      value={f.orden_servicio || null} onChange={v => set({ orden_servicio: v ?? '' })} placeholder="Elige el servicio (ida o regreso)" enHoja compacta tituloHoja="Servicio del vale" />}
                  </Field>
                )}
              </div>
            </section>
            <div className="gr__zona" role="button" tabIndex={0} aria-disabled={!f.viaje}
              onClick={() => f.viaje && entrada.current?.click()} onKeyDown={e => { if (f.viaje && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); entrada.current?.click(); } }}
              style={f.viaje ? undefined : { opacity: 0.5, cursor: 'not-allowed' }}>
              <span className="gr__icono" aria-hidden><UploadCloud size={28} /></span>
              <strong>{f.viaje ? 'Sube la foto del voucher' : 'Primero elige el viaje'}</strong>
              <span>La IA lee la estación, los galones, el precio y el total. Tú solo confirmas.</span>
              <input ref={entrada} type="file" hidden accept="image/*,application/pdf,.pdf" onChange={e => { const a = e.target.files?.[0]; e.target.value = ''; if (a) void leer(a); }} />
            </div>
            <ul className="gr__ayuda"><li><Sparkles size={16} aria-hidden /><span>También avisa si algo no cuadra: total, placa distinta, voucher repetido o precio raro.</span></li></ul>
            <Button variant="plain" disabled={!f.viaje} onClick={() => { setF(x => ({ ...x, fecha: x.fecha || hoyIso() })); setAlertas([]); setPaso(1); }}>Prefiero llenarlo a mano</Button>
          </>
        )}
        {paso === 0 && leyendo && <div className="gr__leyendo"><PageLoader /><strong>Leyendo el voucher…</strong><span>{archivo?.name}</span></div>}

        {/* Paso 2: consumo */}
        {paso === 1 && (
          <>
            {archivo && <p className="gr__archivo"><ImagenIcono size={15} aria-hidden /> {archivo.name}{iaJson ? ' · leído con IA: revisa cada dato' : ''}</p>}
            {alertas.length > 0 && <Notice tone={hayRojo ? 'error' : 'accent'} icon={<CircleAlert size={16} />}>{alertas.map(a => <div key={a.texto}>{a.nivel === 'rojo' ? '● ' : '○ '}{a.texto}</div>)}</Notice>}
            <section className="os-seccion">
              <h3 className="os-seccion__titulo">El consumo</h3>
              <div className="os-seccion__cuerpo">
                <div className="gr__g3">
                  <Field label="Fecha *">{p => <TextInput {...p} type="date" value={f.fecha} max={hoyIso()} onChange={e => set({ fecha: e.target.value })} />}</Field>
                  <Field label="Hora">{p => <TextInput {...p} type="time" value={f.hora} onChange={e => set({ hora: e.target.value })} />}</Field>
                  <Field label="N° de voucher">{p => <TextInput {...p} value={f.numero_voucher} onChange={e => set({ numero_voucher: e.target.value, tipo_comprobante: comprobanteDe(e.target.value) || f.tipo_comprobante })} />}</Field>
                </div>
                <div className="gr__g3">
                  <Field label="Combustible *">{p => <Combobox {...p} options={OPCIONES_COMBUSTIBLE} value={f.combustible || null} onChange={v => set({ combustible: v ?? '' })} placeholder="Elige el tipo" enHoja compacta tituloHoja="Tipo de combustible" />}</Field>
                  <Field label={`Cantidad (${unidad}) *`}>{p => <TextInput {...p} inputMode="decimal" value={f.galones} onChange={e => recalcular({ galones: e.target.value })} />}</Field>
                  <Field label="Precio por unidad">{p => <TextInput {...p} inputMode="decimal" value={f.precio_galon} onChange={e => recalcular({ precio_galon: e.target.value })} />}</Field>
                </div>
                <div className="gr__g3">
                  <Field label="Total (S/) *">{p => <TextInput {...p} inputMode="decimal" value={f.total} onChange={e => set({ total: e.target.value })} />}</Field>
                  <Field label="Km del odómetro" hint={gpsCargando ? 'Consultando el GPS…' : gps ? `GPS: ${gps.km.toLocaleString('es-PE')} km${gps.hace != null ? ` · hace ${gps.hace} min` : ''}` : km ? `Último vale: ${km.toLocaleString('es-PE')}` : 'El GPS no devolvió el km: escríbelo si lo tienes'}>
                    {p => <TextInput {...p} inputMode="numeric" value={f.km_odometro} onChange={e => set({ km_odometro: e.target.value.replace(/\D/g, '') })} />}
                  </Field>
                  <div style={{ alignSelf: 'end' }}><Button variant="secondary" icon={<Satellite size={16} />} loading={gpsCargando} disabled={!f.placa} onClick={() => void traerKmGps(f.placa, true)}>Usar km del GPS</Button></div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* Paso 3: proveedor y pago (lo que pide la caja) */}
        {paso === 2 && (
          <>
            <section className="os-seccion">
              <h3 className="os-seccion__titulo">¿A quién se le paga?<span className="gr__nota"> · la caja se genera a su nombre</span></h3>
              <div className="os-seccion__cuerpo">
                <SegmentedControl block label="Pagar a" value={f.pagar_a} onChange={cambiarPagarA} options={[{ value: 'ESTACION', label: 'Estación (proveedor)' }, { value: 'CONDUCTOR', label: 'Conductor' }]} />
                <Field label={f.pagar_a === 'CONDUCTOR' ? 'Conductor *' : 'Proveedor (estación) *'} hint={f.pagar_a === 'ESTACION' ? 'Busca por nombre o por RUC: al elegirlo se completa el otro dato' : undefined}>
                  {p => <Combobox {...p} options={opcionesBen} value={f.beneficiario_nombre || null} loading={bens.isFetching} enHoja compacta tituloHoja={f.pagar_a === 'CONDUCTOR' ? 'Elegir conductor' : 'Elegir proveedor'} placeholder="Busca por nombre, RUC o DNI"
                    onChange={v => elegirBeneficiario(v)} onCreate={txt => elegirBeneficiario(txt.trim(), true)} createLabel="Usar (no registrado)" />}
                </Field>
                {f.pagar_a === 'ESTACION' && f.beneficiario_nombre && (
                  <Field label={`Estación de servicio (sede)${(benActual?.estaciones?.length ?? 0) > 0 ? ' *' : ' (opcional)'}`}
                    hint={(benActual?.estaciones?.length ?? 0) > 0 ? 'Este proveedor tiene varias estaciones: elige en cuál se cargó' : 'Este proveedor no tiene estaciones registradas: escribe cuál es si quieres dejarlo anotado'}>
                    {p => (benActual?.estaciones?.length ?? 0) > 0 ? (
                      <Combobox {...p} options={benActual!.estaciones!.map(e => ({ value: e, label: e }))} value={f.estacion_sede || null} onChange={v => set({ estacion_sede: v ?? '' })}
                        onCreate={txt => set({ estacion_sede: txt.trim() })} createLabel="Usar esta estación" placeholder="Elige la estación donde se cargó" enHoja compacta tituloHoja="Estación de servicio" />
                    ) : <TextInput {...p} value={f.estacion_sede} placeholder="Ej.: Grifo de la Av. Industrial" onChange={e => set({ estacion_sede: e.target.value })} />}
                  </Field>
                )}
                {f.pagar_a === 'ESTACION' && (
                  <Field label="RUC" hint={f.estacion_ruc && f.beneficiario_nombre && !benActual ? 'Este proveedor no está en la lista: escríbelo completo o regístralo en Almacén' : undefined}>
                    {p => <TextInput {...p} inputMode="numeric" maxLength={11} value={f.estacion_ruc} onChange={e => { const r = e.target.value.replace(/\D/g, ''); set({ estacion_ruc: r, beneficiario_doc: r }); }} />}
                  </Field>
                )}
              </div>
            </section>
            <section className="os-seccion">
              <h3 className="os-seccion__titulo">Pago en Caja</h3>
              <div className="os-seccion__cuerpo">
                <Field label={`Cuenta ${f.pagar_a === 'CONDUCTOR' ? 'del conductor' : 'del proveedor'}`} hint={cuentasBen.length > 1 ? 'Sale la cuenta principal; puedes elegir otra.' : cuentasBen.length === 0 ? 'Opcional: puedes escribirla aquí o editar la caja después.' : undefined}>
                  {p => cuentasBen.length > 0 ? (
                    <SelectInput {...p} value={f.cuenta_destino} onChange={e => set({ cuenta_destino: e.target.value })}>
                      {cuentasBen.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                    </SelectInput>
                  ) : <TextInput {...p} value={f.cuenta_destino} placeholder="Ej. BCP - CUENTA CORRIENTE [SOLES] - 191-1234567-0-12" onChange={e => set({ cuenta_destino: e.target.value })} />}
                </Field>
                <AvisoSinCuenta f={f} />
                <Field label="Cuenta de la empresa (de dónde sale el pago) *">
                  {p => <SelectInput {...p} value={f.cuenta_empresa} disabled={cuentasEmpresa.isLoading} onChange={e => set({ cuenta_empresa: e.target.value })}>
                    <option value="">{cuentasEmpresa.isLoading ? 'Cargando cuentas…' : 'Elige una cuenta'}</option>
                    {cuentasSoles.map(c => <option key={c} value={c}>{c}</option>)}
                  </SelectInput>}
                </Field>
                <div className="gr__g3">
                  <Field label="Modalidad de pago">{p => <SelectInput {...p} value={f.modalidad_pago} onChange={e => set({ modalidad_pago: e.target.value })}>{MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}</SelectInput>}</Field>
                  <Field label="Comprobante" hint={f.numero_voucher ? `N° ${f.numero_voucher}` : undefined}>{p => <SelectInput {...p} value={f.tipo_comprobante || comprobanteDe(f.numero_voucher)} onChange={e => set({ tipo_comprobante: e.target.value })}><option value="">Vale provisional de caja</option>{COMPROBANTES.filter(c => c !== 'VALE PROVISIONAL DE CAJA').map(c => <option key={c} value={c}>{c}</option>)}</SelectInput>}</Field>
                  <Field label="Autoriza *">{p => <SelectInput {...p} value={f.autoriza} onChange={e => set({ autoriza: e.target.value })}><option value="">Elige quién autoriza</option>{AUTORIZAN.map(a => <option key={a} value={a}>{a}</option>)}</SelectInput>}</Field>
                </div>
              </div>
            </section>
          </>
        )}

        {/* Paso 4: confirmar */}
        {paso === 3 && (
          <>
            {alertas.length > 0 && <Notice tone={hayRojo ? 'error' : 'accent'} icon={<CircleAlert size={16} />}>{alertas.map(a => <div key={a.texto}>{a.nivel === 'rojo' ? '● ' : '○ '}{a.texto}</div>)}</Notice>}
            <AvisoSinCuenta f={f} />
            <TicketVale f={f} titulo="Revisa antes de registrar" icono={<Fuel size={20} />} pie="Al registrar se crea su caja, pendiente de aprobación." />
            <CajaPrevia f={f} />
          </>
        )}

        {paso === 4 && registrado && (
          <>
          <AvisoSinCuenta f={f} registrado />
          <TicketVale f={f} codigo={registrado.codigo} titulo="Vale registrado" icono={<Check size={22} />} ok pie="Su caja quedó pendiente de aprobación; al aprobarla aparecerá en Pago de requerimientos." animar />
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Aviso (no bloquea) cuando se genera una caja a nombre de alguien sin cuenta bancaria predefinida */
function AvisoSinCuenta({ f, registrado }: { f: Form; registrado?: boolean }) {
  if (!f.beneficiario_nombre || f.modalidad_pago === 'EFECTIVO' || f.cuenta_destino.trim()) return null;
  const conductor = f.pagar_a === 'CONDUCTOR';
  const modulo = conductor ? 'Cuentas del personal' : 'Cuentas de proveedores';
  return (
    <Notice tone="accent" icon={<CircleAlert size={16} />}>
      {registrado ? 'Se generó' : 'Se generará'} la caja de <b>{f.beneficiario_nombre}</b>, pero no tiene una cuenta bancaria predefinida.
      {' '}Regístrala en Tesorería › {modulo} y luego edita la caja para que figure. <Link to={conductor ? '/tesoreria/cuentas-personal' : '/tesoreria/cuentas-proveedores'}>Ir a {modulo}</Link>
    </Notice>
  );
}

/** Lo que se va a generar en Caja al registrar el vale (egreso pendiente de aprobación) */
function CajaPrevia({ f }: { f: Form }) {
  const filas: Array<[string, string]> = [
    ['Movimiento', 'Egreso · PENDIENTE de aprobación'],
    ['Motivo', 'Combustibles y Fluidos'], ['Submotivo', subMotivoCaja(f.combustible)], ['Centro de costo', 'CC-300 Operaciones de Ruta (Costo Servicio)'],
    ['Persona', `${f.pagar_a === 'CONDUCTOR' ? 'Conductor' : 'Proveedor'} · ${f.beneficiario_nombre}${f.beneficiario_doc ? ` (${f.beneficiario_doc})` : ''}`],
    ['Cuenta de la persona', f.cuenta_destino || '—'], ['Cuenta de la empresa', f.cuenta_empresa || '—'], ['Modalidad de pago', f.modalidad_pago],
    ['Comprobante', `${f.tipo_comprobante || comprobanteDe(f.numero_voucher) || 'VALE PROVISIONAL DE CAJA'}${f.numero_voucher ? ` · ${f.numero_voucher}` : ''}`],
    ['Autoriza', f.autoriza || '—'], ['Viaje / placa', `${f.viaje} · ${f.placa}`], ['Importe', `S/ ${fmt(f.total)}`],
  ];
  return (
    <section className="os-seccion" aria-label="Caja que se generará">
      <h3 className="os-seccion__titulo">Se generará en Caja</h3>
      <div className="os-seccion__cuerpo">
        {filas.map(([k, v]) => <div className="vt__fila" key={k}><span>{k}</span><span>{v}</span></div>)}
      </div>
    </section>
  );
}

/** Ticket con todos los datos del vale: resumen antes de registrar y comprobante después (con animación de impresión) */
function TicketVale({ f, titulo, icono, pie, codigo, ok, animar }: { f: Form; titulo: string; icono: React.ReactNode; pie: string; codigo?: string; ok?: boolean; animar?: boolean }) {
  const quieto = useReducedMotion();
  const sinMov = quieto || !animar;
  const unidad = unidadDe(f.combustible);
  const simbolo = /D[OÓ]L/i.test(f.moneda) ? 'US$' : 'S/';
  const filas: Array<[string, string]> = [
    ['Viaje', f.viaje], ['Placa', f.placa || '—'], ['Conductor', f.conductor || '—'], ['Fecha', `${fechaCorta(f.fecha)}${f.hora ? ` · ${f.hora}` : ''}`],
    ['Estación', `${f.estacion_nombre || '—'}${f.estacion_sede ? ` · ${f.estacion_sede}` : ''}`], ...(f.estacion_ruc ? [['RUC', f.estacion_ruc] as [string, string]] : []),
    ['Combustible', f.combustible || '—'], ['Cantidad', `${fmt(f.galones, 2)} ${unidad}`], ['Precio', `${simbolo} ${fmt(f.precio_galon)} / ${unidad}`],
    ...(f.km_odometro ? [['Odómetro', `${Number(f.km_odometro).toLocaleString('es-PE')} km`] as [string, string]] : []),
    ...(f.numero_voucher ? [['Voucher', f.numero_voucher] as [string, string]] : []),
  ];
  return (
    <motion.div className="vt" role="group" aria-label={titulo}
      initial={sinMov ? false : { clipPath: 'inset(0 0 100% 0)', y: -24, opacity: 0.4 }}
      animate={sinMov ? undefined : { clipPath: 'inset(0 0 0% 0)', y: 0, opacity: 1 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.9 }}>
      <div className="vt__cab">
        <motion.span className={`vt__ico${ok ? ' vt__ico--ok' : ''}`} aria-hidden
          initial={sinMov ? false : { scale: 0.4, opacity: 0 }} animate={sinMov ? undefined : { scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.35, duration: 0.6, delay: 0.7 }}>{icono}</motion.span>
        <p className="vt__tit">{titulo}</p>
        {codigo && <p className="vt__cod">{codigo}</p>}
      </div>
      <div style={{ paddingTop: 8 }}>
        {filas.map(([k, v], i) => (
          <motion.div className="vt__fila" key={k} initial={sinMov ? false : { opacity: 0, y: 6 }} animate={sinMov ? undefined : { opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: 0.25 + i * 0.05 }}>
            <span>{k}</span><span>{v}</span>
          </motion.div>
        ))}
      </div>
      <hr className="vt__sep" />
      <div className="vt__fila"><span>Pagar a</span><span>{f.pagar_a === 'CONDUCTOR' ? 'Conductor' : 'Estación'} · {f.beneficiario_nombre}</span></div>
      <div className="vt__total"><span>Total</span><strong>{simbolo} {fmt(f.total)}</strong></div>
      <p className="vt__pie">{pie}</p>
    </motion.div>
  );
}
