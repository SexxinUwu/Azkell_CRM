import '../mantenimiento/mant.css';
import '../../core/ui/acciones-iconos.css';
import '../almacen/almacen.css';
import '../almacen/entradas.css';
import './mov.css';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Banknote, Boxes, CircleCheck, ClipboardList, Coins, Eye, Pencil, Plus, RefreshCw, SearchX, Upload, Wallet } from 'lucide-react';
import { FileSpreadsheet } from '../../core/ui/IconosArchivo';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { TextInput } from '../../core/ui/Field';
import { ChoiceChips } from '../../core/ui/Chips';
import { BarraFiltros, GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { KpiTarjeta } from '../../core/ui/KpiTarjeta';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe, formatSoles } from '../../core/lib/format';
import { MOBILE_QUERY, useMediaQuery } from '../../core/lib/useMediaQuery';
import { useNavigate } from 'react-router-dom';
import { useCaja, type CajaMovimiento } from './api';
import {
  aSoles, esEditable, esPendiente, estadoDe, hoyYMD, inicioMesYMD, montoCaja, num, numeroDoc, ordenar, ORDEN_INICIAL,
} from './caja-lib';
import { DetalleCaja } from './caja-detalle';
import { FormularioCaja } from './caja-formulario';

type Pestana = 'todos' | 'pendientes' | 'aprobados' | 'procesados' | 'anulados';
const PASA: Record<Pestana, (m: CajaMovimiento) => boolean> = {
  todos: () => true,
  pendientes: esPendiente,
  aprobados: m => estadoDe(m) === 'APROBADO',
  procesados: m => ['PROCESADO', 'PAGADO'].includes(estadoDe(m)),
  anulados: m => estadoDe(m) === 'ANULADO',
};

const ENCABEZADOS = [
  'Fecha', 'Hora', 'Estado', 'Movimiento', 'Número', 'Viaje', 'Conductor', 'Ruta', 'Autoriza', 'Placa', 'Centro de costos', 'Motivo',
  'Sub motivo', 'Tipo persona', 'Persona', 'Moneda', 'Importe total', 'TC', 'Modalidad de pago', 'Cuenta destino', 'Cuenta origen',
  'Comprobante', 'N° factura', 'N° constancia', 'Usuario registro', 'Usuario aprobación',
];

const estadoClase = (e: string) =>
  e === 'ANULADO' ? 'badge--red' : e === 'PROCESADO' || e === 'PAGADO' ? 'oc-estado--verde' : e === 'APROBADO' ? 'oc-estado--azul' : 'oc-estado--gris';
const estadoTexto = (e: string) => (e === 'REGISTRADO' || e === 'PENDIENTE' ? 'POR APROBAR' : e);

/** Columnas de la tabla: el ancho de cada una sale del texto más largo que contiene (con tope), como en Órdenes de compra */
interface Col {
  id: string; titulo: string; min: number; max: number; alinear?: 'left' | 'right' | 'center'; texto: (m: CajaMovimiento) => string; fijo?: number;
  /** Letra del contenido: monoespaciada, negrita o de otro tamaño (px); y el relleno extra de chips o insignias */
  mono?: boolean; bold?: boolean; px?: number; extra?: number;
}
const fechaHora = (m: CajaMovimiento) => `${formatFechaPe(m.fecha)}${m.hora ? ` ${m.hora.slice(0, 5)}` : ''}`;
const COLS: Col[] = [
  { id: 'acciones', titulo: 'Acciones', min: 64, max: 72, alinear: 'center', texto: () => '', fijo: 72 },
  { id: 'fecha', titulo: 'Fecha', min: 100, max: 160, texto: fechaHora, mono: true },
  { id: 'tipo', titulo: 'Movimiento', min: 100, max: 120, texto: m => (m.tipo_movimiento === 'INGRESO' ? 'INGRESO' : 'EGRESO'), extra: 44, bold: true, px: 11 },
  { id: 'caja', titulo: 'N° caja', min: 110, max: 170, texto: m => numeroDoc(m), mono: true, bold: true, px: 15 },
  { id: 'estado', titulo: 'Estado', min: 110, max: 150, alinear: 'center', texto: m => estadoTexto(estadoDe(m)), extra: 26, bold: true, px: 11 },
  { id: 'placa', titulo: 'Placa', min: 84, max: 110, texto: m => m.placa || '', mono: true },
  { id: 'motivo', titulo: 'Motivo', min: 120, max: 460, texto: m => [m.motivo, m.sub_motivo].filter(Boolean).join(' · ') },
  { id: 'persona', titulo: 'Persona / beneficiario', min: 150, max: 420, texto: m => m.persona || m.conductor || '' },
  { id: 'viaje', titulo: 'Orden de viaje', min: 120, max: 160, texto: m => m.orden_viaje || '', mono: true },
  { id: 'creador', titulo: 'Usuario registro', min: 120, max: 210, texto: m => m.usuario_creacion || '' },
  { id: 'autoriza', titulo: 'Autoriza', min: 100, max: 180, texto: m => m.autoriza || '' },
  { id: 'importe', titulo: 'Importe', min: 110, max: 170, alinear: 'right', texto: m => montoCaja(m.importe_total, m.moneda), bold: true },
  { id: 'cc', titulo: 'Centro de costo', min: 120, max: 150, texto: m => m.centro_costo || '', mono: true, extra: 20, px: 11 },
  { id: 'voucher', titulo: 'Voucher', min: 90, max: 110, alinear: 'center', texto: () => 'Ver voucher', fijo: 104 },
  { id: 'sustento', titulo: 'Sustento', min: 96, max: 110, alinear: 'center', texto: () => 'Ver sustento', fijo: 104 },
];

