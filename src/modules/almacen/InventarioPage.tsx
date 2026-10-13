import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight, Boxes, FileSpreadsheet, Package, PackageMinus, PackagePlus,
  Plus, RefreshCw, SearchX,
} from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ToggleChips } from '../../core/ui/Chips';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import {
  coincideInv, eliminarArticulo, familiasUnicas, stockLabel, stockTono,
  useInventario, type ArticuloInv,
} from './api';
import { InventarioFicha } from './InventarioFicha';
import { InventarioFormulario } from './InventarioFormulario';
import './almacen.css';

type Filtro = 'todos' | 'ok' | 'warning' | 'critical';
const DIVIDIDO = '(min-width: 900px)';

export function InventarioPage() {
  const { data, isLoading, isError, error } = useInventario();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();
  const dividido = useMediaQuery(DIVIDIDO);

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [familias, setFamilias] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [seleccionado, setSeleccionado] = useState<ArticuloInv | null>(null);
  const [formulario, setFormulario] = useState<{ articulo: ArticuloInv | null } | null>(null);
  const [porEliminar, setPorEliminar] = useState<ArticuloInv | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const puedeCrear = can('inv.crear');
  const puedeEditar = can('inv.editar');
  const puedeEliminar = can('inv.eliminar');

  const items = data ?? [];

  const familiasDisp = useMemo(() => familiasUnicas(items), [items]);

  const metricas = useMemo(() => ({
    total: items.filter(i => i.activo).length,
    bajo: items.filter(i => i.activo && stockTono(i) === 'warning').length,
    sinStock: items.filter(i => i.activo && stockTono(i) === 'critical').length,
  }), [items]);

  const visibles = useMemo(() => items.filter(i =>
    i.activo &&
    (filtro === 'todos' || stockTono(i) === filtro) &&
    (!familias.length || familias.includes(i.familia ?? '')) &&
    (!tipos.length || tipos.includes(i.tipo ?? '')) &&
    coincideInv(i, busqueda),
  ), [items, filtro, familias, tipos, busqueda]);

  const hayFiltros = !!busqueda || filtro !== 'todos' || familias.length > 0 || tipos.length > 0;

  // En pantalla ancha, abre el primero automáticamente
  const efectivoSeleccionado = seleccionado ?? (dividido && visibles.length ? visibles[0] : null);

  function abrir(a: ArticuloInv) {
    haptic('selection');
    setSeleccionado(a);
  }

  async function confirmarEliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await eliminarArticulo(porEliminar.id);
      toast(`"${porEliminar.articulo}" eliminado del inventario`);
      haptic('success');
      if (efectivoSeleccionado?.id === porEliminar.id) setSeleccionado(null);
      setPorEliminar(null);
      await qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setEliminando(false);
    }
  }

  const soloFicha = !dividido && !!efectivoSeleccionado;

  const otros = (
    <MenuOtros opciones={[
      { label: 'Entradas', icon: <PackagePlus size={17} />, onSelect: () => abrirClasico('almacen/entradas') },
      { label: 'Salidas', icon: <PackageMinus size={17} />, onSelect: () => abrirClasico('almacen/salidas') },
      { label: 'Kardex', icon: <RefreshCw size={17} />, onSelect: () => abrirClasico('almacen/kardex') },
      { label: 'Recepción de compras', icon: <Package size={17} />, onSelect: () => abrirClasico('almacen/recepcion-compras') },
      { label: 'Exportar Excel', icon: <FileSpreadsheet size={17} />, separado: true,
        onSelect: () => abrirClasico('almacen/inventario') },
      { label: 'Importar desde Excel', icon: <FileSpreadsheet size={17} />,
        onSelect: () => abrirClasico('almacen/inventario') },
      { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, separado: true,
        onSelect: () => abrirClasico('almacen/inventario') },
    ]} />
  );

  const ficha = efectivoSeleccionado && (
    <InventarioFicha
      articulo={efectivoSeleccionado}
      onVolver={dividido ? undefined : () => setSeleccionado(null)}
      onEditar={puedeEditar ? () => setFormulario({ articulo: efectivoSeleccionado }) : undefined}
      onEliminar={puedeEliminar ? () => setPorEliminar(efectivoSeleccionado) : undefined}
      onActualizado={() => qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] })}
    />
  );

  return (
    <Page>
      {!soloFicha && (
        <PageHeader
          eyebrow="Almacén"
          title="Inventario"
          subtitle={isLoading ? 'Cargando…' : `${metricas.total} artículos${metricas.sinStock ? ` · ${metricas.sinStock} sin stock` : ''}${metricas.bajo ? ` · ${metricas.bajo} stock bajo` : ''}`}
          actions={
            <>
              {otros}
              {puedeCrear && (
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ articulo: null })}>
                  Nuevo
                </Button>
              )}
            </>
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : items.length === 0 ? (
        <EmptyState icon={<Boxes size={22} />} title="El inventario está vacío">
          {puedeCrear
            ? <>Agrega el primer artículo con <strong>Nuevo</strong>.</>
            : 'Cuando almacén registre artículos, aparecerán aquí.'}
        </EmptyState>
      ) : soloFicha ? ficha : (
        <div className={dividido ? 'inv-dividido' : ''}>
          {/* ─── Lista ─── */}
          <div className={dividido ? 'inv-dividido__lista' : ''}>
            <div className={dividido ? 'inv-dividido__filtros' : ''} style={dividido ? {} : { display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', marginBottom: 'var(--s-3)' }}>
              {!dividido && metricas.sinStock + metricas.bajo > 0 && (
                <div className="inv-metricas">
                  <div className="inv-metrica">
                    <span className="inv-metrica__num">{metricas.total}</span>
                    <span className="inv-metrica__label">Artículos</span>
                  </div>
                  <div className="inv-metrica">
                    <span className={`inv-metrica__num inv-metrica__num--warning`}>{metricas.bajo}</span>
                    <span className="inv-metrica__label">Stock bajo</span>
                  </div>
                  <div className="inv-metrica">
                    <span className={`inv-metrica__num inv-metrica__num--critical`}>{metricas.sinStock}</span>
                    <span className="inv-metrica__label">Sin stock</span>
                  </div>
                </div>
              )}
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, código o familia" />
              <SegmentedControl<Filtro> block label="Estado" value={filtro} onChange={setFiltro}
                options={[
                  { value: 'todos', label: 'Todos' },
                  { value: 'warning', label: 'Bajo' },
                  { value: 'critical', label: 'Sin stock' },
                  { value: 'ok', label: 'OK' },
                ]} />
              {familiasDisp.length > 1 && (
                <ToggleChips label="Familia" value={familias} onChange={setFamilias}
                  options={familiasDisp.map(f => ({ value: f, label: f }))} />
              )}
            </div>

            {visibles.length === 0 ? (
              <EmptyState icon={<SearchX size={22} />} title="Ningún artículo coincide">
                {hayFiltros && (
                  <button type="button" className="placas-limpiar"
                    onClick={() => { setBusqueda(''); setFiltro('todos'); setFamilias([]); setTipos([]); }}>
                    Quitar filtros
                  </button>
                )}
              </EmptyState>
            ) : (
              <div className="inv-lista" style={{ padding: dividido ? 'var(--s-2) var(--s-2)' : '0' }}>
                <AnimatePresence initial={false}>
                  {visibles.map(a => {
                    const tono = stockTono(a);
                    const activo = efectivoSeleccionado?.id === a.id;
                    return (
                      <motion.div key={a.id} layout={!reduce} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring}>
                        <button type="button" className={`inv-card${activo ? ' inv-card--activo' : ''}`} onClick={() => abrir(a)}>
                          <div className="inv-card__icono">
                            <Package size={18} strokeWidth={1.8} />
                          </div>
                          <div className="inv-card__cuerpo">
                            <span className="inv-card__nombre">{a.articulo || a.descripcion}</span>
                            <span className="inv-card__sub">{[a.familia, a.sistema, a.id].filter(Boolean).join(' · ')}</span>
                          </div>
                          <div className="inv-card__stock">
                            <span className="inv-card__num">{a.stock_actual % 1 === 0 ? a.stock_actual : a.stock_actual.toFixed(2)}</span>
                            <span className="inv-card__unidad">{a.unidad ?? 'und'}</span>
                            <span className={`inv-badge inv-badge--${tono}`}>{stockLabel(a)}</span>
                          </div>
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                <p style={{ textAlign: 'center', color: 'var(--label-2)', fontSize: '0.8125rem', padding: 'var(--s-4) 0' }}>
                  {visibles.length} artículo{visibles.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>

          {/* ─── Ficha (pantalla ancha) ─── */}
          {dividido && (
            <div className="inv-dividido__detalle">
              <AnimatePresence mode="wait" initial={false}>
                {ficha || (
                  <motion.div key="vacio" className="inv-sin-seleccion"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Boxes size={28} /> <span>Elige un artículo de la lista</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      <InventarioFormulario
        open={!!formulario}
        articulo={formulario?.articulo ?? null}
        onClose={() => setFormulario(null)}
        onGuardado={id => {
          setFormulario(null);
          qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] }).then(() => {
            if (id) {
              const nuevo = qc.getQueryData<ArticuloInv[]>(['almacen', 'inventario'])?.find(a => a.id === id);
              if (nuevo) setSeleccionado(nuevo);
            }
          });
        }}
      />

      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !eliminando && setPorEliminar(null)}
        onConfirm={confirmarEliminar}
        loading={eliminando}
        title={`¿Eliminar "${porEliminar?.articulo ?? ''}"?`}
        message="Se desactiva el artículo y no aparecerá más en el inventario. Su historial de kardex se conserva."
        confirmLabel="Eliminar"
      />
    </Page>
  );
}
