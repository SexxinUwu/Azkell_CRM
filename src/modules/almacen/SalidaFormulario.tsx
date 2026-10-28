import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Plus, Trash2, Wrench } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { formatSoles } from '../../core/lib/format';
import { useOrdenesTrabajoData } from '../mantenimiento/api';
import {
  costoSolesArticulo, ETIQUETA_DESTINO, guardarSalida, TIPO_ORDEN_AJUSTE, TIPO_ORDEN_SALIDA, TIPOS_DESTINO,
  useInventario, usePlacasSalida, type ArticuloInv, type ItemSalida, type SalidaInv,
} from './api';
import { ArticuloSelector, SolicitanteSelector, usePersonalSolicitante } from './SelectoresSalida';
import { SalidaKitSheet } from './SalidaKitSheet';
import { SalidaOCSheet } from './SalidaOCSheet';
import { AvisoSheet } from './SalidaDialogos';
import './salidas.css';

// Solicitud de salida (alta y edición). Como el clásico: cabecera (fecha, tipo de orden, OT, destino, placa,
// solicitante, observaciones) y la lista de artículos, con kits de mantenimiento y órdenes de compra.
// El stock no se descuenta aquí: lo descuenta el servidor al despachar. Solo se valida que alcance.

interface Fila extends ItemSalida { uid: number }

interface Props {
  open: boolean;
  salida: SalidaInv | null;
  onClose: () => void;
  onGuardado: () => void;
  /** Valores iniciales de una salida nueva (p. ej. desde una OT); no se aplican al editar */
  preset?: Partial<Pick<SalidaInv, 'placa' | 'ticket_ot' | 'responsable' | 'tipo_destino'>>;
}

const itemVacio = (uid: number): Fila => ({ uid, inventario_id: null, descripcion: '', cantidad: 1, costo_unitario: 0, moneda: 'PEN', importe: 0 });

