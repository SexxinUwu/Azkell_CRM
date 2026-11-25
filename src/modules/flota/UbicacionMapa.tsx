// Mapa de telemetría en vivo (MapLibre + camiones en 3D). El mapa y la escena viven en gps/motor.ts, fuera de React:
// aquí solo se conecta con los datos, y se dibujan los controles flotantes (herramientas, estilo, cámara piloto y alertas).
import 'maplibre-gl/dist/maplibre-gl.css';
import './gps/telemetria.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { motorTelemetria, type Alerta, type EntradaMotor, type MotorTelemetria, type OpcionesMapa } from './gps/motor';
import { ST, type ClaseEstado, type DescCamion } from './gps/camiones';
import type { TemaMapa } from './gps/estilos';
import type { GeocercaMapa, UnidadMapa } from './api';
import { BuscadorGeocercas } from './BuscadorGeocercas';
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
  /** Geocercas de Wialon: alimentan el buscador */
  geocercas?: GeocercaMapa[];
  /** Vista activa: el buscador de geocercas se muestra en la vista Geocercas */
  vista?: 'unidades' | 'recorrido' | 'geocercas';
  onVista?: (v: 'unidades' | 'recorrido' | 'geocercas') => void;
  /** Contenido flotante que va encima del mapa (barra superior, lista, ficha) */
  children?: React.ReactNode;
}

const HERRAMIENTAS: Array<{ k: keyof OpcionesMapa | 'overview'; tip: string; movil?: boolean; d: string; extra?: string }> = [
  { k: 'exacto', tip: 'Posición exacta del GPS (sin predicción, tamaño real y hora del último mensaje)', d: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3' },
  { k: 'smooth', tip: 'Movimiento suave (interpolación)', movil: false, d: 'M3 12h4l3-7 4 14 3-7h4' },
  { k: 'overview', tip: 'Ver toda la flota', d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' },
];
const ESTILOS: Array<{ s: 'mapa' | 'sat'; l: string }> = [{ s: 'mapa', l: 'Mapa' }, { s: 'sat', l: 'Satélite' }];

export function UbicacionMapa(p: Props) {
  const host = useRef<HTMLDivElement>(null);
  const motorRef = useRef<MotorTelemetria | null>(null);
  const [opt, setOpt] = useState<OpcionesMapa | null>(null);
  const [geoElegida, setGeoElegida] = useState<string | null>(null);
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
      onOpciones: () => { setOpt({ ...m.opt }); },
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
  const elegirGeo = (id: string | null) => { motorRef.current?.irAGeocerca(id); setGeoElegida(id); };
  const activo = (k: keyof OpcionesMapa) => !!opt && (k === 'buildings' && p.tema === 'sat' ? opt.buildingsSat : opt[k]);

  return (
    <div className="tg-lienzo">
      <div ref={host} className="tg-host" />
      {p.children}
      {p.vista === 'geocercas' && <BuscadorGeocercas geocercas={p.geocercas ?? []} contar={() => motorRef.current?.unidadesPorGeocerca() ?? new Map()} onElegir={elegirGeo} elegida={geoElegida} onCerrar={() => p.onVista?.('unidades')} />}
      <div className="tg-ctrl">
        <div className="tg-tools tg-glass" role="toolbar" aria-label="Herramientas del mapa">
          {HERRAMIENTAS.map(h => (
            <button key={h.k} type="button" className="btn btn--plain btn--icon tg-tool" data-tip={h.tip} aria-label={h.tip} data-ocultar-movil={h.movil === false ? '' : undefined}
              aria-pressed={h.k === 'overview' ? undefined : activo(h.k)}
              onClick={() => (h.k === 'overview' ? motorRef.current?.visionGeneral() : alternar(h.k))}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={h.d} /></svg>
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
