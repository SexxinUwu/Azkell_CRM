import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, PackagePlus, Plus, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { descargarArchivo } from '../../core/lib/pdf';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import {
  anularEntrada, aprobarEntrada, eliminarEntrada, etiquetaEstadoEntrada, grupoEntrada, tipoDeOrden, useEmpresaDocumentos,
  useEntradas, useInventario, useProveedores, type EntradaInv,
} from './api';
import { EntradaFormulario } from './EntradaFormulario';
import { pdfEntrada } from './entradaPdf';
import { formatFechaPe, formatMoneda, formatSoles } from '../../core/lib/format';

/** Permisos para aprobar (V°B°): el mismo acceso que el menú de Aprobación de O/C (gerencia) o su módulo de aprobación */
const PERMISOS_APROBAR = ['gerencia.ver', 'aprob_oc.crear', 'aprob_oc.editar'];

type FiltroEstado = 'todos' | 'pendientes' | 'aprobadas' | 'anuladas';

/** Color según el grupo del estado: 'Registrado' y 'Pendiente' esperan aprobación (ámbar) */
const estadoTono = (estado: string | null) => {
  const g = grupoEntrada(estado);
  if (g === 'aprobadas') return 'green';
  if (g === 'anuladas') return 'red';
  return 'amber';
};

function FechaCorta({ fecha }: { fecha: string | null }) {
  if (!fecha) return <>—</>;
  return <>{formatFechaPe(fecha)}</>;
}

function MontoFmt({ monto, moneda }: { monto: number; moneda: string }) {
  return <>{formatMoneda(monto, moneda)}</>;
}

