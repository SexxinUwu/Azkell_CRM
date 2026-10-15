// Mapa de la flota con Leaflet (la misma librería y capas que la versión actual):
// OpenStreetMap para Callejero y Google para Satelital. Cada unidad es un camión con su rumbo y su placa.
// Entre una actualización y la siguiente, el camión se desliza por el mapa (se ve moverse).
// Con el historial abierto, se dibuja la ruta y el camión avanza por ella.
import { useEffect, useRef, useState } from 'react';
import { estadoUnidad, type EstadoUnidad, type UnidadMapa } from './api';
import { fechaHora, type Historial } from './UbicacionHistorial';

export type CapaMapa = 'calle' | 'satelite';

// Leaflet se carga desde /libs (servido por el servidor, como html2pdf). Su tipo no se importa del paquete.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Leaflet = any;

let cargaLeaflet: Promise<Leaflet> | null = null;
function cargarLeaflet(): Promise<Leaflet> {
  if (cargaLeaflet) return cargaLeaflet;
  cargaLeaflet = new Promise((resolve, reject) => {
    const w = window as unknown as { L?: Leaflet };
    if (w.L) { resolve(w.L); return; }
    if (!document.querySelector('link[data-leaflet]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/libs/leaflet.css';
      css.dataset.leaflet = '1';
      document.head.appendChild(css);
    }
    const s = document.createElement('script');
    s.src = '/libs/leaflet.js';
    s.onload = () => (w.L ? resolve(w.L) : reject(new Error('No se pudo iniciar el mapa')));
    s.onerror = () => { cargaLeaflet = null; reject(new Error('No se pudo cargar el mapa')); };
    document.head.appendChild(s);
  });
  return cargaLeaflet;
}

export const COLOR_ESTADO: Record<EstadoUnidad, string> = {
  movimiento: '#0284c7', ralenti: '#ea580c', detenido: '#10b981', sin_senal: '#94a3b8',
};

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/** Camión visto de lado, con flecha de rumbo y placa. El color indica el estado de la unidad. */
function iconoHtml(u: UnidadMapa, estado: EstadoUnidad) {
  const color = COLOR_ESTADO[estado];
  const marca = estado === 'movimiento'
    ? `<span style="color:#0284c7;font-weight:800;margin-left:3px">${Math.round(u.velocidad)} km/h</span>`
    : estado === 'ralenti' ? '<span style="color:#ea580c;font-weight:800;margin-left:3px">ON</span>' : '';
  return `
    <div class="gps-camion">
      <div class="gps-camion__flecha" style="transform:rotate(${Math.round(u.rumbo)}deg)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="${color}" stroke="#ffffff" stroke-width="1.5"><polygon points="12,2 22,22 12,17 2,22"/></svg>
      </div>
      <svg width="44" height="28" viewBox="0 0 48 32" fill="none" class="gps-camion__cuerpo">
        <rect x="2" y="7" width="28" height="16" rx="2" fill="#f8fafc" stroke="#334155" stroke-width="1.6"/>
        <path d="M30 11 L40 11 L44 17 L44 23 L30 23 Z" fill="${estado === 'sin_senal' ? '#e2e8f0' : '#ffffff'}" stroke="#1e293b" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M33 13 L39 13 L41.5 17 L33 17 Z" fill="#0284c7"/>
        <circle cx="10" cy="25" r="3.4" fill="#0f172a" stroke="#64748b" stroke-width="1.2"/>
        <circle cx="20" cy="25" r="3.4" fill="#0f172a" stroke="#64748b" stroke-width="1.2"/>
        <circle cx="37" cy="25" r="3.4" fill="#0f172a" stroke="#64748b" stroke-width="1.2"/>
      </svg>
      <div class="gps-camion__placa" style="border-color:${color}">${esc(u.placa)}${marca}</div>
    </div>`;
}

/** Pin circular para inicio, fin, paradas y excesos */
const pinHtml = (color: string, simbolo: string) =>
  `<div class="gps-pin" style="background:${color}">${simbolo}</div>`;

/** Duración de cada deslizamiento: la misma que el intervalo de actualización (4 s) */
const DURACION_MOVIMIENTO = 3800;

interface Props {
  unidades: UnidadMapa[];
  ocultas: Set<string>;
  /** Placa de la unidad elegida (y de su historial, si está abierto) */
  seleccionada: string | null;
  /** Con la ficha abierta en celular, la unidad se ubica en la mitad superior del mapa */
  fichaAbierta: boolean;
  capa: CapaMapa;
  /** Cada vez que cambia, el mapa encuadra toda la flota visible */
  encuadreVersion: number;
  /** Placas buscadas: el mapa se acerca a ellas */
  encuadrarA: string[];
  /** Recorrido que se reproduce (null si no hay historial abierto) */
  historial: Historial | null;
  /** Punto del recorrido que se muestra */
  indice: number;
  onElegir: (placa: string) => void;
}

const estadoPunto = (velocidad: number, ignicion: boolean): EstadoUnidad => (velocidad > 3 ? 'movimiento' : ignicion ? 'ralenti' : 'detenido');

export function UbicacionMapa({ unidades, ocultas, seleccionada, fichaAbierta, capa, encuadreVersion, encuadrarA, historial, indice, onElegir }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const leaflet = useRef<Leaflet>(null);
  const mapa = useRef<Leaflet>(null);
  const capas = useRef<Record<CapaMapa, Leaflet> | null>(null);
  const marcadores = useRef(new Map<string, Leaflet>());
  const animaciones = useRef(new Map<string, number>());
  const grupoHistorial = useRef<Leaflet>(null);
  const camionHistorial = useRef<Leaflet>(null);
  const elegirRef = useRef(onElegir);
  elegirRef.current = onElegir;
  const encuadradoInicial = useRef(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState('');
  const [atribucion, setAtribucion] = useState(false);
  const claveBusqueda = encuadrarA.join('|');
  const conHistorial = !!historial;

  // Crear el mapa una vez
  useEffect(() => {
    let vivo = true;
    const animadas = animaciones.current;
    const marcadoresActuales = marcadores.current;
    cargarLeaflet().then(L => {
      if (!vivo || !contenedor.current) return;
      leaflet.current = L;
      // Sin el pie de atribución de Leaflet; la atribución de los mapas base está en el botón "i"
      const m = L.map(contenedor.current, { center: [-9.19, -75.015], zoom: 6, zoomControl: false, attributionControl: false });
      L.control.zoom({ position: 'bottomright' }).addTo(m);
      capas.current = {
        calle: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }),
        satelite: L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 20 }),
      };
      capas.current.calle.addTo(m);
      mapa.current = m;
      setListo(true);
    }).catch((err: Error) => { if (vivo) setError(err.message); });
    return () => {
      vivo = false;
      animadas.forEach(id => cancelAnimationFrame(id));
      animadas.clear();
      mapa.current?.remove();
      mapa.current = null;
      capas.current = null;
      marcadoresActuales.clear();
    };
  }, []);

  // Ajustar el mapa cuando cambia el contenedor (por ejemplo, al mostrarlo en celular)
  useEffect(() => {
    const el = contenedor.current;
    if (!el || !listo) return;
    const observador = new ResizeObserver(() => mapa.current?.invalidateSize());
    observador.observe(el);
    return () => observador.disconnect();
  }, [listo]);

  // Calle o satelital
  useEffect(() => {
    const m = mapa.current;
    const c = capas.current;
    if (!m || !c) return;
    const otra = capa === 'calle' ? 'satelite' : 'calle';
    c[otra].remove();
    c[capa].addTo(m);
  }, [capa, listo]);

  // Camiones en vivo: se crean, se deslizan a su nueva posición y se quitan según la flota visible.
  // Con el historial abierto, la flota en vivo se oculta y se ve solo el recorrido.
  useEffect(() => {
    const L = leaflet.current;
    const m = mapa.current;
    if (!listo || !L || !m) return;
    const vigentes = new Set<string>();
    for (const u of unidades) {
      if (conHistorial || u.lat == null || u.lng == null || ocultas.has(u.placa)) continue;
      vigentes.add(u.placa);
      const icono = L.divIcon({ className: 'gps-camion-icono', html: iconoHtml(u, estadoUnidad(u)), iconSize: [64, 50], iconAnchor: [32, 25] });
      const existente = marcadores.current.get(u.placa);
      if (existente) {
        existente.setIcon(icono);
        deslizar(u.placa, existente, [u.lat, u.lng]);
      } else {
        const nuevo = L.marker([u.lat, u.lng], { icon: icono, title: u.placa }).addTo(m);
        nuevo.on('click', () => elegirRef.current(u.placa));
        marcadores.current.set(u.placa, nuevo);
      }
    }
    for (const [placa, marcador] of marcadores.current) {
      if (!vigentes.has(placa)) {
        cancelAnimationFrame(animaciones.current.get(placa) ?? 0);
        animaciones.current.delete(placa);
        marcador.remove();
        marcadores.current.delete(placa);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidades, ocultas, listo, conHistorial]);

  // Desliza el camión desde donde está hasta la posición nueva
  function deslizar(placa: string, marcador: Leaflet, destino: [number, number]) {
    const origen = marcador.getLatLng();
    const dLat = destino[0] - origen.lat;
    const dLng = destino[1] - origen.lng;
    if (Math.abs(dLat) < 1e-7 && Math.abs(dLng) < 1e-7) return;
    cancelAnimationFrame(animaciones.current.get(placa) ?? 0);
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const p = Math.min(1, (ahora - inicio) / DURACION_MOVIMIENTO);
      marcador.setLatLng([origen.lat + dLat * p, origen.lng + dLng * p]);
      if (p < 1) animaciones.current.set(placa, requestAnimationFrame(paso));
      else animaciones.current.delete(placa);
    };
    animaciones.current.set(placa, requestAnimationFrame(paso));
  }

  // Historial: ruta, inicio, fin, paradas, excesos y el camión de la reproducción
  useEffect(() => {
    const L = leaflet.current;
    const m = mapa.current;
    if (!listo || !L || !m) return;
    if (grupoHistorial.current) { grupoHistorial.current.remove(); grupoHistorial.current = null; camionHistorial.current = null; }
    if (!historial || historial.puntos.length === 0) return;

    const puntos = historial.puntos;
    const ruta = puntos.map(p => [p.lat, p.lng] as [number, number]);
    const g = L.layerGroup();
    L.polyline(ruta, { color: '#0284c7', weight: 5, opacity: 0.9, lineJoin: 'round' }).addTo(g);

    const inicio = puntos[0];
    const fin = puntos[puntos.length - 1];
    const marcaPin = (p: { lat: number; lng: number }, color: string, simbolo: string, texto: string, clase: string) =>
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: `gps-pin-marca ${clase}`, html: pinHtml(color, simbolo), iconSize: [26, 26], iconAnchor: [13, 13] }),
      }).bindTooltip(texto).addTo(g);
    marcaPin(inicio, '#16a34a', '▶', `Inicio · ${fechaHora(inicio.tiempo)}`, 'gps-pin-marca--inicio');
    marcaPin(fin, '#0f172a', '■', `Fin · ${fechaHora(fin.tiempo)}`, 'gps-pin-marca--fin');
    historial.paradas.forEach((s, i) => marcaPin(s, '#ea580c', 'II', `Parada ${i + 1} · ${s.durMin} min`, 'gps-pin-marca--parada'));
    historial.excesos.forEach(e => marcaPin(e, '#dc2626', '!', `Exceso · ${Math.round(e.velocidad)} km/h`, 'gps-pin-marca--exceso'));

    const primero = { placa: seleccionada ?? '', nombre: '', empresa: '', tipo: '', marcaModelo: '', km: 0, horas: 0, id: null, altitud: null, satelites: null, voltaje: '', ubicacion: '' };
    camionHistorial.current = L.marker([inicio.lat, inicio.lng], {
      icon: L.divIcon({ className: 'gps-camion-icono', html: iconoHtml({ ...primero, lat: inicio.lat, lng: inicio.lng, velocidad: inicio.velocidad, rumbo: inicio.curso, ignicion: inicio.ignicion }, estadoPunto(inicio.velocidad, inicio.ignicion)), iconSize: [64, 50], iconAnchor: [32, 25] }),
      zIndexOffset: 2000,
    }).addTo(g);
    g.addTo(m);
    grupoHistorial.current = g;
    m.fitBounds(ruta, { padding: [56, 56] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historial, listo]);

  // El camión de la reproducción avanza por la ruta, y el mapa lo sigue si se sale de la vista
  useEffect(() => {
    const L = leaflet.current;
    const m = mapa.current;
    const camion = camionHistorial.current;
    if (!L || !m || !camion || !historial) return;
    const p = historial.puntos[indice];
    if (!p) return;
    const u = { placa: seleccionada ?? '', nombre: '', empresa: '', tipo: '', marcaModelo: '', km: 0, horas: 0, id: null, altitud: null, satelites: null, voltaje: '', ubicacion: '', lat: p.lat, lng: p.lng, velocidad: p.velocidad, rumbo: p.curso, ignicion: p.ignicion };
    camion.setLatLng([p.lat, p.lng]);
    camion.setIcon(L.divIcon({ className: 'gps-camion-icono', html: iconoHtml(u, estadoPunto(p.velocidad, p.ignicion)), iconSize: [64, 50], iconAnchor: [32, 25] }));
    if (!m.getBounds().contains([p.lat, p.lng])) m.panTo([p.lat, p.lng], { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice, historial]);

  // Encuadrar toda la flota: la primera vez y cuando lo pide el usuario
  useEffect(() => {
    const L = leaflet.current;
    const m = mapa.current;
    if (!listo || !L || !m || conHistorial) return;
    const puntos = unidades
      .filter(u => u.lat != null && u.lng != null && !ocultas.has(u.placa))
      .map(u => [u.lat as number, u.lng as number] as [number, number]);
    if (!puntos.length) return;
    if (!encuadradoInicial.current || encuadreVersion > 0) {
      encuadradoInicial.current = true;
      m.fitBounds(L.latLngBounds(puntos), { padding: [48, 48], maxZoom: 15 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, encuadreVersion]);

  // Búsqueda: el mapa se acerca a las unidades encontradas
  useEffect(() => {
    const L = leaflet.current;
    const m = mapa.current;
    if (!listo || !L || !m || !claveBusqueda) return;
    const puntos = unidades
      .filter(u => u.lat != null && u.lng != null && claveBusqueda.split('|').includes(u.placa))
      .map(u => [u.lat as number, u.lng as number] as [number, number]);
    if (!puntos.length) return;
    m.fitBounds(L.latLngBounds(puntos), { padding: [64, 64], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveBusqueda, listo]);

  // Al elegir una unidad, el mapa va hasta ella, y la deja visible por encima de la ficha en celular
  useEffect(() => {
    const m = mapa.current;
    if (!m || !seleccionada || conHistorial) return;
    const u = unidades.find(x => x.placa === seleccionada);
    if (!u || u.lat == null || u.lng == null) return;
    // El mapa acaba de mostrarse (antes tenía tamaño cero): se recalcula antes de centrar
    m.invalidateSize({ animate: false });
    // En celular con el detalle abierto, la unidad queda en la parte de arriba del mapa: se centra un punto al sur
    const z = Math.max(m.getZoom(), 15);
    const movil = window.matchMedia('(max-width: 899px)').matches;
    const destino = movil && fichaAbierta
      ? m.unproject(m.project([u.lat, u.lng], z).add([0, m.getSize().y * 0.2]), z)
      : [u.lat, u.lng];
    m.setView(destino, z, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionada]);

  return (
    <div className="gps-mapa">
      <div ref={contenedor} className="gps-mapa__lienzo" />
      <div className="gps-atribucion-caja">
        {atribucion && <div className="gps-atribucion">© OpenStreetMap · © Google</div>}
        <button type="button" className="gps-atribucion-btn" aria-label="Atribución del mapa" aria-expanded={atribucion}
          onClick={() => setAtribucion(a => !a)}>i</button>
      </div>
      {error && <div className="gps-mapa__aviso">{error}</div>}
    </div>
  );
}
