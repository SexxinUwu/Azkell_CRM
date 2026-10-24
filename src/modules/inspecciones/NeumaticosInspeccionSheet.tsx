import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CircleAlert, Cloud, Minus, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { clavePlaca, useInspeccionesNeumaticos } from './api';
import { ChasisEsquemaVisual, CONFIGURACIONES, normalizarConfiguracion, posicionesPorDefecto, type PosicionBajo } from './components/ChasisEsquemaVisual';
import { AlmacenesNeumaticos, type AlmacenesHandle, type LlantaDisponible } from './components/AlmacenesNeumaticos';
import { tonoMm, TINTA_TONO } from '../mantenimiento/neumaticosSemaforo';
import { corregirMarca } from './neumaticosAlias';
import './inspecciones.css';

// Inspección de neumáticos (React). Mismo esquema que el clásico (modal_inspeccion.js):
//   GET  /neumaticos/placa-ultima/:placa  → configuración, posiciones y última inspección
//   GET  /neumaticos/km-gps/:placa?fecha  → odómetro GPS (Wialon) en la fecha de la inspección
//   GET  /neumaticos/catalogos            → marcas, medidas y modelos sugeridos
//   POST /neumaticos/inspecciones         → items con medidas, ROT, estado, acción y fotos (base64; el servidor las sube a S3)
// Diferencia con el clásico: el esquema del chasis es un SVG (ChasisEsquemaVisual) con perspectivas
// 2D, isométrica, lateral y rayos X; las rotaciones son entre dos posiciones con un botón.

const ESTADOS = ['NUEVA', 'BUENA', 'RECAPADA', 'REGULAR', 'MALA', 'CRÍTICA'] as const;
const ACCIONES = ['Inspección', 'Rotación', 'Instalación', 'Cambio', 'Reparación', 'Reencauche', 'Baja'] as const;

interface PosicionUltima {
  marca?: string; medida?: string; modelo?: string;
  r1?: number | string | null; r2?: number | string | null; r3?: number | string | null; r4?: number | string | null;
  presion_actual?: number | string | null;
  codigo?: string | null;
}
interface PlacaUltima {
  ok?: boolean; configuracion?: string; fecha_inspeccion?: string | null; km_vehiculo?: number | string | null;
  inspector?: string | null; datosPosiciones?: Record<string, PosicionUltima>;
}
interface Llanta {
  posicion: string; codigo: string; codigoBase: boolean; marca: string; medida: string; modelo: string;
  r1: string; r2: string; r3: string; r4: string;
  presion_ant: string; presion_actual: string; estado: string; accion: string; observacion: string;
  rot: 'NO' | 'SI'; foto1: string; foto2: string; foto3: string;
}
interface Errores { fecha?: string; km?: string; inspector?: string; llantas?: string }

const MS_DIA = 86_400_000;
const texto = (v: unknown) => (v === null || v === undefined || v === 0 || v === '0' ? '' : String(v));
const numero = (v: string) => Number(String(v).replace(',', '.')) || 0;
const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
/** Fecha dd/mm/aaaa (America/Lima, como en la versión actual) */
export const fechaDMY = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const aFecha = (iso: string) => { const [y, m, dd] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, dd); };
const vacia = (posicion: string): Llanta => ({
  posicion, codigo: '', codigoBase: false, marca: '', medida: '', modelo: '', r1: '', r2: '', r3: '', r4: '', presion_ant: '', presion_actual: '',
  estado: 'BUENA', accion: 'Inspección', observacion: '', rot: 'NO', foto1: '', foto2: '', foto3: '',
});

/** Promedio del remanente (R1 + R2 + R3) / 3, como en el clásico */
function promedio(l: Llanta): number | null {
  const [a, b, c] = [numero(l.r1), numero(l.r2), numero(l.r3)];
  return a || b || c ? (a + b + c) / 3 : null;
}
/** Semáforo único (neumaticosSemaforo): >6 mm verde, 3 a 6 ámbar, <3 rojo */
function tonoRemanente(p: number | null): string {
  return TINTA_TONO[tonoMm(p)];
}

