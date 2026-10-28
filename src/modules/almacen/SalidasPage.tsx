import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, PackageMinus, Plus, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, TextInput } from '../../core/ui/Field';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { MOBILE_QUERY, useMediaQuery } from '../../core/lib/useMediaQuery';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { descargarArchivo } from '../../core/lib/pdf';
import { exportarExcel } from '../../core/lib/excel';
import { formatFechaPe, formatSoles } from '../../core/lib/format';
import {
  anularSalida, despacharSalida, eliminarSalida, estadoSalida, TIPO_ORDEN_AJUSTE,
  useInventario, useSalidas, type EstadoSalida, type ItemSalida, type SalidaInv,
} from './api';
import { SalidaFormulario } from './SalidaFormulario';
import { nombreSolicitante, SalidaDetalle } from './SalidaDetalle';
import { AnularDialogo, DespacharDialogo } from './SalidaDialogos';
import { pdfSalida } from './salidaPdf';
import './salidas.css';

// Órdenes de salida: pestañas Pendientes / Despachadas / Anuladas, búsqueda y filtros, detalle con
// despacho parcial, anulación, edición, comprobante PDF y exportación a Excel (mismo flujo que el clásico).

type Pestana = 'pend' | 'desp' | 'anulado';
const POR_PAGINA = 25;
const ESTADO_DE_PESTANA: Record<Pestana, EstadoSalida> = { pend: 'Pendiente', desp: 'Despachado', anulado: 'Anulado' };

