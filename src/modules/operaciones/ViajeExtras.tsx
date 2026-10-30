import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, ScrollText, Trash2 } from 'lucide-react';
import { Sheet, ConfirmSheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { dayKey } from '../../core/lib/format';
import { useMotivosGastos } from '../tesoreria/api';
import { CompensacionSheet } from '../tesoreria/liq-CompensacionSheet';
import { type Gasto, type TipoCompensacion } from '../tesoreria/liq-utils';

const num = (v: unknown) => Number(v) || 0;
const money = (v: unknown) => num(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Soles con S/ y espacio no divisible
const soles = (v: unknown) => 'S/ ' + money(v);

interface OSViaje { id: number; codigo_orden: string; cliente_nombre: string | null; estado_servicio: string | null; costo_flete: number | string | null; moneda: string | null; fecha_fmt: string | null }
interface CajaViaje { id: number; fecha: string | null; motivo: string | null; importe_total: number | string | null; estado: string | null; serie: string | null; numero: string | null }
interface LiquidacionViaje { gastos: Gasto[]; total_depositado: number | string; total_rendido: number | string; saldo_diferencia: number | string; estado_balance: string }

// Órdenes de servicio asignadas a este viaje (viaje_asignado) — son sus rutas: cada OS lleva ruta, guías y flete
export function SeccionOrdenesServicioViaje({ codigo, onNueva, puedeCrear }: { codigo: string; onNueva: () => void; puedeCrear: boolean }) {
  const q = useQuery({
    queryKey: ['operaciones', 'os-viaje', codigo],
    queryFn: () => api<{ data?: OSViaje[] }>(`/operaciones/ordenes-servicio?viaje=${encodeURIComponent(codigo)}`).then(r => r.data ?? []),
    staleTime: 15_000,
  });
  const lista = q.data ?? [];
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="tarjeta__grupo-titulo">Órdenes de servicio del viaje ({lista.length})</p>
        {puedeCrear && <Button variant="secondary" icon={<Plus size={15} />} onClick={onNueva}>Nueva OS</Button>}
      </div>
      {q.isError && <Notice tone="error">{errorMessage(q.error)}</Notice>}
      {!q.isError && lista.length === 0 && !q.isLoading && (
        <div className="tarjeta__lista"><div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Este viaje aún no tiene órdenes de servicio.</span></div></div>
      )}
      {lista.length > 0 && (
        <div className="tarjeta__lista">
          {lista.map(o => (
            <div key={o.id} className="dato" style={{ alignItems: 'center' }}>
              <span className="dato__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ScrollText size={14} /> <span style={{ fontFamily: 'var(--font-mono)' }}>{o.codigo_orden}</span>
              </span>
              <span className="dato__valor" style={{ textAlign: 'right' }}>
                {o.cliente_nombre || 'Sin cliente'} · {String(o.estado_servicio ?? 'PENDIENTE')} · {/DOL/i.test(String(o.moneda ?? '')) ? 'US$ ' : 'S/ '}{money(o.costo_flete)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface DocOSViaje { numero_documento?: string | null; guia?: string | null; descripcion?: string | null; remitente?: string | null; destinatario?: string | null; peso?: number | string | null; volumen?: number | string | null; cantidad?: number | string | null }

// Documentos de transporte (GRE) de las órdenes de servicio del viaje, igual que la pestaña del clásico
export function SeccionDocumentosViaje({ codigo }: { codigo: string }) {
  const os = useQuery({
    queryKey: ['operaciones', 'os-viaje', codigo],
    queryFn: () => api<{ data?: OSViaje[] }>(`/operaciones/ordenes-servicio?viaje=${encodeURIComponent(codigo)}`).then(r => r.data ?? []),
    staleTime: 15_000,
  });
  const lista = os.data ?? [];
  // Clave propia: la ficha de la orden guarda el objeto completo bajo ['operaciones','orden-servicio',id]
  const detalles = useQueries({
    queries: lista.map(o => ({
      queryKey: ['operaciones', 'os-documentos', o.id],
      queryFn: () => api<{ data?: { documentos?: DocOSViaje[] } }>(`/operaciones/ordenes-servicio/${o.id}`)
        .then(r => (r.data?.documentos ?? []).map(d => ({ ...d, codigo_orden: o.codigo_orden }))),
      staleTime: 15_000,
    })),
  });
  const docs = detalles.flatMap(d => d.data ?? []);
  const cargando = os.isLoading || detalles.some(d => d.isLoading);
  const error = os.error ?? detalles.find(d => d.error)?.error ?? null;
  const pesoTotal = docs.reduce((s, d) => s + num(d.peso), 0);

  return (
    <div>
      <p className="tarjeta__grupo-titulo">Documentos de transporte ({docs.length})</p>
      {error && <Notice tone="error">{errorMessage(error)}</Notice>}
      {docs.length > 0 && (
        <div className="inv-metricas">
          <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>{money(pesoTotal)} kg</span><span className="inv-metrica__label">Peso total</span></div>
        </div>
      )}
      <div className="tarjeta__lista" style={{ marginTop: docs.length ? 'var(--s-2)' : undefined }}>
        {docs.map((d, i) => (
          <div key={`${d.codigo_orden}-${d.numero_documento ?? d.guia ?? i}-${i}`} className="dato" style={{ alignItems: 'center' }}>
            <span className="dato__label" style={{ fontFamily: 'var(--font-mono)' }}>{d.codigo_orden} · {d.numero_documento || d.guia || d.descripcion || `Documento ${i + 1}`}</span>
            <span className="dato__valor" style={{ textAlign: 'right' }}>
              {num(d.peso).toLocaleString('es-PE')} kg · {num(d.volumen).toFixed(3)} m³ · {num(d.cantidad) || 1} bulto(s)
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--label-2)' }}>{[d.remitente, d.destinatario].filter(Boolean).join(' → ') || '—'}</span>
            </span>
          </div>
        ))}
        {!cargando && !error && docs.length === 0 && (
          <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>No se registran documentos de transporte para este viaje.</span></div>
        )}
      </div>
    </div>
  );
}

// Pestañas que la versión actual deja siempre vacías (no tiene de dónde cargar esos registros): mismo mensaje
export function SeccionSinRegistros({ titulo, mensaje }: { titulo: string; mensaje: string }) {
  return (
    <div>
      <p className="tarjeta__grupo-titulo">{titulo}</p>
      <div className="tarjeta__lista">
        <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>{mensaje}</span></div>
      </div>
    </div>
  );
}

// Sub motivos de gasto de ruta (los del clásico si Tesorería no tiene ninguno que contenga «viaje» o «ruta»)
const SUBMOTIVOS_RUTA = [
  'Balanza y pesaje', 'Cochera / Parqueo de ruta', 'Estibadores / Carga y descarga menor', 'Lavado y engrase de unidad en viaje',
  'Peajes (físico / telepeaje)', 'Pernocte / Hospedaje en ruta', 'Viáticos / Alimentación choferes',
];
const SUBMOTIVO_DEFECTO = 'Viáticos / Alimentación choferes';

// Registrar un comprobante de gasto en la liquidación del viaje (mismo contrato que el clásico)
function NuevoGastoSheet({ open, codigo, conductor, onClose, onGuardado }: { open: boolean; codigo: string; conductor: string | null; onClose: () => void; onGuardado: () => Promise<unknown> }) {
  const { user } = useAuth();
  const toast = useToast();
  const motivos = useMotivosGastos();
  const opciones = useMemo(() => {
    const delServidor = (motivos.data ?? []).filter(m => String(m.estado ?? '').toUpperCase() === 'ACTIVO' && /viaje|ruta/i.test(m.motivo ?? '')).map(m => m.sub_motivo);
    return delServidor.length ? delServidor : SUBMOTIVOS_RUTA;
  }, [motivos.data]);
  const [fecha, setFecha] = useState('');
  const [subMotivo, setSubMotivo] = useState(SUBMOTIVO_DEFECTO);
  const [importe, setImporte] = useState('');
  const [comprobante, setComprobante] = useState('BOLETA');
  const [detalle, setDetalle] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFecha(dayKey(new Date())); setImporte(''); setComprobante('BOLETA'); setDetalle(''); setArchivo(null); setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSubMotivo(opciones.includes(SUBMOTIVO_DEFECTO) ? SUBMOTIVO_DEFECTO : (opciones[0] ?? SUBMOTIVO_DEFECTO));
  }, [open, opciones]);

  async function guardar() {
    setError(null);
    if (!fecha) { setError('Indica la fecha del gasto.'); return; }
    if (!(parseFloat(importe) > 0)) { setError('Indica un importe mayor a cero.'); return; }
    setEnviando(true);
    try {
      const f = new FormData();
      f.append('orden_viaje', codigo);
      f.append('fecha', fecha);
      f.append('conductor', conductor ?? '');
      f.append('tipo_gasto', 'Gastos de Viaje y Ruta');
      f.append('sub_motivo', subMotivo);
      f.append('tipo_comprobante', comprobante);
      f.append('numero', '');
      f.append('importe', importe);
      f.append('proveedor_nombre', '');
      f.append('detalle', detalle);
      f.append('usuario_creacion', user?.name || 'OPERACIONES');
      if (archivo) f.append('sustento', archivo);
      const r = await api<{ ok?: boolean; error?: string }>('/tesoreria/liquidaciones-gastos', { method: 'POST', body: f });
      if (r.ok === false) throw new Error(r.error || 'Error al guardar gasto');
      haptic('success'); toast('Gasto registrado con éxito');
      await onGuardado();
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Registrar gasto" footer={
      <>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={<Plus size={16} />} onClick={guardar} loading={enviando}>Guardar gasto</Button>
      </>
    }>
      <div className="form-grid">
        <p className="field field--wide t-callout c-secondary" style={{ margin: 0 }}>Viaje {codigo}{conductor ? ` · Conductor: ${conductor}` : ''}</p>
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Fecha del gasto *">{p => <TextInput {...p} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />}</Field>
        <Field label="Concepto / sub motivo *">{p => (
          <SelectInput {...p} value={subMotivo} onChange={e => setSubMotivo(e.target.value)}>
            {opciones.map(o => <option key={o} value={o}>{o}</option>)}
          </SelectInput>
        )}</Field>
        <Field label="Importe (S/) *">{p => <TextInput {...p} inputMode="decimal" value={importe} onChange={e => setImporte(e.target.value)} />}</Field>
        <Field label="Comprobante (opcional)">{p => (
          <SelectInput {...p} value={comprobante} onChange={e => setComprobante(e.target.value)}>
            <option value="BOLETA">BOLETA</option><option value="FACTURA">FACTURA</option><option value="TICKET">TICKET PEAJE</option><option value="RECIBO">RECIBO / DECLARACIÓN</option>
          </SelectInput>
        )}</Field>
        <Field label="Detalle / justificación" wide>{p => <TextInput {...p} value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Ej: Almuerzo en ruta La Oroya o cochera km 45" />}</Field>
        <Field label="Foto o archivo del comprobante (sustento)" wide hint="Sube la foto del ticket, boleta o recibo">
          {p => <ArchivoInput {...p} accept="image/*,.pdf" onChange={a => setArchivo(a)} />}
        </Field>
      </div>
    </Sheet>
  );
}

// Depósitos (caja), gastos rendidos y balance del viaje. Se puede registrar un gasto, eliminarlo
// y generar la caja de compensación cuando el balance no cuadra (igual que el clásico).
export function SeccionGastosViaje({ codigo, conductor, placa, puedeEditar }: { codigo: string; conductor: string | null; placa: string | null; puedeEditar: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const caja = useQuery({
    queryKey: ['operaciones', 'caja-viaje', codigo],
    queryFn: () => api<{ data?: CajaViaje[] }>(`/tesoreria/caja?orden_viaje=${encodeURIComponent(codigo)}`).then(r => r.data ?? []),
    staleTime: 15_000,
  });
  const liq = useQuery({
    queryKey: ['operaciones', 'liq-viaje', codigo],
    queryFn: () => api<LiquidacionViaje & { ok?: boolean }>(`/tesoreria/liquidaciones-gastos?orden_viaje=${encodeURIComponent(codigo)}`),
    staleTime: 15_000,
  });
  const [nuevo, setNuevo] = useState(false);
  const [compensar, setCompensar] = useState(false);
  const [porEliminar, setPorEliminar] = useState<Gasto | null>(null);
  const [borrando, setBorrando] = useState(false);
  const depositos = caja.data ?? [];
  const gastos = liq.data?.gastos ?? [];
  const balance = liq.data?.estado_balance;
  const saldo = num(liq.data?.saldo_diferencia);
  const etiquetaBalance = balance === 'CUADRADO' ? 'Cuadrado' : balance === 'SALDO_EMPRESA' ? 'Saldo a favor de la empresa' : balance === 'SALDO_CONDUCTOR' ? 'Saldo a favor del conductor' : '';
  const tipoComp: TipoCompensacion | null = saldo > 0 ? 'DEVOLUCION_EMPRESA' : saldo < 0 ? 'REEMBOLSO_CONDUCTOR' : null;

  async function refrescar() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['operaciones', 'liq-viaje', codigo] }),
      qc.invalidateQueries({ queryKey: ['operaciones', 'caja-viaje', codigo] }),
      qc.invalidateQueries({ queryKey: ['tesoreria'] }),
    ]);
  }

  async function eliminar() {
    if (!porEliminar?.id) return;
    setBorrando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/tesoreria/liquidaciones-gastos/${porEliminar.id}`, { method: 'DELETE' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo eliminar');
      haptic('success'); toast('Gasto eliminado');
      setPorEliminar(null);
      await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setBorrando(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--s-2)' }}>
        <p className="tarjeta__grupo-titulo">Gastos del viaje</p>
        {puedeEditar && <Button variant="secondary" icon={<Plus size={15} />} onClick={() => setNuevo(true)}>Registrar gasto</Button>}
      </div>
      <div className="inv-metricas">
        <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>{soles(liq.data?.total_depositado)}</span><span className="inv-metrica__label">Depositado</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>{soles(liq.data?.total_rendido)}</span><span className="inv-metrica__label">Rendido</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>{soles(liq.data?.saldo_diferencia)}</span><span className="inv-metrica__label">{etiquetaBalance || 'Saldo'}</span></div>
      </div>
      {tipoComp && (
        <div className="field field--wide" style={{ marginTop: 'var(--s-2)' }}>
          <Notice tone={saldo > 0 ? 'accent' : 'error'} icon={<CircleAlert size={16} />}>
            {saldo > 0
              ? <>Sobrante de viáticos: el conductor tiene un saldo pendiente de devolver por <strong>{soles(saldo)}</strong>.</>
              : <>Gasto en exceso: el conductor gastó <strong>{soles(-saldo)}</strong> de más que requiere reembolso.</>}
            {puedeEditar && (
              <div style={{ marginTop: 'var(--s-2)' }}>
                <Button variant="secondary" onClick={() => setCompensar(true)}>{saldo > 0 ? 'Generar caja de ingreso (devolución)' : 'Generar caja de reembolso (egreso)'}</Button>
              </div>
            )}
          </Notice>
        </div>
      )}
      {(caja.isError || liq.isError) && <Notice tone="error">No se pudieron cargar los gastos del viaje.</Notice>}
      <div className="tarjeta__lista" style={{ marginTop: 'var(--s-2)' }}>
        {depositos.map(d => (
          <div key={`c${d.id}`} className="dato">
            <span className="dato__label">Depósito {d.serie && d.numero ? `${d.serie}-${d.numero}` : ''}</span>
            <span className="dato__valor">{soles(d.importe_total)}</span>
          </div>
        ))}
        {gastos.map((g, i) => (
          <div key={`g${g.id ?? i}`} className="dato" style={{ alignItems: 'center' }}>
            <span className="dato__label">
              {g.id != null ? `G-${String(g.id).padStart(4, '0')} · ` : ''}{g.sub_motivo || g.tipo_gasto || 'Gasto'}
              {g.detalle && <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--label-2)' }}>{g.detalle}</span>}
            </span>
            <span className="dato__valor" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              {soles(g.importe)}{g.estado ? ` · ${g.estado}` : ''}
              {puedeEditar && g.id != null && (
                <Button variant="secondary" iconOnly icon={<Trash2 size={15} />} aria-label={`Eliminar gasto G-${String(g.id).padStart(4, '0')}`} onClick={() => setPorEliminar(g)}>{''}</Button>
              )}
            </span>
          </div>
        ))}
        {!caja.isLoading && !liq.isLoading && depositos.length === 0 && gastos.length === 0 && (
          <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Sin depósitos ni gastos registrados para este viaje.</span></div>
        )}
      </div>

      <NuevoGastoSheet open={nuevo} codigo={codigo} conductor={conductor} onClose={() => setNuevo(false)} onGuardado={refrescar} />
      {tipoComp && (
        <CompensacionSheet open={compensar} onClose={() => setCompensar(false)} codigo={codigo} tipo={tipoComp} saldo={saldo}
          conductor={conductor ?? ''} placa={placa} gastos={gastos} onGenerado={() => { setCompensar(false); void refrescar(); }} />
      )}
      <ConfirmSheet open={!!porEliminar} onClose={() => !borrando && setPorEliminar(null)} onConfirm={eliminar} loading={borrando}
        title="¿Eliminar este gasto?" message="Se quita de la liquidación del viaje. No se puede deshacer." confirmLabel="Eliminar" />
    </div>
  );
}