/** Foto de la cámara o del archivo, reducida en el cliente (máx. 1200 px, JPEG 0.8) antes de enviarla */
async function comprimirImagen(file: File, maxLado = 1200, calidad = 0.8): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('imagen no válida'));
      im.src = url;
    });
    const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', calidad);
  } finally { URL.revokeObjectURL(url); }
}

/** Campo numérico con botones − y + de 1 mm */
function Milimetros({ etiqueta, valor, onChange }: { etiqueta: string; valor: string; onChange: (v: string) => void }) {
  const ajustar = (delta: number) => onChange(String(Math.min(24, Math.max(0, numero(valor) + delta))));
  return (
    <div className="insp-neu__mm">
      <span className="insp-neu__mm-etiqueta">{etiqueta}</span>
      <div className="insp-neu__mm-control">
        <button type="button" className="insp-neu__paso pressable" onClick={() => ajustar(-1)} aria-label={`Restar 1 mm a ${etiqueta}`}><Minus size={14} /></button>
        <input className="insp-neu__mm-valor" inputMode="decimal" value={valor} placeholder="0"
          onChange={e => onChange(e.target.value.replace(/[^0-9.,]/g, ''))} aria-label={`${etiqueta} en milímetros`} />
        <button type="button" className="insp-neu__paso pressable" onClick={() => ajustar(1)} aria-label={`Sumar 1 mm a ${etiqueta}`}><Plus size={14} /></button>
      </div>
    </div>
  );
}

