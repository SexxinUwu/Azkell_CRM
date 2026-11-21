import '../mantenimiento/mant.css';
import '../../core/ui/acciones-iconos.css';
import '../operaciones/seguimiento.css';
import '../tesoreria/pago.css';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CircleAlert, Download, FileSearch, FileText, Landmark, SearchX } from 'lucide-react';
import { FileSpreadsheet, FilePdf } from '../../core/ui/IconosArchivo';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { BarraFiltros, GrupoFiltro, HojaFiltros, ListaEleccion } from '../../core/ui/FiltrosListado';
import { TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { formatMoneda } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';

type Libro = 'VENTAS' | 'COMPRAS';
interface Cruce { estado: 'EXACTO' | 'PROBABLE' | 'NO'; origen: string | null; codigo: string | null; archivo: string | null }
interface Fila {
  id: number; libro: Libro; periodo: string; car_sunat: string | null; fecha_emision: string | null; fecha_vencimiento: string | null; tipo_cp: string | null; serie: string | null; numero: string | null;
  doc_tipo: string | null; doc_numero: string | null; razon_social: string | null; base_gravada: number | string; igv: number | string; exo_ina: number | string; otros: number | string; total: number | string;
  moneda: string | null; tipo_cambio: number | string | null; mod_tipo: string | null; mod_serie: string | null; mod_numero: string | null; detraccion: string | null; tipo_nota: string | null; estado_comp: string | null;
  en_sistema?: number | string; sistema_id?: number | null; cruce?: Cruce;
}
interface Estado {
  configurado: boolean;
  periodos: Array<{ libro: Libro; periodo: string; filas: number; ultima: string }>;
  en_proceso: Array<{ id: number; libro: Libro; periodo: string; mensaje: string | null }>;
  ultimas: Array<{ libro: Libro; periodo: string; estado: string; filas: number; mensaje: string | null; terminado_en: string | null }>;
}

const TIPOS: Record<string, string> = { '01': 'Factura', '03': 'Boleta de venta', '07': 'Nota de crédito', '08': 'Nota de débito', '12': 'Ticket', '14': 'Recibo de servicios', '50': 'DUA', '91': 'Comprobante no domiciliado', '97': 'Nota de crédito no dom.', '98': 'Nota de débito no dom.' };
const n = (v: unknown) => Number(v) || 0;
const fechaCorta = (f?: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—');
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoyLima = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
const mesAnterior = () => { const d = hoyLima(); d.setDate(1); d.setMonth(d.getMonth() - 1); return iso(d).slice(0, 7); };
const inicioMesAnterior = () => { const d = hoyLima(); d.setDate(1); d.setMonth(d.getMonth() - 1); return iso(d); };
const comprobante = (f: Fila) => [f.serie, f.numero].filter(Boolean).join('-') || '—';
const esDeSunat = (f: Fila) => /^E/i.test(f.serie ?? '');
/** Meses (AAAAMM) entre dos fechas AAAA-MM-DD, ambos incluidos */
function mesesEntre(desde: string, hasta: string): string[] {
  if (!desde || !hasta || desde > hasta) return [];
  const out: string[] = [];
  let a = Number(desde.slice(0, 4)); let m = Number(desde.slice(5, 7));
  const fa = Number(hasta.slice(0, 4)); const fm = Number(hasta.slice(5, 7));
  while ((a < fa || (a === fa && m <= fm)) && out.length < 60) { out.push(`${a}${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; a++; } }
  return out;
}
const textoCruce = (c?: Cruce) => (!c ? '' : c.estado === 'NO' ? 'Sin registrar' : `${c.estado === 'PROBABLE' ? 'Probable: ' : ''}${c.codigo}`);

const COL_VENTAS: ColumnaTabla[] = [
  { id: 'emision', titulo: 'Emisión', ancho: 105 }, { id: 'tipo', titulo: 'Tipo', ancho: 140 }, { id: 'comp', titulo: 'Comprobante', ancho: 140 },
  { id: 'doc', titulo: 'RUC / DNI', ancho: 120 }, { id: 'cliente', titulo: 'Cliente', ancho: 260, minimo: 140 },
  { id: 'base', titulo: 'Base', ancho: 120, alinear: 'right' }, { id: 'igv', titulo: 'IGV', ancho: 105, alinear: 'right' }, { id: 'total', titulo: 'Total', ancho: 125, alinear: 'right' },
  { id: 'mon', titulo: 'Moneda', ancho: 80 }, { id: 'est', titulo: 'Estado', ancho: 80 }, { id: 'sis', titulo: 'En el sistema', ancho: 150 },
];
const COL_COMPRAS: ColumnaTabla[] = [
  { id: 'emision', titulo: 'Emisión', ancho: 105 }, { id: 'tipo', titulo: 'Tipo', ancho: 140 }, { id: 'comp', titulo: 'Comprobante', ancho: 150 },
  { id: 'doc', titulo: 'RUC / DNI', ancho: 120 }, { id: 'prov', titulo: 'Proveedor', ancho: 260, minimo: 140 },
  { id: 'base', titulo: 'Base', ancho: 120, alinear: 'right' }, { id: 'igv', titulo: 'IGV', ancho: 105, alinear: 'right' }, { id: 'total', titulo: 'Total', ancho: 125, alinear: 'right' },
  { id: 'mon', titulo: 'Moneda', ancho: 80 }, { id: 'det', titulo: 'Detracción', ancho: 100 }, { id: 'sis', titulo: 'En el sistema', ancho: 210, minimo: 140 },
];

/** Contabilidad › SIRE: lo que SUNAT tiene en el registro de ventas y de compras, traído al sistema para consultarlo, filtrarlo, cruzarlo y exportarlo. */
export function SirePage() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const puedeTraer = can('contabilidad_sire.crear');
  const [libro, setLibro] = useState<Libro>('COMPRAS');
  const [modo, setModo] = useState<'mes' | 'rango'>('mes');
  const [mes, setMes] = useState(mesAnterior);
  const [desde, setDesde] = useState(inicioMesAnterior);
  const [hasta, setHasta] = useState(() => iso(hoyLima()));
  const [busqueda, setBusqueda] = useState('');
  const [filtrando, setFiltrando] = useState(false);
  const [tipo, setTipo] = useState('');
  const [moneda, setMoneda] = useState('');
  const [estado, setEstado] = useState('');
  const [sistema, setSistema] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const periodo = mes.replace('-', '');
  const meses = useMemo(() => (modo === 'mes' ? [periodo] : mesesEntre(desde, hasta)), [modo, periodo, desde, hasta]);

  const est = useQuery({
    queryKey: ['contabilidad', 'sire', 'estado'],
    queryFn: () => api<Estado>('/contabilidad/sire/estado'),
    // Mientras SUNAT prepara una descarga, se consulta cada pocos segundos
    refetchInterval: q => ((q.state.data?.en_proceso?.length ?? 0) > 0 ? 2500 : false),
  });
  const filas = useQuery({
    queryKey: ['contabilidad', 'sire', 'comprobantes', libro, modo === 'mes' ? periodo : `${desde}_${hasta}`],
    queryFn: () => api<{ data: Fila[] }>('/contabilidad/sire/comprobantes', { query: modo === 'mes' ? { libro, periodo } : { libro, desde, hasta } }).then(r => r.data ?? []),
    staleTime: 30_000,
  });
  const enCurso = (est.data?.en_proceso ?? []).filter(x => meses.includes(x.periodo));
  const hayCurso = enCurso.length > 0;
  // Al terminar una descarga se recarga la lista
  const antes = useRef(false);
  useEffect(() => {
    if (antes.current && !hayCurso) { void qc.invalidateQueries({ queryKey: ['contabilidad', 'sire'] }); }
    antes.current = hayCurso;
  }, [hayCurso, qc]);

  const datos = filas.data ?? [];
  const cuenta = (f: (x: Fila) => boolean) => datos.filter(f).length;
  const registrada = (f: Fila) => (libro === 'COMPRAS' ? f.cruce?.estado !== 'NO' : n(f.en_sistema) > 0);
  const visibles = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    return datos.filter(f => (!tipo || f.tipo_cp === tipo) && (!moneda || f.moneda === moneda) && (!estado || (f.estado_comp ?? '') === estado)
      && (!sistema || (sistema === 'SI' ? (libro === 'COMPRAS' ? f.cruce?.estado !== 'NO' : n(f.en_sistema) > 0) : (libro === 'COMPRAS' ? f.cruce?.estado === 'NO' : n(f.en_sistema) === 0)))
      && (!t || sinTildes(`${comprobante(f)} ${f.razon_social ?? ''} ${f.doc_numero ?? ''} ${f.car_sunat ?? ''} ${TIPOS[f.tipo_cp ?? ''] ?? ''} ${f.cruce?.codigo ?? ''}`).includes(t)));
  }, [datos, busqueda, tipo, moneda, estado, sistema, libro]);
  const activos = [tipo, moneda, estado, sistema].filter(Boolean).length;
  const limpiar = () => { setTipo(''); setMoneda(''); setEstado(''); setSistema(''); };
  const totales = useMemo(() => {
    const por = new Map<string, { base: number; igv: number; total: number }>();
    visibles.forEach(f => { const k = f.moneda || 'PEN'; const t = por.get(k) ?? { base: 0, igv: 0, total: 0 }; t.base += n(f.base_gravada); t.igv += n(f.igv); t.total += n(f.total); por.set(k, t); });
    return [...por.entries()];
  }, [visibles]);
  const sinRegistrar = useMemo(() => (libro === 'COMPRAS' ? visibles.filter(f => f.cruce?.estado === 'NO' && (f.moneda || 'PEN') === 'PEN') : []), [visibles, libro]);
  const tiposPresentes = useMemo(() => [...new Set(datos.map(f => f.tipo_cp).filter(Boolean) as string[])].sort(), [datos]);
  const estadosPresentes = useMemo(() => [...new Set(datos.map(f => f.estado_comp ?? '').filter(Boolean))].sort(), [datos]);
  const ultima = (est.data?.ultimas ?? []).find(u => u.libro === libro && meses.includes(u.periodo) && u.estado === 'ERROR');
  const bajados = (est.data?.periodos ?? []).find(p => p.libro === libro && p.periodo === periodo);
  const sinBajar = modo === 'rango' ? meses.filter(m => !(est.data?.periodos ?? []).some(p => p.libro === libro && p.periodo === m)) : [];

  async function traer() {
    if (meses.length === 0) { toast('Elige un rango de fechas válido', 'error'); return; }
    if (meses.length > 12) { toast('El rango tiene más de 12 meses: pide un rango menor', 'error'); return; }
    if (meses.length > 3 && !window.confirm(`Se pedirán ${meses.length} meses a SUNAT (ventas y compras). Puede tardar unos minutos. ¿Continuar?`)) return;
    setEnviando(true);
    let fallos = 0;
    for (const m of meses) {
      try { await api('/contabilidad/sire/sincronizar', { method: 'POST', body: { libro: 'AMBOS', periodo: m } }); } catch (err) { fallos++; if (meses.length === 1) toast(errorMessage(err), 'error'); }
    }
    if (fallos < meses.length) { haptic('success'); toast(meses.length === 1 ? 'Descarga iniciada: SUNAT prepara el archivo' : `Descarga iniciada de ${meses.length - fallos} meses`); } else haptic('warning');
    await qc.invalidateQueries({ queryKey: ['contabilidad', 'sire', 'estado'] });
    setEnviando(false);
  }

  // Excel de lo que se ve (con los filtros y la búsqueda aplicados): sirve para entregar al contador o revisar en una hoja de cálculo
  async function exportar() {
    if (!visibles.length) { toast('No hay comprobantes para exportar', 'error'); return; }
    const compras = libro === 'COMPRAS';
    const encabezados = ['Período', 'Emisión', 'Tipo', 'Serie', 'Número', 'RUC / DNI', compras ? 'Proveedor' : 'Cliente', 'Base gravada', 'IGV', 'Exonerado / inafecto', 'Otros', 'Total', 'Moneda', 'T. cambio', ...(compras ? ['Detracción', 'En el sistema', 'Documento adjunto'] : ['En el sistema']), 'CAR SUNAT'];
    const filasX = visibles.map(f => [
      f.periodo, f.fecha_emision ? { fechaIso: f.fecha_emision, formato: 'dd/mm/yyyy' } : '', TIPOS[f.tipo_cp ?? ''] ?? f.tipo_cp ?? '', f.serie ?? '', f.numero ?? '', f.doc_numero ?? '', f.razon_social ?? '',
      n(f.base_gravada), n(f.igv), n(f.exo_ina), n(f.otros), n(f.total), f.moneda ?? '', n(f.tipo_cambio) || '',
      ...(compras ? [f.detraccion ?? '', textoCruce(f.cruce), f.cruce?.archivo ? { texto: 'Ver documento', enlace: f.cruce.archivo } : ''] : [n(f.en_sistema) > 0 ? 'Emitida desde el sistema' : esDeSunat(f) ? 'Solo en SUNAT (portal)' : 'Solo en SUNAT']),
      f.car_sunat ?? '',
    ]);
    try {
      await exportarExcel(`SIRE_${compras ? 'Compras' : 'Ventas'}_${modo === 'mes' ? periodo : `${desde}_a_${hasta}`}`, compras ? 'Compras' : 'Ventas', encabezados, filasX);
      haptic('success'); toast(`Excel con ${visibles.length} comprobantes`);
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
  }

  const rotuloPeriodo = modo === 'mes' ? mes : `${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  const subtitulo = filas.isLoading ? 'Cargando…' : `${datos.length} ${datos.length === 1 ? 'comprobante' : 'comprobantes'} de ${libro === 'VENTAS' ? 'ventas' : 'compras'} · ${rotuloPeriodo}${modo === 'mes' && bajados ? ` · descargado el ${fechaCorta(bajados.ultima.slice(0, 10))} ${bajados.ultima.slice(11)}` : ''}`;

  return (
    <Page>
      <PageHeader eyebrow="Contabilidad" title="SIRE · Ventas y compras" subtitle={subtitulo}
        actions={
          <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            <Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={() => { void exportar(); }} disabled={!visibles.length}>Exportar a Excel</Button>
            {puedeTraer && <Button variant="primary" icon={<Download size={16} />} onClick={() => { void traer(); }} loading={enviando} disabled={hayCurso || !est.data?.configurado}>Traer de SUNAT</Button>}
          </div>
        } />

      {est.data && !est.data.configurado && (
        <Notice tone="error" icon={<CircleAlert size={16} />}>Faltan las credenciales del SIRE de esta empresa. Cárgalas en <Link to="/sistema/integraciones">Sistema › Integraciones › SUNAT · SIRE</Link>.</Notice>
      )}
      {hayCurso && <Notice tone="accent" icon={<Landmark size={16} />}>SUNAT está preparando {enCurso.length === 1 ? 'el período' : 'los períodos'} {[...new Set(enCurso.map(x => x.periodo))].join(', ')}: {enCurso.map(x => `${x.libro === 'VENTAS' ? 'ventas' : 'compras'} (${x.mensaje || 'en curso'})`).join(' · ')}</Notice>}
      {!hayCurso && ultima && <Notice tone="error">No se pudo traer {libro === 'VENTAS' ? 'las ventas' : 'las compras'} de {ultima.periodo}: {ultima.mensaje}</Notice>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder={libro === 'VENTAS' ? 'Número, cliente, RUC o DNI' : 'Número, proveedor, RUC o código de orden'} activos={activos} onAbrirFiltros={() => setFiltrando(true)}>
          <SegmentedControl label="Libro" value={libro} onChange={v => { setLibro(v as Libro); setBusqueda(''); limpiar(); }}
            options={[{ value: 'COMPRAS', label: 'Compras (me emitieron)' }, { value: 'VENTAS', label: 'Ventas (emití)' }]} />
          <SegmentedControl label="Forma de elegir" value={modo} onChange={v => setModo(v as 'mes' | 'rango')} options={[{ value: 'mes', label: 'Mes' }, { value: 'rango', label: 'Rango de fechas' }]} />
          {modo === 'mes'
            ? <TextInput type="month" aria-label="Período" value={mes} max={iso(hoyLima()).slice(0, 7)} onChange={e => e.target.value && setMes(e.target.value)} style={{ width: 160 }} />
            : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <TextInput type="date" aria-label="Emitidas desde" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} style={{ width: 150 }} />
                <span className="t-footnote c-secondary" aria-hidden>→</span>
                <TextInput type="date" aria-label="Emitidas hasta" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} style={{ width: 150 }} />
              </span>
            )}
        </BarraFiltros>

        {modo === 'rango' && sinBajar.length > 0 && !hayCurso && (
          <p className="t-footnote c-secondary" style={{ margin: 0 }}>Meses de este rango que aún no están en el sistema: {sinBajar.join(', ')}. {puedeTraer ? 'Pulsa «Traer de SUNAT» para descargarlos.' : ''}</p>
        )}
        {totales.length > 0 && (
          <p className="t-footnote c-secondary" style={{ margin: 0 }}>
            {visibles.length} {visibles.length === 1 ? 'comprobante' : 'comprobantes'}{totales.map(([m, t]) => ` · ${m === 'USD' ? 'US$' : 'S/'}: base ${formatMoneda(t.base, m === 'USD' ? 'USD' : 'PEN')} · IGV ${formatMoneda(t.igv, m === 'USD' ? 'USD' : 'PEN')} · total ${formatMoneda(t.total, m === 'USD' ? 'USD' : 'PEN')}`).join('')}
            {libro === 'COMPRAS' && sinRegistrar.length > 0 && <strong style={{ color: 'var(--red-ink)' }}> · Sin registrar en el sistema: {sinRegistrar.length} por {formatMoneda(sinRegistrar.reduce((s, f) => s + n(f.total), 0), 'PEN')}</strong>}
          </p>
        )}

        <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={activos} onLimpiar={limpiar} resultado={visibles.length} unidad="comprobante">
          <GrupoFiltro titulo="Tipo de comprobante">
            <ListaEleccion value={tipo} onChange={setTipo} opciones={[{ value: '', label: 'Todos', count: datos.length }, ...tiposPresentes.map(t => ({ value: t, label: TIPOS[t] ?? `Tipo ${t}`, count: cuenta(f => f.tipo_cp === t) }))]} />
          </GrupoFiltro>
          <GrupoFiltro titulo="Moneda">
            <ListaEleccion value={moneda} onChange={setMoneda} opciones={[{ value: '', label: 'Todas', count: datos.length }, { value: 'PEN', label: 'Soles', count: cuenta(f => f.moneda === 'PEN') }, { value: 'USD', label: 'Dólares', count: cuenta(f => f.moneda === 'USD') }]} />
          </GrupoFiltro>
          {estadosPresentes.length > 1 && (
            <GrupoFiltro titulo="Estado del comprobante (código de SUNAT)">
              <ListaEleccion value={estado} onChange={setEstado} opciones={[{ value: '', label: 'Todos', count: datos.length }, ...estadosPresentes.map(e => ({ value: e, label: `Estado ${e}`, count: cuenta(f => (f.estado_comp ?? '') === e) }))]} />
            </GrupoFiltro>
          )}
          <GrupoFiltro titulo="En nuestro sistema">
            <ListaEleccion value={sistema} onChange={setSistema} opciones={libro === 'COMPRAS'
              ? [{ value: '', label: 'Todas', count: datos.length }, { value: 'SI', label: 'Registradas (o probables) en órdenes, vales o caja', count: cuenta(f => f.cruce?.estado !== 'NO') }, { value: 'NO', label: 'Sin registrar en el sistema', count: cuenta(f => f.cruce?.estado === 'NO') }]
              : [{ value: '', label: 'Todas', count: datos.length }, { value: 'SI', label: 'Emitidas desde el sistema', count: cuenta(f => n(f.en_sistema) > 0) }, { value: 'NO', label: 'Solo en SUNAT (por ejemplo, emitidas en el portal)', count: cuenta(f => n(f.en_sistema) === 0) }]} />
          </GrupoFiltro>
        </HojaFiltros>

        {filas.isLoading ? <PageLoader /> : filas.isError ? <Notice tone="error">{errorMessage(filas.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || activos ? <SearchX size={22} /> : <FileSearch size={22} />} title={busqueda || activos ? 'Sin coincidencias' : `Aún no hay ${libro === 'VENTAS' ? 'ventas' : 'compras'} de ${rotuloPeriodo} en el sistema`}>
            {busqueda || activos ? 'Prueba con otra búsqueda o quita los filtros.' : puedeTraer ? 'Pulsa «Traer de SUNAT» para descargar lo que SUNAT tiene en el SIRE de este período.' : 'Todavía no se descargó este período.'}
          </EmptyState>
        ) : (
          <TablaRedimensionable id={`sire-${libro.toLowerCase()}-v2`} columnas={libro === 'VENTAS' ? COL_VENTAS : COL_COMPRAS} ariaLabel={`SIRE ${libro.toLowerCase()}`} altoMax="62vh" className="tabla-redim--compacta">
            {visibles.map(f => {
              const mon = f.moneda === 'USD' ? 'USD' : 'PEN';
              const nc = f.tipo_cp === '07' || f.tipo_cp === '97';
              return (
                <tr key={f.id} className="tabla-redim__fila--click" onClick={() => { haptic('selection'); setAbierto(f.id); }}>
                  <Celda mono>{fechaCorta(f.fecha_emision)}</Celda>
                  <Celda>{TIPOS[f.tipo_cp ?? ''] ?? (f.tipo_cp ? `Tipo ${f.tipo_cp}` : '—')}</Celda>
                  <Celda mono>{comprobante(f)}</Celda>
                  <Celda mono>{f.doc_numero || '—'}</Celda>
                  <Celda>{f.razon_social || '—'}</Celda>
                  <Celda alinear="right" mono>{formatMoneda(n(f.base_gravada), mon)}</Celda>
                  <Celda alinear="right" mono>{formatMoneda(n(f.igv), mon)}</Celda>
                  <Celda alinear="right" mono><strong style={nc ? { color: 'var(--red-ink)' } : undefined}>{formatMoneda(n(f.total), mon)}</strong></Celda>
                  <Celda>{f.moneda || '—'}</Celda>
                  {libro === 'COMPRAS' ? <Celda>{f.detraccion || '—'}</Celda> : <Celda>{f.estado_comp || '—'}</Celda>}
                  {libro === 'VENTAS' ? (
                    <Celda>{registrada(f)
                      ? <span style={{ color: 'var(--green-ink)', fontWeight: 600 }}>Sí</span>
                      : <span style={{ color: 'var(--amber-ink)', fontWeight: 600 }}>{esDeSunat(f) ? 'Solo en SUNAT (portal)' : 'Solo en SUNAT'}</span>}</Celda>
                  ) : (
                    <Celda>{f.cruce?.estado === 'NO' || !f.cruce
                      ? <span style={{ color: 'var(--red-ink)', fontWeight: 600 }}>Sin registrar</span>
                      : <span style={{ color: f.cruce.estado === 'EXACTO' ? 'var(--green-ink)' : 'var(--amber-ink)', fontWeight: 600 }}>{textoCruce(f.cruce)}</span>}</Celda>
                  )}
                </tr>
              );
            })}
          </TablaRedimensionable>
        )}
      </div>

      <DetalleSheet id={abierto} onClose={() => setAbierto(null)} fila={datos.find(x => x.id === abierto) ?? null} />
    </Page>
  );
}

/** Todos los datos del comprobante tal como los entrega SUNAT, con lo que el sistema sabe de él */
function DetalleSheet({ id, fila, onClose }: { id: number | null; fila: Fila | null; onClose: () => void }) {
  const toast = useToast();
  const q = useQuery({ queryKey: ['contabilidad', 'sire', 'detalle', id], enabled: id != null, queryFn: () => api<{ data: { datos: Array<[string, string]> } }>(`/contabilidad/sire/comprobantes/${id}`).then(r => r.data.datos) });
  const abrir = (url: string) => window.open(url, '_blank', 'noopener');

  async function excelDelComprobante() {
    if (!fila || !q.data) return;
    const filasX: Array<Array<string>> = q.data.map(([k, v]) => [k, v]);
    if (fila.libro === 'COMPRAS') filasX.push(['En el sistema', textoCruce(fila.cruce)]);
    else filasX.push(['En el sistema', n(fila.en_sistema) > 0 ? 'Emitida desde el sistema' : 'Solo en SUNAT']);
    try { await exportarExcel(`SIRE_Comprobante_${comprobante(fila)}`, 'Comprobante', ['Campo', 'Valor'], filasX); haptic('success'); } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Sheet open={id != null} onClose={onClose} title={fila ? `${TIPOS[fila.tipo_cp ?? ''] ?? 'Comprobante'} ${comprobante(fila)}` : 'Comprobante'}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        <Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={() => { void excelDelComprobante(); }} disabled={!q.data}>Excel de este comprobante</Button>
        {fila?.cruce?.archivo && <Button variant="primary" icon={<FileText size={16} />} onClick={() => abrir(fila.cruce!.archivo!)}>Ver documento adjunto</Button>}
        {fila?.libro === 'VENTAS' && fila.sistema_id && <Button variant="primary" icon={<FilePdf size={16} />} onClick={() => abrir(`/api/facturacion/${fila.sistema_id}/pdf-propio`)}>PDF de nuestro sistema</Button>}
      </>}>
      {fila?.libro === 'COMPRAS' && (
        <Notice tone={fila.cruce?.estado === 'NO' ? 'error' : fila.cruce?.estado === 'PROBABLE' ? 'accent' : 'success'}>
          {fila.cruce?.estado === 'NO' || !fila.cruce ? 'Esta factura no está registrada en el sistema (ni en órdenes de compra, ni en vales, ni en caja).'
            : `${fila.cruce.estado === 'PROBABLE' ? 'Probable coincidencia' : 'Registrada'}: ${fila.cruce.codigo}.${fila.cruce.archivo ? '' : ' No tiene el documento adjunto.'}`}
          {' '}SUNAT entrega los datos de la factura, no su PDF: el PDF solo aparece aquí si fue adjuntado en la orden, el vale o la caja.
        </Notice>
      )}
      {fila?.libro === 'VENTAS' && !fila.sistema_id && esDeSunat(fila) && <Notice tone="accent">Esta factura se emitió en el portal de SUNAT (serie E): SUNAT entrega sus datos, pero el PDF solo se baja desde el portal.</Notice>}
      <div style={{ height: 'var(--s-3)' }} />
      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : (
        <dl className="pp-dl">
          {(q.data ?? []).map(([k, v], i) => (<Fragment key={`${i}-${k}`}><dt>{k}</dt><dd><b>{v}</b></dd></Fragment>))}
        </dl>
      )}
    </Sheet>
  );
}