export function EntradasPage() {
  const { data, isLoading, isError, error } = useEntradas();
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [seleccionada, setSeleccionada] = useState<EntradaInv | null>(null);
  const [formulario, setFormulario] = useState<{ entrada: EntradaInv | null } | null>(null);
  const [porEliminar, setPorEliminar] = useState<EntradaInv | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [aprobando, setAprobando] = useState<EntradaInv | null>(null);
  const [comentarioAprobacion, setComentarioAprobacion] = useState('');
  const [enviandoAprobacion, setEnviandoAprobacion] = useState(false);

  const puedeCrear = can('ent_inv.crear');
  const puedeEditar = can('ent_inv.editar');
  const puedeEliminar = can('ent_inv.eliminar');
  const puedeAprobar = can(...PERMISOS_APROBAR);

  const entradas = data ?? [];

  // La ficha muestra la versión actual de la entrada (tras aprobar cambia de estado sin cerrar la ficha)
  const seleccionadaActual = seleccionada ? (entradas.find(x => x.id === seleccionada.id) ?? seleccionada) : null;

  async function confirmarAprobacion() {
    if (!aprobando) return;
    setEnviandoAprobacion(true);
    try {
      await aprobarEntrada(aprobando.id, comentarioAprobacion, user?.name ?? 'Gerencia');
      toast('Orden aprobada');
      haptic('success');
      setAprobando(null);
      setComentarioAprobacion('');
      await qc.invalidateQueries({ queryKey: ['almacen', 'entradas'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setEnviandoAprobacion(false);
    }
  }

  const visibles = useMemo(() => entradas.filter(e => {
    const q = busqueda.toUpperCase();
    if (filtroEstado !== 'todos' && grupoEntrada(e.estado) !== filtroEstado) return false;
    if (!q) return true;
    return (
      String(e.id).toUpperCase().includes(q) ||
      (e.proveedor_nombre ?? '').toUpperCase().includes(q) ||
      (e.documento_referencia ?? '').toUpperCase().includes(q) ||
      (e.motivo_entrada ?? '').toUpperCase().includes(q)
    );
  }), [entradas, busqueda, filtroEstado]);

  const resumen = useMemo(() => ({
    total: entradas.length,
    pendientes: entradas.filter(e => grupoEntrada(e.estado) === 'pendientes').length,
    monto: entradas.filter(e => grupoEntrada(e.estado) !== 'anuladas').reduce((s, e) => s + (e.total_pen || 0), 0),
  }), [entradas]);

  async function confirmarEliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await eliminarEntrada(porEliminar.id);
      toast('Entrada eliminada');
      haptic('success');
      if (seleccionada?.id === porEliminar.id) setSeleccionada(null);
      setPorEliminar(null);
      await qc.invalidateQueries({ queryKey: ['almacen', 'entradas'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setEliminando(false);
    }
  }

  const soloDetalle = !!seleccionada;

  return (
    <Page>
      {!soloDetalle && (
        <PageHeader
          eyebrow="Almacén"
          title="Entradas"
          subtitle={isLoading ? 'Cargando…' : `${resumen.total} órdenes de compra${resumen.pendientes ? ` · ${resumen.pendientes} pendientes` : ''}`}
          actions={
            <>
              <MenuOtros opciones={[
                { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('almacen/entradas') },
              ]} />
              {puedeCrear && (
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ entrada: null })}>
                  Nueva entrada
                </Button>
              )}
            </>
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : seleccionadaActual ? (
        <EntradaDetalle
          entrada={seleccionadaActual}
          onVolver={() => setSeleccionada(null)}
          onEditar={puedeEditar ? () => setFormulario({ entrada: seleccionadaActual }) : undefined}
          onEliminar={puedeEliminar ? () => setPorEliminar(seleccionadaActual) : undefined}
          onAprobar={puedeAprobar && grupoEntrada(seleccionadaActual.estado) === 'pendientes' ? () => setAprobando(seleccionadaActual) : undefined}
          onAnular={puedeEditar ? async () => {
            try {
              await anularEntrada(seleccionadaActual.id);
              toast('Entrada anulada');
              await qc.invalidateQueries({ queryKey: ['almacen', 'entradas'] });
              setSeleccionada(null);
            } catch (err) { toast(errorMessage(err), 'error'); }
          } : undefined}
        />
      ) : entradas.length === 0 ? (
        <EmptyState icon={<PackagePlus size={22} />} title="Sin entradas registradas">
          {puedeCrear ? <>Registra la primera entrada de almacén con <strong>Nueva entrada</strong>.</> : 'Cuando almacén registre compras, aparecerán aquí.'}
        </EmptyState>
      ) : (
        <div>
          {/* Métricas rápidas */}
          <div className="inv-metricas" style={{ marginBottom: 'var(--s-4)' }}>
            <div className="inv-metrica">
              <span className="inv-metrica__num">{resumen.total}</span>
              <span className="inv-metrica__label">Total</span>
            </div>
            <div className="inv-metrica">
              <span className={`inv-metrica__num${resumen.pendientes ? ' inv-metrica__num--warning' : ''}`}>{resumen.pendientes}</span>
              <span className="inv-metrica__label">Pendientes</span>
            </div>
            <div className="inv-metrica">
              <span className="inv-metrica__num" style={{ fontSize: '1.25rem' }}>
                {formatSoles(resumen.monto)}
              </span>
              <span className="inv-metrica__label">Monto total</span>
            </div>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
            <SearchField value={busqueda} onChange={setBusqueda} placeholder="Proveedor, N° documento o motivo" />
            <SegmentedControl<FiltroEstado> block label="Estado" value={filtroEstado} onChange={setFiltroEstado}
              options={[
                { value: 'todos', label: 'Todas' },
                { value: 'pendientes', label: 'Pendientes de aprobación' },
                { value: 'aprobadas', label: 'Aprobadas' },
                { value: 'anuladas', label: 'Anuladas' },
              ]} />
          </div>

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Ninguna entrada coincide">
              <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setFiltroEstado('todos'); }}>Quitar filtros</button>
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              <AnimatePresence initial={false}>
                {visibles.map(e => (
                  <motion.div key={e.id} layout={!reduce} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring}>
                    <button type="button" className="mov-fila pressable" onClick={() => { haptic('selection'); setSeleccionada(e); }}>
                      <div className="mov-fila__icon" style={{ background: `var(--${estadoTono(e.estado)}-tint)`, color: `var(--${estadoTono(e.estado)}-ink)` }}>
                        <PackagePlus size={16} />
                      </div>
                      <div className="mov-fila__cuerpo">
                        <span className="mov-fila__titulo">{e.proveedor_nombre || e.motivo_entrada || `Entrada ${e.id}`}</span>
                        <span className="mov-fila__sub">{tipoDeOrden(e.tipo_orden)} · <FechaCorta fecha={e.fecha} /> · {e.items?.length ?? 0} ítem{e.items?.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="mov-fila__derecha">
                        {/* total_pen se guarda en soles: en entradas USD se muestra el total en dólares */}
                        <span className="mov-fila__monto">
                          <MontoFmt monto={e.moneda === 'USD' && e.tipo_cambio ? e.total_pen / e.tipo_cambio : e.total_pen} moneda={e.moneda} />
                        </span>
                        <span className={`inv-badge inv-badge--${estadoTono(e.estado) === 'green' ? 'ok' : estadoTono(e.estado) === 'red' ? 'critical' : 'warning'}`}>{etiquetaEstadoEntrada(e.estado)}</span>
                      </div>
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      <EntradaFormulario
        open={!!formulario}
        entrada={formulario?.entrada ?? null}
        onClose={() => setFormulario(null)}
        onGuardado={() => {
          setFormulario(null);
          qc.invalidateQueries({ queryKey: ['almacen', 'entradas'] });
          qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] });
        }}
      />

      <Sheet
        open={!!aprobando}
        onClose={() => !enviandoAprobacion && setAprobando(null)}
        title={`Aprobar orden ${aprobando?.id ?? ''}`}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setAprobando(null)} disabled={enviandoAprobacion}>Cancelar</Button>
            <Button variant="primary" onClick={confirmarAprobacion} loading={enviandoAprobacion}>Aprobar O/C</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="t-footnote c-secondary">
            Al aprobar, la orden queda lista para Recepción de compras (si es a crédito; las de contado esperan el pago en Tesorería).
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--label-2)' }}>Nota de gerencia (opcional)</span>
            <TextInput value={comentarioAprobacion} onChange={ev => setComentarioAprobacion(ev.target.value)} placeholder="Ej: aprobado con precio negociado" />
          </label>
        </div>
      </Sheet>

      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !eliminando && setPorEliminar(null)}
        onConfirm={confirmarEliminar}
        loading={eliminando}
        title={`¿Eliminar entrada #${porEliminar?.id}?`}
        message="Se eliminará la entrada y se revertirán los movimientos de stock asociados."
        confirmLabel="Eliminar"
      />
    </Page>
  );
}