/** Una foto de la llanta: cámara en el celular, archivo en el escritorio, con vista previa */
function FotoSlot({ etiqueta, valor, onChange }: { etiqueta: string; valor: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function elegir(file?: File) {
    if (!file) return;
    setProcesando(true); setError(null);
    try { onChange(await comprimirImagen(file)); }
    catch { setError('No se pudo leer la foto.'); }
    finally { setProcesando(false); }
  }
  return (
    <div className="insp-neu__foto">
      <span className="insp-neu__foto-etiqueta">{etiqueta}</span>
      {valor ? (
        <img src={valor} alt={`${etiqueta} de la llanta`} className="insp-neu__foto-img" />
      ) : (
        <button type="button" className="insp-neu__foto-vacio pressable" onClick={() => ref.current?.click()} disabled={procesando}>
          <Camera size={18} aria-hidden /> {procesando ? 'Procesando…' : 'Tomar foto'}
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" capture="environment" className="insp-neu__oculto"
        onChange={e => { void elegir(e.target.files?.[0]); e.target.value = ''; }} />
      {valor && (
        <div className="insp-neu__foto-acciones">
          <button type="button" onClick={() => ref.current?.click()}>Cambiar</button>
          <button type="button" onClick={() => onChange('')} aria-label={`Quitar ${etiqueta}`}><X size={14} /></button>
        </div>
      )}
      {error && <p className="insp-neu__error" role="alert">{error}</p>}
    </div>
  );
}

export function NeumaticosInspeccionSheet({ placa, usuario, onClose }: { placa: string | null; usuario: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const neu = useInspeccionesNeumaticos();
  const ultima = useQuery<PlacaUltima>({
    queryKey: ['neumaticos', 'placa-ultima', placa],
    enabled: !!placa,
    queryFn: () => api<PlacaUltima>(`/neumaticos/placa-ultima/${encodeURIComponent(placa ?? '')}`),
    staleTime: 0,
  });
  const catalogos = useQuery<Record<string, unknown>>({
    queryKey: ['neumaticos', 'catalogos'],
    enabled: !!placa,
    queryFn: () => api<Record<string, unknown>>('/neumaticos/catalogos'),
    staleTime: 10 * 60_000,
  });

  const [fecha, setFecha] = useState(hoyISO());
  const [km, setKm] = useState('');
  const [dias, setDias] = useState(30);
  const [obs, setObs] = useState('');
  const [config, setConfig] = useState('');
  const [llantas, setLlantas] = useState<Llanta[]>([]);
  const [activa, setActiva] = useState('1');
  const [nuevaPos, setNuevaPos] = useState('');
  const [destinoRot, setDestinoRot] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Odómetro GPS de la fecha: si ya llegó, la última inspección no lo pisa (las dos consultas corren en paralelo)
  const kmDesdeGps = useRef(false);

  // Odómetro GPS (Wialon) de la unidad en la fecha de la inspección; se actualiza al cambiar la fecha
  const kmGps = useQuery<{ ok?: boolean; km: number | null; fecha: string | null }>({
    queryKey: ['neumaticos', 'km-gps', placa, fecha],
    enabled: !!placa && !!fecha,
    queryFn: () => api<{ ok?: boolean; km: number | null; fecha: string | null }>(`/neumaticos/km-gps/${encodeURIComponent(placa ?? '')}`, { query: { fecha } }),
    staleTime: 0,
  });

  // Al abrir una placa se reinicia el formulario
  useEffect(() => {
    if (!placa) return;
    setFecha(hoyISO()); setKm(''); setDias(30); setObs(''); setConfig(''); setLlantas([]);
    setActiva('1'); setNuevaPos(''); setDestinoRot(''); setErrores({}); setError(null);
    kmDesdeGps.current = false;
  }, [placa]);

  // Con la última inspección: configuración, kilometraje y posiciones precargadas (se pueden corregir)
  useEffect(() => {
    const u = ultima.data;
    if (!u) return;
    setConfig(normalizarConfiguracion(u.configuracion));
    // Kilometraje: el GPS de la fecha tiene prioridad; si aún no llegó, el de la última inspección
    if (!kmDesdeGps.current) setKm(texto(u.km_vehiculo));
    const lista = Object.entries(u.datosPosiciones ?? {})
      .sort(([a], [b]) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b))
      .map(([clave, d]): Llanta => ({
        // Inspecciones anteriores guardaron el repuesto único como "R": ahora es R1
        ...vacia(clave === 'R' ? 'R1' : clave), codigo: texto(d.codigo), codigoBase: !!texto(d.codigo), marca: texto(d.marca), medida: texto(d.medida), modelo: texto(d.modelo),
        r1: texto(d.r1), r2: texto(d.r2), r3: texto(d.r3), r4: texto(d.r4), presion_ant: texto(d.presion_actual),
      }));
    setLlantas(lista);
    setActiva(lista[0]?.posicion ?? '1');
  }, [ultima.data]);

  // Llega (o cambia con la fecha) la lectura GPS: se precarga el km; sigue editable
  useEffect(() => {
    const g = kmGps.data;
    // Kilometraje actual de GPS; si la unidad no tiene lectura, el campo queda vacío para escribirlo a mano
    if (g) {
      kmDesdeGps.current = true;
      setKm(g.km !== null && g.km !== undefined ? String(g.km) : '');
    }
  }, [kmGps.data]);

  // Al elegir una configuración, aparecen sus posiciones (el chasis y el conteo de llantas se actualizan)
  useEffect(() => {
    if (!config || !CONFIGURACIONES[config]) return;
    const esperadas = posicionesPorDefecto(config);
    setLlantas(ls => {
      const existentes = new Set(ls.map(l => l.posicion));
      const faltan = esperadas.filter(pos => !existentes.has(pos)).map(vacia);
      if (!faltan.length) return ls;
      // Orden de la configuración: ejes y luego repuestos; las posiciones ajenas al esquema van al final
      const orden = new Map(esperadas.map((pos, i) => [pos, i]));
      return [...ls, ...faltan].sort((a, b) => (orden.get(a.posicion) ?? 1e6) - (orden.get(b.posicion) ?? 1e6));
    });
  }, [config]);

  // Última inspección de neumáticos: aviso según los días transcurridos
  const ultimaFecha = ultima.data?.fecha_inspeccion ? aFecha(ultima.data.fecha_inspeccion) : null;
  const hace = useMemo(() => {
    if (!ultimaFecha) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return Math.round((hoy.getTime() - ultimaFecha.getTime()) / MS_DIA);
  }, [ultimaFecha]);
  const inspectorUltimo = ultima.data?.inspector || neu.data?.find(n => placa && clavePlaca(n.placa) === clavePlaca(placa))?.tecnico || '';

  const actual = llantas.find(l => l.posicion === activa) ?? null;
  const set = (pos: string, cambio: Partial<Llanta>) => setLlantas(ls => ls.map(l => (l.posicion === pos ? { ...l, ...cambio } : l)));
  const quitar = (pos: string) => {
    setLlantas(ls => ls.filter(l => l.posicion !== pos));
    if (activa === pos) setActiva(llantas.find(l => l.posicion !== pos)?.posicion ?? '');
  };
  const agregar = () => {
    const pos = nuevaPos.trim().toUpperCase();
    if (!pos) return;
    if (llantas.some(l => l.posicion.toUpperCase() === pos)) { setErrores(e => ({ ...e, llantas: `La posición ${pos} ya está en la lista.` })); return; }
    setLlantas(ls => [...ls, vacia(pos)]);
    setActiva(pos); setNuevaPos(''); setErrores(e => ({ ...e, llantas: undefined }));
  };
  const limpiar = () => { if (actual) set(actual.posicion, { marca: '', medida: '', modelo: '', r1: '', r2: '', r3: '', r4: '', presion_actual: '', estado: 'BUENA', accion: 'Inspección', observacion: '', rot: 'NO', foto1: '', foto2: '', foto3: '' }); };
  const siguiente = () => {
    const i = llantas.findIndex(l => l.posicion === activa);
    if (i >= 0 && i < llantas.length - 1) setActiva(llantas[i + 1].posicion);
    else haptic('selection');
  };

  // Rotación: intercambia los datos de dos posiciones; ambas quedan con ROT = SI y acción Rotación
  // Intercambia los datos de dos posiciones (botón o arrastre en 3D); ambas quedan rotadas y se selecciona la de origen
  const rotarPosiciones = (origen: string, destino: string) => {
    if (!origen || !destino || origen === destino) return;
    const lo = llantas.find(l => l.posicion === origen);
    const ld = llantas.find(l => l.posicion === destino);
    if (!lo || !ld) return;
    const datos = (l: Llanta) => ({ codigo: l.codigo, codigoBase: l.codigoBase, marca: l.marca, medida: l.medida, modelo: l.modelo, r1: l.r1, r2: l.r2, r3: l.r3, r4: l.r4, presion_ant: l.presion_ant, presion_actual: l.presion_actual, estado: l.estado, foto1: l.foto1, foto2: l.foto2, foto3: l.foto3 });
    setLlantas(ls => ls.map(l => {
      if (l.posicion === origen) return { ...l, ...datos(ld), rot: 'SI', accion: 'Rotación', observacion: `De Posición #${destino} a Posición #${origen}` };
      if (l.posicion === destino) return { ...l, ...datos(lo), rot: 'SI', accion: 'Rotación', observacion: `De Posición #${origen} a Posición #${destino}` };
      return l;
    }));
    setActiva(origen);
    haptic('success');
    toast(`Rotación realizada: Posición #${origen} ⇄ #${destino}`);
  };
  const rotar = () => {
    if (!actual || !destinoRot) return;
    rotarPosiciones(actual.posicion, destinoRot);
    setDestinoRot('');
  };

  // Almacenes (papelera, reencauche y repisa): retiro desde el modelo y montaje desde la repisa
  const modeloPosRef = useRef<PosicionBajo | null>(null);
  const almacenRef = useRef<AlmacenesHandle>(null);
  const vaciarPosicion = (pos: string) => { setLlantas(ls => ls.map(l => (l.posicion === pos ? vacia(pos) : l))); setActiva(pos); };
  const montarPosicion = (pos: string, item: LlantaDisponible) => {
    // La llanta de la repisa trae su código y su ficha; las mediciones las toma el inspector
    setLlantas(ls => ls.map(l => (l.posicion === pos ? {
      ...l, codigo: item.codigo, codigoBase: true, marca: texto(item.marca), medida: texto(item.medida), modelo: texto(item.modelo),
      accion: 'Instalación', rot: 'NO',
    } : l)));
    setActiva(pos);
  };

  const medidas = (l: Llanta) => [l.r1, l.r2, l.r3, l.r4].some(v => numero(v) > 0);
  const opciones = (clave: string) => {
    const arr = catalogos.data?.[clave];
    return Array.isArray(arr) ? arr.map(x => (typeof x === 'string' ? x : String((x as { nombre?: string; valor?: string }).nombre ?? (x as { valor?: string }).valor ?? ''))).filter(Boolean) : [];
  };

  function validar(): Errores {
    const e: Errores = {};
    if (!fecha) e.fecha = 'Indica la fecha de la inspección.';
    if (km !== '' && !/^\d+$/.test(km)) e.km = 'El kilometraje son solo números.';
    if (!usuario.trim()) e.inspector = 'No hay inspector en la sesión. Vuelve a entrar.';
    if (!llantas.some(medidas)) e.llantas = 'Mide al menos una llanta (R1 a R3) antes de guardar.';
    return e;
  }

  async function guardar() {
    if (!placa) return;
    const e = validar();
    setErrores(e);
    if (Object.keys(e).length) return;
    const items = llantas.filter(medidas).map(l => ({
      posicion: l.posicion.toUpperCase(), codigo: l.codigo.trim().toUpperCase(), marca: l.marca.trim().toUpperCase(), medida: l.medida.trim().toUpperCase(), modelo: l.modelo.trim().toUpperCase(),
      r1: numero(l.r1), r2: numero(l.r2), r3: numero(l.r3), r4: numero(l.r4),
      presion_ant: numero(l.presion_ant), presion_actual: numero(l.presion_actual),
      estado: l.estado, accion: l.accion, rot: l.rot, observaciones: l.observacion.trim(),
      ...(l.foto1 ? { foto1: l.foto1 } : {}), ...(l.foto2 ? { foto2: l.foto2 } : {}), ...(l.foto3 ? { foto3: l.foto3 } : {}),
    }));
    setEnviando(true); setError(null);
    try {
      const body = {
        id_ot: null, placa, vehiculo_placa: placa, configuracion: config,
        fecha_inspeccion: fecha, km_vehiculo: numero(km), odometro_km: String(numero(km)), dias_propuestos: dias,
        observaciones: obs.trim(), observaciones_generales: obs.trim(), inspector: usuario, items, llantas_inspeccionadas: items,
      };
      const r = await api<{ ok?: boolean; error?: string }>('/neumaticos/inspecciones', { method: 'POST', body });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar la inspección');
      haptic('success');
      toast(`Inspección de neumáticos guardada · ${placa}`);
      await Promise.all([qc.invalidateQueries({ queryKey: ['neumaticos'] }), qc.invalidateQueries({ queryKey: ['inspecciones'] })]);
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const cargando = ultima.isLoading;
  const aviso = ultimaFecha && hace !== null
    ? hace <= 7
      ? { tono: 'reciente', titulo: 'Inspección reciente', texto: <>Esta unidad fue inspeccionada el <strong>{fechaDMY(ultimaFecha)}</strong> {hace === 0 ? '(hoy)' : hace === 1 ? '(hace 1 día)' : `(hace ${hace} días)`}{inspectorUltimo ? <> por <strong>{inspectorUltimo}</strong></> : null}.</> }
      : { tono: 'info', titulo: 'Última inspección de neumáticos', texto: <>Fue el <strong>{fechaDMY(ultimaFecha)}</strong> (hace {hace} días){inspectorUltimo ? <> por <strong>{inspectorUltimo}</strong></> : null}.</> }
    : { tono: 'neutral', titulo: 'Sin inspecciones previas', texto: <>Esta unidad no tiene inspecciones de neumáticos registradas.</> };
  const otrasPosiciones = llantas.filter(l => l.posicion !== activa);
  // Nota bajo el odómetro: fecha de la lectura GPS que devolvió el servidor
  const notaGps = kmGps.data
    ? (kmGps.data.km === null || kmGps.data.km === undefined
        ? 'Sin lectura GPS para esa fecha'
        : `GPS del ${fechaDMY(aFecha(kmGps.data.fecha ?? fecha))}`)
    : undefined;

  return (
    <Sheet open={!!placa} onClose={() => !enviando && onClose()} anclaAbajo title={`Neumáticos · ${placa ?? ''}`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={<Cloud size={16} />} onClick={guardar} loading={enviando}>Guardar inspección</Button>
      </>}>
      {cargando ? <PageLoader /> : (
        <div className="insp-neu">
          {/* Aviso de la última inspección: rojo si fue hace 7 días o menos, azul si es más antigua */}
          <div role="status" className={`insp-neu__aviso insp-neu__aviso--${aviso.tono}`}>
            <CircleAlert size={18} aria-hidden />
            <div><strong>{aviso.titulo}.</strong> {aviso.texto}</div>
          </div>

          {error && <div className="insp-neu__error-general" role="alert">{error}</div>}

          {/* Bento 1: datos generales */}
          <section className="insp-neu__bloque">
            <div className="form-grid">
              <Field label="Fecha de inspección" error={errores.fecha}>
                {p => <TextInput {...p} type="date" value={fecha} onChange={e => { setFecha(e.target.value); setErrores(x => ({ ...x, fecha: undefined })); }} />}
              </Field>
              <Field label="Inspector" error={errores.inspector}>
                {p => <TextInput {...p} value={usuario} disabled />}
              </Field>
              <Field label="Kilometraje (odómetro)" error={errores.km} hint={notaGps}>
                {p => <TextInput {...p} inputMode="numeric" value={km} onChange={e => { setKm(e.target.value.replace(/\D/g, '')); setErrores(x => ({ ...x, km: undefined })); }} placeholder="Ej. 154200" />}
              </Field>
              <Field label="Días propuestos para la próxima">
                {() => (
                  <div className="insp-neu__stepper" role="group" aria-label="Días propuestos">
                    <button type="button" className="insp-neu__paso pressable" onClick={() => setDias(d => Math.max(5, d - 5))} aria-label="Restar 5 días"><Minus size={14} /></button>
                    <span className="insp-neu__stepper-valor t-numeric">{dias} días</span>
                    <button type="button" className="insp-neu__paso pressable" onClick={() => setDias(d => d + 5)} aria-label="Sumar 5 días"><Plus size={14} /></button>
                  </div>
                )}
              </Field>
            </div>
            {/* La configuración es la que tiene la placa en Placas: no se elige aquí */}
            <div>
              <p className="insp-neu__titulo">Configuración del vehículo</p>
              {config ? (
                <div className="insp-neu__config">
                  <span className="insp-neu__pill insp-neu__pill--activa">
                    <strong>{config}</strong>
                    <span>{CONFIGURACIONES[config] ? `${CONFIGURACIONES[config].nombre} · ${CONFIGURACIONES[config].llantas} llantas` : 'Según la ficha de la placa'}</span>
                  </span>
                  <span className="insp-neu__config-nota">Tomada de la ficha de Placas</span>
                </div>
              ) : (
                <p className="insp-neu__error" role="alert">Esta placa no tiene configuración de ejes. Regístrala en Placas para ver su esquema.</p>
              )}
            </div>
          </section>

          {/* Bento 2: esquema del chasis, debajo de los datos generales y encima del editor */}
          <ChasisEsquemaVisual configuracion={config} llantas={llantas} activa={activa} onSelect={setActiva} onRotar={rotarPosiciones}
            onSoltarAire={(pos, x, y) => almacenRef.current?.soltarDesdeModelo(pos, x, y)} posicionRef={modeloPosRef} />
          <AlmacenesNeumaticos ref={almacenRef} placa={placa ?? ''} km={km} llantas={llantas} modeloPosRef={modeloPosRef}
            onRetirada={vaciarPosicion} onMontada={montarPosicion} />

          {/* Posiciones: chips y editor de la llanta activa */}
          <section className="insp-neu__bloque">
            <p className="insp-neu__titulo">Posiciones ({llantas.length})</p>
            <div className="insp-neu__chips" role="tablist" aria-label="Posiciones de llantas">
              {llantas.map(l => {
                const p = promedio(l);
                return (
                  <button key={l.posicion} type="button" role="tab" aria-selected={activa === l.posicion}
                    className={`insp-neu__chip pressable${activa === l.posicion ? ' insp-neu__chip--activa' : ''}`} onClick={() => setActiva(l.posicion)}>
                    {l.posicion}
                    {p !== null && <span className="insp-neu__chip-prom" style={{ background: tonoRemanente(p) }} aria-hidden />}
                  </button>
                );
              })}
              <span className="insp-neu__agregar">
                <TextInput value={nuevaPos} onChange={e => setNuevaPos(e.target.value)} placeholder="Nueva" aria-label="Posición nueva" />
                <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={agregar} disabled={!nuevaPos.trim()}>Agregar</Button>
              </span>
            </div>
            {errores.llantas && <p className="insp-neu__error" role="alert">{errores.llantas}</p>}

            {actual && (
              <div className="insp-neu__editor">
                <div className="insp-neu__editor-cab">
                  <span className="insp-neu__pos">Posición {actual.posicion}</span>
                  <span className="insp-neu__prom-badge" style={{ color: tonoRemanente(promedio(actual)) }}>
                    Promedio {promedio(actual) === null ? '—' : `${promedio(actual)!.toFixed(1)} mm`}
                  </span>
                </div>
                <div className="form-grid">
                  <Field label="Marca">{p => (<>
                    <TextInput {...p} value={actual.marca} list="neu-marcas" onChange={e => set(actual.posicion, { marca: e.target.value })}
                      onBlur={() => set(actual.posicion, { marca: corregirMarca(actual.marca, opciones('marcas')) })} />
                    <datalist id="neu-marcas">{opciones('marcas').map(o => <option key={o} value={o} />)}</datalist>
                  </>)}</Field>
                  <Field label="Medida">{p => <TextInput {...p} value={actual.medida} list="neu-medidas" onChange={e => set(actual.posicion, { medida: e.target.value })} />}</Field>
                  <Field label="Modelo">{p => <TextInput {...p} value={actual.modelo} list="neu-modelos" onChange={e => set(actual.posicion, { modelo: e.target.value })} />}</Field>
                  <Field label="Código de la llanta" hint={actual.codigoBase ? 'Viene de la base de llantas' : undefined}>{p => (
                    <TextInput {...p} value={actual.codigo} readOnly={actual.codigoBase} placeholder="Ej. LL-0001"
                      onChange={e => set(actual.posicion, { codigo: e.target.value })} />
                  )}</Field>
                </div>
                <datalist id="neu-medidas">{opciones('medidas').map(o => <option key={o} value={o} />)}</datalist>
                <datalist id="neu-modelos">{opciones('modelos').map(o => <option key={o} value={o} />)}</datalist>

                <div className="insp-neu__mms">
                  <Milimetros etiqueta="R1" valor={actual.r1} onChange={v => set(actual.posicion, { r1: v })} />
                  <Milimetros etiqueta="R2" valor={actual.r2} onChange={v => set(actual.posicion, { r2: v })} />
                  <Milimetros etiqueta="R3" valor={actual.r3} onChange={v => set(actual.posicion, { r3: v })} />
                  <Milimetros etiqueta="R4 (opcional)" valor={actual.r4} onChange={v => set(actual.posicion, { r4: v })} />
                </div>

                <div className="form-grid">
                  <Field label="Presión anterior (PSI)">{p => <TextInput {...p} inputMode="numeric" value={actual.presion_ant} onChange={e => set(actual.posicion, { presion_ant: e.target.value.replace(/\D/g, '') })} />}</Field>
                  <Field label="Presión actual (PSI)">{p => <TextInput {...p} inputMode="numeric" value={actual.presion_actual} onChange={e => set(actual.posicion, { presion_actual: e.target.value.replace(/\D/g, '') })} />}</Field>
                  <Field label="Estado">{p => <SelectInput {...p} value={actual.estado} onChange={e => set(actual.posicion, { estado: e.target.value })}>{ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}</SelectInput>}</Field>
                  <Field label="Acción">{p => <SelectInput {...p} value={actual.accion} onChange={e => set(actual.posicion, { accion: e.target.value })}>{ACCIONES.map(s => <option key={s} value={s}>{s}</option>)}</SelectInput>}</Field>
                  <Field label="ROT (rotada)">{p => <SelectInput {...p} value={actual.rot} onChange={e => set(actual.posicion, { rot: e.target.value as 'NO' | 'SI' })}><option value="NO">NO</option><option value="SI">SI</option></SelectInput>}</Field>
                  <Field label="Observación de la llanta" wide>{p => <TextInput {...p} value={actual.observacion} onChange={e => set(actual.posicion, { observacion: e.target.value })} />}</Field>
                </div>

                {/* Rotación con otra posición */}
                <div className="insp-neu__rotar">
                  <span className="insp-neu__titulo">Rotar con otra posición</span>
                  <div className="insp-neu__rotar-control">
                    <SelectInput value={destinoRot} onChange={e => setDestinoRot(e.target.value)} aria-label="Posición destino de la rotación" disabled={otrasPosiciones.length === 0}>
                      <option value="">Elige la posición…</option>
                      {otrasPosiciones.map(l => <option key={l.posicion} value={l.posicion}>Posición {l.posicion}</option>)}
                    </SelectInput>
                    <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={rotar} disabled={!destinoRot}>Rotar</Button>
                  </div>
                </div>

                {/* Evidencia fotográfica: tres fotos por llanta */}
                <div>
                  <p className="insp-neu__titulo">Evidencia fotográfica</p>
                  <div className="insp-neu__fotos">
                    <FotoSlot etiqueta="Foto 1" valor={actual.foto1} onChange={v => set(actual.posicion, { foto1: v })} />
                    <FotoSlot etiqueta="Foto 2" valor={actual.foto2} onChange={v => set(actual.posicion, { foto2: v })} />
                    <FotoSlot etiqueta="Foto 3" valor={actual.foto3} onChange={v => set(actual.posicion, { foto3: v })} />
                  </div>
                </div>

                <div className="insp-neu__acciones-llanta">
                  <Button variant="plain" onClick={limpiar}>Limpiar campos</Button>
                  <Button variant="secondary" onClick={siguiente}>Guardar llanta y seguir</Button>
                  <button type="button" className="insp-neu__quitar pressable" onClick={() => quitar(actual.posicion)} aria-label={`Quitar posición ${actual.posicion}`}><Trash2 size={15} /></button>
                </div>
              </div>
            )}
          </section>

          {/* Resumen: cada fila se toca para corregirla */}
          <section className="insp-neu__bloque">
            <p className="insp-neu__titulo">Resumen de llantas</p>
            <div className="insp-neu__tabla-caja">
              <table className="insp-neu__tabla">
                <thead>
                  <tr><th>Pos</th><th>Marca</th><th>Medida</th><th>Modelo</th><th>R1</th><th>R2</th><th>R3</th><th>R4</th><th>Prom.</th><th>PSI</th><th>Estado</th><th>Acción</th><th>ROT</th><th>Fotos</th><th>Observación</th></tr>
                </thead>
                <tbody>
                  {llantas.map(l => {
                    const p = promedio(l);
                    const fotos = [l.foto1, l.foto2, l.foto3].filter(Boolean).length;
                    return (
                      <tr key={l.posicion} className={`insp-neu__fila pressable${activa === l.posicion ? ' insp-neu__fila--activa' : ''}`} onClick={() => setActiva(l.posicion)} tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter') setActiva(l.posicion); }}>
                        <td className="t-numeric">{l.posicion}</td>
                        <td>{l.marca || '—'}</td>
                        <td>{l.medida || '—'}</td>
                        <td>{l.modelo || '—'}</td>
                        <td className="t-numeric">{l.r1 || '—'}</td>
                        <td className="t-numeric">{l.r2 || '—'}</td>
                        <td className="t-numeric">{l.r3 || '—'}</td>
                        <td className="t-numeric">{l.r4 || '—'}</td>
                        <td className="t-numeric" style={{ color: tonoRemanente(p), fontWeight: 700 }}>{p === null ? '—' : p.toFixed(1)}</td>
                        <td className="t-numeric">{l.presion_actual || '—'}</td>
                        <td>{l.estado}</td>
                        <td>{l.accion}</td>
                        <td>{l.rot}</td>
                        <td className="t-numeric">{fotos}/3</td>
                        <td className="insp-neu__obs">{l.observacion || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <Field label="Observaciones generales" wide>{p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" />}</Field>
        </div>
      )}
    </Sheet>
  );
}
