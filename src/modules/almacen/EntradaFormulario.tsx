import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import {
  CONDICIONES_PAGO, guardarEntrada, tipoDeOrden, tipoOrdenDe, TIPOS_ENTRADA, useInventario, useProveedores,
  useTipoCambioSunat, type EntradaInv, type ItemEntrada,
} from './api';
import { haptic } from '../../core/lib/haptics';
import { formatMoneda } from '../../core/lib/format';

interface Props {
  open: boolean;
  entrada: EntradaInv | null;
  onClose: () => void;
  onGuardado: () => void;
}

const itemVacio = (): ItemEntrada => ({
  inventario_id: null, descripcion: '', cantidad: 1, costo_unitario: 0, moneda: 'PEN', importe: 0,
});

/** Error de una línea con datos; null si la línea está bien o vacía. Sin artículo del inventario no hay stock ni kardex. */
function errorDeLinea(it: ItemEntrada): string | null {
  if (!it.descripcion.trim() && !it.inventario_id) return null;
  if (!it.inventario_id) return 'Elige un artículo de la lista del inventario';
  if (!(Number(it.cantidad) > 0)) return 'La cantidad debe ser mayor que cero';
  if (!(Number(it.costo_unitario) >= 0)) return 'El costo no puede ser negativo';
  return null;
}

