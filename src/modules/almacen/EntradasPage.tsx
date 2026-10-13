import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, PackagePlus, Plus, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { anularEntrada, eliminarEntrada, useEntradas, type EntradaInv } from './api';
import { EntradaFormulario } from './EntradaFormulario';

type FiltroEstado = 'todos' | 'Pendiente' | 'Aprobado' | 'Anulado';

const estadoTono = (e: string | null) => {
  if (e === 'Aprobado') return 'green';
  if (e === 'Anulado') return 'red';
  return 'amber';
};

function FechaCorta({ fecha }: { fecha: string | null }) {
  if (!fecha) return <>—</>;
  return <>{fecha.split('T')[0]}</>;
}

function MontoFmt({ monto, moneda }: { monto: number; moneda: string }) {
  const fmt = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <>{moneda === 'USD' ? 'US$ ' : 'S/ '}{fmt.format(monto)}</>;
}

export function EntradasPage() {
  const { data, isLoading, isError, error } = useEntradas();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [seleccionada, setSeleccionada] = useState<EntradaInv | null>(null);
  const [formulario, setFormulario] = useState<{ entrada: EntradaInv | null } | null>(null);
  const [porEliminar, setPorEliminar] = useState<EntradaInv | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const puedeCrear = can('ent_inv.crear');
  const puedeEditar = can('ent_inv.editar');
  const puedeEliminar = can('ent_inv.eliminar');

  const entradas = data ?? [];

  const visibles = useMemo(() => entradas.filter(e => {
    const q = busqueda.toUpperCase();
    if (filtroEstado !== 'todos' && e.estado !== filtroEstado) return false;
    if (!q) return true;
    return (
      String(e.id).includes(q) ||
      (e.proveedor_nombre ?? '').toUpperCase().includes(q) ||
      (e.nro_documento ?? '').toUpperCase().includes(q) ||
      (e.motivo_entrada ?? '').toUpperCase().includes(q)
    );
  }), [entradas, busqueda, filtroEstado]);

  const resumen = useMemo(() => ({
    total: entradas.length,
    pendientes: entradas.filter(e => e.estado === 'Pendiente').length,
    monto: entradas.filter(e => e.estado !== 'Anulado').reduce((s, e) => s + (e.total_pen || 0), 0),
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
      ) : soloDetalle ? (
        <EntradaDetalle
          entrada={seleccionada}
          onVolver={() => setSeleccionada(null)}
          onEditar={puedeEditar ? () => setFormulario({ entrada: seleccionada }) : undefined}
          onEliminar={puedeEliminar ? () => setPorEliminar(seleccionada) : undefined}
          onAnular={puedeEditar ? async () => {
            try {
              await anularEntrada(seleccionada.id);
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
                S/ {new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 }).format(resumen.monto)}
              </span>
              <span className="inv-metrica__label">Monto total</span>
            </div>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
            <SearchField value={busqueda} onChange={setBusqueda} placeholder="Proveedor, N° documento o motivo" />
            <SegmentedControl<FiltroEstado> block label="Estado" value={filtroEstado} onChange={setFiltroEstado}
              options={[
                { value: 'todos', label: 'Todos' },
                { value: 'Pendiente', label: 'Pendiente' },
                { value: 'Aprobado', label: 'Aprobado' },
                { value: 'Anulado', label: 'Anulado' },
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
                    <button type="button" className="mov-fila" onClick={() => { haptic('selection'); setSeleccionada(e); }}>
                      <div className="mov-fila__icon" style={{ background: `var(--${estadoTono(e.estado)}-tint)`, color: `var(--${estadoTono(e.estado)}-ink)` }}>
                        <PackagePlus size={16} />
                      </div>
                      <div className="mov-fila__cuerpo">
                        <span className="mov-fila__titulo">{e.proveedor_nombre || e.motivo_entrada || 'Entrada #' + e.id}</span>
                        <span className="mov-fila__sub">{e.tipo_entrada || 'Compra'} · <FechaCorta fecha={e.fecha} /> · {e.items?.length ?? 0} ítem{e.items?.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="mov-fila__derecha">
                        <span className="mov-fila__monto"><MontoFmt monto={e.total_pen} moneda={e.moneda} /></span>
                        <span className={`inv-badge inv-badge--${estadoTono(e.estado) === 'green' ? 'ok' : estadoTono(e.estado) === 'red' ? 'critical' : 'warning'}`}>{e.estado || 'Pendiente'}</span>
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
  onAnular?: () => void;
}

function EntradaDetalle({ entrada: e, onVolver, onEditar, onEliminar, onAnular }: DetalleProps) {
  const tono = estadoTono(e.estado);
  const total = e.items?.reduce((s, i) => s + (i.importe || 0), 0) ?? e.total_pen;

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
        <span className="inv-ficha__id">Entrada #{e.id}</span>
        <h2 className="inv-ficha__nombre">{e.proveedor_nombre || e.motivo_entrada || 'Sin proveedor'}</h2>
        <span className={`inv-badge inv-badge--${tono === 'green' ? 'ok' : tono === 'red' ? 'critical' : 'warning'}`}>{e.estado || 'Pendiente'}</span>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Datos generales</p>
        <div className="tarjeta__lista">
          {e.tipo_entrada && <div className="dato"><span className="dato__label">Tipo</span><span className="dato__valor">{e.tipo_entrada}</span></div>}
          {e.fecha && <div className="dato"><span className="dato__label">Fecha</span><span className="dato__valor">{e.fecha.split('T')[0]}</span></div>}
          {e.nro_documento && <div className="dato"><span className="dato__label">N° documento</span><span className="dato__valor dato__valor--mono">{e.nro_documento}</span></div>}
          {e.almacen && <div className="dato"><span className="dato__label">Almacén</span><span className="dato__valor">{e.almacen}</span></div>}
          {e.motivo_entrada && <div className="dato"><span className="dato__label">Motivo</span><span className="dato__valor">{e.motivo_entrada}</span></div>}
          {e.proveedor_ruc && <div className="dato"><span className="dato__label">RUC proveedor</span><span className="dato__valor dato__valor--mono">{e.proveedor_ruc}</span></div>}
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
                      {it.moneda === 'USD' ? 'US$ ' : 'S/ '}{(it.costo_unitario ?? 0).toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      S/ {(it.importe ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, padding: 'var(--s-2) var(--s-3)' }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '1rem', padding: 'var(--s-2) var(--s-3)' }}>
                    S/ {total.toFixed(2)}
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
