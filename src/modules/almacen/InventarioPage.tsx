import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, Boxes, CircleCheck, Clock, FileSpreadsheet, LayoutGrid, Package,
  PackageMinus, PackagePlus, Plus, RefreshCw, SearchX, Table2, Truck, TriangleAlert, Warehouse,
} from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page } from '../../core/ui/Display';
import { SearchField, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { MultiSelect } from '../../core/ui/MultiSelect';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { formatSoles } from '../../core/lib/format';
import { abrirClasico } from '../../core/layout/navigation';
import {
  claveAlmacen, coincideInv, eliminarArticulo, familiasUnicas, SIN_ALMACEN, useAlmacenesLista,
  useInventario, stockTono, type ArticuloInv,
} from './api';
import { InventarioFicha } from './InventarioFicha';
import { InventarioFormulario } from './InventarioFormulario';
import { InventarioPortal } from './InventarioPortal';
import { ImportarInventario } from './ImportarInventario';
import { descargarPlantilla, exportar } from './excelInventario';
import './almacen.css';

type Filtro = 'todos' | 'ok' | 'warning' | 'critical';
type Pestana = 'fisicos' | 'servicios';
const ESTADO_TEXTO = { ok: 'Stock OK', warning: 'Stock bajo', critical: '¡Reponer!' } as const;
/** Filas por tanda en la lista: el resto se carga con "Cargar más" */
const FILAS_PAGINA = 40;

/** Servicios (SERV-…) no se descuentan físicamente: van en su propia pestaña */
const esServicio = (a: ArticuloInv) => a.tipo === 'Servicio' || a.id.toUpperCase().startsWith('SERV');
const dosDecimales = (n: number) => n.toFixed(2);

function Kpi({ etiqueta, valor, tono, icono }: { etiqueta: string; valor: number; tono?: 'ok' | 'warning' | 'critical'; icono: ReactNode }) {
  return (
    <div className="inv-kpi">
      <div>
        <div className="inv-kpi__etiqueta">{etiqueta}</div>
        <div className={`inv-kpi__valor${tono ? ` inv-kpi__valor--${tono}` : ''}`}>{valor}</div>
      </div>
      <span className={`inv-kpi__icono${tono ? ` inv-kpi__icono--${tono}` : ''}`}>{icono}</span>
    </div>
  );
}

/** Fila de la lista: mismo formato que el clásico (miniatura, nombre, familia • código, chips, estado, cantidad y precio) */
const FilaArticulo = memo(function FilaArticulo({ a, activo, onAbrir }: { a: ArticuloInv; activo: boolean; onAbrir: (a: ArticuloInv) => void }) {
  const tono = stockTono(a);
  const costo = a.moneda === 'USD' ? Number(a.costo_soles ?? 0) : Number(a.costo_referencial ?? 0);
  return (
    <button type="button" className={`inv-card pressable${activo ? ' inv-card--activo' : ''}`} onClick={() => onAbrir(a)}>
      {a.imagen_url
        ? <img src={a.imagen_url} alt="" className="inv-card__foto" />
        : <div className={`inv-card__icono${tono !== 'ok' ? ` inv-card__icono--${tono}` : ''}`}><Package size={22} strokeWidth={1.8} /></div>}
      <div className="inv-card__cuerpo">
        <span className="inv-card__nombre">{a.articulo || a.descripcion}</span>
        <span className="inv-card__sub">{[a.familia, a.id].filter(Boolean).join(' • ')}</span>
        <div className="inv-card__chips">
          <span className="inv-chip inv-chip--almacen"><Warehouse size={12} /> {a.almacen || 'Sin almacén'}</span>
          {a.anaquel && <span className="inv-chip"><Table2 size={12} /> Anaquel: {a.anaquel}</span>}
          {a.ultimo_proveedor && <span className="inv-chip"><Truck size={12} /> {a.ultimo_proveedor}</span>}
        </div>
        <span className={`inv-estado inv-estado--${tono}`}>{ESTADO_TEXTO[tono]}</span>
      </div>
      <div className="inv-card__stock">
        <div className="inv-card__cantidad">
          <span className="inv-card__num">{dosDecimales(Number(a.stock_actual))}</span>
          <span className="inv-card__unidad">{a.unidad ?? 'Unidades'}</span>
        </div>
        <span className="inv-card__costo">{formatSoles(costo)}</span>
        <span className="inv-card__limites">Min: {a.stock_min} | Máx: {a.stock_max}</span>
      </div>
    </button>
  );
});

export function InventarioPage() {
  const { data, isLoading, isError, error } = useInventario();
  const almacenesQ = useAlmacenesLista();
  const nav = useNavigate();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const [enPortal, setEnPortal] = useState(true);
  const [almacenSel, setAlmacenSel] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>('fisicos');
  const [busqueda, setBusqueda] = useState('');
  const [anaquel, setAnaquel] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [familias, setFamilias] = useState<string[]>([]);
  const [seleccionado, setSeleccionado] = useState<ArticuloInv | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [cuantos, setCuantos] = useState(FILAS_PAGINA);
  const [formulario, setFormulario] = useState<{ articulo: ArticuloInv | null } | null>(null);
  const [porEliminar, setPorEliminar] = useState<ArticuloInv | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [importando, setImportando] = useState(false);

  const puedeCrear = can('inv.crear');
  const puedeEditar = can('inv.editar');
  const puedeEliminar = can('inv.eliminar');

  const items = useMemo(() => data ?? [], [data]);
  const familiasDisp = useMemo(() => familiasUnicas(items), [items]);
  // Solo los almacenes registrados: el campo almacén de los artículos es texto libre y no cuenta como almacén
  const almacenes = useMemo(() => (almacenesQ.data ?? []).map(a => a.nombre), [almacenesQ.data]);
  const registrados = useMemo(() => new Set(almacenes.map(claveAlmacen)), [almacenes]);

  const enAlmacen = useCallback((i: ArticuloInv) => {
    if (!almacenSel) return true;
    if (almacenSel === SIN_ALMACEN) return !registrados.has(claveAlmacen(i.almacen));
    return claveAlmacen(i.almacen) === claveAlmacen(almacenSel);
  }, [almacenSel, registrados]);

  // Lo que muestra la pantalla antes de buscar: almacén elegido y pestaña (físicos o servicios)
  const base = useMemo(() => items.filter(i =>
    i.activo && esServicio(i) === (pestana === 'servicios') && enAlmacen(i),
  ), [items, pestana, enAlmacen]);

  const visibles = useMemo(() => base.filter(i =>
    (filtro === 'todos' || stockTono(i) === filtro) &&
    (!familias.length || familias.includes(i.familia ?? '')) &&
    (!anaquel.trim() || (i.anaquel ?? '').toUpperCase().includes(anaquel.trim().toUpperCase())) &&
    coincideInv(i, busqueda),
  ), [base, filtro, familias, anaquel, busqueda]);

  const hayFiltros = !!busqueda || !!anaquel.trim() || filtro !== 'todos' || familias.length > 0;

  // Con búsqueda o filtros, los contadores son de lo filtrado; sin ellos, los totales de la pestaña
  const metricas = useMemo(() => {
    const lista = hayFiltros ? visibles : base;
    return {
      total: lista.length,
      ok: lista.filter(i => stockTono(i) === 'ok').length,
      bajo: lista.filter(i => stockTono(i) === 'warning').length,
      sinStock: lista.filter(i => stockTono(i) === 'critical').length,
    };
  }, [base, visibles, hayFiltros]);

  const abrir = useCallback((a: ArticuloInv) => {
    haptic('selection');
    setSeleccionado(a);
    setAbierto(true);
  }, []);

  // Al cambiar búsqueda o filtros, la lista vuelve a la primera tanda
  useEffect(() => {
    setCuantos(FILAS_PAGINA);
  }, [busqueda, anaquel, filtro, familias, pestana, almacenSel]);

  function elegirAlmacen(nombre: string | null) {
    setAlmacenSel(nombre);
    setAbierto(false);
    setEnPortal(false);
  }

  async function confirmarEliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await eliminarArticulo(porEliminar.id);
      toast(`"${porEliminar.articulo}" eliminado del inventario`);
      haptic('success');
      setPorEliminar(null);
      await qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setEliminando(false);
    }
  }

  const otros = (
    <MenuOtros opciones={[
      { label: 'Entradas', icon: <PackagePlus size={17} />, onSelect: () => nav('/almacen/entradas') },
      { label: 'Salidas', icon: <PackageMinus size={17} />, onSelect: () => nav('/almacen/salidas') },
      { label: 'Kardex', icon: <RefreshCw size={17} />, onSelect: () => nav('/almacen/kardex') },
      { label: 'Recepción de compras', icon: <Package size={17} />, onSelect: () => nav('/almacen/recepcion-compras') },
      { label: 'Exportar Excel', detalle: hayFiltros ? `Solo los ${visibles.length} filtrados` : `${visibles.length} artículos`,
        icon: <FileSpreadsheet size={17} />, separado: true,
        onSelect: async () => {
          try { await exportar(visibles); haptic('success'); } catch (err) { toast(errorMessage(err), 'error'); }
        } },
      puedeCrear && { label: 'Importar desde Excel', detalle: 'Crea artículos en lote', icon: <FileSpreadsheet size={17} />,
        onSelect: () => setImportando(true) },
      puedeCrear && { label: 'Descargar plantilla', icon: <FileSpreadsheet size={17} />,
        onSelect: async () => { try { await descargarPlantilla(); } catch (err) { toast(errorMessage(err), 'error'); } } },
      { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, separado: true,
        onSelect: () => abrirClasico('almacen/inventario') },
    ]} />
  );

  // Ficha dentro de una ventana sobre la lista. Editar o eliminar la cierran; al guardar se vuelve a abrir.
  const ficha = seleccionado && (
    <InventarioFicha
      articulo={seleccionado}
      onEditar={puedeEditar ? () => { setAbierto(false); setFormulario({ articulo: seleccionado }); } : undefined}
      onEliminar={puedeEliminar ? () => { setAbierto(false); setPorEliminar(seleccionado); } : undefined}
      onActualizado={() => qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] })}
    />
  );

  const tituloAlmacen = almacenSel === SIN_ALMACEN ? 'Sin almacén válido' : (almacenSel ?? 'Todos los almacenes');

  return (
    <Page>
      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : items.length === 0 ? (
        <EmptyState icon={<Boxes size={22} />} title="El inventario está vacío">
          {puedeCrear
            ? <>Agrega el primer artículo con <strong>Nuevo artículo</strong>.</>
            : 'Cuando almacén registre artículos, aparecerán aquí.'}
        </EmptyState>
      ) : enPortal ? (
        <InventarioPortal items={items} almacenes={almacenes} onElegir={elegirAlmacen} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {/* ─── Encabezado ─── */}
          <header className="inv-head">
            <div className="inv-head__icono"><Package size={22} /></div>
            <div className="inv-head__texto">
              <h2 className="inv-head__titulo">
                Inventario de almacén <span className="inv-tag inv-tag--accent">{tituloAlmacen}</span>
              </h2>
              <p className="inv-head__sub">Catálogo de repuestos, insumos y control de existencias en tiempo real</p>
            </div>
            <div className="inv-head__acciones">
              <Button variant="secondary" icon={<LayoutGrid size={16} />} onClick={() => setEnPortal(true)}>Almacenes</Button>
              {otros}
              {puedeCrear && (
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ articulo: null })}>
                  Nuevo artículo
                </Button>
              )}
            </div>
          </header>

          {/* ─── Indicadores ─── */}
          <div className="inv-kpis">
            <Kpi etiqueta="Total artículos" valor={metricas.total} icono={<Boxes size={18} />} />
            <Kpi etiqueta="Stock óptimo" valor={metricas.ok} tono="ok" icono={<CircleCheck size={18} />} />
            <Kpi etiqueta="Stock bajo / alerta" valor={metricas.bajo} tono="warning" icono={<Clock size={18} />} />
            <Kpi etiqueta="Sin stock / quiebre" valor={metricas.sinStock} tono="critical" icono={<TriangleAlert size={18} />} />
          </div>

          {/* ─── Búsqueda y filtros ─── */}
          <div className="inv-barra">
            <div className="inv-barra__buscar">
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar código, descripción, marca..." />
            </div>
            <TextInput className="inv-barra__anaquel" value={anaquel} placeholder="Anaquel..."
              onChange={e => setAnaquel(e.target.value)} aria-label="Buscar por anaquel" />
            <SegmentedControl<Pestana> label="Tipo" value={pestana} onChange={setPestana}
              options={[
                { value: 'fisicos', label: 'Inventario físico' },
                { value: 'servicios', label: 'Catálogo servicios' },
              ]} />
          </div>
          <div className="inv-barra">
            <div style={{ flex: 1, minWidth: 220 }}>
              <SegmentedControl<Filtro> block label="Estado" value={filtro} onChange={setFiltro}
                options={[
                  { value: 'todos', label: 'Todos' },
                  { value: 'warning', label: 'Bajo' },
                  { value: 'critical', label: 'Sin stock' },
                  { value: 'ok', label: 'OK' },
                ]} />
            </div>
            {familiasDisp.length > 1 && (
              <MultiSelect label="Familia" value={familias} onChange={setFamilias} options={familiasDisp} />
            )}
          </div>

          {/* ─── Lista ─── */}
          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Ningún artículo coincide">
              {hayFiltros && (
                <button type="button" className="placas-limpiar"
                  onClick={() => { setBusqueda(''); setAnaquel(''); setFiltro('todos'); setFamilias([]); }}>
                  Quitar filtros
                </button>
              )}
            </EmptyState>
          ) : (
            <div className="inv-lista">
              {visibles.slice(0, cuantos).map(a => (
                <FilaArticulo key={a.id} a={a} activo={abierto && seleccionado?.id === a.id} onAbrir={abrir} />
              ))}
              {visibles.length > cuantos && (
                <button type="button" className="mov__mas pressable" onClick={() => setCuantos(n => n + FILAS_PAGINA)}>
                  Cargar más · {visibles.length - cuantos} restantes
                </button>
              )}
              <p style={{ textAlign: 'center', color: 'var(--label-2)', fontSize: '0.8125rem', padding: 'var(--s-4) 0' }}>
                Mostrando {Math.min(cuantos, visibles.length)} de {visibles.length} artículo{visibles.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Ficha del artículo: ventana sobre la lista */}
      <Sheet open={abierto && !!seleccionado && !enPortal} onClose={() => setAbierto(false)} title="Artículo" ancho ligera>
        {ficha}
      </Sheet>

      <InventarioFormulario
        open={!!formulario}
        articulo={formulario?.articulo ?? null}
        onClose={() => setFormulario(null)}
        onGuardado={id => {
          setFormulario(null);
          qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] }).then(() => {
            if (id) {
              const nuevo = qc.getQueryData<ArticuloInv[]>(['almacen', 'inventario'])?.find(a => a.id === id);
              if (nuevo) { setSeleccionado(nuevo); setAbierto(true); }
            }
          });
        }}
      />

      <ImportarInventario open={importando} onClose={() => setImportando(false)} existentes={items} />

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
