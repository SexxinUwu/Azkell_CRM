// Mapa de telemetría en vivo (MapLibre + camiones en 3D). El mapa y la escena viven en gps/motor.ts, fuera de React:
// aquí solo se conecta con los datos, y se dibujan los controles flotantes (herramientas, estilo, cámara piloto y alertas).
import 'maplibre-gl/dist/maplibre-gl.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/barlow-condensed/700.css';
import './gps/telemetria.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motorTelemetria, type Alerta, type EntradaMotor, type MotorTelemetria, type OpcionesMapa } from './gps/motor';
import { ST, type ClaseEstado, type DescCamion } from './gps/camiones';
import type { TemaMapa } from './gps/estilos';
import { HAY_TRAFICO } from './gps/mapaConfig';
import type { UnidadMapa } from './api';
import type { Historial } from './UbicacionHistorial';

export const COLOR_ESTADO = { movimiento: ST.mov.c, ralenti: ST.ral.c, detenido: ST.det.c, sin_senal: ST.off.c };
export type { Alerta, ClaseEstado };

interface Props {
  unidades: UnidadMapa[];
  descs: Map<string, DescCamion>;
  /** Placas que se dibujan (filtro de la lista y casilla de visibles) */
  visibles: Set<string>;
  seleccionada: string | null;
  /** Hay una hoja inferior abierta (celular): la unidad se ubica arriba de ella */
  hojaAbierta: boolean;
  /** Cada vez que cambia, el mapa encuadra toda la flota visible */
  encuadreVersion: number;
  /** Placas buscadas: el mapa se acerca a ellas */
  encuadrarA: string[];
  historial: Historial | null;
  /** Caídas y recargas de combustible que se marcan sobre la ruta */
  eventosHist?: { eventos: Array<{ lat: number; lng: number; tip: string }>; paradasBaja: number[]; viajes: Array<[number, number]> };
  /** Viaje resaltado en el mapa (índice) o null */
  viajeSel?: number | null;
  indice: number;
  onElegir: (placa: string | null) => void;
  onAlerta: (a: Alerta) => void;
  onPiloto: (on: boolean) => void;
  /** Estilo efectivo (Noche, Día o Satélite); Noche y Día salen del tema del sistema */
  tema: TemaMapa;
  base: 'mapa' | 'sat';
  onBase: (b: 'mapa' | 'sat') => void;
  /** Contenido flotante que va encima del mapa (barra superior, lista, ficha) */
  children?: React.ReactNode;
}

