import '../mantenimiento/mant.css';
import '../almacen/almacen.css';
import '../almacen/entradas.css';
import '../almacen/recepcion.css';
import '../../core/ui/botonesIcono.css';
import './almacenFlota.css';
import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine, ArrowUpFromLine, Boxes, CircleAlert, Coins, Eye, ImageOff, Package, Pencil, Plus, RefreshCw, SearchX, Truck, Warehouse,
} from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { BotonTip } from '../../core/ui/BotonTip';
import { EvidenciasArchivos } from '../../core/ui/EvidenciasArchivos';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { KpiTarjeta } from '../../core/ui/KpiTarjeta';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { usePlacas } from '../placas/api';
import {
  asignarAUnidad, guardarArticulo, ingresarAFlota, num, reingresarDeUnidad, useArticulosFlota,
  useHistorialFlota, useUnidadFlota, useUnidadesFlota,
  type ArticuloBase, type ArticuloFlota, type FiltrosHistorial, type LineaCantidad, type MovimientoFlota,
  type TipoMov, type UnidadFlota,
} from './almacenFlota';

const money = (v: unknown) => num(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cant = (v: unknown) => num(v).toLocaleString('es-PE', { maximumFractionDigits: 4 });
const decimal = (s: string) => Number(String(s).replace(',', '.')) || 0;
const hoy = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date());
const dia = (s: string | null | undefined) => {
  const v = String(s ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : '—';
};

const TIPO_TXT: Record<TipoMov, string> = { INGRESO: 'Ingreso', ASIGNACION: 'Salida a unidad', REINGRESO: 'Reingreso' };
const TIPO_TONO: Record<TipoMov, 'green' | 'accent' | 'amber'> = { INGRESO: 'green', ASIGNACION: 'accent', REINGRESO: 'amber' };

// "a ABC123" en una salida, "desde ABC123" en un reingreso: de qué unidad salió o a cuál fue
function detalleMov(m: { tipo: TipoMov; placa?: string | null; referencia?: string | null }) {
  if (m.tipo === 'ASIGNACION') return m.placa ? `a ${m.placa}` : '—';
  if (m.tipo === 'REINGRESO') return m.placa ? `desde ${m.placa}` : '—';
  return m.referencia ? `Ref. ${m.referencia}` : '—';
}

type Vista = 'articulos' | 'unidades' | 'historial';
type Modo = 'ingreso' | 'asignar' | 'reingresar';
type Toast = ReturnType<typeof useToast>;
type FiltroStock = 'TODOS' | 'BAJO' | 'SIN';

const TABLA_QUERY = '(min-width: 768px)';

const COL_ARTICULOS: ColumnaTabla[] = [
  { id: 'acciones', titulo: 'Acciones', ancho: 124, minimo: 110, alinear: 'center' },
  { id: 'foto', titulo: 'Foto', ancho: 70, minimo: 60, alinear: 'center' },
  { id: 'articulo', titulo: 'Artículo', ancho: 260 },
  { id: 'estado', titulo: 'Stock', ancho: 116, alinear: 'center' },
  { id: 'familia', titulo: 'Familia', ancho: 140 },
  { id: 'unidad', titulo: 'Medida', ancho: 80 },
  { id: 'almacen', titulo: 'En almacén', ancho: 110, alinear: 'right' },
  { id: 'unidades', titulo: 'En unidades', ancho: 110, alinear: 'right' },
  { id: 'donde', titulo: 'Dónde está', ancho: 230 },
  { id: 'minimo', titulo: 'Mínimo', ancho: 90, alinear: 'right' },
  { id: 'costo', titulo: 'Costo ref.', ancho: 110, alinear: 'right' },
  { id: 'valor', titulo: 'Valor', ancho: 120, alinear: 'right' },
];
const COL_UNIDADES: ColumnaTabla[] = [
  { id: 'acciones', titulo: 'Acciones', ancho: 124, minimo: 110, alinear: 'center' },
  { id: 'placa', titulo: 'Unidad', ancho: 150 },
  { id: 'articulos', titulo: 'Artículos', ancho: 110, alinear: 'right' },
  { id: 'piezas', titulo: 'Piezas', ancho: 100, alinear: 'right' },
  { id: 'valor', titulo: 'Valor', ancho: 130, alinear: 'right' },
  { id: 'ultimo', titulo: 'Último movimiento', ancho: 160 },
];
const COL_HISTORIAL: ColumnaTabla[] = [
  { id: 'fecha', titulo: 'Fecha', ancho: 110 },
  { id: 'codigo', titulo: 'Documento', ancho: 120 },
  { id: 'tipo', titulo: 'Operación', ancho: 150, alinear: 'center' },
  { id: 'articulo', titulo: 'Artículo', ancho: 280 },
  { id: 'unidad', titulo: 'Unidad / referencia', ancho: 170 },
  { id: 'cantidad', titulo: 'Cantidad', ancho: 110, alinear: 'right' },
  { id: 'usuario', titulo: 'Registró', ancho: 150 },
  { id: 'obs', titulo: 'Observaciones', ancho: 220 },
];
const COL_SALDO: ColumnaTabla[] = [
  { id: 'articulo', titulo: 'Artículo', ancho: 300 },
  { id: 'familia', titulo: 'Familia', ancho: 140 },
  { id: 'cantidad', titulo: 'Cantidad', ancho: 110, alinear: 'right' },
  { id: 'valor', titulo: 'Valor', ancho: 120, alinear: 'right' },
];

/** Estado del stock de un artículo en el almacén */
function estadoStock(a: ArticuloFlota): { tono: 'green' | 'amber' | 'red'; texto: string } {
  const hay = num(a.almacen);
  if (hay <= 0) return { tono: 'amber', texto: 'Sin stock' };
  if (num(a.stock_minimo) > 0 && hay < num(a.stock_minimo)) return { tono: 'red', texto: 'Bajo mínimo' };
  return { tono: 'green', texto: 'Disponible' };
}

/** Foto del artículo en miniatura; al tocarla se abre grande en otra pestaña */
function Miniatura({ url, nombre, grande }: { url?: string | null; nombre: string; grande?: boolean }) {
  const clase = `af-foto${grande ? ' af-foto--grande' : ''}`;
  if (!url) return <span className={`${clase} af-foto--vacia`} title="Sin foto"><ImageOff size={grande ? 20 : 16} /></span>;
  return (
    <button type="button" className={`${clase} af-foto--boton`} title="Ver foto" aria-label={`Ver foto de ${nombre}`}
      onClick={() => window.open(url, '_blank', 'noopener')}>
      <img src={url} alt={nombre} loading="lazy" />
    </button>
  );
}

// Almacén de flota: stock propio. Artículos (dónde está cada uno), unidades y historial de operaciones.
export function AlmacenFlotaPage() {
  const { can, user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const articulos = useArticulosFlota();
  const unidades = useUnidadesFlota();
  const [vista, setVista] = useState<Vista>('articulos');
  const [busqueda, setBusqueda] = useState('');
  const [filtroStock, setFiltroStock] = useState<FiltroStock>('TODOS');
  const [placa, setPlaca] = useState<string | null>(null);
  const [editar, setEditar] = useState<ArticuloBase | 'nuevo' | null>(null);
  const [movimiento, setMovimiento] = useState<{ modo: Modo; placa: string | null } | null>(null);
  const esTabla = useMediaQuery(TABLA_QUERY);
  const puedeEditar = can('sal_inv.crear', 'ent_inv.crear', 'inv.editar');
  const lista = useMemo(() => articulos.data ?? [], [articulos.data]);
  const listaUnidades = unidades.data ?? [];
  const usuario = user?.name ?? 'sistema';

  const totales = useMemo(() => lista.reduce((a, x) => ({
    almacen: a.almacen + num(x.almacen),
    unidades: a.unidades + num(x.en_unidades),
    valor: a.valor + num(x.total) * num(x.costo_referencial),
  }), { almacen: 0, unidades: 0, valor: 0 }), [lista]);
  const bajoMinimo = lista.filter(a => estadoStock(a).tono === 'red').length;

  const refrescar = () => qc.invalidateQueries({ queryKey: ['flota', 'almacen'] });
  const actualizar = () => { haptic('selection'); void refrescar(); };

  const hojas = <Sheets editar={editar} setEditar={setEditar} movimiento={movimiento} setMovimiento={setMovimiento} refrescar={refrescar} usuario={usuario} toast={toast} />;

  if (placa) {
    return (
      <>
        <UnidadDetalle
          placa={placa}
          puedeEditar={puedeEditar}
          esTabla={esTabla}
          onVolver={() => setPlaca(null)}
          onMovimiento={(modo, p) => setMovimiento({ modo, placa: p })}
        />
        {hojas}
      </>
    );
  }

  const q = busqueda.trim().toUpperCase();
  const articulosVisibles = lista.filter(a => {
    if (q && !(a.descripcion.toUpperCase().includes(q) || String(a.familia ?? '').toUpperCase().includes(q) || a.placas.some(p => p.placa.includes(q)))) return false;
    const e = estadoStock(a).tono;
    return filtroStock === 'TODOS' || (filtroStock === 'BAJO' && e === 'red') || (filtroStock === 'SIN' && estadoStock(a).texto === 'Sin stock');
  });
  const unidadesVisibles = q ? listaUnidades.filter(u => u.placa.includes(q)) : listaUnidades;

  return (
    <Page>
      <div className="af-page">
        <PageHeader
          eyebrow="Flota"
          title="Almacén"
          subtitle={articulos.isLoading ? 'Cargando…' : `${lista.length} ${lista.length === 1 ? 'artículo' : 'artículos'} · S/ ${money(totales.valor)}`}
          actions={(
            <div className="af-acciones">
              <BotonTip tip="Actualizar" className="btn btn--secondary btn--icon btn-tip btn-tip--celeste" onClick={actualizar}><RefreshCw size={17} /></BotonTip>
              {puedeEditar && (
                <>
                  <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setEditar('nuevo')}>Nuevo artículo</Button>
                  <Button variant="secondary" icon={<ArrowDownToLine size={16} />} onClick={() => setMovimiento({ modo: 'ingreso', placa: null })}>Ingresar</Button>
                  <Button variant="primary" icon={<ArrowUpFromLine size={16} />} onClick={() => setMovimiento({ modo: 'asignar', placa: null })}>Asignar a unidad</Button>
                </>
              )}
            </div>
          )}
        />

        {articulos.isLoading ? <PageLoader variante="camion" /> : articulos.isError ? <Notice tone="error">{errorMessage(articulos.error)}</Notice> : (
          <div>
            <div className="inv-kpis" style={{ marginBottom: 'var(--s-4)' }}>
              <KpiTarjeta etiqueta="Artículos" valor={String(lista.length)} sub="En el catálogo" icono={<Package size={18} />}
                onClick={() => { haptic('selection'); setVista('articulos'); setFiltroStock('TODOS'); }} activo={vista === 'articulos' && filtroStock === 'TODOS'} />
              <KpiTarjeta etiqueta="En almacén" valor={cant(totales.almacen)} sub={bajoMinimo ? `${bajoMinimo} bajo el mínimo` : 'Piezas disponibles'} icono={<Warehouse size={18} />}
                tono={bajoMinimo ? 'warning' : undefined}
                onClick={() => { haptic('selection'); setVista('articulos'); setFiltroStock(bajoMinimo ? 'BAJO' : 'TODOS'); }} activo={vista === 'articulos' && filtroStock === 'BAJO'} />
              <KpiTarjeta etiqueta="En unidades" valor={cant(totales.unidades)} sub={`${listaUnidades.length} ${listaUnidades.length === 1 ? 'unidad' : 'unidades'}`} icono={<Truck size={18} />}
                onClick={() => { haptic('selection'); setVista('unidades'); }} activo={vista === 'unidades'} />
              <KpiTarjeta etiqueta="Valor total" valor={`S/ ${money(totales.valor)}`} sub="A costo referencial" icono={<Coins size={18} />} tono="ok" />
            </div>

            <div className="oc-filtros" style={{ marginBottom: 'var(--s-4)' }}>
              <SearchField value={busqueda} onChange={setBusqueda}
                placeholder={vista === 'unidades' ? 'Placa de la unidad…' : vista === 'historial' ? 'Artículo…' : 'Artículo, familia o placa…'} />
              <div className="oc-filtros__fila">
                <SegmentedControl<Vista> label="Vista del almacén" value={vista} onChange={v => { haptic('selection'); setVista(v); }}
                  options={[{ value: 'articulos', label: 'Artículos' }, { value: 'unidades', label: 'Unidades' }, { value: 'historial', label: 'Historial' }]} />
                {vista === 'articulos' && (
                  <SelectInput aria-label="Estado del stock" value={filtroStock} onChange={e => setFiltroStock(e.target.value as FiltroStock)} style={{ width: 'auto' }}>
                    <option value="TODOS">Todo el stock</option>
                    <option value="BAJO">Bajo el mínimo</option>
                    <option value="SIN">Sin stock</option>
                  </SelectInput>
                )}
                {vista !== 'historial' && (
                  <span className="badge" style={{ marginLeft: 'auto' }}>
                    {vista === 'articulos' ? articulosVisibles.length : unidadesVisibles.length} {(vista === 'articulos' ? articulosVisibles.length : unidadesVisibles.length) === 1 ? 'registro' : 'registros'}
                  </span>
                )}
              </div>
            </div>

            {vista === 'articulos' && (
              <ArticulosVista articulos={articulosVisibles} hayFiltro={!!q || filtroStock !== 'TODOS'} esTabla={esTabla} puedeEditar={puedeEditar}
                onEditar={a => setEditar(a)} onVerUnidad={setPlaca} onIngresar={() => setMovimiento({ modo: 'ingreso', placa: null })} />
            )}
            {vista === 'unidades' && (
              <UnidadesVista unidades={unidadesVisibles} hayFiltro={!!q} esTabla={esTabla} puedeEditar={puedeEditar} cargando={unidades.isLoading}
                onAbrir={setPlaca} onMovimiento={(modo, p) => setMovimiento({ modo, placa: p })} />
            )}
            {vista === 'historial' && <HistorialVista busqueda={busqueda} esTabla={esTabla} />}
          </div>
        )}

        {hojas}
      </div>
    </Page>
  );
}

// Hojas compartidas: editar artículo y registrar movimiento (ingreso, asignación o reingreso)
function Sheets({ editar, setEditar, movimiento, setMovimiento, refrescar, usuario, toast }: {
  editar: ArticuloBase | 'nuevo' | null; setEditar: (v: ArticuloBase | 'nuevo' | null) => void;
  movimiento: { modo: Modo; placa: string | null } | null; setMovimiento: (v: { modo: Modo; placa: string | null } | null) => void;
  refrescar: () => unknown; usuario: string; toast: Toast;
}) {
  return (
    <>
      <ArticuloSheet
        open={editar !== null}
        articulo={editar === 'nuevo' ? null : editar}
        usuario={usuario}
        onClose={() => setEditar(null)}
        onHecho={refrescar}
        toast={toast}
      />
      <MovimientoSheet
        open={movimiento !== null}
        modo={movimiento?.modo ?? 'ingreso'}
        placaInicial={movimiento?.placa ?? null}
        usuario={usuario}
        onClose={() => setMovimiento(null)}
        onHecho={refrescar}
        toast={toast}
      />
    </>
  );
}

/** Placas donde está un artículo (hasta 3 y «+n») */
function DondeEsta({ a, onVerUnidad }: { a: ArticuloFlota; onVerUnidad: (placa: string) => void }) {
  if (!a.placas.length) return <span className="c-secondary">No está en ninguna unidad</span>;
  return (
    <span className="af-chips">
      {a.placas.slice(0, 3).map(p => (
        <button key={p.placa} type="button" className="af-chip af-chip--boton" title={`Ver ${p.placa}`} onClick={() => onVerUnidad(p.placa)}>
          <LicensePlate plate={p.placa} size="sm" /><span>{cant(p.cantidad)}</span>
        </button>
      ))}
      {a.placas.length > 3 && <span className="c-secondary">y {a.placas.length - 3} más</span>}
    </span>
  );
}

function ArticulosVista({ articulos, hayFiltro, esTabla, puedeEditar, onEditar, onVerUnidad, onIngresar }: {
  articulos: ArticuloFlota[]; hayFiltro: boolean; esTabla: boolean; puedeEditar: boolean;
  onEditar: (a: ArticuloBase) => void; onVerUnidad: (placa: string) => void; onIngresar: () => void;
}) {
  if (articulos.length === 0) {
    return (
      <EmptyState icon={hayFiltro ? <SearchX size={22} /> : <Package size={22} />} title={hayFiltro ? 'Ningún artículo coincide' : 'Sin artículos'}>
        {hayFiltro ? 'Prueba con otro nombre, familia o placa.' : 'Crea artículos y registra su ingreso al almacén.'}
        {!hayFiltro && puedeEditar && <> <button type="button" className="placas-limpiar" onClick={onIngresar}>Registrar un ingreso</button></>}
      </EmptyState>
    );
  }
  if (!esTabla) {
    return (
      <div className="tarjeta__lista">
        {articulos.map(a => {
          const e = estadoStock(a);
          return (
            <div key={a.id} className="af-fila">
              <Miniatura url={a.imagen_url} nombre={a.descripcion} grande />
              <div className="af-fila__cuerpo">
                <span className="af-fila__titulo">{a.descripcion}</span>
                <span className="af-fila__sub">{a.familia || 'Sin familia'} · {cant(a.almacen)} en almacén · {cant(a.en_unidades)} en unidades</span>
                <DondeEsta a={a} onVerUnidad={onVerUnidad} />
                <span className={`rec-estado rec-estado--${e.tono}`} style={{ alignSelf: 'flex-start' }}>{e.texto}</span>
              </div>
              {puedeEditar && <Button variant="secondary" size="sm" iconOnly icon={<Pencil size={16} />} title="Editar" aria-label={`Editar ${a.descripcion}`} onClick={() => onEditar(a)} />}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <TablaRedimensionable id="flota-almacen-articulos" columnas={COL_ARTICULOS} ariaLabel="Artículos del almacén" altoMax="68vh" fijas={0}>
      {articulos.map(a => {
        const e = estadoStock(a);
        return (
          <tr key={a.id}>
            <Celda alinear="center">
              <div style={{ display: 'inline-flex', gap: 6 }}>
                {puedeEditar && <BotonTip tip="Editar artículo" className="btn btn--secondary btn--icon btn--sm btn-tip btn-tip--azul" aria-label={`Editar ${a.descripcion}`} onClick={() => onEditar(a)}><Pencil size={16} /></BotonTip>}
                {a.imagen_url && <BotonTip tip="Ver foto" className="btn btn--secondary btn--icon btn--sm btn-tip btn-tip--celeste" aria-label={`Ver foto de ${a.descripcion}`} onClick={() => window.open(a.imagen_url as string, '_blank', 'noopener')}><Eye size={16} /></BotonTip>}
              </div>
            </Celda>
            <Celda alinear="center"><Miniatura url={a.imagen_url} nombre={a.descripcion} /></Celda>
            <Celda><strong>{a.descripcion}</strong></Celda>
            <Celda alinear="center"><span className={`rec-estado rec-estado--${e.tono}`}>{e.texto}</span></Celda>
            <Celda>{a.familia || '—'}</Celda>
            <Celda>{a.unidad || '—'}</Celda>
            <Celda alinear="right"><strong>{cant(a.almacen)}</strong></Celda>
            <Celda alinear="right">{cant(a.en_unidades)}</Celda>
            <Celda><DondeEsta a={a} onVerUnidad={onVerUnidad} /></Celda>
            <Celda alinear="right">{num(a.stock_minimo) > 0 ? cant(a.stock_minimo) : '—'}</Celda>
            <Celda alinear="right">S/ {money(a.costo_referencial)}</Celda>
            <Celda alinear="right"><strong>S/ {money(num(a.total) * num(a.costo_referencial))}</strong></Celda>
          </tr>
        );
      })}
    </TablaRedimensionable>
  );
}

function AccionesUnidad({ u, puedeEditar, onAbrir, onMovimiento }: {
  u: UnidadFlota; puedeEditar: boolean; onAbrir: (placa: string) => void; onMovimiento: (modo: Modo, placa: string) => void;
}) {
  return (
    <div style={{ display: 'inline-flex', gap: 6 }}>
      <BotonTip tip="Ver detalle" className="btn btn--secondary btn--icon btn--sm btn-tip btn-tip--azul" aria-label={`Ver ${u.placa}`} onClick={() => onAbrir(u.placa)}><Eye size={16} /></BotonTip>
      {puedeEditar && (
        <>
          <BotonTip tip="Asignar artículos" className="btn btn--secondary btn--icon btn--sm btn-tip btn-tip--verde" aria-label={`Asignar a ${u.placa}`} onClick={() => onMovimiento('asignar', u.placa)}><ArrowUpFromLine size={16} /></BotonTip>
          <BotonTip tip="Reingresar al almacén" className="btn btn--secondary btn--icon btn--sm btn-tip btn-tip--celeste" aria-label={`Reingresar desde ${u.placa}`} onClick={() => onMovimiento('reingresar', u.placa)}><ArrowDownToLine size={16} /></BotonTip>
        </>
      )}
    </div>
  );
}

function UnidadesVista({ unidades, hayFiltro, esTabla, puedeEditar, cargando, onAbrir, onMovimiento }: {
  unidades: UnidadFlota[]; hayFiltro: boolean; esTabla: boolean; puedeEditar: boolean; cargando: boolean;
  onAbrir: (placa: string) => void; onMovimiento: (modo: Modo, placa: string) => void;
}) {
  if (cargando) return <PageLoader variante="camion" />;
  if (unidades.length === 0) {
    return (
      <EmptyState icon={hayFiltro ? <SearchX size={22} /> : <Warehouse size={22} />} title={hayFiltro ? 'Ninguna unidad coincide' : 'Ninguna unidad tiene artículos'}>
        {hayFiltro ? 'Prueba con otra placa.' : 'Cuando asignes artículos a una unidad aparecerá aquí.'}
      </EmptyState>
    );
  }
  if (!esTabla) {
    return (
      <div className="tarjeta__lista">
        {unidades.map(u => (
          <div key={u.placa} className="af-fila">
            <button type="button" className="af-fila__abrir" onClick={() => { haptic('selection'); onAbrir(u.placa); }}>
              <span className="af-foto af-foto--grande af-foto--vacia"><Truck size={20} /></span>
              <span className="af-fila__cuerpo">
                <LicensePlate plate={u.placa} size="sm" />
                <span className="af-fila__sub">{u.articulos} artículo(s) · {cant(u.piezas)} pieza(s) · {dia(u.ultimo)}</span>
              </span>
              <strong>S/ {money(u.valor)}</strong>
            </button>
          </div>
        ))}
      </div>
    );
  }
  return (
    <TablaRedimensionable id="flota-almacen-unidades" columnas={COL_UNIDADES} ariaLabel="Unidades con artículos" altoMax="68vh">
      {unidades.map(u => (
        <tr key={u.placa}>
          <Celda alinear="center"><AccionesUnidad u={u} puedeEditar={puedeEditar} onAbrir={onAbrir} onMovimiento={onMovimiento} /></Celda>
          <Celda><LicensePlate plate={u.placa} size="sm" /></Celda>
          <Celda alinear="right">{u.articulos}</Celda>
          <Celda alinear="right">{cant(u.piezas)}</Celda>
          <Celda alinear="right"><strong>S/ {money(u.valor)}</strong></Celda>
          <Celda>{dia(u.ultimo)}</Celda>
        </tr>
      ))}
    </TablaRedimensionable>
  );
}

/** Tabla de operaciones (historial general o de una unidad) */
function TablaMovimientos({ id, movimientos, esTabla, conPlaca = true }: { id: string; movimientos: MovimientoFlota[]; esTabla: boolean; conPlaca?: boolean }) {
  if (!esTabla) {
    return (
      <div className="tarjeta__lista">
        {movimientos.map(m => (
          <div key={m.id} className="dato">
            <span className="dato__label" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span><Badge tone={TIPO_TONO[m.tipo]}>{TIPO_TXT[m.tipo]}</Badge>{conPlaca ? ` ${detalleMov(m)}` : ''}</span>
              <span style={{ fontSize: '0.8125rem' }}>{m.descripcion}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--label-2)' }}>{dia(m.fecha)} · {m.codigo} · {m.usuario ?? '—'}</span>
            </span>
            <span className="dato__valor dato__valor--mono">{m.tipo === 'ASIGNACION' ? '−' : '+'}{cant(m.cantidad)} {m.unidad ?? ''}</span>
          </div>
        ))}
      </div>
    );
  }
  const columnas = conPlaca ? COL_HISTORIAL : COL_HISTORIAL.filter(c => c.id !== 'unidad');
  return (
    <TablaRedimensionable id={id} columnas={columnas} ariaLabel="Operaciones del almacén" altoMax="68vh">
      {movimientos.map(m => (
        <tr key={m.id}>
          <Celda>{dia(m.fecha)}</Celda>
          <Celda mono>{m.codigo}</Celda>
          <Celda alinear="center"><Badge tone={TIPO_TONO[m.tipo]}>{TIPO_TXT[m.tipo]}</Badge></Celda>
          <Celda><strong>{m.descripcion}</strong></Celda>
          {conPlaca && <Celda>{detalleMov(m)}</Celda>}
          <Celda alinear="right">
            <strong style={{ color: m.tipo === 'ASIGNACION' ? 'var(--accent-ink)' : 'var(--green-ink)' }}>{m.tipo === 'ASIGNACION' ? '−' : '+'}{cant(m.cantidad)}</strong> {m.unidad ?? ''}
          </Celda>
          <Celda>{m.usuario ?? '—'}</Celda>
          <Celda>{m.observaciones || '—'}</Celda>
        </tr>
      ))}
    </TablaRedimensionable>
  );
}

// Historial: todas las operaciones con filtros. Un reingreso dice de qué unidad salió.
function HistorialVista({ busqueda, esTabla }: { busqueda: string; esTabla: boolean }) {
  const [f, setF] = useState<Omit<FiltrosHistorial, 'q'>>({ desde: '', hasta: '', tipo: 'TODOS', placa: '' });
  const q = useHistorialFlota({ ...f, q: busqueda });
  const set = (cambio: Partial<typeof f>) => setF(prev => ({ ...prev, ...cambio }));
  const movimientos = q.data ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div className="oc-filtros__fila">
        <div className="oc-fechas">
          <TextInput type="date" aria-label="Desde" value={f.desde} max={f.hasta || undefined} onChange={e => set({ desde: e.target.value })} />
          <span className="t-footnote c-secondary">a</span>
          <TextInput type="date" aria-label="Hasta" value={f.hasta} min={f.desde || undefined} onChange={e => set({ hasta: e.target.value })} />
          <button type="button" className="oc-cotizacion__quitar" aria-label="Quitar fechas" onClick={() => set({ desde: '', hasta: '' })}>×</button>
        </div>
        <SelectInput aria-label="Tipo de operación" value={f.tipo} onChange={e => set({ tipo: e.target.value as FiltrosHistorial['tipo'] })} style={{ width: 'auto' }}>
          <option value="TODOS">Todas las operaciones</option>
          <option value="INGRESO">Ingresos</option>
          <option value="ASIGNACION">Salidas a unidad</option>
          <option value="REINGRESO">Reingresos</option>
        </SelectInput>
        <TextInput aria-label="Placa" placeholder="Placa" value={f.placa} onChange={e => set({ placa: e.target.value })} style={{ width: '8rem' }} />
        <span className="badge" style={{ marginLeft: 'auto' }}>{movimientos.length} {movimientos.length === 1 ? 'registro' : 'registros'}</span>
      </div>

      {q.isLoading ? <PageLoader variante="camion" /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : movimientos.length === 0 ? (
        <EmptyState icon={<SearchX size={22} />} title="Sin operaciones">Cambia los filtros o registra un movimiento.</EmptyState>
      ) : <TablaMovimientos id="flota-almacen-historial" movimientos={movimientos} esTabla={esTabla} />}
    </div>
  );
}

// Ficha de una unidad: lo que tiene ahora y todos sus movimientos (salidas y reingresos)
function UnidadDetalle({ placa, puedeEditar, esTabla, onVolver, onMovimiento }: {
  placa: string; puedeEditar: boolean; esTabla: boolean; onVolver: () => void;
  onMovimiento: (modo: Modo, placa: string) => void;
}) {
  const q = useUnidadFlota(placa);
  const saldo = q.data?.saldo ?? [];
  const movimientos = q.data?.movimientos ?? [];
  const valor = saldo.reduce((a, s) => a + num(s.saldo) * num(s.costo_referencial), 0);
  const piezas = saldo.reduce((a, s) => a + num(s.saldo), 0);

  return (
    <Page push>
      <div className="af-page">
        <div className="ot-ficha">
          <div className="tarjeta__barra">
            <button type="button" className="tarjeta__volver" onClick={onVolver}><span style={{ fontSize: '1.2rem' }}>‹</span> Almacén</button>
            {puedeEditar && (
              <div className="tarjeta__barra-acciones af-acciones">
                <Button variant="secondary" icon={<ArrowDownToLine size={16} />} onClick={() => onMovimiento('reingresar', placa)} disabled={!saldo.length}>Reingresar</Button>
                <Button variant="primary" icon={<ArrowUpFromLine size={16} />} onClick={() => onMovimiento('asignar', placa)}>Asignar</Button>
              </div>
            )}
          </div>

          <div className="ot-ficha__hero">
            <span className="ot-estado ot-estado--neutral">Unidad</span>
            <LicensePlate plate={placa} size="lg" />
            <span className="ot-ficha__id">{saldo.length} artículo(s) · {cant(piezas)} pieza(s) · S/ {money(valor)}</span>
          </div>

          {q.isLoading ? <PageLoader variante="camion" /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : (
            <>
              <div className="inv-kpis">
                <KpiTarjeta etiqueta="Artículos" valor={String(saldo.length)} sub="En la unidad" icono={<Boxes size={18} />} />
                <KpiTarjeta etiqueta="Piezas" valor={cant(piezas)} sub="En total" icono={<Package size={18} />} />
                <KpiTarjeta etiqueta="Valor" valor={`S/ ${money(valor)}`} sub="A costo referencial" icono={<Coins size={18} />} tono="ok" />
              </div>

              <SeccionTabla titulo="En la unidad ahora">
                {saldo.length === 0 ? <p className="c-secondary">La unidad no tiene artículos.</p> : (
                  <TablaRedimensionable id="flota-almacen-unidad-saldo" columnas={COL_SALDO} ariaLabel="Artículos en la unidad" altoMax="40vh">
                    {saldo.map(s => (
                      <tr key={s.articulo_id}>
                        <Celda><strong>{s.descripcion}</strong></Celda>
                        <Celda>{s.familia || '—'}</Celda>
                        <Celda alinear="right">{cant(s.saldo)} {s.unidad ?? ''}</Celda>
                        <Celda alinear="right"><strong>S/ {money(num(s.saldo) * num(s.costo_referencial))}</strong></Celda>
                      </tr>
                    ))}
                  </TablaRedimensionable>
                )}
              </SeccionTabla>

              <SeccionTabla titulo="Movimientos">
                {movimientos.length === 0 ? <p className="c-secondary">Sin movimientos.</p>
                  : <TablaMovimientos id="flota-almacen-unidad-movs" movimientos={movimientos} esTabla={esTabla} conPlaca={false} />}
              </SeccionTabla>
            </>
          )}
        </div>
      </div>
    </Page>
  );
}

function SeccionTabla({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="tarjeta__grupo-titulo">{titulo}</p>
      {children}
    </div>
  );
}

// Selección de artículos con cantidad (compartido por ingreso, asignación y reingreso)
interface OpcionArticulo { id: number; nombre: string; detalle: string; max: number | null; imagen?: string | null }

function SelectorCantidades({ opciones, cantidades, onCambio }: {
  opciones: OpcionArticulo[]; cantidades: Record<number, number>; onCambio: (c: Record<number, number>) => void;
}) {
  const [filtro, setFiltro] = useState('');
  const lista = useMemo(() => {
    const f = filtro.trim().toUpperCase();
    return (f ? opciones.filter(a => a.nombre.toUpperCase().includes(f)) : opciones).slice(0, 80);
  }, [opciones, filtro]);
  const set = (id: number, v: number) => {
    const nx = { ...cantidades };
    if (v > 0) nx[id] = v; else delete nx[id];
    onCambio(nx);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
      <SearchField value={filtro} onChange={setFiltro} placeholder="Buscar artículo…" />
      <div className="tarjeta__lista">
        {lista.map(a => {
          const sel = cantidades[a.id] ?? 0;
          return (
            <div key={a.id} className="dato" style={{ alignItems: 'center', gap: 'var(--s-3)' }}>
              {a.imagen !== undefined && <Miniatura url={a.imagen} nombre={a.nombre} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{a.nombre}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--label-2)' }}>{a.detalle}</div>
              </div>
              <input type="number" min={0} max={a.max ?? undefined} step="any" aria-label={`Cantidad de ${a.nombre}`}
                value={sel || ''} placeholder="0"
                onChange={e => set(a.id, Math.min(Number(e.target.value) || 0, a.max ?? Number.MAX_SAFE_INTEGER))}
                style={{ width: 72, height: 32, textAlign: 'center', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)' }} />
            </div>
          );
        })}
        {lista.length === 0 && <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Sin artículos con ese nombre.</span></div>}
      </div>
    </div>
  );
}

function ArticuloSheet({ open, articulo, usuario, onClose, onHecho, toast }: {
  open: boolean; articulo: ArticuloBase | null; usuario: string; onClose: () => void; onHecho: () => unknown; toast: Toast;
}) {
  const vacio = { descripcion: '', familia: '', unidad: '', costo: '', minimo: '' };
  const [form, setForm] = useState(vacio);
  const [fotos, setFotos] = useState<File[]>([]);
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abiertoPara, setAbiertoPara] = useState<boolean>(false);
  if (open && !abiertoPara) {
    setAbiertoPara(true);
    setForm(articulo ? {
      descripcion: articulo.descripcion, familia: articulo.familia ?? '', unidad: articulo.unidad ?? '',
      costo: String(num(articulo.costo_referencial)), minimo: String(num(articulo.stock_minimo)),
    } : vacio);
    setFotos([]); setIntento(false); setError(null);
  }
  if (!open && abiertoPara) setAbiertoPara(false);

  const set = (campo: keyof typeof vacio) => (e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [campo]: e.target.value }));
  // La foto es obligatoria: en un artículo nuevo, o en uno que todavía no la tiene
  const yaTieneFoto = !!articulo?.imagen_url;
  const faltaFoto = fotos.length === 0 && !yaTieneFoto;

  async function guardar() {
    setError(null); setIntento(true);
    if (!form.descripcion.trim()) { setError('Escribe la descripción del artículo.'); return; }
    if (faltaFoto) { setError('Sube o toma una foto del artículo.'); haptic('warning'); return; }
    setEnviando(true);
    try {
      const r = await guardarArticulo(articulo?.id ?? null, {
        descripcion: form.descripcion.trim(), familia: form.familia.trim(), unidad: form.unidad.trim(),
        costo_referencial: decimal(form.costo), stock_minimo: decimal(form.minimo),
      }, usuario, fotos[0] ?? null);
      haptic('success'); toast(r.mensaje ?? 'Artículo guardado');
      await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={articulo ? 'Editar artículo' : 'Nuevo artículo'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <div className="field field--wide">
          {yaTieneFoto && fotos.length === 0 && (
            <div className="af-foto-actual">
              <Miniatura url={articulo?.imagen_url} nombre={articulo?.descripcion ?? ''} grande />
              <span className="c-secondary">Foto actual. Sube otra solo si quieres cambiarla.</span>
            </div>
          )}
          <EvidenciasArchivos archivos={fotos} onCambio={setFotos} max={1} soloImagenes obligatorio={!yaTieneFoto} mostrarError={intento}
            titulo="Foto del artículo" ayuda="Toma una foto con la cámara o elige una de tu galería" disabled={enviando} />
        </div>

        <Field label="Descripción" wide>{p => <TextInput {...p} value={form.descripcion} onChange={set('descripcion')} placeholder="Ej. Trinca de 3/8" />}</Field>
        <Field label="Familia">{p => <TextInput {...p} value={form.familia} onChange={set('familia')} placeholder="Ej. Herramientas" />}</Field>
        <Field label="Unidad de medida">{p => <TextInput {...p} value={form.unidad} onChange={set('unidad')} placeholder="UND, LT, KG…" />}</Field>
        <Field label="Costo referencial (S/)">{p => <TextInput {...p} inputMode="decimal" value={form.costo} onChange={set('costo')} placeholder="0.00" />}</Field>
        <Field label="Stock mínimo">{p => <TextInput {...p} inputMode="decimal" value={form.minimo} onChange={set('minimo')} placeholder="0" />}</Field>
      </div>
    </Sheet>
  );
}

function MovimientoSheet({ open, modo, placaInicial, usuario, onClose, onHecho, toast }: {
  open: boolean; modo: Modo; placaInicial: string | null; usuario: string; onClose: () => void; onHecho: () => unknown; toast: Toast;
}) {
  const articulos = useArticulosFlota();
  const unidades = useUnidadesFlota();
  const placas = usePlacas();
  const [placa, setPlaca] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [referencia, setReferencia] = useState('');
  const [obs, setObs] = useState('');
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abiertoPara, setAbiertoPara] = useState<boolean>(false);
  if (open && !abiertoPara) {
    setAbiertoPara(true);
    setPlaca(placaInicial ?? ''); setFecha(hoy()); setReferencia(''); setObs(''); setCantidades({}); setError(null);
  }
  if (!open && abiertoPara) setAbiertoPara(false);

  // Al reingresar, los artículos son solo los que tiene la unidad elegida
  const saldoUnidad = useUnidadFlota(open && modo === 'reingresar' && placa ? placa : null);

  const opciones = useMemo<OpcionArticulo[]>(() => {
    if (modo === 'ingreso') {
      return (articulos.data ?? []).map((a: ArticuloFlota) => ({
        id: a.id, nombre: a.descripcion, detalle: `${a.familia ?? ''} · en almacén ${cant(a.almacen)}`.replace(/^ · /, ''), max: null, imagen: a.imagen_url ?? null,
      }));
    }
    if (modo === 'asignar') {
      return (articulos.data ?? []).filter(a => num(a.almacen) > 0).map((a: ArticuloFlota) => ({
        id: a.id, nombre: a.descripcion, detalle: `en almacén: ${cant(a.almacen)} ${a.unidad ?? ''}`, max: num(a.almacen), imagen: a.imagen_url ?? null,
      }));
    }
    const fotos = new Map((articulos.data ?? []).map(a => [a.id, a.imagen_url ?? null]));
    return (saldoUnidad.data?.saldo ?? []).map(s => ({
      id: s.articulo_id, nombre: s.descripcion, detalle: `en la unidad: ${cant(s.saldo)} ${s.unidad ?? ''}`, max: num(s.saldo), imagen: fotos.get(s.articulo_id) ?? null,
    }));
  }, [modo, articulos.data, saldoUnidad.data]);

  const titulo = modo === 'ingreso' ? 'Ingresar al almacén'
    : modo === 'asignar' ? (placaInicial ? `Asignar a ${placaInicial}` : 'Asignar artículos a una unidad')
    : (placaInicial ? `Reingresar desde ${placaInicial}` : 'Reingresar desde una unidad');
  const boton = modo === 'ingreso' ? 'Registrar ingreso' : modo === 'asignar' ? 'Asignar a la unidad' : 'Reingresar al almacén';

  async function guardar() {
    setError(null);
    const items: LineaCantidad[] = Object.entries(cantidades).map(([id, c]) => ({ articulo_id: Number(id), cantidad: c }));
    if (modo !== 'ingreso' && !placa) { setError('Elige la unidad.'); return; }
    if (!items.length) { setError('Elige al menos un artículo con cantidad.'); return; }
    setEnviando(true);
    try {
      const r = modo === 'ingreso'
        ? await ingresarAFlota(items, fecha, referencia.trim(), obs.trim(), usuario)
        : modo === 'asignar'
          ? await asignarAUnidad(placa, items, fecha, obs.trim(), usuario)
          : await reingresarDeUnidad(placa, items, fecha, obs.trim(), usuario);
      haptic('success'); toast(r.mensaje ?? 'Listo');
      await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const cargandoArticulos = modo === 'reingresar' ? saldoUnidad.isLoading : articulos.isLoading;
  const totalPiezas = Object.values(cantidades).reduce((s, c) => s + c, 0);

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={titulo}
      footer={(
        <>
          <span className="af-pie-total">{Object.keys(cantidades).length} artículo(s) · {cant(totalPiezas)} pieza(s)</span>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={enviando}>{boton}</Button>
        </>
      )}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}><span style={{ whiteSpace: 'pre-line' }}>{error}</span></Notice></div>}

        {modo !== 'ingreso' && !placaInicial && (
          <Field label={modo === 'reingresar' ? 'Unidad que devuelve' : 'Unidad'} wide>
            {p => (
              <PlacaPicker {...p} value={placa} onChange={v => { setPlaca(v); setCantidades({}); }}
                opciones={modo === 'reingresar'
                  ? (unidades.data ?? []).map(u => ({ placa: u.placa, detalle: `${u.articulos} artículo(s) · ${cant(u.piezas)} pieza(s)` }))
                  : (placas.data ?? []).map(x => ({ placa: x.placa, detalle: x.cliente }))} />
            )}
          </Field>
        )}

        <Field label="Fecha">{p => <TextInput {...p} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />}</Field>
        {modo === 'ingreso' && (
          <Field label="Guía, factura o proveedor">{p => <TextInput {...p} value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Opcional" />}</Field>
        )}
        <Field label="Observaciones" wide>{p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} placeholder={modo === 'reingresar' ? 'Ej. cambio de repuesto' : 'Opcional'} />}</Field>

        <div className="field field--wide">
          {cargandoArticulos ? <Notice>Cargando artículos…</Notice>
            : modo === 'reingresar' && !placa ? <Notice>Elige la unidad para ver lo que tiene.</Notice>
            : <SelectorCantidades opciones={opciones} cantidades={cantidades} onCambio={setCantidades} />}
        </div>
        <div className="field field--wide" style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>
          {modo === 'ingreso' && 'Lo que ingreses suma al almacén con el costo referencial del artículo.'}
          {modo === 'asignar' && 'Solo aparecen artículos con stock en el almacén. Lo asignado sale del almacén y queda en la unidad.'}
          {modo === 'reingresar' && 'Lo que reingreses vuelve al almacén y sale de la unidad. No puedes reingresar más de lo que tiene.'}
        </div>
      </div>
    </Sheet>
  );
}
