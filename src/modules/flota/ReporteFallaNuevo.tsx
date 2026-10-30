import './checklist.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, ChevronDown, CircleAlert, Link2, Plus, SearchX, Unlink, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { usePlacas } from '../placas/api';
import { Firma, type FirmaHandle } from '../inspecciones/Firma';
import { useConfigSistemas, useVehiculosFlota, type ReporteFalla, type VehiculoFlota } from './api';
import { DOCS, fechaDDMMAAAA, metaDeVehiculo } from './docsEstado';
import { Combobox } from '../../core/ui/Combobox';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { usePersonalNombres } from '../mantenimiento/OTEditar';
import { leerFallas, textoItem, type FallaGuardada, type SistemaCfg } from './fman';

interface Marca { obs: string }
interface Viaje { id?: number | string; viaje?: string | null; conductor?: string | null; placa_remolque?: string | null; ruta?: string | null; origen?: string | null; destino?: string | null; fecha_viaje_fmt?: string | null }
interface IngresoSeg { conductor?: string | null; placa_carreta?: string | null; procedencia?: string | null; destino?: string | null; zona?: string | null }
interface Backlog { id: number | string; backlog_id?: string | null; tarea?: string | null; tema?: string | null; ticket_ot?: string | null }
type Registro = Record<string, unknown>;

// Sin límite de fotos. Los videos se suben directo a S3 (el archivo no pasa por el servidor): tope por video
const MAX_VIDEO_MB = 150;
const PLACA_VALIDA = /^[A-Z0-9-]{5,8}$/;
const normalizar = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

/** Reduce la foto a 1280 px de lado mayor, JPEG al 80 %: el reporte viaja como JSON. */
async function reducir(file: File): Promise<string> {
  let fuente: ImageBitmap | HTMLImageElement;
  let url: string | null = null;
  if ('createImageBitmap' in window) {
    fuente = await createImageBitmap(file);
  } else {
    url = URL.createObjectURL(file);
    fuente = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url!; });
  }
  try {
    const k = Math.min(1, 1280 / Math.max(fuente.width, fuente.height));
    const c = document.createElement('canvas');
    c.width = Math.round(fuente.width * k); c.height = Math.round(fuente.height * k);
    c.getContext('2d')!.drawImage(fuente, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } finally {
    if (fuente instanceof ImageBitmap) fuente.close();
    if (url) URL.revokeObjectURL(url);
  }
}

/** Falla escrita a mano: a qué unidad pertenece (camión o carreta) */
interface FallaManual { texto: string; unidad: 'tracto' | 'remolque' }

/** Marcas de un reporte guardado. Lo que viene de backlog y lo de otra versión se conserva tal cual. */
function marcasDe(lista: FallaGuardada[], unidad: FallaManual['unidad']) {
  const marcas: Record<string, Marca> = {};
  const conservar: FallaGuardada[] = [];
  const manuales: FallaManual[] = [];
  for (const f of lista) {
    if (f.backlog_id) { conservar.push(f); continue; }
    if (f.sistema === 'MANUAL') { manuales.push({ texto: String(f.obs ?? f.observacion ?? ''), unidad }); continue; }
    const obs = String(f.obs ?? '');
    marcas[`${f.sistema ?? ''}||${f.item ?? ''}`] = { obs: obs === String(f.item ?? '') ? '' : obs };
  }
  return { marcas, conservar, manuales };
}

