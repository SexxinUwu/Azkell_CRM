import '../mantenimiento/mant.css';
import '../../core/ui/acciones-iconos.css';
import '../operaciones/seguimiento.css';
import '../tesoreria/pago.css';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CircleAlert, Download, FileSearch, Landmark, SearchX } from 'lucide-react';
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
import { formatMoneda } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';

type Libro = 'VENTAS' | 'COMPRAS';
interface Fila {
  id: number; libro: Libro; periodo: string; car_sunat: string | null; fecha_emision: string | null; fecha_vencimiento: string | null; tipo_cp: string | null; serie: string | null; numero: string | null;
  doc_tipo: string | null; doc_numero: string | null; razon_social: string | null; base_gravada: number | string; igv: number | string; exo_ina: number | string; otros: number | string; total: number | string;
  moneda: string | null; tipo_cambio: number | string | null; mod_tipo: string | null; mod_serie: string | null; mod_numero: string | null; detraccion: string | null; tipo_nota: string | null; estado_comp: string | null;
  en_sistema?: number | string;
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
const mesAnterior = () => { const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const comprobante = (f: Fila) => [f.serie, f.numero].filter(Boolean).join('-') || '—';
const esDeSunat = (f: Fila) => /^E/i.test(f.serie ?? '');

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
  { id: 'mon', titulo: 'Moneda', ancho: 80 }, { id: 'det', titulo: 'Detracción', ancho: 100 }, { id: 'est', titulo: 'Estado', ancho: 80 },
];

/** Contabilidad › SIRE: lo que SUNAT tiene en el registro de ventas y de compras, traído al sistema para consultarlo y filtrarlo. */
export function SirePage() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const puedeTraer = can('contabilidad_sire.crear');
  const [libro, setLibro] = useState<Libro>('VENTAS');
  const [mes, setMes] = useState(mesAnterior);
  const [busqueda, setBusqueda] = useState('');
  const [filtrando, setFiltrando] = useState(false);
  const [tipo, setTipo] = useState('');
  const [moneda, setMoneda] = useState('');
  const [estado, setEstado] = useState('');
  const [sistema, setSistema] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const periodo = mes.replace('-', '');

  const est = useQuery({
    queryKey: ['contabilidad', 'sire', 'estado'],
    queryFn: () => api<Estado>('/contabilidad/sire/estado'),
    // Mientras SUNAT prepara una descarga, se consulta cada pocos segundos
    refetchInterval: q => ((q.state.data?.en_proceso?.length ?? 0) > 0 ? 2500 : false),
  });
  const filas = useQuery({
    queryKey: ['contabilidad', 'sire', 'comprobantes', libro, periodo],
    queryFn: () => api<{ data: Fila[] }>('/contabilidad/sire/comprobantes', { query: { libro, periodo } }).then(r => r.data ?? []),
    staleTime: 30_000,
  });
  const enCurso = (est.data?.en_proceso ?? []).filter(x => x.periodo === periodo);
  const hayCurso = enCurso.length > 0;
  // Al terminar una descarga se recarga la lista
  const antes = useRef(false);
  useEffect(() => {
    if (antes.current && !hayCurso) { void qc.invalidateQueries({ queryKey: ['contabilidad', 'sire'] }); }
    antes.current = hayCurso;
  }, [hayCurso, qc]);

