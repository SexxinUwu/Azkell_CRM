// Formulario del acta de entrega de vehículos (crear, editar, ver). Portado de modulos/flota/entrega-vehiculos/logica.js
// (evAbrirNuevoFormulario, evCargarRegistroEnFormulario, evOnPlacaInput, evObtenerKmGps, evGuardarFormulario).
import './ce-formulario.css';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCheck, ChevronDown, CircleAlert, FileText, ListChecks, NotebookPen, PenLine, Search, Truck } from 'lucide-react';
import { Button, Spinner } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { dayKey, formatFechaPe } from '../../core/lib/format';
import { descargarArchivo } from '../../core/lib/pdf';
import { CeCroquis, type CroquisValor } from './ce-croquis';
import { FirmaPad, type FirmaHandle } from './ce-firmas';
import { generarPdfEntrega, nombrePdfEntrega } from './ce-pdf';
import { PLANTILLA_FABRICA, cargarPlantilla, claveItem, leerPartes } from './ce-plantilla';
import type { CategoriaPlantilla, EntregaVehiculo } from './ce-tipos';

type Calificacion = 'B' | 'R' | 'M';
type EstiloCabina = 'chata' | 'trompa';
type EstiloCarroceria = 'furgon' | 'plataforma';
type OrigenKm = 'gps' | 'registro';

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
  onCerrar: () => void;
  onGuardado: (r: EntregaVehiculo) => void;
}

const CAMPOS_VACIOS: Campos = {
  numero_inventario: '', fecha: '', quien_entrega: '', quien_recibe: '', placa: '', kilometraje: '', clase: '',
  marca: '', modelo: '', color: '', numero_motor: '', numero_serie: '', observaciones: '',
};

