// Mapa de la flota con Leaflet (la misma librería y capas que la versión actual):
// OpenStreetMap para Callejero y Google para Satelital. Cada unidad es un camión con su rumbo y su placa.
import { useEffect, useRef, useState } from 'react';
import { estadoUnidad, type EstadoUnidad, type UnidadMapa } from './api';

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

interface Props {
  unidades: UnidadMapa[];
  ocultas: Set<string>;
  seleccionada: string | null;
  capa: CapaMapa;
  /** Cada vez que cambia, el mapa encuadra la flota visible */
  encuadreVersion: number;
  onElegir: (placa: string) => void;
}

export function UbicacionMapa({ unidades, ocultas, seleccionada, capa, encuadreVersion, onElegir }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const leaflet = useRef<Leaflet>(null);
  const mapa = useRef<Leaflet>(null);
  const capas = useRef<Record<CapaMapa, Leaflet> | null>(null);
  const marcadores = useRef(new Map<string, Leaflet>());
  const elegirRef = useRef(onElegir);
  elegirRef.current = onElegir;
  const encuadradoInicial = useRef(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState('');

  // Crear el mapa una vez
  useEffect(() => {
    let vivo = true;
    cargarLeaflet().then(L => {
      if (!vivo || !contenedor.current) return;
      leaflet.current = L;
      const m = L.map(contenedor.current, { center: [-9.19, -75.015], zoom: 6, zoomControl: false });
      L.control.zoom({ position: 'bottomright' }).addTo(m); // abajo a la derecha: arriba está el botón Toda la flota
      capas.current = {
        calle: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }),
        satelite: L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: '© Google' }),
      };
      capas.current.calle.addTo(m);
      mapa.current = m;
      setListo(true);
    }).catch((err: Error) => { if (vivo) setError(err.message); });
    const marcadoresActuales = marcadores.current;
    return () => {
      vivo = false;
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

  // Camiones: se crean, se mueven y se quitan según la flota visible
  useEffect(() => {
    const L = leaflet.current;
    const m = mapa.current;
    if (!listo || !L || !m) return;
    const vigentes = new Set<string>();
    for (const u of unidades) {
      if (u.lat == null || u.lng == null || ocultas.has(u.placa)) continue;
      vigentes.add(u.placa);
      const icono = L.divIcon({ className: 'gps-camion-icono', html: iconoHtml(u, estadoUnidad(u)), iconSize: [64, 50], iconAnchor: [32, 25] });
      const existente = marcadores.current.get(u.placa);
      if (existente) {
        existente.setLatLng([u.lat, u.lng]);
        existente.setIcon(icono);
      } else {
        const nuevo = L.marker([u.lat, u.lng], { icon: icono, title: u.placa }).addTo(m);
        nuevo.on('click', () => elegirRef.current(u.placa));
        marcadores.current.set(u.placa, nuevo);
      }
    }
    for (const [placa, marcador] of marcadores.current) {
      if (!vigentes.has(placa)) {
        marcador.remove();
        marcadores.current.delete(placa);
      }
    }
  }, [unidades, ocultas, listo]);

  // Encuadrar: la primera vez y cuando lo pida el usuario
  useEffect(() => {
    const L = leaflet.current;
    const m = mapa.current;
    if (!listo || !L || !m) return;
    const puntos = unidades
      .filter(u => u.lat != null && u.lng != null && !ocultas.has(u.placa))
      .map(u => [u.lat as number, u.lng as number] as [number, number]);
    if (!puntos.length) return;
    if (!encuadradoInicial.current || encuadreVersion > 0) {
      encuadradoInicial.current = true;
      m.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 15 });
    }
    // Solo al cambiar la versión de encuadre o la primera vez; los datos nuevos no mueven el mapa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, encuadreVersion]);

  // Al elegir una unidad, el mapa va hasta ella
  useEffect(() => {
    const m = mapa.current;
    if (!m || !seleccionada) return;
    const u = unidades.find(x => x.placa === seleccionada);
    if (u && u.lat != null && u.lng != null) m.setView([u.lat, u.lng], Math.max(m.getZoom(), 14), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionada]);

  return (
    <div className="gps-mapa">
      <div ref={contenedor} className="gps-mapa__lienzo" />
      {error && <div className="gps-mapa__aviso">{error}</div>}
    </div>
  );
}
