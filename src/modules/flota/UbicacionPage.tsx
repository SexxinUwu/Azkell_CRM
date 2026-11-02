import './flota.css';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { Page } from '../../core/ui/Display';
import { PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { ChoiceChips } from '../../core/ui/Chips';
import { GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { errorMessage } from '../../core/api/client';
import { agruparEmpresas, claveEmpresa } from '../../core/lib/empresa';
import { haptic } from '../../core/lib/haptics';
import { PanelHistorial, type Velocidad } from './UbicacionPlayback';
import { useHistorial } from './UbicacionHistorial';
import { estadoUnidad, useDisponibilidad, useUnidadesGps, type EstadoUnidad, type UnidadMapa } from './api';
import { usePlacas } from '../placas/api';
import { descripcionCamion } from './gps/tipoUnidad';
import { FichaTelemetria, Grab } from './gps/FichaTelemetria';
import { ST } from './gps/camiones';
import type { TemaMapa } from './gps/estilos';
import { useOscuro } from '../placas/tresd/useOscuro';
import type { Alerta } from './gps/motor';

// El mapa (MapLibre + three.js) pesa: se descarga solo al abrir este módulo
const UbicacionMapa = lazy(() => import('./UbicacionMapa').then(m => ({ default: m.UbicacionMapa })));

// Segmento de la lista: los mismos filtros de estado que la versión actual
type Segmento = 'todos' | 'senal' | 'movimiento' | 'ralenti' | 'detenido' | 'sin_senal';
const SEGMENTOS: Array<{ value: Segmento; label: string }> = [
  { value: 'todos', label: 'Todas' }, { value: 'senal', label: 'Con señal' }, { value: 'movimiento', label: 'En movimiento' },
  { value: 'ralenti', label: 'Ralentí' }, { value: 'detenido', label: 'Detenido' }, { value: 'sin_senal', label: 'Sin señal' },
];
const coincideSegmento = (u: UnidadMapa, s: Segmento) =>
  s === 'todos' || (s === 'senal' ? estadoUnidad(u) !== 'sin_senal' : estadoUnidad(u) === s);

// Agrupación de la lista: por empresa o una sola lista
type Agrupar = 'empresa' | 'individual';
const CLAVE_AGRUPAR = 'fleet_gps_agrupar';
function agrupacionGuardada(): Agrupar {
  try { const v = localStorage.getItem(CLAVE_AGRUPAR); return v === 'individual' || v === 'wialon' ? 'individual' : 'empresa'; } catch { return 'empresa'; }
}
type BaseMapa = 'mapa' | 'sat';
function baseGuardada(): BaseMapa {
  try { return localStorage.getItem('fleet_gps_base') === 'sat' ? 'sat' : 'mapa'; } catch { return 'mapa'; }
}

const corta = (empresa: string) => claveEmpresa(empresa).split(' ')[0] || '—';
const placaLimpia = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const CLASE: Record<EstadoUnidad, keyof typeof ST> = { movimiento: 'mov', ralenti: 'ral', detenido: 'det', sin_senal: 'off' };
const ORDEN: Record<EstadoUnidad, number> = { movimiento: 0, ralenti: 1, detenido: 2, sin_senal: 3 };

// Ubicación GPS de la flota: telemetría en vivo sobre un mapa MapLibre con unidades en 3D.
// Misma fuente que la versión actual (Wialon); lista, filtros, ficha e historial con reproducción.
export function UbicacionPage() {
  const { data, isLoading, isError, error, dataUpdatedAt, isFetching, refetch } = useUnidadesGps();
  const disp = useDisponibilidad();
  const placas = usePlacas();
  const unidades = useMemo(() => data ?? [], [data]);
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
  const [dia, setDia] = useState<string | null>(null);
  const [desde, setDesde] = useState<string | null>(null);
  const [hasta, setHasta] = useState<string | null>(null);
  const [indice, setIndice] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [velocidad, setVelocidad] = useState<Velocidad>(1);
  // El mapa base (Mapa o Satélite) lo elige la persona; el color claro u oscuro lo define el tema del sistema
  const { oscuro } = useOscuro();
  const [base, setBase] = useState<BaseMapa>(baseGuardada);
  const tema: TemaMapa = base === 'sat' ? 'sat' : oscuro ? 'night' : 'day';
    const [ahora, setAhora] = useState(() => Date.now());
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [totalAlertas, setTotalAlertas] = useState(0);
  const [piloto, setPiloto] = useState(false);
  const [hojaLista, setHojaLista] = useState(false);
  const [hojaFicha, setHojaFicha] = useState(false);
  const [motor, setMotor] = useState<import('./gps/motor').MotorTelemetria | null>(null);

  // El motor del mapa se crea al cargar el chunk del mapa
  useEffect(() => {
    let vivo = true;
    import('./gps/motor').then(m => { if (vivo) setMotor(m.motorTelemetria()); });
    return () => { vivo = false; };
  }, []);

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

  const descs = useMemo(() => {
    const porPlaca = new Map((placas.data ?? []).map(p => [placaLimpia(p.placa), p]));
    return new Map(unidades.map(u => [u.placa, descripcionCamion(porPlaca.get(placaLimpia(u.placa)), u.tipo)]));
  }, [placas.data, unidades]);

  const cambiarAgrupar = (v: Agrupar) => {
    haptic('selection');
    setAgrupar(v);
    try { localStorage.setItem(CLAVE_AGRUPAR, v); } catch { /* sin almacenamiento */ }
  };
  const cambiarBase = useCallback((b: BaseMapa) => {
    haptic('selection');
    setBase(b);
    try { localStorage.setItem('fleet_gps_base', b); } catch { /* sin almacenamiento */ }
  }, []);

  const grupos = useMemo(() => {
    const ordenadas = (us: UnidadMapa[]) => [...us].sort((a, b) => ORDEN[estadoUnidad(a, ahora)] - ORDEN[estadoUnidad(b, ahora)] || a.placa.localeCompare(b.placa));
    if (agrupar === 'individual') return [{ clave: 'todas', nombre: 'Todas las unidades', units: ordenadas(lista), plana: true }];
    const m = new Map<string, { clave: string; nombre: string; units: UnidadMapa[]; plana?: boolean }>();
    for (const u of lista) {
      const clave = claveEmpresa(u.empresa) || 'OTRAS';
      const g = m.get(clave) ?? { clave, nombre: empresas.find(e => e.clave === clave)?.nombre ?? 'Otras unidades', units: [] };
      g.units.push(u);
      m.set(clave, g);
    }
    return [...m.values()].map(g => ({ ...g, units: ordenadas(g.units) })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, empresas, agrupar, Math.floor(ahora / 5000)]);

  const cifras = useMemo(() => {
    let conSenal = 0;
    let enMovimiento = 0;
    for (const u of delEmpresa) {
      const e = estadoUnidad(u, ahora);
      if (e !== 'sin_senal') conSenal++;
      if (e === 'movimiento') enMovimiento++;
    }
    return { total: delEmpresa.length, conSenal, enMovimiento, sinSenal: delEmpresa.length - conSenal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delEmpresa, Math.floor(ahora / 5000)]);

  const enLista = lista.length;
  const visiblesEnMapa = lista.filter(u => u.lat != null && !ocultas.has(u.placa)).length;
  const todasVisibles = lista.length > 0 && lista.every(u => !ocultas.has(u.placa));
  const visibles = useMemo(() => new Set(lista.filter(u => !ocultas.has(u.placa)).map(u => u.placa)), [lista, ocultas]);
  const seleccion = unidades.find(u => u.placa === seleccionada) ?? null;
  // Con búsqueda, el mapa se acerca a lo encontrado (hasta 25 unidades)
  const encuadrarA = useMemo(() => (busqueda.trim() && lista.length <= 25 ? lista.map(u => u.placa) : []), [busqueda, lista]);

  // Historial: solo se pide cuando el panel de historial está abierto
  const abiertoHistorial = panel === 'historial' && seleccion ? seleccion : null;
  const historialQ = useHistorial(abiertoHistorial?.placa ?? null, abiertoHistorial?.id ?? null, { horas, dia, desde, hasta });
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

  const conductorDe = (placa: string) => {
    const c = disp.data?.find(d => placaLimpia(d.placa_camion || '') === placa || placaLimpia(d.placa_carreta || '') === placa)?.conductor_asignado;
    return c && c.trim() && !/sin asignar/i.test(c) ? c : null;
  };

  // Alertas en pantalla (sin enviar nada fuera): se quitan solas a los 14 s
  const conductorRef = useRef(conductorDe);
  conductorRef.current = conductorDe;
  const nuevaAlerta = useCallback((a: Alerta) => {
    setTotalAlertas(n => n + 1);
    setAlertas(prev => [a, ...prev].slice(0, 4));
    setTimeout(() => setAlertas(prev => prev.filter(x => x.id !== a.id)), 14000);
  }, []);

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
  const elegir = useCallback((placa: string | null) => {
    if (placa) haptic('selection');
    setSeleccionada(placa);
    setPanel('ficha');
    setIndice(0);
    setReproduciendo(false);
    setHojaFicha(false);
    setHojaLista(false);
  }, []);
  const cerrarPanel = () => {
    elegir(null);
  };

  // Escape: sale de la cámara piloto; si no, cierra la ficha
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (piloto) motor?.setFollow(false); else if (seleccionada) elegir(null);
    };
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  }, [piloto, seleccionada, motor, elegir]);

  const kpis = [
    { clave: 'todos', label: 'Flota monitoreada', valor: cifras.total, color: 'var(--cyan)' },
    { clave: 'senal', label: 'Con señal GPS', valor: cifras.conSenal, color: ST.mov.c },
    { clave: 'movimiento', label: 'En movimiento', valor: cifras.enMovimiento, color: ST.ral.c },
    { clave: 'sin_senal', label: 'Sin señal', valor: cifras.sinSenal, color: ST.off.c },
  ] as const;
  const activos = (empresa !== 'TODAS' ? 1 : 0) + (segmento !== 'todos' ? 1 : 0);
  const conteoSeg = (s: Segmento) => delEmpresa.filter(u => coincideSegmento(u, s)).length;

  const filaUnidad = (u: UnidadMapa) => {
    const estado = estadoUnidad(u, ahora);
    const c = ST[CLASE[estado]];
    return (
      <li key={u.placa} className="tg-unit" data-sel={seleccionada === u.placa}>
        <input type="checkbox" className="tg-unit__check" checked={!ocultas.has(u.placa)} onChange={() => alternarUnidad(u.placa)} aria-label={`Mostrar ${u.placa} en el mapa`} />
        <button type="button" className="tg-unit__b" role="option" aria-selected={seleccionada === u.placa} onClick={() => elegir(u.placa)}>
          <span className="dot" style={{ background: c.c, boxShadow: `0 0 10px ${c.c}` }} />
          <span className="pl">{u.placa}</span>
          <span className="sp" style={{ color: estado === 'movimiento' && u.velocidad > 90 ? ST.off.c : 'inherit' }}>
            {estado === 'sin_senal' ? <small>sin señal</small> : <>{Math.round(u.velocidad)}<small> km/h</small></>}
          </span>
          <span className="sub">{c.l} · {corta(u.empresa)}{u.ubicacion ? ` · ${u.ubicacion}` : ''}</span>
        </button>
      </li>
    );
  };

  return (
    <Page wide fill>
      {isLoading ? <PageLoader variante="camion" /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div className="tg" data-tema={oscuro ? 'noche' : 'day'} data-ficha={seleccion ? 'si' : 'no'} data-piloto={piloto ? 'si' : 'no'}
          data-hoja={hojaLista ? 'full' : ''} data-det={hojaFicha ? 'full' : ''}>
          <Suspense fallback={<div className="tg-cargando">Cargando mapa…</div>}>
            <UbicacionMapa unidades={unidades} descs={descs} visibles={visibles} seleccionada={seleccionada}
              hojaAbierta={!!seleccion} encuadreVersion={0} encuadrarA={encuadrarA}
              historial={historial ?? null} indice={indice} onElegir={elegir} onAlerta={nuevaAlerta} onPiloto={setPiloto}
              tema={tema} base={base} onBase={cambiarBase}>
              <header className="tg-top">
                <div className="tg-brand tg-glass">
                  <span className="tg-eyebrow">Flota · Telemetría</span>
                  <h1>Ubicación GPS</h1>
                  <span className="tg-live" aria-live="polite"><i />En vivo{segundos !== null && ` · ${segundos}s`}</span>
                  <button type="button" className="tg-refrescar" aria-label="Actualizar" title="Actualizar" disabled={isFetching} onClick={() => refetch()}>
                    <RefreshCw size={16} />
                  </button>
                </div>
                <div className="tg-kpis">
                  {kpis.map(k => (
                    <button key={k.clave} type="button" className="tg-kpi tg-glass" aria-pressed={segmento === k.clave}
                      onClick={() => { haptic('selection'); setSegmento(s => (s === k.clave && k.clave !== 'todos' ? 'todos' : k.clave)); }}>
                      <span><i style={{ background: k.color, boxShadow: `0 0 8px ${k.color}` }} />{k.label}</span>
                      <b>{k.valor}</b>
                    </button>
                  ))}
                  <div className="tg-kpi tg-glass" style={{ cursor: 'default' }}>
                    <span><i style={{ background: 'var(--orange)' }} />Alertas</span><b>{totalAlertas}</b>
                  </div>
                </div>
              </header>

              <aside className="tg-side tg-glass" aria-label="Unidades">
                <div className="tg-side-h">
                  <Grab onToggle={abrir => setHojaLista(h => (abrir === undefined ? !h : abrir))} />
                  <label className="tg-search">
                    <Search size={16} aria-hidden />
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por placa o nombre…" aria-label="Buscar unidad"
                      onFocus={() => { if (matchMedia('(max-width:900px)').matches) setHojaLista(true); }} />
                  </label>
                  <div className="tg-chips">
                    <button type="button" className="tg-chip" aria-pressed={activos > 0} onClick={() => setFiltrando(true)}>
                      <SlidersHorizontal size={13} aria-hidden />Filtros{activos > 0 && <em>{activos}</em>}
                    </button>
                    <button type="button" className="tg-chip" aria-pressed={agrupar === 'empresa'} onClick={() => cambiarAgrupar('empresa')}>Empresa</button>
                    <button type="button" className="tg-chip" aria-pressed={agrupar === 'individual'} onClick={() => cambiarAgrupar('individual')}>Individual</button>
                    <label className="tg-visibles">
                      <input type="checkbox" checked={todasVisibles} onChange={alternarTodas} disabled={!lista.length} />
                      <span>Visibles ({visiblesEnMapa}/{enLista})</span>
                    </label>
                  </div>
                </div>
                <ul className="tg-list" role="listbox" aria-label="Lista de unidades">
                  {grupos.map(g => {
                    if (g.plana) {
                      return <li key={g.clave}><ul className="tg-grupo__unidades">{g.units.map(filaUnidad)}</ul></li>;
                    }
                    const visiblesGrupo = g.units.filter(u => !ocultas.has(u.placa)).length;
                    const todasGrupo = visiblesGrupo === g.units.length;
                    const ningunaGrupo = visiblesGrupo === 0;
                    const abierto = !colapsados.has(g.clave);
                    return (
                      <li key={g.clave}>
                        <div className="tg-grupo__cab">
                          <input type="checkbox" className="tg-grupo__check" checked={todasGrupo}
                            ref={el => { if (el) el.indeterminate = !todasGrupo && !ningunaGrupo; }}
                            onChange={() => alternarGrupo(g.units)} aria-label={`Mostrar el grupo ${g.nombre} en el mapa`} />
                          <button type="button" className="tg-grupo__titulo" aria-expanded={abierto} onClick={() => alternarColapso(g.clave)}>
                            <ChevronDown size={14} aria-hidden />
                            <span>{g.nombre}</span>
                            <span className="tg-grupo__conteo">{visiblesGrupo}/{g.units.length}</span>
                          </button>
                        </div>
                        {abierto && <ul className="tg-grupo__unidades">{g.units.map(filaUnidad)}</ul>}
                      </li>
                    );
                  })}
                  {!lista.length && <li><p className="tg-vacio">Sin unidades con ese filtro.</p></li>}
                </ul>
              </aside>

              {seleccion && (
                <section className="tg-detail tg-glass" aria-label={panel === 'ficha' ? `Ficha de ${seleccion.placa}` : `Historial de ${seleccion.placa}`}>
                  {panel === 'ficha' ? (
                    <FichaTelemetria u={seleccion} motor={motor} conductor={conductorDe(seleccion.placa)} piloto={piloto}
                      onCerrar={cerrarPanel} onHistorial={() => { haptic('selection'); setPanel('historial'); }}
                      onToggleHoja={abrir => setHojaFicha(h => (abrir === undefined ? !h : abrir))} />
                  ) : (
                    <PanelHistorial placa={seleccion.placa} horas={horas}
                      onHoras={setHoras} dia={dia} onDia={d => { setDia(d); setDesde(null); setHasta(null); }} desde={desde} hasta={hasta} onRango={(a, b) => { setDesde(a); setHasta(b); setDia(null); }} onIrA={(lat, lng) => motor?.irA(lat, lng)} historial={historial} cargando={historialQ.isFetching && !historial}
                      error={errorHistorial} indice={indice} onIndice={i => { setIndice(i); setReproduciendo(false); }}
                      reproduciendo={reproduciendo} onReproducir={() => setReproduciendo(r => !r)}
                      onReiniciar={() => { setIndice(0); setReproduciendo(false); }}
                      velocidad={velocidad} onVelocidad={setVelocidad}
                      onSalir={() => { setPanel('ficha'); setReproduciendo(false); }} />
                  )}
                </section>
              )}

              {piloto && seleccion && (
                <div className="tg-pilot tg-glass">
                  <span>Cámara piloto · <b>{seleccion.placa}</b></span>
                  <PilotoVelocidad motor={motor} placa={seleccion.placa} />
                  <button type="button" className="tg-btn" style={{ height: 32, padding: '0 12px' }} onClick={() => motor?.setFollow(false)}>Salir</button>
                </div>
              )}

              <div className="tg-alerts" aria-live="polite">
                {alertas.map(a => (
                  <button key={a.id} type="button" className="tg-alert tg-glass" onClick={() => elegir(a.placa)}>
                    <i style={{ background: a.color + '22', color: a.color }}>{a.icono}</i>
                    <div><b>{a.placa} · {a.msg}</b><span>{[conductorRef.current(a.placa), a.hora].filter(Boolean).join(' · ')}</span></div>
                  </button>
                ))}
              </div>
            </UbicacionMapa>
          </Suspense>

          <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={activos}
            onLimpiar={() => { setEmpresa('TODAS'); setSegmento('todos'); }} resultado={lista.length} unidad="unidad">
            <GrupoFiltro titulo="Empresa">
              <ChoiceChips label="Empresa" value={empresa} onChange={setEmpresa} options={[{ value: 'TODAS', label: 'Todas' }, ...empresas.map(e => ({ value: e.clave, label: e.nombre }))]} />
            </GrupoFiltro>
            <GrupoFiltro titulo="Estado">
              <ChoiceChips label="Estado" value={segmento} onChange={v => setSegmento(v as Segmento)}
                options={SEGMENTOS.map(s => ({ ...s, label: `${s.label} (${conteoSeg(s.value)})` }))} />
            </GrupoFiltro>
          </HojaFiltros>
        </div>
      )}
    </Page>
  );
}

function PilotoVelocidad({ motor, placa }: { motor: import('./gps/motor').MotorTelemetria | null; placa: string }) {
  const [kmh, setKmh] = useState(0);
  useEffect(() => {
    if (!motor) return;
    const t = setInterval(() => setKmh(motor.leer(placa)?.kmh ?? 0), 500);
    return () => clearInterval(t);
  }, [motor, placa]);
  return <span className="tg-pl-v"><b>{Math.round(kmh)}</b><small>km/h</small></span>;
}
