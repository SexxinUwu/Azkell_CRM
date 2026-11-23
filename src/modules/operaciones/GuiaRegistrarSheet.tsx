import './servicios.css';
import './seguimiento.css';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, CircleAlert, FileText, PenLine, Plus, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { cargarUbigeos, normalizar, ubigeoDeDireccion, useOpcionesUbigeo, useUbigeos } from './ubigeos';
import type { Guia, LecturaGuia, TipoGuia } from './guiasApi';
import { usePuntos, type Punto } from './puntosApi';
import { MOTIVOS_TRASLADO, motivoDeTexto } from './motivosTraslado';

/** Datos de una orden de servicio que sirven para llenar la guía */
interface ServicioGuia {
  id: number; codigo_orden: string; cliente_nombre: string; estado_servicio?: string | null; origen?: string | null; destino?: string | null;
  remitente_generador?: string | null; destinatario?: string | null; direccion_origen?: string | null; ubigeo_origen?: string | null;
  direccion_destino?: string | null; ubigeo_destino?: string | null; descripcion_carga?: string | null; fecha_entrega_fmt?: string | null;
}

/** Pasos del formulario: cada uno agrupa lo que se confirma junto. Arriba se marca en verde el que ya está completo. */
const PASOS_GUIA = [
  { titulo: 'Servicio', sub: 'A qué servicio pertenece y cuándo se comprometió la entrega' },
  { titulo: 'Guía', sub: 'Número, fechas y motivo del traslado' },
  { titulo: 'Partes', sub: 'Quién envía y quién recibe' },
  { titulo: 'Puntos', sub: 'De dónde sale y a dónde llega' },
  { titulo: 'Carga', sub: 'Qué se transporta y quién lo lleva' },
] as const;
const ULTIMO = PASOS_GUIA.length - 1;

/** Una línea de «Qué se transporta»: un producto o bulto */
interface LineaForm { descripcion: string; codigo: string; cantidad: string; unidad: string; peso: string; volumen: string }
const LINEA_VACIA: LineaForm = { descripcion: '', codigo: '', cantidad: '', unidad: 'NIU', peso: '', volumen: '' };
const UNIDADES: Array<[string, string]> = [['NIU', 'Unidad'], ['BX', 'Caja'], ['BE', 'Fardo o bulto'], ['KGM', 'Kilogramo'], ['TNE', 'Tonelada'], ['LTR', 'Litro'], ['GLL', 'Galón'], ['MTR', 'Metro'], ['ZZ', 'Otra']];
const num = (v: string) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };

interface Form {
  tipo: TipoGuia; serie_numero: string; fecha_emision: string; fecha_traslado: string;
  remitente_ruc: string; remitente_nombre: string; destinatario_doc: string; destinatario_nombre: string;
  transportista_ruc: string; transportista_nombre: string; modalidad: '' | 'PUBLICO' | 'PRIVADO'; motivo: string;
  partida_ubigeo: string; partida_direccion: string; llegada_ubigeo: string; llegada_direccion: string;
  peso: string; bultos: string; descripcion: string; observaciones: string; placa: string; conductor_nombre: string; conductor_doc: string; licencia: string; vehiculo_tuc: string; vehiculo_autorizacion: string;
  fuente: 'XML' | 'IA' | 'MANUAL'; items: LineaForm[]; trae_transporte: boolean; fecha_comprometida: string; hora_comprometida: string;
}
type Campo = 'serie_numero' | 'emisor' | 'peso';
type Lado = 'partida' | 'llegada';

const VACIO: Form = {
  tipo: 'REMITENTE', serie_numero: '', fecha_emision: '', fecha_traslado: '', remitente_ruc: '', remitente_nombre: '', destinatario_doc: '', destinatario_nombre: '',
  transportista_ruc: '', transportista_nombre: '', modalidad: '', motivo: '', partida_ubigeo: '', partida_direccion: '', llegada_ubigeo: '', llegada_direccion: '',
  peso: '', bultos: '', descripcion: '', observaciones: '', placa: '', conductor_nombre: '', conductor_doc: '', licencia: '', vehiculo_tuc: '', vehiculo_autorizacion: '', fuente: 'MANUAL', items: [], trae_transporte: false, fecha_comprometida: '', hora_comprometida: '',
};
const s = (v: unknown) => (v == null ? '' : String(v));
const desdeLectura = (l: LecturaGuia): Form => ({
  tipo: l.tipo ?? 'REMITENTE', serie_numero: s(l.numero_completo), fecha_emision: s(l.fecha_emision), fecha_traslado: s(l.fecha_traslado),
  remitente_ruc: s(l.remitente_ruc), remitente_nombre: s(l.remitente_nombre), destinatario_doc: s(l.destinatario_doc), destinatario_nombre: s(l.destinatario_nombre),
  transportista_ruc: s(l.transportista_ruc), transportista_nombre: s(l.transportista_nombre), modalidad: l.modalidad ?? '', motivo: s(l.motivo),
  partida_ubigeo: s(l.partida_ubigeo), partida_direccion: s(l.partida_direccion), llegada_ubigeo: s(l.llegada_ubigeo), llegada_direccion: s(l.llegada_direccion),
  peso: l.peso_kg != null ? String(l.peso_kg) : '', bultos: s(l.bultos), descripcion: s(l.descripcion), observaciones: s(l.observaciones), placa: s(l.placa),
  conductor_nombre: s(l.conductor_nombre), conductor_doc: s(l.conductor_doc), licencia: s(l.licencia), vehiculo_tuc: s(l.vehiculo_tuc), vehiculo_autorizacion: s(l.vehiculo_autorizacion), fuente: l.fuente, items: (l.items ?? []).map(i => ({ ...LINEA_VACIA, descripcion: s(i.descripcion), cantidad: i.cantidad != null ? String(i.cantidad) : '', unidad: s(i.unidad) || 'NIU' })), trae_transporte: l.trae_transporte, fecha_comprometida: '', hora_comprometida: '',
});