export function SalidaFormulario({ open, salida: s, onClose, onGuardado, preset }: Props) {
  const toast = useToast();
  const { user } = useAuth();
  const { data: inventarioTodo } = useInventario();
  // Solo artículos (INV): los servicios (SERV) no se solicitan a almacén
  const inventario: ArticuloInv[] = useMemo(() => (inventarioTodo ?? []).filter(a => !String(a.id ?? '').toUpperCase().startsWith('SERV')), [inventarioTodo]);
  const { data: personal } = usePersonalSolicitante();
  const { data: placas } = usePlacasSalida();
  const { data: ordenes } = useOrdenesTrabajoData();

  const uidRef = useRef(1);
  const nuevoUid = () => uidRef.current++;

  const [guardando, setGuardando] = useState(false);
  const [intento, setIntento] = useState(false);
  const [fecha, setFecha] = useState('');
  const [tipoOrden, setTipoOrden] = useState<string>(TIPO_ORDEN_SALIDA);
  const [tipoDestino, setTipoDestino] = useState<string>('Vehiculo');
  const [placa, setPlaca] = useState('');
  const [responsable, setResponsable] = useState('');
  const [ticketOt, setTicketOt] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [items, setItems] = useState<Fila[]>([]);
  const [kitAbierto, setKitAbierto] = useState(false);
  const [ocAbierta, setOcAbierta] = useState(false);
  const [avisoStock, setAvisoStock] = useState<Array<{ desc: string; stock: number; req: number }> | null>(null);

  const esAjuste = tipoOrden === TIPO_ORDEN_AJUSTE;
  const mostrarPlaca = !esAjuste && tipoDestino === 'Vehiculo';

  // Abrir: salida nueva (con preset) o edición de la salida
  useEffect(() => {
    if (!open) return;
    setIntento(false);
    setKitAbierto(false);
    setOcAbierta(false);
    setAvisoStock(null);
    if (s) {
      setFecha(s.fecha?.split('T')[0] ?? '');
      setTipoOrden(s.tipo_orden === TIPO_ORDEN_AJUSTE ? TIPO_ORDEN_AJUSTE : TIPO_ORDEN_SALIDA);
      // Como el clásico: una salida con placa es de vehículo; sin placa, de personal
      setTipoDestino(s.placa ? 'Vehiculo' : 'Personal');
      setPlaca(s.placa ?? '');
      setResponsable(s.responsable ?? '');
      setTicketOt(s.ticket_ot ?? '');
      setObservaciones(s.observaciones ?? '');
      const cargados = (s.items ?? []).map(i => ({ ...i, uid: nuevoUid(), cantidad: Number(i.cantidad), costo_unitario: Number(i.costo_unitario), importe: Number(i.importe) }));
      setItems(cargados.length ? cargados : [itemVacio(nuevoUid())]);
    } else {
      setFecha(new Date().toISOString().split('T')[0]);
      setTipoOrden(TIPO_ORDEN_SALIDA);
      setTipoDestino(preset?.tipo_destino ?? 'Vehiculo');
      setPlaca(preset?.placa ?? '');
      setResponsable(preset?.responsable ?? '');
      setTicketOt(preset?.ticket_ot ?? '');
      setObservaciones('');
      setItems([itemVacio(nuevoUid())]);
    }
    // `preset` no está en las dependencias: si el padre lo recrea en cada render, se reiniciaría lo que se escribe.
    // Se usa el id y no el objeto: un refresco del listado no debe borrar lo que se está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, s?.id]);

  const otOpciones = useMemo(() => (ordenes ?? [])
    .filter(o => o.id_ot)
    .map(o => ({ value: String(o.id_ot).toUpperCase(), label: String(o.id_ot), description: o.placa ? String(o.placa).toUpperCase() : undefined })), [ordenes]);
  const placaDeOT = (id: string) => (ordenes ?? []).find(o => String(o.id_ot).toUpperCase() === id.toUpperCase())?.placa;

  const placasOpciones = useMemo(() => {
    const m = new Map<string, { placa: string; detalle: string }>();
    for (const p of placas ?? []) {
      const pl = String(p.placa ?? '').trim().toUpperCase();
      if (!pl || m.has(pl)) continue;
      m.set(pl, { placa: pl, detalle: [p.marca, p.modelo || p.modelo_uts].filter(Boolean).join(' ') });
    }
    return [...m.values()].sort((a, b) => a.placa.localeCompare(b.placa));
  }, [placas]);

  // Disponible de un artículo: stock actual; al editar una salida ya despachada, lo que ella descontó vuelve a contar
  function disponibleDe(articuloId: string): number | null {
    const art = inventario.find(a => a.id === articuloId);
    if (!art) return null;
    const yaDescontado = s?.estado === 'Despachado'
      ? (s.items ?? []).filter(x => x.inventario_id === articuloId).reduce((acc, x) => acc + (Number(x.cantidad) || 0), 0)
      : 0;
    return Number(art.stock_actual) + yaDescontado;
  }

  // Cantidad pedida de cada artículo sumando todas las filas (el mismo artículo puede venir de un kit y a mano)
  const pedidoPorArticulo = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) if (it.inventario_id) m.set(it.inventario_id, (m.get(it.inventario_id) ?? 0) + (Number(it.cantidad) || 0));
    return m;
  }, [items]);

  /** Error de datos de una fila (artículo y cantidad); bloquea guardar. null si está bien o vacía */
  function errorBasico(it: Fila): string | null {
    if (!it.descripcion.trim() && !it.inventario_id) return null;
    if (!it.inventario_id) return 'Elige un artículo de la lista del inventario';
    if (!(Number(it.cantidad) > 0)) return 'La cantidad debe ser mayor que cero';
    return null;
  }

  /** Stock insuficiente para lo pedido del artículo (sumando todas las filas que lo piden) */
  function errorStock(it: Fila): string | null {
    if (!it.inventario_id) return null;
    const disp = disponibleDe(it.inventario_id);
    const pedido = pedidoPorArticulo.get(it.inventario_id) ?? 0;
    if (disp !== null && pedido > disp) return `Stock insuficiente: disponible ${Number(disp).toLocaleString('es-PE', { maximumFractionDigits: 3 })}`;
    return null;
  }

  const filasValidas = items.filter(i => i.descripcion.trim() || i.inventario_id);
  const hayErrores = items.some(it => errorBasico(it) !== null);
  const sinArticulos = filasValidas.length === 0;
  const exigeResponsable = !!preset?.ticket_ot && !s;
  const sinResponsable = exigeResponsable && !responsable.trim();
  const mostrar = (msg: string | undefined) => (intento ? msg : undefined);
  const totalCalculado = items.reduce((acc, i) => acc + (i.importe || 0), 0);

  function actualizarItem(uid: number, campo: 'cantidad' | 'costo_unitario', valor: number) {
    setItems(prev => prev.map(it => {
      if (it.uid !== uid) return it;
      const n = { ...it, [campo]: valor };
      n.importe = (Number(n.cantidad) || 0) * (Number(n.costo_unitario) || 0);
      return n;
    }));
  }

  /** Al elegir un artículo se toma su costo en soles (el mismo que usa el servidor) */
  function seleccionarArticulo(uid: number, art: ArticuloInv) {
    setItems(prev => prev.map(it => {
      if (it.uid !== uid) return it;
      const cu = costoSolesArticulo(art);
      const cant = Number(it.cantidad) || 1;
      return { ...it, inventario_id: art.id, descripcion: art.articulo || art.descripcion, costo_unitario: cu, moneda: 'PEN', cantidad: cant, importe: cant * cu };
    }));
  }

  /** Agrega filas (kit u OC). Si la única fila está vacía, se reemplaza, como en el clásico */
  function agregarFilas(nuevas: ItemSalida[]) {
    setItems(prev => {
      const base = prev.length === 1 && !prev[0].descripcion.trim() && !prev[0].inventario_id ? [] : prev;
      return [...base, ...nuevas.map(n => ({ ...n, uid: nuevoUid() }))];
    });
  }

  function alElegirOT(id: string | null) {
    if (!id) { setTicketOt(''); return; }
    setTicketOt(id);
    const pl = placaDeOT(id);
    if (pl) { setTipoDestino('Vehiculo'); setPlaca(String(pl).toUpperCase()); }
  }

  function alCambiarOrden(v: string) {
    setTipoOrden(v);
    if (v === TIPO_ORDEN_AJUSTE) { setTicketOt(''); setPlaca(''); }
  }

  function alCambiarDestino(v: string) {
    setTipoDestino(v);
    if (v !== 'Vehiculo') setPlaca('');
  }

  /** Placa para los kits: la de la solicitud o la de la OT elegida (como el clásico) */
  const placaKit = ((mostrarPlaca ? placa : '') || placaDeOT(ticketOt) || '').trim().toUpperCase();

  function abrirKit() {
    if (!placaKit) {
      toast('Selecciona primero una placa o N° de OT para cargar sus kits', 'error');
      return;
    }
    setKitAbierto(true);
  }

  async function guardar() {
    setIntento(true);
    if (!fecha) { haptic('warning'); toast('La fecha es requerida', 'error'); return; }
    if (sinArticulos || hayErrores || sinResponsable) { haptic('warning'); toast(sinArticulos ? 'Agrega al menos un artículo' : 'Revisa los artículos marcados', 'error'); return; }

    // Stock acumulado por artículo (aviso como el clásico, con la lista de lo que falta)
    const insuficientes: Array<{ desc: string; stock: number; req: number }> = [];
    for (const [id, req] of pedidoPorArticulo) {
      const disp = disponibleDe(id);
      if (disp !== null && req > disp) {
        const art = inventario.find(a => a.id === id);
        insuficientes.push({ desc: art?.descripcion || art?.articulo || id, stock: disp, req });
      }
    }
    if (insuficientes.length) { haptic('warning'); setAvisoStock(insuficientes); return; }

    const cuerpo = {
      fecha,
      tipo_destino: tipoDestino || 'Vehiculo',
      placa: mostrarPlaca ? placa.toUpperCase() || null : null,
      responsable: responsable || null,
      ticket_ot: esAjuste ? null : (ticketOt || null),
      observaciones: observaciones || null,
      moneda: 'PEN',
      tipo_cambio: 1,
      creado_por: user?.email || null,
      total_pen: filasValidas.reduce((acc, i) => acc + (i.importe || 0), 0),
      items: filasValidas.map(({ uid: _uid, ...i }) => ({ ...i, importe: (Number(i.cantidad) || 0) * (Number(i.costo_unitario) || 0) })),
    };

    setGuardando(true);
    try {
      await guardarSalida(cuerpo, s?.id);
      toast(s ? 'Salida actualizada' : 'Salida registrada');
      onGuardado();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} ancho title={s ? `Editar salida ${s.id}` : 'Nueva salida'}
      footer={
        <div style={{ display: 'flex', gap: 'var(--s-2)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={guardando} onClick={guardar}>{s ? 'Guardar cambios' : 'Guardar solicitud'}</Button>
        </div>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <div className="form-grid">
          <Field label="Fecha de salida *" error={mostrar(!fecha ? 'Selecciona la fecha.' : undefined)}>
            {p => <TextInput {...p} type="date" value={fecha} onChange={ev => setFecha(ev.target.value)} />}
          </Field>
          <Field label="Tipo de orden *">
            {p => (
              <SelectInput {...p} value={tipoOrden} onChange={ev => alCambiarOrden(ev.target.value)}>
                <option value={TIPO_ORDEN_SALIDA}>Orden de Salida (normal)</option>
                <option value={TIPO_ORDEN_AJUSTE}>Ajuste de inventario (resta)</option>
              </SelectInput>
            )}
          </Field>

          {!esAjuste && (
            <Field label="N° de OT">
              {p => (
                <Combobox id={p.id} options={otOpciones} value={ticketOt || null} onChange={alElegirOT} placeholder="Buscar N° OT o placa…" limit={40} />
              )}
            </Field>
          )}
          {!esAjuste && (
            <Field label="Tipo de destino">
              {p => (
                <SelectInput {...p} value={tipoDestino} onChange={ev => alCambiarDestino(ev.target.value)}>
                  {TIPOS_DESTINO.map(t => <option key={t} value={t}>{ETIQUETA_DESTINO[t]}</option>)}
                </SelectInput>
              )}
            </Field>
          )}
          {mostrarPlaca && (
            <Field label="Placa destino">
              {p => <PlacaPicker id={p.id} value={placa} onChange={setPlaca} opciones={placasOpciones} placeholder="Buscar placa…" aria-invalid={p['aria-invalid']} />}
            </Field>
          )}

          <Field label={exigeResponsable ? 'Solicitante / responsable *' : 'Solicitante / responsable'} wide
            error={mostrar(sinResponsable ? 'Elige quién solicita los repuestos.' : undefined)}>
            {p => <SolicitanteSelector id={p.id} value={responsable} onChange={setResponsable} opciones={personal ?? []} invalido={intento && sinResponsable} />}
          </Field>

          <Field label="Observaciones / motivo" wide>
            {p => <TextInput {...p} value={observaciones} placeholder="Motivo, referencia, notas…" onChange={ev => setObservaciones(ev.target.value)} />}
          </Field>
        </div>

        <div>
          <div className="sal-items-cabeza">
            <span className="sal-items-cabeza__titulo">Artículos y materiales</span>
            <div className="sal-items-cabeza__acciones">
              <Button size="sm" variant="secondary" icon={<Wrench size={14} />} onClick={abrirKit}>Kit</Button>
              <Button size="sm" variant="secondary" icon={<FileText size={14} />} onClick={() => setOcAbierta(true)}>OC</Button>
              <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setItems(prev => [...prev, itemVacio(nuevoUid())])}>Ítem</Button>
            </div>
          </div>

          <div className="sal-items-form">
            {items.map((it, idx) => {
              const error = errorBasico(it) ?? errorStock(it);
              const disp = it.inventario_id ? disponibleDe(it.inventario_id) : null;
              return (
                <div key={it.uid} className={`sal-item-form${error ? ' sal-item-form--error' : ''}`}>
                  <div className="sal-item-form__art">
                    <ArticuloSelector id={`sal-art-${it.uid}`} value={it.descripcion} articulos={inventario} invalido={!!error && intento}
                      onSelect={a => seleccionarArticulo(it.uid, a)} />
                    {disp !== null && (
                      <span className="sal-item-form__stock">Disponible: {Number(disp).toLocaleString('es-PE', { maximumFractionDigits: 2 })}</span>
                    )}
                    {error && <span className="field__error" role="alert">{error}</span>}
                  </div>
                  <button type="button" className="sal-item-form__quitar" aria-label={`Quitar fila ${idx + 1}`} title="Quitar fila"
                    onClick={() => setItems(prev => prev.filter(x => x.uid !== it.uid))} disabled={items.length <= 1}>
                    <Trash2 size={15} />
                  </button>
                  <div className="sal-item-form__campos">
                    <label className="sal-campo">
                      <span>Cant.</span>
                      <input className="input" type="number" min={0} step="0.001" value={it.cantidad}
                        onChange={ev => actualizarItem(it.uid, 'cantidad', parseFloat(ev.target.value) || 0)} />
                    </label>
                    <label className="sal-campo">
                      <span>Costo unit. (S/)</span>
                      <input className="input" type="number" min={0} step="0.01" value={it.costo_unitario}
                        onChange={ev => actualizarItem(it.uid, 'costo_unitario', parseFloat(ev.target.value) || 0)} />
                    </label>
                    <div className="sal-campo sal-campo--importe">
                      <span>Importe</span>
                      <b>{formatSoles(it.importe || 0)}</b>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="sal-items-total">
            <span>Total solicitud</span>
            <b>{formatSoles(totalCalculado)}</b>
          </div>
          {intento && sinArticulos && <p role="alert" className="field__error" style={{ marginTop: 'var(--s-2)' }}>Agrega al menos un artículo.</p>}
        </div>
      </div>

      <SalidaKitSheet
        open={kitAbierto}
        onClose={() => setKitAbierto(false)}
        placa={placaKit}
        inventario={inventario}
        onAgregar={(nuevas, tipo) => {
          agregarFilas(nuevas);
          setKitAbierto(false);
          toast(`Se agregaron ${nuevas.length} repuestos del kit ${tipo}`);
        }}
      />

      <SalidaOCSheet
        open={ocAbierta}
        onClose={() => setOcAbierta(false)}
        inventario={inventario}
        onAgregar={(nuevas, codigo) => {
          agregarFilas(nuevas);
          const ref = `Atención según O/C ${codigo}`;
          setObservaciones(prev => (!prev.trim() ? ref : prev.includes(codigo) ? prev : `${prev.trim()} | ${ref}`));
          setOcAbierta(false);
          toast(`Se agregaron ${nuevas.length} productos de la orden de compra ${codigo}`);
        }}
      />

      <AvisoSheet open={avisoStock !== null} onClose={() => setAvisoStock(null)} titulo="Stock insuficiente">
        <p style={{ margin: 0, textAlign: 'center' }}>Se ha detectado stock insuficiente para los siguientes artículos:</p>
        <div className="sal-aviso-lista-stock">
          {(avisoStock ?? []).map((e, i) => (
            <div key={i} className="sal-aviso-stock">
              <span className="sal-aviso-stock__desc">{e.desc}</span>
              <span className="sal-aviso-stock__datos">Stock: <b>{Number(e.stock).toLocaleString('es-PE', { maximumFractionDigits: 3 })}</b> · Solicitado: <b>{Number(e.req).toLocaleString('es-PE', { maximumFractionDigits: 3 })}</b></span>
            </div>
          ))}
        </div>
      </AvisoSheet>
    </Sheet>
  );
}
