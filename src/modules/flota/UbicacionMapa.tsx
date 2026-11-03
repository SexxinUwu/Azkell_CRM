// Mapa de telemetría en vivo (MapLibre + camiones en 3D). El mapa y la escena viven en gps/motor.ts, fuera de React:
// aquí solo se conecta con los datos, y se dibujan los controles flotantes (herramientas, estilo, cámara piloto y alertas).
import 'maplibre-gl/dist/maplibre-gl.css';
import './gps/telemetria.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
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
  { k: 'traffic', tip: 'Tráfico en tiempo real', d: 'M9 2.5h6a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM12 21.5V23M7 8H4M20 8h-3' },
  { k: 'terrain', tip: 'Relieve 3D (más pesado)', d: 'm3 20 6-10 4 6 3-4 5 8z' },
  { k: 'buildings', tip: 'Edificios 3D', d: 'M4 21V8l6-4v17M10 21h10V11l-10-3' },
  { k: 'trails', tip: 'Estelas', d: 'M3 17c4 0 4-6 8-6s4 6 8 6M20 17h.01' },
  { k: 'smooth', tip: 'Movimiento suave (interpolación)', movil: false, d: 'M3 12h4l3-7 4 14 3-7h4' },
  { k: 'models', tip: 'Unidades en 3D al acercar', d: 'M2 15h13V7H2zM15 10h4l3 3v2h-7M6 18h.01M18 18h.01' },
  { k: 'overview', tip: 'Ver toda la flota', d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' },
];
const AVISO_TRAFICO = 'Tráfico no disponible (sin cupo o clave no autorizada)';
const ESTILOS: Array<{ s: 'mapa' | 'sat'; l: string }> = [{ s: 'mapa', l: 'Mapa' }, { s: 'sat', l: 'Satélite' }];

export function UbicacionMapa(p: Props) {
  const host = useRef<HTMLDivElement>(null);
  const motorRef = useRef<MotorTelemetria | null>(null);
  const [opt, setOpt] = useState<OpcionesMapa | null>(null);
  const [traficoNo, setTraficoNo] = useState(false);
  const [avisoTrafico, setAvisoTrafico] = useState(false);
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
      onOpciones: () => {
        setOpt({ ...m.opt });
        if (m.traficoNoDisponible) { setTraficoNo(true); setAvisoTrafico(true); setTimeout(() => setAvisoTrafico(false), 8000); }
      },
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
      {avisoTrafico && <div className="tg-aviso-trafico" role="status">{AVISO_TRAFICO}</div>}
      <div className="tg-ctrl">
        <div className="tg-tools tg-glass" role="toolbar" aria-label="Herramientas del mapa">
          {HERRAMIENTAS.map(h => (
            <button key={h.k} type="button" className="btn btn--plain btn--icon tg-tool" data-tip={h.k === 'traffic' && traficoNo ? AVISO_TRAFICO : h.k === 'traffic' && !HAY_TRAFICO ? 'Tráfico: falta la clave VITE_TOMTOM_KEY' : h.tip} aria-label={h.k === 'traffic' && traficoNo ? AVISO_TRAFICO : h.tip} disabled={h.k === 'traffic' && (!HAY_TRAFICO || traficoNo)} data-ocultar-movil={h.movil === false ? '' : undefined}
              aria-pressed={h.k === 'overview' ? undefined : activo(h.k)}
              onClick={() => (h.k === 'overview' ? motorRef.current?.visionGeneral() : alternar(h.k))}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={h.d} />{h.k === 'traffic' && <><circle cx="12" cy="7.5" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="16.5" r="1.3" fill="currentColor" /></>}</svg>
            </button>
          ))}
        </div>
        <div className="tg-seg tg-glass">
          <SegmentedControl label="Estilo del mapa" value={p.base} onChange={p.onBase} options={ESTILOS.map(e => ({ value: e.s, label: e.l }))} />
        </div>
      </div>
    </div>
  );
}

/** Unidad sin ficha en Placas: camión furgón de colores neutros */
const DESC_BASE: DescCamion = { kind: 'box', trailer: 'furgon', colors: [0xf2f4f7, 0x333a44], larga: false };
