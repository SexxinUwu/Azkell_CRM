import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { SelectInput } from '../../core/ui/Field';
import { Notice } from '../../core/ui/Display';
import { costoSolesArticulo, useKitsVehiculo, usePlacasSalida, type ArticuloInv, type ItemSalida, type KitItemSalida } from './api';

/** Artículo del inventario que corresponde a un nombre de kit u orden (mismo criterio que el clásico: nombre igual o contenido) */
export function articuloDeNombre(nombre: string | null | undefined, inventario: ArticuloInv[]): ArticuloInv | undefined {
  const buscado = (nombre ?? '').trim().toUpperCase();
  if (!buscado) return undefined;
  return inventario.find(x => {
    const n = (x.descripcion || x.articulo || '').trim().toUpperCase();
    return n === buscado || n.includes(buscado) || buscado.includes(n);
  });
}

/** Stock de un artículo para mostrar en las listas (el stock actual del inventario) */
export function stockDeArticulo(a: ArticuloInv | undefined): number | null {
  return a ? Number(a.stock_actual) || 0 : null;
}

/** Badge de stock frente a una cantidad requerida (como el clásico: sin inventariar / ok / bajo / sin stock) */
export function StockBadge({ stock, requerido, unidad }: { stock: number | null; requerido: number; unidad?: string | null }) {
  if (stock === null) return <span className="badge">No inventariado</span>;
  const cant = Number(stock).toLocaleString('es-PE', { maximumFractionDigits: 2 });
  if (stock >= requerido) return <span className="badge badge--green">{cant}{unidad ? ` ${unidad}` : ''}</span>;
  if (stock > 0) return <span className="badge badge--amber">Stock bajo: {cant}</span>;
  return <span className="badge badge--red">Sin stock (0)</span>;
}

/** Kit de mantenimiento de la placa: elige el tipo de kit y agrega sus repuestos a la solicitud */
export function SalidaKitSheet({ open, onClose, placa, inventario, onAgregar }: {
  open: boolean;
  onClose: () => void;
  placa: string;
  inventario: ArticuloInv[];
  onAgregar: (items: ItemSalida[], tipoKit: string) => void;
}) {
  const { data: placas } = usePlacasSalida();
  const placaUp = placa.trim().toUpperCase();
  const vehiculo = useMemo(() => {
    const f = (placas ?? []).find(p => String(p.placa ?? '').trim().toUpperCase() === placaUp);
    return {
      marca: String(f?.marca ?? '').trim().toUpperCase(),
      modelo: String(f?.modelo || f?.modelo_uts || '').trim().toUpperCase(),
    };
  }, [placas, placaUp]);

  const sinMarcaModelo = !vehiculo.marca || !vehiculo.modelo;
  const { data: kits = [], isLoading } = useKitsVehiculo(vehiculo.marca, vehiculo.modelo, open && !sinMarcaModelo);
  const [tipo, setTipo] = useState('');

  // Kits agrupados por tipo de mantenimiento (o nombre del kit), como en el clásico
  const grupos = useMemo(() => {
    const m = new Map<string, KitItemSalida[]>();
    for (const k of kits) {
      const clave = k.tipo_mp || k.nombre_kit || 'General';
      m.set(clave, [...(m.get(clave) ?? []), k]);
    }
    return m;
  }, [kits]);

  const seleccion = tipo ? grupos.get(tipo) ?? [] : [];

  function agregar() {
    if (!seleccion.length) return;
    const items: ItemSalida[] = seleccion.map(k => {
      const art = articuloDeNombre(k.item_nombre, inventario);
      const costo = art ? costoSolesArticulo(art) : Number(k.costo_unitario) || 0;
      const cantidad = Number(k.cantidad) || 1;
      return {
        inventario_id: art?.id ?? null,
        descripcion: art ? (art.articulo || art.descripcion) : k.item_nombre,
        cantidad,
        costo_unitario: costo,
        moneda: 'PEN',
        importe: cantidad * costo,
      };
    });
    onAgregar(items, tipo);
    setTipo('');
  }

  return (
    <Sheet open={open} onClose={onClose} title="Agregar kit de mantenimiento" ancho>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <div className="sal-vehiculo">
          <div><span className="sal-vehiculo__k">Placa</span><span className="sal-vehiculo__v">{placaUp || '—'}</span></div>
          <div><span className="sal-vehiculo__k">Marca</span><span className="sal-vehiculo__v">{vehiculo.marca || 'No especificada'}</span></div>
          <div><span className="sal-vehiculo__k">Modelo</span><span className="sal-vehiculo__v">{vehiculo.modelo || 'No especificado'}</span></div>
        </div>

        {sinMarcaModelo ? (
          <Notice tone="error">La placa no tiene marca y modelo registrados; no se pueden buscar sus kits.</Notice>
        ) : isLoading ? (
          <p className="t-footnote" style={{ margin: 0 }}>Cargando kits…</p>
        ) : grupos.size === 0 ? (
          <Notice tone="error">No hay kits configurados para esta marca y modelo. Se configuran en el módulo Kits de Mantenimiento.</Notice>
        ) : (
          <>
            <label className="field">
              <span className="field__label">Kit o tipo de servicio ({grupos.size} disponibles)</span>
              <SelectInput value={tipo} onChange={e => setTipo(e.target.value)}>
                <option value="">Seleccionar kit…</option>
                {[...grupos.entries()].map(([nombre, lista]) => (
                  <option key={nombre} value={nombre}>{nombre} ({lista.length} {lista.length === 1 ? 'ítem' : 'ítems'})</option>
                ))}
              </SelectInput>
            </label>

            {seleccion.length > 0 && (
              <div className="sal-kit-lista">
                <span className="sal-kit-lista__titulo">Repuestos del kit ({seleccion.length})</span>
                {seleccion.map(k => {
                  const art = articuloDeNombre(k.item_nombre, inventario);
                  return (
                    <div key={k.id} className="sal-kit-fila">
                      <span className="sal-kit-fila__nombre">{k.item_nombre || '—'}</span>
                      <span className="sal-kit-fila__cant">{Number(k.cantidad).toLocaleString('es-PE', { maximumFractionDigits: 3 })} {k.unidad_medida || 'UND'}</span>
                      <StockBadge stock={stockDeArticulo(art)} requerido={Number(k.cantidad) || 1} unidad={art?.unidad} />
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" icon={<Plus size={16} />} disabled={!seleccion.length} onClick={agregar}>
            Agregar repuestos al formulario
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
