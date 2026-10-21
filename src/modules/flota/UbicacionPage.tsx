import './flota.css';
import '../mantenimiento/mant.css';
import './disponibilidad.css';
import './ubicacion.css';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Briefcase, ChevronDown, ChevronLeft, MapPin, MessageCircle, Navigation, RefreshCw, Route, Truck, Wrench, X } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ChoiceChips } from '../../core/ui/Chips';
import { BarraFiltros, GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { agruparEmpresas, claveEmpresa } from '../../core/lib/empresa';
import { haptic } from '../../core/lib/haptics';
import { spring } from '../../core/lib/motion';
import { abrirClasico } from '../../core/layout/navigation';
import { COLOR_ESTADO, UbicacionMapa, type CapaMapa } from './UbicacionMapa';
import { PanelHistorial, type Velocidad } from './UbicacionPlayback';
import { useHistorial } from './UbicacionHistorial';
import { estadoUnidad, useDisponibilidad, useUnidadesGps, type EstadoUnidad, type UnidadMapa } from './api';

const CAPAS: Array<{ value: CapaMapa; label: string }> = [{ value: 'calle', label: 'Callejero' }, { value: 'satelite', label: 'Satelital' }];
const VISTAS: Array<{ value: 'lista' | 'mapa'; label: string }> = [{ value: 'lista', label: 'Lista' }, { value: 'mapa', label: 'Mapa' }];
const CARDINALES = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

// Segmento de la lista: los mismos filtros de estado que la versión actual
type Segmento = 'todos' | 'senal' | 'movimiento' | 'ralenti' | 'detenido' | 'sin_senal';
const SEGMENTOS: Array<{ value: Segmento; label: string }> = [
  { value: 'todos', label: 'Todas' }, { value: 'senal', label: 'Con señal' }, { value: 'movimiento', label: 'En movimiento' },
  { value: 'ralenti', label: 'Ralentí' }, { value: 'detenido', label: 'Detenido' }, { value: 'sin_senal', label: 'Sin señal' },
];
const coincideSegmento = (u: UnidadMapa, s: Segmento) =>
  s === 'todos' || (s === 'senal' ? estadoUnidad(u) !== 'sin_senal' : estadoUnidad(u) === s);

// Agrupación de la lista: por empresa o por grupo de Wialon (Líquidos, Carga Seca, GLP…).
// Criterio: una unidad aparece en CADA grupo de Wialon al que pertenece (igual que el clásico, que usa unitIds por grupo);
// sin grupo va a "Sin grupo". Se ignoran los grupos técnicos de consulta (TEMP / CONSULTA), como en el clásico.
type Agrupar = 'empresa' | 'wialon';
const AGRUPAR_OPCIONES: Array<{ value: Agrupar; label: string }> = [{ value: 'empresa', label: 'Empresa' }, { value: 'wialon', label: 'Grupo Wialon' }];
const CLAVE_AGRUPAR = 'fleet_gps_agrupar';
const SIN_GRUPO = 'Sin grupo';
const gruposDeUnidad = (u: UnidadMapa) =>
  (u.grupos ?? []).filter(n => { const m = n.toUpperCase(); return !m.includes('TEMP') && !m.includes('CONSULTA'); });
function agrupacionGuardada(): Agrupar {
  try { return localStorage.getItem(CLAVE_AGRUPAR) === 'wialon' ? 'wialon' : 'empresa'; } catch { return 'empresa'; }
}

const rumboTexto = (grados: number) => CARDINALES[Math.round(((grados % 360) + 360) % 360 / 45) % 8];
const corta = (empresa: string) => claveEmpresa(empresa).split(' ')[0] || '—';
const placaLimpia = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** Texto corto del estado: velocidad si se mueve, "Ralentí", "Detenido" o "Sin señal" */
function etiquetaCorta(u: UnidadMapa, estado: EstadoUnidad) {
  if (estado === 'movimiento') return `${Math.round(u.velocidad)} km/h`;
  if (estado === 'ralenti') return 'Ralentí';
  if (estado === 'detenido') return 'Detenido';
  return 'Sin señal';
}
const COLOR_BADGE: Record<EstadoUnidad, string> = { movimiento: 'blue', ralenti: 'orange', detenido: 'green', sin_senal: 'gray' };

// Ubicación GPS de la flota: lista agrupada por empresa, mapa, ficha de cada unidad e historial con reproducción.
// Misma fuente que la versión actual.
export function UbicacionPage() {
  const { data, isLoading, isError, error, dataUpdatedAt, isFetching, refetch } = useUnidadesGps();
  const disp = useDisponibilidad();
  const unidades = data ?? [];
  const [empresa, setEmpresa] = useState('TODAS');
  const [segmento, setSegmento] = useState<Segmento>('todos');
  const [agrupar, setAgrupar] = useState<Agrupar>(agrupacionGuardada);
  const [colapsados, setColapsados] = useState<Set<string>>(() => new Set());
  const [filtrando, setFiltrando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [ocultas, setOcultas] = useState<Set<string>>(() => new Set());
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [panel, setPanel] = useState<'ficha' | 'historial'>('ficha');
  const [horas, setHoras] = useState(24);
  const [indice, setIndice] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [velocidad, setVelocidad] = useState<Velocidad>(1);
  const [capa, setCapa] = useState<CapaMapa>('calle');
  const [encuadre, setEncuadre] = useState(0);
  const [vistaMovil, setVistaMovil] = useState<'lista' | 'mapa'>('lista');
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const segundos = dataUpdatedAt ? Math.max(0, Math.round((ahora - dataUpdatedAt) / 1000)) : null;

  const empresas = useMemo(() => agruparEmpresas(unidades.map(u => u.empresa)), [unidades]);
  const delEmpresa = useMemo(() => unidades.filter(u => empresa === 'TODAS' || claveEmpresa(u.empresa) === empresa), [unidades, empresa]);
  const lista = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    // Solo por identificador de la unidad: placa, y el nombre en Wialon (ahí aparece la placa cuando el servidor no la extrae)
    return delEmpresa.filter(u => (!q || [u.placa, u.nombre].some(t => t.toUpperCase().includes(q))) && coincideSegmento(u, segmento));
  }, [delEmpresa, busqueda, segmento]);

  const cambiarAgrupar = (v: Agrupar) => {
    haptic('selection');
    setAgrupar(v);
    try { localStorage.setItem(CLAVE_AGRUPAR, v); } catch { /* sin almacenamiento */ }
  };

  // La lista se agrupa por empresa o por grupo de Wialon (una unidad puede salir en varios grupos)
  const grupos = useMemo(() => {
    const m = new Map<string, { clave: string; nombre: string; units: UnidadMapa[] }>();
    const meter = (clave: string, nombre: string, u: UnidadMapa) => {
      const g = m.get(clave) ?? { clave, nombre, units: [] };
      g.units.push(u);
      m.set(clave, g);
    };
    for (const u of lista) {
      if (agrupar === 'wialon') {
        const gs = gruposDeUnidad(u);
        if (!gs.length) meter('w:' + SIN_GRUPO, SIN_GRUPO, u);
        for (const n of gs) meter('w:' + n.toUpperCase(), n, u);
      } else {
        const clave = claveEmpresa(u.empresa) || 'OTRAS';
        meter(clave, empresas.find(e => e.clave === clave)?.nombre ?? 'Otras unidades', u);
      }
    }
    // "Sin grupo" siempre al final
    return [...m.values()].sort((a, b) => (a.nombre === SIN_GRUPO ? 1 : 0) - (b.nombre === SIN_GRUPO ? 1 : 0) || a.nombre.localeCompare(b.nombre, 'es'));
  }, [lista, empresas, agrupar]);

  const cifras = useMemo(() => {
    let conSenal = 0;
    let enMovimiento = 0;
    for (const u of delEmpresa) {
      const e = estadoUnidad(u);
      if (e !== 'sin_senal') conSenal++;
      if (e === 'movimiento') enMovimiento++;
    }
    return { total: delEmpresa.length, conSenal, enMovimiento, sinSenal: delEmpresa.length - conSenal };
  }, [delEmpresa]);

  const enLista = lista.length;
  const visiblesEnMapa = lista.filter(u => u.lat != null && !ocultas.has(u.placa)).length;
  const todasVisibles = lista.length > 0 && lista.every(u => !ocultas.has(u.placa));
  const seleccion = unidades.find(u => u.placa === seleccionada) ?? null;
  // Con búsqueda, el mapa se acerca a lo encontrado (hasta 25 unidades)
  const encuadrarA = busqueda.trim() && lista.length <= 25 ? lista.map(u => u.placa) : [];

  // Historial: solo se pide cuando el panel de historial está abierto
  const abiertoHistorial = panel === 'historial' && seleccion ? seleccion : null;
  const historialQ = useHistorial(abiertoHistorial?.placa ?? null, abiertoHistorial?.id ?? null, horas);
  const historial = abiertoHistorial ? historialQ.data : undefined;
  const errorHistorial = historialQ.error ? errorMessage(historialQ.error) : '';

  // Datos nuevos o rango nuevo: se vuelve al inicio del recorrido
  useEffect(() => {
    setIndice(0);
    setReproduciendo(false);
  }, [historial]);

  // Reproducción: avanza un punto cada 300 ms (la velocidad la acelera), como en la versión actual
  useEffect(() => {
    if (!reproduciendo || !historial) return;
    const paso = Math.max(20, Math.round(300 / velocidad));
    const t = setInterval(() => {
      setIndice(i => {
        if (i >= historial.puntos.length - 1) {
          setReproduciendo(false);
          return i;
        }
        return i + 1;
      });
    }, paso);
    return () => clearInterval(t);
  }, [reproduciendo, velocidad, historial]);

  const conductorDe = (placa: string) =>
    disp.data?.find(d => placaLimpia(d.placa_camion || '') === placa || placaLimpia(d.placa_carreta || '') === placa)?.conductor_asignado || 'Sin asignar';

  const alternarUnidad = (placa: string) => {
    haptic('selection');
    setOcultas(prev => {
      const n = new Set(prev);
      if (n.has(placa)) n.delete(placa); else n.add(placa);
      return n;
    });
  };
  const alternarTodas = () => {
    haptic('selection');
    setOcultas(prev => {
      const n = new Set(prev);
      for (const u of lista) { if (todasVisibles) n.add(u.placa); else n.delete(u.placa); }
      return n;
    });
  };
  // Mostrar u ocultar todo un grupo: si todas están visibles se ocultan; si no, se muestran
  const alternarGrupo = (units: UnidadMapa[]) => {
    haptic('selection');
    setOcultas(prev => {
      const n = new Set(prev);
      const todasVis = units.every(u => !n.has(u.placa));
      for (const u of units) { if (todasVis) n.add(u.placa); else n.delete(u.placa); }
      return n;
    });
  };
  const alternarColapso = (clave: string) => {
    haptic('selection');
    setColapsados(prev => {
      const n = new Set(prev);
      if (n.has(clave)) n.delete(clave); else n.add(clave);
      return n;
    });
  };
  const elegir = (placa: string) => {
    haptic('selection');
    setSeleccionada(placa);
    setPanel('ficha');
    setIndice(0);
    setReproduciendo(false);
    setVistaMovil('mapa');
  };
  const cerrarPanel = () => {
    setSeleccionada(null);
    setPanel('ficha');
    setReproduciendo(false);
  };

  const filaUnidad = (u: UnidadMapa) => {
    const estado = estadoUnidad(u);
    const color = COLOR_ESTADO[estado];
    const marcada = seleccionada === u.placa;
    return (
      <li key={u.placa} className={`gps-tarjeta${marcada ? ' gps-tarjeta--sel' : ''}`}>
        <input type="checkbox" className="gps-tarjeta__check" checked={!ocultas.has(u.placa)} onChange={() => alternarUnidad(u.placa)}
          aria-label={`Mostrar ${u.placa} en el mapa`} />
        <button type="button" className="gps-tarjeta__cuerpo" onClick={() => elegir(u.placa)}>
          <span className="gps-punto" style={{ background: color, boxShadow: `0 0 6px ${color}` }} aria-hidden />
          <span className="gps-tarjeta__texto">
            <span className="gps-tarjeta__linea">
              <span className="gps-placa">{u.placa}</span>
              <span className="gps-chip">{corta(u.empresa)}</span>
              <span className={`gps-estado gps-estado--${COLOR_BADGE[estado]}`}>{etiquetaCorta(u, estado)}</span>
            </span>
            <span className="gps-tarjeta__dir">
              {u.ubicacion ? <><MapPin size={11} aria-hidden />{u.ubicacion}</> : (u.nombre || 'Sin dirección')}
            </span>
          </span>
        </button>
        <span className="gps-tarjeta__stats">
          <b>{u.km.toLocaleString('es-PE')} km</b>
          <span>{u.horas.toLocaleString('es-PE')} hrs</span>
        </span>
      </li>
    );
  };

  return (
    <Page wide fill>
      <PageHeader
        eyebrow="Flota"
        title="Ubicación GPS"
        subtitle={isLoading ? 'Cargando unidades…' : `${cifras.total} unidades · ${cifras.enMovimiento} en movimiento`}
        actions={
          <>
            <span className="gps-vivo" aria-live="polite">
              <span className="gps-vivo__punto" aria-hidden />
              En vivo{segundos !== null && ` · ${segundos}s`}
            </span>
            <Button variant="plain" iconOnly className="btn--icono btn--icono-acento" icon={<RefreshCw size={18} />} aria-label="Actualizar" title="Actualizar"
              disabled={isFetching} onClick={() => refetch()} />
            <MenuOtros opciones={[
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('flota/ubicacion') },
            ]} />
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div className="gps-cuerpo" data-vista={vistaMovil}>
          <div className="disp-kpis gps-kpis">
            {([
              { clave: 'todos', label: 'Flota monitoreada', valor: cifras.total, tono: 'blue', icono: <Briefcase size={16} strokeWidth={1.9} /> },
              { clave: 'senal', label: 'Con señal GPS', valor: cifras.conSenal, tono: 'green', icono: <MapPin size={16} strokeWidth={1.9} /> },
              { clave: 'movimiento', label: 'En movimiento', valor: cifras.enMovimiento, tono: 'blue', icono: <Navigation size={16} strokeWidth={1.9} /> },
              { clave: 'sin_senal', label: 'Sin señal', valor: cifras.sinSenal, tono: 'ink', icono: <Wrench size={16} strokeWidth={1.9} /> },
            ] as const).map(k => (
              <button key={k.clave} type="button" className={`disp-kpi disp-kpi--${k.tono}`} aria-pressed={segmento === k.clave}
                onClick={() => { haptic('selection'); setSegmento(s => (s === k.clave && k.clave !== 'todos' ? 'todos' : k.clave)); }}>
                <span>
                  <span className="disp-kpi__label">{k.label}</span>
                  <AnimatedNumber value={k.valor} className="disp-kpi__valor t-numeric" />
                </span>
                <span className="disp-kpi__icono" aria-hidden>{k.icono}</span>
              </button>
            ))}
          </div>

          <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Buscar por placa o nombre…"
            activos={(empresa !== 'TODAS' ? 1 : 0) + (segmento !== 'todos' ? 1 : 0)} onAbrirFiltros={() => setFiltrando(true)}>
            <div className="gps-vistas">
              <SegmentedControl label="Vista" value={vistaMovil} onChange={setVistaMovil} options={VISTAS} />
            </div>
          </BarraFiltros>
          <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={(empresa !== 'TODAS' ? 1 : 0) + (segmento !== 'todos' ? 1 : 0)}
            onLimpiar={() => { setEmpresa('TODAS'); setSegmento('todos'); }} resultado={lista.length} unidad="unidad">
            <GrupoFiltro titulo="Empresa">
              <ChoiceChips label="Empresa" value={empresa} onChange={setEmpresa} options={[{ value: 'TODAS', label: 'Todas' }, ...empresas.map(e => ({ value: e.clave, label: e.nombre }))]} />
            </GrupoFiltro>
            <GrupoFiltro titulo="Estado">
              <ChoiceChips label="Estado" value={segmento} onChange={v => setSegmento(v as Segmento)} options={SEGMENTOS} />
            </GrupoFiltro>
          </HojaFiltros>

          <div className="gps-layout" data-vista={vistaMovil} data-ficha={seleccion ? 'si' : 'no'}>
            <section className="gps-lista" aria-label="Unidades">
              <div className="gps-lista__cab">
                <SegmentedControl label="Agrupar por" value={agrupar} onChange={cambiarAgrupar} options={AGRUPAR_OPCIONES} />
                <label className="gps-check">
                  <input type="checkbox" checked={todasVisibles} onChange={alternarTodas} disabled={!lista.length} />
                  <span>Visibles ({visiblesEnMapa}/{enLista})</span>
                </label>
              </div>
              <ul className="gps-lista__items">
                {grupos.map(g => {
                  const visiblesGrupo = g.units.filter(u => !ocultas.has(u.placa)).length;
                  const todasGrupo = visiblesGrupo === g.units.length;
                  const ningunaGrupo = visiblesGrupo === 0;
                  const abierto = !colapsados.has(g.clave);
                  return (
                    <li key={g.clave} className="gps-grupo">
                      <div className="gps-grupo__cab">
                        <input type="checkbox" className="gps-tarjeta__check" checked={todasGrupo}
                          ref={el => { if (el) el.indeterminate = !todasGrupo && !ningunaGrupo; }}
                          onChange={() => alternarGrupo(g.units)} aria-label={`Mostrar el grupo ${g.nombre} en el mapa`} />
                        <button type="button" className="gps-grupo__titulo" aria-expanded={abierto} onClick={() => alternarColapso(g.clave)}>
                          <ChevronDown size={15} aria-hidden />
                          <span>{g.nombre}</span>
                          <span className="gps-grupo__conteo">{visiblesGrupo}/{g.units.length}</span>
                        </button>
                      </div>
                      {abierto && <ul className="gps-grupo__unidades">{g.units.map(filaUnidad)}</ul>}
                    </li>
                  );
                })}
              </ul>
              {!lista.length && <p className="gps-vacio">Ninguna unidad coincide con la búsqueda.</p>}
            </section>

            <div className="gps-mapa-wrap">
              <UbicacionMapa unidades={unidades} ocultas={ocultas} seleccionada={seleccionada} fichaAbierta={!!seleccion}
                capa={capa} encuadreVersion={encuadre} encuadrarA={encuadrarA}
                historial={historial ?? null} indice={indice} onElegir={elegir} />
              <div className="gps-controles">
                <button type="button" className="gps-volver" onClick={() => { haptic('selection'); setVistaMovil('lista'); }}><ChevronLeft size={16} />Lista</button>
                <Button variant="secondary" onClick={() => { haptic('selection'); setEncuadre(v => v + 1); }}>Toda la flota</Button>
                <SegmentedControl label="Capa del mapa" value={capa} onChange={setCapa} options={CAPAS} />
              </div>
            </div>

            {vistaMovil === 'mapa' && !seleccion && (
              <p className="gps-mapa-hint">Toca una unidad en el mapa o en la lista para ver su detalle.</p>
            )}

            <AnimatePresence mode="popLayout">
              {seleccion && panel === 'ficha' && (
                <UnidadFicha key="ficha" u={seleccion} conductor={conductorDe(seleccion.placa)}
                  onCerrar={cerrarPanel} onHistorial={() => { haptic('selection'); setPanel('historial'); }} />
              )}
              {seleccion && panel === 'historial' && (
                <PanelHistorial key="historial" placa={seleccion.placa} horas={horas}
                  onHoras={setHoras} historial={historial} cargando={historialQ.isFetching && !historial}
                  error={errorHistorial} indice={indice} onIndice={i => { setIndice(i); setReproduciendo(false); }}
                  reproduciendo={reproduciendo} onReproducir={() => setReproduciendo(r => !r)}
                  onReiniciar={() => { setIndice(0); setReproduciendo(false); }}
                  velocidad={velocidad} onVelocidad={setVelocidad}
                  onSalir={() => { setPanel('ficha'); setReproduciendo(false); }} />
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </Page>
  );
}

function UnidadFicha({ u, conductor, onCerrar, onHistorial }: { u: UnidadMapa; conductor: string; onCerrar: () => void; onHistorial: () => void }) {
  const estado = estadoUnidad(u);
  const color = COLOR_ESTADO[estado];
  const tienePos = u.lat != null && u.lng != null;
  const etiqueta = estado === 'movimiento' ? `En movimiento · ${Math.round(u.velocidad)} km/h`
    : estado === 'ralenti' ? 'Ralentí (ON)'
    : estado === 'detenido' ? 'Detenido (OFF)' : 'Sin señal GPS';
  const maps = tienePos ? `https://maps.google.com/maps?q=${u.lat},${u.lng}` : '';
  const waze = tienePos ? `https://waze.com/ul?ll=${u.lat},${u.lng}&navigate=yes` : '';
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Unidad ${u.placa}: ${etiqueta}. ${u.ubicacion} ${maps}`.trim())}`;

  return (
    <motion.article className="gps-ficha" aria-label={`Ficha de ${u.placa}`}
      initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={spring}>
      <header className="gps-ficha__cab">
        <span className="gps-ficha__icono"><Truck size={22} strokeWidth={1.9} /></span>
        <div className="gps-ficha__titulo">
          <div className="gps-ficha__linea">
            <strong className="gps-ficha__placa">{u.placa}</strong>
            {u.tipo && <span className="gps-etiqueta">{u.tipo.toUpperCase()}</span>}
            <span className="gps-etiqueta" style={{ color, borderColor: color }}>{etiqueta}</span>
          </div>
          <span className="gps-ficha__sub">{[u.nombre, u.empresa].filter(Boolean).join(' · ')}</span>
        </div>
        <button type="button" className="gps-ficha__cerrar" onClick={onCerrar} aria-label="Cerrar ficha"><X size={16} /></button>
      </header>

      <button type="button" className="gps-accion gps-accion--principal" onClick={onHistorial}>
        <Route size={15} />Historial / Playback
      </button>

      <div className="gps-ficha__acciones">
        {tienePos && (
          <>
            <a className="gps-accion" href={waze} target="_blank" rel="noopener noreferrer"><Navigation size={14} />Waze</a>
            <a className="gps-accion" href={maps} target="_blank" rel="noopener noreferrer"><MapPin size={14} />Maps</a>
          </>
        )}
        <a className="gps-accion" href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} />WhatsApp</a>
      </div>

      <div className="gps-ficha__datos">
        <Dato titulo="Odómetro" valor={`${u.km.toLocaleString('es-PE')} km`} destacado />
        <Dato titulo="Horómetro" valor={`${u.horas.toLocaleString('es-PE')} hrs`} />
        <Dato titulo="Batería / ignición" valor={`${u.voltaje ? `${u.voltaje} V` : '—'} · Motor ${u.ignicion ? 'ON' : 'OFF'}`} />
        <Dato titulo="Satélites / altitud" valor={`${u.satelites ?? '—'} sat · ${u.altitud != null ? `${Math.round(u.altitud)} msnm` : '—'}`} />
        <Dato titulo="Velocidad / rumbo" valor={`${Math.round(u.velocidad)} km/h · ${rumboTexto(u.rumbo)} (${Math.round(u.rumbo)}°)`} />
        <Dato titulo="Conductor / operador" valor={conductor} />
      </div>

      <div className="gps-ficha__direccion">
        <span className="gps-ficha__direccion-titulo"><MapPin size={13} />Dirección satelital geocodificada</span>
        <span>{u.ubicacion || 'Sin dirección disponible'}</span>
        {tienePos && <span className="gps-coords">{u.lat!.toFixed(4)}, {u.lng!.toFixed(4)}</span>}
      </div>
    </motion.article>
  );
}

function Dato({ titulo, valor, destacado }: { titulo: string; valor: string; destacado?: boolean }) {
  return (
    <div className="gps-dato">
      <span className="gps-dato__titulo">{titulo}</span>
      <span className={`gps-dato__valor${destacado ? ' gps-dato__valor--acento' : ''}`}>{valor}</span>
    </div>
  );
}
