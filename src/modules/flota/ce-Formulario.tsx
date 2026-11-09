// Formulario del acta de entrega de vehículos (crear, editar, ver). Portado de modulos/flota/entrega-vehiculos/logica.js
// (evAbrirNuevoFormulario, evCargarRegistroEnFormulario, evOnPlacaInput, evObtenerKmGps, evGuardarFormulario).
import './ce-formulario.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Camera, CheckCheck, ChevronDown, CircleAlert, FileText, ListChecks, Minus, NotebookPen, PenLine, Plus, Search, Trash2, Truck } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { CargaCamion } from '../../core/ui/CargaCamion';
import { EmptyState, Notice } from '../../core/ui/Display';
import { EvidenciasArchivos } from '../../core/ui/EvidenciasArchivos';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { VisorFotos } from '../../core/ui/VisorFotos';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { dayKey, formatFechaPe } from '../../core/lib/format';
import { CeCroquis, type CroquisValor } from './ce-croquis';
import { FirmaPad, type FirmaHandle } from './ce-firmas';
import { abrirPdfEntrega } from './ce-pdf';
import { PLANTILLA_FABRICA, cargarPlantilla, claveItem, leerPartes } from './ce-plantilla';
import type { CategoriaPlantilla, EntregaVehiculo, EvidenciaActa } from './ce-tipos';

type Calificacion = 'B' | 'R' | 'M';
type EstiloCabina = 'chata' | 'trompa';
type EstiloCarroceria = 'furgon' | 'plataforma';
type OrigenKm = 'gps' | 'registro';
type FiltroInventario = 'todas' | 'pendientes' | 'novedades';

interface Campos {
  numero_inventario: string;
  fecha: string;
  quien_entrega: string;
  quien_recibe: string;
  placa: string;
  kilometraje: string;
  clase: string;
  marca: string;
  modelo: string;
  color: string;
  numero_motor: string;
  numero_serie: string;
  observaciones: string;
}
type CampoNombre = keyof Campos;

interface Croquis {
  configuracion: string;
  estiloCabina: EstiloCabina;
  estiloCarroceria: EstiloCarroceria;
}

export interface CeFormularioProps {
  registro: EntregaVehiculo | null;
  empresa: string;
  modo: 'nuevo' | 'editar' | 'ver';
  /** Dentro de una ventana: la ventana ya trae el título y el cierre */
  hoja?: boolean;
  onCerrar: () => void;
  onGuardado: (r: EntregaVehiculo) => void;
}

const CAMPOS_VACIOS: Campos = {
  numero_inventario: '', fecha: '', quien_entrega: '', quien_recibe: '', placa: '', kilometraje: '', clase: '',
  marca: '', modelo: '', color: '', numero_motor: '', numero_serie: '', observaciones: '',
};

const ESTADOS: Array<{ valor: Calificacion; texto: string; titulo: string }> = [
  { valor: 'B', texto: 'OK', titulo: 'Bueno' },
  { valor: 'R', texto: 'REG', titulo: 'Regular' },
  { valor: 'M', texto: 'MAL', titulo: 'Malo' },
];

const MOTIVO = 'ENTREGA DE UNIDAD';

interface DatosPlaca {
  tipo?: string | null;
  clase?: string | null;
  marca?: string | null;
  modelo?: string | null;
  color?: string | null;
  numero_motor?: string | null;
  numero_serie?: string | null;
  configuracion?: string | null;
  kilometraje?: number | string | null;
}

interface FilaWialon {
  placa?: string | null;
  nombre_wialon?: string | null;
  km?: number | string | null;
}

