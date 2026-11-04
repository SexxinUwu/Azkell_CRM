// Motor del mapa de telemetría. Vive fuera de React: el mapa, la escena three.js, las etiquetas y la cámara se
// dibujan aquí, y React solo recibe avisos (selección, alertas, cámara piloto). Se crea una sola vez por sesión.
/* eslint-disable @typescript-eslint/no-explicit-any */
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapaGL } from 'maplibre-gl';
import { buildStyle, F_BOLD, W, type TemaMapa } from './estilos';
import { Camiones3D, ST, type ClaseEstado, type DescCamion, type VistaCamion } from './camiones';
import { angLerp, distM, enAnillo, type LngLat } from './geo';
import { claseEstado } from './estado';
import { registrarEsri } from './satelite';
import { EXCESO_KMH, EXCESO_REARME_KMH, HAY_TRAFICO, MOV_KMH, SALTO_M, TRAFICO_ATRIBUCION, TRAFICO_REFRESCO_MS, TRAFICO_URL, ZOOM_3D } from './mapaConfig';
import type { Historial } from '../UbicacionHistorial';

export interface EntradaMotor {
  placa: string;
  desc: DescCamion;
  lat: number | null;
  lng: number | null;
  velocidad: number;
  rumbo: number;
  ignicion: boolean;
  /** Momento del último mensaje de Wialon (ms) */
  tPos: number | null;
}

export interface Geocerca { id: string; name: string; color: string; ring: LngLat[]; /** [minLng, minLat, maxLng, maxLat]: descarta rápido las geocercas lejanas */ bbox?: [number, number, number, number] }
const enGeocerca = (p: LngLat, g: Geocerca) => (!g.bbox || (p[0] >= g.bbox[0] && p[0] <= g.bbox[2] && p[1] >= g.bbox[1] && p[1] <= g.bbox[3])) && enAnillo(p, g.ring);
export interface Alerta { id: number; placa: string; icono: string; color: string; msg: string; hora: string }
export interface Lectura { /** Segundos desde el último mensaje del equipo GPS (null si Wialon no lo informó) */ edadS: number | null; kmh: number; rumbo: number; hist: number[]; st: ClaseEstado; geocerca: string | null }
export interface OpcionesMapa { traffic: boolean; terrain: boolean; buildings: boolean; trails: boolean; geo: boolean; smooth: boolean; models: boolean; buildingsSat: boolean }

interface Fix { pos: LngLat; hdg: number; t: number }
interface U {
  placa: string;
  e: EntradaMotor;
  st: ClaseEstado;
  a: Fix | null;
  b: Fix | null;
  view: LngLat | null;
  hview: number;
  /** Última velocidad informada */
  kmh: number;
  trail: LngLat[];
  hist: number[];
  geo: string | null;
  geoInit: boolean;
  alertaExceso: boolean;
  visible: boolean;
  vc: VistaCamion;
  tagEl: HTMLElement | null;
  tagShow: boolean;
  tagOff: number;
  tagTxt: string;
  /** Hubo un primer cálculo de estado (para no alertar al cargar) */
  estadoInit: boolean;
  /** Cuándo llegó la última lectura distinta (ms, reloj de rAF) */
  llego: number;
}

export interface CallbacksMotor {
  onSeleccion: (placa: string | null) => void;
  onAlerta: (a: Alerta) => void;
  onPiloto: (on: boolean) => void;
  /** Cambió algo de las opciones por su cuenta (por ejemplo, el tráfico dejó de estar disponible) */
  onOpciones?: () => void;
}

const MOVIL = () => matchMedia('(max-width:900px)').matches;

/**
 * MapLibre 5.6 puede lanzar "Cannot read properties of undefined (reading 'key')" en _updateRetainedTiles
 * (con cámara inclinada, una tesela ya está en el zoom máximo de la fuente mientras el zoom de referencia aún no).
 * Cada cuadro fallaba y el mapa quedaba a medias. Se corrige el zoom de referencia y, si aun así falla,
 * se conservan solo las teselas ideales para que el cuadro se dibuje.
 */
function protegerTeselas(mapa: MapaGL) {
  const cache = Object.values((mapa as unknown as { style?: { sourceCaches?: Record<string, unknown> } }).style?.sourceCaches ?? {})[0] as { constructor: { prototype: Record<string, unknown> } } | undefined;
  const proto = cache?.constructor.prototype as { _updateRetainedTiles?: (...a: any[]) => unknown; _addTile?: (id: unknown) => unknown; __protegido?: boolean } | undefined;
  if (!proto || proto.__protegido || typeof proto._updateRetainedTiles !== 'function') return;
  const original = proto._updateRetainedTiles;
  proto.__protegido = true;
  proto._updateRetainedTiles = function (this: { _source?: { maxzoom?: number }; _addTile: (id: unknown) => unknown }, ideal: Array<{ overscaledZ: number; key: string }>, zoom: number) {
    const maxzoom = this._source?.maxzoom ?? 22;
    const zRef = ideal.some(t => t.overscaledZ >= maxzoom) ? Math.max(zoom, maxzoom) : zoom;
    try {
      return original.call(this, ideal, zRef);
    } catch {
      const retener: Record<string, unknown> = {};
      for (const t of ideal) { try { this._addTile(t); } catch { /* tesela fuera de rango */ } retener[t.key] = t; }
      return retener;
    }
  };
}
/** Con "reducir movimiento" el mapa salta a su destino en vez de volar */
const REDUCIR = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fc = (features: any[]) => ({ type: 'FeatureCollection' as const, features });
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function iconImg(color: string, sel: boolean) {
  const s = 96, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d')!;
  const r = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2); r.addColorStop(0, color + 'aa'); r.addColorStop(1, color + '00');
  g.fillStyle = r; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, 7); g.fill();
  g.fillStyle = '#0b111b'; g.strokeStyle = sel ? '#ffffff' : color; g.lineWidth = sel ? 5 : 4; g.beginPath(); g.arc(s / 2, s / 2, 22, 0, 7); g.fill(); g.stroke();
  g.fillStyle = color; g.beginPath(); g.moveTo(s / 2, s / 2 - 15); g.lineTo(s / 2 + 11, s / 2 + 12); g.lineTo(s / 2, s / 2 + 6); g.lineTo(s / 2 - 11, s / 2 + 12); g.closePath(); g.fill();
  return { width: s, height: s, data: new Uint8Array(g.getImageData(0, 0, s, s).data.buffer) };
}