// ─── Detalle de una entrada ───────────────────────────────────────────────────

interface DetalleProps {
  entrada: EntradaInv;
  onVolver: () => void;
  onEditar?: () => void;
  onEliminar?: () => void;
  onAprobar?: () => void;
  onAnular?: () => void;
}

function EntradaDetalle({ entrada: e, onVolver, onEditar, onEliminar, onAprobar, onAnular }: DetalleProps) {
  const tono = estadoTono(e.estado);
  const total = e.items?.reduce((s, i) => s + (i.importe || 0), 0) ?? e.total_pen;
  const { data: proveedores } = useProveedores();
  const proveedor = (proveedores ?? []).find(p => p.id === e.proveedor_id) ?? null;
  const dinero = (n: number) => formatMoneda(n, e.moneda);
  const { user } = useAuth();
  const toast = useToast();
  const empresa = useEmpresaDocumentos().data ?? null;
  const { data: inventario } = useInventario();
  const [generandoPdf, setGenerandoPdf] = useState(false);

  async function descargarPdf() {
    setGenerandoPdf(true);
    try {
      // La unidad de medida no se guarda con la línea: se toma del artículo del inventario
      const unidades = new Map((inventario ?? []).map(a => [a.id, a.unidad ?? undefined]));
      const conUnidad = { ...e, items: (e.items ?? []).map(i => ({ ...i, item_unidad: i.item_unidad ?? unidades.get(i.inventario_id ?? '') })) };
      const blob = await pdfEntrada({ entrada: conUnidad, proveedor, empresa, usuario: user?.name ?? '' });
      descargarArchivo(blob, `Orden_de_Compra_${e.id}.pdf`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setGenerandoPdf(false);
    }
  }

  return (
    <div className="inv-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Entradas
        </button>
        <div className="tarjeta__barra-acciones">
          <MenuOtros opciones={[
            onEditar && e.estado !== 'Anulado' && { label: 'Editar', onSelect: onEditar },
            onAnular && e.estado !== 'Anulado' && { label: 'Anular entrada', destructiva: true, separado: true, onSelect: onAnular },
            onEliminar && { label: 'Eliminar', destructiva: true, onSelect: onEliminar },
          ]} />
        </div>
      </div>

      <div className="inv-ficha__hero" style={{ paddingTop: 'var(--s-2)' }}>
        <div className="inv-ficha__imagen-vacia"><PackagePlus size={28} /></div>
        <span className="inv-ficha__id">Entrada {e.id}</span>
        <h2 className="inv-ficha__nombre">{e.proveedor_nombre || e.motivo_entrada || 'Sin proveedor'}</h2>
        <span className={`inv-badge inv-badge--${tono === 'green' ? 'ok' : tono === 'red' ? 'critical' : 'warning'}`}>{etiquetaEstadoEntrada(e.estado)}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', justifyContent: 'center' }}>
        {onAprobar && <Button variant="primary" onClick={onAprobar}>Aprobar O/C</Button>}
        <Button variant="secondary" loading={generandoPdf} onClick={descargarPdf}>Descargar PDF</Button>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Datos generales</p>
        <div className="tarjeta__lista">
          <div className="dato"><span className="dato__label">Tipo</span><span className="dato__valor">{tipoDeOrden(e.tipo_orden)}</span></div>
          {e.fecha && <div className="dato"><span className="dato__label">Fecha</span><span className="dato__valor">{formatFechaPe(e.fecha)}</span></div>}
          {e.documento_referencia && <div className="dato"><span className="dato__label">N° documento</span><span className="dato__valor dato__valor--mono">{e.documento_referencia}</span></div>}
          <div className="dato"><span className="dato__label">Condición de pago</span><span className="dato__valor">{e.condicion_pago || 'Al contado'}{e.condicion_pago?.startsWith('A cr') && e.dias_credito ? ` · ${e.dias_credito} días` : ''}</span></div>
          <div className="dato"><span className="dato__label">Moneda</span><span className="dato__valor">{e.moneda === 'USD' ? `Dólares · TC ${e.tipo_cambio ?? '—'}` : 'Soles'}</span></div>
          {e.motivo_entrada && <div className="dato"><span className="dato__label">Motivo</span><span className="dato__valor">{e.motivo_entrada}</span></div>}
          {proveedor && <div className="dato"><span className="dato__label">RUC proveedor</span><span className="dato__valor dato__valor--mono">{proveedor.ruc || 'Sin RUC registrado'}</span></div>}
          {(e.creado_por || e.solicitante) && <div className="dato"><span className="dato__label">Solicitante</span><span className="dato__valor">{e.solicitante || e.creado_por}</span></div>}
          {e.observaciones && <div className="dato"><span className="dato__label">Observaciones</span><span className="dato__valor">{e.observaciones}</span></div>}
        </div>
      </div>

      {e.items && e.items.length > 0 && (
        <div>
          <p className="tarjeta__grupo-titulo">Artículos ({e.items.length})</p>
          <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
            <table className="inv-kardex">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th style={{ textAlign: 'right' }}>Cant.</th>
                  <th style={{ textAlign: 'right' }}>P.U.</th>
                  <th style={{ textAlign: 'right' }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {e.items.map((it, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{it.descripcion || it.inventario_id || '—'}</div>
                      {it.item_codigo_articulo && <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{it.item_codigo_articulo}</div>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{it.cantidad} {it.item_unidad ?? ''}</td>
                    <td style={{ textAlign: 'right', color: 'var(--label-2)' }}>
                      {formatMoneda(it.costo_unitario ?? 0, it.moneda)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {dinero(it.importe ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, padding: 'var(--s-2) var(--s-3)' }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '1rem', padding: 'var(--s-2) var(--s-3)' }}>
                    {dinero(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
