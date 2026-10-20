import { useEffect, useRef } from 'react';
import type { Unidad } from './tipos';

// Mapa de la flota con Leaflet (se carga desde /libs, igual que la aplicación). Cada unidad es un marcador con su placa y su rumbo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Leaflet = any;
let carga: Promise<Leaflet> | null = null;
function cargarLeaflet(): Promise<Leaflet> {
  if (carga) return carga;
  carga = new Promise((resolve, reject) => {
    const w = window as unknown as { L?: Leaflet };
    if (w.L) { resolve(w.L); return; }
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = '/libs/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = '/libs/leaflet.js';
    s.onload = () => (w.L ? resolve(w.L) : reject(new Error('Mapa no disponible')));
    s.onerror = () => { carga = null; reject(new Error('No se pudo cargar el mapa')); };
    document.head.appendChild(s);
  });
  return carga;
}

export type CapaMapa = 'calle' | 'satelite';
const clase = (u: Unidad) => ((u.velocidad ?? 0) > 3 ? 'mov' : u.estado_motor === 'ralenti' ? 'ral' : 'det');

const pin = (u: Unidad, activo: boolean) =>
  `<div class="tv-pin tv-pin--${clase(u)}${activo ? ' tv-pin--activo' : ''}">` +
  `<span class="tv-pin__placa">${u.placa}</span>` +
  `<span class="tv-pin__flecha" style="transform:rotate(${Math.round(u.curso ?? 0)}deg)"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2l7 18-7-4-7 4z" fill="currentColor"/></svg></span></div>`;

export function MapaTv({ unidades, enfoque, capa, ajuste }: { unidades: Unidad[]; enfoque: string | null; capa: CapaMapa; ajuste: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<Leaflet>(null);
  const marcadores = useRef<Record<string, Leaflet>>({});
  const capas = useRef<Record<string, Leaflet>>({});
  const L = useRef<Leaflet>(null);
  const encuadrado = useRef(false);
  const ultimoAjuste = useRef(-1);

  // Crear el mapa una vez
  useEffect(() => {
    let vivo = true;
    cargarLeaflet().then(lib => {
      if (!vivo || !caja.current || mapa.current) return;
      L.current = lib;
      const m = lib.map(caja.current, { center: [-9.19, -75.015], zoom: 6, zoomControl: false, attributionControl: false });
      capas.current = {
        calle: lib.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }),
        satelite: lib.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 20 }),
      };
      capas.current.calle.addTo(m);
      mapa.current = m;
      setTimeout(() => m.invalidateSize(), 300);
    }).catch(() => { /* sin mapa: la lista sigue funcionando */ });
    return () => { vivo = false; if (mapa.current) { mapa.current.remove(); mapa.current = null; marcadores.current = {}; } };
  }, []);

  // Capa callejero / satelital
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    Object.values(capas.current).forEach(c => m.removeLayer(c));
    (capas.current[capa] ?? capas.current.calle)?.addTo(m);
  }, [capa, unidades.length]);

  // Marcadores
  useEffect(() => {
    const m = mapa.current, lib = L.current;
    if (!m || !lib) return;
    const vistos = new Set<string>();
    const puntos: Array<[number, number]> = [];
    unidades.forEach(u => {
      if (!u.lat || !u.lng) return;
      vistos.add(u.placa);
      puntos.push([u.lat, u.lng]);
      const icono = lib.divIcon({ className: 'tv-pin-caja', html: pin(u, u.placa === enfoque), iconSize: [150, 60], iconAnchor: [75, 50] });
      const existente = marcadores.current[u.placa];
      if (existente) { existente.setLatLng([u.lat, u.lng]); existente.setIcon(icono); }
      else marcadores.current[u.placa] = lib.marker([u.lat, u.lng], { icon: icono }).addTo(m);
    });
    Object.keys(marcadores.current).forEach(p => { if (!vistos.has(p)) { m.removeLayer(marcadores.current[p]); delete marcadores.current[p]; } });
    // Encuadre: la primera vez y cada vez que cambia el filtro (ajuste); no mientras hay una unidad enfocada
    if (puntos.length && !enfoque && (!encuadrado.current || ultimoAjuste.current !== ajuste)) {
      m.fitBounds(puntos, { padding: [60, 60], maxZoom: 13 });
      encuadrado.current = true; ultimoAjuste.current = ajuste;
    }
  }, [unidades, enfoque, ajuste]);

  // Enfocar una unidad
  useEffect(() => {
    const m = mapa.current;
    if (!m || !enfoque) return;
    const u = unidades.find(x => x.placa === enfoque);
    if (u && u.lat && u.lng) m.flyTo([u.lat, u.lng], 15, { duration: 1 });
  }, [enfoque]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={caja} className="tv-mapa" />;
}
