import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { guardarEntrada, TIPOS_ENTRADA, useInventario, type EntradaInv, type ItemEntrada } from './api';

interface Props {
  open: boolean;
  entrada: EntradaInv | null;
  onClose: () => void;
  onGuardado: () => void;
}

const itemVacio = (): ItemEntrada => ({
  inventario_id: null, descripcion: '', cantidad: 1, costo_unitario: 0, moneda: 'PEN', importe: 0,
});

export function EntradaFormulario({ open, entrada: e, onClose, onGuardado }: Props) {
  const toast = useToast();
  const { data: inventario } = useInventario();
  const [guardando, setGuardando] = useState(false);

  const [fecha, setFecha] = useState('');
  const [tipoEntrada, setTipoEntrada] = useState('Compra');
  const [proveedorNombre, setProveedorNombre] = useState('');
  const [proveedorRuc, setProveedorRuc] = useState('');
  const [nroDoc, setNroDoc] = useState('');
  const [almacen, setAlmacen] = useState('');
  const [motivo, setMotivo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [items, setItems] = useState<ItemEntrada[]>([itemVacio()]);

  const almacenes = [...new Set((inventario ?? []).map(i => i.almacen).filter(Boolean) as string[])].sort();

  useEffect(() => {
    if (!open) return;
    if (e) {
      setFecha(e.fecha?.split('T')[0] ?? '');
      setTipoEntrada(e.tipo_entrada ?? 'Compra');
      setProveedorNombre(e.proveedor_nombre ?? '');
      setProveedorRuc(e.proveedor_ruc ?? '');
      setNroDoc(e.nro_documento ?? '');
      setAlmacen(e.almacen ?? '');
      setMotivo(e.motivo_entrada ?? '');
      setObservaciones(e.observaciones ?? '');
      setItems(e.items?.length ? e.items.map(i => ({ ...i })) : [itemVacio()]);
    } else {
      const hoy = new Date().toISOString().split('T')[0];
      setFecha(hoy); setTipoEntrada('Compra'); setProveedorNombre(''); setProveedorRuc('');
      setNroDoc(''); setAlmacen(''); setMotivo(''); setObservaciones('');
      setItems([itemVacio()]);
    }
  }, [open, e]);

  function actualizarItem(idx: number, campo: keyof ItemEntrada, valor: string | number | null) {
    setItems(prev => {
      const nuevo = [...prev];
      const it = { ...nuevo[idx], [campo]: valor };
      // Si cambia cantidad o costo, recalcular importe
      if (campo === 'cantidad' || campo === 'costo_unitario') {
        it.importe = (parseFloat(String(it.cantidad)) || 0) * (parseFloat(String(it.costo_unitario)) || 0);
      }
      nuevo[idx] = it;
      return nuevo;
    });
  }

  function seleccionarArticulo(idx: number, inventario_id: string) {
    const art = (inventario ?? []).find(a => a.id === inventario_id);
    if (!art) return;
    setItems(prev => {
      const nuevo = [...prev];
      nuevo[idx] = {
        ...nuevo[idx],
        inventario_id,
        descripcion: art.articulo || art.descripcion,
        costo_unitario: art.costo_soles || 0,
        moneda: 'PEN',
        item_unidad: art.unidad ?? undefined,
        importe: (nuevo[idx].cantidad || 1) * (art.costo_soles || 0),
      };
      return nuevo;
    });
  }

  async function guardar() {
    if (!fecha) { toast('Selecciona la fecha', 'error'); return; }
    const itemsValidos = items.filter(i => i.descripcion.trim() || i.inventario_id);
    if (!itemsValidos.length) { toast('Agrega al menos un artículo', 'error'); return; }

    setGuardando(true);
    try {
      const total_pen = itemsValidos.reduce((s, i) => s + (i.importe || 0), 0);
      await guardarEntrada({
        fecha,
        tipo_entrada: tipoEntrada,
        proveedor_nombre: proveedorNombre || null,
        proveedor_ruc: proveedorRuc || null,
        nro_documento: nroDoc || null,
        almacen: almacen || null,
        motivo_entrada: motivo || null,
        observaciones: observaciones || null,
        moneda: 'PEN',
        total_pen,
        items: itemsValidos,
      }, e?.id);
      toast(e ? 'Entrada actualizada' : 'Entrada registrada');
      onGuardado();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  const totalCalculado = items.reduce((s, i) => s + (i.importe || 0), 0);

  return (
    <Sheet open={open} onClose={onClose} title={e ? 'Editar entrada' : 'Nueva entrada'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>

        {/* Cabecera */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
          <Field label="Fecha *">
            {p => <TextInput {...p} type="date" value={fecha} onChange={ev => setFecha(ev.target.value)} />}
          </Field>
          <Field label="Tipo de entrada">
            {p => (
              <SelectInput {...p} value={tipoEntrada} onChange={ev => setTipoEntrada(ev.target.value)}>
                {TIPOS_ENTRADA.map(t => <option key={t} value={t}>{t}</option>)}
              </SelectInput>
            )}
          </Field>
        </div>

        <Field label="Proveedor">
          {p => <TextInput {...p} value={proveedorNombre} placeholder="Nombre del proveedor" onChange={ev => setProveedorNombre(ev.target.value)} />}
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
          <Field label="RUC proveedor">
            {p => <TextInput {...p} value={proveedorRuc} placeholder="20XXXXXXXXX" onChange={ev => setProveedorRuc(ev.target.value)} />}
          </Field>
          <Field label="N° documento">
            {p => <TextInput {...p} value={nroDoc} placeholder="Ej: F001-001234" onChange={ev => setNroDoc(ev.target.value)} />}
          </Field>
        </div>

        <Field label="Almacén destino">
          {p => (
            <>
              <TextInput {...p} value={almacen} list="ent-almacenes" placeholder="Almacén principal" onChange={ev => setAlmacen(ev.target.value)} />
              <datalist id="ent-almacenes">{almacenes.map(a => <option key={a} value={a} />)}</datalist>
            </>
          )}
        </Field>

        <Field label="Motivo / descripción">
          {p => <TextInput {...p} value={motivo} placeholder="Ej: Compra de repuestos para mantenimiento" onChange={ev => setMotivo(ev.target.value)} />}
        </Field>

        {/* Tabla de ítems */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s-2)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--label-2)' }}>Artículos</span>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />}
              onClick={() => setItems(prev => [...prev, itemVacio()])}>
              Agregar
            </Button>
          </div>
          <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
            <table className="items-tabla">
              <thead>
                <tr>
                  <th style={{ minWidth: '10rem' }}>Artículo</th>
                  <th style={{ width: '5rem' }}>Cant.</th>
                  <th style={{ width: '6rem' }}>Costo U.</th>
                  <th style={{ width: '6rem' }}>Importe</th>
                  <th style={{ width: '2rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td>
                      <input className="input" style={{ fontSize: '0.875rem', minHeight: '2.25rem' }}
                        value={it.descripcion}
                        list={`inv-arts-${idx}`}
                        placeholder="Nombre o código"
                        onChange={ev => {
                          const val = ev.target.value;
                          actualizarItem(idx, 'descripcion', val);
                          // Si coincide con un ID exacto, autocompletar
                          const art = (inventario ?? []).find(a => a.id === val || a.articulo === val);
                          if (art) seleccionarArticulo(idx, art.id);
                        }}
                      />
                      <datalist id={`inv-arts-${idx}`}>
                        {(inventario ?? []).slice(0, 100).map(a => (
                          <option key={a.id} value={a.articulo || a.descripcion}>{a.id}</option>
                        ))}
                      </datalist>
                    </td>
                    <td>
                      <input className="input" type="number" min={0} step="0.01"
                        style={{ fontSize: '0.875rem', minHeight: '2.25rem', width: '100%' }}
                        value={it.cantidad}
                        onChange={ev => actualizarItem(idx, 'cantidad', parseFloat(ev.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <input className="input" type="number" min={0} step="0.01"
                        style={{ fontSize: '0.875rem', minHeight: '2.25rem', width: '100%' }}
                        value={it.costo_unitario}
                        onChange={ev => actualizarItem(idx, 'costo_unitario', parseFloat(ev.target.value) || 0)}
                      />
                    </td>
                    <td style={{ fontWeight: 700, textAlign: 'right' }}>
                      S/ {(it.importe || 0).toFixed(2)}
                    </td>
                    <td>
                      {items.length > 1 && (
                        <button type="button" style={{ color: 'var(--red-ink)', padding: '0.25rem' }}
                          onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, padding: 'var(--s-2)' }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, padding: 'var(--s-2)' }}>S/ {totalCalculado.toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <Field label="Observaciones">
          {p => <TextInput {...p} value={observaciones} placeholder="Notas adicionales" onChange={ev => setObservaciones(ev.target.value)} />}
        </Field>

        <Button variant="primary" loading={guardando} onClick={guardar} style={{ width: '100%' }}>
          {e ? 'Guardar cambios' : 'Registrar entrada'}
        </Button>
      </div>
    </Sheet>
  );
}