const HERRAMIENTAS: Array<{ k: keyof OpcionesMapa | 'overview'; tip: string; movil?: boolean; d: string; extra?: string }> = [
  { k: 'traffic', tip: 'Tráfico en tiempo real', d: 'M10 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 7h.01M12 12h.01M12 17h.01' },
  { k: 'terrain', tip: 'Relieve 3D (más pesado)', d: 'm3 20 6-10 4 6 3-4 5 8z' },
  { k: 'buildings', tip: 'Edificios 3D', d: 'M4 21V8l6-4v17M10 21h10V11l-10-3' },
  { k: 'trails', tip: 'Estelas', d: 'M3 17c4 0 4-6 8-6s4 6 8 6M20 17h.01' },
  { k: 'smooth', tip: 'Movimiento suave (interpolación)', movil: false, d: 'M3 12h4l3-7 4 14 3-7h4' },
  { k: 'models', tip: 'Unidades en 3D al acercar', d: 'M2 15h13V7H2zM15 10h4l3 3v2h-7M6 18h.01M18 18h.01' },
  { k: 'overview', tip: 'Ver toda la flota', d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' },
];
const ESTILOS: Array<{ s: 'mapa' | 'sat'; l: string }> = [{ s: 'mapa', l: 'Mapa' }, { s: 'sat', l: 'Satélite' }];

export function UbicacionMapa(p: Props) {
  const host = useRef<HTMLDivElement>(null);
  const motorRef = useRef<MotorTelemetria | null>(null);
  const [opt, setOpt] = useState<OpcionesMapa | null>(null);
  const cbRef = useRef(p);
  cbRef.current = p;

  // El mapa es uno solo durante la sesión: se crea la primera vez y se reutiliza al volver al módulo
  useEffect(() => {
    const m = motorTelemetria();
    motorRef.current = m;
    m.cb = {
      onSeleccion: placa => cbRef.current.onElegir(placa),
      onAlerta: a => cbRef.current.onAlerta(a),
      onPiloto: on => cbRef.current.onPiloto(on),
    };
    if (host.current) m.montar(host.current);
    m.setTema(cbRef.current.tema);
    setOpt({ ...m.opt });
    return () => { m.desmontar(); };
  }, []);

  const entradas = useMemo<EntradaMotor[]>(() => p.unidades.map(u => ({
    placa: u.placa,
    desc: p.descs.get(u.placa) ?? DESC_BASE,
    lat: u.lat, lng: u.lng, velocidad: u.velocidad, rumbo: u.rumbo, ignicion: u.ignicion, tPos: u.tPos,
  })), [p.unidades, p.descs]);

  useEffect(() => { motorRef.current?.actualizar(entradas); }, [entradas]);
  useEffect(() => { motorRef.current?.setVisibles(p.visibles); }, [p.visibles, entradas]);
  useEffect(() => { motorRef.current?.setTema(p.tema); }, [p.tema]);
  useEffect(() => { motorRef.current?.seleccionar(p.seleccionada, true); }, [p.seleccionada]);
  useEffect(() => { motorRef.current?.setHoja(p.hojaAbierta); }, [p.hojaAbierta]);
  useEffect(() => { if (p.encuadreVersion > 0) motorRef.current?.visionGeneral(); }, [p.encuadreVersion]);
  const claveBusqueda = p.encuadrarA.join('|');
  useEffect(() => { if (claveBusqueda) motorRef.current?.visionGeneral(false, claveBusqueda.split('|')); }, [claveBusqueda]);
  useEffect(() => { motorRef.current?.mostrarHistorial(p.historial, p.eventosHist); }, [p.historial, p.eventosHist]);
  useEffect(() => { motorRef.current?.resaltarViaje(p.viajeSel ?? null); }, [p.viajeSel]);
  useEffect(() => { motorRef.current?.cursorHistorial(p.indice); }, [p.indice, p.historial]);

  const alternar = (k: keyof OpcionesMapa) => {
    const m = motorRef.current;
    if (!m) return;
    const v = k === 'buildings' && p.tema === 'sat' ? !m.opt.buildingsSat : !m.opt[k];
    m.setOpcion(k, v);
    setOpt({ ...m.opt });
  };
  const activo = (k: keyof OpcionesMapa) => !!opt && (k === 'buildings' && p.tema === 'sat' ? opt.buildingsSat : opt[k]);

  return (
    <div className="tg-lienzo">
      <div ref={host} className="tg-host" />
      {p.children}
      <div className="tg-ctrl">
        <div className="tg-tools tg-glass" role="toolbar" aria-label="Herramientas del mapa">
          {HERRAMIENTAS.map(h => (
            <button key={h.k} type="button" data-tip={h.k === 'traffic' && !HAY_TRAFICO ? 'Tráfico: falta la clave VITE_TOMTOM_KEY' : h.tip} aria-label={h.tip} disabled={h.k === 'traffic' && !HAY_TRAFICO} data-ocultar-movil={h.movil === false ? '' : undefined}
              aria-pressed={h.k === 'overview' ? undefined : activo(h.k)}
              onClick={() => (h.k === 'overview' ? motorRef.current?.visionGeneral() : alternar(h.k))}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={h.d} /></svg>
            </button>
          ))}
        </div>
        <div className="tg-seg tg-glass" role="group" aria-label="Estilo del mapa">
          {ESTILOS.map(e => <button key={e.s} type="button" aria-pressed={p.base === e.s} onClick={() => p.onBase(e.s)}>{e.l}</button>)}
        </div>
      </div>
    </div>
  );
}

/** Unidad sin ficha en Placas: camión furgón de colores neutros */
const DESC_BASE: DescCamion = { kind: 'box', trailer: 'furgon', colors: [0xf2f4f7, 0x333a44], larga: false };