const limpiaPlaca = (s: string | null | undefined) => String(s ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Clave de una parte dentro de su categoría. Antes la clave era solo el nombre ("Emblemas"), así que las partes con el mismo
 * nombre en categorías distintas (Emblemas, Direccionales, Vidrios laterales…) compartían la marca: calificar una calificaba las otras.
 */
const claveParte = (g: CategoriaPlantilla, item: string) => `${g.id}|${item}`;

/** Odómetro GPS de Wialon para una placa (null si no hay dato). Igual que evObtenerKmGps del clásico. */
async function kmDesdeGps(placa: string): Promise<number | null> {
  const buscada = limpiaPlaca(placa);
  if (buscada.length < 3) return null;
  try {
    const r = await api<{ data?: FilaWialon[] }>('/script/obtenerDatosWialon', { method: 'POST', body: { args: [] } });
    const lista = Array.isArray(r?.data) ? r.data : [];
    const fila = lista.find(w => {
      const wp = limpiaPlaca(w.placa);
      const wn = limpiaPlaca(w.nombre_wialon);
      return (!!wp && (wp === buscada || wp.includes(buscada) || buscada.includes(wp)))
        || (!!wn && (wn === buscada || wn.includes(buscada) || buscada.includes(wn)));
    });
    const km = Number(fila?.km);
    return fila && km > 0 ? Math.round(km) : null;
  } catch {
    return null;
  }
}

/** Código de configuración del croquis según modelo, tipo y configuración (igual que _evObtenerConfiguracion del clásico) */
function configuracionDeVehiculo(r: { configuracion?: unknown; modelo?: unknown; tipo?: unknown; clase?: unknown }): string {
  const cfg = String(r.configuracion ?? '').toUpperCase().trim();
  const mod = String(r.modelo ?? '').toUpperCase().trim();
  const tip = String(r.tipo || r.clase || '').toUpperCase().trim();
  const todo = `${cfg} ${mod} ${tip}`;

  if (cfg === 'T2' || cfg === '4X2' || cfg.includes('T2') || cfg.includes('4X2') || todo.includes('4X2') || todo.includes('T2') || mod.includes('4X2') || mod.includes('T2')) return 'T2';
  if (cfg === 'T3' || cfg === '6X4' || cfg === '6X2' || cfg.includes('T3') || cfg.includes('6X4') || cfg.includes('6X2') || todo.includes('6X4') || todo.includes('6X2') || todo.includes('T3')) return 'T3';
  if (cfg.includes('C3') || todo.includes('C3') || todo.includes('VOLQUETE')) return 'C3';
  if (cfg.includes('C2') || todo.includes('C2') || todo.includes('RIGIDO')) return 'C2';
  if (cfg.includes('S3') || cfg.includes('SE3') || todo.includes('S3') || todo.includes('3 EJES')) return 'S3';
  if (cfg.includes('S2') || cfg.includes('SE2') || todo.includes('S2') || todo.includes('2 EJES')) return 'S2';
  if (cfg.includes('R2') || todo.includes('R2') || todo.includes('REMOLQUE') || todo.includes('CARRETA')) return 'R2';
  return 'T3';
}

/** Deja solo los estados válidos (B, R, M). Acepta texto o { estado } por ítem. */
function normalizarPartes(raw: Record<string, unknown>): Record<string, Calificacion> {
  const out: Record<string, Calificacion> = {};
  for (const [k, v] of Object.entries(raw)) {
    const crudo = typeof v === 'string' ? v : (v && typeof v === 'object' ? (v as { estado?: unknown }).estado : undefined);
    const letra = typeof crudo === 'string' ? crudo.toUpperCase().trim() : '';
    if (letra === 'B' || letra === 'R' || letra === 'M') out[k] = letra;
  }
  return out;
}

export function CeFormulario({ registro, empresa, modo, hoja, onCerrar, onGuardado }: CeFormularioProps) {
  const toast = useToast();
  const { user } = useAuth();
  const nuevo = modo === 'nuevo';
  const soloLectura = modo === 'ver';
  const idRegistro = registro ? String(registro.id) : null;
  const nombreUsuario = (user?.name ?? '').trim().toUpperCase();

  const [campos, setCampos] = useState<Campos>(() => ({
    ...CAMPOS_VACIOS,
    fecha: nuevo ? dayKey(new Date()) : '',
    quien_entrega: nuevo ? nombreUsuario : '',
  }));
  // Estado de cada parte por su clave "categoría|parte"; lo que no aparece aquí está sin calificar
  const [partes, setPartes] = useState<Record<string, Calificacion>>({});
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [croquis, setCroquis] = useState<Croquis>({ configuracion: 'T3', estiloCabina: 'chata', estiloCarroceria: 'furgon' });
  const [origenKm, setOrigenKm] = useState<OrigenKm | null>(null);
  const [firmasGuardadas, setFirmasGuardadas] = useState<{ entrega: string | null; recibe: string | null }>({ entrega: null, recibe: null });
  const [errores, setErrores] = useState<Partial<Record<CampoNombre, string>>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState<FiltroInventario>('todas');
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [confirmarTodo, setConfirmarTodo] = useState(false);
  const [cargado, setCargado] = useState(nuevo);
  // Evidencias: las nuevas (archivos por subir) y las que el acta ya tiene guardadas
  const [fotosNuevas, setFotosNuevas] = useState<File[]>([]);
  const [fotosGuardadas, setFotosGuardadas] = useState<EvidenciaActa[]>([]);
  const [visor, setVisor] = useState<number | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);
  const firmaEntrega = useRef<FirmaHandle>(null);
  const firmaRecibe = useRef<FirmaHandle>(null);
  const timerPlaca = useRef<number | undefined>(undefined);
  const turnoPlaca = useRef(0);

  // ── Datos de apoyo ───────────────────────────────────────────────────
  const recursos = useQuery({
    queryKey: ['entrega-vehiculos', 'recursos'],
    queryFn: () => api<{ placas?: string[]; conductores?: string[] }>('/seguridad/recursos'),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const plantilla = useQuery({
    queryKey: ['entrega-vehiculos', 'plantilla'],
    queryFn: cargarPlantilla,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
  const folio = useQuery({
    queryKey: ['entrega-vehiculos', 'next-folio'],
    queryFn: () => api<{ ok?: boolean; folio?: string }>('/seguridad/entrega-vehiculos/next-folio'),
    enabled: nuevo,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const detalle = useQuery({
    queryKey: ['entrega-vehiculos', 'detalle', idRegistro],
    enabled: !nuevo && !!idRegistro,
    gcTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<EntregaVehiculo> => {
      const r = await api<{ ok?: boolean; data?: EntregaVehiculo; error?: string }>(`/seguridad/entrega-vehiculos/${encodeURIComponent(idRegistro ?? '')}`);
      if (!r.data) throw new Error(r.error || 'No se encontró el acta');
      return r.data;
    },
  });

  const grupos: CategoriaPlantilla[] = plantilla.data ?? PLANTILLA_FABRICA;
  const placasOpciones = recursos.data?.placas ?? [];
  const conductores = recursos.data?.conductores ?? [];
  // La plantilla vigente tiene que estar lista antes de cargar las partes de un acta (si no, se leerían con la de fábrica)
  const plantillaLista = plantilla.isSuccess || plantilla.isError;

  // Nuevo: correlativo sugerido (si el servidor no responde, el mismo respaldo del clásico)
  useEffect(() => {
    if (!nuevo) return;
    const f = folio.data?.folio ?? (folio.isError ? `ENT-${new Date().getFullYear()}-0001` : '');
    if (!f) return;
    setCampos(c => (c.numero_inventario ? c : { ...c, numero_inventario: f }));
  }, [nuevo, folio.data, folio.isError]);

  // Editar / ver: carga el acta una sola vez (evita que un refetch pise lo que la persona escribe)
  useEffect(() => {
    const r = detalle.data;
    if (!r || cargado || !plantillaLista) return;
    setCampos({
      numero_inventario: r.numero_inventario || String(r.id),
      fecha: r.fecha ? String(r.fecha).slice(0, 10) : '',
      quien_entrega: r.quien_entrega ?? '',
      quien_recibe: r.quien_recibe ?? '',
      placa: r.placa ?? '',
      kilometraje: r.kilometraje ? String(r.kilometraje) : '',
      clase: r.clase || r.tipo || 'TRACTO',
      marca: r.marca ?? '',
      modelo: r.modelo ?? '',
      color: r.color ?? '',
      numero_motor: r.numero_motor ?? '',
      numero_serie: r.numero_serie ?? '',
      observaciones: r.observaciones ?? '',
    });
    // Las actas guardadas antes usan la clave por nombre: se pasan a la clave por categoría
    const crudo = leerPartes(r.inventario_partes_json);
    const estados = normalizarPartes(crudo);
    const porParte: Record<string, Calificacion> = {};
    const cants: Record<string, string> = {};
    for (const g of grupos) {
      for (const it of g.items) {
        const k = claveParte(g, it) in estados ? claveParte(g, it) : claveItem(it);
        const est = estados[k];
        if (!est) continue;
        porParte[claveParte(g, it)] = est;
        const v = crudo[k];
        const c = v && typeof v === 'object' ? Number((v as { cantidad?: unknown }).cantidad) : 1;
        if (c > 1) cants[claveParte(g, it)] = String(c);
      }
    }
    setPartes(porParte);
    setCantidades(cants);
    setCroquis({
      configuracion: configuracionDeVehiculo(r),
      estiloCabina: r.estilo_cabina === 'trompa' ? 'trompa' : 'chata',
      estiloCarroceria: r.estilo_carroceria === 'plataforma' ? 'plataforma' : 'furgon',
    });
    setFirmasGuardadas({ entrega: r.firma_entrega || null, recibe: r.firma_recibe || null });
    setFotosGuardadas(r.evidencias ?? []);
    setCargado(true);
  }, [detalle.data, cargado, plantillaLista, grupos]);

  useEffect(() => () => window.clearTimeout(timerPlaca.current), []);

  // ── Placa: datos de la unidad y kilometraje GPS ─────────────────────
  async function consultarPlaca(valor: string) {
    const placa = valor.trim().toUpperCase();
    if (!nuevo || placa.length < 3) return;
    const turno = ++turnoPlaca.current;
    const kmVacio = !campos.kilometraje || Number(campos.kilometraje) === 0;

    const [km, det] = await Promise.all([
      kmDesdeGps(placa),
      api<{ ok?: boolean; data?: DatosPlaca }>(`/seguridad/entrega-vehiculos/placa-detalle/${encodeURIComponent(placa)}`).catch(() => null),
    ]);
    if (turno !== turnoPlaca.current) return; // llegó otra placa mientras tanto

    const d = det?.ok ? det.data : undefined;
    const kmRegistro = Number(d?.kilometraje) || 0;
    // Prioridad: GPS en vivo; si no hay, el último odómetro de la unidad (solo si el campo está vacío)
    const kmFinal = km ?? (kmVacio && kmRegistro > 0 ? kmRegistro : null);

    setCampos(c => ({
      ...c,
      ...(d ? {
        clase: d.tipo || d.clase || 'TRACTO',
        marca: d.marca ?? '',
        modelo: d.modelo ?? '',
        color: d.color ?? '',
        numero_motor: d.numero_motor ?? '',
        numero_serie: d.numero_serie ?? '',
      } : {}),
      ...(kmFinal !== null ? { kilometraje: String(kmFinal) } : {}),
    }));
    if (kmFinal !== null) setOrigenKm(km !== null ? 'gps' : 'registro');
    if (d) setCroquis(s => ({ ...s, configuracion: configuracionDeVehiculo(d) }));
  }

  function cambiarPlaca(valor: string) {
    const v = valor.toUpperCase();
    setCampos(c => ({ ...c, placa: v }));
    if (errores.placa) setErrores(e => ({ ...e, placa: undefined }));
    window.clearTimeout(timerPlaca.current);
    if (nuevo) timerPlaca.current = window.setTimeout(() => { void consultarPlaca(v); }, 450);
  }

  function cambiar(k: CampoNombre, v: string) {
    setCampos(c => ({ ...c, [k]: v }));
    if (errores[k]) setErrores(e => ({ ...e, [k]: undefined }));
  }

  function cambiarCroquis(c: CroquisValor) {
    setCroquis(s => (s.configuracion === c.configuracion && s.estiloCabina === c.estiloCabina && s.estiloCarroceria === c.estiloCarroceria
      ? s
      : { configuracion: c.configuracion, estiloCabina: c.estiloCabina, estiloCarroceria: c.estiloCarroceria }));
  }

  // ── Inventario de partes ─────────────────────────────────────────────
  // Un toque en el estado ya marcado lo quita (la parte vuelve a "sin calificar")
  function fijarEstado(clave: string, valor: Calificacion) {
    setPartes(p => {
      const n = { ...p };
      if (n[clave] === valor) delete n[clave];
      else n[clave] = valor;
      return n;
    });
    haptic('selection');
  }

  function cambiarCantidad(clave: string, delta: number) {
    setCantidades(c => {
      const actual = Math.max(1, Number(c[clave]) || 1);
      return { ...c, [clave]: String(Math.min(99, Math.max(1, actual + delta))) };
    });
    haptic('selection');
  }

  /** Marca como buenas solo las partes que todavía no se calificaron (nunca pisa un regular o un malo) */
  function marcarPendientesBuenos(lista: CategoriaPlantilla[]) {
    setPartes(p => {
      const n = { ...p };
      lista.forEach(g => g.items.forEach(it => { if (!n[claveParte(g, it)]) n[claveParte(g, it)] = 'B'; }));
      return n;
    });
    haptic('success');
  }

  const totalPartes = useMemo(() => grupos.reduce((s, g) => s + g.items.length, 0), [grupos]);
  const conteo = useMemo(() => {
    let b = 0, r = 0, m = 0;
    grupos.forEach(g => g.items.forEach(it => {
      const e = partes[claveParte(g, it)];
      if (e === 'B') b++; else if (e === 'R') r++; else if (e === 'M') m++;
    }));
    return { b, r, m, calificadas: b + r + m, pendientes: totalPartes - (b + r + m) };
  }, [grupos, partes, totalPartes]);

  const q = sinTildes(buscar.trim());
  const filas = grupos
    .map((g, idx) => ({
      g, idx,
      items: g.items.filter(it => {
        if (q && !sinTildes(it).includes(q)) return false;
        const e = partes[claveParte(g, it)];
        return filtro === 'todas' || (filtro === 'pendientes' && !e) || (filtro === 'novedades' && (e === 'R' || e === 'M'));
      }),
    }))
    .filter(f => f.items.length > 0);

  // ── Evidencias ───────────────────────────────────────────────────────
  async function quitarFoto(f: EvidenciaActa) {
    if (!idRegistro) return;
    setQuitando(f.key);
    try {
      const r = await api<{ evidencias?: EvidenciaActa[] }>(`/seguridad/entrega-vehiculos/${encodeURIComponent(idRegistro)}/evidencias`, { method: 'DELETE', body: { key: f.key } });
      setFotosGuardadas(r.evidencias ?? fotosGuardadas.filter(x => x.key !== f.key));
      haptic('success');
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setQuitando(null);
    }
  }

  // ── Firmas y guardado ────────────────────────────────────────────────
  function validar(): Partial<Record<CampoNombre, string>> {
    const e: Partial<Record<CampoNombre, string>> = {};
    if (!campos.placa.trim()) e.placa = 'Indica la placa principal.';
    if (!campos.quien_entrega.trim()) e.quien_entrega = 'Falta quien entrega.';
    if (!campos.quien_recibe.trim()) e.quien_recibe = 'Indica quien recibe la unidad.';
    return e;
  }

  /** PDF oficial del acta (el clásico lo imprime al guardar). Si falla, el acta ya quedó guardada. */
  async function descargarActa(r: EntregaVehiculo) {
    try {
      await abrirPdfEntrega(r);
    } catch (err) {
      toast(`No se pudo generar el PDF: ${errorMessage(err)}`, 'error');
    }
  }

  async function pdfDelRegistro() {
    const r = detalle.data ?? registro;
    if (!r) return;
    haptic('selection');
    setGenerandoPdf(true);
    try { await descargarActa(r); } finally { setGenerandoPdf(false); }
  }

  /** Lo calificado, con la cantidad cuando no es 1 (si no, basta la letra) */
  function partesParaGuardar(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, est] of Object.entries(partes)) {
      const c = Number(cantidades[k]) || 1;
      out[k] = c > 1 ? { estado: est, cantidad: c } : est;
    }
    return out;
  }

  async function guardar() {
    const e = validar();
    setErrores(e);
    if (Object.keys(e).length) { haptic('warning'); return; }

    setEnviando(true);
    setErrorGeneral(null);
    const entrega = campos.quien_entrega.trim().toUpperCase();
    const recibe = campos.quien_recibe.trim().toUpperCase();
    const payload = {
      numero_inventario: campos.numero_inventario,
      fecha: campos.fecha || dayKey(new Date()),
      motivo: MOTIVO,
      quien_entrega: entrega,
      quien_recibe: recibe,
      clase: campos.clase,
      marca: campos.marca,
      tipo: campos.clase,
      modelo: campos.modelo,
      placa: campos.placa.trim().toUpperCase(),
      color: campos.color,
      cilindros: '6',
      numero_motor: campos.numero_motor,
      numero_serie: campos.numero_serie,
      kilometraje: parseFloat(campos.kilometraje) || 0,
      configuracion: croquis.configuracion,
      estilo_cabina: croquis.estiloCabina,
      estilo_carroceria: croquis.estiloCarroceria,
      inventario_partes_json: partesParaGuardar(),
      observaciones: campos.observaciones,
      doc_entrega: entrega,
      doc_recibe: recibe,
      firma_entrega: firmaEntrega.current?.dataUrl() ?? null,
      firma_recibe: firmaRecibe.current?.dataUrl() ?? null,
      empresa: !empresa || empresa === 'TODAS' ? 'MARSISA' : empresa,
    };

    try {
      const r = await api<{ ok?: boolean; id?: string; error?: string }>(
        nuevo ? '/seguridad/entrega-vehiculos' : `/seguridad/entrega-vehiculos/${encodeURIComponent(idRegistro ?? '')}`,
        { method: nuevo ? 'POST' : 'PUT', body: payload },
      );
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar el acta');
      const idFinal = nuevo ? String(r.id ?? '') : (idRegistro ?? '');

      // Evidencias: el acta ya quedó guardada; si las fotos fallan se avisa sin perder lo demás
      if (fotosNuevas.length > 0 && idFinal) {
        try {
          const f = new FormData();
          fotosNuevas.forEach(a => f.append('fotos', a));
          await api(`/seguridad/entrega-vehiculos/${encodeURIComponent(idFinal)}/evidencias`, { method: 'POST', body: f });
        } catch (errFotos) {
          toast(`El acta se guardó, pero las imágenes no se subieron: ${errorMessage(errFotos)}`, 'error');
        }
      }

      // Se vuelve a leer el acta para entregar el registro completo a la página
      const guardado = await api<{ data?: EntregaVehiculo }>(`/seguridad/entrega-vehiculos/${encodeURIComponent(idFinal)}`)
        .then(x => x.data)
        .catch(() => undefined);
      const registroFinal = guardado ?? ({ ...payload, id: idFinal } as unknown as EntregaVehiculo);
      haptic('success');
      toast(nuevo ? 'Acta de entrega guardada' : 'Acta de entrega actualizada');
      onGuardado(registroFinal);
      // Como el clásico, al guardar sale el PDF del acta
      void descargarActa(registroFinal);
    } catch (err) {
      setErrorGeneral(errorMessage(err));
      haptic('warning');
    } finally {
      setEnviando(false);
    }
  }

  // ── Piezas de formulario ─────────────────────────────────────────────
  const campo = (k: CampoNombre, label: string, o: { solo?: boolean; mayus?: boolean; mono?: boolean; hint?: ReactNode; placeholder?: string; list?: string } = {}) => (
    <Field label={label} error={errores[k]} hint={o.hint}>
      {p => (
        <TextInput
          {...p}
          autoComplete="off"
          list={o.list}
          placeholder={o.placeholder}
          readOnly={o.solo || soloLectura}
          className={[o.mayus && 'ce-f__mayus', o.mono && 'ce-f__mono'].filter(Boolean).join(' ')}
          value={campos[k]}
          onChange={e => cambiar(k, e.target.value)}
        />
      )}
    </Field>
  );

  const kmHint: ReactNode = origenKm === 'gps'
    ? <span className="ce-f__ayuda-gps">Odómetro GPS en vivo (Wialon)</span>
    : origenKm === 'registro'
      ? 'Último odómetro registrado de la unidad (GPS o entrega anterior)'
      : undefined;

  const titulo = nuevo
    ? 'Nueva entrega de vehículo'
    : `${soloLectura ? 'Detalle de entrega' : 'Editar entrega'}`;
  const subtitulo = 'Inventario físico estado de vehículo · F-SEG-004';

  /** Cabecera de una sección: número, icono, título y una línea de ayuda */
  const seccion = (n: number, icono: ReactNode, tono: string, id: string, texto: string, ayuda: string, derecha?: ReactNode) => (
    <div className="ce-f__seccion">
      <div className="ce-f__seccion-titulo">
        <span className={`ce-f__icono ce-f__icono--${tono}`}>{icono}</span>
        <div>
          <h3 id={id}><span className="ce-f__num">{n}</span>{texto}</h3>
          <p className="ce-f__seccion-ayuda">{ayuda}</p>
        </div>
      </div>
      {derecha}
    </div>
  );

  const cabecera = (
    <header className="ce-f__cabecera">
      {hoja ? <p className="ce-f__subtitulo">{subtitulo}</p> : (
        <div className="ce-f__cabecera-izq">
          <Button variant="plain" size="sm" iconOnly icon={<ArrowLeft size={18} />} aria-label="Volver a la lista" onClick={onCerrar} />
          <div>
            <h2 className="ce-f__titulo-pagina">{titulo}</h2>
            <p className="ce-f__subtitulo">{subtitulo}</p>
          </div>
        </div>
      )}
      <div className="ce-f__cabecera-der">
        {campos.placa ? <LicensePlate plate={campos.placa} size="lg" /> : null}
        {campos.numero_inventario && <span className="ce-f__folio">{campos.numero_inventario}</span>}
      </div>
    </header>
  );

  if (!nuevo && !cargado) {
    return (
      <div className={`ce-f${hoja ? ' ce-f--hoja' : ''}`}>
        {cabecera}
        {detalle.isError
          ? <Notice tone="error" icon={<CircleAlert size={16} />}>{errorMessage(detalle.error)}</Notice>
          : <div style={{ display: 'grid', placeItems: 'center', minHeight: '30vh' }}><CargaCamion texto="Cargando acta" /></div>}
      </div>
    );
  }

  const pct = totalPartes ? (conteo.calificadas / totalPartes) * 100 : 0;

  return (
    <div className={`ce-f${hoja ? ' ce-f--hoja' : ''}`}>
      {cabecera}
      {errorGeneral && <Notice tone="error" icon={<CircleAlert size={16} />}>{errorGeneral}</Notice>}

      <datalist id="ce-dl-placas">{placasOpciones.map(p => <option key={p} value={p} />)}</datalist>
      <datalist id="ce-dl-conductores">{conductores.map(c => <option key={c} value={c} />)}</datalist>

      {/* 1 · Datos del acta */}
      <section className="ce-f__tarjeta" aria-labelledby="ce-sec-datos">
        {seccion(1, <FileText size={17} aria-hidden />, 'azul', 'ce-sec-datos', 'Datos del acta', 'Quién entrega, quién recibe y la fecha')}
        <div className="form-grid">
          {campo('numero_inventario', 'N° de inventario', { solo: true, mono: true, placeholder: 'Calculando…', hint: nuevo ? 'Correlativo sugerido' : undefined })}
          <Field label="Fecha del acta">
            {p => soloLectura
              ? <TextInput {...p} readOnly value={formatFechaPe(campos.fecha)} />
              : <TextInput {...p} type="date" value={campos.fecha} onChange={e => cambiar('fecha', e.target.value)} />}
          </Field>
          <Field label="Motivo">
            {p => <TextInput {...p} readOnly value={MOTIVO} />}
          </Field>
          {campo('quien_entrega', 'Quien entrega', { solo: true, hint: 'Usuario que realiza la entrega' })}
          <Field label="Quien recibe (conductor)" error={errores.quien_recibe} hint="Elige de la lista o escribe">
            {p => (
              <Combobox
                id={p.id}
                options={[...conductores, ...(campos.quien_recibe && !conductores.includes(campos.quien_recibe) ? [campos.quien_recibe] : [])].map(c => ({ value: c, label: c }))}
                value={campos.quien_recibe || null}
                onChange={v => cambiar('quien_recibe', v ?? '')}
                onCreate={texto => cambiar('quien_recibe', texto.trim().toUpperCase())}
                createLabel="Usar"
                placeholder="Escribe o elige un conductor"
                disabled={soloLectura}
                aria-invalid={!!errores.quien_recibe}
              />
            )}
          </Field>
        </div>
      </section>

      {/* 2 · Vehículo */}
      <section className="ce-f__tarjeta" aria-labelledby="ce-sec-ficha">
        {seccion(2, <Truck size={17} aria-hidden />, 'verde', 'ce-sec-ficha', 'Vehículo', nuevo ? 'Elige la placa: se completan los datos y el kilometraje GPS' : 'Datos técnicos de la unidad')}
        <div className="form-grid">
          <Field
            label="Placa principal (tracto)"
            error={errores.placa}
            hint={!nuevo && !soloLectura ? 'La placa no cambia al editar el acta' : undefined}
          >
            {p => (
              <PlacaPicker
                id={p.id}
                value={campos.placa}
                onChange={v => cambiarPlaca(v)}
                opciones={placasOpciones.map(placa => ({ placa }))}
                placeholder="Elige la placa…"
                disabled={!nuevo}
                aria-invalid={!!errores.placa}
              />
            )}
          </Field>
          <Field label="Kilometraje (odómetro)" hint={kmHint} error={errores.kilometraje}>
            {p => (
              <TextInput
                {...p}
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                placeholder="0.00"
                className="ce-f__mono"
                readOnly={soloLectura}
                value={campos.kilometraje}
                onChange={e => { cambiar('kilometraje', e.target.value); setOrigenKm(null); }}
              />
            )}
          </Field>
          {campo('clase', 'Clase / tipo', { mayus: true, placeholder: 'TRACTO / REMOLCADOR' })}
          {campo('marca', 'Marca', { mayus: true, placeholder: 'VOLVO / SINOTRUK' })}
          {campo('modelo', 'Modelo', { mayus: true, placeholder: 'FH / SITRAK' })}
          {campo('color', 'Color', { mayus: true, placeholder: 'BLANCO' })}
          {campo('numero_motor', 'Número de motor', { mayus: true, mono: true, placeholder: 'N° de motor' })}
          {campo('numero_serie', 'Número de serie / VIN', { mayus: true, mono: true, placeholder: 'N° VIN o serie' })}
        </div>
      </section>

      {/* 3 · Inventario de partes y accesorios */}
      <section className="ce-f__tarjeta" aria-labelledby="ce-sec-inventario">
        {seccion(3, <ListChecks size={17} aria-hidden />, 'ambar', 'ce-sec-inventario', 'Inventario de partes', 'Califica cada componente: OK, regular o mal. Lo que no revises queda sin calificar',
          !soloLectura && (
            <Button variant="secondary" size="sm" icon={<CheckCheck size={16} />} disabled={conteo.pendientes === 0} onClick={() => setConfirmarTodo(true)}>
              Marcar pendientes como buenos
            </Button>
          ))}

        <div className="ce-inv-resumen" aria-live="polite">
          <div className="ce-inv-resumen__fila">
            <strong>{conteo.calificadas}<span> de {totalPartes} calificadas</span></strong>
            <div className="ce-inv-chips">
              <span className="ce-chip ce-chip--b">{conteo.b} OK</span>
              <span className="ce-chip ce-chip--r">{conteo.r} REG</span>
              <span className="ce-chip ce-chip--m">{conteo.m} MAL</span>
              <span className="ce-chip">{conteo.pendientes} pendientes</span>
            </div>
          </div>
          <div className="ce-inv-barra" role="progressbar" aria-valuemin={0} aria-valuemax={totalPartes} aria-valuenow={conteo.calificadas}>
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="ce-inv-herramientas">
          <div className="ce-f__buscar">
            <Search size={16} aria-hidden />
            <TextInput type="search" placeholder="Buscar componente (batería, espejo, extintor…)" aria-label="Buscar componente" value={buscar} onChange={e => setBuscar(e.target.value)} />
          </div>
          <SegmentedControl<FiltroInventario> label="Qué partes ver" value={filtro} onChange={setFiltro}
            options={[
              { value: 'todas', label: 'Todas' },
              { value: 'pendientes', label: `Pendientes (${conteo.pendientes})` },
              { value: 'novedades', label: `Con novedades (${conteo.r + conteo.m})` },
            ]} />
        </div>

        {filas.length === 0 ? (
          <EmptyState icon={<Search size={20} />} title="Ninguna parte coincide">{filtro === 'pendientes' ? 'No quedan partes por calificar.' : 'Prueba con otra palabra o filtro.'}</EmptyState>
        ) : (
          <div className="ce-cats">
            {filas.map(({ g, idx, items }) => {
              const filtrando = !!q || filtro !== 'todas';
              const abierto = filtrando ? true : (abiertos[g.id] ?? idx === 0);
              const calificadasG = g.items.filter(it => partes[claveParte(g, it)]).length;
              const completa = calificadasG === g.items.length;
              return (
                <div key={g.id} className={`ce-sis${completa ? ' ce-sis--completa' : ''}`}>
                  <button
                    type="button"
                    className="ce-sis__cab"
                    aria-expanded={abierto}
                    aria-controls={`ce-sis-${g.id}`}
                    disabled={filtrando}
                    onClick={() => setAbiertos(a => ({ ...a, [g.id]: !abierto }))}
                  >
                    <span className="ce-sis__nombre">{g.titulo}</span>
                    <span className="ce-sis__meta">
                      <span className={`ce-sis__badge${completa ? ' ce-sis__badge--ok' : ''}`}>{calificadasG}/{g.items.length}</span>
                      <ChevronDown size={18} aria-hidden className={`ce-sis__flecha${abierto ? ' ce-sis__flecha--abierta' : ''}`} />
                    </span>
                  </button>

                  {abierto && (
                    <div id={`ce-sis-${g.id}`} className="ce-sis__cuerpo">
                      {items.map(it => {
                        const k = claveParte(g, it);
                        const estado = partes[k];
                        const cant = Math.max(1, Number(cantidades[k]) || 1);
                        return (
                          <div key={it} className={`ce-item${estado ? '' : ' ce-item--pendiente'}`}>
                            <span className="ce-item__nombre">{it}{!estado && <em>Sin calificar</em>}</span>
                            <div className="ce-item__controles">
                              <div className="ce-cant" role="group" aria-label={`Cantidad de ${it}`}>
                                <button type="button" aria-label="Menos" disabled={soloLectura || cant <= 1} onClick={() => cambiarCantidad(k, -1)}><Minus size={14} /></button>
                                <span>{cant}</span>
                                <button type="button" aria-label="Más" disabled={soloLectura || cant >= 99} onClick={() => cambiarCantidad(k, 1)}><Plus size={14} /></button>
                              </div>
                              <div className="ce-pills" role="group" aria-label={`Estado de ${it}`}>
                                {ESTADOS.map(s => (
                                  <button
                                    key={s.valor}
                                    type="button"
                                    className={`ce-pill ce-pill--${s.valor.toLowerCase()}`}
                                    aria-pressed={estado === s.valor}
                                    title={s.titulo}
                                    disabled={soloLectura}
                                    onClick={() => fijarEstado(k, s.valor)}
                                  >
                                    {s.texto}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {!soloLectura && !filtrando && !completa && (
                        <button type="button" className="ce-sis__todo" onClick={() => marcarPendientesBuenos([g])}>
                          <CheckCheck size={15} /> Marcar los pendientes de esta categoría como buenos
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4 · Evidencias fotográficas */}
      <section className="ce-f__tarjeta" aria-labelledby="ce-sec-fotos">
        {seccion(4, <Camera size={17} aria-hidden />, 'rosa', 'ce-sec-fotos', 'Evidencias fotográficas', 'Todas las fotos que quieras. Sirven de respaldo y no salen en el PDF')}
        {fotosGuardadas.length > 0 && (
          <div className="ce-fotos">
            {fotosGuardadas.map((f, i) => (
              <div key={f.key} className="ce-fotos__item">
                <button type="button" className="ce-fotos__ver" aria-label={`Ver evidencia ${i + 1}`} onClick={() => setVisor(i)}>
                  <img src={f.url} alt={`Evidencia ${i + 1}`} loading="lazy" />
                </button>
                {!soloLectura && (
                  <button type="button" className="ce-fotos__quitar" aria-label={`Quitar evidencia ${i + 1}`} disabled={quitando === f.key} onClick={() => { void quitarFoto(f); }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {!soloLectura && (
          <EvidenciasArchivos archivos={fotosNuevas} onCambio={setFotosNuevas} soloImagenes max={30} titulo={fotosGuardadas.length ? 'Agregar más fotos' : 'Fotos de la unidad'}
            ayuda="Toma fotos con la cámara o elige varias de tu galería" disabled={enviando} />
        )}
        <VisorFotos open={visor !== null} indiceInicial={visor ?? 0} onClose={() => setVisor(null)} titulo={`Evidencias · ${campos.placa}`}
          fotos={fotosGuardadas.map((f, i) => ({ url: f.url, titulo: `Evidencia ${i + 1}` }))} />
      </section>

      {/* 5 · Observaciones y croquis */}
      <section className="ce-f__tarjeta" aria-labelledby="ce-sec-obs">
        {seccion(5, <NotebookPen size={17} aria-hidden />, 'gris', 'ce-sec-obs', 'Observaciones y croquis', 'Novedades generales y configuración del dibujo de la unidad')}
        <Field label="Observaciones generales de la entrega">
          {p => (
            <textarea
              {...p}
              className="input ce-f__textarea"
              rows={3}
              readOnly={soloLectura}
              placeholder="Novedades, estado de espejos, faros, niveles, etc."
              value={campos.observaciones}
              onChange={e => cambiar('observaciones', e.target.value)}
            />
          )}
        </Field>
        <CeCroquis
          configuracion={croquis.configuracion}
          estiloCabina={croquis.estiloCabina}
          estiloCarroceria={croquis.estiloCarroceria}
          editable={!soloLectura}
          onChange={cambiarCroquis}
        />
      </section>

      {/* 6 · Firmas */}
      <section className="ce-f__tarjeta" aria-labelledby="ce-sec-firmas">
        {seccion(6, <PenLine size={17} aria-hidden />, 'azul', 'ce-sec-firmas', 'Firmas', 'Quien entrega y quien recibe firman en pantalla')}
        <div className="ce-firmas">
          <FirmaPad
            ref={firmaEntrega}
            titulo="Entregado por"
            nombre={campos.quien_entrega}
            imagen={firmasGuardadas.entrega}
            editable={!soloLectura}
          />
          <FirmaPad
            ref={firmaRecibe}
            titulo="Recibido por"
            nombre={campos.quien_recibe.toUpperCase() || 'CONDUCTOR / RECEPTOR'}
            imagen={firmasGuardadas.recibe}
            editable={!soloLectura}
          />
        </div>
      </section>

      <div className="ce-f__barra-acciones">
        {!soloLectura && (
          <span className="ce-f__barra-info">{conteo.calificadas}/{totalPartes} partes · {fotosGuardadas.length + fotosNuevas.length} fotos</span>
        )}
        {soloLectura ? (
          <>
            <Button variant="secondary" icon={<FileText size={16} />} loading={generandoPdf} onClick={pdfDelRegistro}>Generar PDF</Button>
            <Button variant="primary" onClick={onCerrar}>Cerrar</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
            <Button variant="primary" onClick={guardar} loading={enviando} disabled={!cargado}>
              {nuevo ? 'Guardar y generar PDF' : 'Actualizar y generar PDF'}
            </Button>
          </>
        )}
      </div>

      <ConfirmSheet
        open={confirmarTodo}
        onClose={() => setConfirmarTodo(false)}
        onConfirm={() => { marcarPendientesBuenos(grupos); setConfirmarTodo(false); }}
        title="Marcar pendientes como buenos"
        message={`${conteo.pendientes} partes sin calificar pasarán a «OK». Hazlo solo si revisaste la unidad completa: el acta dirá que esas partes se entregaron en buen estado. Las que ya marcaste como regular o mal no cambian.`}
        confirmLabel="Marcar como buenos"
      />
    </div>
  );
}