interface Filtros { ot: string; placa: string; mes: string; desde: string; hasta: string }
const SIN_FILTROS: Filtros = { ot: '', placa: '', mes: '', desde: '', hasta: '' };

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

  const [pestana, setPestana] = useState<Pestana>('desp');
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [pagina, setPagina] = useState(1);

  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const [formulario, setFormulario] = useState<{ salida: SalidaInv | null } | null>(null);
  const [despacho, setDespacho] = useState<{ id: number; itemIds: number[]; mensaje: ReactNode } | null>(null);
  const [despachando, setDespachando] = useState(false);
  const [anulandoId, setAnulandoId] = useState<number | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [porEliminar, setPorEliminar] = useState<SalidaInv | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const usuario = user?.name || 'Almacén';
  const refrescar = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['almacen', 'salidas'] }),
    qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] }),
  ]);

  // Conteos y KPIs (el clásico los calcula de la misma forma)
  const conteo = useMemo(() => {
    const c = { pend: 0, desp: 0, anulado: 0, ots: new Set<string>() };
    for (const s of salidas) {
      const e = estadoSalida(s);
      if (e === 'Pendiente') c.pend++; else if (e === 'Despachado') c.desp++; else c.anulado++;
      const ot = String(s.ticket_ot ?? '').trim();
      if (ot) c.ots.add(ot);
    }
    return c;
  }, [salidas]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const ot = filtros.ot.trim().toLowerCase();
    const placa = filtros.placa.trim().toUpperCase();
    return salidas.filter(s => {
      if (estadoSalida(s) !== ESTADO_DE_PESTANA[pestana]) return false;
      if (ot && !String(s.ticket_ot ?? '').toLowerCase().includes(ot)) return false;
      if (placa && !String(s.placa ?? '').toUpperCase().includes(placa)) return false;
      const fecha = soloFecha(s);
      if (filtros.mes && !fecha.startsWith(filtros.mes)) return false;
      if (filtros.desde && fecha < filtros.desde) return false;
      if (filtros.hasta && fecha > filtros.hasta) return false;
      if (q) {
        const texto = [s.id, s.ticket_ot, s.placa, s.responsable, (s.items ?? []).map(i => i.descripcion ?? '').join(' ')].join(' ').toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });
  }, [salidas, pestana, busqueda, filtros]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pag = Math.min(pagina, totalPaginas);
  const visiblesPagina = filtradas.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);

  const filtrosActivos = Object.values(filtros).filter(Boolean).length;
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

  function cambiarPestana(p: Pestana) {
    setPestana(p);
    setPagina(1);
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
      toast(errorMessage(err), 'error');
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

  const subtitulo = isLoading ? 'Cargando…' : `${salidas.length} salidas registradas`;

  return (
    <Page>
      <PageHeader
        eyebrow="Almacén"
        title="Salidas"
        subtitle={subtitulo}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar a Excel', onSelect: exportar, detalle: 'Lo que se ve con los filtros actuales' },
              { label: 'Actualizar', onSelect: () => { void refetch(); } },
            ]} />
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
        <div className="sal-pagina">
          <div className="sal-kpis">
            <KpiSalida titulo="Total" valor={salidas.length} tono="neutral" />
            <KpiSalida titulo="Pendientes" valor={conteo.pend} tono="amber" activo={pestana === 'pend'} onClick={() => cambiarPestana('pend')} />
            <KpiSalida titulo="Despachadas" valor={conteo.desp} tono="green" activo={pestana === 'desp'} onClick={() => cambiarPestana('desp')} />
            <KpiSalida titulo="OTs atendidas" valor={conteo.ots.size} tono="accent" onClick={() => cambiarPestana('desp')} />
          </div>

          <div className="sal-barra">
            <div className="sal-barra__busqueda">
              <SearchField value={busqueda} onChange={v => { setBusqueda(v); setPagina(1); }} placeholder="Folio, placa, OT, responsable o artículo" />
              <Button variant="secondary" onClick={() => setFiltrosAbiertos(v => !v)} aria-expanded={filtrosAbiertos}>
                Filtros{filtrosActivos ? ` (${filtrosActivos})` : ''}
              </Button>
            </div>
            <SegmentedControl<Pestana>
              label="Estado de las salidas"
              block={movil}
              value={pestana}
              onChange={cambiarPestana}
              options={[
                { value: 'pend', label: `Pendientes (${conteo.pend})` },
                { value: 'desp', label: `Despachadas (${conteo.desp})` },
                { value: 'anulado', label: `Anuladas (${conteo.anulado})` },
              ]}
            />
          </div>

          {filtrosAbiertos && (
            <div className="sal-filtros">
              <Field label="N° OT">{p => <TextInput {...p} value={filtros.ot} placeholder="OT-…" onChange={e => { setFiltros(f => ({ ...f, ot: e.target.value })); setPagina(1); }} />}</Field>
              <Field label="Placa">{p => <TextInput {...p} value={filtros.placa} placeholder="ABC-123" onChange={e => { setFiltros(f => ({ ...f, placa: e.target.value.toUpperCase() })); setPagina(1); }} />}</Field>
              <Field label="Mes">{p => <TextInput {...p} type="month" value={filtros.mes} onChange={e => { setFiltros(f => ({ ...f, mes: e.target.value })); setPagina(1); }} />}</Field>
              <Field label="Desde">{p => <TextInput {...p} type="date" value={filtros.desde} onChange={e => { setFiltros(f => ({ ...f, desde: e.target.value })); setPagina(1); }} />}</Field>
              <Field label="Hasta">{p => <TextInput {...p} type="date" value={filtros.hasta} onChange={e => { setFiltros(f => ({ ...f, hasta: e.target.value })); setPagina(1); }} />}</Field>
              {filtrosActivos > 0 && <Button variant="plain" onClick={() => { setFiltros(SIN_FILTROS); setPagina(1); }}>Limpiar filtros</Button>}
            </div>
          )}

          {filtradas.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title={pestana === 'pend' ? 'Sin solicitudes pendientes' : pestana === 'anulado' ? 'Sin salidas anuladas' : 'Sin salidas despachadas'}>
              {busqueda || filtrosActivos ? <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setFiltros(SIN_FILTROS); }}>Quitar búsqueda y filtros</button> : null}
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
            <div className="sal-tabla-wrap">
              <table className="sal-tabla">
                <thead>
                  <tr>
                    <th>Folio · fecha</th>
                    <th>Tipo de orden</th>
                    <th>N° OT</th>
                    <th>Placa</th>
                    <th>Responsable</th>
                    <th>Código</th>
                    <th>Artículo</th>
                    <th className="num">Cant.</th>
                    <th className="num">Costo unit.</th>
                    <th className="num">Total</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblesPagina.flatMap(s => {
                    const items = itemsVisibles(s);
                    const estado = estadoSalida(s);
                    const span = Math.max(1, items.length);
                    const cabecera = (
                      <>
                        <td rowSpan={span}><span className="sal-folio">{s.id}</span><span className="sal-fecha">{fechaCorta(s)}</span></td>
                        <td rowSpan={span}><TipoOrdenBadge tipo={s.tipo_orden} /></td>
                        <td rowSpan={span} className="mono">{s.ticket_ot || '—'}</td>
                        <td rowSpan={span} className="mono">{s.placa || '—'}</td>
                        <td rowSpan={span}>
                          <span className="sal-resp">{s.responsable || '—'}</span>
                          <span className="sal-sub">{nombreSolicitante(s.creado_por)}</span>
                        </td>
                      </>
                    );
                    const pie = (
                      <>
                        <td rowSpan={span} className="num sal-total-celda">{formatSoles(s.total_pen ?? 0)}</td>
                        <td rowSpan={span}><EstadoBadge estado={estado} /></td>
                      </>
                    );
                    if (!items.length) {
                      return [(
                        <tr key={s.id} onClick={() => abrirDetalle(s)} className="sal-fila">
                          {cabecera}
                          <td colSpan={3} className="sal-muted">Sin artículos</td>
                          {pie}
                        </tr>
                      )];
                    }
                    return items.map((it, i) => (
                      <tr key={`${s.id}-${it.id ?? i}`} onClick={() => abrirDetalle(s)} className={`sal-fila${i > 0 ? ' sal-fila--sub' : ''}`}>
                        {i === 0 && cabecera}
                        <td className="mono sal-muted">{it.inventario_id || '—'}</td>
                        <td className="sal-articulo">{descripcionLimpia(it.descripcion, it.inventario_id)}</td>
                        <td className="num">{cantidad(Number(it.cantidad) || 0)}</td>
                        <td className="num">{formatSoles(Number(it.costo_unitario) || 0)}</td>
                        {i === 0 && pie}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtradas.length > POR_PAGINA && (
            <nav className="sal-paginacion" aria-label="Páginas">
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

function KpiSalida({ titulo, valor, tono, activo, onClick }: {
  titulo: string; valor: number; tono: 'neutral' | 'amber' | 'green' | 'accent'; activo?: boolean; onClick?: () => void;
}) {
  const cuerpo = (
    <>
      <span className="sal-kpi__titulo">{titulo}</span>
      <span className="sal-kpi__valor">{valor.toLocaleString('es-PE')}</span>
    </>
  );
  if (!onClick) return <div className={`sal-kpi sal-kpi--${tono}`}>{cuerpo}</div>;
  return (
    <button type="button" className={`sal-kpi sal-kpi--${tono} sal-kpi--boton${activo ? ' sal-kpi--activo' : ''}`} onClick={onClick} aria-pressed={activo}>
      {cuerpo}
    </button>
  );
}

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