const ESTADOS: Array<{ valor: Calificacion; titulo: string }> = [
  { valor: 'B', titulo: 'Bueno' },
  { valor: 'R', titulo: 'Regular' },
  { valor: 'M', titulo: 'Malo' },
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

export function CeFormulario({ registro, empresa, modo, onCerrar, onGuardado }: CeFormularioProps) {
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
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [cargado, setCargado] = useState(nuevo);
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
    if (!r || cargado) return;
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
    setPartes(normalizarPartes(leerPartes(r.inventario_partes_json)));
    setCroquis({
      configuracion: configuracionDeVehiculo(r),
      estiloCabina: r.estilo_cabina === 'trompa' ? 'trompa' : 'chata',
      estiloCarroceria: r.estilo_carroceria === 'plataforma' ? 'plataforma' : 'furgon',
    });
    setFirmasGuardadas({ entrega: r.firma_entrega || null, recibe: r.firma_recibe || null });
    setCargado(true);
  }, [detalle.data, cargado]);

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
  // Igual que el clásico: un toque en el estado ya marcado lo quita; "todo bueno" solo marca B
  function fijarEstado(clave: string, valor: Calificacion) {
    setPartes(p => {
      const n = { ...p };
      if (n[clave] === valor) delete n[clave];
      else n[clave] = valor;
      return n;
    });
    haptic('selection');
  }

  function marcarTodoBueno() {
    setPartes(p => {
      const n = { ...p };
      grupos.forEach(g => g.items.forEach(it => { n[claveItem(it)] = 'B'; }));
      return n;
    });
    haptic('success');
  }

  const q = sinTildes(buscar.trim());
  const todasLasClaves = new Set(grupos.flatMap(g => g.items.map(claveItem)));
  const calificados = [...todasLasClaves].filter(k => partes[k]).length;
  const filas = grupos
    .map((g, idx) => ({ g, idx, items: q ? g.items.filter(it => sinTildes(it).includes(q)) : g.items }))
    .filter(f => !q || f.items.length > 0);

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
      const blob = await generarPdfEntrega(r);
      descargarArchivo(blob, nombrePdfEntrega(r));
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
      inventario_partes_json: partes,
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
    : `${soloLectura ? 'Detalle de entrega' : 'Editar entrega'}: ${campos.numero_inventario || idRegistro || ''}`;
  const subtitulo = !nuevo && cargado
    ? `Placa ${campos.placa || '—'} • Conductor ${campos.quien_recibe || '—'}`
    : 'Formato: inventario físico estado de vehículo';

  const cabecera = (
    <div className="ce-f__cabecera">
      <div className="ce-f__cabecera-izq">
        <Button variant="plain" size="sm" icon={<ArrowLeft size={18} />} onClick={onCerrar}>Volver a la lista</Button>
        <div>
          <h2 className="ce-f__titulo-pagina">{titulo}</h2>
          <p className="ce-f__subtitulo">{subtitulo}</p>
        </div>
      </div>
    </div>
  );

  if (!nuevo && !cargado) {
    return (
      <div className="ce-f">
        {cabecera}
        {detalle.isError
          ? <Notice tone="error" icon={<CircleAlert size={16} />}>{errorMessage(detalle.error)}</Notice>
          : <div style={{ display: 'grid', placeItems: 'center', minHeight: '30vh' }}><Spinner large label="Cargando acta" /></div>}
      </div>
    );
  }

  return (
    <div className="ce-f">
      {cabecera}
      {errorGeneral && <Notice tone="error" icon={<CircleAlert size={16} />}>{errorGeneral}</Notice>}

      <datalist id="ce-dl-placas">{placasOpciones.map(p => <option key={p} value={p} />)}</datalist>
      <datalist id="ce-dl-conductores">{conductores.map(c => <option key={c} value={c} />)}</datalist>

      {/* Datos del acta */}
      <section className="ce-f__tarjeta" aria-labelledby="ce-sec-datos">
        <div className="ce-f__seccion">
          <div className="ce-f__seccion-titulo">
            <span className="ce-f__icono ce-f__icono--azul"><FileText size={16} aria-hidden /></span>
            <h3 id="ce-sec-datos">Datos del acta</h3>
          </div>
        </div>
        <div className="form-grid">
          {campo('numero_inventario', 'N° de inventario', { solo: true, mono: true, placeholder: 'Calculando…', hint: nuevo ? 'Correlativo sugerido' : undefined })}
          <Field label="Fecha del acta">
            {p => soloLectura
              ? <TextInput {...p} readOnly value={formatFechaPe(campos.fecha)} />
              : <TextInput {...p} type="date" value={campos.fecha} onChange={e => cambiar('fecha', e.target.value)} />}
          </Field>
          <Field label="Motivo" wide>
            {p => <TextInput {...p} readOnly value={MOTIVO} />}
          </Field>
          {campo('quien_entrega', 'Quien entrega', { solo: true, hint: 'Usuario que realiza la entrega' })}
          {campo('quien_recibe', 'Quien recibe (conductor)', { mayus: true, list: 'ce-dl-conductores', placeholder: 'Escribe o elige un conductor', hint: 'Se puede elegir de la lista o escribir' })}
        </div>
      </section>

      {/* Ficha técnica */}
      <section className="ce-f__tarjeta" aria-labelledby="ce-sec-ficha">
        <div className="ce-f__seccion">
          <div className="ce-f__seccion-titulo">
            <span className="ce-f__icono ce-f__icono--verde"><Truck size={16} aria-hidden /></span>
            <h3 id="ce-sec-ficha">Ficha técnica del vehículo</h3>
          </div>
        </div>
        <div className="form-grid">
          <Field
            label="Placa principal (tracto)"
            error={errores.placa}
            hint={nuevo ? 'Al escribirla se completan los datos y el kilometraje GPS' : (!soloLectura ? 'La placa no cambia al editar el acta' : undefined)}
          >
            {p => (
              <TextInput
                {...p}
                className="ce-f__mayus"
                list="ce-dl-placas"
                autoComplete="off"
                placeholder="Ej. AEZ984"
                readOnly={!nuevo}
                value={campos.placa}
                onChange={e => cambiarPlaca(e.target.value)}
                onBlur={e => { window.clearTimeout(timerPlaca.current); void consultarPlaca(e.target.value); }}
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

      {/* Inventario de partes y accesorios */}
      <section className="ce-f__tarjeta" aria-labelledby="ce-sec-inventario">
        <div className="ce-f__seccion">
          <div className="ce-f__seccion-titulo">
            <span className="ce-f__icono ce-f__icono--ambar"><ListChecks size={16} aria-hidden /></span>
            <div>
              <h3 id="ce-sec-inventario">Inventario de partes y accesorios</h3>
              <p className="ce-f__seccion-ayuda">Califica cada componente: B bueno, R regular, M malo.</p>
            </div>
          </div>
          {!soloLectura && (
            <Button variant="secondary" size="sm" icon={<CheckCheck size={16} />} onClick={marcarTodoBueno}>Todo en Buen Estado (B)</Button>
          )}
        </div>

        <div className="ce-f__buscar">
          <Search size={16} aria-hidden />
          <TextInput
            type="search"
            placeholder="Buscar componente (ej. batería, espejo, extintor)"
            aria-label="Buscar componente"
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
          />
        </div>
        <div className="ce-f__resumen" aria-live="polite">{calificados} de {todasLasClaves.size} calificados</div>

        {filas.length === 0 ? (
          <EmptyState icon={<Search size={20} />} title="Ningún componente coincide">Prueba con otra palabra.</EmptyState>
        ) : (
          <div>
            {filas.map(({ g, idx, items }) => {
              const abierto = q ? true : (abiertos[g.id] ?? idx === 0);
              const marcadosGrupo = g.items.filter(it => partes[claveItem(it)]).length;
              return (
                <div key={g.id} className="ce-sis">
                  <button
                    type="button"
                    className="ce-sis__cab"
                    aria-expanded={abierto}
                    aria-controls={`ce-sis-${g.id}`}
                    disabled={!!q}
                    onClick={() => setAbiertos(a => ({ ...a, [g.id]: !abierto }))}
                  >
                    <span className="ce-sis__nombre">{g.titulo}</span>
                    <span className="ce-sis__meta">
                      {marcadosGrupo > 0 && <span className="ce-sis__badge">{marcadosGrupo}/{g.items.length} calificados</span>}
                      <span className="ce-sis__conteo">{g.items.length} ítems</span>
                      <ChevronDown size={18} aria-hidden className={`ce-sis__flecha${abierto ? ' ce-sis__flecha--abierta' : ''}`} />
                    </span>
                  </button>

                  {abierto && (
                    <div id={`ce-sis-${g.id}`} className="ce-sis__cuerpo">
                      {items.map(it => {
                        const k = claveItem(it);
                        const estado = partes[k];
                        return (
                          <div key={it} className="ce-item">
                            <span className="ce-item__nombre">{it}</span>
                            <div className="ce-item__controles">
                              <label className="ce-item__cant">
                                <span>Cant.</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={cantidades[k] ?? '1'}
                                  disabled={soloLectura}
                                  onChange={e => setCantidades(c => ({ ...c, [k]: e.target.value }))}
                                />
                              </label>
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
                                    {s.valor}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Observaciones y croquis */}
      <section className="ce-f__tarjeta" aria-labelledby="ce-sec-obs">
        <div className="ce-f__seccion">
          <div className="ce-f__seccion-titulo">
            <span className="ce-f__icono ce-f__icono--gris"><NotebookPen size={16} aria-hidden /></span>
            <h3 id="ce-sec-obs">Observaciones y croquis</h3>
          </div>
        </div>
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

      {/* Firmas */}
      <section className="ce-f__tarjeta" aria-labelledby="ce-sec-firmas">
        <div className="ce-f__seccion">
          <div className="ce-f__seccion-titulo">
            <span className="ce-f__icono ce-f__icono--azul"><PenLine size={16} aria-hidden /></span>
            <h3 id="ce-sec-firmas">Firmas</h3>
          </div>
        </div>
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
    </div>
  );
}
