import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { guardarSalida, TIPOS_DESTINO, useInventario, type ItemSalida, type SalidaInv } from './api';

interface Props {
  open: boolean;
  salida: SalidaInv | null;
  onClose: () => void;
  onGuardado: () => void;
}

const itemVacio = (): ItemSalida => ({
  inventario_id: null, descripcion: '', cantidad: 1, costo_unitario: 0, moneda: 'PEN', importe: 0,
});

export function SalidaFormulario({ open, salida: s, onClose, onGuardado }: Props) {
  const toast = useToast();
  const { data: inventario } = useInventario();
  const [guardando, setGuardando] = useState(false);

  const [fecha, setFecha] = useState('');
  const [tipoDestino, setTipoDestino] = useState('Vehiculo');
  const [placa, setPlaca] = useState('');
  const [responsable, setResponsable] = useState('');
  const [nroDoc, setNroDoc] = useState('');
  const [almacen, setAlmacen] = useState('');
  const [ticketOt, setTicketOt] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [items, setItems] = useState<ItemSalida[]>([itemVacio()]);

  const almacenes = [...new Set((inventario ?? []).map(i => i.almacen).filter(Boolean) as string[])].sort();

  useEffect(() => {
    if (!open) return;
    if (s) {
      setFecha(s.fecha?.split('T')[0] ?? '');
      setTipoDestino(s.tipo_destino ?? 'Vehiculo');
      setPlaca(s.placa ?? '');
      setResponsable(s.responsable ?? '');
      setNroDoc(s.nro_documento ?? '');
      setAlmacen(s.almacen ?? '');
      setTicketOt(s.ticket_ot ?? '');
      setObservaciones(s.observaciones ?? '');
      setItems(s.items?.length ? s.items.map(i => ({ ...i })) : [itemVacio()]);
    } else {
      const hoy = new Date().toISOString().split('T')[0];
      setFecha(hoy); setTipoDestino('Vehiculo'); setPlaca(''); setResponsable('');
      setNroDoc(''); setAlmacen(''); setTicketOt(''); setObservaciones('');
      setItems([itemVacio()]);
    }
  }, [open, s]);

  function actualizarItem(idx: number, campo: keyof ItemSalida, valor: string | number | null) {
    setItems(prev => {
      const nuevo = [...prev];
      const it = { ...nuevo[idx], [campo]: valor };
      if (campo === 'cantidad' || campo === 'costo_unitario') {
        it.importe = (parseFloat(String(it.cantidad)) || 0) * (parseFloat(String(it.costo_unitario)) || 0);
      }
      nuevo[idx] = it;
      return nuevo;
    });
  }

  function seleccionarArticulo(idx: number, articuloNombre: string) {
    const art = (inventario ?? []).find(a => a.articulo === articuloNombre || a.id === articuloNombre);
    if (!art) return;
    setItems(prev => {
      const nuevo = [...prev];
      nuevo[idx] = {
        ...nuevo[idx],
        inventario_id: art.id,
        descripcion: art.articulo || art.descripcion,
        costo_unitario: art.costo_soles || 0,
        moneda: 'PEN',
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
      const total_pen = itemsValidos.reduce((acc, i) => acc + (i.importe || 0), 0);
      await guardarSalida({
        fecha,
        tipo_destino: tipoDestino,
        placa: placa.toUpperCase() || null,
        responsable: responsable || null,
        nro_documento: nroDoc || null,
        almacen: almacen || null,
        ticket_ot: ticketOt || null,
        observaciones: observaciones || null,
        moneda: 'PEN',
        total_pen,
        items: itemsValidos,
      }, s?.id);
      toast(s ? 'Salida actualizada' : 'Salida registrada');
      onGuardado();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  const totalCalculado = items.reduce((acc, i) => acc + (i.importe || 0), 0);

  return (
    <Sheet open={open} onClose={onClose} title={s ? 'Editar salida' : 'Nueva salida'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
          <Field label="Fecha *">
            {p => <TextInput {...p} type="date" value={fecha} onChange={ev => setFecha(ev.target.value)} />}
          </Field>
          <Field label="Destino">
            {p => (
              <SelectInput {...p} value={tipoDestino} onChange={ev => setTipoDestino(ev.target.value)}>
                {TIPOS_DESTINO.map(t => <option key={t} value={t}>{t}</option>)}
              </SelectInput>
            )}
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
          <Field label="Placa">
            {p => <TextInput {...p} value={placa} placeholder="ABC-123" onChange={ev => setPlaca(ev.target.value)} />}
          </Field>
          <Field label="OT / Ticket">
            {p => <TextInput {...p} value={ticketOt} placeholder="Ej: OT-2025-001" onChange={ev => setTicketOt(ev.target.value)} />}
          </Field>
        </div>

        <Field label="Responsable">
          {p => <TextInput {...p} value={responsable} placeholder="Nombre del responsable" onChange={ev => setResponsable(ev.target.value)} />}
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
          <Field label="N° documento">
            {p => <TextInput {...p} value={nroDoc} placeholder="Ej: G001-000123" onChange={ev => setNroDoc(ev.target.value)} />}
          </Field>
          <Field label="Almacén origen">
            {p => (
              <>
                <TextInput {...p} value={almacen} list="sal-almacenes" placeholder="Almacén principal" onChange={ev => setAlmacen(ev.target.value)} />
                <datalist id="sal-almacenes">{almacenes.map(a => <option key={a} value={a} />)}</datalist>
              </>
            )}
          </Field>
        </div>

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
                        list={`sal-arts-${idx}`}
                        placeholder="Nombre del artículo"
                        onChange={ev => {
                          const val = ev.target.value;
                          actualizarItem(idx, 'descripcion', val);
                          seleccionarArticulo(idx, val);
                        }}
                      />
                      <datalist id={`sal-arts-${idx}`}>
                        {(inventario ?? []).slice(0, 100).map(a => (
                          <option key={a.id} value={a.articulo || a.descripcion}>{a.id} — Stock: {a.stock_actual}</option>
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
          {s ? 'Guardar cambios' : 'Registrar salida'}
        </Button>
      </div>
    </Sheet>
  );
}
