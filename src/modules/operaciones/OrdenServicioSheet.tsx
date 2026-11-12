import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, MapPin, Package, Receipt, UserRound } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import './servicios.css';

// Lo que llega del detalle del servicio (GET /operaciones/ordenes-servicio/:id)
export interface OrdenParaEditar {
  id: number;
  codigo_orden: string;
  fecha_fmt?: string | null;
  fecha_entrega_fmt?: string | null;
  moneda?: string | null;
  tipo_cambio?: number | string | null;
  cliente_nombre?: string | null;
  remitente_generador?: string | null;
  destinatario?: string | null;
  tipo_servicio?: string | null;
  es_retorno?: number | boolean | null;
  origen?: string | null;
  destino?: string | null;
  descripcion_carga?: string | null;
  peso_estimado?: number | string | null;
  impuesto?: string | null;
  costo_flete?: number | string | null;
  observaciones?: string | null;
}

interface Form {
  cliente: string; remitente: string; destinatario: string;
  tipo_servicio: string; sentido: 'IDA' | 'RETORNO';
  origen: string; destino: string; descripcion: string; peso: string; fecha: string; fecha_entrega: string;
  moneda: string; tipo_cambio: string; flete: string; impuesto: string; observaciones: string;
}
type Campo = 'cliente' | 'origen' | 'destino' | 'flete';

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const hoy = () => new Date().toISOString().slice(0, 10);

const TIPOS = [{ value: 'TRANSPORTE NACIONAL', label: 'Nacional' }, { value: 'TRANSPORTE LOCAL', label: 'Local' }];
const SENTIDOS: Array<{ value: 'IDA' | 'RETORNO'; label: string }> = [{ value: 'IDA', label: 'Ida' }, { value: 'RETORNO', label: 'Retorno con carga' }];
const MONEDAS = [{ value: 'SOLES', label: 'Soles (S/)' }, { value: 'DOLARES', label: 'Dólares (US$)' }];
const IMPUESTOS = [{ value: 'INCLUYE IGV', label: 'Incluye IGV' }, { value: 'MÁS IGV', label: 'Más IGV' }, { value: 'NO APLICA', label: 'No aplica' }];

function formInicial(o: OrdenParaEditar | null): Form {
  if (!o) {
    return { cliente: '', remitente: '', destinatario: '', tipo_servicio: 'TRANSPORTE NACIONAL', sentido: 'IDA', origen: '', destino: '', descripcion: '', peso: '',
      fecha: hoy(), fecha_entrega: '', moneda: 'SOLES', tipo_cambio: '3.750', flete: '', impuesto: 'INCLUYE IGV', observaciones: '' };
  }
  return {
    cliente: str(o.cliente_nombre), remitente: str(o.remitente_generador), destinatario: str(o.destinatario),
    tipo_servicio: str(o.tipo_servicio) || 'TRANSPORTE NACIONAL', sentido: o.es_retorno ? 'RETORNO' : 'IDA',
    origen: str(o.origen), destino: str(o.destino), descripcion: str(o.descripcion_carga), peso: str(o.peso_estimado ?? ''),
    fecha: str(o.fecha_fmt) || hoy(), fecha_entrega: str(o.fecha_entrega_fmt),
    moneda: /DOL/i.test(str(o.moneda)) ? 'DOLARES' : 'SOLES', tipo_cambio: str(o.tipo_cambio ?? '3.750'),
    flete: str(o.costo_flete ?? ''), impuesto: str(o.impuesto) || 'INCLUYE IGV', observaciones: str(o.observaciones),
  };
}

function Seccion({ icono, titulo, children }: { icono: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <section className="os-seccion">
      <h3 className="os-seccion__titulo"><span className="os-seccion__icono" aria-hidden>{icono}</span>{titulo}</h3>
      <div className="os-seccion__cuerpo">{children}</div>
    </section>
  );
}

/**
 * Crear o editar una orden de servicio. El servicio es lo que se vende al cliente (tramo, carga y tarifa);
 * conductor, placas y terceros se eligen en el viaje. Al crear se puede generar el viaje en el mismo paso.
 */
