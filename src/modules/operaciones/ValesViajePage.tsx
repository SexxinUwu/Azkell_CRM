import '../mantenimiento/mant.css';
import '../../core/ui/acciones-iconos.css';
import './servicios.css';
import './seguimiento.css';
import './vale-ticket.css';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Check, CircleAlert, Fuel, Pencil, Image as ImagenIcono, Plus, SearchX, Sparkles, UploadCloud, UserRound, Store } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { BarraFiltros } from '../../core/ui/FiltrosListado';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { IconoFila } from '../../core/ui/IconoFila';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';

interface Alerta { nivel: 'rojo' | 'ambar'; texto: string }
interface Vale {
  id: number; codigo: string; viaje: string; placa: string; conductor: string; fecha: string; hora: string | null;
  estacion_nombre: string; estacion_ruc: string | null; combustible: string | null; galones: number | string; precio_galon: number | string; total: number | string; moneda: string;
  km_odometro: number | null; numero_voucher: string | null; pagar_a: 'CONDUCTOR' | 'ESTACION'; beneficiario_nombre: string;
  estado: 'PENDIENTE' | 'APROBADO' | 'PAGADO' | 'ANULADO'; caja_codigo: string; alertas: Alerta[]; voucher_url_firmada: string | null;
}
interface ViajeOpc { viaje: string; placa_tracto: string; conductor: string; ruta: string | null; fecha_viaje: string | null; conductor_doc: string | null; ultimo_km: number | null }
interface Lectura {
  estacion_nombre: string | null; estacion_ruc: string | null; fecha: string | null; hora: string | null; numero_voucher: string | null; placa: string | null; combustible: string | null;
  galones: number | null; precio_galon: number | null; total: number | null; moneda: string; km_odometro: number | null; conductor_doc: string | null;
}
interface Beneficiario { nombre: string; doc: string | null }

const COLUMNAS: ColumnaTabla[] = [
  { id: 'acc', titulo: '', ancho: 80, minimo: 70 },
  { id: 'estado', titulo: 'Estado', ancho: 110 },
  { id: 'codigo', titulo: 'Vale', ancho: 140 },
  { id: 'fecha', titulo: 'Fecha', ancho: 105 },
  { id: 'viaje', titulo: 'Viaje', ancho: 130 },
  { id: 'placa', titulo: 'Placa', ancho: 100 },
  { id: 'conductor', titulo: 'Conductor', ancho: 190, minimo: 120 },
  { id: 'estacion', titulo: 'Estación', ancho: 200, minimo: 120 },
  { id: 'galones', titulo: 'Galones', ancho: 95, alinear: 'right' },
  { id: 'precio', titulo: 'Precio', ancho: 90, alinear: 'right' },
  { id: 'total', titulo: 'Total', ancho: 110, alinear: 'right' },
  { id: 'km', titulo: 'Km', ancho: 95, alinear: 'right' },
  { id: 'pagara', titulo: 'Pagar a', ancho: 210, minimo: 130 },
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
                <Celda>
                  <span style={{ display: 'inline-flex', gap: 2 }}>
                    {v.voucher_url_firmada && <IconoFila texto="Ver el voucher" tono="azul" icono={<ImagenIcono size={15} />} onClick={() => window.open(v.voucher_url_firmada!, '_blank', 'noopener')} />}
                    {puedeCrear && v.estado !== 'ANULADO' && v.estado !== 'PAGADO' && <IconoFila texto="Anular el vale" tono="rojo" icono={<Ban size={15} />} cargando={anulando === v.id} onClick={() => void anular(v)} />}
                  </span>
                </Celda>
                <Celda><Badge tone={TONO[v.estado]}>{ETIQUETA[v.estado]}</Badge>{v.alertas.some(a => a.nivel === 'rojo') && <span title={v.alertas.map(a => a.texto).join(' · ')} style={{ marginLeft: 6, color: 'var(--red-ink)' }}><CircleAlert size={14} aria-label="Con avisos" /></span>}</Celda>
                <Celda mono>{v.codigo}</Celda>
                <Celda mono>{fechaCorta(v.fecha)}</Celda>
                <Celda mono>{v.viaje}</Celda>
                <Celda mono>{v.placa || '—'}</Celda>
                <Celda>{v.conductor || '—'}</Celda>
                <Celda>{v.estacion_nombre || '—'}</Celda>
                <Celda alinear="right" mono>{fmt(v.galones, 2)}</Celda>
                <Celda alinear="right" mono>{fmt(v.precio_galon)}</Celda>
                <Celda alinear="right" mono>{monto(v)}</Celda>
                <Celda alinear="right" mono>{v.km_odometro != null ? v.km_odometro.toLocaleString('es-PE') : '—'}</Celda>
                <Celda><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{v.pagar_a === 'CONDUCTOR' ? <UserRound size={14} aria-hidden /> : <Store size={14} aria-hidden />}{v.beneficiario_nombre}</span></Celda>
              </tr>
            ))}
          </TablaRedimensionable>
        )}
      </div>
      <NuevoValeSheet open={nuevo} onClose={() => setNuevo(false)} />
    </Page>
  );
}

