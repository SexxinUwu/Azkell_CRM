import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, ClipboardList, Coins, CreditCard, Download, Eye, FileSpreadsheet, FileDown, Package, PackagePlus, Pencil, Plus, Paperclip, RefreshCw, SearchX, Trash2, Upload } from 'lucide-react';
import { exportarConsolidadoOC, exportarDetalleArticulosOC, descargarPlantillaEntradas } from './exportarEntradas';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, TextInput } from '../../core/ui/Field';
import { KpiTarjeta } from '../../core/ui/KpiTarjeta';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { MenuOtros, type OpcionOtros } from '../../core/ui/MenuOtros';
import { TablaRedimensionable, Celda, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { descargarArchivo } from '../../core/lib/pdf';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { formatFechaPe, formatMoneda, formatSoles } from '../../core/lib/format';
import {
  anularEntrada, eliminarEntrada, useEmpresaDocumentos, useEntradas, useInventario,
  type EntradaInv, type ItemEntrada,
} from './api';
import {
  categoriaEstado, codigoLimpio, descripcionArticulo, etiquetaEstado, esServicio, filtrarOrdenes, hoyLima, itemsVisibles, kpisOrdenes,
  cabeceraCoincide, estadoEditable, estadoPagable, esCredito, type FiltroEstado, type TonoEstado,
} from './entradaReglas';
import { EntradaFormulario } from './EntradaFormulario';
import { EntradaDetalle } from './EntradaDetalle';
import { AdjuntosEntradaSheet } from './AdjuntosEntradaSheet';
import { ConfirmarPagoSheet } from './ConfirmarPagoSheet';
import { ImportarEntradasSheet } from './ImportarEntradasSheet';
import { generarPdfOrdenCompra, ordenDesdeEntrada } from './ordenCompraPdf';
import './entradas.css';
import './almacen.css';

/** Permisos para aprobar (V°B°): el mismo acceso que el menú de Aprobación de O/C (gerencia) o su módulo de aprobación */
const POR_PAGINA = 20;
/** Desde esta anchura se muestra la tabla; antes, tarjetas (como el clásico: d-md-none / d-none d-md-block) */
const TABLA_QUERY = '(min-width: 768px)';

type Vista = 'articulos' | 'ordenes';

const COLUMNAS: ColumnaTabla[] = [
  { id: 'acciones', titulo: 'Acciones', ancho: 72, minimo: 64, alinear: 'center' },
  { id: 'fecha', titulo: 'Fecha', ancho: 110 },
  { id: 'tipo', titulo: 'Tipo de orden', ancho: 140 },
  { id: 'orden', titulo: 'Orden de compra', ancho: 130 },
  { id: 'estado', titulo: 'Estado', ancho: 120, alinear: 'center' },
  { id: 'placa', titulo: 'Placa', ancho: 96 },
  { id: 'motivo', titulo: 'Motivo', ancho: 180 },
  { id: 'proveedor', titulo: 'Proveedor', ancho: 210 },
  { id: 'codigo', titulo: 'Cód. art.', ancho: 104 },
  { id: 'articulo', titulo: 'Artículo', ancho: 220 },
  { id: 'cant', titulo: 'Cant.', ancho: 76, alinear: 'right' },
  { id: 'costo', titulo: 'Costo unit.', ancho: 104, alinear: 'right' },
  { id: 'total_oc', titulo: 'Total O.C.', ancho: 120, alinear: 'right' },
  { id: 'total_soles', titulo: 'Total (S/)', ancho: 120, alinear: 'right' },
  { id: 'cc', titulo: 'Centro de costo', ancho: 130 },
  { id: 'voucher', titulo: 'Voucher', ancho: 104, alinear: 'center' },
  { id: 'cotizacion', titulo: 'Cotización', ancho: 110, alinear: 'center' },
  { id: 'factura', titulo: 'Factura', ancho: 100, alinear: 'center' },
];

const TONO_CLASE: Record<TonoEstado, string> = { gray: 'oc-estado--gris', green: 'oc-estado--verde', sky: 'oc-estado--azul', amber: 'badge--amber', red: 'badge--red' };

function EstadoBadge({ estado }: { estado: string | null }) {
  const e = etiquetaEstado(estado);
  return <span className={`badge ${TONO_CLASE[e.tono]}`.trim()}>{e.texto}</span>;
}

/** Mismo día del mes anterior (28/10 → 28/09); si el mes anterior es más corto, el último día de ese mes */
function mesAtras(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const anio = m === 1 ? y - 1 : y;
  const mes = m === 1 ? 12 : m - 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

/** Importe en la moneda de la orden; si falta, se calcula desde el total en soles */
function totalOrden(o: EntradaInv): number {
  if (o.total_oc != null) return Number(o.total_oc) || 0;
  const tc = Number(o.tipo_cambio) || 0;
  return o.moneda === 'USD' && tc > 0 ? (Number(o.total_pen) || 0) / tc : (Number(o.total_pen) || 0);
}

/** Adjunto: enlace si existe; si no, "Subir" abre la hoja de adjuntos */
function CeldaAdjunto({ url, texto, tono, onSubir }: { url?: string | null; texto: string; tono: 'rojo' | 'azul' | 'verde'; onSubir: () => void }) {
  return url
    ? <a href={url} target="_blank" rel="noreferrer" className={`oc-adj oc-adj--${tono}`}>{texto}</a>
    : <button type="button" className="oc-adj oc-adj--subir" onClick={onSubir}>Subir</button>;
}

interface AccionesFila {
  onVer: (o: EntradaInv) => void;
  onAdjuntos: (o: EntradaInv) => void;
  onPdf: (o: EntradaInv) => void;
  onEditar?: (o: EntradaInv) => void;
  onEliminar?: (o: EntradaInv) => void;
  onPagar?: (o: EntradaInv) => void;
}

function menuDe(o: EntradaInv, a: AccionesFila): Array<OpcionOtros | false | null | undefined> {
  return [
    { label: 'Ver detalle', icon: <Eye size={17} />, onSelect: () => a.onVer(o) },
    { label: 'Adjuntos y sustentos', icon: <Paperclip size={17} />, onSelect: () => a.onAdjuntos(o) },
    a.onPagar && estadoPagable(o.estado) && !esCredito(o.condicion_pago) && { label: 'Confirmar pago', icon: <CreditCard size={17} />, onSelect: () => a.onPagar?.(o) },
    { label: 'Imprimir PDF', icon: <FileDown size={17} />, onSelect: () => a.onPdf(o) },
    a.onEditar && estadoEditable(o.estado) && { label: 'Editar orden', icon: <Pencil size={17} />, onSelect: () => a.onEditar?.(o) },
    a.onEliminar && estadoEditable(o.estado) && { label: 'Eliminar', icon: <Trash2 size={17} />, destructiva: true, separado: true, onSelect: () => a.onEliminar?.(o) },
  ];
}

interface FilaProps extends AccionesFila {
  orden: EntradaInv;
  /** Artículo de la orden (vista «Por artículos»); null si la fila es la orden entera o no tiene artículos */
  item: ItemEntrada | null;
  vista: Vista;
}

/** Una fila de la tabla: la orden completa (vista «Por órdenes») o un artículo de la orden («Por artículos») */
function FilaOC({ orden: o, item, vista, ...acciones }: FilaProps) {
  const items = o.items ?? [];
  const moneda = o.moneda === 'USD' ? 'USD' : 'PEN';
  const totalCant = items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0);
  const toc = totalOrden(o);
  const codigo = codigoLimpio(o.id);
  const tipo = esServicio(o.tipo_orden) ? 'ORDEN DE SERVICIO' : 'ORDEN DE COMPRA';
  const fecha = o.fecha ? formatFechaPe(String(o.fecha).split('T')[0]) : '—';
  const cabecera = [
    <Celda key="acc" alinear="center"><MenuOtros soloIcono label="Acciones" opciones={menuDe(o, acciones)} /></Celda>,
    <Celda key="fecha">{fecha}</Celda>,
    <Celda key="tipo"><span className="oc-chip">{tipo}</span></Celda>,
    <Celda key="orden"><button type="button" className="oc-codigo" onClick={() => acciones.onVer(o)} title="Ver detalle">{codigo}</button></Celda>,
    <Celda key="estado" alinear="center"><EstadoBadge estado={o.estado} /></Celda>,
    <Celda key="placa" mono>{o.placa || '—'}</Celda>,
    <Celda key="motivo">{o.motivo_entrada || '—'}</Celda>,
    <Celda key="prov">{o.proveedor_nombre || '—'}</Celda>,
  ];
  const cola = [
    <Celda key="cc"><span className="oc-chip oc-chip--mono">{o.centro_costo || 'CC-100'}</span></Celda>,
    <Celda key="voucher" alinear="center"><CeldaAdjunto url={o.url_voucher_presigned || o.url_voucher} texto="Ver voucher" tono="rojo" onSubir={() => acciones.onAdjuntos(o)} /></Celda>,
    <Celda key="cot" alinear="center"><CeldaAdjunto url={o.url_cotizacion_presigned || o.url_cotizacion} texto="Ver cotización" tono="azul" onSubir={() => acciones.onAdjuntos(o)} /></Celda>,
    <Celda key="fac" alinear="center"><CeldaAdjunto url={o.url_factura_presigned || o.url_factura} texto="Ver factura" tono="verde" onSubir={() => acciones.onAdjuntos(o)} /></Celda>,
  ];
  const totales = [
    <Celda key="toc" alinear="right"><strong className="oc-importe">{formatMoneda(toc, moneda)}</strong></Celda>,
    <Celda key="tsol" alinear="right"><strong className="oc-importe">{formatSoles(Number(o.total_pen) || 0)}</strong></Celda>,
  ];

  if (vista === 'ordenes') {
    const primera = items[0] ? (descripcionArticulo(items[0].descripcion, items[0].inventario_id) || items[0].inventario_id || '—') : '';
    const descripcion = items.length === 0 ? 'Sin artículos'
      : items.length === 1 ? primera
      : `${primera} · +${items.length - 1} más`;
    return (
      <tr>
        {cabecera}
        <Celda key="codigo">{items.length} {items.length === 1 ? 'ítem' : 'ítems'}</Celda>
        <Celda key="articulo">{descripcion}</Celda>
        <Celda key="cant" alinear="right">{totalCant.toLocaleString('es-PE', { maximumFractionDigits: 2 })} u.</Celda>
        <Celda key="costo" alinear="right">—</Celda>
        {totales}
        {cola}
      </tr>
    );
  }

  // Artículos: si la búsqueda coincide con un artículo, la fila muestra ese artículo
  const cant = Number(item?.cantidad) || 0;
  const costo = Number(item?.costo_unitario) || 0;
  return (
    <tr>
      {cabecera}
      <Celda key="codigo" mono>{item?.inventario_id || '—'}</Celda>
      <Celda key="articulo">{item ? (descripcionArticulo(item.descripcion, item.inventario_id) || '—') : 'Sin artículos'}</Celda>
      <Celda key="cant" alinear="right">{item ? cant.toLocaleString('es-PE', { maximumFractionDigits: 3 }) : '—'}</Celda>
      <Celda key="costo" alinear="right">{item ? formatMoneda(costo, moneda) : '—'}</Celda>
      {totales}
      {cola}
    </tr>
  );
}

export function EntradasPage() {
  const { data, isLoading, isError, error } = useEntradas();
  const inventarioQ = useInventario();
  const empresaQ = useEmpresaDocumentos();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();
  const esTabla = useMediaQuery(TABLA_QUERY);

  const entradas = useMemo(() => data ?? [], [data]);
  const inventario = inventarioQ.data ?? [];

  const [busqueda, setBusqueda] = useState('');
  const [desde, setDesde] = useState(() => mesAtras(hoyLima()));
  const [hasta, setHasta] = useState(() => hoyLima());
  const [estado, setEstado] = useState<FiltroEstado>('todas');
  const [vista] = useState<Vista>('articulos');
  const [pagina, setPagina] = useState(1);
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{ entrada: EntradaInv | null } | null>(null);
  const [porEliminar, setPorEliminar] = useState<EntradaInv | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [anulando, setAnulando] = useState<EntradaInv | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [enviandoAnulacion, setEnviandoAnulacion] = useState(false);
  const [adjuntosId, setAdjuntosId] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  // Hoja de confirmar pago: la key (sesión) la reinicia en cada apertura
  const [pagar, setPagar] = useState<{ entrada: EntradaInv | null; abierto: boolean; sesion: number }>({ entrada: null, abierto: false, sesion: 0 });

  const puedeCrear = can('ent_inv.crear');
  const puedeEditar = can('ent_inv.editar');
  const puedeEliminar = can('ent_inv.eliminar');
  // Pagar es un acto de Tesorería: mismos permisos que Pago de requerimientos
  const puedePagar = can('tesoreria_caja.ver', 'tesoreria_pagos.ver');

  useEffect(() => { setPagina(1); }, [busqueda, desde, hasta, estado]);

  const visibles = useMemo(
    () => filtrarOrdenes(entradas, { busqueda, desde, hasta, estado }),
    [entradas, busqueda, desde, hasta, estado],
  );
  const kpis = useMemo(() => kpisOrdenes(visibles), [visibles]);
  const conteo = useMemo(() => {
    const c = { registradas: 0, aprobadas: 0, procesadas: 0 };
    for (const o of entradas) {
      const cat = categoriaEstado(o.estado);
      if (cat === 'registradas') c.registradas++;
      else if (cat === 'aprobadas') c.aprobadas++;
      else if (cat === 'procesadas') c.procesadas++;
    }
    return { ...c, todas: entradas.length };
  }, [entradas]);

  const totalPag = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const pag = Math.min(pagina, totalPag);
  const paginaOrdenes = visibles.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);

  const seleccionada = seleccionadaId ? (entradas.find(x => x.id === seleccionadaId) ?? null) : null;
  const adjuntos = adjuntosId ? (entradas.find(x => x.id === adjuntosId) ?? null) : null;

  const unidadDe = (id: string | null) => (id ? (inventario.find(a => a.id === id)?.unidad ?? '') : '');

  /** Filas de la tabla: por orden, o por artículo (con la búsqueda aplicada a los artículos) */
  const filas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    const out: Array<{ key: string; orden: EntradaInv; item: ItemEntrada | null }> = [];
    for (const o of paginaOrdenes) {
      if (vista === 'ordenes') { out.push({ key: o.id, orden: o, item: null }); continue; }
      const items = o.items ?? [];
      if (!items.length) { out.push({ key: `${o.id}-0`, orden: o, item: null }); continue; }
      const coincideCab = q ? cabeceraCoincide(o, q) : true;
      itemsVisibles(items, coincideCab, busqueda).forEach((it, i) => out.push({ key: `${o.id}-${it.id ?? i}-${i}`, orden: o, item: it }));
    }
    return out;
  }, [paginaOrdenes, vista, busqueda]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  const acciones: AccionesFila = {
    onVer: o => { setSeleccionadaId(o.id); },
    onAdjuntos: o => setAdjuntosId(o.id),
    onPdf: o => { void verPdf(o, false); },
    onEditar: puedeEditar ? o => setFormulario({ entrada: o }) : undefined,
    onEliminar: puedeEliminar ? o => (estadoEditable(o.estado) ? setPorEliminar(o) : undefined) : undefined,
    onPagar: puedePagar ? o => setPagar(p => ({ entrada: o, abierto: true, sesion: p.sesion + 1 })) : undefined,
  };

  /** PDF de la orden: se descarga o se abre como vista previa */
  async function verPdf(o: EntradaInv, vistaPrevia: boolean) {
    const ventana = vistaPrevia ? window.open('', '_blank') : null;
    setGenerandoPdf(true);
    try {
      const unidades = new Map(inventario.map(a => [a.id, a.unidad ?? undefined]));
      const conUnidad = { ...o, items: (o.items ?? []).map(i => ({ ...i, item_unidad: i.item_unidad ?? unidades.get(i.inventario_id ?? '') })) };
      const blob = await generarPdfOrdenCompra(ordenDesdeEntrada({ entrada: conUnidad, empresa: empresaQ.data ?? null }));
      if (vistaPrevia) {
        const url = URL.createObjectURL(blob);
        if (ventana) ventana.location.href = url;
        else window.open(url, '_blank');
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        descargarArchivo(blob, `Orden_de_Compra_${codigoLimpio(o.id)}.pdf`);
      }
    } catch (err) {
      ventana?.close();
      toast(errorMessage(err), 'error');
    } finally {
      setGenerandoPdf(false);
    }
  }

  async function confirmarAnulacion() {
    if (!anulando) return;
    if (!motivoAnulacion.trim()) { toast('Escribe el motivo de la anulación', 'error'); return; }
    setEnviandoAnulacion(true);
    try {
      await anularEntrada(anulando.id, motivoAnulacion.trim());
      toast('Orden anulada');
      if (seleccionadaId === anulando.id) setSeleccionadaId(null);
      setAnulando(null);
      setMotivoAnulacion('');
      await qc.invalidateQueries({ queryKey: ['almacen', 'entradas'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setEnviandoAnulacion(false);
    }
  }

  async function confirmarEliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await eliminarEntrada(porEliminar.id);
      toast('Orden eliminada');
      haptic('success');
      if (seleccionadaId === porEliminar.id) setSeleccionadaId(null);
      setPorEliminar(null);
      await qc.invalidateQueries({ queryKey: ['almacen', 'entradas'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setEliminando(false);
    }
  }

  async function exportar() {
    if (!visibles.length) { toast('No hay datos para exportar', 'error'); return; }
    try {
      if (vista === 'ordenes') await exportarConsolidadoOC(visibles);
      else await exportarDetalleArticulosOC(visibles);
      haptic('success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  const soloDetalle = !!seleccionada;

  return (
    <Page>
      {!soloDetalle && (
        <PageHeader
          eyebrow="Almacén"
          title="Órdenes de compra"
          subtitle={isLoading ? 'Cargando…' : `${entradas.length} ${entradas.length === 1 ? 'orden' : 'órdenes'}${conteo.registradas ? ` · ${conteo.registradas} pendientes de aprobación` : ''}`}
          actions={
            <>
              <div className="oc-acciones">
                <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--verde" data-tip="Exportar a Excel" aria-label="Exportar a Excel" onClick={exportar}>
                  <FileSpreadsheet size={17} />
                </button>
                <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--azul" data-tip="Descargar plantilla" aria-label="Descargar plantilla" onClick={() => { void descargarPlantillaEntradas(); }}>
                  <Download size={17} />
                </button>
                {puedeCrear && (
                  <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--violeta" data-tip="Importar desde Excel" aria-label="Importar desde Excel" onClick={() => setImportando(true)}>
                    <Upload size={17} />
                  </button>
                )}
                <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--celeste" data-tip="Actualizar" aria-label="Actualizar" onClick={() => { void qc.invalidateQueries({ queryKey: ['almacen', 'entradas'] }); }}>
                  <RefreshCw size={17} />
                </button>
              </div>
              {puedeCrear && (
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ entrada: null })}>
                  Nueva orden
                </Button>
              )}
            </>
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : entradas.length === 0 ? (
        <EmptyState icon={<PackagePlus size={22} />} title="Sin órdenes de compra">
          {puedeCrear ? <>Registra la primera con <strong>Nueva orden</strong>.</> : 'Cuando almacén registre compras, aparecerán aquí.'}
        </EmptyState>
      ) : (
        <div>
          {/* Totales del filtro */}
          {/* Totales del filtro */}
          <div className="inv-kpis" style={{ marginBottom: 'var(--s-4)' }}>
            <KpiTarjeta etiqueta="Órdenes" valor={String(kpis.total)} sub="Del filtro seleccionado" icono={<ClipboardList size={18} />} />
            <KpiTarjeta etiqueta="Monto total (S/)" valor={formatSoles(kpis.monto)} sub="Valor en soles" icono={<Coins size={18} />} tono="valor" />
            <KpiTarjeta etiqueta="Pendientes de aprobación" valor={String(conteo.registradas)} sub="Estado registrada" icono={<CircleCheck size={18} />} tono="warning" />
            <KpiTarjeta etiqueta="Unidades pedidas" valor={kpis.unidades.toLocaleString('es-PE')} sub={`${kpis.proveedores} proveedores`} icono={<Package size={18} />} />
          </div>

          {/* Filtros */}
          <div className="oc-filtros" style={{ marginBottom: 'var(--s-4)' }}>
            <SearchField value={busqueda} onChange={setBusqueda} placeholder="Código, proveedor, documento, placa o artículo" />
            <div className="oc-filtros__fila">
              <div className="oc-fechas">
                <TextInput type="date" aria-label="Desde" value={desde} onChange={ev => setDesde(ev.target.value)} />
                <span className="t-footnote c-secondary">a</span>
                <TextInput type="date" aria-label="Hasta" value={hasta} onChange={ev => setHasta(ev.target.value)} />
                <button type="button" className="oc-cotizacion__quitar" aria-label="Quitar fechas"
                  onClick={() => { setDesde(''); setHasta(''); }}>×</button>
              </div>
              <span className="badge" style={{ marginLeft: 'auto' }}>
                {visibles.length} {visibles.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>
          </div>

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Ninguna orden coincide">
              <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setDesde(''); setHasta(''); setEstado('todas'); }}>
                Quitar filtros
              </button>
            </EmptyState>
          ) : esTabla ? (
            <>
              <TablaRedimensionable id="almacen-ordenes-compra" columnas={COLUMNAS} ariaLabel="Órdenes de compra" altoMax="68vh">
                {filas.map(f => (
                  <FilaOC key={f.key} orden={f.orden} item={f.item} vista={vista} {...acciones} />
                ))}
              </TablaRedimensionable>
              <Paginacion pag={pag} total={totalPag} onCambiar={setPagina} />
            </>
          ) : (
            <>
              <div className="oc-tarjetas-lista">
                <AnimatePresence initial={false}>
                  {paginaOrdenes.map(o => (
                    <motion.div key={o.id} layout={!reduce} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring}>
                      <TarjetaOrden orden={o} acciones={acciones} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <Paginacion pag={pag} total={totalPag} onCambiar={setPagina} />
            </>
          )}
        </div>
      )}

      <EntradaFormulario
        open={!!formulario}
        entrada={formulario?.entrada ?? null}
        onClose={() => setFormulario(null)}
        onGuardado={() => {
          setFormulario(null);
          void qc.invalidateQueries({ queryKey: ['almacen', 'entradas'] });
          void qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] });
        }}
      />

      <Sheet open={!!seleccionada} onClose={() => setSeleccionadaId(null)} title="Orden de compra" ancho ligera>
        {seleccionada && (
          <EntradaDetalle
          entrada={seleccionada}
          onVolver={() => setSeleccionadaId(null)}
          onEditar={puedeEditar && estadoEditable(seleccionada.estado) ? () => setFormulario({ entrada: seleccionada }) : undefined}
          onAdjuntos={() => setAdjuntosId(seleccionada.id)}
          onConfirmarPago={puedePagar ? () => setPagar(p => ({ entrada: seleccionada, abierto: true, sesion: p.sesion + 1 })) : undefined}
          onAnular={puedeEditar && !String(seleccionada.estado ?? '').toLowerCase().includes('anul') ? () => setAnulando(seleccionada) : undefined}
          onEliminar={puedeEliminar && estadoEditable(seleccionada.estado) ? () => setPorEliminar(seleccionada) : undefined}
          onPdf={() => { void verPdf(seleccionada, false); }}
          onVistaPrevia={() => { void verPdf(seleccionada, true); }}
          generandoPdf={generandoPdf}
          unidadDe={id => unidadDe(id) || null}
          />
        )}
      </Sheet>

      <AdjuntosEntradaSheet
        open={adjuntos !== null}
        entrada={adjuntos}
        onClose={() => setAdjuntosId(null)}
        onGuardado={() => setAdjuntosId(null)}
      />

      <ConfirmarPagoSheet
        key={pagar.sesion}
        entrada={pagar.entrada}
        open={pagar.abierto}
        onClose={() => setPagar(p => ({ ...p, abierto: false }))}
        onPagado={() => setPagar(p => ({ ...p, abierto: false }))}
      />

      <ImportarEntradasSheet open={importando} onClose={() => setImportando(false)} inventario={inventario} />

      <Sheet
        open={!!anulando}
        onClose={() => !enviandoAnulacion && setAnulando(null)}
        title={`Anular orden ${anulando ? codigoLimpio(anulando.id) : ''}`}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setAnulando(null)} disabled={enviandoAnulacion}>Cancelar</Button>
            <Button variant="danger" onClick={confirmarAnulacion} loading={enviandoAnulacion}>Anular orden</Button>
          </div>
        }
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--label-2)' }}>Motivo de la anulación *</span>
          <TextInput value={motivoAnulacion} onChange={ev => setMotivoAnulacion(ev.target.value)} placeholder="Ej: proveedor canceló la compra" autoFocus />
        </label>
      </Sheet>

      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !eliminando && setPorEliminar(null)}
        onConfirm={confirmarEliminar}
        loading={eliminando}
        title={`¿Eliminar la orden ${porEliminar ? codigoLimpio(porEliminar.id) : ''}?`}
        message="Se eliminarán sus artículos y se revertirán los movimientos de stock asociados."
        confirmLabel="Eliminar"
      />
    </Page>
  );
}

