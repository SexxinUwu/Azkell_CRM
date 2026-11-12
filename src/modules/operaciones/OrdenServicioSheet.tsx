import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, CircleAlert, MapPin, Pencil, Receipt, Route, Truck, UserRound } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { spring } from '../../core/lib/motion';
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
  tipo_contratacion?: string | null;
  intermediario?: string | null;
  ejecucion?: string | null;
  ruta?: string | null;
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
  contratacion: 'CLIENTE DIRECTO' | 'INTERMEDIARIO'; intermediario: string; ejecucion: 'PROPIO' | 'TERCERO';
  tipo_servicio: string; sentido: 'IDA' | 'RETORNO';
  cliente: string; remitente: string; destinatario: string;
  ruta: string;
  /** origen y destino guardan el código de ubigeo elegido (opcional) */
  origen: string; origen_dir: string; destino: string; destino_dir: string; fecha: string; fecha_entrega: string;
  moneda: string; tipo_cambio: string; flete: string; impuesto: string; peso: string; observaciones: string;
}
type Campo = 'intermediario' | 'cliente' | 'ruta' | 'flete';

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const hoy = () => new Date().toISOString().slice(0, 10);

const CONTRATACIONES: Array<{ value: Form['contratacion']; label: string }> = [{ value: 'CLIENTE DIRECTO', label: 'Cliente directo' }, { value: 'INTERMEDIARIO', label: 'Por intermediario' }];
const EJECUCIONES: Array<{ value: Form['ejecucion']; label: string }> = [{ value: 'PROPIO', label: 'Flota propia' }, { value: 'TERCERO', label: 'Transportista tercero' }];
const TIPOS = [{ value: 'TRANSPORTE NACIONAL', label: 'Nacional' }, { value: 'TRANSPORTE LOCAL', label: 'Local' }];
const SENTIDOS: Array<{ value: 'IDA' | 'RETORNO'; label: string }> = [{ value: 'IDA', label: 'Ida' }, { value: 'RETORNO', label: 'Retorno con carga' }];
const MONEDAS = [{ value: 'SOLES', label: 'Soles (S/)' }, { value: 'DOLARES', label: 'Dólares (US$)' }];
const IMPUESTOS = [{ value: 'INCLUYE IGV', label: 'Incluye IGV' }, { value: 'MÁS IGV', label: 'Más IGV' }, { value: 'NO APLICA', label: 'No aplica' }];

const PASOS = [
  { titulo: 'Servicio', icono: <Truck size={16} />, resumen: 'Cómo se contrata y quién transporta' },
  { titulo: 'Cliente', icono: <UserRound size={16} />, resumen: 'Quién contrata, envía y recibe' },
  { titulo: 'Ruta', icono: <Route size={16} />, resumen: 'Por dónde va y cuándo' },
  { titulo: 'Tarifa', icono: <Receipt size={16} />, resumen: 'Cuánto se cobra' },
  { titulo: 'Resumen', icono: <MapPin size={16} />, resumen: 'Revisa y genera la orden' },
];
// Campos que se validan al salir de cada paso
const CAMPOS_PASO: Campo[][] = [['intermediario'], ['cliente'], ['ruta'], ['flete'], []];

function formInicial(o: OrdenParaEditar | null): Form {
  if (!o) {
    return { contratacion: 'CLIENTE DIRECTO', intermediario: '', ejecucion: 'PROPIO', tipo_servicio: 'TRANSPORTE NACIONAL', sentido: 'IDA', cliente: '', remitente: '', destinatario: '',
      ruta: '', origen: '', origen_dir: '', destino: '', destino_dir: '', fecha: hoy(), fecha_entrega: '',
      moneda: 'SOLES', tipo_cambio: '3.750', flete: '', impuesto: 'INCLUYE IGV', peso: '', observaciones: '' };
  }
  return {
    contratacion: str(o.tipo_contratacion).toUpperCase() === 'INTERMEDIARIO' ? 'INTERMEDIARIO' : 'CLIENTE DIRECTO', intermediario: str(o.intermediario),
    ejecucion: str(o.ejecucion).toUpperCase() === 'TERCERO' ? 'TERCERO' : 'PROPIO',
    tipo_servicio: str(o.tipo_servicio) || 'TRANSPORTE NACIONAL', sentido: o.es_retorno ? 'RETORNO' : 'IDA',
    cliente: str(o.cliente_nombre), remitente: str(o.remitente_generador), destinatario: str(o.destinatario),
    ruta: str(o.ruta) || [o.origen, o.destino].filter(Boolean).join(' - '),
    origen: str(o.ubigeo_origen), origen_dir: str(o.direccion_origen), destino: str(o.ubigeo_destino), destino_dir: str(o.direccion_destino),
    fecha: str(o.fecha_fmt) || hoy(), fecha_entrega: str(o.fecha_entrega_fmt),
    moneda: /DOL/i.test(str(o.moneda)) ? 'DOLARES' : 'SOLES', tipo_cambio: str(o.tipo_cambio ?? '3.750'),
    flete: str(o.costo_flete ?? ''), impuesto: str(o.impuesto) || 'INCLUYE IGV', peso: str(o.peso_estimado ?? ''), observaciones: str(o.observaciones),
  };
}