/** Datos de una guía ya registrada, para corregirlos en el mismo formulario */
const desdeGuia = (g: Guia): Form => {
  let items: Record<string, unknown>[] = [];
  try { items = g.items_json ? JSON.parse(g.items_json) : []; } catch { items = []; }
  return {
    tipo: g.tipo, serie_numero: s(g.numero_completo), fecha_emision: s(g.fecha_emision), fecha_traslado: s(g.fecha_traslado),
    remitente_ruc: s(g.remitente_ruc), remitente_nombre: s(g.remitente_nombre), destinatario_doc: s(g.destinatario_doc), destinatario_nombre: s(g.destinatario_nombre),
    transportista_ruc: s(g.transportista_ruc), transportista_nombre: s(g.transportista_nombre), modalidad: g.modalidad === 'PUBLICO' || g.modalidad === 'PRIVADO' ? g.modalidad : '', motivo: s(g.motivo),
    partida_ubigeo: s(g.partida_ubigeo), partida_direccion: s(g.partida_direccion), llegada_ubigeo: s(g.llegada_ubigeo), llegada_direccion: s(g.llegada_direccion),
    peso: Number(g.peso_kg) > 0 ? String(g.peso_kg) : '', bultos: s(g.bultos), descripcion: s(g.descripcion), observaciones: s(g.observaciones), placa: s(g.placa),
    conductor_nombre: s(g.conductor_nombre), conductor_doc: s(g.conductor_doc), licencia: s(g.licencia), vehiculo_tuc: s(g.vehiculo_tuc), vehiculo_autorizacion: s(g.vehiculo_autorizacion),
    fuente: g.fuente, trae_transporte: !!g.trae_transporte,
    items: items.map(i => ({ descripcion: s(i.descripcion), codigo: s(i.codigo), cantidad: i.cantidad != null ? String(i.cantidad) : '', unidad: s(i.unidad) || 'NIU', peso: i.peso_kg != null ? String(i.peso_kg) : '', volumen: i.volumen_m3 != null ? String(i.volumen_m3) : '' })), fecha_comprometida: s(g.fecha_comprometida), hora_comprometida: s(g.hora_comprometida),
  };
};

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section className="os-seccion">
      <h3 className="os-seccion__titulo">{titulo}{nota && <span className="gr__nota"> · {nota}</span>}</h3>
      <div className="os-seccion__cuerpo">{children}</div>
    </section>
  );
}