export class MotorTelemetria {
  cb: CallbacksMotor = { onSeleccion: () => {}, onAlerta: () => {}, onPiloto: () => {} };
  readonly root: HTMLDivElement;
  readonly mapa: MapaGL;
  tema: TemaMapa;
  opt: OpcionesMapa = { traffic: false, terrain: false, buildings: true, trails: true, geo: true, smooth: true, models: true, buildingsSat: false };

  private mapDiv: HTMLDivElement;
  private tagLayer: HTMLDivElement;
  private camiones = new Camiones3D();
  private units = new Map<string, U>();
  private sel: string | null = null;
  private follow = false;
  private followT = 0;
  private styleReady = false;
  private geos: Geocerca[] = [];
  private hist: Historial | null = null;
  private histIdx = 0;
  private histEventos: Array<{ lat: number; lng: number; tip: string }> = [];
  private histParadasBaja = new Set<number>();
  private histViajes: Array<[number, number]> = [];
  private histViaje = -1;
  private aviso: maplibregl.Popup | null = null;

  private raf = 0;
  private last = performance.now();
  private pushAcc = 0;
  private trailAcc = 0;
  private uiAcc = 0;
  private trailPend = true;
  private sucio = true;
  private sucioDatos = true;
  private prevActivo = false;
  private activo = false;
  private encuadreInicial = false;
  private ultimaActual = 0;
  private qT = 0; private qN = 0; private qSlow = 0;
  private ro: ResizeObserver | null = null;
  private idAlerta = 0;
  private visibles: Set<string> | null = null;

  constructor(tema: TemaMapa) {
    this.tema = tema;
    this.root = document.createElement('div');
    this.root.className = 'tg-mapa';
    this.mapDiv = document.createElement('div'); this.mapDiv.className = 'tg-map';
    this.tagLayer = document.createElement('div'); this.tagLayer.className = 'tg-tags';
    this.root.append(this.mapDiv, this.tagLayer);

    registrarEsri();
    this.mapa = new maplibregl.Map({
      container: this.mapDiv, style: buildStyle(tema, false), center: [-75.4, -9.6], zoom: 4.6, pitch: 0, bearing: 0, maxPitch: 80,
      attributionControl: false, pixelRatio: Math.min(window.devicePixelRatio || 1, MOVIL() ? 1.5 : 2),
      canvasContextAttributes: { antialias: true },
    } as any);
    this.mapa.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    // En celular la atribución empieza plegada (botón "i"): no tapa la hoja inferior
    if (MOVIL()) this.mapa.once('load', () => this.root.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
    this.mapa.on('style.load', () => { protegerTeselas(this.mapa); this.prepararCapas(); });
    // Errores de teselas de tráfico: 401, 403 o 429 (o varios seguidos) apagan la capa; sin repetir errores en la consola
    this.mapa.on('error', e => {
      const ev = e as unknown as { sourceId?: string; error?: { status?: number } };
      if (ev.sourceId === 'trafico') {
        this.fallosTrafico++;
        if ([401, 403, 429].includes(ev.error?.status ?? 0) || this.fallosTrafico >= 5) this.apagarTrafico();
      } else console.error(e.error ?? e);
    });
    this.mapa.on('data', e => { if ((e as unknown as { sourceId?: string; tile?: unknown }).sourceId === 'trafico' && (e as unknown as { tile?: unknown }).tile) this.fallosTrafico = 0; });
    this.mapa.on('move', () => { this.sucio = true; });
    this.mapa.on('dragstart', e => { if (this.follow && (e as any).originalEvent) this.setFollow(false); });
    // Con la cámara piloto el jumpTo por cuadro impide que MapLibre emita dragstart: el arrastre (ratón o dedo) se detecta aquí.
    // Solo actúa con la cámara activa; sin ella no toca ningún gesto del mapa.
    const cv = this.mapa.getCanvas();
    let ini: { x: number; y: number } | null = null;
    const abajo = (x: number, y: number) => { ini = this.follow ? { x, y } : null; };
    const mueve = (x: number, y: number) => { if (ini && this.follow && Math.hypot(x - ini.x, y - ini.y) > 6) { ini = null; this.setFollow(false); } };
    cv.addEventListener('mousedown', ev => abajo(ev.clientX, ev.clientY));
    cv.addEventListener('mousemove', ev => mueve(ev.clientX, ev.clientY));
    cv.addEventListener('touchstart', ev => abajo(ev.touches[0].clientX, ev.touches[0].clientY), { passive: true });
    cv.addEventListener('touchmove', ev => mueve(ev.touches[0].clientX, ev.touches[0].clientY), { passive: true });
    window.addEventListener('mouseup', () => { ini = null; });
    window.addEventListener('touchend', () => { ini = null; });
    this.mapa.on('click', e => {
      let best: U | null = null, bd = 34;
      this.units.forEach(u => {
        if (!u.visible || !u.view || this.hist) return;
        const p = this.mapa.project(u.view); const d = Math.hypot(p.x - e.point.x, p.y - e.point.y);
        if (d < bd) { bd = d; best = u; }
      });
      if (best) this.seleccionar((best as U).placa, MOVIL(), true);
    });
    this.ro = new ResizeObserver(() => { this.mapa.resize(); this.sucio = true; });
    this.ro.observe(this.root);
    window.addEventListener('fleet:cerrar-sesion', this.alCerrarSesion);
    this.raf = requestAnimationFrame(this.frame);
  }

  // ─── Montaje: el mapa es uno solo durante la sesión; solo cambia de contenedor ───
  montar(host: HTMLElement) {
    if (this.root.parentElement !== host) host.appendChild(this.root);
    this.activo = true;
    this.last = performance.now();
    this.mapa.resize();
    this.sucio = true; this.sucioDatos = true;
  }
  desmontar() {
    this.activo = false;
    this.setFollow(false);
    this.root.remove();
  }
  private alCerrarSesion = () => this.liberar();
  liberar() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('fleet:cerrar-sesion', this.alCerrarSesion);
    this.ro?.disconnect();
    this.camiones.liberar();
    try { this.mapa.remove(); } catch { /* ya liberado */ }
    this.root.remove();
    this.units.clear();
    instancia = null;
  }

