import '../../core/ui/acciones-iconos.css';
import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, ClipboardList, Coins, Eye, FileDown, FileSpreadsheet, FileText, PackageCheck, PackageMinus, Plus, RefreshCw, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { KpiTarjeta } from '../../core/ui/KpiTarjeta';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { MenuOtros, type OpcionOtros } from '../../core/ui/MenuOtros';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { MOBILE_QUERY, useMediaQuery } from '../../core/lib/useMediaQuery';
import { ApiError, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { descargarArchivo } from '../../core/lib/pdf';
import { exportarExcel } from '../../core/lib/excel';
import { formatFechaPe, formatSoles } from '../../core/lib/format';
import { hoyLima } from './entradaReglas';
import {
  anularSalida, despacharSalida, eliminarSalida, estadoSalida, TIPO_ORDEN_AJUSTE,
  useInventario, useSalidas, type EstadoSalida, type ItemSalida, type SalidaInv,
} from './api';
import { SalidaFormulario } from './SalidaFormulario';
import { SinStockDialogo, sinStockDe, type ArticuloSinStock } from './SinStockDialogo';
import { nombreSolicitante, SalidaDetalle } from './SalidaDetalle';
import { AnularDialogo, DespacharDialogo } from './SalidaDialogos';
import { pdfSalida } from './salidaPdf';
import './salidas.css';
import './entradas.css';
import './almacen.css';

// Órdenes de salida: pestañas Pendientes / Despachadas / Anuladas, búsqueda y filtros, detalle con
// despacho parcial, anulación, edición, comprobante PDF y exportación a Excel (mismo flujo que el clásico).

type Pestana = 'pend' | 'desp' | 'anulado';
type FiltroEstado = 'todas' | Pestana;
/** Por defecto una fila por salida (sin duplicados); «Por artículo» muestra cada artículo, igual que en Órdenes de compra */
type Vista = 'salidas' | 'articulos';
const POR_PAGINA = 20;
const ESTADO_DE_PESTANA: Record<Pestana, EstadoSalida> = { pend: 'Pendiente', desp: 'Despachado', anulado: 'Anulado' };

const COLUMNAS: ColumnaTabla[] = [
  { id: 'acciones', titulo: 'Acciones', ancho: 72, minimo: 64, alinear: 'center' },
  { id: 'fecha', titulo: 'Fecha', ancho: 110 },
  { id: 'tipo', titulo: 'Tipo de orden', ancho: 140 },
  { id: 'folio', titulo: 'N° de salida', ancho: 140 },
  { id: 'estado', titulo: 'Estado', ancho: 120, alinear: 'center' },
  { id: 'ot', titulo: 'N° OT', ancho: 130 },
  { id: 'placa', titulo: 'Placa', ancho: 96 },
  { id: 'responsable', titulo: 'Responsable', ancho: 210 },
  { id: 'codigo', titulo: 'Cód. art.', ancho: 104 },
  { id: 'articulo', titulo: 'Artículo', ancho: 260 },
  { id: 'cant', titulo: 'Cant.', ancho: 76, alinear: 'right' },
  { id: 'costo', titulo: 'Costo unit.', ancho: 104, alinear: 'right' },
  { id: 'total', titulo: 'Total (S/)', ancho: 120, alinear: 'right' },
];

/** Mismo día del mes anterior (28/10 → 28/09); si el mes anterior es más corto, el último día de ese mes */
function mesAtras(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const anio = m === 1 ? y - 1 : y;
  const mes = m === 1 ? 12 : m - 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

/** Descripción sin el código del artículo al inicio (como el clásico) */
function descripcionLimpia(desc: string | null | undefined, invId: string | null | undefined): string {
  if (!desc) return '—';
  if (invId && desc.indexOf(`${invId} — `) === 0) return desc.slice(invId.length + 3);
  const m = desc.match(/^[A-Z0-9]+-\d+\s*—\s*(.*)/i);
  return m ? m[1] : desc;
}

const fechaCorta = (s: SalidaInv) => formatFechaPe(s.fecha);
const soloFecha = (s: SalidaInv) => (s.fecha ? String(s.fecha).split('T')[0] : '');
const cantidad = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 3 });