/** Registrar una guía que entrega el cliente: se sube el XML, la foto o el PDF, se leen los datos y la persona los confirma. */
export function GuiaRegistrarSheet({ open, onClose, onRegistrada, editar }: { open: boolean; onClose: () => void; onRegistrada: (guia?: Guia) => void; editar?: Guia | null }) {
  const toast = useToast();
  const qc = useQueryClient();
  const ubi = useOpcionesUbigeo();
  const catalogo = useUbigeos();
  const entrada = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<'subir' | 'leyendo' | 'revisar'>('subir');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [f, setF] = useState<Form>(VACIO);
  const [advertencias, setAdvertencias] = useState<string[]>([]);
  // Lo que propuso el lector (XML o IA): al guardar se envía para comparar con lo que la persona confirmó
  const [lectura, setLectura] = useState<LecturaGuia | null>(null);
  const [duplicada, setDuplicada] = useState(false);
  const [paso, setPaso] = useState(0);
  // Servicio al que se vincula la guía al registrarla (opcional) y catálogo de puntos de carga y descarga
  const [servicioId, setServicioId] = useState<string | null>(null);
  const servicios = useQuery({
    queryKey: ['operaciones', 'servicios-para-guia'], enabled: open && !editar, staleTime: 60_000,
    queryFn: () => api<{ data?: ServicioGuia[] }>('/operaciones/ordenes-servicio').then(r => r.data ?? []),
  });
  const puntos = usePuntos(open);
  const [tocados, setTocados] = useState<Set<Campo>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [guardando, setGuardando] = useState<'solo' | 'vincular' | null>(null);
  // Distritos que el sistema sacó de la dirección (se avisa para que la persona los confirme)
  const [auto, setAuto] = useState<Record<Lado, boolean>>({ partida: false, llegada: false });

  useEffect(() => {
    if (open) { setFase('subir'); setArchivo(null); setF(VACIO); setLectura(null); setServicioId(null); setAdvertencias([]); setDuplicada(false); setTocados(new Set()); setError(null); setArrastrando(false); setAuto({ partida: false, llegada: false });
      // Editar una guía ya registrada: se abre directo con sus datos, sin subir el archivo otra vez
      if (editar) { setF(desdeGuia(editar)); setFase('revisar'); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editar?.id]);

  useEffect(() => { if (fase !== 'revisar') setPaso(0); }, [fase]);
  const set = (p: Partial<Form>) => setF(x => ({ ...x, ...p }));
  // Líneas de «Qué se transporta»: siempre se ve al menos una; los totales salen de las líneas
  const lineas = f.items.length ? f.items : [LINEA_VACIA];
  const setLinea = (i: number, p: Partial<LineaForm>) => setF(x => ({ ...x, items: (x.items.length ? x.items : [LINEA_VACIA]).map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const agregarLinea = () => setF(x => ({ ...x, items: [...(x.items.length ? x.items : [LINEA_VACIA]), { ...LINEA_VACIA }] }));
  const quitarLinea = (i: number) => setF(x => ({ ...x, items: x.items.filter((_, j) => j !== i) }));
  const totales = lineas.reduce((t, l) => ({ cantidad: t.cantidad + num(l.cantidad), peso: t.peso + num(l.peso), volumen: t.volumen + num(l.volumen) }), { cantidad: 0, peso: 0, volumen: 0 });
  // El motivo se elige del catálogo de SUNAT; si la guía trae uno que no se reconoce, se conserva como opción
  const motivoCat = motivoDeTexto(f.motivo);
  const opcionesServicio = (servicios.data ?? [])
    .filter(x => !['ANULADO', 'ENTREGADO'].includes(String(x.estado_servicio ?? '').toUpperCase()))
    .map(x => ({ value: String(x.id), label: `${x.codigo_orden} · ${x.cliente_nombre}`, description: [x.origen, x.destino].filter(Boolean).join(' → '), keywords: `${x.remitente_generador ?? ''} ${x.destinatario ?? ''}` }));
  const servicio = (servicios.data ?? []).find(x => String(x.id) === servicioId) ?? null;
  // La orden de servicio guarda solo los nombres: el RUC se busca en la tabla de clientes (mismo nombre)
  const clientes = useQuery({
    queryKey: ['directorio', 'clientes'], enabled: open && !editar, staleTime: 5 * 60_000,
    queryFn: () => api<unknown>('/clientes').then(r => (Array.isArray(r) ? r : ((r as { data?: unknown[] })?.data ?? [])) as { razon_social?: string | null; ruc_dni?: string | null }[]),
  });
  const rucDe = (nombre: unknown) => {
    const n = normalizar(nombre);
    if (!n) return '';
    const c = (clientes.data ?? []).find(x => normalizar(x.razon_social) === n);
    return String(c?.ruc_dni ?? '').replace(/\D/g, '');
  };
  // Distrito: el de la orden; si no tiene, se deduce del final de la dirección
  const ubigeoPara = (ub: unknown, direccion: unknown) => s(ub) || ubigeoDeDireccion(s(direccion), catalogo.data ?? [])?.codigo || '';
  // Elegir el servicio completa solo lo que está vacío: lo que dice la guía del cliente manda
  function elegirServicio(v: string | null) {
    setServicioId(v);
    const os = (servicios.data ?? []).find(x => String(x.id) === v);
    if (!os) return;
    setF(x => ({
      ...x,
      remitente_nombre: x.remitente_nombre || s(os.remitente_generador || os.cliente_nombre), destinatario_nombre: x.destinatario_nombre || s(os.destinatario),
      remitente_ruc: x.remitente_ruc || rucDe(os.remitente_generador || os.cliente_nombre), destinatario_doc: x.destinatario_doc || rucDe(os.destinatario),
      partida_direccion: x.partida_direccion || s(os.direccion_origen), partida_ubigeo: x.partida_ubigeo || ubigeoPara(os.ubigeo_origen, x.partida_direccion || os.direccion_origen),
      llegada_direccion: x.llegada_direccion || s(os.direccion_destino), llegada_ubigeo: x.llegada_ubigeo || ubigeoPara(os.ubigeo_destino, x.llegada_direccion || os.direccion_destino),
      descripcion: x.descripcion || s(os.descripcion_carga), fecha_comprometida: x.fecha_comprometida || s(os.fecha_entrega_fmt),
    }));
  }
  // Puntos del catálogo: los del cliente del servicio si hay; si no, todos los de ese tipo
  const puntosDe = (lado: Lado): Punto[] => {
    const tipo = lado === 'partida' ? 'CARGA' : 'DESCARGA';
    const todos = (puntos.data ?? []).filter(p => p.tipo === tipo);
    const cli = (servicio?.cliente_nombre ?? '').trim().toLowerCase();
    const delCliente = cli ? todos.filter(p => p.cliente_nombre.trim().toLowerCase() === cli) : [];
    return delCliente.length ? delCliente : todos;
  };
  function elegirPunto(lado: Lado, idPunto: string | null) {
    const p = (puntos.data ?? []).find(x => String(x.id) === idPunto);
    if (!p) return;
    set({ [`${lado}_direccion`]: p.direccion, [`${lado}_ubigeo`]: p.ubigeo ?? '' } as Partial<Form>);
    setAuto(a => ({ ...a, [lado]: false }));
  }
  const tocar = (c: Campo) => setTocados(x => new Set(x).add(c));
  const emisor = f.tipo === 'TRANSPORTISTA' ? f.transportista_ruc : f.remitente_ruc;
  const errores: Partial<Record<Campo, string>> = {};
  if (!/^[A-Za-z0-9]{3,4}-\d{1,8}$/.test(f.serie_numero.trim())) errores.serie_numero = 'Escribe la serie y el número, por ejemplo T001-00000123.';
  if (!/^\d{11}$/.test(emisor.trim())) errores.emisor = f.tipo === 'TRANSPORTISTA' ? 'Indica el RUC (11 dígitos) del transportista que emitió la guía.' : 'Indica el RUC (11 dígitos) del remitente que emitió la guía.';
  if (!(Number(f.peso.replace(',', '.')) > 0)) errores.peso = 'Indica el peso bruto total en kilos.';
  const ver = (c: Campo) => (tocados.has(c) ? errores[c] ?? null : null);
  // Un paso queda en verde cuando tiene lo necesario; el de servicio es opcional y se marca si se eligió algo
  const completo = [
    !!servicioId || !!f.fecha_comprometida,
    !errores.serie_numero && !!f.motivo.trim(),
    !errores.emisor && !!f.remitente_nombre.trim() && !!f.destinatario_nombre.trim(),
    !!f.partida_direccion.trim() && !!f.llegada_direccion.trim() && /^\d{6}$/.test(f.partida_ubigeo) && /^\d{6}$/.test(f.llegada_ubigeo),
    !errores.peso && f.items.some(i => i.descripcion.trim()),
  ];

  // Si no hay distrito elegido, lo saca del final de la dirección («… - ATE - LIMA - LIMA»)
  function detectar(lado: Lado) {
    const ub = `${lado}_ubigeo` as const; const dir = `${lado}_direccion` as const;
    if (f[ub] || !catalogo.data) return;
    const u = ubigeoDeDireccion(f[dir], catalogo.data);
    if (u) { set({ [ub]: u.codigo } as Partial<Form>); setAuto(a => ({ ...a, [lado]: true })); }
  }

  async function leer(archivoElegido: File) {
    setArchivo(archivoElegido); setError(null); setFase('leyendo');
    try {
      const form = new FormData();
      form.append('archivo', archivoElegido);
      const r = await api<{ ok: boolean; datos: LecturaGuia; duplicada: { id: number } | null }>('/operaciones/gre/leer', { method: 'POST', body: form });
      const inicial = desdeLectura(r.datos);
      const marcas: Record<Lado, boolean> = { partida: false, llegada: false };
      try {
        const lista = await cargarUbigeos();
        for (const lado of ['partida', 'llegada'] as const) {
          if (!inicial[`${lado}_ubigeo`]) {
            const u = ubigeoDeDireccion(inicial[`${lado}_direccion`], lista);
            if (u) { inicial[`${lado}_ubigeo`] = u.codigo; marcas[lado] = true; }
          }
        }
      } catch { /* sin catálogo: la persona elige el distrito */ }
      setF(inicial); setLectura(r.datos); setAuto(marcas); setAdvertencias(r.datos.advertencias ?? []); setDuplicada(!!r.duplicada); haptic('success');
      setFase('revisar');
    } catch (err) { setError(errorMessage(err)); setFase('subir'); haptic('warning'); }
  }

  const soltar = (e: DragEvent) => { e.preventDefault(); setArrastrando(false); const a = e.dataTransfer.files?.[0]; if (a) void leer(a); };

  async function guardar(vincular: boolean) {
    setTocados(new Set(['serie_numero', 'emisor', 'peso']));
    if (Object.keys(errores).length) { setPaso(errores.serie_numero ? 1 : errores.emisor ? 2 : 4); haptic('warning'); return; }
    setError(null); setGuardando(vincular ? 'vincular' : 'solo');
    try {
      const datos = {
        lectura_original: editar || f.fuente === 'MANUAL' ? undefined : lectura,
        origen: 'RECIBIDA', tipo: f.tipo, numero_completo: f.serie_numero.trim().toUpperCase(), fecha_emision: f.fecha_emision || null, fecha_traslado: f.fecha_traslado || null,
        remitente_ruc: f.remitente_ruc, remitente_nombre: f.remitente_nombre, destinatario_doc: f.destinatario_doc, destinatario_nombre: f.destinatario_nombre,
        transportista_ruc: f.transportista_ruc, transportista_nombre: f.transportista_nombre, modalidad: f.modalidad || null, motivo: motivoCat ? motivoCat[1] : f.motivo,
        partida_ubigeo: f.partida_ubigeo, partida_direccion: f.partida_direccion, llegada_ubigeo: f.llegada_ubigeo, llegada_direccion: f.llegada_direccion,
        peso_kg: Number(f.peso.replace(',', '.')), bultos: f.bultos ? Number(f.bultos) : null, descripcion: f.descripcion, observaciones: f.observaciones,
        items: f.items.filter(i => i.descripcion.trim()).map(i => ({ descripcion: i.descripcion.trim(), codigo: i.codigo.trim() || null, cantidad: num(i.cantidad) || null, unidad: i.unidad, peso_kg: num(i.peso) || null, volumen_m3: num(i.volumen) || null })),
        placa: f.placa, conductor_nombre: f.conductor_nombre, conductor_doc: f.conductor_doc, licencia: f.licencia, vehiculo_tuc: f.vehiculo_tuc, vehiculo_autorizacion: f.vehiculo_autorizacion, trae_transporte: f.trae_transporte, fuente: f.fuente, fecha_comprometida: f.fecha_comprometida || null, hora_comprometida: f.hora_comprometida || null,
      };
      if (editar) {
        const m = await api<{ ok?: boolean; error?: string; message?: string }>(`/operaciones/gre/guias/${editar.id}`, { method: 'PUT', body: datos });
        if (m.ok === false) throw new Error(m.error || 'No se pudo guardar los cambios');
        haptic('success'); toast(m.message || 'Guía actualizada');
        await qc.invalidateQueries({ queryKey: ['operaciones'] });
        onRegistrada(undefined);
        return;
      }
      const cuerpo = new FormData();
      cuerpo.append('datos', JSON.stringify(datos));
      if (archivo) cuerpo.append('archivo', archivo);
      const r = await api<{ ok?: boolean; error?: string; id?: number; message?: string }>('/operaciones/gre/guias', { method: 'POST', body: cuerpo });
      if (r.ok === false) throw new Error(r.error || 'No se pudo registrar la guía');
      haptic('success'); toast(r.message || 'Guía registrada');
      // Con un servicio elegido, la guía queda vinculada en el mismo paso
      if (servicioId && r.id) {
        try {
          const v = await api<{ ok?: boolean; error?: string; message?: string }>(`/operaciones/gre/guias/${r.id}/vincular`, { method: 'POST', body: { orden_servicio_id: Number(servicioId) } });
          if (v.ok === false) throw new Error(v.error || 'No se pudo vincular');
          toast(v.message || 'Guía vinculada');
        } catch (errV) { toast(`La guía se registró, pero no se pudo vincular: ${errorMessage(errV)}`, 'error'); }
        await qc.invalidateQueries({ queryKey: ['operaciones'] });
        onRegistrada(undefined);
        return;
      }
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
      if (vincular && r.id) {
        const d = await api<{ data: Guia }>(`/operaciones/gre/guias/${r.id}`);
        onRegistrada(d.data);
      } else onRegistrada(undefined);
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(null); }
  }

  const ocupado = guardando !== null;
  const pista = (lado: Lado) => (f[`${lado}_ubigeo`] ? (auto[lado] ? 'Detectado de la dirección · confírmalo' : `Ubigeo ${f[`${lado}_ubigeo`]}`) : 'Opcional · se detecta de la dirección');
  return (
    <Sheet ancho open={open} onClose={() => !ocupado && fase !== 'leyendo' && onClose()} title={editar ? `Editar guía ${editar.numero_completo}` : 'Registrar guía'}
      footer={fase === 'revisar' && editar ? (
        <>
          {paso > 0
            ? <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => setPaso(paso - 1)} disabled={ocupado}>Atrás</Button>
            : <Button variant="secondary" onClick={onClose} disabled={ocupado}>Cancelar</Button>}
          {paso < ULTIMO
            ? <Button variant="primary" icon={<ArrowRight size={16} />} onClick={() => setPaso(paso + 1)}>Siguiente</Button>
            : <Button variant="primary" onClick={() => guardar(false)} loading={guardando === 'solo'} disabled={ocupado}>Guardar cambios</Button>}
        </>
      ) : fase === 'revisar' ? (
        <>
          {paso > 0
            ? <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => setPaso(paso - 1)} disabled={ocupado}>Atrás</Button>
            : <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => setFase('subir')} disabled={ocupado}>Otro archivo</Button>}
          {paso < ULTIMO
            ? <Button variant="primary" icon={<ArrowRight size={16} />} onClick={() => setPaso(paso + 1)}>Siguiente</Button>
            : <Button variant={servicioId ? 'primary' : 'secondary'} onClick={() => guardar(false)} loading={guardando === 'solo'} disabled={ocupado}>{servicioId ? 'Registrar y vincular' : 'Registrar'}</Button>}
          {paso >= ULTIMO && !servicioId && <Button variant="primary" onClick={() => guardar(true)} loading={guardando === 'vincular'} disabled={ocupado}>Registrar y vincular a un servicio</Button>}
        </>
      ) : <Button variant="secondary" onClick={onClose} disabled={fase === 'leyendo'}>Cancelar</Button>}>
      <div className="gr gr--compacto">
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

        {fase === 'subir' && (
          <>
            <div className={`gr__zona${arrastrando ? ' gr__zona--on' : ''}`} onDragOver={e => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)} onDrop={soltar}
              role="button" tabIndex={0} onClick={() => entrada.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.current?.click(); } }}>
              <span className="gr__icono" aria-hidden><UploadCloud size={28} /></span>
              <strong>Sube la guía que te dio el cliente</strong>
              <span>Arrástrala aquí o toca para elegirla. Foto, PDF o XML.</span>
              <input ref={entrada} type="file" hidden accept="image/*,application/pdf,.pdf,.xml,text/xml,application/xml"
                onChange={e => { const a = e.target.files?.[0]; e.target.value = ''; if (a) void leer(a); }} />
            </div>
            <ul className="gr__ayuda">
              <li><FileText size={16} aria-hidden /><span><b>XML:</b> se lee exacto, sin errores.</span></li>
              <li><Sparkles size={16} aria-hidden /><span><b>Foto o PDF:</b> la IA propone los datos y tú los confirmas antes de guardar.</span></li>
            </ul>
            <Button variant="plain" icon={<PenLine size={16} />} onClick={() => { setF(VACIO); setLectura(null); setAdvertencias([]); setAuto({ partida: false, llegada: false }); setFase('revisar'); }}>Prefiero llenarla a mano</Button>
          </>
        )}

        {fase === 'leyendo' && (
          <div className="gr__leyendo">
            <PageLoader />
            <strong>Leyendo la guía…</strong>
            <span>{archivo?.name}</span>
          </div>
        )}

        {fase === 'revisar' && (
          <>
            <div className="gr-pasos" role="tablist" aria-label="Pasos de la guía">
              {PASOS_GUIA.map((p, i) => (
                <button key={p.titulo} type="button" role="tab" aria-selected={i === paso} onClick={() => setPaso(i)}
                  className={`gr-pasos__btn${i === paso ? ' gr-pasos__btn--on' : ''}${completo[i] ? ' gr-pasos__btn--ok' : ''}`}>
                  <span className="gr-pasos__ico">{completo[i] ? <Check size={13} strokeWidth={3} aria-label="Completo" /> : i + 1}</span>
                  <span>{p.titulo}</span>
                </button>
              ))}
            </div>
            <p className="gr-pasos__nota">Paso {paso + 1} de {PASOS_GUIA.length} · {PASOS_GUIA[paso].sub}</p>
            {archivo && <p className="gr__archivo"><FileText size={15} aria-hidden /> {archivo.name} · {f.fuente === 'XML' ? 'leída del XML' : f.fuente === 'IA' ? 'leída con IA: revisa cada dato' : 'a mano'}</p>}
            {duplicada && <Notice tone="error" icon={<CircleAlert size={16} />}>Esta guía ya está registrada. Si guardas, el sistema lo impedirá; revisa el número y el RUC del emisor.</Notice>}
            {advertencias.length > 0 && <Notice tone="accent" icon={<CircleAlert size={16} />}>{advertencias.map(a => <div key={a}>{a}</div>)}</Notice>}
            {f.trae_transporte && <Notice tone="accent">Esta guía ya trae los datos del transporte (transportista, vehículo, conductor y fecha de traslado). Según la norma de SUNAT, puede que no haga falta emitir nuestra GRE Transportista: confírmalo antes de decidir.</Notice>}

            <div hidden={paso !== 0}><Seccion titulo="Servicio y entrega" nota={editar ? 'cuándo se comprometió la entrega' : 'opcional · con un servicio elegido, la guía queda vinculada al guardar'}>
              {!editar && (
                <Field label="Servicio" hint="Completa lo que falte en la guía: dirección, destinatario y fecha de entrega">
                  {p => <Combobox {...p} options={opcionesServicio} value={servicioId} loading={servicios.isLoading} placeholder="Busca la orden de servicio" onChange={elegirServicio} />}
                </Field>
              )}
              <div className="gr__g3">
                <Field label="Fecha comprometida de entrega" hint="Sirve para medir el cumplimiento (On Time)">{p => <TextInput {...p} type="date" value={f.fecha_comprometida} onChange={e => set({ fecha_comprometida: e.target.value })} />}</Field>
                <Field label="Hora comprometida" hint="Solo si el cliente pactó hora">{p => <TextInput {...p} type="time" value={f.hora_comprometida} onChange={e => set({ hora_comprometida: e.target.value })} />}</Field>
              </div>
            </Seccion></div>

            <div hidden={paso !== 1}><Seccion titulo="La guía">
              <SegmentedControl block label="Tipo de guía" value={f.tipo} onChange={v => set({ tipo: v })} options={[{ value: 'REMITENTE', label: 'GRE Remitente' }, { value: 'TRANSPORTISTA', label: 'GRE Transportista' }]} />
              <div className="gr__g3">
                <Field label="Serie y número *" error={ver('serie_numero')}>
                  {p => <TextInput {...p} value={f.serie_numero} placeholder="T001-00000123" style={{ textTransform: 'uppercase' }} onBlur={() => tocar('serie_numero')} onChange={e => set({ serie_numero: e.target.value })} />}
                </Field>
                <Field label="Emisión">{p => <TextInput {...p} type="date" value={f.fecha_emision} onChange={e => set({ fecha_emision: e.target.value })} />}</Field>
                <Field label="Inicio del traslado">{p => <TextInput {...p} type="date" value={f.fecha_traslado} onChange={e => set({ fecha_traslado: e.target.value })} />}</Field>
              </div>
              <Field label="Motivo del traslado">
                {p => (
                  <SelectInput {...p} value={motivoCat ? motivoCat[1] : f.motivo} onChange={e => set({ motivo: e.target.value })}>
                    <option value="">Elige el motivo</option>
                    {f.motivo && !motivoCat && <option value={f.motivo}>{f.motivo}</option>}
                    {MOTIVOS_TRASLADO.map(([c, d]) => <option key={c} value={d}>{c} · {d}</option>)}
                  </SelectInput>
                )}
              </Field>
            </Seccion></div>

            <div hidden={paso !== 2}><Seccion titulo="Quién envía y quién recibe">
              <div className="gr__g4">
                <Field label={f.tipo === 'REMITENTE' ? 'RUC remitente *' : 'RUC remitente'} error={f.tipo === 'REMITENTE' ? ver('emisor') : null}>
                  {p => <TextInput {...p} inputMode="numeric" maxLength={11} value={f.remitente_ruc} onBlur={() => tocar('emisor')} onChange={e => set({ remitente_ruc: e.target.value.replace(/\D/g, '') })} />}
                </Field>
                <div className="gr__s3"><Field label="Remitente">{p => <TextInput {...p} value={f.remitente_nombre} onChange={e => set({ remitente_nombre: e.target.value })} />}</Field></div>
                <Field label="RUC o DNI destinatario">{p => <TextInput {...p} inputMode="numeric" maxLength={11} value={f.destinatario_doc} onChange={e => set({ destinatario_doc: e.target.value.replace(/\D/g, '') })} />}</Field>
                <div className="gr__s3"><Field label="Destinatario">{p => <TextInput {...p} value={f.destinatario_nombre} onChange={e => set({ destinatario_nombre: e.target.value })} />}</Field></div>
              </div>
            </Seccion></div>

            <div hidden={paso !== 3}><Seccion titulo="Punto de partida y de llegada">
              <div className="gr__g2">
                {(['partida', 'llegada'] as const).map(lado => (
                  <div key={lado} className="gr__lado">
                    {puntosDe(lado).length > 0 && (
                      <Field label="Punto del catálogo" hint={servicio ? `Puntos de ${servicio.cliente_nombre}` : 'Elige uno para llenar la dirección y el distrito'}>
                        {p => <Combobox {...p} options={puntosDe(lado).map(x => ({ value: String(x.id), label: `${x.codigo ? `${x.codigo} · ` : ''}${x.nombre}`, description: `${x.cliente_nombre} · ${x.direccion}`, keywords: x.direccion }))} value={null} placeholder="Busca un punto" onChange={v => elegirPunto(lado, v)} />}
                      </Field>
                    )}
                    <Field label={lado === 'partida' ? 'Distrito de partida' : 'Distrito de llegada'} hint={pista(lado)}>
                      {p => <Combobox {...p} options={ubi.opciones} value={f[`${lado}_ubigeo`] || null} loading={ubi.cargando} placeholder="Busca el distrito"
                        onChange={v => { set({ [`${lado}_ubigeo`]: v ?? '' } as Partial<Form>); setAuto(a => ({ ...a, [lado]: false })); }} />}
                    </Field>
                    <Field label={lado === 'partida' ? 'Dirección de partida' : 'Dirección de llegada'}>
                      {p => <TextInput {...p} value={f[`${lado}_direccion`]} title={f[`${lado}_direccion`]} onBlur={() => detectar(lado)} onChange={e => set({ [`${lado}_direccion`]: e.target.value } as Partial<Form>)} />}
                    </Field>
                  </div>
                ))}
              </div>
            </Seccion></div>

            <div hidden={paso !== 4}><Seccion titulo="Qué se transporta" nota="una línea por producto o bulto · los totales se calculan de las líneas">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lineas.map((l, i) => (
                  <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 240px' }}>{i === 0 && <span className="t-footnote c-secondary">Descripción</span>}<TextInput aria-label="Descripción" value={l.descripcion} placeholder="Ej.: Cajas de pollo congelado" onChange={e => setLinea(i, { descripcion: e.target.value })} /></div>
                    <div style={{ flex: '0 1 100px' }}>{i === 0 && <span className="t-footnote c-secondary">Código</span>}<TextInput aria-label="Código" value={l.codigo} onChange={e => setLinea(i, { codigo: e.target.value })} /></div>
                    <div style={{ flex: '0 1 90px' }}>{i === 0 && <span className="t-footnote c-secondary">Cantidad</span>}<TextInput aria-label="Cantidad" inputMode="decimal" value={l.cantidad} onChange={e => setLinea(i, { cantidad: e.target.value.replace(/[^\d.,]/g, '') })} /></div>
                    <div style={{ flex: '0 1 130px' }}>{i === 0 && <span className="t-footnote c-secondary">Unidad</span>}
                      <SelectInput aria-label="Unidad" value={l.unidad} onChange={e => setLinea(i, { unidad: e.target.value })}>
                        {!UNIDADES.some(([c]) => c === l.unidad) && <option value={l.unidad}>{l.unidad}</option>}
                        {UNIDADES.map(([c, d]) => <option key={c} value={c}>{d} ({c})</option>)}
                      </SelectInput></div>
                    <div style={{ flex: '0 1 90px' }}>{i === 0 && <span className="t-footnote c-secondary">Peso (kg)</span>}<TextInput aria-label="Peso en kilos" inputMode="decimal" value={l.peso} onChange={e => setLinea(i, { peso: e.target.value.replace(/[^\d.,]/g, '') })} /></div>
                    <div style={{ flex: '0 1 90px' }}>{i === 0 && <span className="t-footnote c-secondary">Vol. (m³)</span>}<TextInput aria-label="Volumen en metros cúbicos" inputMode="decimal" value={l.volumen} onChange={e => setLinea(i, { volumen: e.target.value.replace(/[^\d.,]/g, '') })} /></div>
                    <Button variant="plain" size="sm" iconOnly icon={<Trash2 size={15} />} aria-label="Quitar línea" disabled={lineas.length === 1 && !l.descripcion} onClick={() => quitarLinea(i)} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                <Button variant="secondary" size="sm" icon={<Plus size={15} />} onClick={agregarLinea}>Agregar línea</Button>
                <span className="t-footnote c-secondary">Cantidad <strong>{totales.cantidad.toLocaleString('es-PE', { maximumFractionDigits: 3 })}</strong> · Peso <strong>{totales.peso.toLocaleString('es-PE', { maximumFractionDigits: 3 })}</strong> kg · Volumen <strong>{totales.volumen.toLocaleString('es-PE', { maximumFractionDigits: 3 })}</strong> m³</span>
              </div>
              {totales.peso > 0 && Math.abs(totales.peso - num(f.peso)) > 0.001 && (
                <p className="os-nota">Las líneas suman {totales.peso.toLocaleString('es-PE', { maximumFractionDigits: 3 })} kg y el peso bruto de la guía dice {num(f.peso) ? `${num(f.peso).toLocaleString('es-PE')} kg` : 'vacío'}. <button type="button" onClick={() => set({ peso: String(Math.round(totales.peso * 1000) / 1000) })} style={{ all: 'unset', cursor: 'pointer', color: 'var(--blue-ink, #0a63c9)', fontWeight: 600 }}>Usar la suma de las líneas</button></p>
              )}
            </Seccion></div>

            <div hidden={paso !== 4}><Seccion titulo="Carga y transporte" nota="el transporte solo si la guía lo trae">
              <div className="gr__g4">
                <Field label="Peso bruto (kg) *" error={ver('peso')}>
                  {p => <TextInput {...p} inputMode="decimal" value={f.peso} placeholder="0" onBlur={() => tocar('peso')} onChange={e => set({ peso: e.target.value.replace(/[^\d.,]/g, '') })} />}
                </Field>
                <Field label="Bultos">{p => <TextInput {...p} inputMode="numeric" value={f.bultos} onChange={e => set({ bultos: e.target.value.replace(/\D/g, '') })} />}</Field>
                <div className="gr__s2"><Field label="Descripción general">{p => <TextInput {...p} value={f.descripcion} onChange={e => set({ descripcion: e.target.value })} />}</Field></div>
                <Field label={f.tipo === 'TRANSPORTISTA' ? 'RUC transportista *' : 'RUC transportista'} error={f.tipo === 'TRANSPORTISTA' ? ver('emisor') : null}>
                  {p => <TextInput {...p} inputMode="numeric" maxLength={11} value={f.transportista_ruc} onBlur={() => tocar('emisor')} onChange={e => set({ transportista_ruc: e.target.value.replace(/\D/g, '') })} />}
                </Field>
                <div className="gr__s3"><Field label="Transportista">{p => <TextInput {...p} value={f.transportista_nombre} onChange={e => set({ transportista_nombre: e.target.value })} />}</Field></div>
                <Field label="Placa">{p => <TextInput {...p} value={f.placa} style={{ textTransform: 'uppercase' }} onChange={e => set({ placa: e.target.value })} />}</Field>
                <div className="gr__s2"><Field label="Conductor">{p => <TextInput {...p} value={f.conductor_nombre} onChange={e => set({ conductor_nombre: e.target.value })} />}</Field></div>
                <Field label="Licencia">{p => <TextInput {...p} value={f.licencia} onChange={e => set({ licencia: e.target.value })} />}</Field>
              </div>
              <Field label="Observaciones de la guía">{p => <TextInput {...p} value={f.observaciones} title={f.observaciones} onChange={e => set({ observaciones: e.target.value })} />}</Field>
            </Seccion></div>
          </>
        )}
      </div>
    </Sheet>
  );
}