/** Tarjeta de una orden para pantallas pequeñas (el clásico muestra tarjetas en el celular) */
function TarjetaOrden({ orden: o, acciones }: { orden: EntradaInv; acciones: AccionesFila }) {
  const moneda = o.moneda === 'USD' ? 'USD' : 'PEN';
  const items = o.items ?? [];
  const totalCant = items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0);
  const tipo = esServicio(o.tipo_orden) ? 'Orden de servicio' : 'Orden de compra';
  return (
    <article className="oc-tarjeta-orden">
      <div className="oc-tarjeta-orden__cab">
        <button type="button" className="oc-codigo" onClick={() => acciones.onVer(o)}>{codigoLimpio(o.id)}</button>
        <EstadoBadge estado={o.estado} />
      </div>
      <div className="oc-chips">
        <span className="oc-chip">{tipo}</span>
        <span className="oc-chip oc-chip--mono">{o.centro_costo || 'CC-100'}</span>
        {o.placa && <span className="oc-chip oc-chip--mono">{o.placa}</span>}
      </div>
      <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{o.proveedor_nombre || o.motivo_entrada || 'Sin proveedor'}</span>
      {o.motivo_entrada && o.proveedor_nombre && <span className="t-footnote c-secondary">{o.motivo_entrada}</span>}
      <span className="t-footnote c-secondary">
        {o.fecha ? formatFechaPe(String(o.fecha).split('T')[0]) : '—'} · {items.length} {items.length === 1 ? 'ítem' : 'ítems'} · {totalCant.toLocaleString('es-PE', { maximumFractionDigits: 2 })} u.
      </span>
      <div className="oc-tarjeta-orden__pie">
        <span className="oc-tarjeta-orden__monto">
          {formatMoneda(totalOrden(o), moneda)}
          {moneda === 'USD' && <small>{formatSoles(Number(o.total_pen) || 0)}</small>}
        </span>
        <div className="oc-tarjeta-orden__acciones">
          <Button size="sm" variant="secondary" icon={<Eye size={14} />} onClick={() => acciones.onVer(o)}>Detalle</Button>
          <Button size="sm" variant="secondary" icon={<FileDown size={14} />} onClick={() => acciones.onPdf(o)}>PDF</Button>
          <MenuOtros soloIcono label="Acciones" opciones={menuDe(o, acciones)} />
        </div>
      </div>
    </article>
  );
}

/** Paginación del listado (20 órdenes por página, como el clásico) */
function Paginacion({ pag, total, onCambiar }: { pag: number; total: number; onCambiar: (n: number) => void }) {
  if (total <= 1) return null;
  return (
    <nav className="oc-paginacion" aria-label="Paginación" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', padding: 'var(--s-3) 0' }}>
      <Button size="sm" variant="secondary" disabled={pag <= 1} onClick={() => onCambiar(pag - 1)}>‹ Anterior</Button>
      <span className="t-footnote c-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>Página {pag} de {total}</span>
      <Button size="sm" variant="secondary" disabled={pag >= total} onClick={() => onCambiar(pag + 1)}>Siguiente ›</Button>
    </nav>
  );
}
