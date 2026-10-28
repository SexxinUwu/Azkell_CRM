import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { formatMoneda } from '../../core/lib/format';
import { costoSolesArticulo, useEntradas, type ArticuloInv, type ItemSalida } from './api';
import { articuloDeNombre, StockBadge, stockDeArticulo } from './SalidaKitSheet';

// Cargar productos de una orden de compra: se busca por número (o proveedor) y se eligen sus ítems.
// Las O/C salen de las entradas de almacén y de /ordenes-compra, igual que en el clásico.

interface OCLinea { descripcion?: string | null; nombre?: string | null; articulo?: string | null; cantidad?: number | string | null; unidad_medida?: string | null; precio_unitario?: number | string | null; costo_unitario?: number | string | null; inventario_id?: string | null }
export interface OCSalida {
  codigo: string;
  proveedor_nombre: string;
  proveedor_ruc: string;
  monto_total: number;
  moneda: string;
  estado: string;
  solicitado_por: string;
  motivo: string;
  items: OCLinea[];
}

const texto = (v: unknown) => (v == null ? '' : String(v));
const numero = (v: unknown) => Number(v) || 0;

/** Todas las O/C disponibles: las entradas de almacén y, sin repetir código, /ordenes-compra (como el clásico) */
export function useOrdenesCompraSalida(enabled: boolean) {
  const { data: entradas } = useEntradas();
  const { data: ordenes, isLoading: cargandoOrdenes } = useQuery<Array<Record<string, unknown>>>({
    queryKey: ['almacen', 'ordenes-compra-salida'],
    enabled,
    staleTime: 30_000,
    queryFn: () => api<Array<Record<string, unknown>>>('/ordenes-compra').then(r => (Array.isArray(r) ? r : [])).catch(() => []),
  });

  const ocs = useMemo<OCSalida[]>(() => {
    const lista: OCSalida[] = [];
    for (const e of (entradas ?? []) as unknown as Array<Record<string, unknown>>) {
      lista.push({
        codigo: texto(e.id),
        proveedor_nombre: texto(e.proveedor_nombre),
        proveedor_ruc: texto(e.proveedor_documento ?? e.numero_documento),
        monto_total: numero(e.total_pen),
        moneda: texto(e.moneda) || 'PEN',
        estado: texto(e.estado) || 'REGISTRADA',
        solicitado_por: texto(e.creado_por) || 'Sistema',
        motivo: texto(e.observaciones || e.motivo_entrada),
        items: Array.isArray(e.items) ? (e.items as OCLinea[]) : [],
      });
    }
    for (const oc of ordenes ?? []) {
      const codigo = texto(oc.codigo || oc.id);
      if (lista.some(x => x.codigo === codigo)) continue;
      lista.push({
        codigo,
        proveedor_nombre: texto(oc.proveedor_nombre),
        proveedor_ruc: texto(oc.proveedor_ruc),
        monto_total: numero(oc.monto_total),
        moneda: texto(oc.moneda) || 'PEN',
        estado: texto(oc.estado) || 'REGISTRADA',
        solicitado_por: texto(oc.solicitado_por),
        motivo: texto(oc.motivo_solicitud),
        items: Array.isArray(oc.items) ? (oc.items as OCLinea[]) : [],
      });
    }
    return lista;
  }, [entradas, ordenes]);

  return { data: ocs, isLoading: enabled && (!entradas || cargandoOrdenes) };
}

function buscarOC(raw: string, ocs: OCSalida[]): OCSalida | undefined {
  return ocs.find(o => o.codigo.toUpperCase().trim() === raw)
    ?? ocs.find(o => o.codigo.toUpperCase().includes(raw) || o.proveedor_nombre.toUpperCase().includes(raw));
}

