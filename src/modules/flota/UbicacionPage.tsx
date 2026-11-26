import './flota.css';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Hexagon, MapPin, RefreshCw, Route as IconoRecorrido, Search, SlidersHorizontal, Truck, X } from 'lucide-react';
import { Page } from '../../core/ui/Display';
import { Button, PageLoader } from '../../core/ui/Button';
import { Sheet } from '../../core/ui/Sheet';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { AnimatePresence } from 'motion/react';
import { Notice } from '../../core/ui/Display';
import { Combobox } from '../../core/ui/Combobox';
import { GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { errorMessage } from '../../core/api/client';
import { agruparEmpresas, claveEmpresa } from '../../core/lib/empresa';
import { haptic } from '../../core/lib/haptics';
import { PanelHistorial, type Reciente, type Velocidad } from './UbicacionPlayback';
import { useHistorial } from './UbicacionHistorial';
import { estadoUnidad, useDisponibilidad, useGeocercas, useUnidadesGps, type EstadoUnidad, type UnidadMapa } from './api';
import { usePlacas } from '../placas/api';
import { analizarCombustible, FUEL_CAMBIO_PCT } from './gps/combustible';
import { factorCombustible } from './gps/unidadCombustible';
import { useCombustibleFlota, useEnReserva, useRendimientoFlota, useVigilanciaCombustible } from './gps/combustibleFlota';
import { armarTramos } from './gps/viajes';
import { BarraReproduccion } from './gps/BarraReproduccion';
import { descripcionCamion } from './gps/tipoUnidad';
import { FichaTelemetria } from './gps/FichaTelemetria';
import { TrackPlayer } from './gps/TrackPlayer';
import { AsaHoja, HojaGesto, ZonaArrastre } from './gps/HojaGesto';
import { ST } from './gps/camiones';
import type { TemaMapa } from './gps/estilos';
import { useOscuro } from '../placas/tresd/useOscuro';
import type { Alerta } from './gps/motor';

// El mapa (MapLibre + three.js) pesa: se descarga solo al abrir este módulo
const UbicacionMapa = lazy(() => import('./UbicacionMapa').then(m => ({ default: m.UbicacionMapa })));

// Segmento de la lista: los mismos filtros de estado que la versión actual
type Segmento = 'todos' | 'senal' | 'movimiento' | 'ralenti' | 'detenido' | 'sin_senal' | 'reserva';
const SEGMENTOS: Array<{ value: Segmento; label: string }> = [
  { value: 'todos', label: 'Todas' }, { value: 'senal', label: 'Con señal' }, { value: 'movimiento', label: 'En movimiento' },
  { value: 'ralenti', label: 'Ralentí' }, { value: 'detenido', label: 'Detenido' }, { value: 'sin_senal', label: 'Sin señal' },
  { value: 'reserva', label: 'En reserva' },
];
const coincideSegmento = (u: UnidadMapa, s: Segmento, enReserva: Set<string>) =>
  s === 'todos' || (s === 'reserva' ? enReserva.has(u.placa) : s === 'senal' ? estadoUnidad(u) !== 'sin_senal' : estadoUnidad(u) === s);

type VistaGps = 'unidades' | 'recorrido' | 'geocercas';
function vistaGuardada(): VistaGps {
  try { const v = localStorage.getItem('fleet_gps_vista'); if (v === 'recorrido' || v === 'geocercas') return v; } catch { /* sin almacenamiento */ }
  return 'unidades';
}

type BaseMapa = 'mapa' | 'sat';
function baseGuardada(): BaseMapa {
  try { return localStorage.getItem('fleet_gps_base') === 'sat' ? 'sat' : 'mapa'; } catch { return 'mapa'; }
}

// Alturas de las hojas del celular (px según el alto de la ventana): lista asoma 150 px y abre al 78 %; ficha 46 % y 88 %
const SNAPS_LISTA = (vh: number) => [150, vh * 78];
const ALTO_LISTA = (vh: number) => vh * 78;
const SNAPS_FICHA = (vh: number) => [vh * 46, vh * 88];
const ALTO_FICHA = (vh: number) => vh * 88;
const placaFmt = (p: string) => (/^[A-Z0-9]{6}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p);
const corta = (empresa: string) => claveEmpresa(empresa).split(' ')[0] || '—';
const placaLimpia = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
/** Para buscar: sin tildes, guiones ni espacios, en mayúsculas */
const limpiar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
/** Wialon puede traer varias unidades con la misma placa: se deja la que tiene posición y el mensaje más reciente */
function unicasPorPlaca(lista: UnidadMapa[]): UnidadMapa[] {
  const m = new Map<string, UnidadMapa>();
  for (const u of lista) {
    const a = m.get(u.placa);
    if (!a || (a.lat == null && u.lat != null) || ((a.lat == null) === (u.lat == null) && (u.tPos ?? 0) > (a.tPos ?? 0))) m.set(u.placa, u);
  }
  return [...m.values()];
}
const CLASE: Record<EstadoUnidad, keyof typeof ST> = { movimiento: 'mov', ralenti: 'ral', detenido: 'det', sin_senal: 'off' };
const ORDEN: Record<EstadoUnidad, number> = { movimiento: 0, ralenti: 1, detenido: 2, sin_senal: 3 };

// Ubicación GPS de la flota: telemetría en vivo sobre un mapa MapLibre con unidades en 3D.
// Misma fuente que la versión actual (Wialon); lista, filtros, ficha e historial con reproducción.
export function UbicacionPage() {
  const { data, isLoading, isError, error, dataUpdatedAt, isFetching, refetch } = useUnidadesGps();
  const disp = useDisponibilidad();
  const placas = usePlacas();
  const unidades = useMemo(() => unicasPorPlaca(data ?? []), [data]);
  const [empresa, setEmpresa] = useState('TODAS');
  const [segmento, setSegmento] = useState<Segmento>('todos');
  const [filtrando, setFiltrando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [ocultas, setOcultas] = useState<Set<string>>(() => new Set());
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  // Tres vistas: Unidades (en vivo), Recorrido (historial y reproductor de una unidad) y Geocercas (buscador)
  const [vista, setVista] = useState<VistaGps>(vistaGuardada);
  const [playerAbierto, setPlayerAbierto] = useState(false);
  const [recientes, setRecientes] = useState<Reciente[]>([]);
  const [autoplay, setAutoplay] = useState(false);
  // El recorrido solo se pide y se muestra después de «Ver recorrido» (o de elegir uno de la lista); la X lo quita
  const [consultar, setConsultar] = useState(false);
  const colorSiguiente = useRef(0);
  const panel = vista === 'recorrido' ? 'historial' : 'ficha';
  const [horas, setHoras] = useState(24);
  const [dia, setDia] = useState<string | null>(null);
  const [desde, setDesde] = useState<string | null>(null);
  const [hasta, setHasta] = useState<string | null>(null);
  const [indice, setIndice] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [velocidad, setVelocidad] = useState<Velocidad>(1);
  const [viajeSel, setViajeSel] = useState<number | null>(null);
  // El mapa base (Mapa o Satélite) lo elige la persona; el color claro u oscuro lo define el tema del sistema
  const { oscuro } = useOscuro();
  const [base, setBase] = useState<BaseMapa>(baseGuardada);
  const tema: TemaMapa = base === 'sat' ? 'sat' : oscuro ? 'night' : 'day';
    const [ahora, setAhora] = useState(() => Date.now());
  // Novedades de la flota (pérdida de señal, exceso de velocidad, combustible…): no salen en pantalla, se juntan en la campana
  const [novedades, setNovedades] = useState<Array<Alerta & { leida: boolean }>>([]);
  const [verNovedades, setVerNovedades] = useState(false);
  const [piloto, setPiloto] = useState(false);
  const [hojaLista, setHojaLista] = useState(false);
  const [hojaFicha, setHojaFicha] = useState(false);
  const tgRef = useRef<HTMLDivElement>(null);
  const [motor, setMotor] = useState<import('./gps/motor').MotorTelemetria | null>(null);

  // Las hojas y el panel piloto terminan justo sobre la barra de módulos del ERP: se mide su posición real
  useEffect(() => {
    const ajustar = () => {
      const el = tgRef.current, dock = document.querySelector('.dock');
      if (!el) return;
      if (dock && getComputedStyle(dock).display !== 'none') el.style.setProperty('--tg-dock', `${Math.round(innerHeight - dock.getBoundingClientRect().top)}px`);
      else el.style.removeProperty('--tg-dock');
    };
    ajustar();
    const t = setTimeout(ajustar, 800);
    addEventListener('resize', ajustar);
    return () => { clearTimeout(t); removeEventListener('resize', ajustar); };
  }, [isLoading, isError]);

  // El motor del mapa se crea al cargar el chunk del mapa
  useEffect(() => {
    let vivo = true;
    import('./gps/motor').then(m => { if (vivo) setMotor(m.motorTelemetria()); });
    return () => { vivo = false; };
  }, []);

  const geocercas = useGeocercas();
  useEffect(() => { if (motor && geocercas.data) motor.setGeocercas(geocercas.data); }, [motor, geocercas.data]);

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const segundos = dataUpdatedAt ? Math.max(0, Math.round((ahora - dataUpdatedAt) / 1000)) : null;

  const empresas = useMemo(() => agruparEmpresas(unidades.map(u => u.empresa)), [unidades]);
  const delEmpresa = useMemo(() => unidades.filter(u => empresa === 'TODAS' || claveEmpresa(u.empresa) === empresa), [unidades, empresa]);
  const conductorPorPlaca = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of disp.data ?? []) {
      const c = (d.conductor_asignado || '').trim();
      if (!c || /sin asignar/i.test(c)) continue;
      for (const pl of [d.placa_camion, d.placa_carreta]) if (pl) m.set(placaLimpia(pl), c);
    }
    return m;
  }, [disp.data]);
  // Escribir una placa filtra la lista al instante: sin tildes, guiones ni mayúsculas; busca en placa, nombre en Wialon y conductor
  const q = limpiar(busqueda);
  const capacidades = useMemo(
    () => new Map((placas.data ?? []).map(pl => [placaLimpia(pl.placa), parseFloat(String(pl.capacidadTanque).replace(',', '.')) || [pl.tanque1, pl.tanque2, pl.tanque3].reduce((s, x) => s + (parseFloat(x) || 0), 0) || 0])),
    [placas.data],
  );
  // Combustible de toda la flota: filtro y contador de "En reserva", rendimiento para la autonomía y avisos
  const combustibleFlota = useCombustibleFlota();
  const rendimientos = useRendimientoFlota();
  const enReserva = useEnReserva(combustibleFlota.data, capacidades);
  const lista = useMemo(() => delEmpresa.filter(u =>
    (!q || [u.placa, u.nombre, conductorPorPlaca.get(u.placa) ?? ''].some(t => limpiar(t).includes(q))) && coincideSegmento(u, segmento, enReserva)),
  [delEmpresa, q, segmento, conductorPorPlaca, enReserva]);

  const descs = useMemo(() => {
    const porPlaca = new Map((placas.data ?? []).map(p => [placaLimpia(p.placa), p]));
    return new Map(unidades.map(u => [u.placa, descripcionCamion(porPlaca.get(placaLimpia(u.placa)), u.tipo)]));
  }, [placas.data, unidades]);

  const cambiarBase = useCallback((b: BaseMapa) => {
    haptic('selection');
    setBase(b);
    try { localStorage.setItem('fleet_gps_base', b); } catch { /* sin almacenamiento */ }
  }, []);

  // Una sola lista: en movimiento primero, luego ralentí, detenidas y sin señal
  const ordenada = useMemo(
    () => {
      // Con búsqueda, primero las que empiezan igual y luego las que la contienen
      const rango = (u: UnidadMapa) => (!q ? 0 : u.placa.startsWith(q) ? 0 : u.placa.includes(q) ? 1 : 2);
      return [...lista].sort((a, b) => rango(a) - rango(b) || ORDEN[estadoUnidad(a, ahora)] - ORDEN[estadoUnidad(b, ahora)] || a.placa.localeCompare(b.placa));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lista, q, Math.floor(ahora / 5000)],
  );

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
  // En Recorrido el mapa muestra solo la unidad que se está revisando; en las otras vistas, la lista filtrada
  const visibles = useMemo(() => (vista === 'recorrido' ? new Set(seleccionada ? [seleccionada] : []) : new Set(lista.filter(u => !ocultas.has(u.placa)).map(u => u.placa))), [vista, seleccionada, lista, ocultas]);
  const seleccion = unidades.find(u => u.placa === seleccionada) ?? null;
  // Con búsqueda, el mapa se acerca a lo encontrado (hasta 25 unidades)
  const encuadrarA = useMemo(() => (busqueda.trim() && lista.length <= 25 ? lista.map(u => u.placa) : []), [busqueda, lista]);

  // Historial: solo se pide cuando el panel de historial está abierto
  const abiertoHistorial = panel === 'historial' && seleccion && consultar ? seleccion : null;
  const historialQ = useHistorial(abiertoHistorial?.placa ?? null, abiertoHistorial?.id ?? null, { horas, dia, desde, hasta });
  const historial = abiertoHistorial ? historialQ.data : undefined;
  const claveActiva = abiertoHistorial ? `${abiertoHistorial.placa}|${dia ?? (desde && hasta ? `${desde}>${hasta}` : `h${horas}`)}` : null;
  const capacidadSel = (seleccion && capacidades.get(placaLimpia(seleccion.placa))) || null;
  // Sensor en % directo, o en galones/litros pasados a % con la capacidad del tanque de la placa (sin capacidad: en galones)
  const fc = factorCombustible(historial?.unidadCombustible, capacidadSel);
  const analisis = useMemo(() => analizarCombustible(historial, { factor: fc.factor, unidad: fc.unidad }), [historial, fc.factor, fc.unidad]);
  const tramos = useMemo(() => armarTramos(historial, analisis), [historial, analisis]);
  const eventosHist = useMemo(() => {
    const U = analisis.unidad === '%' ? '%' : ' gal';
    return {
      eventos: analisis.eventos.map(e => ({ lat: e.lat, lng: e.lng, tip: `${e.tipo === 'caida' ? 'Caída de combustible' : 'Recarga'} · ${e.desde}${U} → ${e.hasta}${U}` })),
      paradasBaja: [...analisis.paradas.values()].filter(n => n.antes != null && n.despues != null && n.antes - n.despues >= FUEL_CAMBIO_PCT).map(n => n.startT),
      viajes: tramos.flatMap(t => (t.tipo === 'viaje' ? [t.viaje.rango] : [])),
    };
  }, [analisis, tramos]);
  const errorHistorial = historialQ.error ? errorMessage(historialQ.error) : '';

  // Datos nuevos o rango nuevo: se vuelve al inicio del recorrido
  useEffect(() => {
    setIndice(0);
    setReproduciendo(false);
    setViajeSel(null);
  }, [historial]);

  // Reproducción: a 1x avanza un punto cada 300 ms; con 5x, 10x y 100x salta varios puntos por cada paso de 50 ms
  useEffect(() => {
    if (!reproduciendo || !historial) return;
    let acum = 0;
    const t = setInterval(() => {
      acum += velocidad * 50 / 300;
      const n = Math.floor(acum);
      if (!n) return;
      acum -= n;
      setIndice(i => {
        if (i >= historial.puntos.length - 1) { setReproduciendo(false); return i; }
        return Math.min(historial.puntos.length - 1, i + n);
      });
    }, 50);
    return () => clearInterval(t);
  }, [reproduciendo, velocidad, historial]);

  // Cada recorrido consultado queda en la lista (hasta 8), con sus km; se actualiza mientras los días van llegando
  useEffect(() => {
    if (!abiertoHistorial || !historial) return;
    const hoyL = new Date(); const aIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hoyS = aIso(hoyL), ayerS = aIso(new Date(hoyL.getTime() - 86400000));
    const corta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
    const clave = `${abiertoHistorial.placa}|${dia ?? (desde && hasta ? `${desde}>${hasta}` : `h${horas}`)}`;
    const etiqueta = dia ? (dia === hoyS ? 'Hoy' : dia === ayerS ? 'Ayer' : `${corta(dia)}/${dia.slice(0, 4)}`) : desde && hasta ? `${corta(desde)} – ${corta(hasta)}` : `Últimas ${horas} h`;
    setRecientes(prev => {
      const i = prev.findIndex(r => r.clave === clave);
      if (i >= 0) return prev.map((r, k) => (k === i ? { ...r, km: historial.metricas.totalKm } : r));
      const PALETA = ['#2563eb', '#16a34a', '#f97316', '#9333ea', '#e11d48', '#0891b2', '#ca8a04', '#475569'];
      const color = PALETA[colorSiguiente.current++ % PALETA.length];
      return [{ clave, placa: abiertoHistorial.placa, etiqueta, dia, desde, hasta, horas, km: historial.metricas.totalKm, color }, ...prev].slice(0, 8);
    });
  }, [abiertoHistorial, historial, dia, desde, hasta, horas]);
  const aplicarReciente = useCallback((r: Reciente) => {
    if (r.placa !== seleccionada) { setSeleccionada(r.placa); setIndice(0); setReproduciendo(false); }
    setHoras(r.horas); setDia(r.dia); setDesde(r.desde); setHasta(r.hasta); setConsultar(true);
  }, [seleccionada]);
  // "Reproducir" en la lista: carga ese recorrido y, cuando está listo, arranca
  useEffect(() => {
    if (autoplay && historial && historial.puntos.length > 0 && !historialQ.isFetching) { setReproduciendo(true); setAutoplay(false); }
  }, [autoplay, historial, historialQ.isFetching]);

  // El reproductor se abre al dar play y se cierra al salir de Recorrido o cambiar de unidad
  useEffect(() => { if (reproduciendo) setPlayerAbierto(true); }, [reproduciendo]);
  useEffect(() => { setPlayerAbierto(false); }, [vista, seleccionada]);

  const cambiarVista = useCallback((v: VistaGps) => {
    haptic('selection');
    setVista(v);
    setConsultar(false);
    setReproduciendo(false);
    try { localStorage.setItem('fleet_gps_vista', v); } catch { /* sin almacenamiento */ }
  }, []);

  const conductorDe = (placa: string) => conductorPorPlaca.get(placa) ?? null;

  const sinLeer = novedades.filter(n => !n.leida).length;
  const nuevaAlerta = useCallback((a: Alerta) => {
    setNovedades(prev => [{ ...a, leida: false }, ...prev].slice(0, 100));
  }, []);
  useVigilanciaCombustible(combustibleFlota.data, capacidades, unidades, nuevaAlerta);

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
  const elegir = useCallback((placa: string | null) => {
    if (placa) haptic('selection');
    setSeleccionada(placa);
    setConsultar(false);
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

  const opcionesUnidad = useMemo(() => [...unidades].sort((a, b) => a.placa.localeCompare(b.placa)).map(u => ({ value: u.placa, label: placaFmt(u.placa), description: [u.nombre, corta(u.empresa)].filter(Boolean).join(' · ') })), [unidades]);
  const activos = (empresa !== 'TODAS' ? 1 : 0) + (segmento !== 'todos' ? 1 : 0);
  const conteoSeg = (s: Segmento) => delEmpresa.filter(u => coincideSegmento(u, s, enReserva)).length;

  // Un clic elige la unidad; otro clic sobre la misma la vuelve a centrar donde está ahora (si se movió, la sigue)
  const clicUnidad = (placa: string) => {
    if (seleccionada === placa) { haptic('selection'); motor?.centrarSeleccion(); } else elegir(placa);
  };
  const filaUnidad = (u: UnidadMapa) => {
    const estado = estadoUnidad(u, ahora);
    const c = ST[CLASE[estado]];
    const exceso = estado === 'movimiento' && u.velocidad > 90;
    return (
      <li key={u.placa} className="tg-unit" data-sel={seleccionada === u.placa} data-estado={estado}>
        <label className="tg-unit__sel"><input type="checkbox" className="tg-unit__check" checked={!ocultas.has(u.placa)} onChange={() => alternarUnidad(u.placa)} aria-label={`Mostrar ${u.placa} en el mapa`} /></label>
        <button type="button" className="tg-unit__b" role="option" aria-selected={seleccionada === u.placa} onClick={() => clicUnidad(u.placa)}
          title={seleccionada === u.placa ? 'Clic para centrar la unidad donde está ahora' : 'Ver unidad'}>
          <span className="tg-unit__riel" style={{ background: c.c }} aria-hidden />
          <span className="tg-unit__cuerpo">
            <span className="tg-unit__l1">
              <span className="pl"><LicensePlate plate={placaFmt(u.placa)} size="sm" /></span>
              <span className="tg-pill" style={{ color: c.c, background: c.c + '22' }}>{c.l}</span>
              {enReserva.has(u.placa) && <span className="tg-pill tg-pill--reserva" title="Combustible en reserva (20 % o menos)">⛽ Reserva</span>}
            </span>
            <span className="sub"><MapPin size={11} aria-hidden />{u.ubicacion || u.nombre || 'Sin dirección'}</span>
            <span className="tg-unit__l3">{corta(u.empresa)}{u.tipo ? ` · ${u.tipo}` : ''}</span>
          </span>
          <span className="sp" style={{ color: exceso ? ST.off.c : undefined }}>
            {estado === 'sin_senal' ? <small>sin señal</small> : <><b>{Math.round(u.velocidad)}</b><small>km/h</small></>}
          </span>
        </button>
      </li>
    );
  };

  return (
    <Page wide fill>
      {isLoading ? <PageLoader variante="camion" /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div className="tg" ref={tgRef} data-tema={oscuro ? 'noche' : 'day'} data-ficha={vista === 'unidades' && seleccion ? 'si' : 'no'} data-piloto={piloto ? 'si' : 'no'}
          data-hist={panel === 'historial' && seleccion ? 'si' : 'no'} data-hoja={hojaLista ? 'full' : ''} data-det={hojaFicha ? 'full' : ''}>
          <Suspense fallback={<div className="tg-cargando">Cargando mapa…</div>}>
            <UbicacionMapa unidades={unidades} descs={descs} visibles={visibles} seleccionada={seleccionada}
              hojaAbierta={!!seleccion} encuadreVersion={0} encuadrarA={encuadrarA}
              historial={historial ?? null} eventosHist={eventosHist} viajeSel={viajeSel} indice={indice} onElegir={elegir} onAlerta={nuevaAlerta} onPiloto={setPiloto}
              tema={tema} base={base} onBase={cambiarBase} geocercas={geocercas.data ?? []} vista={vista} onVista={cambiarVista}>
              <header className="tg-top">
                <div className="tg-brand tg-glass">
                  <span className="tg-eyebrow">Flota · Telemetría</span>
                  <h1>Ubicación GPS</h1>
                  <span className="tg-live" aria-live="polite"><i />En vivo{segundos !== null && ` · ${segundos}s`}</span>
                  <span className="tg-resumen">{cifras.total} unidades · {cifras.enMovimiento} en movimiento · {cifras.sinSenal} sin señal</span>
                  <Button variant="plain" iconOnly className="tg-campana" icon={<Bell size={18} />} aria-label={sinLeer ? `Novedades, ${sinLeer} sin leer` : 'Novedades'} title="Novedades" onClick={() => setVerNovedades(true)} />
                  {sinLeer > 0 && <span className="tg-campana__n t-numeric" aria-hidden>{sinLeer > 99 ? '99+' : sinLeer}</span>}
                  <Button variant="plain" iconOnly className="tg-refrescar" icon={<RefreshCw size={18} />} aria-label="Actualizar" title="Actualizar" disabled={isFetching} onClick={() => refetch()} />
                </div>
                <nav className="tg-tabs tg-glass" role="tablist" aria-label="Vistas de ubicación">
                  {([['unidades', 'Unidades', <Truck key="u" size={16} />], ['recorrido', 'Recorrido', <IconoRecorrido key="r" size={16} />], ['geocercas', 'Geocercas', <Hexagon key="g" size={16} />]] as const).map(([v, nombre, icono]) => (
                    <button key={v} type="button" role="tab" className="tg-tab" aria-selected={vista === v} onClick={() => cambiarVista(v)}>{icono}<span>{nombre}</span></button>
                  ))}
                </nav>
              </header>

              {vista === 'unidades' && <HojaGesto className="tg-side tg-glass" label="Unidades" snaps={SNAPS_LISTA} alto={ALTO_LISTA}
                snap={seleccion || piloto ? -1 : hojaLista ? 1 : 0} onSnap={i => setHojaLista(i === 1)}>
                <ZonaArrastre className="tg-side-h">
                  <AsaHoja />
                  <label className="tg-search">
                    <Search size={16} aria-hidden />
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar placa, nombre o conductor…" aria-label="Buscar unidad" autoComplete="off" spellCheck={false}
                      onKeyDown={e => { if (e.key === 'Enter' && ordenada[0]) { e.preventDefault(); elegir(ordenada[0].placa); } }}
                      onFocus={() => { if (matchMedia('(max-width:900px)').matches) setHojaLista(true); }} />
                    {busqueda && <Button variant="plain" size="sm" iconOnly className="tg-search__x" icon={<X size={16} />} aria-label="Borrar búsqueda" onClick={() => setBusqueda('')} />}
                  </label>
                  {q && <p className="tg-resultados" aria-live="polite">{lista.length === 1 ? '1 resultado' : `${lista.length} resultados`}</p>}
                  <div className="tg-chips">
                    <Button variant="secondary" size="sm" aria-pressed={activos > 0} icon={<SlidersHorizontal size={15} aria-hidden />} onClick={() => setFiltrando(true)}>
                      Filtros{activos > 0 && <em>{activos}</em>}
                    </Button>
                    <label className="tg-visibles">
                      <input type="checkbox" checked={todasVisibles} onChange={alternarTodas} disabled={!lista.length} />
                      <span>Visibles ({visiblesEnMapa}/{enLista})</span>
                    </label>
                  </div>
                </ZonaArrastre>
                <ul className="tg-list" role="listbox" aria-label="Lista de unidades">
                  {ordenada.map(filaUnidad)}
                  {!lista.length && <li><p className="tg-vacio">Sin unidades con ese filtro.</p></li>}
                </ul>
              </HojaGesto>}

              <AnimatePresence>
              {vista === 'unidades' && seleccion && (
                <HojaGesto key="ficha" className="tg-detail tg-glass" label={panel === 'ficha' ? `Ficha de ${seleccion.placa}` : `Historial de ${seleccion.placa}`}
                  snaps={SNAPS_FICHA} alto={ALTO_FICHA} snap={piloto ? -1 : hojaFicha ? 1 : 0} onSnap={i => setHojaFicha(i === 1)}>
                  {panel === 'ficha' ? (
                    <FichaTelemetria u={seleccion} motor={motor} conductor={conductorDe(seleccion.placa)} piloto={piloto} capacidad={capacidadSel} rendimiento={rendimientos.data?.get(placaLimpia(seleccion.placa)) ?? null}
                      onCerrar={cerrarPanel} onHistorial={() => { setHojaFicha(false); cambiarVista('recorrido'); }} />
                  ) : null}
                </HojaGesto>
              )}
              </AnimatePresence>

              {vista === 'recorrido' && (
                <HojaGesto className="tg-side tg-side--rec tg-glass" label="Recorrido" snaps={SNAPS_LISTA} alto={ALTO_LISTA} snap={hojaLista ? 1 : 0} onSnap={i => setHojaLista(i === 1)}>
                  <ZonaArrastre className="tg-side-h">
                    <AsaHoja />
                    <p className="tg-rec-titulo">Recorrido de una unidad</p>
                    <Combobox options={opcionesUnidad} value={seleccionada} onChange={v => elegir(v)} placeholder="Elige la placa…" enHoja compacta tituloHoja="Unidad" />
                  </ZonaArrastre>
                  <div className="tg-rec-cuerpo">
                    {seleccion ? (
                    <PanelHistorial placa={seleccion.placa} horas={horas} analisis={analisis} tramos={tramos} viajeSel={viajeSel} onViaje={setViajeSel}
                      onHoras={setHoras} dia={dia} onDia={d => { setDia(d); setDesde(null); setHasta(null); setConsultar(true); }} desde={desde} hasta={hasta} onRango={(a, b) => { setDesde(a); setHasta(b); setDia(null); setConsultar(true); }} onIrA={(lat, lng) => motor?.irA(lat, lng)} historial={historial} cargando={historialQ.isFetching && !historial}
                      error={errorHistorial} progreso={historialQ.progreso}
                      recientes={recientes} recienteActiva={claveActiva}
                      onReciente={aplicarReciente} onReproducirReciente={r => { aplicarReciente(r); setAutoplay(true); }} onQuitarReciente={k => { setRecientes(prev => prev.filter(r => r.clave !== k)); if (k === claveActiva) { setConsultar(false); setReproduciendo(false); setPlayerAbierto(false); } }} indice={indice} onIndice={i => { setIndice(i); setReproduciendo(false); }}
                      reproduciendo={reproduciendo} onReproducir={() => setReproduciendo(r => !r)}
                      onReiniciar={() => { setIndice(0); setReproduciendo(false); }}
                      velocidad={velocidad} onVelocidad={setVelocidad}
                      onSalir={() => { setConsultar(false); setReproduciendo(false); setPlayerAbierto(false); }} activo={!!abiertoHistorial} />
                    ) : <p className="tg-vacio">Elige una unidad para ver su recorrido: ruta, paradas, viajes y reproducción con la calle y los sensores.</p>}
                  </div>
                </HojaGesto>
              )}

              {vista === 'recorrido' && playerAbierto && historial && seleccion && historial.puntos.length > 0 && (
                <TrackPlayer placa={seleccion.placa} unitId={seleccion.id} historial={historial} indice={indice} reproduciendo={reproduciendo} onCerrar={() => setPlayerAbierto(false)} />
              )}

              {panel === 'historial' && historial && historial.puntos.length > 0 && (
                <BarraReproduccion historial={historial} analisis={analisis} indice={indice} onIndice={i => { setIndice(i); setReproduciendo(false); }}
                  reproduciendo={reproduciendo} onReproducir={() => setReproduciendo(r => !r)} onReiniciar={() => { setIndice(0); setReproduciendo(false); }}
                  velocidad={velocidad} onVelocidad={setVelocidad} />
              )}

              {piloto && seleccion && (
                <div className="tg-pilot tg-glass">
                  <span className="tg-pl-t"><span>Cámara piloto · <b>{seleccion.placa}</b></span><PilotoEdad motor={motor} placa={seleccion.placa} /></span>
                  <PilotoVelocidad motor={motor} placa={seleccion.placa} />
                  <Button variant="secondary" size="sm" onClick={() => motor?.setFollow(false)}>Salir</Button>
                </div>
              )}
            </UbicacionMapa>
          </Suspense>

          <Sheet open={verNovedades} onClose={() => setVerNovedades(false)} title={`Novedades${sinLeer ? ` · ${sinLeer} sin leer` : ''}`}
            footer={<>
              <Button variant="secondary" onClick={() => setVerNovedades(false)}>Cerrar</Button>
              <Button variant="primary" disabled={sinLeer === 0} onClick={() => setNovedades(prev => prev.map(n => ({ ...n, leida: true })))}>Marcar todo como leído</Button>
            </>}>
            {novedades.length === 0 ? <p className="tg-nov-vacio">Sin novedades por ahora. Aquí se juntan las pérdidas de señal, excesos de velocidad y alertas de combustible.</p> : (
              <ul className="tg-nov">
                {novedades.map(n => (
                  <li key={n.id}>
                    <button type="button" className="tg-nov__item" data-leida={n.leida} onClick={() => { setNovedades(prev => prev.map(x => (x.id === n.id ? { ...x, leida: true } : x))); setVerNovedades(false); elegir(n.placa); }}>
                      <i style={{ background: `${n.color}22`, color: n.color }}>{n.icono}</i>
                      <span><b>{n.placa} · {n.msg}</b><small>{[conductorDe(n.placa), n.hora].filter(Boolean).join(' · ')}</small></span>
                      {!n.leida && <em className="tg-nov__punto" aria-label="Sin leer" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Sheet>

          <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={activos}
            onLimpiar={() => { setEmpresa('TODAS'); setSegmento('todos'); }} resultado={lista.length} unidad="unidad">
            <GrupoFiltro titulo="Empresa">
              <Combobox enHoja compacta tituloHoja="Empresa" placeholder="Todas las empresas" value={empresa} onChange={v => setEmpresa(v ?? 'TODAS')}
                options={[{ value: 'TODAS', label: 'Todas las empresas' }, ...empresas.map(e => ({ value: e.clave, label: e.nombre }))]} />
            </GrupoFiltro>
            <GrupoFiltro titulo="Estado">
              <Combobox enHoja compacta tituloHoja="Estado" placeholder="Todas" value={segmento} onChange={v => setSegmento((v ?? 'todos') as Segmento)}
                options={SEGMENTOS.map(s => ({ value: s.value, label: s.label, description: `${conteoSeg(s.value)} ${conteoSeg(s.value) === 1 ? 'unidad' : 'unidades'}` }))} />
            </GrupoFiltro>
          </HojaFiltros>
        </div>
      )}
    </Page>
  );
}

function PilotoVelocidad({ motor, placa }: { motor: import('./gps/motor').MotorTelemetria | null; placa: string }) {
  const [lec, setLec] = useState<{ kmh: number; edadS: number | null }>({ kmh: 0, edadS: null });
  useEffect(() => {
    if (!motor) return;
    const t = setInterval(() => { const l = motor.leer(placa); setLec({ kmh: l?.kmh ?? 0, edadS: l?.edadS ?? null }); }, 500);
    return () => clearInterval(t);
  }, [motor, placa]);
  return (
    <span className="tg-pl-v"><b>{Math.round(lec.kmh)}</b><small>km/h</small>
      {lec.edadS != null && <small className="tg-pl-edad tg-pl-edad--lado" title="Último mensaje del equipo GPS">· GPS hace {lec.edadS} s</small>}</span>
  );
}

/** Celular: "hace X s" bajo la placa, en una sola línea (en escritorio va al lado de la velocidad) */
function PilotoEdad({ motor, placa }: { motor: import('./gps/motor').MotorTelemetria | null; placa: string }) {
  const [edad, setEdad] = useState<number | null>(null);
  useEffect(() => {
    if (!motor) return;
    const t = setInterval(() => setEdad(motor.leer(placa)?.edadS ?? null), 500);
    return () => clearInterval(t);
  }, [motor, placa]);
  return edad != null ? <small className="tg-pl-edad tg-pl-edad--abajo" title="Último mensaje del equipo GPS">último mensaje hace {edad} s</small> : null;
}