interface Form {
  viaje: string; placa: string; conductor: string; conductor_doc: string; fecha: string; hora: string; estacion_nombre: string; estacion_ruc: string; combustible: string;
  galones: string; precio_galon: string; total: string; moneda: string; km_odometro: string; numero_voucher: string; placa_voucher: string; observacion: string;
  pagar_a: 'CONDUCTOR' | 'ESTACION'; beneficiario_nombre: string; beneficiario_doc: string;
}
const VACIO: Form = { viaje: '', placa: '', conductor: '', conductor_doc: '', fecha: '', hora: '', estacion_nombre: '', estacion_ruc: '', combustible: '', galones: '', precio_galon: '', total: '', moneda: 'SOLES', km_odometro: '', numero_voucher: '', placa_voucher: '', observacion: '', pagar_a: 'ESTACION', beneficiario_nombre: '', beneficiario_doc: '' };
const t = (v: unknown) => (v == null ? '' : String(v));

function NuevoValeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<'subir' | 'leyendo' | 'revisar' | 'resumen' | 'listo'>('subir');
  const [registrado, setRegistrado] = useState<{ codigo: string } | null>(null);
  const [f, setF] = useState<Form>(VACIO);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [iaJson, setIaJson] = useState('');
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [km, setKm] = useState<number | null>(null);
  const qViaje = '';
  const [qBen, setQBen] = useState('');

  useEffect(() => { if (open) { setFase('subir'); setF(VACIO); setArchivo(null); setIaJson(''); setAlertas([]); setError(null); setGuardando(false); setKm(null); setRegistrado(null); } }, [open]);

  const viajes = useQuery<ViajeOpc[]>({ queryKey: ['operaciones', 'vales-viajes', qViaje], enabled: open, staleTime: 30_000, queryFn: () => api<{ data?: ViajeOpc[] }>('/operaciones/vales/viajes', { query: qViaje ? { q: qViaje } : {} }).then(r => r.data ?? []) });
  const bens = useQuery<Beneficiario[]>({ queryKey: ['operaciones', 'vales-ben', f.pagar_a, qBen], enabled: open && fase === 'revisar', staleTime: 30_000,
    queryFn: () => api<{ data?: Beneficiario[] }>('/operaciones/vales/beneficiarios', { query: { tipo: f.pagar_a, ...(qBen ? { q: qBen } : {}) } }).then(r => r.data ?? []) });

  const set = (p: Partial<Form>) => setF(x => ({ ...x, ...p }));
  const viajeActual = viajes.data?.find(v => v.viaje === f.viaje);

  function elegirViaje(codigo: string | null) {
    const v = viajes.data?.find(x => x.viaje === codigo);
    if (!v) { set({ viaje: '' }); return; }
    set({ viaje: v.viaje, placa: v.placa_tracto, conductor: v.conductor, conductor_doc: t(v.conductor_doc) });
    setKm(v.ultimo_km);
  }

  // Al cambiar a quién se paga se propone el conductor del viaje o la estación leída
  function cambiarPagarA(p: 'CONDUCTOR' | 'ESTACION') {
    set(p === 'CONDUCTOR'
      ? { pagar_a: p, beneficiario_nombre: f.conductor, beneficiario_doc: f.conductor_doc }
      : { pagar_a: p, beneficiario_nombre: f.estacion_nombre, beneficiario_doc: f.estacion_ruc });
  }

  async function leer(a: File) {
    setArchivo(a); setError(null); setFase('leyendo');
    try {
      const cuerpo = new FormData();
      cuerpo.append('archivo', a); cuerpo.append('placa', f.placa);
      const r = await api<{ datos: Lectura; proveedor: Beneficiario | null; alertas: Alerta[] }>('/operaciones/vales/leer', { method: 'POST', body: cuerpo });
      const d = r.datos;
      const estacion = r.proveedor?.nombre || t(d.estacion_nombre);
      setIaJson(JSON.stringify(d));
      setF(x => ({
        ...x, estacion_nombre: estacion, estacion_ruc: t(r.proveedor?.doc || d.estacion_ruc), fecha: t(d.fecha) || hoyIso(), hora: t(d.hora), combustible: combustibleDe(t(d.combustible)),
        galones: t(d.galones), precio_galon: t(d.precio_galon), total: t(d.total), moneda: d.moneda || 'SOLES', km_odometro: t(d.km_odometro), numero_voucher: t(d.numero_voucher), placa_voucher: t(d.placa),
        conductor_doc: x.conductor_doc || t(d.conductor_doc),
        beneficiario_nombre: x.pagar_a === 'ESTACION' ? estacion : x.beneficiario_nombre, beneficiario_doc: x.pagar_a === 'ESTACION' ? t(r.proveedor?.doc || d.estacion_ruc) : x.beneficiario_doc,
      }));
      setAlertas(r.alertas ?? []); haptic('success'); setFase('revisar');
    } catch (err) { setError(errorMessage(err)); setFase('subir'); haptic('warning'); }
  }

  // Galones × precio calcula el total mientras se escribe (la persona puede corregirlo)
  const recalcular = (p: Partial<Form>) => {
    const g = n((p.galones ?? f.galones).replace(',', '.')), pr = n((p.precio_galon ?? f.precio_galon).replace(',', '.'));
    set({ ...p, ...(g > 0 && pr > 0 ? { total: (Math.round(g * pr * 100) / 100).toFixed(2) } : {}) });
  };

  function irAlResumen() {
    setError(null);
    if (!f.combustible) { setError('Elige el tipo de combustible.'); return; }
    if (!(n(f.galones) > 0)) { setError('Indica la cantidad.'); return; }
    if (!(n(f.total) > 0)) { setError('Indica el total.'); return; }
    if (!f.beneficiario_nombre.trim()) { setError(f.pagar_a === 'CONDUCTOR' ? 'Elige el conductor al que se le paga.' : 'Indica la estación a la que se le paga.'); return; }
    haptic('selection'); setFase('resumen');
  }

  async function guardar(confirmar: boolean) {
    setError(null);
    setGuardando(true);
    try {
      const cuerpo = new FormData();
      Object.entries(f).forEach(([k, v]) => cuerpo.append(k, String(v)));
      if (archivo) cuerpo.append('voucher', archivo);
      cuerpo.append('ia_json', iaJson);
      if (confirmar) cuerpo.append('confirmar_alertas', '1');
      const r = await api<{ ok?: boolean; codigo?: string; error?: string }>('/operaciones/vales', { method: 'POST', body: cuerpo });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar el vale');
      haptic('success');
      await qc.invalidateQueries({ queryKey: ['operaciones', 'vales-viaje'] });
      setRegistrado({ codigo: r.codigo ?? '' }); setFase('listo');
    } catch (err) {
      const cuerpoErr = (err as { body?: { alertas?: Alerta[] } }).body;
      if (cuerpoErr?.alertas) setAlertas(cuerpoErr.alertas);
      setError(errorMessage(err)); haptic('warning');
    } finally { setGuardando(false); }
  }

  const hayRojo = alertas.some(a => a.nivel === 'rojo');
  const opcionesViaje = (viajes.data ?? []).map(v => ({ value: v.viaje, label: v.viaje, description: [v.placa_tracto, v.conductor, v.ruta].filter(Boolean).join(' · ') }));
  const opcionesBen = (bens.data ?? []).map(b => ({ value: b.nombre, label: b.nombre, description: b.doc ?? undefined }));

  return (
    <Sheet ancho open={open} onClose={() => !guardando && fase !== 'leyendo' && onClose()} title="Nuevo vale de combustible"
      footer={fase === 'revisar' ? (
        <>
          <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => setFase('subir')} disabled={guardando}>Otra foto</Button>
          <Button variant="primary" onClick={irAlResumen}>Revisar el vale</Button>
        </>
      ) : fase === 'resumen' ? (
        <>
          <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setFase('revisar')} disabled={guardando}>Corregir</Button>
          <Button variant="primary" onClick={() => guardar(hayRojo)} loading={guardando}>{hayRojo ? 'Registrar de todos modos' : 'Registrar vale'}</Button>
        </>
      ) : fase === 'listo' ? (
        <>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setFase('subir'); setF(VACIO); setArchivo(null); setIaJson(''); setAlertas([]); setRegistrado(null); setKm(null); }}>Otro vale</Button>
        </>
      ) : <Button variant="secondary" onClick={onClose} disabled={fase === 'leyendo'}>Cancelar</Button>}>
      <div className="gr gr--compacto">
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

        {(fase === 'subir' || fase === 'revisar') && <section className="os-seccion">
          <h3 className="os-seccion__titulo">Viaje</h3>
          <div className="os-seccion__cuerpo">
            <Field label="Viaje *" hint={viajeActual ? [viajeActual.placa_tracto, viajeActual.conductor].filter(Boolean).join(' · ') : 'Se llenan solos la placa y el conductor'}>
              {p => <Combobox {...p} options={opcionesViaje} value={f.viaje || null} onChange={elegirViaje} placeholder="Busca por viaje, placa o conductor" loading={viajes.isFetching} enHoja compacta tituloHoja="Elegir viaje" />}
            </Field>
          </div>
        </section>}

        {fase === 'subir' && (
          <>
            <div className="gr__zona" role="button" tabIndex={0} aria-disabled={!f.viaje}
              onClick={() => f.viaje && entrada.current?.click()} onKeyDown={e => { if (f.viaje && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); entrada.current?.click(); } }}
              style={f.viaje ? undefined : { opacity: 0.5, cursor: 'not-allowed' }}>
              <span className="gr__icono" aria-hidden><UploadCloud size={28} /></span>
              <strong>{f.viaje ? 'Sube la foto del voucher' : 'Primero elige el viaje'}</strong>
              <span>La IA lee la estación, los galones, el precio y el total. Tú solo confirmas.</span>
              <input ref={entrada} type="file" hidden accept="image/*,application/pdf,.pdf" onChange={e => { const a = e.target.files?.[0]; e.target.value = ''; if (a) void leer(a); }} />
            </div>
            <ul className="gr__ayuda">
              <li><Sparkles size={16} aria-hidden /><span>También avisa si algo no cuadra: total, placa distinta, voucher repetido o precio raro.</span></li>
            </ul>
            <Button variant="plain" disabled={!f.viaje} onClick={() => { setF(x => ({ ...x, fecha: hoyIso() })); setAlertas([]); setFase('revisar'); }}>Prefiero llenarlo a mano</Button>
          </>
        )}

        {fase === 'leyendo' && <div className="gr__leyendo"><PageLoader /><strong>Leyendo el voucher…</strong><span>{archivo?.name}</span></div>}

        {fase === 'revisar' && (
          <>
            {archivo && <p className="gr__archivo"><ImagenIcono size={15} aria-hidden /> {archivo.name}{iaJson ? ' · leído con IA: revisa cada dato' : ''}</p>}
            {alertas.length > 0 && (
              <Notice tone={hayRojo ? 'error' : 'accent'} icon={<CircleAlert size={16} />}>{alertas.map(a => <div key={a.texto}>{a.nivel === 'rojo' ? '● ' : '○ '}{a.texto}</div>)}</Notice>
            )}
            <section className="os-seccion">
              <h3 className="os-seccion__titulo">El consumo</h3>
              <div className="os-seccion__cuerpo">
                <div className="gr__g3">
                  <Field label="Fecha *">{p => <TextInput {...p} type="date" value={f.fecha} max={hoyIso()} onChange={e => set({ fecha: e.target.value })} />}</Field>
                  <Field label="Hora">{p => <TextInput {...p} type="time" value={f.hora} onChange={e => set({ hora: e.target.value })} />}</Field>
                  <Field label="N° de voucher">{p => <TextInput {...p} value={f.numero_voucher} onChange={e => set({ numero_voucher: e.target.value })} />}</Field>
                </div>
                <div className="gr__g3">
                  <Field label={`Cantidad (${unidadDe(f.combustible)}) *`}>{p => <TextInput {...p} inputMode="decimal" value={f.galones} onChange={e => recalcular({ galones: e.target.value })} />}</Field>
                  <Field label="Precio por galón">{p => <TextInput {...p} inputMode="decimal" value={f.precio_galon} onChange={e => recalcular({ precio_galon: e.target.value })} />}</Field>
                  <Field label="Total *">{p => <TextInput {...p} inputMode="decimal" value={f.total} onChange={e => set({ total: e.target.value })} />}</Field>
                </div>
                <div className="gr__g3">
                  <Field label="Combustible *">{p => <Combobox {...p} options={OPCIONES_COMBUSTIBLE} value={f.combustible || null} onChange={v => set({ combustible: v ?? '' })} placeholder="Elige el tipo" enHoja compacta tituloHoja="Tipo de combustible" />}</Field>
                  <Field label="Km del odómetro" hint={km ? `Último vale: ${km.toLocaleString('es-PE')}` : undefined}>{p => <TextInput {...p} inputMode="numeric" value={f.km_odometro} onChange={e => set({ km_odometro: e.target.value.replace(/\D/g, '') })} />}</Field>
                  <SegmentedControl block label="Moneda" value={f.moneda} onChange={v => set({ moneda: v })} options={[{ value: 'SOLES', label: 'Soles' }, { value: 'DOLARES', label: 'Dólares' }]} />
                </div>
              </div>
            </section>
            <section className="os-seccion">
              <h3 className="os-seccion__titulo">Estación</h3>
              <div className="os-seccion__cuerpo">
                <div className="gr__g3">
                  <Field label="Estación / grifo">{p => <TextInput {...p} value={f.estacion_nombre} onChange={e => set({ estacion_nombre: e.target.value, ...(f.pagar_a === 'ESTACION' ? { beneficiario_nombre: e.target.value } : {}) })} />}</Field>
                  <Field label="RUC">{p => <TextInput {...p} inputMode="numeric" maxLength={11} value={f.estacion_ruc} onChange={e => set({ estacion_ruc: e.target.value.replace(/\D/g, ''), ...(f.pagar_a === 'ESTACION' ? { beneficiario_doc: e.target.value.replace(/\D/g, '') } : {}) })} />}</Field>
                </div>
              </div>
            </section>
            <section className="os-seccion">
              <h3 className="os-seccion__titulo">¿A quién se le paga?<span className="gr__nota"> · la caja se genera a su nombre</span></h3>
              <div className="os-seccion__cuerpo">
                <SegmentedControl block label="Pagar a" value={f.pagar_a} onChange={cambiarPagarA} options={[{ value: 'ESTACION', label: 'Estación' }, { value: 'CONDUCTOR', label: 'Conductor' }]} />
                <Field label={f.pagar_a === 'CONDUCTOR' ? 'Conductor *' : 'Proveedor (estación) *'} hint={f.beneficiario_doc ? `Documento ${f.beneficiario_doc}` : 'Elígelo de la lista o escribe el nombre'}>
                  {p => <Combobox {...p} options={opcionesBen} value={f.beneficiario_nombre || null} loading={bens.isFetching} enHoja compacta tituloHoja={f.pagar_a === 'CONDUCTOR' ? 'Elegir conductor' : 'Elegir proveedor'} placeholder="Busca por nombre o documento"
                    onChange={v => { const b = bens.data?.find(x => x.nombre === v); set({ beneficiario_nombre: v ?? '', beneficiario_doc: t(b?.doc) }); }}
                    onCreate={txt => { setQBen(''); set({ beneficiario_nombre: txt.trim(), beneficiario_doc: '' }); }} createLabel="Usar" />}
                </Field>
              </div>
            </section>
          </>
        )}

        {fase === 'resumen' && (
          <>
            {alertas.length > 0 && <Notice tone={hayRojo ? 'error' : 'accent'} icon={<CircleAlert size={16} />}>{alertas.map(a => <div key={a.texto}>{a.nivel === 'rojo' ? '● ' : '○ '}{a.texto}</div>)}</Notice>}
            <TicketVale f={f} titulo="Revisa antes de registrar" icono={<Fuel size={20} />} pie="Al registrar se crea su caja, pendiente de aprobación." />
          </>
        )}

        {fase === 'listo' && registrado && (
          <TicketVale f={f} codigo={registrado.codigo} titulo="Vale registrado" icono={<Check size={22} />} ok pie="Su caja quedó pendiente de aprobación; al aprobarla aparecerá en Pago de requerimientos." animar />
        )}
      </div>
    </Sheet>
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
    ['Estación', f.estacion_nombre || '—'], ...(f.estacion_ruc ? [['RUC', f.estacion_ruc] as [string, string]] : []),
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
