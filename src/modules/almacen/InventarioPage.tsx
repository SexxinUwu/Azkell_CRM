import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Boxes, Download, DollarSign, FileSpreadsheet, LayoutGrid, Package, PackageMinus, PackagePlus, PackageX, Plus, RefreshCw, SearchX, CheckSquare, TriangleAlert, Upload } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page } from '../../core/ui/Display';
import { TextInput } from '../../core/ui/Field';
import { BarraFiltros, GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { ChoiceChips } from '../../core/ui/Chips';
import { Combobox } from '../../core/ui/Combobox';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { formatSoles } from '../../core/lib/format';
import {
  claveAlmacen, coincideInv, eliminarArticulo, esServicio, familiasUnicas, SIN_ALMACEN, useAlmacenesLista, valorEnStock,
  useInventario, stockTono, type ArticuloInv, cambiarEstadoMasivo, enReposicion, esVigente, sinExistencias,
} from './api';
import { InventarioFicha } from './InventarioFicha';
import { InventarioFormulario } from './InventarioFormulario';
import { InventarioPortal } from './InventarioPortal';
import { ProductoCard } from './InventarioGrid';
import '../../core/ui/acciones-iconos.css';
import { ImportarInventario } from './ImportarInventario';
import { descargarPlantilla, exportar } from './excelInventario';
import './almacen.css';

type Filtro = 'todos' | 'ok' | 'warning' | 'critical';
type EstadoFiltro = 'todos' | ArticuloInv['estado_art'];
type Pestana = 'fisicos' | 'servicios';
type Orden = 'relevancia' | 'nombre' | 'stock' | 'valor';
/** Tarjetas por tanda: el resto se carga con "Cargar más" */
const TARJETAS_PAGINA = 24;
const PRIORIDAD: Record<'ok' | 'warning' | 'critical', number> = { critical: 0, warning: 1, ok: 2 };

/** Servicios (SERV-…) no se descuentan físicamente: van en su propia pestaña */
/** Valor del stock en soles (solo artículos con existencias) */
const valorItem = valorEnStock;

/** Filtro de stock sobre artículos vigentes: "Sin stock" y "Bajo" son las mismas cifras que los indicadores */
function coincideFiltro(i: ArticuloInv, f: Filtro): boolean {
  if (f === 'todos') return true;
  if (f === 'critical') return sinExistencias(i);
  if (f === 'warning') return enReposicion(i) && Number(i.stock_actual) > 0;
  return esVigente(i) && stockTono(i) === 'ok';
}

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
  const [formulario, setFormulario] = useState<{ articulo: ArticuloInv | null; servicio?: boolean } | null>(null);
  const [porEliminar, setPorEliminar] = useState<ArticuloInv | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [filtrando, setFiltrando] = useState(false);
  const [estadoArt, setEstadoArt] = useState<EstadoFiltro>('todos');
  const [seleccionando, setSeleccionando] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);

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
    coincideFiltro(i, filtro) &&
    (estadoArt === 'todos' || i.estado_art === estadoArt) &&
    (!familia || i.familia === familia) &&
    (!anaquel.trim() || (i.anaquel ?? '').toUpperCase().includes(anaquel.trim().toUpperCase())) &&
    coincideInv(i, busqueda),
  ), [base, filtro, estadoArt, familia, anaquel, busqueda]);

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

  const nFiltros = Number(!!anaquel.trim()) + Number(filtro !== 'todos') + Number(!!familia) + Number(estadoArt !== 'todos');
  const hayFiltros = !!busqueda || !!anaquel.trim() || filtro !== 'todos' || !!familia || estadoArt !== 'todos';

  // Con búsqueda o filtros, los indicadores son de lo filtrado; sin ellos, los totales de la pestaña.
  // Activos y alertas solo cuentan artículos vigentes (estado Activo): los inactivos o descontinuados no piden compra.
  const indicadores = useMemo(() => {
    const lista = hayFiltros ? filtrados : base;
    return {
      total: lista.filter(esVigente).length,
      valor: lista.reduce((s, i) => s + valorItem(i), 0),
      alerta: lista.filter(enReposicion).length,
      sinStock: lista.filter(sinExistencias).length,
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
    setMarcados(new Set());
  }, [busqueda, anaquel, filtro, estadoArt, familia, pestana, almacenSel, orden]);

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

  const alMarcar = useCallback((a: ArticuloInv) => {
    haptic('selection');
    setMarcados(prev => {
      const siguiente = new Set(prev);
      if (siguiente.has(a.id)) siguiente.delete(a.id);
      else siguiente.add(a.id);
      return siguiente;
    });
  }, []);

  async function marcarEstado(estado: ArticuloInv['estado_art']) {
    const n = marcados.size;
    setAplicando(true);
    try {
      await cambiarEstadoMasivo([...marcados], estado);
      toast(`${n} artículo${n !== 1 ? 's' : ''} ${n !== 1 ? 'quedaron' : 'quedó'} como ${estado.toLowerCase()}`);
      haptic('success');
      setMarcados(new Set());
      await qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setAplicando(false);
    }
  }

  // Acciones secundarias como iconos de color; el nombre aparece al pasar el mouse
  const accionesIconos = [
    { tip: 'Entradas', color: 'verde', icono: <PackagePlus size={18} />, onSelect: () => nav('/almacen/entradas') },
    { tip: 'Salidas', color: 'rojo', icono: <PackageMinus size={18} />, onSelect: () => nav('/almacen/salidas') },
    { tip: 'Kardex', color: 'azul', icono: <RefreshCw size={18} />, onSelect: () => nav('/almacen/kardex') },
    { tip: 'Recepción de compras', color: 'violeta', icono: <Package size={18} />, onSelect: () => nav('/almacen/recepcion-compras') },
    { tip: 'Exportar Excel', color: 'ambar', icono: <FileSpreadsheet size={18} />,
      onSelect: async () => {
        try { await exportar(visibles); haptic('success'); } catch (err) { toast(errorMessage(err), 'error'); }
      } },
    ...(puedeCrear ? [
      { tip: 'Importar desde Excel', color: 'azul', icono: <Upload size={18} />, onSelect: () => setImportando(true) },
      { tip: 'Descargar plantilla', color: 'ambar', icono: <Download size={18} />,
        onSelect: async () => { try { await descargarPlantilla(); } catch (err) { toast(errorMessage(err), 'error'); } } },
    ] : []),
  ];

  const botonesAcciones = (
    <div className="acciones-iconos">
      {accionesIconos.map(a => (
        <button key={a.tip} type="button" className={`acciones-iconos__boton acciones-iconos__boton--${a.color} inv-accion`}
          data-tip={a.tip} aria-label={a.tip} onClick={a.onSelect}>
          {a.icono}
        </button>
      ))}
    </div>
  );

  // Ficha dentro de una ventana sobre la lista. Editar o eliminar la cierran; al guardar se vuelve a abrir.
  const ficha = seleccionado && (
    <InventarioFicha
      articulo={seleccionado}
      onEditar={puedeEditar ? () => { setAbierto(false); setFormulario({ articulo: seleccionado }); } : undefined}
      onEliminar={puedeEliminar ? () => { setAbierto(false); setPorEliminar(seleccionado); } : undefined}
      onActualizado={() => {
        qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] });
        // Los movimientos del kardex se cachean por artículo: si no se invalidan, siguen mostrando la regularización anterior
        qc.invalidateQueries({ queryKey: ['almacen', 'kardex'] });
      }}
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
              {puedeEditar && (
                <Button variant={seleccionando ? 'primary' : 'secondary'} icon={<CheckSquare size={16} />}
                  onClick={() => { setSeleccionando(v => !v); setMarcados(new Set()); }}>
                  {seleccionando ? 'Terminar selección' : 'Seleccionar'}
                </Button>
              )}
              {botonesAcciones}
              {puedeCrear && (
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ articulo: null, servicio: pestana === 'servicios' })}>
                  {pestana === 'servicios' ? 'Nuevo servicio' : 'Nuevo artículo'}
                </Button>
              )}
            </div>
          </header>

          {/* ─── Indicadores ─── */}
          <div className="inv-kpis">
            <Kpi etiqueta="Valorización total" valor={formatSoles(indicadores.valor)} tono="valor"
              icono={<DollarSign size={18} />} sub="Solo con stock · en soles" />
            <Kpi etiqueta="Artículos activos" valor={indicadores.total} icono={<Boxes size={18} />}
              sub={tituloAlmacen} />
            <Kpi etiqueta="Alerta de reposición" valor={indicadores.alerta} tono="warning"
              icono={<TriangleAlert size={18} />} sub="Bajo el mínimo"
              accion={<button type="button" className="inv-kpi__enlace" onClick={() => setFiltro('critical')}>Filtrar críticos</button>} />
            <Kpi etiqueta="Sin stock" valor={indicadores.sinStock} tono="critical" icono={<PackageX size={18} />}
              sub="Reponer cuanto antes" />
          </div>

          {/* ─── Búsqueda y filtros ─── */}
          <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Buscar código, descripción, marca..."
            activos={nFiltros} onAbrirFiltros={() => setFiltrando(true)}>
            <SegmentedControl<Pestana> label="Tipo" value={pestana} onChange={setPestana}
              options={[
                { value: 'fisicos', label: 'Inventario físico' },
                { value: 'servicios', label: 'Catálogo servicios' },
              ]} />
          </BarraFiltros>

          {/* ─── Tarjetas de producto ─── */}
          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Ningún artículo coincide">
              {hayFiltros && (
                <button type="button" className="placas-limpiar"
                  onClick={() => { setBusqueda(''); setAnaquel(''); setFiltro('todos'); setFamilia(''); setEstadoArt('todos'); }}>
                  Quitar filtros
                </button>
              )}
            </EmptyState>
          ) : (
            <>
              <div className="prod-grid">
                {enPantalla.map(a => (
                  <ProductoCard key={a.id} a={a} onAbrir={abrir} seleccionando={seleccionando}
                    marcado={marcados.has(a.id)} onMarcar={alMarcar} />
                ))}
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
          {seleccionando && (
            <div className="inv-seleccion" role="region" aria-label="Selección masiva">
              <span className="inv-seleccion__texto"><strong>{marcados.size}</strong> seleccionado{marcados.size !== 1 ? 's' : ''}</span>
              <div className="inv-seleccion__acciones">
                <Button variant="plain" disabled={!visibles.length} onClick={() => setMarcados(new Set(visibles.map(a => a.id)))}>
                  Seleccionar lo filtrado ({visibles.length})
                </Button>
                <Button variant="plain" disabled={!marcados.size} onClick={() => setMarcados(new Set())}>Limpiar</Button>
                {(['Activo', 'Inactivo', 'Descontinuado'] as const).map(e => (
                  <Button key={e} variant="secondary" disabled={!marcados.size || aplicando} loading={aplicando}
                    onClick={() => marcarEstado(e)}>
                    Marcar {e.toLowerCase()}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={nFiltros} resultado={visibles.length} unidad="artículo"
        onLimpiar={() => { setAnaquel(''); setFiltro('todos'); setFamilia(''); setEstadoArt('todos'); }}>
        <GrupoFiltro titulo="Estado del artículo">
          <ChoiceChips<EstadoFiltro> label="Estado del artículo" value={estadoArt} onChange={setEstadoArt}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'Activo', label: 'Activos' },
              { value: 'Inactivo', label: 'Inactivos' },
              { value: 'Descontinuado', label: 'Descontinuados' },
            ]} />
        </GrupoFiltro>
        <GrupoFiltro titulo="Stock">
          <ChoiceChips<Filtro> label="Estado" value={filtro} onChange={setFiltro}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'warning', label: 'Bajo' },
              { value: 'critical', label: 'Sin stock' },
              { value: 'ok', label: 'OK' },
            ]} />
        </GrupoFiltro>
        <GrupoFiltro titulo="Familia">
          <Combobox enHoja tituloHoja="Familia" placeholder="Todas las familias" value={familia || null}
            onChange={v => setFamilia(v ?? '')} options={familias.map(f => ({ value: f, label: f }))} />
        </GrupoFiltro>
        <GrupoFiltro titulo="Anaquel">
          <TextInput value={anaquel} placeholder="Anaquel..." onChange={e => setAnaquel(e.target.value)} aria-label="Buscar por anaquel" />
        </GrupoFiltro>
        <GrupoFiltro titulo="Orden">
          <ChoiceChips<Orden> label="Orden" value={orden} onChange={setOrden}
            options={[
              { value: 'relevancia', label: 'Relevancia' },
              { value: 'nombre', label: 'Nombre' },
              { value: 'stock', label: 'Stock menor' },
              { value: 'valor', label: 'Mayor valor' },
            ]} />
        </GrupoFiltro>
      </HojaFiltros>

      {/* Ficha del artículo: ventana sobre la lista */}
      <Sheet open={abierto && !!seleccionado && !enPortal} onClose={() => setAbierto(false)} title="Artículo" ancho ligera>
        {ficha}
      </Sheet>

      <InventarioFormulario
        open={!!formulario}
        articulo={formulario?.articulo ?? null}
        inicial={formulario?.servicio ? { servicio: true } : null}
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