function Subtitulo({ icono, children, nota }: { icono: ReactNode; children: ReactNode; nota?: string }) {
  return (
    <div className="os-subtitulo">
      <h4 className="os-subtitulo__titulo"><span className="os-seccion__icono" aria-hidden>{icono}</span>{children}</h4>
      {nota && <p className="os-nota">{nota}</p>}
    </div>
  );
}

function FilaResumen({ label, valor }: { label: string; valor?: string | null }) {
  if (!valor) return null;
  return <div className="os-res__fila"><span className="os-res__label">{label}</span><span className="os-res__valor">{valor}</span></div>;
}

function GrupoResumen({ titulo, paso, onCambiar, children }: { titulo: string; paso: number; onCambiar: (p: number) => void; children: ReactNode }) {
  return (
    <section className="os-res__grupo">
      <header className="os-res__cab">
        <h4>{titulo}</h4>
        <button type="button" className="os-res__cambiar" onClick={() => onCambiar(paso)}><Pencil size={13} /> Cambiar</button>
      </header>
      {children}
    </section>
  );
}

/**
 * Crear o editar una orden de servicio, paso a paso: servicio → cliente → ruta → tarifa → resumen.
 * El servicio es lo que se vende al cliente; conductor, placas y datos del tercero se completan en el viaje.
 * Al crear se puede generar el viaje en el mismo paso.
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
  const reduce = useReducedMotion();
  const [f, setF] = useState<Form>(() => formInicial(orden));
  const [paso, setPaso] = useState(0);
  const [direccion, setDireccion] = useState(1);
  const [tocados, setTocados] = useState<Set<Campo>>(new Set());
  const [guardando, setGuardando] = useState<'solo' | 'viaje' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // El tipo de cambio se precarga con el de SUNAT mientras la persona no lo escriba a mano
  const [tcManual, setTcManual] = useState(false);
  // Direcciones que se llenaron solas (se pueden reemplazar por la sugerida del distrito); si la persona escribe, dejan de ser automáticas
  const [auto, setAuto] = useState({ origen: false, destino: false });
  const editando = !!orden;
  const ultimo = PASOS.length - 1;

  useEffect(() => {
    if (open) { setF(formInicial(orden)); setPaso(0); setDireccion(1); setTocados(new Set()); setError(null); setTcManual(!!orden); setAuto({ origen: false, destino: false }); }
  }, [open, orden]);

  const clientes = useQuery({
    queryKey: ['directorio', 'clientes'], enabled: open, staleTime: 5 * 60_000,
    queryFn: () => api<unknown>('/clientes').then(r => (Array.isArray(r) ? r : ((r as { data?: unknown[] })?.data ?? [])) as { nombre?: string; razon_social?: string; direccion?: string | null }[]),
  });
  const recientes = useQuery({
    queryKey: ['operaciones', 'direcciones-recientes'], enabled: open, staleTime: 60_000,
    queryFn: () => api<{ data?: { tipo: 'origen' | 'destino'; cliente_nombre: string | null; ubigeo: string; direccion: string; ultimo: number }[] }>('/operaciones/ordenes-servicio/direcciones-recientes').then(r => r.data ?? []),
  });
  // Rutas de la matriz de combustible (según ida o retorno) y las usadas antes
  const rutas = useQuery({
    queryKey: ['operaciones', 'rutas-servicio', f.sentido], enabled: open, staleTime: 5 * 60_000,
    queryFn: () => api<{ data?: { ruta: string; origen: 'matriz' | 'usada' }[] }>('/operaciones/ordenes-servicio/rutas', { query: { sentido: f.sentido } }).then(r => r.data ?? []),
  });
  const opcionesRutas = useMemo(() => {
    const lista = (rutas.data ?? []).map(r => ({ value: r.ruta, label: r.ruta, description: r.origen === 'matriz' ? 'Matriz de combustible' : 'Usada antes' }));
    if (f.ruta && !lista.some(o => o.value === f.ruta)) lista.unshift({ value: f.ruta, label: f.ruta, description: 'Escrita a mano' });
    return lista;
  }, [rutas.data, f.ruta]);
  // Última dirección usada en ese distrito: primero la del mismo cliente; si no hay, la de cualquier cliente
  const sugerida = (tipo: 'origen' | 'destino', cliente: string, ubigeo: string) => {
    const filas = (recientes.data ?? []).filter(r => r.tipo === tipo && r.ubigeo === ubigeo);
    return (filas.find(r => (r.cliente_nombre ?? '').trim() === cliente.trim()) ?? filas[0])?.direccion ?? '';
  };
  const sunat = useTipoCambioSunat(open && f.moneda === 'DOLARES');
  useEffect(() => {
    if (f.moneda === 'DOLARES' && !tcManual && sunat.data?.venta) setF(x => ({ ...x, tipo_cambio: Number(sunat.data!.venta).toFixed(3) }));
  }, [f.moneda, tcManual, sunat.data]);
  // Dirección registrada de cada cliente (viene de SUNAT al darlo de alta): completa la dirección de carga o entrega sin escribirla
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
  const elegirCliente = (nombre: string) => {
    if (nombre && !f.remitente && !f.origen_dir && direccionDe.get(nombre)) setAuto(a => ({ ...a, origen: true }));
    setF(x => {
      const siguiente = { ...x, cliente: nombre };
      if (nombre && !x.remitente) { siguiente.remitente = nombre; if (!x.origen_dir && direccionDe.get(nombre)) siguiente.origen_dir = direccionDe.get(nombre)!; }
      return siguiente;
    });
  };
  const elegirRemitente = (nombre: string) => {
    if (!f.origen_dir && direccionDe.get(nombre)) setAuto(a => ({ ...a, origen: true }));
    setF(x => ({ ...x, remitente: nombre, origen_dir: !x.origen_dir && direccionDe.get(nombre) ? direccionDe.get(nombre)! : x.origen_dir }));
  };
  const elegirDestinatario = (nombre: string) => {
    if (!f.destino_dir && direccionDe.get(nombre)) setAuto(a => ({ ...a, destino: true }));
    setF(x => ({ ...x, destinatario: nombre, destino_dir: !x.destino_dir && direccionDe.get(nombre) ? direccionDe.get(nombre)! : x.destino_dir }));
  };
  // Elegir el distrito: si hay una dirección usada antes en ese distrito, reemplaza a la que se llenó sola (nunca a la que se escribió a mano)
  const elegirDistrito = (lado: 'origen' | 'destino', codigo: string) => {
    const dirCampo = lado === 'origen' ? 'origen_dir' : 'destino_dir';
    const previa = codigo ? sugerida(lado, f.cliente, codigo) : '';
    const reemplaza = previa && (!f[dirCampo] || auto[lado]);
    if (reemplaza) setAuto(a => ({ ...a, [lado]: true }));
    set(reemplaza ? { [lado]: codigo, [dirCampo]: previa } : { [lado]: codigo });
  };

  const errores = useMemo(() => {
    const e: Partial<Record<Campo, string>> = {};
    if (f.contratacion === 'INTERMEDIARIO' && !f.intermediario.trim()) e.intermediario = 'Elige o escribe la empresa que nos contrata.';
    if (!f.cliente.trim()) e.cliente = 'Elige o escribe el cliente.';
    if (!f.ruta.trim()) e.ruta = 'Elige la ruta del servicio.';
    if (f.flete !== '' && !(Number(f.flete) >= 0)) e.flete = 'Escribe un monto válido.';
    return e;
  }, [f]);
  const ver = (c: Campo) => (tocados.has(c) ? errores[c] ?? null : null);
  const tocar = (c: Campo) => setTocados(s => new Set(s).add(c));

  /** Mueve al paso pedido; para avanzar exige que los pasos anteriores estén completos */
  function ir(n: number) {
    const destino = Math.max(0, Math.min(ultimo, n));
    if (destino > paso) {
      for (let p = paso; p < destino; p++) {
        const malos = CAMPOS_PASO[p].filter(c => errores[c]);
        if (malos.length) { setTocados(s => new Set([...s, ...malos])); setDireccion(1); setPaso(p); haptic('warning'); return; }
      }
    }
    haptic('selection');
    setDireccion(destino >= paso ? 1 : -1);
    setPaso(destino);
  }

  async function guardar(generarViaje: boolean) {
    const malo = (Object.keys(errores) as Campo[])[0];
    if (malo) { CAMPOS_PASO.forEach((cs, i) => { if (cs.includes(malo)) ir(i); }); setTocados(s => new Set([...s, malo])); haptic('warning'); return; }
    setError(null);
    setGuardando(generarViaje ? 'viaje' : 'solo');
    try {
      const cuerpo = {
        tipo_contratacion: f.contratacion, intermediario: f.contratacion === 'INTERMEDIARIO' ? f.intermediario : '', ejecucion: f.ejecucion,
        cliente_nombre: f.cliente, remitente_generador: f.remitente, destinatario: f.destinatario, tipo_servicio: f.tipo_servicio, es_retorno: f.sentido === 'RETORNO' ? 1 : 0,
        ruta: f.ruta, ubigeo_origen: f.origen, direccion_origen: f.origen_dir, ubigeo_destino: f.destino, direccion_destino: f.destino_dir,
        descripcion_carga: orden?.descripcion_carga ?? '', peso_estimado: f.peso === '' ? null : Number(f.peso),
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
  const monto = f.flete === '' ? '' : `${f.moneda === 'DOLARES' ? 'US$' : 'S/'} ${Number(f.flete).toLocaleString('es-PE', { minimumFractionDigits: 2 })} · ${IMPUESTOS.find(i => i.value === f.impuesto)?.label ?? ''}`;
  const fechaCorta = (v: string) => (v ? v.split('-').reverse().join('/') : '');

  return (
    <Sheet ancho open={open} onClose={() => !ocupado && onClose()} title={editando ? `Orden ${orden!.codigo_orden}` : 'Nueva orden de servicio'}
      footer={
        <>
          {paso > 0
            ? <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => ir(paso - 1)} disabled={ocupado}>Atrás</Button>
            : <Button variant="secondary" onClick={onClose} disabled={ocupado}>Cancelar</Button>}
          {paso < ultimo
            ? <Button variant="primary" icon={<ArrowRight size={16} />} onClick={() => ir(paso + 1)}>Siguiente</Button>
            : editando
              ? <Button variant="primary" onClick={() => guardar(false)} loading={guardando === 'solo'} disabled={ocupado}>Guardar cambios</Button>
              : (
                <>
                  {!viajeInicial && <Button variant="secondary" onClick={() => guardar(true)} loading={guardando === 'viaje'} disabled={ocupado}>Generar OS y viaje</Button>}
                  <Button variant="primary" onClick={() => guardar(false)} loading={guardando === 'solo'} disabled={ocupado}>
                    {viajeInicial ? `Generar OS y sumar al viaje ${viajeInicial}` : 'Generar OS'}
                  </Button>
                </>
              )}
        </>
      }>
      <div className="os-asist">
        <div className="os-asist__cab">
          <span className="t-eyebrow">Paso {paso + 1} de {PASOS.length}</span>
          <h3 className="os-asist__titulo">{PASOS[paso].titulo}</h3>
          <p className="os-asist__sub">{PASOS[paso].resumen}</p>
          <div className="os-prog" role="tablist" aria-label="Pasos de la orden">
            {PASOS.map((p, i) => (
              <button key={p.titulo} type="button" role="tab" aria-selected={i === paso} aria-label={p.titulo} className="os-prog__paso" onClick={() => ir(i)}>
                <motion.span className="os-prog__lleno" initial={false} animate={{ scaleX: i <= paso ? 1 : 0 }} transition={spring} />
              </button>
            ))}
          </div>
        </div>

        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

        <AnimatePresence mode="wait" initial={false} custom={direccion}>
          <motion.div key={paso} custom={direccion} className="os-asist__paso"
            initial={{ opacity: 0, x: reduce ? 0 : 36 * direccion }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduce ? 0 : -36 * direccion }} transition={spring}>

            {paso === 0 && (
              <>
                <SegmentedControl block label="¿Cómo nos contrata el cliente?" value={f.contratacion} onChange={v => set({ contratacion: v })} options={CONTRATACIONES} />
                {f.contratacion === 'INTERMEDIARIO' && (
                  <Field label="Empresa que nos contrata *" error={ver('intermediario')} hint="El cliente final lo eliges en el siguiente paso.">
                    {p => <Combobox {...p} options={opcionesClientes} value={f.intermediario || null} limit={50} placeholder="Busca o escribe la empresa" createLabel="Usar este nombre"
                      onChange={v => { set({ intermediario: v ?? '' }); tocar('intermediario'); }} onCreate={t => { set({ intermediario: t }); tocar('intermediario'); }} />}
                  </Field>
                )}
                <SegmentedControl block label="¿Quién transporta?" value={f.ejecucion} onChange={v => set({ ejecucion: v })} options={EJECUCIONES} />
                {f.ejecucion === 'TERCERO' && <p className="os-nota">Los datos del transportista (nombre, RUC y costo) se completan en el viaje.</p>}
                <div className="os-fila">
                  <SegmentedControl block label="Tipo de servicio" value={f.tipo_servicio} onChange={v => set({ tipo_servicio: v })} options={TIPOS} />
                  <SegmentedControl block label="Sentido" value={f.sentido} onChange={v => set({ sentido: v, ruta: '' })} options={SENTIDOS} />
                </div>
                {f.sentido === 'RETORNO' && <p className="os-nota">Un retorno con carga es un servicio adicional dentro del mismo viaje. Si regresa vacío no hace falta crear un servicio.</p>}
              </>
            )}

            {paso === 1 && (
              <>
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
              </>
            )}

            {paso === 2 && (
              <>
                <Field label="Ruta *" error={ver('ruta')} hint={rutas.isLoading ? 'Cargando rutas…' : opcionesRutas.length ? 'Sale de la matriz de combustible. Si no está, escríbela como ORIGEN - DESTINO.' : 'Escríbela como ORIGEN - DESTINO (ej. LIMA - AREQUIPA).'}>
                  {p => <Combobox {...p} options={opcionesRutas} value={f.ruta || null} loading={rutas.isLoading} placeholder="Ej. LIMA - AREQUIPA" createLabel="Usar esta ruta" limit={60}
                    onChange={v => { set({ ruta: v ?? '' }); tocar('ruta'); }} onCreate={t => { set({ ruta: t.trim().toUpperCase() }); tocar('ruta'); }} />}
                </Field>
                <div className="os-fila">
                  <Field label="Fecha del servicio">{p => <TextInput {...p} type="date" value={f.fecha} onChange={e => set({ fecha: e.target.value })} />}</Field>
                  <Field label="Entrega estimada">{p => <TextInput {...p} type="date" value={f.fecha_entrega} min={f.fecha} onChange={e => set({ fecha_entrega: e.target.value })} />}</Field>
                </div>
                <Subtitulo icono={<MapPin size={14} />} nota="Opcional. Se necesitan para emitir la guía de remisión; puedes completarlos después.">Punto de carga y de entrega</Subtitulo>
                <div className="os-fila">
                  <div className="os-punto">
                    <Field label="Punto de carga" hint={f.origen ? `Ubigeo ${f.origen}` : 'Busca por distrito, provincia o código'}>
                      {p => <Combobox {...p} options={ubi.opciones} value={f.origen || null} loading={ubi.cargando} placeholder="Distrito de carga" onChange={v => elegirDistrito('origen', v ?? '')} />}
                    </Field>
                    <Field label="Dirección o planta" hint={auto.origen && f.origen_dir ? 'Completada con la última usada. Puedes corregirla.' : undefined}>{p => <TextInput {...p} value={f.origen_dir} placeholder="Calle, número o nombre de la planta" onChange={e => { setAuto(a => ({ ...a, origen: false })); set({ origen_dir: e.target.value }); }} />}</Field>
                  </div>
                  <div className="os-punto">
                    <Field label="Punto de entrega" hint={f.destino ? `Ubigeo ${f.destino}` : 'Busca por distrito, provincia o código'}>
                      {p => <Combobox {...p} options={ubi.opciones} value={f.destino || null} loading={ubi.cargando} placeholder="Distrito de entrega" onChange={v => elegirDistrito('destino', v ?? '')} />}
                    </Field>
                    <Field label="Dirección o lugar de entrega" hint={auto.destino && f.destino_dir ? 'Completada con la última usada. Puedes corregirla.' : undefined}>{p => <TextInput {...p} value={f.destino_dir} placeholder="Calle, número o nombre del lugar" onChange={e => { setAuto(a => ({ ...a, destino: false })); set({ destino_dir: e.target.value }); }} />}</Field>
                  </div>
                </div>
              </>
            )}

            {paso === 3 && (
              <>
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
                <Field label="Peso estimado (kg) · opcional" hint="Se completa con las guías de remisión.">{p => <TextInput {...p} inputMode="decimal" value={f.peso} placeholder="0" onChange={e => set({ peso: e.target.value.replace(/[^\d.]/g, '') })} />}</Field>
                <Field label="Observaciones · opcional">{p => <TextInput {...p} value={f.observaciones} placeholder="Notas para operaciones" onChange={e => set({ observaciones: e.target.value })} />}</Field>
              </>
            )}

            {paso === 4 && (
              <div className="os-res">
                <div className="os-res__hero">
                  <span className="os-res__ruta">{f.ruta || 'Sin ruta'}</span>
                  <span className="os-res__cliente">{f.cliente || 'Sin cliente'}</span>
                  {monto && <span className="os-res__monto">{monto}</span>}
                </div>
                <GrupoResumen titulo="Servicio" paso={0} onCambiar={ir}>
                  <FilaResumen label="Contratación" valor={f.contratacion === 'INTERMEDIARIO' ? `Por intermediario · ${f.intermediario}` : 'Cliente directo'} />
                  <FilaResumen label="Transporta" valor={f.ejecucion === 'TERCERO' ? 'Transportista tercero' : 'Flota propia'} />
                  <FilaResumen label="Tipo" valor={`${TIPOS.find(t => t.value === f.tipo_servicio)?.label ?? f.tipo_servicio} · ${f.sentido === 'RETORNO' ? 'Retorno con carga' : 'Ida'}`} />
                </GrupoResumen>
                <GrupoResumen titulo="Cliente" paso={1} onCambiar={ir}>
                  <FilaResumen label="Cliente" valor={f.cliente} />
                  <FilaResumen label="Remitente" valor={f.remitente} />
                  <FilaResumen label="Destinatario" valor={f.destinatario} />
                </GrupoResumen>
                <GrupoResumen titulo="Ruta" paso={2} onCambiar={ir}>
                  <FilaResumen label="Ruta" valor={f.ruta} />
                  <FilaResumen label="Fecha" valor={fechaCorta(f.fecha)} />
                  <FilaResumen label="Entrega estimada" valor={fechaCorta(f.fecha_entrega)} />
                  <FilaResumen label="Punto de carga" valor={[etiquetaDe(f.origen), f.origen_dir].filter(Boolean).join(' · ')} />
                  <FilaResumen label="Punto de entrega" valor={[etiquetaDe(f.destino), f.destino_dir].filter(Boolean).join(' · ')} />
                  {!f.origen && !f.destino && <p className="os-nota">Sin puntos de carga y entrega: se completan antes de la guía.</p>}
                </GrupoResumen>
                <GrupoResumen titulo="Tarifa" paso={3} onCambiar={ir}>
                  <FilaResumen label="Flete" valor={monto || 'Sin tarifa'} />
                  {f.moneda === 'DOLARES' && <FilaResumen label="Tipo de cambio" valor={f.tipo_cambio} />}
                  <FilaResumen label="Peso estimado" valor={f.peso ? `${Number(f.peso).toLocaleString('es-PE')} kg` : ''} />
                  <FilaResumen label="Observaciones" valor={f.observaciones} />
                </GrupoResumen>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