export function SalidasPage() {
  const { data, isLoading, isError, error, refetch } = useSalidas();
  const { data: inventario } = useInventario();
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const movil = useMediaQuery(MOBILE_QUERY);

  const puedeCrear = can('sal_inv.crear');
  const puedeEditar = can('sal_inv.editar');
  const puedeEliminar = can('sal_inv.eliminar');

  const salidas = useMemo(() => data ?? [], [data]);
  const articulos = inventario ?? [];

  const [estadoFiltro, setEstadoFiltro] = useState<FiltroEstado>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [desde, setDesde] = useState(() => mesAtras(hoyLima()));
  const [hasta, setHasta] = useState(() => hoyLima());
  const [vista, setVista] = useState<Vista>('salidas');
  const [pagina, setPagina] = useState(1);

  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const [formulario, setFormulario] = useState<{ salida: SalidaInv | null } | null>(null);
  const [despacho, setDespacho] = useState<{ id: number; itemIds: number[]; mensaje: ReactNode } | null>(null);
  const [despachando, setDespachando] = useState(false);
  const [sinStock, setSinStock] = useState<ArticuloSinStock[] | null>(null);
  const [anulandoId, setAnulandoId] = useState<number | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [porEliminar, setPorEliminar] = useState<SalidaInv | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const usuario = user?.name || 'Almacén';
  const refrescar = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['almacen', 'salidas'] }),
    qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] }),
  ]);

  /** Salidas del rango de fechas y la búsqueda (sin el filtro de estado: sirve para los conteos del selector) */
  const delRango = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return salidas.filter(s => {
      const fecha = soloFecha(s);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      if (q) {
        const texto = [s.id, s.ticket_ot, s.placa, s.responsable, nombreSolicitante(s.creado_por), (s.items ?? []).map(i => `${i.inventario_id ?? ''} ${i.descripcion ?? ''}`).join(' ')].join(' ').toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });
  }, [salidas, busqueda, desde, hasta]);

  const conteoRango = useMemo(() => {
    const c = { todas: delRango.length, pend: 0, desp: 0, anulado: 0 };
    for (const s of delRango) {
      const e = estadoSalida(s);
      if (e === 'Pendiente') c.pend++; else if (e === 'Despachado') c.desp++; else c.anulado++;
    }
    return c;
  }, [delRango]);

  const filtradas = useMemo(
    () => (estadoFiltro === 'todas' ? delRango : delRango.filter(s => estadoSalida(s) === ESTADO_DE_PESTANA[estadoFiltro])),
    [delRango, estadoFiltro],
  );

  const kpis = useMemo(() => {
    const ots = new Set<string>();
    let monto = 0;
    for (const s of filtradas) {
      if (estadoSalida(s) === 'Anulado') continue;
      monto += Number(s.total_pen) || 0;
      const ot = String(s.ticket_ot ?? '').trim();
      if (ot) ots.add(ot);
    }
    return { total: filtradas.length, monto, ots: ots.size };
  }, [filtradas]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pag = Math.min(pagina, totalPaginas);
  const visiblesPagina = filtradas.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);

  const detalle = detalleId == null ? null : salidas.find(s => s.id === detalleId) ?? null;
  const salidaAnulando = anulandoId == null ? null : salidas.find(s => s.id === anulandoId) ?? null;

  /** Filas de artículos a mostrar: si la búsqueda coincide solo con artículos, se muestran esos (como el clásico) */
  function itemsVisibles(s: SalidaInv): ItemSalida[] {
    const items = s.items ?? [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return items;
    const cabecera = [s.id, s.ticket_ot, s.placa, s.responsable].join(' ').toLowerCase();
    if (cabecera.includes(q)) return items;
    return items.filter(i => `${i.inventario_id ?? ''} ${i.descripcion ?? ''}`.toLowerCase().includes(q));
  }

  function abrirDetalle(s: SalidaInv) {
    haptic('selection');
    setDetalleId(s.id);
    setDetalleAbierto(true);
  }

  function cambiarEstado(e: FiltroEstado) {
    setEstadoFiltro(e);
    setPagina(1);
  }

  function limpiarFiltros() {
    setBusqueda(''); setDesde(''); setHasta(''); setEstadoFiltro('todas'); setPagina(1);
  }

  /** Opciones del menú de acciones de una fila */
  function menuDe(s: SalidaInv): Array<OpcionOtros | false | null | undefined> {
    return [
      { label: 'Ver detalle', icon: <Eye size={17} />, onSelect: () => abrirDetalle(s) },
      { label: 'Imprimir PDF', icon: <FileDown size={17} />, onSelect: () => { void pdf(s, false); } },
      estadoSalida(s) === 'Pendiente' && puedeEliminar && { label: 'Anular', icon: <Trash2 size={17} />, destructiva: true, separado: true, onSelect: () => setAnulandoId(s.id) },
    ];
  }

  // ─── Acciones ──────────────────────────────────────────────────────────────

  async function confirmarDespacho() {
    if (!despacho) return;
    setDespachando(true);
    try {
      const r = await despacharSalida(despacho.id, despacho.itemIds, usuario);
      toast(r.parcial && r.nuevo_pendiente_id
        ? `Salida ${despacho.id} despachada. Los ítems pendientes quedaron en la salida ${r.nuevo_pendiente_id}.`
        : `Salida ${despacho.id} despachada con éxito — stock descontado.`);
      haptic('success');
      setDespacho(null);
      await refrescar();
    } catch (err) {
      // Sin existencias: aviso con los artículos y las compras que faltan recepcionar
      const faltantes = err instanceof ApiError ? sinStockDe(err.data) : null;
      if (faltantes) { haptic('warning'); setDespacho(null); setSinStock(faltantes); } else toast(errorMessage(err), 'error');
    } finally {
      setDespachando(false);
    }
  }

  async function confirmarAnulacion(motivo: string) {
    if (anulandoId == null) return;
    setAnulando(true);
    try {
      await anularSalida(anulandoId, motivo, usuario);
      toast(`Salida ${anulandoId} anulada correctamente.`);
      haptic('success');
      setAnulandoId(null);
      await refrescar();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setAnulando(false);
    }
  }

  async function confirmarEliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await eliminarSalida(porEliminar.id);
      toast('Salida eliminada');
      haptic('success');
      if (detalleId === porEliminar.id) setDetalleAbierto(false);
      setPorEliminar(null);
      await refrescar();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setEliminando(false);
    }
  }

  /** Comprobante: se descarga o se abre en otra pestaña (la pestaña se abre antes para que el navegador no la bloquee) */
  async function pdf(s: SalidaInv, vistaPrevia: boolean) {
    const ventana = vistaPrevia ? window.open('', '_blank') : null;
    try {
      const blob = await pdfSalida(s);
      if (vistaPrevia && ventana) {
        const url = URL.createObjectURL(blob);
        ventana.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        ventana?.close();
        descargarArchivo(blob, `Salida_${s.id}.pdf`);
      }
    } catch (err) {
      ventana?.close();
      toast(errorMessage(err), 'error');
    }
  }

  function exportar() {
    const datos = filtradas.length > 0 ? filtradas : salidas;
    if (!datos.length) { toast('No hay datos para exportar', 'error'); return; }
    const filas: Array<Array<string | number | null>> = [];
    for (const s of datos) {
      const items = s.items ?? [];
      const estado = estadoSalida(s);
      if (!items.length) {
        filas.push([s.id, soloFecha(s), s.ticket_ot ?? '', s.placa ?? '', s.responsable ?? '', '', 'Sin artículos', null, null, estado]);
        continue;
      }
      for (const it of items) {
        filas.push([s.id, soloFecha(s), s.ticket_ot ?? '', s.placa ?? '', s.responsable ?? '', it.inventario_id ?? '',
          descripcionLimpia(it.descripcion, it.inventario_id), Number(it.cantidad) || 0, Number(Number(it.costo_unitario || 0).toFixed(2)), estado]);
      }
    }
    void exportarExcel('Almacen_Salidas', 'Salidas',
      ['ID Solicitud', 'Fecha', 'N° OT', 'Placa', 'Responsable', 'Código', 'Artículo', 'Cantidad', 'Costo Unit.', 'Estado'], filas)
      .catch(err => toast(errorMessage(err), 'error'));
  }

  const subtitulo = isLoading ? 'Cargando…' : `${salidas.length} salidas registradas${conteoRango.pend ? ` · ${conteoRango.pend} pendientes` : ''}`;

  return (
    <Page>
      <PageHeader
        eyebrow="Almacén"
        title="Salidas"
        subtitle={subtitulo}
        actions={
          <>
            <div className="oc-acciones oc-acciones--sinfondo">
              <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--verde" data-tip="Exportar a Excel" aria-label="Exportar a Excel" onClick={exportar}>
                <FileSpreadsheet size={17} />
              </button>
              <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--celeste" data-tip="Actualizar" aria-label="Actualizar" onClick={() => { void refetch(); }}>
                <RefreshCw size={17} />
              </button>
            </div>
            {puedeCrear && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ salida: null })}>
                Nueva salida
              </Button>
            )}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : salidas.length === 0 ? (
        <EmptyState icon={<PackageMinus size={22} />} title="Sin salidas registradas">
          {puedeCrear ? <>Registra la primera salida con <strong>Nueva salida</strong>.</> : 'Cuando se registren salidas, aparecerán aquí.'}
        </EmptyState>
      ) : (
        <div>
          {/* Totales del filtro */}
          <div className="inv-kpis" style={{ marginBottom: 'var(--s-4)' }}>
            <KpiTarjeta etiqueta="Salidas" valor={String(kpis.total)} sub="Del filtro seleccionado" icono={<ClipboardList size={18} />} />
            <KpiTarjeta etiqueta="Monto total (S/)" valor={formatSoles(kpis.monto)} sub="Sin contar anuladas" icono={<Coins size={18} />} tono="valor" />
            <KpiTarjeta etiqueta="Pendientes" valor={String(conteoRango.pend)} sub="Por despachar" icono={<CircleCheck size={18} />} tono="warning"
              onClick={() => cambiarEstado(estadoFiltro === 'pend' ? 'todas' : 'pend')} activo={estadoFiltro === 'pend'} />
            <KpiTarjeta etiqueta="OTs atendidas" valor={String(kpis.ots)} sub="En el filtro" icono={<PackageCheck size={18} />} />
          </div>

          {/* Filtros: todo en una sola fila, igual que Órdenes de compra */}
          <div className="oc-filtros" style={{ marginBottom: 'var(--s-4)' }}>
            <SearchField value={busqueda} onChange={v => { setBusqueda(v); setPagina(1); }} placeholder="Folio, placa, OT, responsable o artículo" />
            <div className="oc-filtros__fila">
              <div className="oc-fechas">
                <TextInput type="date" aria-label="Desde" value={desde} onChange={ev => { setDesde(ev.target.value); setPagina(1); }} />
                <span className="t-footnote c-secondary">a</span>
                <TextInput type="date" aria-label="Hasta" value={hasta} onChange={ev => { setHasta(ev.target.value); setPagina(1); }} />
                <button type="button" className="oc-cotizacion__quitar" aria-label="Quitar fechas" onClick={() => { setDesde(''); setHasta(''); setPagina(1); }}>×</button>
              </div>
              <SegmentedControl<Vista> label="Ver por" value={vista} onChange={v => { setVista(v); setPagina(1); }}
                options={[{ value: 'salidas', label: 'Por salida' }, { value: 'articulos', label: 'Por artículo' }]} />
              <SelectInput aria-label="Estado de la salida" value={estadoFiltro} onChange={ev => cambiarEstado(ev.target.value as FiltroEstado)} style={{ width: 'auto' }}>
                <option value="todas">Todas ({conteoRango.todas})</option>
                <option value="pend">Pendientes ({conteoRango.pend})</option>
                <option value="desp">Despachadas ({conteoRango.desp})</option>
                <option value="anulado">Anuladas ({conteoRango.anulado})</option>
              </SelectInput>
              <span className="badge" style={{ marginLeft: 'auto' }}>
                {filtradas.length} {filtradas.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>
          </div>

          {filtradas.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Ninguna salida coincide">
              <button type="button" className="placas-limpiar" onClick={limpiarFiltros}>Quitar filtros</button>
            </EmptyState>
          ) : movil ? (
            <div className="sal-tarjetas">
              {visiblesPagina.map(s => {
                const items = itemsVisibles(s);
                const estado = estadoSalida(s);
                const cant = (s.items ?? []).reduce((a, i) => a + (Number(i.cantidad) || 0), 0);
                return (
                  <article key={s.id} className="sal-tarjeta">
                    <button type="button" className="sal-tarjeta__cuerpo pressable" onClick={() => abrirDetalle(s)}>
                      <div className="sal-tarjeta__cabeza">
                        <span className="sal-tarjeta__folio">{s.id}</span>
                        <span className="sal-tarjeta__fecha">{fechaCorta(s)}</span>
                        <EstadoBadge estado={estado} />
                      </div>
                      <div className="sal-tarjeta__chips">
                        {s.placa && <span className="badge">{s.placa}</span>}
                        {s.ticket_ot && <span className="badge badge--accent">{s.ticket_ot}</span>}
                        <TipoOrdenBadge tipo={s.tipo_orden} />
                      </div>
                      <span className="sal-tarjeta__responsable">{s.responsable || 'Sin responsable'}</span>
                      <span className="sal-tarjeta__sub">Solicitante: {nombreSolicitante(s.creado_por)}</span>
                      {s.observaciones && <span className="sal-tarjeta__obs">{s.observaciones}</span>}
                      <div className="sal-tarjeta__pie">
                        <span className="sal-tarjeta__resumen">{items.length} {items.length === 1 ? 'artículo' : 'artículos'} · {cantidad(cant)} u.</span>
                        <span className="sal-tarjeta__monto">{formatSoles(s.total_pen ?? 0)}</span>
                      </div>
                    </button>
                    <div className="sal-tarjeta__acciones">
                      <Button size="sm" variant="secondary" icon={<FileText size={14} />} onClick={() => pdf(s, false)}>PDF</Button>
                      {estado === 'Pendiente' && puedeEliminar && (
                        <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => { setAnulandoId(s.id); }}>Anular</Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <TablaRedimensionable id="almacen-salidas" columnas={COLUMNAS} ariaLabel="Salidas de almacén" altoMax="68vh">
              {visiblesPagina.flatMap(s => {
                const estado = estadoSalida(s);
                const items = itemsVisibles(s);
                const todos = s.items ?? [];
                const cantTotal = todos.reduce((a, i) => a + (Number(i.cantidad) || 0), 0);
                const cabecera = [
                  <Celda key="acc" alinear="center"><MenuOtros soloIcono label="Acciones" opciones={menuDe(s)} /></Celda>,
                  <Celda key="fecha">{fechaCorta(s)}</Celda>,
                  <Celda key="tipo"><TipoOrdenBadge tipo={s.tipo_orden} /></Celda>,
                  <Celda key="folio"><button type="button" className="oc-codigo" onClick={() => abrirDetalle(s)} title="Ver detalle">{s.id}</button></Celda>,
                  <Celda key="estado" alinear="center"><EstadoBadge estado={estado} /></Celda>,
                  <Celda key="ot" mono>{s.ticket_ot || '—'}</Celda>,
                  <Celda key="placa" mono>{s.placa || '—'}</Celda>,
                  <Celda key="resp"><span className="sal-resp">{s.responsable || '—'}</span><span className="sal-sub">{nombreSolicitante(s.creado_por)}</span></Celda>,
                ];
                const total = <Celda key="total" alinear="right"><strong className="oc-importe">{formatSoles(s.total_pen ?? 0)}</strong></Celda>;

                if (vista === 'salidas') {
                  const primera = todos[0] ? descripcionLimpia(todos[0].descripcion, todos[0].inventario_id) : '';
                  const descripcion = todos.length === 0 ? 'Sin artículos' : todos.length === 1 ? primera : `${primera} · +${todos.length - 1} más`;
                  return [(
                    <tr key={s.id}>
                      {cabecera}
                      <Celda key="codigo">{todos.length} {todos.length === 1 ? 'ítem' : 'ítems'}</Celda>
                      <Celda key="articulo">{descripcion}</Celda>
                      <Celda key="cant" alinear="right">{cantidad(cantTotal)} u.</Celda>
                      <Celda key="costo" alinear="right">—</Celda>
                      {total}
                    </tr>
                  )];
                }

                // Por artículo: una fila por artículo de la salida (con la búsqueda aplicada a los artículos)
                if (!items.length) {
                  return [(
                    <tr key={`${s.id}-0`}>
                      {cabecera}
                      <Celda key="codigo" mono>—</Celda>
                      <Celda key="articulo">Sin artículos</Celda>
                      <Celda key="cant" alinear="right">—</Celda>
                      <Celda key="costo" alinear="right">—</Celda>
                      {total}
                    </tr>
                  )];
                }
                return items.map((it, i) => (
                  <tr key={`${s.id}-${it.id ?? i}-${i}`}>
                    {cabecera}
                    <Celda key="codigo" mono>{it.inventario_id || '—'}</Celda>
                    <Celda key="articulo">{descripcionLimpia(it.descripcion, it.inventario_id)}</Celda>
                    <Celda key="cant" alinear="right">{cantidad(Number(it.cantidad) || 0)}</Celda>
                    <Celda key="costo" alinear="right">{formatSoles(Number(it.costo_unitario) || 0)}</Celda>
                    {total}
                  </tr>
                ));
              })}
            </TablaRedimensionable>
          )}

          {filtradas.length > POR_PAGINA && (
            <nav className="sal-paginacion" aria-label="Páginas" style={{ marginTop: 'var(--s-3)' }}>
              <Button size="sm" variant="secondary" disabled={pag <= 1} onClick={() => setPagina(pag - 1)}>‹ Anterior</Button>
              <span className="sal-paginacion__pos">Pág. <b>{pag}</b> / {totalPaginas}</span>
              <Button size="sm" variant="secondary" disabled={pag >= totalPaginas} onClick={() => setPagina(pag + 1)}>Siguiente ›</Button>
            </nav>
          )}
        </div>
      )}

      {detalle && (
        <SalidaDetalle
          open={detalleAbierto}
          onClose={() => setDetalleAbierto(false)}
          salida={detalle}
          inventario={articulos}
          puedeEditar={puedeEditar}
          puedeEliminar={puedeEliminar}
          onDespachar={sel => { setDespacho({ id: sel.id, itemIds: sel.itemIds, mensaje: sel.mensaje }); setDetalleAbierto(false); }}
          onPdf={() => pdf(detalle, false)}
          onVistaPrevia={() => pdf(detalle, true)}
          onEditar={() => { setDetalleAbierto(false); setFormulario({ salida: detalle }); }}
          onAnular={() => { setDetalleAbierto(false); setAnulandoId(detalle.id); }}
          onEliminar={() => setPorEliminar(detalle)}
        />
      )}

      <SalidaFormulario
        open={!!formulario}
        salida={formulario?.salida ?? null}
        onClose={() => setFormulario(null)}
        onGuardado={() => {
          setFormulario(null);
          void refrescar();
        }}
      />

      <DespacharDialogo
        open={!!despacho}
        mensaje={despacho?.mensaje ?? ''}
        cargando={despachando}
        onClose={() => setDespacho(null)}
        onConfirmar={confirmarDespacho}
      />

      <SinStockDialogo articulos={sinStock} onClose={() => setSinStock(null)} alDespachar />

      <AnularDialogo
        open={anulandoId != null}
        folio={salidaAnulando ? String(salidaAnulando.id) : ''}
        cargando={anulando}
        onClose={() => !anulando && setAnulandoId(null)}
        onConfirmar={confirmarAnulacion}
      />

      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !eliminando && setPorEliminar(null)}
        onConfirm={confirmarEliminar}
        loading={eliminando}
        title={`¿Eliminar salida #${porEliminar?.id}?`}
        message="Se eliminará la salida y el stock volverá a su valor anterior."
        confirmLabel="Eliminar"
      />
    </Page>
  );
}

// ─── Piezas pequeñas ───────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: EstadoSalida }) {
  if (estado === 'Despachado') return <Badge tone="green">Despachado</Badge>;
  if (estado === 'Anulado') return <Badge tone="red">Anulado</Badge>;
  return <Badge tone="amber">Pendiente</Badge>;
}

function TipoOrdenBadge({ tipo }: { tipo: string | null | undefined }) {
  return tipo === TIPO_ORDEN_AJUSTE
    ? <Badge tone="amber">Ajuste (resta)</Badge>
    : <Badge tone="accent">Orden de salida</Badge>;
}
