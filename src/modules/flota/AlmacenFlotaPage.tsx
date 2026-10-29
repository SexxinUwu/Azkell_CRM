import '../mantenimiento/mant.css';
import '../almacen/almacen.css';
import './almacenFlota.css';
import { useMemo, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, CircleAlert, Package, Pencil, Plus, SearchX, Truck, Warehouse } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, TextInput } from '../../core/ui/Field';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { usePlacas } from '../placas/api';
import {
  asignarAUnidad, guardarArticulo, ingresarAFlota, num, reingresarDeUnidad, useArticuloFlota, useArticulosFlota,
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

const TIPO_TXT: Record<TipoMov, string> = { INGRESO: 'Ingreso', ASIGNACION: 'Salida a unidad', REINGRESO: 'Reingreso de unidad' };
const TIPO_COLOR: Record<TipoMov, string> = { INGRESO: 'var(--green-ink)', ASIGNACION: 'var(--accent-ink)', REINGRESO: 'var(--orange-ink, #b45309)' };

// "a ABC123" en una salida, "desde ABC123" en un reingreso: de qué unidad salió o a cuál fue
function detalleMov(m: { tipo: TipoMov; placa?: string | null; referencia?: string | null }) {
  if (m.tipo === 'ASIGNACION') return `a ${m.placa ?? '—'}`;
  if (m.tipo === 'REINGRESO') return `desde ${m.placa ?? '—'}`;
  return m.referencia ? `ref. ${m.referencia}` : '';
}

type Vista = 'articulos' | 'unidades' | 'historial';
type Modo = 'ingreso' | 'asignar' | 'reingresar';
type Toast = ReturnType<typeof useToast>;

// Almacén de flota: stock propio. Artículos (dónde está cada uno), unidades, historial y kardex por artículo.
export function AlmacenFlotaPage() {
  const { can, user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const articulos = useArticulosFlota();
  const unidades = useUnidadesFlota();
  const [vista, setVista] = useState<Vista>('articulos');
  const [busqueda, setBusqueda] = useState('');
  const [articuloId, setArticuloId] = useState<number | null>(null);
  const [placa, setPlaca] = useState<string | null>(null);
  const [editar, setEditar] = useState<ArticuloBase | 'nuevo' | null>(null);
  const [movimiento, setMovimiento] = useState<{ modo: Modo; placa: string | null } | null>(null);
  const puedeEditar = can('sal_inv.crear', 'ent_inv.crear', 'inv.editar');
  const lista = articulos.data ?? [];
  const listaUnidades = unidades.data ?? [];
  const usuario = user?.name ?? 'sistema';

  const totales = useMemo(() => lista.reduce((a, x) => ({
    almacen: a.almacen + num(x.almacen),
    unidades: a.unidades + num(x.en_unidades),
    valor: a.valor + num(x.total) * num(x.costo_referencial),
  }), { almacen: 0, unidades: 0, valor: 0 }), [lista]);

  const refrescar = () => qc.invalidateQueries({ queryKey: ['flota', 'almacen'] });

  if (articuloId != null) {
    return (
      <>
        <ArticuloDetalle
          id={articuloId}
          puedeEditar={puedeEditar}
          onVolver={() => setArticuloId(null)}
          onEditar={a => setEditar(a)}
          onVerUnidad={p => { setArticuloId(null); setPlaca(p); }}
        />
        <Sheets editar={editar} setEditar={setEditar} movimiento={movimiento} setMovimiento={setMovimiento} refrescar={refrescar} usuario={usuario} toast={toast} />
      </>
    );
  }

  if (placa) {
    return (
      <>
        <UnidadDetalle
          placa={placa}
          puedeEditar={puedeEditar}
          onVolver={() => setPlaca(null)}
          onMovimiento={(modo, p) => setMovimiento({ modo, placa: p })}
          onVerArticulo={id => { setPlaca(null); setArticuloId(id); }}
        />
        <Sheets editar={editar} setEditar={setEditar} movimiento={movimiento} setMovimiento={setMovimiento} refrescar={refrescar} usuario={usuario} toast={toast} />
      </>
    );
  }

  return (
    <Page>
      <div className="af-page">
      <PageHeader
        eyebrow="Flota"
        title="Almacén de flota"
        subtitle={articulos.isLoading ? 'Cargando…' : `${lista.length} artículos · S/ ${money(totales.valor)}`}
        actions={puedeEditar ? (
          <div className="af-acciones">
            <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setEditar('nuevo')}>Nuevo artículo</Button>
            <Button variant="secondary" icon={<ArrowDownToLine size={16} />} onClick={() => setMovimiento({ modo: 'ingreso', placa: null })}>Ingresar</Button>
            <Button variant="primary" icon={<ArrowUpFromLine size={16} />} onClick={() => setMovimiento({ modo: 'asignar', placa: null })}>Asignar a unidad</Button>
          </div>
        ) : undefined}
      />

      {articulos.isLoading ? <PageLoader variante="camion" /> : articulos.isError ? <Notice tone="error">{errorMessage(articulos.error)}</Notice> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div className="inv-metricas">
            <div className="inv-metrica"><span className="inv-metrica__num">{cant(totales.almacen)}</span><span className="inv-metrica__label">En almacén</span></div>
            <div className="inv-metrica"><span className="inv-metrica__num">{cant(totales.unidades)}</span><span className="inv-metrica__label">En unidades</span></div>
            <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.0625rem' }}>S/ {money(totales.valor)}</span><span className="inv-metrica__label">Valor total</span></div>
          </div>

          <SegmentedControl
            label="Vista del almacén de flota"
            block
            value={vista}
            onChange={setVista}
            options={[
              { value: 'articulos', label: 'Artículos' },
              { value: 'unidades', label: 'Unidades' },
              { value: 'historial', label: 'Historial' },
            ]}
          />

          {vista === 'articulos' && (
            <>
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Artículo o placa…" />
              <ArticulosVista articulos={lista} busqueda={busqueda} onAbrir={setArticuloId} />
            </>
          )}
          {vista === 'unidades' && (
            <>
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa de la unidad…" />
              <UnidadesVista unidades={listaUnidades} busqueda={busqueda} onAbrir={setPlaca} cargando={unidades.isLoading} />
            </>
          )}
          {vista === 'historial' && <HistorialVista onAbrirArticulo={setArticuloId} />}
        </div>
      )}

      <Sheets editar={editar} setEditar={setEditar} movimiento={movimiento} setMovimiento={setMovimiento} refrescar={refrescar} usuario={usuario} toast={toast} />
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

function ArticulosVista({ articulos, busqueda, onAbrir }: {
  articulos: ArticuloFlota[]; busqueda: string; onAbrir: (id: number) => void;
}) {
  const q = busqueda.trim().toUpperCase();
  const visibles = q
    ? articulos.filter(a => a.descripcion.toUpperCase().includes(q) || a.placas.some(p => p.placa.includes(q)))
    : articulos;
  if (visibles.length === 0) {
    return (
      <EmptyState icon={q ? <SearchX size={22} /> : <Package size={22} />} title={q ? 'Sin coincidencias' : 'Sin artículos'}>
        {q ? 'Prueba con otro nombre o placa.' : 'Crea artículos y registra su ingreso al almacén de flota.'}
      </EmptyState>
    );
  }
  return (
    <div className="tarjeta__lista">
      {visibles.map(a => {
        const bajoMinimo = num(a.stock_minimo) > 0 && num(a.almacen) < num(a.stock_minimo);
        return (
          <button key={a.id} type="button" className="mov-fila" onClick={() => { haptic('selection'); onAbrir(a.id); }}>
            <div className="mov-fila__icon" style={{ background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}><Package size={16} /></div>
            <div className="mov-fila__cuerpo">
              <span className="mov-fila__titulo">{a.descripcion}</span>
              <span className="mov-fila__sub">{a.placas.length ? `En ${a.placas.length} unidad(es)` : 'No está en ninguna unidad'}</span>
              {a.placas.length > 0 && (
                <span className="af-chips">
                  {a.placas.slice(0, 3).map(p => (
                    <span key={p.placa} className="af-chip"><LicensePlate plate={p.placa} size="sm" /><span>{cant(p.cantidad)}</span></span>
                  ))}
                  {a.placas.length > 3 && <span className="mov-fila__sub">y {a.placas.length - 3} más</span>}
                </span>
              )}
              {bajoMinimo && <span className="mov-fila__sub" style={{ color: 'var(--red-ink, #b91c1c)' }}>Bajo el mínimo ({cant(a.stock_minimo)})</span>}
            </div>
            <div className="mov-fila__derecha" style={{ textAlign: 'right' }}>
              <span className="mov-fila__monto">{cant(a.almacen)} en almacén</span>
              <span className="mov-fila__sub">{cant(a.en_unidades)} en unidades</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function UnidadesVista({ unidades, busqueda, onAbrir, cargando }: {
  unidades: UnidadFlota[]; busqueda: string; onAbrir: (placa: string) => void; cargando: boolean;
}) {
  const q = busqueda.trim().toUpperCase();
  const visibles = q ? unidades.filter(u => u.placa.includes(q)) : unidades;
  if (cargando) return <PageLoader variante="camion" />;
  if (visibles.length === 0) {
    return (
      <EmptyState icon={q ? <SearchX size={22} /> : <Warehouse size={22} />} title={q ? 'Sin coincidencias' : 'Ninguna unidad tiene artículos'}>
        {q ? 'Prueba con otra placa.' : 'Cuando asignes artículos a una unidad aparecerá aquí.'}
      </EmptyState>
    );
  }
  return (
    <div className="tarjeta__lista">
      {visibles.map(u => (
        <button key={u.placa} type="button" className="mov-fila" onClick={() => { haptic('selection'); onAbrir(u.placa); }}>
          <div className="mov-fila__icon" style={{ background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}><Truck size={16} /></div>
          <div className="mov-fila__cuerpo">
            <LicensePlate plate={u.placa} size="sm" />
            <span className="mov-fila__sub">{u.articulos} artículo(s) · {cant(u.piezas)} pieza(s) · último movimiento {dia(u.ultimo)}</span>
          </div>
          <div className="mov-fila__derecha">
            <span className="mov-fila__monto">S/ {money(u.valor)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// Historial: todas las operaciones con filtros. Un reingreso dice de qué unidad salió.
function HistorialVista({ onAbrirArticulo }: { onAbrirArticulo: (id: number) => void }) {
  const [f, setF] = useState<FiltrosHistorial>({ desde: '', hasta: '', tipo: 'TODOS', placa: '', q: '' });
  const q = useHistorialFlota(f);
  const set = (cambio: Partial<FiltrosHistorial>) => setF(prev => ({ ...prev, ...cambio }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
      <SegmentedControl
        label="Tipo de operación"
        block
        value={f.tipo}
        onChange={tipo => set({ tipo })}
        options={[
          { value: 'TODOS', label: 'Todas' },
          { value: 'INGRESO', label: 'Ingresos' },
          { value: 'ASIGNACION', label: 'Salidas' },
          { value: 'REINGRESO', label: 'Reingresos' },
        ]}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--s-2)' }}>
        <TextInput type="date" aria-label="Desde" value={f.desde} onChange={e => set({ desde: e.target.value })} />
        <TextInput type="date" aria-label="Hasta" value={f.hasta} onChange={e => set({ hasta: e.target.value })} />
        <TextInput aria-label="Placa" placeholder="Placa" value={f.placa} onChange={e => set({ placa: e.target.value })} />
      </div>
      <SearchField value={f.q} onChange={v => set({ q: v })} placeholder="Artículo…" />

      {q.isLoading ? <PageLoader variante="camion" /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : (q.data ?? []).length === 0 ? (
        <EmptyState icon={<SearchX size={22} />} title="Sin operaciones">Cambia los filtros o registra un movimiento.</EmptyState>
      ) : (
        <div className="tarjeta__lista">
          {(q.data ?? []).map((m: MovimientoFlota) => (
            <button key={m.id} type="button" className="dato" style={{ textAlign: 'left', width: '100%' }} onClick={() => { haptic('selection'); onAbrirArticulo(m.articulo_id); }}>
              <span className="dato__label" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span><span style={{ fontWeight: 700, color: TIPO_COLOR[m.tipo] }}>{TIPO_TXT[m.tipo]}</span>{' · '}{detalleMov(m)}</span>
                <span style={{ fontSize: '0.8125rem' }}>{m.descripcion}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--label-2)' }}>{dia(m.fecha)} · {m.codigo} · {m.usuario ?? '—'}</span>
              </span>
              <span className="dato__valor dato__valor--mono">{m.tipo === 'ASIGNACION' ? '−' : '+'}{cant(m.cantidad)} {m.unidad ?? ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Ficha de un artículo: dónde está (por placa) y kardex con saldo del almacén
function ArticuloDetalle({ id, puedeEditar, onVolver, onEditar, onVerUnidad }: {
  id: number; puedeEditar: boolean; onVolver: () => void; onEditar: (a: ArticuloBase) => void; onVerUnidad: (placa: string) => void;
}) {
  const q = useArticuloFlota(id);
  const f = q.data;
  return (
    <Page push>
      <div className="af-page">
      <div className="ot-ficha">
        <div className="tarjeta__barra">
          <button type="button" className="tarjeta__volver" onClick={onVolver}><span style={{ fontSize: '1.2rem' }}>‹</span> Almacén de flota</button>
          {puedeEditar && f && (
            <div className="tarjeta__barra-acciones">
              <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => onEditar(f.articulo)}>Editar</Button>
            </div>
          )}
        </div>

        {q.isLoading ? <PageLoader variante="camion" /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : f && (
          <>
            <div className="ot-ficha__hero">
              <span className="ot-estado ot-estado--neutral">{f.articulo.familia ?? 'Artículo'}</span>
              <h2 className="ot-ficha__placa" style={{ fontSize: '1.35rem' }}>{f.articulo.descripcion}</h2>
              <span className="ot-ficha__id">{f.articulo.unidad ?? 'Und.'} · costo referencial S/ {money(f.articulo.costo_referencial)}</span>
            </div>

            <div className="inv-metricas">
              <div className="inv-metrica"><span className="inv-metrica__num">{cant(f.almacen)}</span><span className="inv-metrica__label">En almacén</span></div>
              <div className="inv-metrica"><span className="inv-metrica__num">{cant(f.placas.reduce((a, p) => a + num(p.cantidad), 0))}</span><span className="inv-metrica__label">En unidades</span></div>
              <div className="inv-metrica"><span className="inv-metrica__num">{f.placas.length}</span><span className="inv-metrica__label">Unidades</span></div>
            </div>

            <div>
              <p className="tarjeta__grupo-titulo">Dónde está</p>
              {f.placas.length === 0 ? (
                <div className="tarjeta__lista"><div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>No está en ninguna unidad.</span></div></div>
              ) : (
                <div className="tarjeta__lista">
                  {f.placas.map(p => (
                    <button key={p.placa} type="button" className="dato" style={{ textAlign: 'left', width: '100%' }} onClick={() => { haptic('selection'); onVerUnidad(p.placa); }}>
                      <span className="dato__label"><LicensePlate plate={p.placa} size="sm" /></span>
                      <span className="dato__valor dato__valor--mono">{cant(p.cantidad)} {f.articulo.unidad ?? ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="tarjeta__grupo-titulo">Kardex</p>
              {f.kardex.length === 0 ? (
                <div className="tarjeta__lista"><div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Sin movimientos.</span></div></div>
              ) : (
                <div className="tarjeta__lista">
                  {f.kardex.map(k => (
                    <div key={k.id} className="dato">
                      <span className="dato__label" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span><span style={{ fontWeight: 700, color: TIPO_COLOR[k.tipo] }}>{TIPO_TXT[k.tipo]}</span>{' · '}{detalleMov(k)}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--label-2)' }}>{dia(k.fecha)} · {k.codigo} · {k.usuario ?? '—'}</span>
                      </span>
                      <span className="dato__valor dato__valor--mono" style={{ textAlign: 'right' }}>
                        <span style={{ color: k.entrada > 0 ? 'var(--green-ink)' : 'var(--accent-ink)' }}>{k.entrada > 0 ? '+' : '−'}{cant(k.entrada || k.salida)}</span>
                        <br /><span style={{ fontSize: '0.72rem', color: 'var(--label-2)' }}>saldo {cant(k.saldo)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      </div>
    </Page>
  );
}

// Ficha de una unidad: lo que tiene ahora y todos sus movimientos (salidas y reingresos)
function UnidadDetalle({ placa, puedeEditar, onVolver, onMovimiento, onVerArticulo }: {
  placa: string; puedeEditar: boolean; onVolver: () => void;
  onMovimiento: (modo: Modo, placa: string) => void; onVerArticulo: (id: number) => void;
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
          <button type="button" className="tarjeta__volver" onClick={onVolver}><span style={{ fontSize: '1.2rem' }}>‹</span> Almacén de flota</button>
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
            <div>
              <p className="tarjeta__grupo-titulo">En la unidad ahora</p>
              {saldo.length === 0 ? (
                <div className="tarjeta__lista"><div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>La unidad no tiene artículos.</span></div></div>
              ) : (
                <div className="tarjeta__lista">
                  {saldo.map(s => (
                    <button key={s.articulo_id} type="button" className="dato" style={{ textAlign: 'left', width: '100%' }} onClick={() => { haptic('selection'); onVerArticulo(s.articulo_id); }}>
                      <span className="dato__label">{s.descripcion}</span>
                      <span className="dato__valor dato__valor--mono">{cant(s.saldo)} {s.unidad ?? ''} · S/ {money(num(s.saldo) * num(s.costo_referencial))}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="tarjeta__grupo-titulo">Movimientos</p>
              {movimientos.length === 0 ? (
                <div className="tarjeta__lista"><div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Sin movimientos.</span></div></div>
              ) : (
                <div className="tarjeta__lista">
                  {movimientos.map(m => (
                    <div key={m.id} className="dato">
                      <span className="dato__label" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span><span style={{ fontWeight: 700, color: TIPO_COLOR[m.tipo] }}>{TIPO_TXT[m.tipo]}</span>{' · '}{m.descripcion}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--label-2)' }}>{dia(m.fecha)} · {m.codigo} · {m.usuario ?? '—'}</span>
                      </span>
                      <span className="dato__valor dato__valor--mono">{m.tipo === 'ASIGNACION' ? '+' : '−'}{cant(m.cantidad)} {m.unidad ?? ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      </div>
    </Page>
  );
}

// Selección de artículos con cantidad (compartido por ingreso, asignación y reingreso)
interface OpcionArticulo { id: number; nombre: string; detalle: string; max: number | null }

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
            <div key={a.id} className="dato" style={{ alignItems: 'center' }}>
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
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abiertoPara, setAbiertoPara] = useState<boolean>(false);
  if (open && !abiertoPara) {
    setAbiertoPara(true);
    setForm(articulo ? {
      descripcion: articulo.descripcion, familia: articulo.familia ?? '', unidad: articulo.unidad ?? '',
      costo: String(num(articulo.costo_referencial)), minimo: String(num(articulo.stock_minimo)),
    } : vacio);
    setError(null);
  }
  if (!open && abiertoPara) setAbiertoPara(false);

  const set = (campo: keyof typeof vacio) => (e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [campo]: e.target.value }));

  async function guardar() {
    setError(null);
    if (!form.descripcion.trim()) { setError('Escribe la descripción del artículo.'); return; }
    setEnviando(true);
    try {
      const r = await guardarArticulo(articulo?.id ?? null, {
        descripcion: form.descripcion.trim(), familia: form.familia.trim(), unidad: form.unidad.trim(),
        costo_referencial: decimal(form.costo), stock_minimo: decimal(form.minimo),
      }, usuario);
      haptic('success'); toast(r.mensaje ?? 'Artículo guardado');
      await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={articulo ? 'Editar artículo' : 'Nuevo artículo de flota'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
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
        id: a.id, nombre: a.descripcion, detalle: `${a.familia ?? ''} · en almacén ${cant(a.almacen)}`.replace(/^ · /, ''), max: null,
      }));
    }
    if (modo === 'asignar') {
      return (articulos.data ?? []).filter(a => num(a.almacen) > 0).map((a: ArticuloFlota) => ({
        id: a.id, nombre: a.descripcion, detalle: `en almacén: ${cant(a.almacen)} ${a.unidad ?? ''}`, max: num(a.almacen),
      }));
    }
    return (saldoUnidad.data?.saldo ?? []).map(s => ({
      id: s.articulo_id, nombre: s.descripcion, detalle: `en la unidad: ${cant(s.saldo)} ${s.unidad ?? ''}`, max: num(s.saldo),
    }));
  }, [modo, articulos.data, saldoUnidad.data]);

  const titulo = modo === 'ingreso' ? 'Ingresar al almacén de flota'
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

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={titulo}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>{boton}</Button></>}>
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
          {modo === 'ingreso' && 'Lo que ingreses suma al almacén de flota con el costo referencial del artículo.'}
          {modo === 'asignar' && 'Solo aparecen artículos con stock en el almacén de flota. Lo asignado sale del almacén y queda en la unidad.'}
          {modo === 'reingresar' && 'Lo que reingreses vuelve al almacén y sale de la unidad. No puedes reingresar más de lo que tiene.'}
        </div>
      </div>
    </Sheet>
  );
}
