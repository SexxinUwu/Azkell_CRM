import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, CircleAlert, Plus, SearchX, Truck, Warehouse } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, TextInput, SelectInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { useInventario, type ArticuloInv } from '../almacen/api';
import { usePlacas } from '../placas/api';
import {
  asignarAUnidad, devolverDeUnidad, num, useAlmacenFlotaResumen, useAlmacenFlotaUnidad,
  type LineaFlota, type SaldoFlota, type UnidadFlota,
} from './almacenFlota';

const money = (v: unknown) => num(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cant = (v: unknown) => num(v).toLocaleString('es-PE', { maximumFractionDigits: 4 });
const dia = (s: string | null | undefined) => (s ? String(s).slice(0, 10) : '—');

// Almacén de flota: el stock que está en cada unidad. Entrar aquí = asignar; salir = devolver al almacén.
export function AlmacenFlotaPage() {
  const { can } = useAuth();
  const toast = useToast();
  const resumen = useAlmacenFlotaResumen();
  const [busqueda, setBusqueda] = useState('');
  const [placa, setPlaca] = useState<string | null>(null);
  const [asignando, setAsignando] = useState(false);
  const unidades = resumen.data ?? [];
  const puedeEditar = can('sal_inv.crear', 'ent_inv.crear', 'inv.editar');

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    return q ? unidades.filter(u => u.placa.includes(q)) : unidades;
  }, [unidades, busqueda]);
  const totales = useMemo(() => unidades.reduce((a, u) => ({
    articulos: a.articulos + num(u.articulos), piezas: a.piezas + num(u.piezas), valor: a.valor + num(u.valor),
  }), { articulos: 0, piezas: 0, valor: 0 }), [unidades]);

  if (placa) {
    return (
      <UnidadDetalle
        placa={placa}
        puedeEditar={puedeEditar}
        onVolver={() => setPlaca(null)}
        onHecho={() => resumen.refetch()}
        toast={toast}
      />
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Almacén de flota"
        subtitle={resumen.isLoading ? 'Cargando…' : `${unidades.length} unidades con artículos · S/ ${money(totales.valor)}`}
        actions={puedeEditar ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAsignando(true)}>Asignar artículos</Button> : undefined}
      />

      {resumen.isLoading ? <PageLoader /> : resumen.isError ? <Notice tone="error">{errorMessage(resumen.error)}</Notice> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div className="inv-metricas">
            <div className="inv-metrica"><span className="inv-metrica__num">{unidades.length}</span><span className="inv-metrica__label">Unidades</span></div>
            <div className="inv-metrica"><span className="inv-metrica__num">{cant(totales.piezas)}</span><span className="inv-metrica__label">Piezas en flota</span></div>
            <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.0625rem' }}>S/ {money(totales.valor)}</span><span className="inv-metrica__label">Valor</span></div>
          </div>

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa de la unidad…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <Warehouse size={22} />} title={busqueda ? 'Sin coincidencias' : 'Sin artículos en flota'}>
              {busqueda ? 'Prueba con otra placa.' : 'Cuando asignes artículos a una unidad aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              {visibles.map((u: UnidadFlota) => (
                <button key={u.placa} type="button" className="mov-fila" onClick={() => { haptic('selection'); setPlaca(u.placa); }}>
                  <div className="mov-fila__icon" style={{ background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}><Truck size={16} /></div>
                  <div className="mov-fila__cuerpo">
                    <span className="mov-fila__titulo" style={{ fontFamily: 'var(--font-mono)' }}>{u.placa}</span>
                    <span className="mov-fila__sub">{u.articulos} artículo(s) · {cant(u.piezas)} pieza(s) · último movimiento {dia(u.ultimo)}</span>
                  </div>
                  <div className="mov-fila__derecha">
                    <span className="mov-fila__monto">S/ {money(u.valor)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <AsignarSheet open={asignando} placaInicial={null} onClose={() => setAsignando(false)} onHecho={() => resumen.refetch()} toast={toast} />
    </Page>
  );
}

type Toast = ReturnType<typeof useToast>;

function UnidadDetalle({ placa, puedeEditar, onVolver, onHecho, toast }: {
  placa: string; puedeEditar: boolean; onVolver: () => void; onHecho: () => void; toast: Toast;
}) {
  const q = useAlmacenFlotaUnidad(placa);
  const qc = useQueryClient();
  const [asignando, setAsignando] = useState(false);
  const [devolviendo, setDevolviendo] = useState(false);
  const saldo = q.data?.saldo ?? [];
  const movimientos = q.data?.movimientos ?? [];
  const valor = saldo.reduce((a, s) => a + num(s.saldo) * num(s.costo_referencial), 0);
  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: ['flota', 'almacen'] });
    onHecho();
  };

  return (
    <Page push>
      <div className="ot-ficha">
        <div className="tarjeta__barra">
          <button type="button" className="tarjeta__volver" onClick={onVolver}><span style={{ fontSize: '1.2rem' }}>‹</span> Almacén de flota</button>
          {puedeEditar && (
            <div className="tarjeta__barra-acciones">
              <Button variant="secondary" icon={<ArrowDownToLine size={16} />} onClick={() => setDevolviendo(true)} disabled={!saldo.length}>Devolver</Button>
              <Button variant="primary" icon={<ArrowUpFromLine size={16} />} onClick={() => setAsignando(true)}>Asignar</Button>
            </div>
          )}
        </div>

        <div className="ot-ficha__hero">
          <span className="ot-estado ot-estado--neutral">Almacén virtual</span>
          <h2 className="ot-ficha__placa">{placa}</h2>
          <span className="ot-ficha__id">{saldo.length} artículo(s) · S/ {money(valor)}</span>
        </div>

        {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : (
          <>
            <div>
              <p className="tarjeta__grupo-titulo">En la unidad ahora</p>
              {saldo.length === 0 ? (
                <div className="tarjeta__lista"><div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>La unidad no tiene artículos. Asígnalos desde el almacén.</span></div></div>
              ) : (
                <div className="tarjeta__lista">
                  {saldo.map(s => (
                    <div key={s.inventario_id} className="dato">
                      <span className="dato__label">{s.descripcion ?? s.inventario_id}</span>
                      <span className="dato__valor dato__valor--mono">{cant(s.saldo)} {s.unidad ?? ''} · S/ {money(num(s.saldo) * num(s.costo_referencial))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="tarjeta__grupo-titulo">Movimientos</p>
              {movimientos.length === 0 ? (
                <div className="tarjeta__lista"><div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Sin movimientos registrados.</span></div></div>
              ) : (
                <div className="tarjeta__lista">
                  {movimientos.map((m, i) => (
                    <div key={`${m.documento}-${m.inventario_id}-${i}`} className="dato">
                      <span className="dato__label">
                        <span style={{ fontWeight: 700, color: m.tipo === 'ASIGNACION' ? 'var(--accent-ink)' : 'var(--green-ink)' }}>
                          {m.tipo === 'ASIGNACION' ? 'Salió del almacén' : 'Volvió al almacén'}
                        </span>{' · '}{m.descripcion ?? m.inventario_id}
                      </span>
                      <span className="dato__valor dato__valor--mono">{cant(m.cantidad)} · {dia(m.fecha)} · {m.usuario ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <AsignarSheet open={asignando} placaInicial={placa} onClose={() => setAsignando(false)} onHecho={refrescar} toast={toast} />
      <DevolverSheet open={devolviendo} placa={placa} saldo={saldo} onClose={() => setDevolviendo(false)} onHecho={refrescar} toast={toast} />
    </Page>
  );
}

// Selección de artículos con cantidad (compartido por asignar y devolver)
function SelectorCantidades({ articulos, cantidades, onCambio, maximo }: {
  articulos: { id: string; nombre: string; detalle: string; max: number }[];
  cantidades: Record<string, number>; onCambio: (c: Record<string, number>) => void; maximo: boolean;
}) {
  const [filtro, setFiltro] = useState('');
  const lista = useMemo(() => {
    const f = filtro.trim().toUpperCase();
    return (f ? articulos.filter(a => `${a.nombre} ${a.id}`.toUpperCase().includes(f)) : articulos).slice(0, 80);
  }, [articulos, filtro]);
  const set = (id: string, v: number) => {
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
              <input type="number" min={0} max={maximo ? a.max : undefined} step="any" aria-label={`Cantidad de ${a.nombre}`}
                value={sel || ''} placeholder="0"
                onChange={e => set(a.id, Math.min(Number(e.target.value) || 0, maximo ? a.max : Number.MAX_SAFE_INTEGER))}
                style={{ width: 72, height: 32, textAlign: 'center', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)' }} />
            </div>
          );
        })}
        {lista.length === 0 && <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Sin artículos con ese nombre.</span></div>}
      </div>
    </div>
  );
}

function AsignarSheet({ open, placaInicial, onClose, onHecho, toast }: {
  open: boolean; placaInicial: string | null; onClose: () => void; onHecho: () => unknown; toast: Toast;
}) {
  const { user } = useAuth();
  const inv = useInventario();
  const placas = usePlacas();
  const [placa, setPlaca] = useState('');
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const articulos = useMemo(() => (inv.data ?? [])
    .filter((a: ArticuloInv) => a.activo !== 0 && num(a.stock_actual) > 0)
    .map((a: ArticuloInv) => ({ id: a.id, nombre: a.descripcion, detalle: `${a.id} · stock ${cant(a.stock_actual)} ${a.unidad ?? ''}`, max: num(a.stock_actual) })),
    [inv.data]);

  // Al abrir se fija la unidad (si viene de su detalle) y se limpia la selección
  const [abiertoPara, setAbiertoPara] = useState<boolean>(false);
  if (open && !abiertoPara) { setAbiertoPara(true); setPlaca(placaInicial ?? ''); setCantidades({}); setObs(''); setError(null); }
  if (!open && abiertoPara) setAbiertoPara(false);

  async function guardar() {
    setError(null);
    const items: LineaFlota[] = Object.entries(cantidades).map(([inventario_id, cantidad]) => ({ inventario_id, cantidad }));
    if (!placa) { setError('Elige la unidad.'); return; }
    if (!items.length) { setError('Elige al menos un artículo con cantidad.'); return; }
    setEnviando(true);
    try {
      const r = await asignarAUnidad(placa, items, obs, user?.name ?? 'sistema');
      haptic('success'); toast(r.mensaje ?? `Asignados a ${placa}`);
      await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={placaInicial ? `Asignar a ${placaInicial}` : 'Asignar artículos a una unidad'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Asignar a la unidad</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        {!placaInicial && (
          <Field label="Unidad" wide>
            {p => (
              <SelectInput {...p} value={placa} onChange={e => setPlaca(e.target.value)}>
                <option value="">Elige la unidad…</option>
                {(placas.data ?? []).map(x => <option key={x.placa} value={x.placa}>{x.placa}{x.cliente ? ` — ${x.cliente}` : ''}</option>)}
              </SelectInput>
            )}
          </Field>
        )}
        <Field label="Observaciones" wide>{p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} placeholder="Motivo o trabajo" />}</Field>
        <div className="field field--wide">
          {inv.isLoading ? <Notice>Cargando artículos…</Notice> : (
            <SelectorCantidades articulos={articulos} cantidades={cantidades} onCambio={setCantidades} maximo />
          )}
        </div>
        <div className="field field--wide" style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>
          Solo aparecen artículos con stock en el almacén. Lo que asignes sale del almacén y queda en la unidad.
        </div>
      </div>
    </Sheet>
  );
}

function DevolverSheet({ open, placa, saldo, onClose, onHecho, toast }: {
  open: boolean; placa: string; saldo: SaldoFlota[]; onClose: () => void; onHecho: () => unknown; toast: Toast;
}) {
  const { user } = useAuth();
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abiertoPara, setAbiertoPara] = useState<boolean>(false);
  if (open && !abiertoPara) { setAbiertoPara(true); setCantidades({}); setObs(''); setError(null); }
  if (!open && abiertoPara) setAbiertoPara(false);

  const articulos = useMemo(() => saldo.map(s => ({
    id: s.inventario_id, nombre: s.descripcion ?? s.inventario_id,
    detalle: `en la unidad: ${cant(s.saldo)} ${s.unidad ?? ''}`, max: num(s.saldo),
  })), [saldo]);

  async function guardar() {
    setError(null);
    const items: LineaFlota[] = Object.entries(cantidades).map(([inventario_id, cantidad]) => ({ inventario_id, cantidad }));
    if (!items.length) { setError('Elige al menos un artículo con cantidad.'); return; }
    setEnviando(true);
    try {
      const r = await devolverDeUnidad(placa, items, obs, user?.name ?? 'sistema');
      haptic('success'); toast(r.mensaje ?? 'Devuelto al almacén');
      await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={`Devolver desde ${placa}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Devolver al almacén</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Motivo o observaciones" wide>{p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ej. cambio de repuesto" />}</Field>
        <div className="field field--wide">
          <SelectorCantidades articulos={articulos} cantidades={cantidades} onCambio={setCantidades} maximo />
        </div>
        <div className="field field--wide" style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>
          Lo que devuelvas vuelve al almacén y sale de la unidad. No puedes devolver más de lo que tiene.
        </div>
      </div>
    </Sheet>
  );
}
