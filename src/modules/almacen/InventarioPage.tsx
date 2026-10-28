import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, Boxes, DollarSign, FileSpreadsheet, LayoutGrid, Package, PackageMinus,
  PackagePlus, PackageX, Plus, RefreshCw, SearchX, TriangleAlert,
} from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page } from '../../core/ui/Display';
import { SearchField, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
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
import { ProductoCard } from './InventarioGrid';
import { ImportarInventario } from './ImportarInventario';
import { descargarPlantilla, exportar } from './excelInventario';
import './almacen.css';

type Filtro = 'todos' | 'ok' | 'warning' | 'critical';
type Pestana = 'fisicos' | 'servicios';
type Orden = 'relevancia' | 'nombre' | 'stock' | 'valor';
/** Tarjetas por tanda: el resto se carga con "Cargar más" */
const TARJETAS_PAGINA = 24;
const PRIORIDAD: Record<'ok' | 'warning' | 'critical', number> = { critical: 0, warning: 1, ok: 2 };

/** Servicios (SERV-…) no se descuentan físicamente: van en su propia pestaña */
const esServicio = (a: ArticuloInv) => a.tipo === 'Servicio' || a.id.toUpperCase().startsWith('SERV');
/** Valor del stock al costo referencial (en la moneda que maneja cada artículo, convertido a soles) */
const valorItem = (a: ArticuloInv) => Number(a.stock_actual) * (a.moneda === 'USD' ? Number(a.costo_soles ?? 0) : Number(a.costo_referencial ?? 0));

function Kpi({ etiqueta, valor, sub, icono, tono, accion }: {
  etiqueta: string; valor: ReactNode; sub: ReactNode; icono: ReactNode;
  tono?: 'ok' | 'warning' | 'critical' | 'valor'; accion?: ReactNode;
}) {
  return (
    <div className="inv-kpi">
      <div className="inv-kpi__cuerpo">
        <div className="inv-kpi__etiqueta">{etiqueta}</div>
        <div className={`inv-kpi__valor${tono ? ` inv-kpi__valor--${tono}` : ''}`}>{valor}</div>
        <div className="inv-kpi__sub">{sub}{accion}</div>
      </div>
      <span className={`inv-kpi__icono${tono && tono !== 'valor' ? ` inv-kpi__icono--${tono}` : ''}`}>{icono}</span>
    </div>
  );
}

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
  const [familia, setFamilia] = useState('');
  const [orden, setOrden] = useState<Orden>('relevancia');
  const [seleccionado, setSeleccionado] = useState<ArticuloInv | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [cuantos, setCuantos] = useState(TARJETAS_PAGINA);
  const [formulario, setFormulario] = useState<{ articulo: ArticuloInv | null } | null>(null);
  const [porEliminar, setPorEliminar] = useState<ArticuloInv | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [importando, setImportando] = useState(false);

  const puedeCrear = can('inv.crear');
  const puedeEditar = can('inv.editar');
  const puedeEliminar = can('inv.eliminar');

  const items = useMemo(() => data ?? [], [data]);
  const familias = useMemo(() => familiasUnicas(items), [items]);
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

  const filtrados = useMemo(() => base.filter(i =>
    (filtro === 'todos' || stockTono(i) === filtro) &&
    (!familia || i.familia === familia) &&
    (!anaquel.trim() || (i.anaquel ?? '').toUpperCase().includes(anaquel.trim().toUpperCase())) &&
    coincideInv(i, busqueda),
  ), [base, filtro, familia, anaquel, busqueda]);

  // Orden: primero lo que hay que reponer (sin stock, bajo) y luego por nombre
  const visibles = useMemo(() => {
    const lista = [...filtrados];
    switch (orden) {
      case 'nombre': return lista.sort((x, y) => (x.articulo || '').localeCompare(y.articulo || '', 'es'));
      case 'stock': return lista.sort((x, y) => Number(x.stock_actual) - Number(y.stock_actual));
      case 'valor': return lista.sort((x, y) => valorItem(y) - valorItem(x));
      default: return lista.sort((x, y) =>
        PRIORIDAD[stockTono(x)] - PRIORIDAD[stockTono(y)] || (x.articulo || '').localeCompare(y.articulo || '', 'es'));
    }
  }, [filtrados, orden]);

  const hayFiltros = !!busqueda || !!anaquel.trim() || filtro !== 'todos' || !!familia;

  // Con búsqueda o filtros, los indicadores son de lo filtrado; sin ellos, los totales de la pestaña
  const indicadores = useMemo(() => {
    const lista = hayFiltros ? filtrados : base;
    return {
      total: lista.length,
      valor: lista.reduce((s, i) => s + valorItem(i), 0),
      bajo: lista.filter(i => stockTono(i) === 'warning').length,
      sinStock: lista.filter(i => stockTono(i) === 'critical').length,
    };
  }, [base, filtrados, hayFiltros]);

  const abrir = useCallback((a: ArticuloInv) => {
    haptic('selection');
    setSeleccionado(a);
    setAbierto(true);
  }, []);

  // Al cambiar búsqueda o filtros, la lista vuelve a la primera tanda
  useEffect(() => {
    setCuantos(TARJETAS_PAGINA);
  }, [busqueda, anaquel, filtro, familia, pestana, almacenSel, orden]);

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
  const enPantalla = visibles.slice(0, cuantos);

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
        <div className="inv-pagina">
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
            <Kpi etiqueta="Valorización total" valor={formatSoles(indicadores.valor)} tono="valor"
              icono={<DollarSign size={18} />} sub="Stock × costo referencial" />
            <Kpi etiqueta="Artículos activos" valor={indicadores.total} icono={<Boxes size={18} />}
              sub={tituloAlmacen} />
            <Kpi etiqueta="Alerta de reposición" valor={indicadores.bajo + indicadores.sinStock} tono="warning"
              icono={<TriangleAlert size={18} />} sub="Bajo el mínimo"
              accion={<button type="button" className="inv-kpi__enlace" onClick={() => setFiltro('critical')}>Filtrar críticos</button>} />
            <Kpi etiqueta="Sin stock" valor={indicadores.sinStock} tono="critical" icono={<PackageX size={18} />}
              sub="Reponer cuanto antes" />
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

          <div className="inv-pastillas" role="group" aria-label="Familia">
            <button type="button" className={`inv-pastilla${!familia ? ' inv-pastilla--activa' : ''}`} onClick={() => setFamilia('')}>
              Todos los artículos
            </button>
            {familias.map(f => (
              <button key={f} type="button" className={`inv-pastilla${familia === f ? ' inv-pastilla--activa' : ''}`}
                onClick={() => setFamilia(f)}>{f}</button>
            ))}
          </div>

          <div className="inv-barra inv-barra--fila">
            <SegmentedControl<Filtro> label="Estado" value={filtro} onChange={setFiltro}
              options={[
                { value: 'todos', label: 'Todos' },
                { value: 'warning', label: 'Bajo' },
                { value: 'critical', label: 'Sin stock' },
                { value: 'ok', label: 'OK' },
              ]} />
            <label className="inv-orden">
              <span>Orden</span>
              <select value={orden} onChange={e => setOrden(e.target.value as Orden)}>
                <option value="relevancia">Relevancia</option>
                <option value="nombre">Nombre</option>
                <option value="stock">Stock menor</option>
                <option value="valor">Mayor valor</option>
              </select>
            </label>
          </div>

          {/* ─── Tarjetas de producto ─── */}
          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Ningún artículo coincide">
              {hayFiltros && (
                <button type="button" className="placas-limpiar"
                  onClick={() => { setBusqueda(''); setAnaquel(''); setFiltro('todos'); setFamilia(''); }}>
                  Quitar filtros
                </button>
              )}
            </EmptyState>
          ) : (
            <>
              <div className="prod-grid">
                {enPantalla.map(a => <ProductoCard key={a.id} a={a} onAbrir={abrir} />)}
              </div>
              {visibles.length > cuantos && (
                <button type="button" className="mov__mas pressable inv-mas" onClick={() => setCuantos(n => n + TARJETAS_PAGINA)}>
                  Cargar más · {visibles.length - cuantos} restantes
                </button>
              )}
              <p className="inv-contador">
                Mostrando {enPantalla.length} de {visibles.length} artículo{visibles.length !== 1 ? 's' : ''}
              </p>
            </>
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