  const datos = filas.data ?? [];
  const cuenta = (f: (x: Fila) => boolean) => datos.filter(f).length;
  const visibles = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    return datos.filter(f => (!tipo || f.tipo_cp === tipo) && (!moneda || f.moneda === moneda) && (!estado || (f.estado_comp ?? '') === estado)
      && (!sistema || (sistema === 'SI' ? n(f.en_sistema) > 0 : n(f.en_sistema) === 0))
      && (!t || sinTildes(`${comprobante(f)} ${f.razon_social ?? ''} ${f.doc_numero ?? ''} ${f.car_sunat ?? ''} ${TIPOS[f.tipo_cp ?? ''] ?? ''}`).includes(t)));
  }, [datos, busqueda, tipo, moneda, estado, sistema]);
  const activos = [tipo, moneda, estado, sistema].filter(Boolean).length;
  const limpiar = () => { setTipo(''); setMoneda(''); setEstado(''); setSistema(''); };
  const totales = useMemo(() => {
    const por = new Map<string, { base: number; igv: number; total: number }>();
    visibles.forEach(f => { const k = f.moneda || 'PEN'; const t = por.get(k) ?? { base: 0, igv: 0, total: 0 }; t.base += n(f.base_gravada); t.igv += n(f.igv); t.total += n(f.total); por.set(k, t); });
    return [...por.entries()];
  }, [visibles]);
  const tiposPresentes = useMemo(() => [...new Set(datos.map(f => f.tipo_cp).filter(Boolean) as string[])].sort(), [datos]);
  const estadosPresentes = useMemo(() => [...new Set(datos.map(f => f.estado_comp ?? '').filter(Boolean))].sort(), [datos]);
  const ultima = (est.data?.ultimas ?? []).find(u => u.libro === libro && u.periodo === periodo);
  const bajados = (est.data?.periodos ?? []).find(p => p.libro === libro && p.periodo === periodo);

  async function traer() {
    setEnviando(true);
    try {
      await api('/contabilidad/sire/sincronizar', { method: 'POST', body: { libro: 'AMBOS', periodo } });
      haptic('success'); toast('Descarga iniciada: SUNAT prepara el archivo');
      await qc.invalidateQueries({ queryKey: ['contabilidad', 'sire', 'estado'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); } finally { setEnviando(false); }
  }

  const subtitulo = filas.isLoading ? 'Cargando…' : `${datos.length} ${datos.length === 1 ? 'comprobante' : 'comprobantes'} de ${libro === 'VENTAS' ? 'ventas' : 'compras'} en ${mes}${bajados ? ` · descargado el ${fechaCorta(bajados.ultima.slice(0, 10))} ${bajados.ultima.slice(11)}` : ''}`;

  return (
    <Page>
      <PageHeader eyebrow="Contabilidad" title="SIRE · Ventas y compras" subtitle={subtitulo}
        actions={puedeTraer ? <Button variant="primary" icon={<Download size={16} />} onClick={() => { void traer(); }} loading={enviando} disabled={hayCurso || !est.data?.configurado}>Traer de SUNAT</Button> : undefined} />

      {est.data && !est.data.configurado && (
        <Notice tone="error" icon={<CircleAlert size={16} />}>Faltan las credenciales del SIRE. Cárgalas en <Link to="/sistema/integraciones">Sistema › Integraciones › SUNAT · SIRE</Link>.</Notice>
      )}
      {hayCurso && <Notice tone="accent" icon={<Landmark size={16} />}>SUNAT está preparando el período {mes}: {enCurso.map(x => `${x.libro === 'VENTAS' ? 'ventas' : 'compras'} (${x.mensaje || 'en curso'})`).join(' · ')}</Notice>}
      {!hayCurso && ultima && ultima.estado === 'ERROR' && <Notice tone="error">No se pudo traer {libro === 'VENTAS' ? 'las ventas' : 'las compras'} de {mes}: {ultima.mensaje}</Notice>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder={libro === 'VENTAS' ? 'Número, cliente, RUC o DNI' : 'Número, proveedor o RUC'} activos={activos} onAbrirFiltros={() => setFiltrando(true)}>
          <SegmentedControl label="Libro" value={libro} onChange={v => { setLibro(v as Libro); setBusqueda(''); limpiar(); }}
            options={[{ value: 'VENTAS', label: 'Ventas' }, { value: 'COMPRAS', label: 'Compras' }]} />
          <TextInput type="month" aria-label="Período" value={mes} max={new Date().toISOString().slice(0, 7)} onChange={e => e.target.value && setMes(e.target.value)} style={{ width: 160 }} />
        </BarraFiltros>

        {totales.length > 0 && (
          <p className="t-footnote c-secondary" style={{ margin: 0 }}>
            {visibles.length} {visibles.length === 1 ? 'comprobante' : 'comprobantes'}{totales.map(([m, t]) => ` · ${m === 'USD' ? 'US$' : 'S/'}: base ${formatMoneda(t.base, m === 'USD' ? 'USD' : 'PEN')} · IGV ${formatMoneda(t.igv, m === 'USD' ? 'USD' : 'PEN')} · total ${formatMoneda(t.total, m === 'USD' ? 'USD' : 'PEN')}`).join('')}
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
          {libro === 'VENTAS' && (
            <GrupoFiltro titulo="En nuestro sistema">
              <ListaEleccion value={sistema} onChange={setSistema} opciones={[{ value: '', label: 'Todas', count: datos.length }, { value: 'SI', label: 'Emitidas desde el sistema', count: cuenta(f => n(f.en_sistema) > 0) }, { value: 'NO', label: 'Solo en SUNAT (por ejemplo, emitidas en el portal)', count: cuenta(f => n(f.en_sistema) === 0) }]} />
            </GrupoFiltro>
          )}
        </HojaFiltros>

        {filas.isLoading ? <PageLoader /> : filas.isError ? <Notice tone="error">{errorMessage(filas.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || activos ? <SearchX size={22} /> : <FileSearch size={22} />} title={busqueda || activos ? 'Sin coincidencias' : `Aún no hay ${libro === 'VENTAS' ? 'ventas' : 'compras'} de ${mes} en el sistema`}>
            {busqueda || activos ? 'Prueba con otra búsqueda o quita los filtros.' : puedeTraer ? 'Pulsa «Traer de SUNAT» para descargar lo que SUNAT tiene en el SIRE de este período.' : 'Todavía no se descargó este período.'}
          </EmptyState>
        ) : (
          <TablaRedimensionable id={`sire-${libro.toLowerCase()}-v1`} columnas={libro === 'VENTAS' ? COL_VENTAS : COL_COMPRAS} ariaLabel={`SIRE ${libro.toLowerCase()}`} altoMax="64vh" className="tabla-redim--compacta">
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
                  {libro === 'COMPRAS' && <Celda>{f.detraccion || '—'}</Celda>}
                  <Celda>{f.estado_comp || '—'}</Celda>
                  {libro === 'VENTAS' && (
                    <Celda>{n(f.en_sistema) > 0
                      ? <span style={{ color: 'var(--green-ink)', fontWeight: 600 }}>Sí</span>
                      : <span style={{ color: 'var(--amber-ink)', fontWeight: 600 }}>{esDeSunat(f) ? 'Solo en SUNAT (portal)' : 'Solo en SUNAT'}</span>}</Celda>
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

/** Todos los datos del comprobante tal como los entrega SUNAT */
function DetalleSheet({ id, fila, onClose }: { id: number | null; fila: Fila | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['contabilidad', 'sire', 'detalle', id], enabled: id != null, queryFn: () => api<{ data: { datos: Array<[string, string]> } }>(`/contabilidad/sire/comprobantes/${id}`).then(r => r.data.datos) });
  return (
    <Sheet open={id != null} onClose={onClose} title={fila ? `${TIPOS[fila.tipo_cp ?? ''] ?? 'Comprobante'} ${comprobante(fila)}` : 'Comprobante'}
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : (
        <dl className="pp-dl">
          {(q.data ?? []).map(([k, v], i) => (<Fragment key={`${i}-${k}`}><dt>{k}</dt><dd><b>{v}</b></dd></Fragment>))}
        </dl>
      )}
    </Sheet>
  );
}