/** Registro de Wialon de una placa (la lista trae placa, km, horas y ubicación) */
function registroWialon(lista: Registro[] | undefined, placa: string): Registro | undefined {
  const limpia = placa.replace(/[^A-Z0-9]/g, '');
  return lista?.find(x => String(x.placa ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase() === limpia);
}

async function registrosWialon(): Promise<Registro[]> {
  const r = await api<unknown>('/script/obtenerDatosWialon', { method: 'POST', body: { args: [] } });
  const obj = r as { data?: unknown } | null;
  const anidado = (obj?.data as { data?: unknown } | undefined)?.data;
  return (Array.isArray(obj) ? obj : Array.isArray(obj?.data) ? obj?.data : Array.isArray(anidado) ? anidado : []) as Registro[];
}

/** Bloque de documentos de la unidad (SOAT, revisión técnica e inspección), como en el clásico */
// Mismos documentos y estados que el módulo de Documentos de flota (DOCS y metaDeVehiculo)
function DocsUnidad({ titulo, vehiculo }: { titulo: string; vehiculo: VehiculoFlota | undefined }) {
  const meta = vehiculo ? metaDeVehiculo(vehiculo) : null;
  return (
    <div className="ck-bloque">
      <p className="ck-bloque__titulo">{titulo}</p>
      {DOCS.map(d => {
        const item = meta?.docs.find(x => x.config.clave === d.clave);
        const registrado = !!item?.registrado;
        const fecha = fechaDDMMAAAA(vehiculo ? String(vehiculo[d.vencimiento] ?? '') : '');
        return (
          <div key={d.clave} className="ck-doc">
            <span>
              <b>{d.titulo}</b>
              <span style={{ display: 'block', color: 'var(--label-2)', fontSize: '0.75rem' }}>
                {!registrado ? 'No hay datos' : fecha ? `Vence el ${fecha}` : 'Sin fecha de vencimiento'}
              </span>
            </span>
            <span className="ck-doc__estado" style={{ color: registrado && item ? item.estado.color : 'var(--label-3)' }}>
              {registrado && item ? item.estado.texto : 'No hay datos'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Registrar o editar un reporte de fallas, con las mismas secciones que el formulario del clásico.
export function ReporteFallaNuevo({ open, reporte = null, onClose, onHecho }: {
  open: boolean; reporte?: ReporteFalla | null; onClose: () => void; onHecho: () => Promise<unknown>;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const placas = usePlacas();
  const vehiculos = useVehiculosFlota();
  const firma = useRef<FirmaHandle>(null);
  const editando = !!reporte;
  // Un reporte finalizado o anulado no se consulta: no hay nada que completar
  const cerrado = !!reporte && /final|anula/i.test(String(reporte.estado ?? ''));
  const consultar = open && !cerrado;

  const [v, setV] = useState<Record<string, string>>({});
  const [fallasT, setFallasT] = useState<Record<string, Marca>>({});
  const [fallasR, setFallasR] = useState<Record<string, Marca>>({});
  const [conservarT, setConservarT] = useState<FallaGuardada[]>([]);
  const [conservarR, setConservarR] = useState<FallaGuardada[]>([]);
  const [manuales, setManuales] = useState<FallaManual[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [abiertos, setAbiertos] = useState<Record<string, true>>({});
  const [critica, setCritica] = useState(false);
  const [fotos, setFotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const previewsVideo = useMemo(() => videos.map(v => URL.createObjectURL(v)), [videos]);
  useEffect(() => () => previewsVideo.forEach(u => URL.revokeObjectURL(u)), [previewsVideo]);
  const [backlogSel, setBacklogSel] = useState<Record<string, true>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Viaje asociado: sugerencias por placa y búsqueda libre
  const [viajeAbierto, setViajeAbierto] = useState(false);
  const [qViaje, setQViaje] = useState('');
  const [qViajeDeb, setQViajeDeb] = useState('');
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [viajeSel, setViajeSel] = useState('');
  // Conductores que sugiere cada fuente; si difieren se avisa y la persona elige
  const [condViaje, setCondViaje] = useState('');
  const [condSeg, setCondSeg] = useState('');

  const cfg = useConfigSistemas(open);
  const placaT = (v.placa_tracto ?? '').trim().toUpperCase();
  const placaR = (v.placa_remolque ?? '').trim().toUpperCase();

  // Backlog pendiente de la unidad: se importa al reporte marcando lo que aplica
  const backlogs = useQuery<Backlog[]>({
    queryKey: ['flota', 'backlog', placaT], enabled: open && PLACA_VALIDA.test(placaT),
    queryFn: () => api<Backlog[]>(`/taller/ot-backlog?placa=${encodeURIComponent(placaT)}&estado=Pendiente`),
    staleTime: 30_000,
  });

  // Kilometraje y horas desde Wialon (mismo origen que el clásico): solo si el campo sigue vacío
  const wialon = useQuery<Registro[]>({
    queryKey: ['flota', 'wialon-checklist'],
    enabled: consultar && (PLACA_VALIDA.test(placaT) || PLACA_VALIDA.test(placaR)),
    queryFn: registrosWialon, staleTime: 30_000,
  });

  // Búsqueda de viajes con texto (código, placa, conductor o ruta)
  useEffect(() => {
    const t = setTimeout(() => setQViajeDeb(qViaje), 300);
    return () => clearTimeout(t);
  }, [qViaje]);
  const busquedaViajes = useQuery<Viaje[]>({
    queryKey: ['flota', 'viajes-buscar', qViajeDeb],
    enabled: open && viajeAbierto && qViajeDeb.trim().length >= 2,
    queryFn: () => api<{ data?: Viaje[] }>(`/checklist/buscar-viajes?q=${encodeURIComponent(qViajeDeb.trim())}&limit=20`).then(r => r.data ?? []),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    setError(null); setBusqueda(''); setAbiertos({}); setCritica(false); setFotos([]); setVideos([]); setBacklogSel({});
    setViajeAbierto(false); setQViaje(''); setQViajeDeb('');
    firma.current?.limpiar();
    if (reporte) {
      const t = marcasDe(leerFallas(reporte.fallas_tracto_json), 'tracto');
      const r = marcasDe(leerFallas(reporte.fallas_remolque_json), 'remolque');
      setFallasT(t.marcas); setConservarT(t.conservar);
      setFallasR(r.marcas); setConservarR(r.conservar);
      setManuales([...t.manuales, ...r.manuales].filter(m => m.texto));
      setV({
        fecha: String(reporte.fecha_reporte ?? '').slice(0, 10) || hoyLima(),
        placa_tracto: reporte.placa_tracto ?? '', placa_remolque: reporte.placa_remolque ?? '', orden_viaje: reporte.orden_viaje ?? '',
        conductor: reporte.conductor ?? '', km_inicial: reporte.km_inicial != null ? String(reporte.km_inicial) : '',
        horas_motor: reporte.horas_motor != null ? String(reporte.horas_motor) : '',
        procedencia: reporte.procedencia ?? '', ubicacion_gps: reporte.ubicacion_gps ?? '',
      });
    } else {
      setFallasT({}); setFallasR({}); setConservarT([]); setConservarR([]); setManuales([]);
      setV({ fecha: hoyLima(), placa_tracto: '', placa_remolque: '', orden_viaje: '', conductor: '', km_inicial: '', horas_motor: '', procedencia: '', ubicacion_gps: '' });
    }
  }, [open, reporte]);

  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));

  // Al escribir la placa del tracto (reporte nuevo o pendiente en edición): se completa con el último ingreso de seguridad y el último viaje.
  // La orden de viaje manda sobre seguridad en el conductor; lo ya escrito (o guardado) no se pisa.
  useEffect(() => {
    setCondViaje(''); setCondSeg(''); setViajes([]); setViajeSel('');
    if (!consultar || !PLACA_VALIDA.test(placaT)) return;
    let vigente = true;
    const t = setTimeout(async () => {
      const q = encodeURIComponent(placaT);
      const [seg, via] = await Promise.all([
        api<{ data?: IngresoSeg | null }>(`/checklist/ultimo-ingreso-seguridad?placa=${q}`).catch(() => null),
        api<{ data?: Viaje[] }>(`/checklist/buscar-viajes?placa=${q}&limit=3`).catch(() => null),
      ]);
      if (!vigente) return;
      const s = seg?.data ?? null;
      const viaje = via?.data?.[0] ?? null;
      setViajes(via?.data ?? []);
      if (viaje && !editando) setViajeSel(String(viaje.id ?? viaje.viaje ?? ''));
      const cs = (s?.conductor ?? '').trim();
      const cv = (viaje?.conductor ?? '').trim();
      if (!editando) { setCondSeg(cs); setCondViaje(cv); }
      setV(a => {
        const n = { ...a };
        const remolque = (viaje?.placa_remolque || s?.placa_carreta || '').toUpperCase();
        if (!n.placa_remolque && remolque) n.placa_remolque = remolque;
        if (!n.conductor && (cv || cs)) n.conductor = cv || cs;
        if (!n.procedencia) n.procedencia = viaje?.ruta || viaje?.origen || s?.procedencia || s?.destino || s?.zona || '';
        if (!n.orden_viaje && viaje?.viaje) n.orden_viaje = viaje.viaje;
        return n;
      });
    }, 500);
    return () => { vigente = false; clearTimeout(t); };
  }, [consultar, editando, placaT]);

  // Kilometraje del tracto y horas de la carreta, leídos de Wialon cuando la placa es válida
  useEffect(() => {
    if (!consultar || !wialon.data || !PLACA_VALIDA.test(placaT)) return;
    const g = registroWialon(wialon.data, placaT);
    const km = Math.round(Number(g?.km));
    if (!g || !Number.isFinite(km) || km <= 0) return;
    setV(a => (a.placa_tracto ?? '').trim().toUpperCase() !== placaT || a.km_inicial ? a
      : { ...a, km_inicial: String(km), ubicacion_gps: a.ubicacion_gps || String(g.ubicacion ?? '') });
  }, [consultar, placaT, wialon.data]);

  useEffect(() => {
    if (!consultar || !wialon.data || !PLACA_VALIDA.test(placaR)) return;
    const g = registroWialon(wialon.data, placaR);
    const h = Math.round(Number(g?.horas_motor ?? g?.horas_wialon ?? g?.horas));
    if (!g || !Number.isFinite(h) || h <= 0) return;
    setV(a => (a.placa_remolque ?? '').trim().toUpperCase() !== placaR || a.horas_motor ? a : { ...a, horas_motor: String(h) });
  }, [consultar, placaR, wialon.data]);

  // Elegir explícitamente un viaje: sí reemplaza orden, conductor, remolque y procedencia
  function vincular(id: string, lista: Viaje[]) {
    setViajeSel(id);
    const x = lista.find(w => String(w.id ?? w.viaje ?? '') === id);
    if (!x) return;
    setCondViaje((x.conductor ?? '').trim());
    setV(a => ({
      ...a,
      orden_viaje: x.viaje || a.orden_viaje,
      conductor: x.conductor?.trim() || a.conductor,
      placa_remolque: (x.placa_remolque || a.placa_remolque || '').toUpperCase(),
      procedencia: x.ruta || x.origen || a.procedencia,
    }));
    haptic('selection');
  }
  const candidatosViaje = qViajeDeb.trim().length >= 2 ? (busquedaViajes.data ?? []) : viajes;
  const viajeActual = [...viajes, ...(busquedaViajes.data ?? [])].find(w => String(w.id ?? w.viaje ?? '') === viajeSel);

  // Mismo selector de placas que el resto del ERP (PlacaPicker), con las motoras y las carretas
  const opcionesTracto = (placas.data ?? []).filter(p => p.motora).map(p => ({ placa: p.placa, detalle: p.cliente }));
  const opcionesRemolque = (placas.data ?? []).filter(p => !p.motora).map(p => ({ placa: p.placa, detalle: p.cliente }));
  // Mismo listado de personal que los técnicos de la OT (Combobox); si el conductor viene de la orden o de seguridad, también aparece
  const personal = usePersonalNombres();
  const nombresPersonal = personal.data ?? [];
  const opcionesPersonal = [...nombresPersonal, ...(v.conductor && !nombresPersonal.includes(v.conductor) ? [v.conductor] : [])]
    .map(n => ({ value: n, label: n }));
  const vehTracto = useMemo(() => (vehiculos.data ?? []).find(x => normalizar(x.placa).replace(/[^A-Z0-9]/g, '') === placaT.replace(/[^A-Z0-9]/g, '')), [vehiculos.data, placaT]);
  const vehRemolque = useMemo(() => (vehiculos.data ?? []).find(x => normalizar(x.placa).replace(/[^A-Z0-9]/g, '') === placaR.replace(/[^A-Z0-9]/g, '')), [vehiculos.data, placaR]);

  const seleccionados = (backlogs.data ?? []).filter(b => backlogSel[String(b.id)]);
  const manualesLlenos = manuales.map(m => ({ ...m, texto: m.texto.trim() })).filter(m => m.texto);
  const marcadas = Object.keys(fallasT).length + Object.keys(fallasR).length + manualesLlenos.length;
  const total = marcadas + conservarT.length + conservarR.length + seleccionados.length;

  async function agregarFotos(files: FileList | null) {
    if (!files) return;
    const tope = MAX_VIDEO_MB * 1024 * 1024;
    const todos = Array.from(files);
    // Videos: se suben al guardar. Fotos: se reducen en paralelo; un archivo no válido se omite
    const videosNuevos = todos.filter(f => f.type.startsWith('video/'));
    const grandes = videosNuevos.filter(f => f.size > tope);
    if (grandes.length) setError(`Cada video puede pesar hasta ${MAX_VIDEO_MB} MB. Se omitió: ${grandes.map(f => f.name).join(', ')}.`);
    setVideos(a => [...a, ...videosNuevos.filter(f => f.size <= tope)]);
    const imagenes = todos.filter(f => f.type.startsWith('image/'));
    const nuevas = await Promise.all(imagenes.map(f => reducir(f).catch(() => null)));
    setFotos(a => [...a, ...nuevas.filter((x): x is string => x !== null)]);
  }

  // Sube los videos a S3 con URL firmada y devuelve sus direcciones
  async function subirVideos(): Promise<string[]> {
    const urls: string[] = [];
    for (const [i, vid] of videos.entries()) {
      toast(`Subiendo video ${i + 1} de ${videos.length}…`);
      const up = await api<{ uploadUrl: string; finalUrl: string }>('/mantenimiento/checklist/evidencia-upload-url', {
        method: 'POST', body: { fileName: vid.name, fileType: vid.type },
      });
      const put = await fetch(up.uploadUrl, { method: 'PUT', body: vid, headers: { 'Content-Type': vid.type } });
      if (!put.ok) throw new Error(`No se pudo subir el video ${i + 1}.`);
      urls.push(up.finalUrl);
    }
    return urls;
  }

  async function guardar() {
    if (!placaT) { setError('Indica la placa del tracto.'); return; }
    if (!v.conductor?.trim()) { setError('Indica el conductor.'); return; }
    if (total === 0) { setError('Marca al menos una falla, importa un backlog o escribe una falla manual.'); return; }
    if (!placaR && manualesLlenos.some(m => m.unidad === 'remolque')) { setError('Una falla manual es de la carreta, pero no hay placa de carreta. Indícala o cambia la falla a camión.'); return; }
    const ahora = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const armar = (m: Record<string, Marca>) => Object.entries(m).map(([k, x]) => {
      const [sistema, ...resto] = k.split('||');
      return { sistema, item: resto.join('||'), obs: x.obs, observacion: x.obs, estado: 'FALLA', fecha: ahora };
    });
    const importados: FallaGuardada[] = seleccionados.map(b => ({
      sistema: 'MANUAL', item: `Backlog (${b.backlog_id || b.id})`, obs: b.tarea || b.tema || '', observacion: b.tarea || b.tema || '',
      estado: 'FALLA', fecha: ahora, backlog_id: String(b.backlog_id || b.id),
    }));
    const fT: FallaGuardada[] = [...armar(fallasT), ...conservarT, ...importados];
    const fR = [...armar(fallasR), ...conservarR];
    // Cada falla manual va a la lista de la unidad que se eligió (camión o carreta)
    for (const m of manualesLlenos) {
      (m.unidad === 'remolque' ? fR : fT).push({ sistema: 'MANUAL', item: 'Falla manual', obs: m.texto, observacion: m.texto, estado: 'FALLA', fecha: ahora });
    }
    const firmaNueva = firma.current && !firma.current.vacia() ? firma.current.obtener() : null;
    setEnviando(true); setError(null);
    let urlsVideo: string[] = [];
    try { urlsVideo = await subirVideos(); } catch (err) { setError(errorMessage(err)); haptic('warning'); setEnviando(false); return; }
    const cuerpo = {
      orden_viaje: (v.orden_viaje ?? '').trim(), placa_tracto: placaT, placa_remolque: placaR,
      km_inicial: v.km_inicial, km_final: v.km_inicial, horas_motor: v.horas_motor ?? '',
      conductor: v.conductor.trim(), procedencia: v.procedencia, ubicacion_gps: v.ubicacion_gps,
      fallas_tracto: fT, fallas_remolque: fR, fallas_libres_text: '', fotos_base64: [...fotos, ...urlsVideo], firma_conductor: firmaNueva,
    };
    try {
      if (editando) {
        const r = await api<{ ok?: boolean; error?: string }>(`/mantenimiento/checklist/${reporte!.id}`, { method: 'PUT', body: cuerpo });
        if (r.ok === false) throw new Error(r.error || 'No se pudo guardar los cambios');
        haptic('success'); toast(`Reporte ${reporte!.folio} actualizado`);
      } else {
        const r = await api<{ ok?: boolean; error?: string; folio?: string }>('/mantenimiento/checklist', {
          method: 'POST',
          body: { ...cuerpo, falla_critica: critica, creado_por: user?.name ?? 'Sistema' },
        });
        if (r.ok === false) throw new Error(r.error || 'No se pudo guardar el reporte');
        haptic('success'); toast(`Reporte ${r.folio ?? ''} registrado`);
      }
      await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const q = normalizar(busqueda.trim());
  const coincide = (texto: string) => !q || normalizar(texto).includes(q);

  // Sistemas de una unidad con sus ítems; con búsqueda activa solo se ven los que coinciden
  function bloqueFallas(titulo: string, placa: string, sistemas: SistemaCfg[], marcas: Record<string, Marca>,
    setMarcas: (f: (m: Record<string, Marca>) => Record<string, Marca>) => void, prefijo: string, tono: 'tracto' | 'remolque') {
    const visibles = sistemas.map(s => {
      const items = s.items.map(it => textoItem(it)).filter(n => coincide(`${s.title} ${n}`));
      return { s, items };
    }).filter(x => x.items.length > 0);
    return (
      <div className="ck-bloque">
        <div className={`ck-bloque__cabeza ${tono}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-2)', padding: 'var(--s-3)', borderRadius: 'var(--r-md, 10px)', background: tono === 'tracto' ? 'var(--accent-tint, var(--fill))' : 'var(--amber-tint)', color: tono === 'tracto' ? 'var(--accent)' : 'var(--amber-ink)', fontWeight: 700 }}>
          <span>{titulo}</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{placa || '—'}</span>
        </div>
        {visibles.length === 0 && <p className="t-footnote c-secondary">Sin coincidencias para la búsqueda en sistemas de {tono === 'tracto' ? 'Camión' : 'Carreta'}.</p>}
        <div className="tarjeta__lista">
          {visibles.map(({ s, items }) => {
            const idg = `${prefijo}-${s.key}`;
            const abierto = !!q || !!abiertos[idg];
            const cuantas = s.items.filter(it => marcas[`${s.title}||${textoItem(it)}`]).length;
            return (
              <div key={idg}>
                <button type="button" className="dato" style={{ flexDirection: 'row', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, alignItems: 'center' }}
                  aria-expanded={abierto} onClick={() => { haptic('selection'); setAbiertos(a => { const n2 = { ...a }; if (n2[idg]) delete n2[idg]; else n2[idg] = true; return n2; }); }}>
                  <span className="dato__label" style={{ flex: 1, fontWeight: 600 }}>{s.title}</span>
                  {cuantas > 0 && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--red-ink)' }}>{cuantas} con falla</span>}
                  <ChevronDown size={16} style={{ transform: abierto ? 'rotate(180deg)' : undefined, transition: 'transform 160ms ease' }} />
                </button>
                {abierto && items.map(nombreItem => {
                  const k = `${s.title}||${nombreItem}`;
                  const m = marcas[k];
                  return (
                    <div key={k} className="dato" style={{ gap: 'var(--s-1)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', minHeight: 44, fontSize: '0.875rem', cursor: 'pointer' }}>
                        <input type="checkbox" style={{ width: 22, height: 22, flexShrink: 0 }} checked={!!m}
                          onChange={e => { haptic('selection'); setMarcas(a => { const n2 = { ...a }; if (e.target.checked) n2[k] = { obs: '' }; else delete n2[k]; return n2; }); }} />
                        <span style={{ color: m ? 'var(--red-ink)' : undefined, fontWeight: m ? 600 : 400 }}>{nombreItem}</span>
                      </label>
                      {m && <TextInput value={m.obs} placeholder="Describe la falla" aria-label={`Descripción de ${nombreItem}`}
                        onChange={e => setMarcas(a => ({ ...a, [k]: { obs: e.target.value } }))} />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const chipsMarcadas = [
    ...Object.keys(fallasT).map(k => ({ k, txt: k.replace('||', ': '), quitar: () => setFallasT(a => { const n2 = { ...a }; delete n2[k]; return n2; }) })),
    ...Object.keys(fallasR).map(k => ({ k: `R${k}`, txt: `Carreta · ${k.replace('||', ': ')}`, quitar: () => setFallasR(a => { const n2 = { ...a }; delete n2[k]; return n2; }) })),
  ];
  const pendientes = backlogs.data ?? [];

  return (
    <Sheet open={open} ancho onClose={() => !enviando && onClose()} title={editando ? `Editar reporte ${reporte!.folio}` : 'Nuevo Reporte de Fallas'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>{editando ? 'Guardar cambios' : 'Guardar Reporte de Fallas'}{total ? ` (${total})` : ''}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

        {/* 1. Viaje asociado (opcional) */}
        <section className="ck-bloque">
          <button type="button" className="dato" style={{ flexDirection: 'row', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, alignItems: 'center' }}
            aria-expanded={viajeAbierto} onClick={() => setViajeAbierto(a => !a)}>
            <span style={{ flex: 1 }}>
              <span className="dato__label" style={{ fontWeight: 700 }}>Viaje asociado <span style={{ fontWeight: 400, color: 'var(--label-2)' }}>(opcional)</span></span>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--label-2)' }}>Vincula una orden de viaje para completar placas, conductor y procedencia</span>
            </span>
            <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Link2 size={14} /> {viajeAbierto ? 'Cerrar' : 'Vincular viaje'}</span>
          </button>
          {viajeAbierto && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
              <SearchField value={qViaje} onChange={setQViaje} placeholder="Código, placa, conductor o ruta" />
              {candidatosViaje.length > 0 ? (
                <div className="tarjeta__lista">
                  {candidatosViaje.map(w => {
                    const id = String(w.id ?? w.viaje ?? '');
                    const activo = viajeSel === id;
                    return (
                      <button key={id} type="button" className="dato" aria-pressed={activo}
                        style={{ flexDirection: 'row', width: '100%', textAlign: 'left', cursor: 'pointer', background: activo ? 'var(--accent-tint, var(--fill))' : 'transparent', border: 0, alignItems: 'center', gap: 'var(--s-2)' }}
                        onClick={() => vincular(id, candidatosViaje)}>
                        <span className="dato__valor" style={{ flex: 1, fontSize: '0.875rem' }}>
                          <b>{w.viaje}</b>{' · '}{w.ruta || [w.origen, w.destino].filter(Boolean).join(' - ') || 'Sin ruta'}
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--label-2)' }}>{[w.conductor, w.placa_remolque, w.fecha_viaje_fmt].filter(Boolean).join(' · ')}</span>
                        </span>
                        {activo && <Link2 size={16} />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="t-footnote c-secondary">{qViajeDeb.trim().length >= 2 ? 'Sin viajes para esa búsqueda.' : 'Escribe al menos 2 letras, o elige primero la placa del tracto para ver sus últimos viajes.'}</p>
              )}
              {viajeActual && (
                <Notice tone="accent">
                  Vinculado al viaje <b>{viajeActual.viaje}</b>{viajeActual.ruta ? ` · ${viajeActual.ruta}` : ''}
                  <span style={{ display: 'block', marginTop: 'var(--s-2)' }}>
                    <Button variant="secondary" icon={<Unlink size={16} />} onClick={() => { setViajeSel(''); set('orden_viaje', ''); }}>Quitar vinculación</Button>
                  </span>
                </Notice>
              )}
            </div>
          )}
        </section>

        {condViaje && condSeg && condViaje.toUpperCase() !== condSeg.toUpperCase() && (
          <Notice tone="accent">
            La orden de viaje indica <b>{condViaje}</b> y seguridad registra <b>{condSeg}</b> como último ingreso.
            <span style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-2)', flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={() => set('conductor', condViaje)}>Usar el de la orden</Button>
              <Button variant="secondary" onClick={() => set('conductor', condSeg)}>Usar el de seguridad</Button>
            </span>
          </Notice>
        )}

        {/* 2. Datos del reporte */}
        <section className="ck-bloque">
          <p className="ck-bloque__titulo">Datos del reporte</p>
          <div className="form-grid">
            <Field label="Fecha de registro">{p => <TextInput {...p} type="date" readOnly value={v.fecha ?? hoyLima()} />}</Field>
            <Field label="Placa principal (tracto) *">{p => <PlacaPicker {...p} value={v.placa_tracto ?? ''} onChange={pl => set('placa_tracto', pl)} opciones={opcionesTracto} />}</Field>
            <Field label="Placa semirremolque / carreta" hint="Opcional. Si se elige, se genera una OT independiente para esta unidad.">{p => <PlacaPicker {...p} value={v.placa_remolque ?? ''} onChange={pl => set('placa_remolque', pl)} opciones={opcionesRemolque} />}</Field>
            <Field label="Conductor *">{p => <Combobox {...p} options={opcionesPersonal} value={v.conductor || null} onChange={c => set('conductor', c ?? '')} placeholder="Seleccione conductor…" />}</Field>
            <Field label="Procedencia" wide>{p => <TextInput {...p} value={v.procedencia ?? ''} onChange={e => set('procedencia', e.target.value)} />}</Field>
          </div>
          {PLACA_VALIDA.test(placaT) && <DocsUnidad titulo={`Documentos e inspección · Camión (${placaT})`} vehiculo={vehTracto} />}
          {PLACA_VALIDA.test(placaR) && <DocsUnidad titulo={`Documentos e inspección · Carreta (${placaR})`} vehiculo={vehRemolque} />}
        </section>

        {/* 3. GPS / kilometraje / horas de motor */}
        <section className="ck-bloque">
          <p className="ck-bloque__titulo">GPS / kilometraje / horas de motor</p>
          <p className="t-footnote c-secondary">Se intenta leer desde el GPS (Wialon) al elegir la placa. Si no hay dato, completa a mano.</p>
          <div className="form-grid">
            <Field label="Kilometraje (camión)">{p => <TextInput {...p} inputMode="numeric" value={v.km_inicial ?? ''} onChange={e => set('km_inicial', e.target.value.replace(/\D/g, ''))} />}</Field>
            <Field label="Horas de motor (carreta / termoking)">{p => <TextInput {...p} inputMode="numeric" value={v.horas_motor ?? ''} onChange={e => set('horas_motor', e.target.value.replace(/\D/g, ''))} />}</Field>
          </div>
        </section>

        {/* 4. Fallas encontradas */}
        <section className="ck-bloque">
          <p className="ck-bloque__titulo">Fallas encontradas</p>
          <p className="t-footnote c-secondary">Marca solo lo que está fallando: al marcarlo se abre el espacio para describirlo.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 14rem' }}>
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar por sistema o ítem" />
            </div>
            <span className="chip" aria-live="polite">{marcadas} {marcadas === 1 ? 'falla marcada' : 'fallas marcadas'}</span>
          </div>
          {chipsMarcadas.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
              {chipsMarcadas.map(c => (
                <span key={c.k} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {c.txt}
                  <button type="button" aria-label={`Quitar ${c.txt}`} onClick={c.quitar} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', color: 'inherit', display: 'grid', placeItems: 'center' }}><X size={14} /></button>
                </span>
              ))}
            </div>
          )}
          {cfg.isLoading ? <p className="t-footnote c-secondary">Cargando sistemas…</p> : cfg.isError ? <Notice tone="error">No se pudo cargar la configuración de sistemas.</Notice> : (
            <>
              {bloqueFallas('TRACTO (Placa principal)', placaT, cfg.data?.tracto ?? [], fallasT, setFallasT, 'T', 'tracto')}
              {placaR && bloqueFallas('SEMIRREMOLQUE / CARRETA (Placa secundaria)', placaR, cfg.data?.remolque ?? [], fallasR, setFallasR, 'R', 'remolque')}
            </>
          )}
          {q && <span className="t-footnote c-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><SearchX size={14} /> Mostrando solo coincidencias</span>}

          {pendientes.length > 0 && (
            <div className="ck-bloque">
              <p className="ck-bloque__titulo">Backlog pendiente en taller ({pendientes.length})</p>
              <div className="tarjeta__lista">
                {pendientes.map(b => (
                  <label key={String(b.id)} className="dato" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-2)', minHeight: 44, cursor: 'pointer' }}>
                    <input type="checkbox" style={{ width: 22, height: 22, flexShrink: 0 }} checked={!!backlogSel[String(b.id)]}
                      onChange={e => setBacklogSel(a => { const n2 = { ...a }; if (e.target.checked) n2[String(b.id)] = true; else delete n2[String(b.id)]; return n2; })} />
                    <span className="dato__valor" style={{ flex: 1, fontSize: '0.875rem' }}>
                      {b.tarea || b.tema || 'Sin descripción'}
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--label-2)' }}>{b.backlog_id || `Backlog ${b.id}`}{b.ticket_ot ? ` · ${b.ticket_ot}` : ''}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="ck-bloque">
            <p className="ck-bloque__titulo">¿No encuentras el ítem? Agrégalo aquí manualmente</p>
            {manuales.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                <SelectInput value={m.unidad} aria-label={`Unidad de la falla manual ${i + 1}`} style={{ width: 'auto' }}
                  onChange={e => setManuales(a => a.map((x, j) => (j === i ? { ...x, unidad: e.target.value as FallaManual['unidad'] } : x)))}>
                  <option value="tracto">Camión {placaT ? `(${placaT})` : ''}</option>
                  {placaR && <option value="remolque">Carreta ({placaR})</option>}
                </SelectInput>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <TextInput value={m.texto} placeholder="Describe la falla" aria-label={`Falla manual ${i + 1}`}
                    onChange={e => setManuales(a => a.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} />
                </div>
                <Button variant="secondary" iconOnly aria-label="Quitar falla manual" icon={<X size={16} />}
                  onClick={() => setManuales(a => a.filter((_, j) => j !== i))} />
              </div>
            ))}
            <div>
              <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setManuales(a => [...a, { texto: '', unidad: 'tracto' }])}>Agregar otra falla</Button>
            </div>
          </div>
        </section>

        {/* 5. Evidencia fotográfica y firma */}
        <section className="ck-bloque">
          <p className="ck-bloque__titulo">Evidencia fotográfica{editando ? ' · las anteriores se conservan' : ''} ({fotos.length + videos.length})</p>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            {fotos.map((f, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={f} alt={`Foto ${i + 1}`} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10 }} />
                <button type="button" aria-label="Quitar foto" onClick={() => setFotos(a => a.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: -12, right: -12, width: 44, height: 44, border: 0, padding: 0, background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--ink)', color: 'var(--label-inverse)', display: 'grid', placeItems: 'center' }}><X size={12} /></span>
                </button>
              </div>
            ))}
            {videos.map((vid, i) => (
              <div key={`v${i}`} style={{ position: 'relative' }}>
                <video src={previewsVideo[i]} muted preload="metadata" aria-label={`Video ${i + 1}: ${vid.name}`} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10, background: '#000' }} />
                <button type="button" aria-label="Quitar video" onClick={() => setVideos(a => a.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: -12, right: -12, width: 44, height: 44, border: 0, padding: 0, background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--ink)', color: 'var(--label-inverse)', display: 'grid', placeItems: 'center' }}><X size={12} /></span>
                </button>
              </div>
            ))}
            {(
              <label style={{ width: 84, height: 84, borderRadius: 10, background: 'var(--fill)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--label-2)' }}>
                <span style={{ display: 'grid', placeItems: 'center', gap: 2, fontSize: '0.6875rem', fontWeight: 600 }}><Camera size={20} /><Plus size={10} /></span>
                <input type="file" accept="image/*,video/*" multiple hidden onChange={e => { agregarFotos(e.target.files); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </section>

        <section className="ck-bloque">
          <p className="ck-bloque__titulo">Firma digital del conductor{editando && reporte?.firma_conductor ? ' · dibuja una nueva para reemplazarla' : ''}</p>
          <Firma ref={firma} />
        </section>

        {!editando && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-3)', minHeight: 44, padding: 'var(--s-3)', borderRadius: 'var(--r-lg)', cursor: 'pointer', background: critica ? 'var(--red-tint)' : 'var(--fill-subtle)' }}>
            <input type="checkbox" checked={critica} onChange={e => setCritica(e.target.checked)} style={{ width: 22, height: 22, flexShrink: 0, marginTop: 2 }} />
            <span>
              <b style={{ color: critica ? 'var(--red-ink)' : 'var(--label)' }}>Falla crítica</b>
              <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--label-2)' }}>La unidad no puede salir. Pasa a mantenimiento y se abre un ítem en el backlog.</span>
            </span>
          </label>
        )}
        {!editando && <Field label="Estado inicial">{p => <SelectInput {...p} disabled value="Pendiente"><option>Pendiente</option></SelectInput>}</Field>}
      </div>
    </Sheet>
  );
}