export function OrdenServicioSheet({ open, orden, onClose, viajeInicial = '', onGuardado }: {
  open: boolean;
  orden: OrdenParaEditar | null;
  onClose: () => void;
  /** Viaje al que se vincula el servicio recién creado (alta desde un viaje) */
  viajeInicial?: string;
  /** Se llama tras guardar, con el id de la orden y, si se generó, el código del viaje */
  onGuardado?: (r: { id: number; viaje?: string }) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(() => formInicial(orden));
  const [tocados, setTocados] = useState<Set<Campo>>(new Set());
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState<'solo' | 'viaje' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editando = !!orden;

  useEffect(() => { if (open) { setF(formInicial(orden)); setTocados(new Set()); setIntento(false); setError(null); } }, [open, orden]);

  const clientes = useQuery({
    queryKey: ['directorio', 'clientes'], enabled: open, staleTime: 5 * 60_000,
    queryFn: () => api<unknown>('/clientes').then(r => (Array.isArray(r) ? r : ((r as { data?: unknown[] })?.data ?? [])) as { nombre?: string; razon_social?: string }[]),
  });
  const opcionesClientes = useMemo(() => {
    const nombres = new Set<string>();
    (clientes.data ?? []).forEach(c => { const n = (c.nombre ?? c.razon_social ?? '').trim(); if (n) nombres.add(n); });
    return [...nombres].sort((a, b) => a.localeCompare(b, 'es')).map(n => ({ value: n, label: n }));
  }, [clientes.data]);

  const set = (p: Partial<Form>) => setF(x => ({ ...x, ...p }));
  const errores = useMemo(() => {
    const e: Partial<Record<Campo, string>> = {};
    if (!f.cliente.trim()) e.cliente = 'Elige o escribe el cliente.';
    if (!f.origen.trim()) e.origen = 'Indica el punto de carga.';
    if (!f.destino.trim()) e.destino = 'Indica el punto de entrega.';
    if (f.flete !== '' && !(Number(f.flete) >= 0)) e.flete = 'Escribe un monto válido.';
    return e;
  }, [f]);
  const ver = (c: Campo) => (intento || tocados.has(c) ? errores[c] ?? null : null);
  const tocar = (c: Campo) => setTocados(s => new Set(s).add(c));

  async function guardar(generarViaje: boolean) {
    setIntento(true);
    if (Object.keys(errores).length) { haptic('warning'); return; }
    setError(null);
    setGuardando(generarViaje ? 'viaje' : 'solo');
    try {
      const cuerpo = {
        cliente_nombre: f.cliente, remitente_generador: f.remitente, destinatario: f.destinatario, tipo_servicio: f.tipo_servicio, es_retorno: f.sentido === 'RETORNO' ? 1 : 0,
        origen: f.origen, destino: f.destino, descripcion_carga: f.descripcion, peso_estimado: f.peso === '' ? null : Number(f.peso),
        fecha: f.fecha, fecha_entrega: f.fecha_entrega || null, moneda: f.moneda, tipo_cambio: f.moneda === 'DOLARES' ? Number(f.tipo_cambio) || 3.75 : 3.75,
        costo_flete: f.flete === '' ? 0 : Number(f.flete), impuesto: f.impuesto, observaciones: f.observaciones,
      };
      const r = await api<{ ok?: boolean; error?: string; id?: number; codigo_orden?: string }>(
        editando ? `/operaciones/ordenes-servicio/${orden!.id}` : '/operaciones/ordenes-servicio', { method: editando ? 'PUT' : 'POST', body: cuerpo });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar la orden');
      const id = editando ? orden!.id : Number(r.id);
      let viaje: string | undefined;
      if (!editando && generarViaje) {
        const g = await api<{ ok?: boolean; error?: string; viaje?: string }>(`/operaciones/ordenes-servicio/${id}/generar-viaje`, { method: 'POST' });
        if (g.ok === false) throw new Error(`La orden se creó, pero no se pudo generar el viaje: ${g.error ?? 'error desconocido'}`);
        viaje = g.viaje;
      } else if (!editando && viajeInicial) {
        const a = await api<{ ok?: boolean; error?: string }>(`/operaciones/ordenes-servicio/${id}/asignar-viaje`, { method: 'POST', body: { viaje: viajeInicial } });
        if (a.ok === false) throw new Error(`La orden se creó, pero no se pudo asignar al viaje: ${a.error ?? 'error desconocido'}`);
        viaje = viajeInicial;
      }
      haptic('success');
      toast(editando ? 'Orden actualizada' : viaje ? `Orden creada y viaje ${viaje} generado` : 'Orden creada');
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
      onGuardado?.({ id, viaje });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(null); }
  }

  const ocupado = guardando !== null;
  return (
    <Sheet ancho open={open} onClose={() => !ocupado && onClose()} title={editando ? `Orden ${orden!.codigo_orden}` : 'Nueva orden de servicio'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={ocupado}>Cancelar</Button>
          {editando
            ? <Button variant="primary" onClick={() => guardar(false)} loading={guardando === 'solo'} disabled={ocupado}>Guardar cambios</Button>
            : (
              <>
                {!viajeInicial && <Button variant="secondary" onClick={() => guardar(false)} loading={guardando === 'solo'} disabled={ocupado}>Guardar</Button>}
                <Button variant="primary" onClick={() => guardar(!viajeInicial)} loading={guardando === 'viaje' || (!!viajeInicial && guardando === 'solo')} disabled={ocupado}>
                  {viajeInicial ? `Guardar y sumar al viaje ${viajeInicial}` : 'Guardar y generar viaje'}
                </Button>
              </>
            )}
        </>
      }>
      <div className="os-form">
        {error && <div className="os-form__ancho"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <Seccion icono={<UserRound size={16} />} titulo="Cliente">
          <Field label="Cliente *" error={ver('cliente')}>
            {p => <Combobox {...p} options={opcionesClientes} value={f.cliente || null} placeholder="Busca o escribe el cliente" loading={clientes.isLoading}
              createLabel="Usar este cliente" onChange={v => { set({ cliente: v ?? '' }); tocar('cliente'); }} onCreate={t => { set({ cliente: t }); tocar('cliente'); }} />}
          </Field>
          <div className="os-fila">
            <Field label="Remitente">{p => <TextInput {...p} value={f.remitente} placeholder="Quién entrega la carga" onChange={e => set({ remitente: e.target.value })} />}</Field>
            <Field label="Destinatario">{p => <TextInput {...p} value={f.destinatario} placeholder="Quién la recibe" onChange={e => set({ destinatario: e.target.value })} />}</Field>
          </div>
        </Seccion>

        <Seccion icono={<MapPin size={16} />} titulo="Puntos de carga y entrega">
          <div className="os-fila">
            <SegmentedControl block label="Tipo de servicio" value={f.tipo_servicio} onChange={v => set({ tipo_servicio: v })} options={TIPOS} />
            <SegmentedControl block label="Sentido" value={f.sentido} onChange={v => set({ sentido: v })} options={SENTIDOS} />
          </div>
          {f.sentido === 'RETORNO' && <p className="os-nota">Un retorno con carga es un servicio adicional dentro del mismo viaje. Si regresa vacío no hace falta crear un servicio.</p>}
          <div className="os-fila">
            <Field label="Punto de carga *" error={ver('origen')}>{p => <TextInput {...p} value={f.origen} placeholder="Ciudad, distrito o planta de carga" onBlur={() => tocar('origen')} onChange={e => set({ origen: e.target.value })} />}</Field>
            <Field label="Punto de entrega *" error={ver('destino')}>{p => <TextInput {...p} value={f.destino} placeholder="Ciudad, distrito o lugar de entrega" onBlur={() => tocar('destino')} onChange={e => set({ destino: e.target.value })} />}</Field>
          </div>
          <div className="os-fila">
            <Field label="Fecha del servicio">{p => <TextInput {...p} type="date" value={f.fecha} onChange={e => set({ fecha: e.target.value })} />}</Field>
            <Field label="Entrega estimada">{p => <TextInput {...p} type="date" value={f.fecha_entrega} min={f.fecha} onChange={e => set({ fecha_entrega: e.target.value })} />}</Field>
          </div>
        </Seccion>

        <Seccion icono={<Package size={16} />} titulo="Carga">
          <Field label="Descripción de la carga">{p => <TextInput {...p} value={f.descripcion} placeholder="Qué se transporta" onChange={e => set({ descripcion: e.target.value })} />}</Field>
          <Field label="Peso estimado (kg)">{p => <TextInput {...p} inputMode="decimal" value={f.peso} placeholder="0" onChange={e => set({ peso: e.target.value.replace(/[^\d.]/g, '') })} />}</Field>
        </Seccion>

        <Seccion icono={<Receipt size={16} />} titulo="Tarifa">
          <SegmentedControl block label="Moneda" value={f.moneda} onChange={v => set({ moneda: v })} options={MONEDAS} />
          <div className="os-fila">
            <Field label="Flete acordado" error={ver('flete')}>{p => <TextInput {...p} inputMode="decimal" value={f.flete} placeholder="0.00" onBlur={() => tocar('flete')} onChange={e => set({ flete: e.target.value.replace(/[^\d.]/g, '') })} />}</Field>
            <Field label="Impuesto">{p => <Combobox {...p} options={IMPUESTOS} value={f.impuesto} onChange={v => set({ impuesto: v ?? 'INCLUYE IGV' })} />}</Field>
          </div>
          {f.moneda === 'DOLARES' && (
            <Field label="Tipo de cambio">{p => <TextInput {...p} inputMode="decimal" value={f.tipo_cambio} onChange={e => set({ tipo_cambio: e.target.value.replace(/[^\d.]/g, '') })} />}</Field>
          )}
          <Field label="Observaciones">{p => <TextInput {...p} value={f.observaciones} placeholder="Notas para operaciones" onChange={e => set({ observaciones: e.target.value })} />}</Field>
        </Seccion>
      </div>
    </Sheet>
  );
}