export function EntradaFormulario({ open, entrada: e, onClose, onGuardado }: Props) {
  const toast = useToast();
  const { data: inventario } = useInventario();
  const { data: proveedores } = useProveedores();
  const [guardando, setGuardando] = useState(false);

  const [fecha, setFecha] = useState('');
  const [tipoEntrada, setTipoEntrada] = useState('Compra');
  const [proveedorId, setProveedorId] = useState('');
  const [nroDoc, setNroDoc] = useState('');
  const [motivo, setMotivo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN');
  const [tipoCambio, setTipoCambio] = useState('');
  const [condicion, setCondicion] = useState('Al contado');
  const [diasCredito, setDiasCredito] = useState('30');
  const [tipoIgv, setTipoIgv] = useState('sin_igv');
  const [items, setItems] = useState<ItemEntrada[]>([itemVacio()]);
  const [intento, setIntento] = useState(false);

  // Tipo de cambio SUNAT del día: se trae solo cuando la entrada es en dólares
  const sunat = useTipoCambioSunat(open && moneda === 'USD');
  useEffect(() => {
    if (moneda === 'USD' && !tipoCambio && sunat.data?.venta) setTipoCambio(String(sunat.data.venta));
  }, [moneda, sunat.data, tipoCambio]);

  const proveedor = (proveedores ?? []).find(p => p.id === proveedorId) ?? null;
  const tc = Number(tipoCambio);

  useEffect(() => {
    if (!open) return;
    setIntento(false);
    if (e) {
      setFecha(e.fecha?.split('T')[0] ?? '');
      setTipoEntrada(tipoDeOrden(e.tipo_orden));
      setProveedorId(e.proveedor_id ?? '');
      setNroDoc(e.documento_referencia ?? '');
      setMotivo(e.motivo_entrada ?? '');
      setObservaciones(e.observaciones ?? '');
      setMoneda(e.moneda === 'USD' ? 'USD' : 'PEN');
      setTipoCambio(e.tipo_cambio ? String(e.tipo_cambio) : '');
      setCondicion(e.condicion_pago ?? 'Al contado');
      setDiasCredito(String(e.dias_credito ?? 30));
      setTipoIgv(e.tipo_igv === 'mas_igv' ? 'mas_igv' : 'sin_igv');
      setItems(e.items?.length ? e.items.map(i => ({ ...i })) : [itemVacio()]);
    } else {
      const hoy = new Date().toISOString().split('T')[0];
      setFecha(hoy); setTipoEntrada('Compra'); setProveedorId(''); setNroDoc(''); setMotivo(''); setObservaciones('');
      setMoneda('PEN'); setTipoCambio(''); setCondicion('Al contado'); setDiasCredito('30'); setTipoIgv('sin_igv');
      setItems([itemVacio()]);
    }
  }, [open, e]);

  function actualizarItem(idx: number, campo: keyof ItemEntrada, valor: string | number | null) {
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

  /** Elige el artículo del inventario y trae su costo (en soles, o en dólares si la entrada es en USD) */
  function seleccionarArticulo(idx: number, inventarioId: string) {
    const art = (inventario ?? []).find(a => a.id === inventarioId);
    if (!art) return;
    const soles = Number(art.costo_soles) || 0;
    const costo = moneda === 'USD' && tc > 0 ? +(soles / tc).toFixed(4) : soles;
    setItems(prev => {
      const nuevo = [...prev];
      nuevo[idx] = {
        ...nuevo[idx],
        inventario_id: art.id,
        descripcion: art.articulo || art.descripcion,
        costo_unitario: costo,
        moneda,
        item_unidad: art.unidad ?? undefined,
        importe: (Number(nuevo[idx].cantidad) || 1) * costo,
      };
      return nuevo;
    });
  }

  /** Errores de cabecera: se muestran solo después del primer intento de guardar */
  const errorCab = {
    fecha: !fecha ? 'Selecciona la fecha.' : undefined,
    proveedor: tipoEntrada === 'Compra' && !proveedorId ? 'Elige el proveedor de la lista.' : undefined,
    tc: moneda === 'USD' && !(tc > 0) ? 'Indica el tipo de cambio del día.' : undefined,
    dias: condicion === 'A crédito' && !(Number(diasCredito) > 0) ? 'Indica los días de crédito.' : undefined,
  };
  const sinArticulos = !items.some(i => i.descripcion.trim() || i.inventario_id);
  const hayErrores = Object.values(errorCab).some(Boolean) || sinArticulos || items.some(i => errorDeLinea(i) !== null);
  const mostrar = (msg: string | undefined) => (intento ? msg : undefined);

  async function guardar() {
    setIntento(true);
    if (hayErrores) { haptic('warning'); return; }
    const itemsValidos = items.filter(i => i.descripcion.trim() || i.inventario_id);

    setGuardando(true);
    try {
      await guardarEntrada({
        fecha,
        tipo_orden: tipoOrdenDe(tipoEntrada),
        proveedor_id: proveedorId || null,
        proveedor_nombre: proveedor ? (proveedor.razon_social || proveedor.nombre) : null,
        documento_referencia: nroDoc || null,
        motivo_entrada: motivo || null,
        observaciones: observaciones || null,
        moneda,
        tipo_cambio: moneda === 'USD' ? tc : null,
        condicion_pago: condicion,
        dias_credito: condicion === 'A crédito' ? Number(diasCredito) : 0,
        tipo_igv: tipoIgv,
        // El total en soles lo calcula el servidor (en USD con el tipo de cambio de la cabecera)
        items: itemsValidos.map(i => ({
          inventario_id: i.inventario_id,
          descripcion: i.descripcion,
          cantidad: Number(i.cantidad),
          costo_unitario: Number(i.costo_unitario),
          moneda,
          importe: (Number(i.cantidad) || 0) * (Number(i.costo_unitario) || 0),
        })),
      }, e?.id);
      toast(e ? 'Entrada actualizada' : 'Orden registrada');
      onGuardado();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  const totalCalculado = items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.costo_unitario) || 0), 0);
  const dinero = (n: number) => formatMoneda(n, moneda);

  return (
    <Sheet open={open} onClose={onClose} title={e ? 'Editar orden de compra' : 'Nueva orden de compra'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>

        {/* Cabecera */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
          <Field label="Fecha *" error={mostrar(errorCab.fecha)}>
            {p => <TextInput {...p} type="date" value={fecha} onChange={ev => setFecha(ev.target.value)} />}
          </Field>
          <Field label="Tipo">
            {p => (
              <SelectInput {...p} value={tipoEntrada} onChange={ev => setTipoEntrada(ev.target.value)}>
                {TIPOS_ENTRADA.map(t => <option key={t} value={t}>{t}</option>)}
              </SelectInput>
            )}
          </Field>
        </div>

        <Field label={tipoEntrada === 'Compra' ? 'Proveedor *' : 'Proveedor'} error={mostrar(errorCab.proveedor)}>
          {p => (
            <SelectInput {...p} value={proveedorId} onChange={ev => setProveedorId(ev.target.value)}>
              <option value="">Elige un proveedor…</option>
              {(proveedores ?? []).filter(x => x.estado !== 'Inactivo' || x.id === proveedorId).map(x => (
                <option key={x.id} value={x.id}>{x.razon_social || x.nombre}</option>
              ))}
            </SelectInput>
          )}
        </Field>
        {proveedor && (
          <p className="t-footnote c-secondary" style={{ marginTop: -8 }}>
            {proveedor.ruc ? `RUC ${proveedor.ruc}` : 'Este proveedor no tiene RUC registrado'}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
          <Field label="N° documento">
            {p => <TextInput {...p} value={nroDoc} placeholder="Ej: F001-001234" onChange={ev => setNroDoc(ev.target.value)} />}
          </Field>
          <Field label="Moneda">
            {p => (
              <SelectInput {...p} value={moneda} onChange={ev => setMoneda(ev.target.value as 'PEN' | 'USD')}>
                <option value="PEN">Soles (PEN)</option>
                <option value="USD">Dólares (USD)</option>
              </SelectInput>
            )}
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
          <Field label="Condición de pago">
            {p => (
              <SelectInput {...p} value={condicion} onChange={ev => setCondicion(ev.target.value)}>
                {CONDICIONES_PAGO.map(c => <option key={c} value={c}>{c}</option>)}
              </SelectInput>
            )}
          </Field>
          {condicion === 'A crédito' ? (
            <Field label="Días de crédito *" error={mostrar(errorCab.dias)}>
              {p => <TextInput {...p} type="number" min={1} value={diasCredito} onChange={ev => setDiasCredito(ev.target.value)} />}
            </Field>
          ) : moneda === 'USD' ? (
            <Field label="Tipo de cambio *" error={mostrar(errorCab.tc)}>
              {p => <TextInput {...p} type="number" min={0} step="0.0001" value={tipoCambio} placeholder="SUNAT del día" onChange={ev => setTipoCambio(ev.target.value)} />}
            </Field>
          ) : <div />}
        </div>
        {moneda === 'USD' && (
          <p className="t-footnote c-secondary" style={{ marginTop: -8 }}>
            {sunat.data?.venta ? `SUNAT venta del ${sunat.data.fecha}: ${sunat.data.venta}` : 'Consultando el tipo de cambio SUNAT…'}
          </p>
        )}

        <Field label="IGV">
          {p => (
            <SelectInput {...p} value={tipoIgv} onChange={ev => setTipoIgv(ev.target.value)}>
              <option value="sin_igv">Sin IGV (el precio es el total)</option>
              <option value="mas_igv">Más IGV (18 %)</option>
            </SelectInput>
          )}
        </Field>

        <Field label="Motivo / descripción">
          {p => <TextInput {...p} value={motivo} placeholder="Ej: Compra de repuestos para mantenimiento" onChange={ev => setMotivo(ev.target.value)} />}
        </Field>

        {/* Líneas */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s-2)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--label-2)' }}>Artículos ({moneda === 'USD' ? 'en dólares' : 'en soles'})</span>
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
                {items.map((it, idx) => {
                  const error = errorDeLinea(it);
                  return (
                    <tr key={idx}>
                      <td>
                        <input className="input" style={{ fontSize: '0.875rem', minHeight: '2.25rem' }}
                          value={it.descripcion}
                          list={`inv-arts-${idx}`}
                          placeholder="Nombre o código"
                          onChange={ev => {
                            const val = ev.target.value;
                            const art = (inventario ?? []).find(a => a.id === val || a.articulo === val || a.descripcion === val);
                            if (art) {
                              seleccionarArticulo(idx, art.id);
                            } else {
                              // Texto que no corresponde a un artículo: la línea deja de estar vinculada al inventario
                              actualizarItem(idx, 'descripcion', val);
                              actualizarItem(idx, 'inventario_id', null);
                            }
                          }}
                        />
                        <datalist id={`inv-arts-${idx}`}>
                          {(inventario ?? []).slice(0, 100).map(a => (
                            <option key={a.id} value={a.articulo || a.descripcion}>{a.id}</option>
                          ))}
                        </datalist>
                        {error && <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--red-ink)', marginTop: 2 }}>{error}</span>}
                      </td>
                      <td>
                        <input className="input" type="number" min={0} step="0.01"
                          style={{ fontSize: '0.875rem', minHeight: '2.25rem', width: '100%' }}
                          value={it.cantidad}
                          onChange={ev => actualizarItem(idx, 'cantidad', parseFloat(ev.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input className="input" type="number" min={0} step="0.0001"
                          style={{ fontSize: '0.875rem', minHeight: '2.25rem', width: '100%' }}
                          value={it.costo_unitario}
                          onChange={ev => actualizarItem(idx, 'costo_unitario', parseFloat(ev.target.value) || 0)}
                        />
                      </td>
                      <td style={{ fontWeight: 700, textAlign: 'right' }}>
                        {dinero(it.importe || 0)}
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
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, padding: 'var(--s-2)' }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, padding: 'var(--s-2)' }}>{dinero(totalCalculado)}</td>
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
          {e ? 'Guardar cambios' : 'Registrar orden'}
        </Button>
      </div>
    </Sheet>
  );
}