  // ─── Capas ───
  private prepararCapas() {
    const m = this.mapa;
    (Object.keys(ST) as ClaseEstado[]).forEach(k => { m.addImage('u-' + k, iconImg(ST[k].c, false), { pixelRatio: 2 }); m.addImage('s-' + k, iconImg(ST[k].c, true), { pixelRatio: 2 }); });
    // Tráfico en tiempo real: debajo de las geocercas y las unidades
    if (HAY_TRAFICO && !this.traficoNoDisponible) {
      m.addSource('trafico', { type: 'raster', tiles: [TRAFICO_URL], tileSize: 256, maxzoom: 22, attribution: TRAFICO_ATRIBUCION });
      m.addLayer({ id: 'trafico', type: 'raster', source: 'trafico', paint: { 'raster-opacity': .9 } });
    }
    m.addSource('geo', { type: 'geojson', data: this.datosGeo() });
    // Cuadro plano de color sobre el suelo (como en Wialon): más fuerte al acercarse
    m.addLayer({ id: 'geo-fill', type: 'fill', source: 'geo', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, .5, 14, .38, 18, .26] } });
    m.addLayer({ id: 'geo-line', type: 'line', source: 'geo', paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': .9 } });
    m.addLayer({ id: 'geo-label', type: 'symbol', source: 'geo', minzoom: 13, layout: { 'text-field': ['get', 'name'], 'text-font': F_BOLD, 'text-size': 11.5, 'text-letter-spacing': .06, 'text-transform': 'uppercase' }, paint: { 'text-color': ['get', 'color'], 'text-halo-color': this.tema === 'day' ? '#fff' : '#05070c', 'text-halo-width': 1.6 } });
    // Ruta asignada: capa lista; el ERP todavía no guarda destinos de viaje, así que queda vacía
    m.addSource('route', { type: 'geojson', data: fc([]) });
    m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round' }, paint: { 'line-color': this.tema === 'day' ? '#0a8fd6' : '#ffffff', 'line-opacity': .75, 'line-width': W([9, 2, 18, 7]) as any, 'line-dasharray': [1.2, 1.6] } });
    m.addSource('trails', { type: 'geojson', lineMetrics: true, data: fc([]) });
    m.addLayer({ id: 'trails-glow', type: 'line', source: 'trails', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': W([9, 4, 18, 22]) as any, 'line-blur': 6, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(56,214,255,0)', 1, 'rgba(56,214,255,.45)'] } });
    m.addLayer({ id: 'trails', type: 'line', source: 'trails', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': W([9, 1.5, 18, 7]) as any, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(34,227,160,0)', .6, 'rgba(56,214,255,.7)', 1, 'rgba(160,255,230,1)'] } });
    m.addSource('units', { type: 'geojson', data: fc([]) });
    m.addLayer({ id: 'units', type: 'symbol', source: 'units', layout: { 'icon-image': ['concat', ['case', ['get', 'sel'], 's-', 'u-'], ['get', 'st']], 'icon-rotate': ['get', 'hdg'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, .7, 13, 1, 17, 1.25], 'symbol-sort-key': ['case', ['get', 'sel'], 10, 0] }, paint: { 'icon-opacity': this.iconOpacity() as any } });
    this.imagenFlecha();
    m.addLayer(this.camiones.capa);
    this.capasHistorial();
    this.camiones.noche = this.tema === 'night';
    this.aplicarOpciones(false);
    this.styleReady = true; this.sucio = true; this.sucioDatos = true;
  }
  private iconOpacity() { return this.opt.models ? ['interpolate', ['linear'], ['zoom'], ZOOM_3D, 1, 15.4, 0] : 1; }
  private datosGeo() {
    return fc(this.geos.map(g => ({ type: 'Feature', properties: { name: g.name, color: g.color }, geometry: { type: 'Polygon', coordinates: [g.ring] } })));
  }
  private aplicarOpciones(conRelieve: boolean) {
    const m = this.mapa, o = this.opt;
    const vis = (id: string, on: boolean) => { if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
    vis('buildings', o.buildings && (this.tema !== 'sat' || o.buildingsSat));
    ['trails', 'trails-glow'].forEach(id => vis(id, o.trails && !this.hist));
    ['geo-fill', 'geo-line', 'geo-label'].forEach(id => vis(id, o.geo));
    vis('trafico', o.traffic);
    this.programarTrafico(o.traffic);
    vis('units', !this.hist);
    if (m.getLayer('units')) m.setPaintProperty('units', 'icon-opacity', this.iconOpacity());
    this.camiones.activa = o.models && !this.hist;
    this.camiones.relieve = o.terrain;
    if (conRelieve) m.setTerrain(o.terrain ? { source: 'dem', exaggeration: 1.35 } : null);
    this.sucio = true; this.sucioDatos = true;
  }

  /** TomTom respondió 401, 403 o 429 (clave no autorizada o sin cupo), o fallaron varias teselas seguidas: no se vuelve a pedir hasta recargar la página */
  traficoNoDisponible = false;
  private fallosTrafico = 0;
  private timerTrafico: ReturnType<typeof setInterval> | null = null;

  /** Una sola petición de prueba antes de encender el tráfico: con clave sin cupo o no autorizada no se piden más teselas */
  private async probarTrafico(): Promise<boolean> {
    try {
      const r = await fetch(TRAFICO_URL.replace('{z}', '0').replace('{x}', '0').replace('{y}', '0'), { cache: 'no-store' });
      return ![401, 403, 429].includes(r.status);
    } catch { return true; /* sin red: la capa lo reintentará y, si falla varias veces, se apaga */ }
  }
  private apagarTrafico() {
    if (this.traficoNoDisponible) return;
    this.traficoNoDisponible = true;
    this.opt.traffic = false;
    this.programarTrafico(false);
    try { if (this.mapa.getLayer('trafico')) this.mapa.removeLayer('trafico'); if (this.mapa.getSource('trafico')) this.mapa.removeSource('trafico'); } catch { /* ya quitado */ }
    console.warn('Tráfico no disponible (sin cupo o clave no autorizada).');
    this.cb.onOpciones?.();
  }
  /** Mientras el tráfico está encendido se vuelve a pedir cada 2 minutos */
  private programarTrafico(on: boolean) {
    if (this.timerTrafico) { clearInterval(this.timerTrafico); this.timerTrafico = null; }
    if (!on || !HAY_TRAFICO) return;
    this.timerTrafico = setInterval(() => {
      const src = this.mapa.getSource('trafico') as unknown as { setTiles?: (t: string[]) => void } | undefined;
      src?.setTiles?.([TRAFICO_URL + '&t=' + Date.now()]);
    }, TRAFICO_REFRESCO_MS);
  }

  setOpcion(k: keyof OpcionesMapa, v: boolean) {
    if (k === 'traffic') {
      if (!v) { this.opt.traffic = false; if (this.styleReady) this.aplicarOpciones(false); return; }
      if (this.traficoNoDisponible || !HAY_TRAFICO) return;
      // Se enciende solo si la prueba sale bien; el estado del botón se actualiza con onOpciones
      void this.probarTrafico().then(ok => {
        if (!ok) { this.apagarTrafico(); return; }
        this.opt.traffic = true; this.fallosTrafico = 0;
        if (this.styleReady) this.aplicarOpciones(false);
        this.cb.onOpciones?.();
      });
      return;
    }
    this.opt[k] = v;
    if (k === 'buildings' && this.tema === 'sat') { this.opt.buildingsSat = v; this.opt.buildings = true; }
    if (this.styleReady) this.aplicarOpciones(k === 'terrain');
    if (k === 'smooth') this.units.forEach(u => { if (u.b) { u.a = u.b; u.view = u.b.pos.slice() as LngLat; u.hview = u.b.hdg; } });
  }
  setTema(t: TemaMapa) {
    if (t === this.tema) return;
    this.tema = t;
    try { localStorage.setItem('fleet_gps_tema', t); } catch { /* sin almacenamiento */ }
    this.styleReady = false;
    // Sin esto, MapLibre 5.6 falla con "shaderPreludeCode" al cambiar de estilo con relieve
    this.mapa.setTerrain(null);
    this.mapa.setStyle(buildStyle(t, this.opt.terrain), { diff: false });
  }
  setGeocercas(gs: Geocerca[]) {
    this.geos = gs;
    const s = this.mapa.getSource('geo') as GeoJSONSource | undefined;
    s?.setData(this.datosGeo() as any);
  }

  // ─── Datos ───
  /** Llega una lectura nueva de Wialon (cada intervalo de actualización) */
  actualizar(entradas: EntradaMotor[]) {
    const now = performance.now();
    const gap = this.ultimaActual ? now - this.ultimaActual : 4000;
    this.ultimaActual = now;
    const dur = clamp(gap, 1000, 12000);
    const vistos = new Set<string>();
    for (const e of entradas) {
      vistos.add(e.placa);
      let u = this.units.get(e.placa);
      if (!u) {
        u = {
          placa: e.placa, e, st: 'off', a: null, b: null, view: null, hview: 0, kmh: 0, trail: [], hist: [], geo: null, geoInit: false,
          alertaExceso: false, visible: true, tagEl: null, tagShow: false, tagOff: 18, tagTxt: '', estadoInit: false, llego: 0,
          vc: { placa: e.placa, desc: e.desc, pos: null, rumbo: 0, st: 'off', sel: false, visible: true },
        };
        this.units.set(e.placa, u);
      }
      // El equipo reporta cada 10 a 30 s: la unidad se anima durante ese tiempo real entre dos mensajes (no durante los 4 s de la consulta), así no queda parada entre uno y otro
      const tPosAnt = u.e.tPos;
      const durUnidad = (e.tPos && tPosAnt && e.tPos > tPosAnt) ? clamp(e.tPos - tPosAnt, 1000, 45000) : dur;
      u.e = e; u.vc.desc = e.desc;
      u.kmh = e.velocidad;
      if (e.lat != null && e.lng != null) {
        const pos: LngLat = [e.lng, e.lat];
        // Con la unidad casi quieta el rumbo del GPS no sirve: se conserva el anterior
        const hdg = e.velocidad > MOV_KMH || !u.b ? e.rumbo : u.b.hdg;
        const largo = u.llego ? now - u.llego > Math.max(durUnidad * 3, 120000) : false;
        if (!u.b || !u.view || distM(u.b.pos, pos) > SALTO_M || largo) {
          // Primer dato, salto grande o hueco largo: se coloca sin animar
          u.a = u.b = { pos, hdg, t: now }; u.llego = now;
          u.view = pos.slice() as LngLat; u.hview = hdg;
        } else if (u.b.pos[0] !== pos[0] || u.b.pos[1] !== pos[1] || u.b.hdg !== hdg) {
          // Se dibuja desde donde está hasta la lectura nueva, tardando lo que tarda en llegar la siguiente
          u.a = { pos: u.view.slice() as LngLat, hdg: u.hview, t: now };
          u.b = { pos, hdg, t: now + durUnidad }; u.llego = now;
        }
        this.eventos(u, pos);
      } else { u.a = u.b = null; u.view = null; u.vc.pos = null; }
    }
    for (const p of [...this.units.keys()]) if (!vistos.has(p)) { this.quitarEtiqueta(this.units.get(p)!); this.units.delete(p); if (this.sel === p) this.seleccionar(null, false, true); }
    this.evaluarEstados();
    this.camiones.vistas = [...this.units.values()].map(u => u.vc);
    if (this.visibles) this.setVisibles(this.visibles);
    if (!this.encuadreInicial) this.visionGeneral(true);
    this.sucio = true; this.sucioDatos = true;
  }
  setVisibles(v: Set<string>) {
    this.visibles = v;
    this.units.forEach(u => { u.visible = v.has(u.placa); u.vc.visible = u.visible; if (!u.visible) this.ocultarEtiqueta(u); });
    this.sucio = true; this.sucioDatos = true; this.uiAcc = 1;
  }

  private evaluarEstados() {
    const ahora = Date.now();
    this.units.forEach(u => {
      const st = claseEstado({ lat: u.e.lat, lng: u.e.lng, velocidad: u.e.velocidad, ignicion: u.e.ignicion, tPos: u.e.tPos }, ahora);
      // Solo si venía en marcha o en ralentí: un equipo apagado que duerme no mandar mensajes es normal
      if (u.estadoInit && st === 'off' && (u.st === 'mov' || u.st === 'ral')) {
        const min = u.e.tPos ? Math.round((ahora - u.e.tPos) / 60000) : null;
        // El aviso emergente de pérdida de señal solo sale en la web; en el teléfono no (la unidad igual pasa a "Sin señal" en la lista y el mapa)
        if (!MOVIL()) this.alertar(u, '📡', ST.off.c, 'Perdió la señal GPS' + (min != null ? ` · último mensaje hace ${min} min` : ''));
      }
      if (st !== u.st) { u.st = st; u.vc.st = st; this.sucioDatos = true; }
      u.estadoInit = true;
    });
  }

  // ─── Eventos en pantalla (sin enviar nada fuera) ───
  private eventos(u: U, pos: LngLat) {
    const g = this.geos.find(x => enGeocerca(pos, x));
    const id = g ? g.id : null;
    if (u.geoInit && id !== u.geo) {
      if (g) this.alertar(u, '⬢', g.color, 'Entró a ' + g.name);
      else { const prev = this.geos.find(x => x.id === u.geo); if (prev) this.alertar(u, '⬡', prev.color, 'Salió de ' + prev.name); }
    }
    u.geo = id; u.geoInit = true;
    if (u.e.velocidad > EXCESO_KMH && !u.alertaExceso) { u.alertaExceso = true; this.alertar(u, '⚡', ST.off.c, 'Exceso de velocidad: ' + Math.round(u.e.velocidad) + ' km/h'); }
    if (u.e.velocidad < EXCESO_REARME_KMH) u.alertaExceso = false;
  }
  private alertar(u: U, icono: string, color: string, msg: string) {
    this.cb.onAlerta({ id: ++this.idAlerta, placa: u.placa, icono, color, msg, hora: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
  }
  get totalAlertas() { return this.idAlerta; }

  // ─── Bucle ───
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const realDt = Math.min(.1, (now - this.last) / 1000); this.last = now;
    if (!this.activo || document.hidden) { this.prevActivo = false; return; }
    const m = this.mapa;
    const moviendo = m.isMoving();
    // Interpolación entre las dos últimas posiciones
    let anim = false;
    this.units.forEach(u => {
      const a = u.a, b = u.b;
      if (!a || !b) return;
      if (!this.opt.smooth) { u.view = b.pos; u.hview = b.hdg; return; }
      const span = Math.max(1, b.t - a.t), p = clamp((now - a.t) / span, 0, 1);
      if (p >= 1 && u.view && u.view[0] === b.pos[0] && u.view[1] === b.pos[1]) return;
      u.view = [a.pos[0] + (b.pos[0] - a.pos[0]) * p, a.pos[1] + (b.pos[1] - a.pos[1]) * p];
      u.hview = angLerp(a.hdg, b.hdg, p);
      if (p < 1) anim = true;
      u.vc.pos = u.view; u.vc.rumbo = u.hview; this.sucio = true; this.sucioDatos = true;
    });
    this.units.forEach(u => { if (u.view && !u.vc.pos) { u.vc.pos = u.view; u.vc.rumbo = u.hview; } });

    // Estelas e historial de velocidad: una vez por segundo
    this.trailAcc += realDt;
    if (this.trailAcc >= 1) {
      this.trailAcc = 0;
      this.units.forEach(u => {
        if (u.view && u.st === 'mov') { u.trail.push(u.view.slice() as LngLat); if (u.trail.length > 90) u.trail.shift(); }
        u.hist.push(u.kmh); if (u.hist.length > 120) u.hist.shift();
      });
      this.trailPend = true;
    }

    // Cámara piloto: un jumpTo por cuadro (nunca easeTo)
    const sel = this.sel ? this.units.get(this.sel) : null;
    if (this.follow && sel && sel.view) {
      this.followT += realDt;
      const k = Math.min(1, realDt * 2.2);
      const cam: any = { center: sel.view, bearing: angLerp(m.getBearing(), sel.hview, Math.min(1, realDt * 2.5)) };
      if (this.opt.terrain) cam.elevation = m.queryTerrainElevation(sel.view) || 0;
      if (this.followT < 2.5) { cam.zoom = m.getZoom() + (18.3 - m.getZoom()) * k; cam.pitch = m.getPitch() + (64 - m.getPitch()) * k; }
      m.jumpTo(cam);
    }
    // Fallo de MapLibre 5.6: una animación interrumpida deja la cámara desalineada
    if (!m.isMoving() && (m as any)._elevationFreeze) (m as any)._elevationFreeze = false;

    // Reposo: sin unidades moviéndose ni cámara en movimiento no se redibuja nada
    const trabajo = anim || moviendo || this.follow || this.sucio || this.sucioDatos;
    if (trabajo && this.styleReady) {
      this.pushAcc += realDt;
      if ((anim || this.sucioDatos) && this.pushAcc > (MOVIL() ? 1 / 20 : 1 / 30)) { this.pushAcc = 0; this.empujarDatos(); this.sucioDatos = false; }
      this.posicionarEtiquetas();
      if (this.opt.models && !this.hist && m.getZoom() >= ZOOM_3D && (anim || this.follow)) m.triggerRepaint();
      this.sucio = false;
    }
    this.uiAcc += realDt;
    if (this.uiAcc > .5) { this.uiAcc = 0; this.evaluarEstados(); this.actualizarEtiquetas(); }
    if (trabajo) this.calidadAuto(realDt);
    else this.prevActivo = false;
  };

  // Calidad automática: si el equipo no da abasto, baja la nitidez de a 0.5 hasta 1
  private calidadAuto(dt: number) {
    if (!this.prevActivo) { this.prevActivo = true; return; }
    this.qT += dt; this.qN++;
    if (this.qT < 2) return;
    const avg = this.qT / this.qN * 1000; this.qT = 0; this.qN = 0;
    this.qSlow = avg > 40 ? this.qSlow + 1 : 0;
    const pr = this.mapa.getPixelRatio();
    if (this.qSlow >= 2 && pr > 1) { this.mapa.setPixelRatio(Math.max(1, pr - .5)); this.qSlow = 0; }
  }

  private empujarDatos() {
    const m = this.mapa;
    const src = m.getSource('units') as GeoJSONSource | undefined;
    if (!src) return;
    if (!this.hist) {
      const feats: any[] = [];
      this.units.forEach(u => { if (u.visible && u.view) feats.push({ type: 'Feature', properties: { st: u.st, hdg: u.hview, sel: u.placa === this.sel }, geometry: { type: 'Point', coordinates: u.view } }); });
      src.setData(fc(feats) as any);
    }
    if (this.trailPend) {
      this.trailPend = false;
      const tr = m.getSource('trails') as GeoJSONSource | undefined;
      const feats: any[] = [];
      if (!this.hist) this.units.forEach(u => { if (u.trail.length > 1 && u.visible && u.view) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: u.trail.concat([u.view]) } }); });
      tr?.setData(fc(feats) as any);
    }
  }

  // ─── Etiquetas (placa y velocidad) con map.project: nunca maplibregl.Marker ───
  private crearEtiqueta(u: U) {
    const el = document.createElement('div'); el.className = 'tg-tag';
    el.innerHTML = '<i></i><span class="p"></span><span class="k"></span>';
    (el.querySelector('.p') as HTMLElement).textContent = u.placa;
    el.addEventListener('click', ev => { ev.stopPropagation(); this.seleccionar(u.placa, true, true); });
    this.tagLayer.appendChild(el); u.tagEl = el;
  }
  private quitarEtiqueta(u: U) { u.tagEl?.remove(); u.tagEl = null; u.tagShow = false; }
  private ocultarEtiqueta(u: U) { u.tagShow = false; if (u.tagEl) u.tagEl.style.display = 'none'; }
  private posicionarEtiquetas() {
    const W0 = this.root.clientWidth, H0 = this.root.clientHeight;
    this.units.forEach(u => {
      const el = u.tagEl;
      if (!u.tagShow || !el || !u.view) return;
      const pt = this.mapa.project(u.view);
      if (pt.x < -80 || pt.y < -40 || pt.x > W0 + 80 || pt.y > H0 + 40) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
      if (el.style.display === 'none') el.style.display = '';
      el.style.transform = 'translate3d(' + pt.x.toFixed(1) + 'px,' + (pt.y - u.tagOff).toFixed(1) + 'px,0) translate(-50%,-100%)';
    });
  }
  private actualizarEtiquetas() {
    const z = this.mapa.getZoom();
    this.units.forEach(u => {
      const esSel = u.placa === this.sel;
      const show = !this.hist && u.visible && !!u.view && (z >= (MOVIL() ? 12.8 : 11.6) || esSel);
      if (show && !u.tagEl) this.crearEtiqueta(u);
      u.tagShow = show;
      const el = u.tagEl;
      if (!el) return;
      if (!show) { el.style.display = 'none'; return; }
      const txt = u.st + '|' + (u.st === 'off' ? 0 : Math.round(u.kmh)) + '|' + esSel;
      if (txt !== u.tagTxt) {
        u.tagTxt = txt;
        el.classList.toggle('sel', esSel);
        (el.querySelector('i') as HTMLElement).style.background = ST[u.st].c;
        (el.querySelector('.k') as HTMLElement).textContent = u.st === 'off' ? 'sin señal' : Math.round(u.kmh) + ' km/h';
      }
      u.tagOff = this.opt.models && z >= 15 ? Math.min(70, 14 + (z - 15) * 18) : 18;
      this.sucio = true;
    });
  }

  // ─── Cámara y selección ───
  /** Avisa que hay una hoja inferior abierta en el celular (para ubicar la unidad arriba de ella) */
  /**
   * Relleno del mapa en celular: arriba, el borde inferior de la fila de KPIs + 8 px; abajo, el alto de la ficha (46 % de la altura).
   * Así la unidad queda en la franja visible, ni bajo los KPIs ni bajo la ficha.
   */
  private relleno(conFicha: boolean) {
    if (!MOVIL()) return { top: 0, left: 0, right: 0, bottom: 0 };
    // La fila de KPIs es un overlay de React (hermano del mapa), no un hijo de this.root
    const k = document.querySelector('.tg-kpis');
    const top = k ? Math.max(0, Math.round(k.getBoundingClientRect().bottom - this.root.getBoundingClientRect().top)) + 8 : 0;
    return { top, left: 0, right: 0, bottom: conFicha ? Math.round(this.root.clientHeight * .46) : 0 };
  }
  setHoja(abierta: boolean) {
    // setPadding equivale a un jumpTo y cancelaría el vuelo hacia la unidad: con el mapa en movimiento no se toca (el vuelo ya lleva su relleno)
    if (this.follow || this.mapa.isMoving()) return;
    this.mapa.setPadding(this.relleno(abierta));
  }

  seleccionar(placa: string | null, volar: boolean, avisar = false) {
    const cambia = placa !== this.sel;
    if (cambia) {
      const prev = this.sel ? this.units.get(this.sel) : null;
      if (prev) prev.vc.sel = false;
      this.sel = placa;
      const u = placa ? this.units.get(placa) : null;
      if (u) u.vc.sel = true;
      if (!placa) this.setFollow(false);
    }
    if (avisar && cambia) this.cb.onSeleccion(placa);
    const u = placa ? this.units.get(placa) : null;
    const pad = this.relleno(!!u);
    if (u && u.view && volar && cambia) this.mapa.flyTo({ center: u.b ? u.b.pos : u.view, zoom: Math.max(this.mapa.getZoom(), 15.8), pitch: 60, bearing: this.mapa.getBearing(), duration: REDUCIR() ? 0 : 2200, essential: !REDUCIR(), padding: pad });
    // Con un vuelo en curso no se toca el relleno (setPadding cancelaría el vuelo hacia la unidad)
    else if (!this.follow && !this.mapa.isMoving()) this.mapa.setPadding(pad);
    this.uiAcc = 1; this.sucioDatos = true; this.sucio = true; this.mapa.triggerRepaint();
  }

  setFollow(on: boolean) {
    const nuevo = !!(on && this.sel && this.units.get(this.sel)?.view);
    if (nuevo === this.follow) return;
    this.follow = nuevo;
    if (nuevo) { this.followT = 0; this.mapa.stop(); }
    const H = this.root.clientHeight;
    this.mapa.setPadding(nuevo ? { top: Math.round(H * (MOVIL() ? .3 : .38)), bottom: 0, left: 0, right: 0 } : this.relleno(!!this.sel));
    this.cb.onPiloto(nuevo);
  }
  get piloto() { return this.follow; }

  centrarSeleccion() {
    const u = this.sel ? this.units.get(this.sel) : null;
    // Va a la última posición recibida; si la unidad se movió, otro clic vuelve a centrarla donde está ahora
    if (u?.view) this.mapa.flyTo({ center: u.b ? u.b.pos : u.view, zoom: Math.max(this.mapa.getZoom(), 16.5), pitch: Math.max(this.mapa.getPitch(), 55), bearing: u.hview, duration: REDUCIR() ? 0 : 1200, essential: !REDUCIR() });
  }

  /** Encuadra las unidades visibles con posición (o solo las placas indicadas) */
  visionGeneral(primera = false, placas?: string[]) {
    const pts: LngLat[] = [];
    this.units.forEach(u => { if (u.view && (placas ? placas.includes(u.placa) : u.visible)) pts.push(u.view); });
    if (!pts.length) return;
    this.encuadreInicial = true;
    this.setFollow(false);
    const b = new maplibregl.LngLatBounds(pts[0], pts[0]);
    pts.forEach(p => b.extend(p));
    const opts: any = { padding: MOVIL() ? { top: 150, bottom: 190, left: 30, right: 30 } : 70, maxZoom: 15, duration: primera || REDUCIR() ? 0 : 1800, pitch: pts.length > 1 ? 48 : 58, bearing: -22 };
    this.mapa.fitBounds(b, opts);
  }

  /** Lleva la cámara a un punto (lugar del historial) */
  irA(lat: number, lng: number) { this.mapa.flyTo({ center: [lng, lat], zoom: Math.max(this.mapa.getZoom(), 16), duration: REDUCIR() ? 0 : 1200 }); }

  leer(placa: string): Lectura | null {
    const u = this.units.get(placa);
    if (!u) return null;
    return { edadS: u.e.tPos ? Math.max(0, Math.round((Date.now() - u.e.tPos) / 1000)) : null, kmh: u.kmh, rumbo: u.hview, hist: u.hist, st: u.st, geocerca: u.geo ? (this.geos.find(g => g.id === u.geo)?.name ?? null) : null };
  }

  // ─── Historial / Playback ───
  private imagenFlecha() {
    if (this.mapa.hasImage('h-flecha')) return;
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(255,255,255,.92)'; g.strokeStyle = 'rgba(8,12,20,.55)'; g.lineWidth = 2; g.beginPath();
    g.moveTo(22, 16); g.lineTo(10, 9); g.lineTo(13, 16); g.lineTo(10, 23); g.closePath(); g.fill(); g.stroke();
    this.mapa.addImage('h-flecha', { width: 32, height: 32, data: new Uint8Array(g.getImageData(0, 0, 32, 32).data.buffer) }, { pixelRatio: 2 });
  }
  private opacidadViaje(): any {
    const v = this.histViaje;
    return v < 0 ? 1 : ['case', ['==', ['get', 'trip'], v], 1, .18];
  }
  private capasHistorial() {
    const m = this.mapa;
    // Ruta coloreada por velocidad: gris detenida, verde normal, ámbar rápido, rojo exceso
    const color: any = ['interpolate', ['linear'], ['get', 'v'], 0, '#8a9ab0', 3, '#8a9ab0', 4, '#22e3a0', 55, '#22e3a0', 70, '#ffb020', 90, '#ff5470'];
    m.addSource('h-ruta', { type: 'geojson', data: fc([]) });
    m.addLayer({ id: 'h-ruta-glow', type: 'line', source: 'h-ruta', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-opacity': .28, 'line-blur': 5, 'line-width': W([9, 4, 18, 16]) as any } });
    m.addLayer({ id: 'h-ruta', type: 'line', source: 'h-ruta', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-opacity': this.opacidadViaje(), 'line-width': W([9, 2.2, 18, 7]) as any } });
    m.addSource('h-linea', { type: 'geojson', data: fc([]) });
    m.addLayer({ id: 'h-flechas', type: 'symbol', source: 'h-linea', minzoom: 11, layout: { 'symbol-placement': 'line', 'symbol-spacing': 110, 'icon-image': 'h-flecha', 'icon-size': ['interpolate', ['linear'], ['zoom'], 11, .45, 17, .8], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotation-alignment': 'map' }, paint: { 'icon-opacity': .85 } });
    m.addSource('h-pins', { type: 'geojson', data: fc([]) });
    m.addLayer({ id: 'h-pins', type: 'circle', source: 'h-pins', paint: { 'circle-radius': 11, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
    m.addLayer({ id: 'h-pins-txt', type: 'symbol', source: 'h-pins', layout: { 'text-field': ['get', 'sym'], 'text-font': F_BOLD, 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff' } });
    m.addSource('h-cur', { type: 'geojson', data: fc([]) });
    m.addLayer({ id: 'h-cur', type: 'symbol', source: 'h-cur', layout: { 'icon-image': ['concat', 's-', ['get', 'st']], 'icon-rotate': ['get', 'hdg'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': 1.15 } });
    m.on('click', 'h-pins', e => {
      const f = e.features?.[0]; if (!f) return;
      this.aviso?.remove();
      this.aviso = new maplibregl.Popup({ closeButton: false, offset: 14 }).setLngLat((f.geometry as any).coordinates).setText(String(f.properties?.tip ?? '')).addTo(m);
    });
    this.pintarHistorial();
  }
  private pintarHistorial() {
    const m = this.mapa, h = this.hist;
    if (!m.getSource('h-ruta')) return;
    const set = (id: string, d: any) => (m.getSource(id) as GeoJSONSource | undefined)?.setData(d);
    if (!h || !h.puntos.length) { set('h-ruta', fc([])); set('h-linea', fc([])); set('h-pins', fc([])); set('h-cur', fc([])); return; }
    const hora = (t: number) => new Date(t * 1000).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const pin = (p: { lat: number; lng: number }, color: string, sym: string, tip: string) => ({ type: 'Feature', properties: { color, sym, tip }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } });
    const ini = h.puntos[0], fin = h.puntos[h.puntos.length - 1];
    // Viaje de cada tramo (-1 = fuera de los viajes, por ejemplo en una parada)
    const viajeDe = (i: number) => { const k = this.histViajes.findIndex(([a, b]) => i >= a && i < b); return k; };
    const seg: any[] = [];
    for (let i = 0; i < h.puntos.length - 1; i++) {
      const a = h.puntos[i], b = h.puntos[i + 1];
      seg.push({ type: 'Feature', properties: { v: (a.velocidad + b.velocidad) / 2, trip: viajeDe(i) }, geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } });
    }
    set('h-ruta', fc(seg));
    set('h-linea', fc([{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: h.puntos.map(p => [p.lng, p.lat]) } }]));
    set('h-pins', fc([
      pin(ini, '#16a34a', '▶', 'Inicio · ' + hora(ini.tiempo)), pin(fin, '#0f172a', '■', 'Fin · ' + hora(fin.tiempo)),
      // P = parada; roja con ⛽ si el combustible bajó durante la parada
      ...h.paradas.map((s, i) => {
        const baja = this.histParadasBaja.has(s.startT);
        return pin(s, baja ? '#ef4444' : '#ff8a2a', baja ? '⛽' : 'P', `Parada ${i + 1} · ${s.durMin} min · ${hora(s.startT)}${baja ? ' · bajó el combustible' : ''}`);
      }),
      ...h.excesos.map(e => pin(e, '#dc2626', '!', `Exceso · ${Math.round(e.velocidad)} km/h`)),
      ...this.histEventos.map(e => pin(e, '#f59e0b', '⛽', e.tip)),
    ]));
    this.cursorHistorial(this.histIdx);
  }
  mostrarHistorial(h: Historial | null, extra: { eventos?: Array<{ lat: number; lng: number; tip: string }>; paradasBaja?: number[]; viajes?: Array<[number, number]> } = {}) {
    this.hist = h; this.histIdx = 0; this.histEventos = extra.eventos ?? []; this.histParadasBaja = new Set(extra.paradasBaja ?? []); this.histViajes = extra.viajes ?? []; this.histViaje = -1;
    this.aviso?.remove();
    if (this.styleReady) { this.aplicarOpciones(false); this.pintarHistorial(); this.mapa.getLayer('h-ruta') && this.mapa.setPaintProperty('h-ruta', 'line-opacity', this.opacidadViaje()); }
    this.units.forEach(u => { if (h) this.ocultarEtiqueta(u); });
    if (h && h.puntos.length) { this.setFollow(false); this.encuadrarPuntos(0, h.puntos.length - 1); }
  }
  private encuadrarPuntos(i0: number, i1: number) {
    const h = this.hist; if (!h) return;
    const pts = h.puntos.slice(i0, i1 + 1); if (!pts.length) return;
    const b = new maplibregl.LngLatBounds([pts[0].lng, pts[0].lat], [pts[0].lng, pts[0].lat]);
    pts.forEach(p => b.extend([p.lng, p.lat]));
    this.mapa.fitBounds(b, { padding: MOVIL() ? { top: 150, bottom: 340, left: 30, right: 30 } : { top: 130, bottom: 190, left: 380, right: 400 }, pitch: 0, bearing: 0, duration: REDUCIR() ? 0 : 800, maxZoom: 17 });
  }
  /** Resalta un viaje (los demás tramos se atenúan) y lo encuadra; null quita el resaltado */
  resaltarViaje(i: number | null) {
    this.histViaje = i == null ? -1 : i;
    if (this.mapa.getLayer('h-ruta')) this.mapa.setPaintProperty('h-ruta', 'line-opacity', this.opacidadViaje());
    if (i != null && this.histViajes[i]) this.encuadrarPuntos(this.histViajes[i][0], this.histViajes[i][1]);
  }
  cursorHistorial(i: number) {
    this.histIdx = i;
    const h = this.hist, p = h?.puntos[i];
    const s = this.mapa.getSource('h-cur') as GeoJSONSource | undefined;
    if (!h || !p || !s) return;
    const st: ClaseEstado = p.velocidad > MOV_KMH ? 'mov' : p.ignicion ? 'ral' : 'det';
    s.setData(fc([{ type: 'Feature', properties: { st, hdg: p.curso }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } }]) as any);
    if (!this.mapa.getBounds().contains([p.lng, p.lat])) this.mapa.panTo([p.lng, p.lat]);
  }
}

// Un solo mapa durante toda la sesión
let instancia: MotorTelemetria | null = null;
export function motorTelemetria(): MotorTelemetria {
  if (!instancia) {
    let tema: TemaMapa = 'night';
    try { const g = localStorage.getItem('fleet_gps_tema'); if (g === 'day' || g === 'sat' || g === 'night') tema = g; } catch { /* sin almacenamiento */ }
    instancia = new MotorTelemetria(tema);
  }
  return instancia;
}