export function SalidaOCSheet({ open, onClose, inventario, onAgregar }: {
  open: boolean;
  onClose: () => void;
  inventario: ArticuloInv[];
  onAgregar: (items: ItemSalida[], codigoOC: string) => void;
}) {
  const { data: ocs, isLoading } = useOrdenesCompraSalida(open);
  const [entrada, setEntrada] = useState('');
  const [encontrada, setEncontrada] = useState<OCSalida | null>(null);
  const [buscandoRemota, setBuscandoRemota] = useState(false);
  const [noEncontrada, setNoEncontrada] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setEntrada(''); setEncontrada(null); setNoEncontrada(null); setMarcadas(new Set());
  }, [open]);

  // Al cambiar el texto se busca en el listado; si no está, se pregunta al servidor por el número exacto
  async function buscar(valor: string) {
    setEntrada(valor);
    const raw = valor.trim().toUpperCase();
    setNoEncontrada(null);
    if (!raw) { setEncontrada(null); setMarcadas(new Set()); return; }
    const local = buscarOC(raw, ocs);
    if (local) { elegirOC(local); return; }
    setBuscandoRemota(true);
    try {
      const e = await api<Record<string, unknown>>(`/almacen/entradas/${encodeURIComponent(raw)}`);
      if (e && e.id) {
        elegirOC({ codigo: texto(e.id), proveedor_nombre: texto(e.proveedor_nombre), proveedor_ruc: texto(e.proveedor_documento), monto_total: numero(e.total_pen), moneda: texto(e.moneda) || 'PEN', estado: texto(e.estado) || 'REGISTRADA', solicitado_por: texto(e.creado_por), motivo: texto(e.observaciones || e.motivo_entrada), items: Array.isArray(e.items) ? (e.items as OCLinea[]) : [] });
        return;
      }
    } catch { /* no existe */ }
    finally { setBuscandoRemota(false); }
    setEncontrada(null);
    setNoEncontrada(raw);
  }

  function elegirOC(oc: OCSalida) {
    setEncontrada(oc);
    setMarcadas(new Set(oc.items.map((_, i) => i)));
    setNoEncontrada(null);
  }

  const todas = encontrada ? marcadas.size === encontrada.items.length && encontrada.items.length > 0 : false;

  function agregar() {
    if (!encontrada) return;
    const items: ItemSalida[] = encontrada.items
      .filter((_, i) => marcadas.has(i))
      .map(it => {
        const nombre = texto(it.descripcion || it.nombre || it.articulo);
        const art = articuloDeNombre(nombre, inventario);
        const cantidad = numero(it.cantidad) || 1;
        const costo = art ? costoSolesArticulo(art) : numero(it.precio_unitario || it.costo_unitario);
        return {
          inventario_id: art?.id ?? null,
          descripcion: art ? (art.articulo || art.descripcion) : nombre,
          cantidad,
          costo_unitario: costo,
          moneda: 'PEN',
          importe: cantidad * costo,
        };
      });
    onAgregar(items, encontrada.codigo);
  }

  const filas = encontrada?.items ?? [];

  return (
    <Sheet open={open} onClose={onClose} title="Cargar productos de orden de compra" ancho>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <label className="field">
          <span className="field__label" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>Número de orden de compra o proveedor</span>
            <span className="t-footnote">{isLoading ? 'Cargando…' : `${ocs.length} O/C disponibles`}</span>
          </span>
          <input className="input" list="sal-oc-lista" value={entrada} autoComplete="off" placeholder="Ej: ENT-2026-00120 o nombre de proveedor"
            onChange={e => void buscar(e.target.value)} style={{ minHeight: 44, fontSize: '1rem' }} />
          <datalist id="sal-oc-lista">
            {ocs.map(oc => (
              <option key={oc.codigo} value={oc.codigo}>{`${oc.codigo}${oc.proveedor_nombre ? ` — ${oc.proveedor_nombre}` : ''} (${formatMoneda(oc.monto_total, oc.moneda)})`}</option>
            ))}
          </datalist>
        </label>

        {buscandoRemota && <p className="t-footnote" style={{ margin: 0 }}>Buscando la orden…</p>}
        {noEncontrada && <Notice tone="error">No se encontró ninguna orden de compra con “{noEncontrada}”.</Notice>}

        {encontrada && (
          <>
            <div className="sal-vehiculo">
              <div><span className="sal-vehiculo__k">Orden</span><span className="sal-vehiculo__v">{encontrada.codigo}</span></div>
              <div><span className="sal-vehiculo__k">Estado</span><span className="sal-vehiculo__v">{encontrada.estado.toUpperCase()}</span></div>
              <div><span className="sal-vehiculo__k">Monto total</span><span className="sal-vehiculo__v">{formatMoneda(encontrada.monto_total, encontrada.moneda)}</span></div>
              <div><span className="sal-vehiculo__k">Proveedor</span><span className="sal-vehiculo__v">{encontrada.proveedor_nombre || '—'}{encontrada.proveedor_ruc ? ` · RUC ${encontrada.proveedor_ruc}` : ''}</span></div>
              <div><span className="sal-vehiculo__k">Solicitado por</span><span className="sal-vehiculo__v">{encontrada.solicitado_por || '—'}</span></div>
              {encontrada.motivo && <div><span className="sal-vehiculo__k">Motivo</span><span className="sal-vehiculo__v">{encontrada.motivo}</span></div>}
            </div>

            <div className="sal-kit-lista">
              <div className="sal-kit-lista__cabeza">
                <span className="sal-kit-lista__titulo">Productos en la orden ({filas.length})</span>
                {filas.length > 0 && (
                  <label className="sal-todos">
                    <input type="checkbox" checked={todas} onChange={e => setMarcadas(e.target.checked ? new Set(filas.map((_, i) => i)) : new Set())} />
                    Seleccionar todos
                  </label>
                )}
              </div>
              {filas.length === 0 && <p className="t-footnote" style={{ margin: 0 }}>Esta orden de compra no tiene ítems registrados.</p>}
              {filas.map((it, i) => {
                const nombre = texto(it.descripcion || it.nombre || it.articulo) || '—';
                const art = articuloDeNombre(nombre, inventario);
                const cant = numero(it.cantidad) || 1;
                const pu = numero(it.precio_unitario || it.costo_unitario);
                return (
                  <label key={i} className="sal-kit-fila sal-kit-fila--check">
                    <input type="checkbox" checked={marcadas.has(i)} onChange={e => {
                      setMarcadas(prev => { const n = new Set(prev); if (e.target.checked) n.add(i); else n.delete(i); return n; });
                    }} />
                    <span className="sal-kit-fila__nombre">{nombre}</span>
                    <span className="sal-kit-fila__cant">{cant.toLocaleString('es-PE', { maximumFractionDigits: 3 })} {it.unidad_medida || 'UND'} · {formatMoneda(pu, encontrada.moneda)}</span>
                    <StockBadge stock={stockDeArticulo(art)} requerido={cant} unidad={art?.unidad} />
                  </label>
                );
              })}
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" disabled={!encontrada || marcadas.size === 0} onClick={agregar}>
            Agregar productos al formulario
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
