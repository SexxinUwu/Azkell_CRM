import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { guardarSalida, TIPOS_DESTINO, useInventario, type ItemSalida, type SalidaInv } from './api';
import { haptic } from '../../core/lib/haptics';
import { ArticuloSelector, SolicitanteSelector, usePersonalSolicitante } from './SelectoresSalida';
import { formatSoles } from '../../core/lib/format';

interface Props {
  open: boolean;
  salida: SalidaInv | null;
  onClose: () => void;
  onGuardado: () => void;
  /** Valores iniciales de una salida nueva (p. ej. desde una OT); no se aplican al editar */
  preset?: Partial<Pick<SalidaInv, 'placa' | 'ticket_ot' | 'responsable' | 'tipo_destino'>>;
}

const itemVacio = (): ItemSalida => ({
  inventario_id: null, descripcion: '', cantidad: 1, costo_unitario: 0, moneda: 'PEN', importe: 0,
});

export function SalidaFormulario({ open, salida: s, onClose, onGuardado, preset }: Props) {
  const toast = useToast();
  const { data: inventarioTodo } = useInventario();
  // Solo artículos (INV): los servicios (SERV) no se solicitan a almacén
  const inventario = (inventarioTodo ?? []).filter(a => !String(a.id ?? '').toUpperCase().startsWith('SERV'));
  const [guardando, setGuardando] = useState(false);
  const { data: personal } = usePersonalSolicitante();

  const [fecha, setFecha] = useState('');
  const [tipoDestino, setTipoDestino] = useState('Vehiculo');
  const [placa, setPlaca] = useState('');
  const [responsable, setResponsable] = useState('');
  const [nroDoc, setNroDoc] = useState('');
  const [almacen, setAlmacen] = useState('');
  const [ticketOt, setTicketOt] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [items, setItems] = useState<ItemSalida[]>([itemVacio()]);
  const [intento, setIntento] = useState(false);

  const almacenes = [...new Set((inventario ?? []).map(i => i.almacen).filter(Boolean) as string[])].sort();

  /** Disponible del artículo: stock actual; al editar, lo que ya descontó esta salida vuelve a contar */
  function disponibleDe(it: ItemSalida): number | null {
    if (!it.inventario_id) return null;
    const art = (inventario ?? []).find(a => a.id === it.inventario_id);
    if (!art) return null;
    const yaDescontado = (s?.items ?? [])
      .filter(x => x.inventario_id === it.inventario_id)
      .reduce((acc, x) => acc + (Number(x.cantidad) || 0), 0);
    return art.stock_actual + yaDescontado;
  }

  /** Error de una fila con datos; null si la fila está bien o vacía. Sin artículo del inventario no hay rebaja ni kardex. */
  function errorDeFila(it: ItemSalida): string | null {
    if (!it.descripcion.trim() && !it.inventario_id) return null;
    if (!it.inventario_id) return 'Elige un artículo de la lista del inventario';
    if (!(Number(it.cantidad) > 0)) return 'La cantidad debe ser mayor que cero';
    const disp = disponibleDe(it);
    if (disp !== null && Number(it.cantidad) > disp) return `Stock insuficiente: disponible ${disp}`;
    return null;
  }
  // Desde una OT el solicitante es obligatorio, como en el clásico
  const exigeResponsable = !!preset?.ticket_ot && !s;
  const sinResponsable = exigeResponsable && !responsable.trim();
  const hayErrores = items.some(it => errorDeFila(it) !== null);
  const sinArticulos = !items.some(i => i.descripcion.trim() || i.inventario_id);
  const mostrar = (msg: string | undefined) => (intento ? msg : undefined);

  useEffect(() => {
    if (!open) return;
    setIntento(false);
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
      setFecha(hoy); setTipoDestino(preset?.tipo_destino ?? 'Vehiculo'); setPlaca(preset?.placa ?? '');
      setResponsable(preset?.responsable ?? ''); setNroDoc(''); setAlmacen(''); setTicketOt(preset?.ticket_ot ?? '');
      setObservaciones('');
      setItems([itemVacio()]);
    }
    // `preset` no está en las dependencias: si el padre lo recrea en cada render, se reiniciaría lo que se escribe
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
    setIntento(true);
    const itemsValidos = items.filter(i => i.descripcion.trim() || i.inventario_id);
    if (!fecha || sinArticulos || hayErrores || sinResponsable) { haptic('warning'); return; }

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
    <Sheet open={open} onClose={onClose} ancho title={s ? 'Editar salida' : 'Nueva salida'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
          <Field label="Fecha *" error={mostrar(!fecha ? 'Selecciona la fecha.' : undefined)}>
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

        <Field label={exigeResponsable ? 'Solicitante / Responsable *' : 'Solicitante / Responsable'} error={mostrar(sinResponsable ? 'Elige quién solicita los repuestos.' : undefined)}>
          {p => <SolicitanteSelector id={p.id} value={responsable} onChange={setResponsable} opciones={personal ?? []} invalido={intento && sinResponsable} />}
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
                      <ArticuloSelector
                        value={it.descripcion}
                        articulos={inventario ?? []}
                        invalido={errorDeFila(it) !== null}
                        onSelect={a => seleccionarArticulo(idx, a.articulo || a.id)}
                        onTexto={t => { actualizarItem(idx, 'descripcion', t); if (it.inventario_id) actualizarItem(idx, 'inventario_id', null); }}
                      />
                      {it.inventario_id && disponibleDe(it) !== null && (
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--label-2)', marginTop: 2 }}>
                          Disponible: {disponibleDe(it)}
                        </span>
                      )}
                      {errorDeFila(it) && (
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--red-ink)', marginTop: 2 }}>
                          {errorDeFila(it)}
                        </span>
                      )}
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
                      {formatSoles(it.importe || 0)}
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
                  <td style={{ textAlign: 'right', fontWeight: 800, padding: 'var(--s-2)' }}>{formatSoles(totalCalculado)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {intento && sinArticulos && <p role="alert" className="t-footnote" style={{ color: 'var(--red-ink)', margin: 0 }}>Agrega al menos un artículo.</p>}
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
