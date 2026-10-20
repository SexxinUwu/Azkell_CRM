// Mapa del recorrido GPS del tracto durante el viaje (Leaflet desde /libs, como Flota > Ubicación).
// Usa el mismo historial de Wialon que la pantalla de Ubicación (/script/obtenerHistorialGPS con rango de fechas).
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Notice } from '../../core/ui/Display';
import { api, errorMessage } from '../../core/api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Leaflet = any;
const MAX_PUNTOS = 1500;

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

interface Punto { lat: number; lng: number; t: number; vel: number }
interface Traza { puntos: Punto[]; total: number; km: number; velMax: number; velProm: number; paradas: number; paradaMin: number }

const hora = (seg: number) => new Date(seg * 1000).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
// Las fechas del viaje son hora de Perú (UTC-5, sin horario de verano): se envían con su desfase para que el servidor no dependa de su zona horaria
const aIso = (s: string) => s.trim().replace(' ', 'T') + '-05:00';

export function MapaRecorridoViaje({ placa, inicio, fin }: { placa: string; inicio: string; fin: string }) {
  const q = useQuery({
    queryKey: ['operaciones', 'gps-traza', placa, inicio, fin],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Traza> => {
      const r = await api<{ data?: Record<string, unknown> }>('/script/obtenerHistorialGPS', {
        method: 'POST',
        body: { args: [{ placa, fechaInicio: aIso(inicio), fechaFin: aIso(fin) }] },
      });
      const d = (r?.data ?? {}) as Record<string, unknown>;
      if (d.error) throw new Error(String(d.error));
      const crudos = (Array.isArray(d.puntos) ? d.puntos : []) as Array<Record<string, unknown>>;
      const todos: Punto[] = crudos
        .map(p => ({ lat: Number(p.lat), lng: Number(p.lng), t: Number(p.tiempo), vel: Number(p.velocidad) || 0 }))
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat !== 0 && p.lng !== 0);
      // Submuestreo uniforme conservando el primer y último punto
      let puntos = todos;
      if (todos.length > MAX_PUNTOS) {
        const paso = (todos.length - 1) / (MAX_PUNTOS - 1);
        puntos = Array.from({ length: MAX_PUNTOS }, (_, i) => todos[Math.round(i * paso)]);
      }
      const m = (d.metricas ?? {}) as Record<string, unknown>;
      return {
        puntos, total: todos.length, km: Number(m.totalKm) || 0, velMax: Number(m.maxSpeed) || 0, velProm: Number(m.avgSpeed) || 0,
        paradas: Number(m.paradasTotal) || 0, paradaMin: Number(m.tiempoDetenidoMin) || 0,
      };
    },
  });

  const contenedor = useRef<HTMLDivElement>(null);
  const [errorMapa, setErrorMapa] = useState('');
  const puntos = q.data?.puntos;

  useEffect(() => {
    if (!puntos || puntos.length === 0) return;
    let vivo = true;
    let mapa: Leaflet = null;
    cargarLeaflet().then(L => {
      if (!vivo || !contenedor.current) return;
      mapa = L.map(contenedor.current, { zoomControl: true, attributionControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapa);
      const linea = L.polyline(puntos.map(p => [p.lat, p.lng]), { color: '#0284c7', weight: 4, opacity: 0.9 }).addTo(mapa);
      const a = puntos[0];
      const b = puntos[puntos.length - 1];
      const marca = (p: Punto, color: string, etiqueta: string) =>
        L.circleMarker([p.lat, p.lng], { radius: 8, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 1 })
          .addTo(mapa).bindPopup(`<b>${etiqueta}</b><br>${hora(p.t)}<br>${Math.round(p.vel)} km/h`);
      marca(a, '#10b981', 'Inicio');
      marca(b, '#dc2626', 'Fin');
      mapa.fitBounds(linea.getBounds(), { padding: [24, 24] });
      setTimeout(() => mapa?.invalidateSize(), 50);
    }).catch((e: Error) => { if (vivo) setErrorMapa(e.message); });
    return () => { vivo = false; mapa?.remove(); };
  }, [puntos]);

  if (q.isLoading) return <div className="tarjeta__lista"><div className="dato"><span className="dato__valor">Cargando recorrido…</span></div></div>;
  if (q.isError) return <Notice tone="error">{errorMessage(q.error)}</Notice>;
  const t = q.data;
  if (!t || t.puntos.length === 0) {
    return <div className="tarjeta__lista"><div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>El GPS no registró posiciones de {placa} entre el inicio y el fin del viaje.</span></div></div>;
  }
  const dato = (label: string, valor: string) => <div className="dato"><span className="dato__label">{label}</span><span className="dato__valor dato__valor--mono">{valor}</span></div>;
  return (
    <div style={{ marginTop: 'var(--s-2)' }}>
      {errorMapa && <Notice tone="error">{errorMapa}</Notice>}
      <div ref={contenedor} style={{ height: 320, borderRadius: 12, overflow: 'hidden', background: 'var(--fill, #e5e7eb)' }} />
      <div className="tarjeta__lista" style={{ marginTop: 'var(--s-2)' }}>
        {dato('Tramo', `${hora(t.puntos[0].t)} → ${hora(t.puntos[t.puntos.length - 1].t)}`)}
        {dato('Distancia trazada', `${t.km.toLocaleString('es-PE', { maximumFractionDigits: 1 })} km`)}
        {dato('Velocidad máx. / prom.', `${t.velMax} / ${t.velProm} km/h`)}
        {dato('Paradas (≥3 min)', `${t.paradas} · ${t.paradaMin} min`)}
        {dato('Puntos GPS', t.total > t.puntos.length ? `${t.puntos.length} de ${t.total} (reducidos)` : String(t.total))}
      </div>
    </div>
  );
}