/** Mide el texto con la fuente real de la tabla (canvas): así la columna se ajusta al contenido, no a un cálculo aproximado */
let lienzo: CanvasRenderingContext2D | null = null;
function medir(texto: string, px: number, opciones: { mono?: boolean; bold?: boolean; espaciado?: number }): number {
  try {
    lienzo ??= document.createElement('canvas').getContext('2d');
    if (!lienzo) throw new Error('sin canvas');
    const raiz = getComputedStyle(document.documentElement);
    const familia = opciones.mono ? (raiz.getPropertyValue('--font-mono').trim() || 'monospace') : getComputedStyle(document.body).fontFamily || 'sans-serif';
    lienzo.font = `${opciones.bold ? 700 : 400} ${px}px ${familia}`;
    return lienzo.measureText(texto).width + (opciones.espaciado ?? 0) * texto.length;
  } catch {
    return texto.length * px * 0.58;
  }
}

/** Cada columna mide lo que ocupa su texto más largo (y su título) más el relleno de la celda; solo hay un tope generoso para cuentas muy largas */
function columnasAdaptadas(lista: CajaMovimiento[]): ColumnaTabla[] {
  return COLS.map(c => {
    if (c.fijo) return { id: c.id, titulo: c.titulo, ancho: c.fijo, minimo: c.min, alinear: c.alinear };
    const px = c.px ?? 13;
    const contenido = lista.reduce((mx, m) => Math.max(mx, medir(c.texto(m), px, { mono: c.mono, bold: c.bold })), 0);
    // Título: 11 px en negrita con 0.02em de espaciado, más el asa para redimensionar
    const titulo = medir(c.titulo.toUpperCase(), 11, { bold: true, espaciado: 0.22 }) + 14;
    const ancho = Math.min(c.max, Math.max(c.min, Math.ceil(Math.max(contenido + (c.extra ?? 0), titulo) + 28)));
    return { id: c.id, titulo: c.titulo, ancho, minimo: Math.min(c.min, ancho), alinear: c.alinear };
  });
}

/** Adjunto: enlace si existe; si no, "Subir" (solo cuando ya se puede subir) abre el detalle */
function CeldaAdjunto({ url, texto, tono, puedeSubir, onSubir }: { url?: string; texto: string; tono: 'rojo' | 'azul'; puedeSubir: boolean; onSubir: () => void }) {
  if (url) return <a href={url} target="_blank" rel="noreferrer" className={`oc-adj oc-adj--${tono}`} onClick={e => e.stopPropagation()}>{texto}</a>;
  if (puedeSubir) return <button type="button" className="oc-adj oc-adj--subir" onClick={e => { e.stopPropagation(); onSubir(); }}>Subir</button>;
  return <span style={{ color: 'var(--label-2)' }}>—</span>;
}

