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
import { useTipoCambioSunat } from '../almacen/api';
import { etiquetaUbigeo, useOpcionesUbigeo } from './ubigeos';

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
  ubigeo_origen?: string | null;
  direccion_origen?: string | null;
  ubigeo_destino?: string | null;
  direccion_destino?: string | null;
  descripcion_carga?: string | null;
  peso_estimado?: number | string | null;
  impuesto?: string | null;
  costo_flete?: number | string | null;
  observaciones?: string | null;
}

interface Form {
  cliente: string; remitente: string; destinatario: string;
  tipo_servicio: string; sentido: 'IDA' | 'RETORNO';
  /** origen y destino guardan el código de ubigeo elegido */
  origen: string; origen_dir: string; destino: string; destino_dir: string; descripcion: string; peso: string; fecha: string; fecha_entrega: string;
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
    return { cliente: '', remitente: '', destinatario: '', tipo_servicio: 'TRANSPORTE NACIONAL', sentido: 'IDA', origen: '', origen_dir: '', destino: '', destino_dir: '', descripcion: '', peso: '',
      fecha: hoy(), fecha_entrega: '', moneda: 'SOLES', tipo_cambio: '3.750', flete: '', impuesto: 'INCLUYE IGV', observaciones: '' };
  }
  return {
    cliente: str(o.cliente_nombre), remitente: str(o.remitente_generador), destinatario: str(o.destinatario),
    tipo_servicio: str(o.tipo_servicio) || 'TRANSPORTE NACIONAL', sentido: o.es_retorno ? 'RETORNO' : 'IDA',
    origen: str(o.ubigeo_origen), origen_dir: str(o.direccion_origen), destino: str(o.ubigeo_destino), destino_dir: str(o.direccion_destino), descripcion: str(o.descripcion_carga), peso: str(o.peso_estimado ?? ''),
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
  // El tipo de cambio se precarga con el de SUNAT mientras la persona no lo escriba a mano
  const [tcManual, setTcManual] = useState(false);
  const editando = !!orden;

  useEffect(() => { if (open) { setF(formInicial(orden)); setTocados(new Set()); setIntento(false); setError(null); setTcManual(!!orden); } }, [open, orden]);

  const clientes = useQuery({
    queryKey: ['directorio', 'clientes'], enabled: open, staleTime: 5 * 60_000,
    queryFn: () => api<unknown>('/clientes').then(r => (Array.isArray(r) ? r : ((r as { data?: unknown[] })?.data ?? [])) as { nombre?: string; razon_social?: string; direccion?: string | null }[]),
  });
  const sunat = useTipoCambioSunat(open && f.moneda === 'DOLARES');
  useEffect(() => {
    if (f.moneda === 'DOLARES' && !tcManual && sunat.data?.venta) setF(x => ({ ...x, tipo_cambio: Number(sunat.data!.venta).toFixed(3) }));
  }, [f.moneda, tcManual, sunat.data]);
  // Dirección registrada de cada cliente (viene de SUNAT al darlo de alta): sirve para completar la dirección de carga o entrega sin escribirla
  const direccionDe = useMemo(() => new Map((clientes.data ?? []).map(c => [(c.nombre ?? c.razon_social ?? '').trim(), (c.direccion ?? '').trim()])), [clientes.data]);
  const opcionesClientes = useMemo(() => {
    const nombres = new Set<string>();
    (clientes.data ?? []).forEach(c => { const n = (c.nombre ?? c.razon_social ?? '').trim(); if (n) nombres.add(n); });
    return [...nombres].sort((a, b) => a.localeCompare(b, 'es')).map(n => ({ value: n, label: n }));
  }, [clientes.data]);

  const ubi = useOpcionesUbigeo();
  const etiquetaDe = (codigo: string) => { const u = ubi.porCodigo.get(codigo); return u ? etiquetaUbigeo(u) : ''; };
  const set = (p: Partial<Form>) => setF(x => ({ ...x, ...p }));
  // Elegir cliente: remitente por defecto = el mismo cliente; la dirección de carga se completa sola si estaba vacía
  const elegirCliente = (nombre: string) => setF(x => {
    const siguiente = { ...x, cliente: nombre };
    if (nombre && !x.remitente) { siguiente.remitente = nombre; if (!x.origen_dir && direccionDe.get(nombre)) siguiente.origen_dir = direccionDe.get(nombre)!; }
    return siguiente;
  });
  const elegirRemitente = (nombre: string) => setF(x => ({ ...x, remitente: nombre, origen_dir: !x.origen_dir && direccionDe.get(nombre) ? direccionDe.get(nombre)! : x.origen_dir }));
  const elegirDestinatario = (nombre: string) => setF(x => ({ ...x, destinatario: nombre, destino_dir: !x.destino_dir && direccionDe.get(nombre) ? direccionDe.get(nombre)! : x.destino_dir }));
  const errores = useMemo(() => {
    const e: Partial<Record<Campo, string>> = {};
    if (!f.cliente.trim()) e.cliente = 'Elige o escribe el cliente.';
    if (!f.origen) e.origen = 'Elige el distrito del punto de carga.';
    if (!f.destino) e.destino = 'Elige el distrito del punto de entrega.';
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
        origen: etiquetaDe(f.origen), destino: etiquetaDe(f.destino), ubigeo_origen: f.origen, direccion_origen: f.origen_dir, ubigeo_destino: f.destino, direccion_destino: f.destino_dir, descripcion_carga: f.descripcion, peso_estimado: f.peso === '' ? null : Number(f.peso),
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
              createLabel="Usar este cliente" limit={50} onChange={v => { elegirCliente(v ?? ''); tocar('cliente'); }} onCreate={t => { elegirCliente(t); tocar('cliente'); }} />}
          </Field>
          <div className="os-fila">
            <Field label="Remitente" hint="Quien entrega la carga. Por defecto, el cliente.">
              {p => <Combobox {...p} options={opcionesClientes} value={f.remitente || null} limit={50} placeholder="Busca o escribe" createLabel="Usar este nombre"
                onChange={v => elegirRemitente(v ?? '')} onCreate={t => elegirRemitente(t)} />}
            </Field>
            <Field label="Destinatario" hint="Quien recibe la carga en destino.">
              {p => <Combobox {...p} options={opcionesClientes} value={f.destinatario || null} limit={50} placeholder="Busca o escribe" createLabel="Usar este nombre"
                onChange={v => elegirDestinatario(v ?? '')} onCreate={t => elegirDestinatario(t)} />}
            </Field>
          </div>
        </Seccion>

        <Seccion icono={<MapPin size={16} />} titulo="Puntos de carga y entrega">
          <div className="os-fila">
            <SegmentedControl block label="Tipo de servicio" value={f.tipo_servicio} onChange={v => set({ tipo_servicio: v })} options={TIPOS} />
            <SegmentedControl block label="Sentido" value={f.sentido} onChange={v => set({ sentido: v })} options={SENTIDOS} />
          </div>
          {f.sentido === 'RETORNO' && <p className="os-nota">Un retorno con carga es un servicio adicional dentro del mismo viaje. Si regresa vacío no hace falta crear un servicio.</p>}
          <div className="os-fila">
            <div className="os-punto">
              <Field label="Punto de carga *" error={ver('origen')} hint={f.origen ? `Ubigeo ${f.origen}` : 'Busca por distrito, provincia o código'}>
                {p => <Combobox {...p} options={ubi.opciones} value={f.origen || null} loading={ubi.cargando} placeholder="Distrito de carga" onChange={v => { set({ origen: v ?? '' }); tocar('origen'); }} />}
              </Field>
              <Field label="Dirección o planta">{p => <TextInput {...p} value={f.origen_dir} placeholder="Calle, número o nombre de la planta" onChange={e => set({ origen_dir: e.target.value })} />}</Field>
            </div>
            <div className="os-punto">
              <Field label="Punto de entrega *" error={ver('destino')} hint={f.destino ? `Ubigeo ${f.destino}` : 'Busca por distrito, provincia o código'}>
                {p => <Combobox {...p} options={ubi.opciones} value={f.destino || null} loading={ubi.cargando} placeholder="Distrito de entrega" onChange={v => { set({ destino: v ?? '' }); tocar('destino'); }} />}
              </Field>
              <Field label="Dirección o lugar de entrega">{p => <TextInput {...p} value={f.destino_dir} placeholder="Calle, número o nombre del lugar" onChange={e => set({ destino_dir: e.target.value })} />}</Field>
            </div>
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
            <Field label="Tipo de cambio"
              hint={tcManual ? 'Escrito a mano.' : sunat.isLoading ? 'Consultando SUNAT…' : sunat.data ? `SUNAT (venta) del ${sunat.data.fecha}` : 'No se pudo consultar SUNAT: escríbelo a mano.'}>
              {p => <TextInput {...p} inputMode="decimal" value={f.tipo_cambio} onChange={e => { setTcManual(true); set({ tipo_cambio: e.target.value.replace(/[^\d.]/g, '') }); }} />}
            </Field>
          )}
          <Field label="Observaciones">{p => <TextInput {...p} value={f.observaciones} placeholder="Notas para operaciones" onChange={e => set({ observaciones: e.target.value })} />}</Field>
        </Seccion>
      </div>
    </Sheet>
  );
}