// Tesorería › Caja: movimientos de caja con aprobación, documentos y anulación (mismo diseño que Órdenes de compra)
export function CajaPage() {
  const nav = useNavigate();
  const movil = useMediaQuery(MOBILE_QUERY);
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState<Pestana>('todos');
  // Como el clásico: por defecto el mes en curso
  const [desde, setDesde] = useState(inicioMesYMD);
  const [hasta, setHasta] = useState(hoyYMD);
  const [filtrando, setFiltrando] = useState(false);
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<{ mov: CajaMovimiento | null } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setBuscar(busqueda.trim()), 350);
    return () => window.clearTimeout(t);
  }, [busqueda]);

  const { data, isLoading, isError, error } = useCaja({ desde, hasta, buscar });
  const todos = useMemo(() => ordenar(data ?? [], ORDEN_INICIAL), [data]);
  const lista = useMemo(() => todos.filter(PASA[estado]), [todos, estado]);
  const columnas = useMemo(() => columnasAdaptadas(lista), [lista]);
  const abierto = (data ?? []).find(m => m.id === abiertoId) ?? null;
  const puedeCrear = can('tesoreria_caja.crear');
  const puedeEditar = can('tesoreria_caja.editar', 'tesoreria_caja.crear');
  const periodoPorDefecto = desde === inicioMesYMD() && hasta === hoyYMD();
  const filtrosActivos = (estado !== 'todos' ? 1 : 0) + (periodoPorDefecto ? 0 : 1);
  const hayFiltros = !!buscar || filtrosActivos > 0;
  const limpiarFiltros = () => { setBusqueda(''); setEstado('todos'); setDesde(inicioMesYMD()); setHasta(hoyYMD()); };
  const conteo = useMemo(() => ({
    todos: todos.length,
    pendientes: todos.filter(PASA.pendientes).length,
    aprobados: todos.filter(PASA.aprobados).length,
    procesados: todos.filter(PASA.procesados).length,
    anulados: todos.filter(PASA.anulados).length,
  }), [todos]);

  // Ingresos y egresos en soles: los dólares se convierten con su tipo de cambio; los anulados no suman
  const resumen = useMemo(() => {
    const validos = todos.filter(m => estadoDe(m) !== 'ANULADO');
    const ingresos = validos.filter(m => m.tipo_movimiento === 'INGRESO').reduce((s, m) => s + aSoles(m), 0);
    const egresos = validos.filter(m => m.tipo_movimiento !== 'INGRESO').reduce((s, m) => s + aSoles(m), 0);
    return { ingresos, egresos, saldo: ingresos - egresos };
  }, [todos]);

  async function exportar() {
    if (!lista.length) { toast('No hay movimientos para exportar', 'error'); return; }
    try {
      await exportarExcel('Caja', 'Caja', ENCABEZADOS, lista.map(m => [
        formatFechaPe(m.fecha), m.hora?.slice(0, 5) ?? '', estadoDe(m), m.tipo_movimiento ?? '', numeroDoc(m), m.orden_viaje ?? '',
        m.conductor ?? '', m.ruta_viaje ?? '', m.autoriza ?? '', m.placa ?? '', m.centro_costo ?? '', m.motivo ?? '', m.sub_motivo ?? '',
        m.tipo_persona ?? '', m.persona ?? '', m.moneda ?? '', num(m.importe_total), num(m.tipo_cambio), m.modalidad_pago ?? '',
        m.cuenta_bancaria_persona ?? '', m.cuenta_bancaria_empresa ?? '', m.tipo_comprobante ?? '', m.numero_factura ?? '',
        m.numero_constancia_deposito ?? '', m.usuario_creacion ?? '', m.usuario_aprobacion ?? '',
      ]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const refrescar = () => qc.invalidateQueries({ queryKey: ['tesoreria'] });
  const abrir = (m: CajaMovimiento) => { haptic('selection'); setAbiertoId(m.id); };
  const periodo = desde || hasta ? `${desde ? formatFechaPe(desde) : '…'} al ${hasta ? formatFechaPe(hasta) : '…'}` : 'Todas las fechas';

  /** Celda de cada columna (en el orden de COLS) */
  function celdas(m: CajaMovimiento) {
    const ingreso = m.tipo_movimiento === 'INGRESO';
    const est = estadoDe(m);
    const aprobada = ['APROBADO', 'PROCESADO', 'PAGADO'].includes(est);
    const sustento = String(m.sustento_view_url ?? m.sustento_url ?? '');
    const voucher = String(m.voucher_view_url ?? m.voucher_url ?? '');
    const puedeSubir = aprobada && puedeEditar;
    const opciones = [
      { label: 'Ver detalle', icon: <Eye size={17} />, onSelect: () => abrir(m) },
      puedeEditar && esEditable(m) && { label: 'Editar', icon: <Pencil size={17} />, onSelect: () => setFormulario({ mov: m }) },
      puedeSubir && { label: 'Subir documentos', icon: <Upload size={17} />, onSelect: () => abrir(m) },
    ];
    const celdasFila = [
      <Celda key="acc" alinear="center"><MenuOtros soloIcono label="Acciones" opciones={opciones} /></Celda>,
      <Celda key="fecha">{fechaHora(m)}</Celda>,
      <Celda key="tipo">
        <span className="oc-chip" style={{ color: ingreso ? 'var(--green-ink)' : 'var(--red-ink)', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          {ingreso ? <ArrowUpRight size={11} /> : <ArrowDownLeft size={11} />}{ingreso ? 'INGRESO' : 'EGRESO'}
        </span>
      </Celda>,
      <Celda key="caja"><button type="button" className="oc-codigo" onClick={() => abrir(m)} title="Ver detalle">{numeroDoc(m) || '—'}</button></Celda>,
      <Celda key="estado" alinear="center"><span className={`badge ${estadoClase(est)}`} style={{ whiteSpace: 'nowrap' }}>{estadoTexto(est)}</span></Celda>,
      <Celda key="persona">{m.persona || m.conductor || '—'}</Celda>,
      <Celda key="motivo">{[m.motivo, m.sub_motivo].filter(Boolean).join(' · ') || '—'}</Celda>,
      <Celda key="placa" mono>{m.placa || '—'}</Celda>,
      <Celda key="viaje" mono>{m.orden_viaje || '—'}</Celda>,
      <Celda key="cc"><span className="oc-chip oc-chip--mono">{m.centro_costo || '—'}</span></Celda>,
      <Celda key="importe" alinear="right">
        <strong className="oc-importe" style={{ color: ingreso ? 'var(--green-ink)' : undefined }}>{ingreso ? '+' : '-'}{montoCaja(m.importe_total, m.moneda)}</strong>
      </Celda>,
      <Celda key="creador">{m.usuario_creacion || '—'}</Celda>,
      <Celda key="autoriza">{m.autoriza || '—'}</Celda>,
      <Celda key="sustento" alinear="center"><CeldaAdjunto url={sustento} texto="Ver sustento" tono="azul" puedeSubir={puedeSubir} onSubir={() => abrir(m)} /></Celda>,
      <Celda key="voucher" alinear="center"><CeldaAdjunto url={voucher} texto="Ver voucher" tono="rojo" puedeSubir={puedeSubir} onSubir={() => abrir(m)} /></Celda>,
    ];
    const clave = (id: string) => (id === 'acciones' ? 'acc' : id);
    const posicion = (e: { key: string | null }) => COLS.findIndex(c => clave(c.id) === e.key);
    return celdasFila.sort((x, y) => posicion(x) - posicion(y));
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Caja"
        subtitle={isLoading ? 'Cargando…' : `${todos.length} ${todos.length === 1 ? 'movimiento' : 'movimientos'}${conteo.pendientes ? ` · ${conteo.pendientes} por aprobar` : ''} · ${periodo}`}
        actions={
          <>
            <div className="oc-acciones oc-acciones--sinfondo">
              <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--verde" data-tip="Exportar a Excel" aria-label="Exportar a Excel" onClick={exportar}>
                <FileSpreadsheet size={17} />
              </button>
              <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--azul" data-tip="Bancos" aria-label="Bancos" onClick={() => nav('/tesoreria/bancos')}>
                <Banknote size={17} />
              </button>
              <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--violeta" data-tip="Centros de costos" aria-label="Centros de costos" onClick={() => nav('/tesoreria/centros-costos')}>
                <Boxes size={17} />
              </button>
              <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--celeste" data-tip="Actualizar" aria-label="Actualizar" onClick={() => { void refrescar(); }}>
                <RefreshCw size={17} />
              </button>
            </div>
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ mov: null })}>Nuevo movimiento</Button>}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div>
          <div className="inv-kpis" style={{ marginBottom: 'var(--s-4)' }}>
            <KpiTarjeta etiqueta="Ingresos" valor={formatSoles(resumen.ingresos)} sub="En soles, sin anulados" icono={<ArrowUpRight size={18} />} />
            <KpiTarjeta etiqueta="Egresos" valor={formatSoles(resumen.egresos)} sub="En soles, sin anulados" icono={<Coins size={18} />} tono="valor" />
            <KpiTarjeta etiqueta="Saldo" valor={formatSoles(resumen.saldo)} sub="Ingresos − egresos" icono={<ClipboardList size={18} />} />
            <KpiTarjeta etiqueta="Por aprobar" valor={String(conteo.pendientes)} sub="Estado por aprobar" icono={<CircleCheck size={18} />} tono="warning" />
          </div>

          <div style={{ marginBottom: 'var(--s-4)' }}>
            <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Persona, motivo, N°, placa u orden de viaje"
              activos={filtrosActivos} onAbrirFiltros={() => setFiltrando(true)}>
              <span className="badge">{lista.length} {lista.length === 1 ? 'registro' : 'registros'}</span>
            </BarraFiltros>
            <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={filtrosActivos} resultado={lista.length} unidad="registro"
              onLimpiar={() => { setEstado('todos'); setDesde(inicioMesYMD()); setHasta(hoyYMD()); }}>
              <GrupoFiltro titulo="Fechas">
                <div className="oc-fechas">
                  <TextInput type="date" aria-label="Desde" value={desde} max={hasta || undefined} onChange={ev => setDesde(ev.target.value)} />
                  <span className="t-footnote c-secondary">a</span>
                  <TextInput type="date" aria-label="Hasta" value={hasta} min={desde || undefined} onChange={ev => setHasta(ev.target.value)} />
                  <button type="button" className="oc-cotizacion__quitar" aria-label="Quitar fechas" onClick={() => { setDesde(''); setHasta(''); }}>×</button>
                </div>
              </GrupoFiltro>
              <GrupoFiltro titulo="Estado del movimiento">
                <ChoiceChips label="Estado del movimiento" value={estado} onChange={v => setEstado(v as Pestana)} options={[
                  { value: 'todos', label: `Todos (${conteo.todos})` }, { value: 'pendientes', label: `Por aprobar (${conteo.pendientes})` },
                  { value: 'aprobados', label: `Aprobados (${conteo.aprobados})` }, { value: 'procesados', label: `Procesados (${conteo.procesados})` },
                  { value: 'anulados', label: `Anulados (${conteo.anulados})` },
                ]} />
              </GrupoFiltro>
            </HojaFiltros>
          </div>

          {lista.length === 0 ? (
            <EmptyState icon={hayFiltros ? <SearchX size={22} /> : <Wallet size={22} />} title={hayFiltros ? 'Ningún movimiento coincide' : 'Sin movimientos en este periodo'}>
              {hayFiltros
                ? <button type="button" className="placas-limpiar" onClick={limpiarFiltros}>Quitar filtros</button>
                : puedeCrear ? <>Registra el primero con <strong>Nuevo movimiento</strong>.</> : 'Prueba con un periodo más amplio.'}
            </EmptyState>
          ) : movil ? (
            <div className="tarjeta__lista">
              {lista.map(m => {
                const ingreso = m.tipo_movimiento === 'INGRESO';
                const est = estadoDe(m);
                return (
                  <button key={m.id} type="button" className="mov-fila pressable" onClick={() => abrir(m)}>
                    <div className="mov-fila__icon" style={{ background: ingreso ? 'var(--green-tint)' : 'var(--red-tint)', color: ingreso ? 'var(--green-ink)' : 'var(--red-ink)' }}>
                      {ingreso ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                    </div>
                    <div className="mov-fila__cuerpo">
                      <span className="mov-fila__titulo">{m.persona || m.sub_motivo || m.motivo || 'Movimiento'}</span>
                      <span className="mov-fila__sub">{[numeroDoc(m), m.motivo, m.orden_viaje, m.placa, formatFechaPe(m.fecha)].filter(Boolean).join(' · ')}</span>
                    </div>
                    <div className="mov-fila__derecha">
                      <span className="mov-fila__monto" style={{ color: ingreso ? 'var(--green-ink)' : undefined }}>{ingreso ? '+' : '-'}{montoCaja(m.importe_total, m.moneda)}</span>
                      <span className={`badge ${estadoClase(est)}`}>{estadoTexto(est)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <TablaRedimensionable id="tesoreria-caja-v2" columnas={columnas} ariaLabel="Movimientos de caja" altoMax="68vh">
              {lista.map(m => <tr key={m.id} className={estadoDe(m) === 'ANULADO' ? 'mov-tabla-anulada' : undefined}>{celdas(m)}</tr>)}
            </TablaRedimensionable>
          )}
        </div>
      )}

      <DetalleCaja mov={abierto} onClose={() => setAbiertoId(null)} onEditar={m => setFormulario({ mov: m })} onCambio={refrescar} />
      <FormularioCaja open={!!formulario} mov={formulario?.mov ?? null} onClose={() => setFormulario(null)} onGuardado={refrescar} />
    </Page>
  );
}
