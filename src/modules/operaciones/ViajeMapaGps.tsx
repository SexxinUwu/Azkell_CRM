// Mapa del recorrido GPS del tracto durante el viaje (Leaflet desde /libs, como Flota > Ubicación).
// Usa el mismo historial de Wialon que la pantalla de Ubicación (/script/obtenerHistorialGPS con rango de fechas).
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Notice } from '../../core/ui/Display';
import { api, errorMessage } from '../../core/api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Leaflet = any;
const MAX_PUNTOS = 2500;
// Mismas definiciones que el servidor (routes/legacy.js, obtenerHistorialGPS): parada = velocidad <= 3 km/h durante >= 3 min; exceso = >= 80 km/h
const MAX_PINES = 60;
const UMBRAL_EXCESO = 80;
const UMBRAL_PARADA_MIN = 3;

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
interface Parada { lat: number; lng: number; ini: number; fin: number; min: number }
interface Exceso { lat: number; lng: number; vel: number; ini: number; fin: number }
interface Traza { puntos: Punto[]; paradasPin: Parada[]; excesosPin: Exceso[]; truncado: boolean; total: number; km: number; velMax: number; velProm: number; paradas: number; paradaMin: number }

const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const duracion = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);
const pinHtml = (color: string, simbolo: string) =>
  `<div aria-hidden="true" style="width:24px;height:24px;border-radius:50%;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font:700 12px/1 system-ui,sans-serif">${simbolo}</div>`;
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
        body: { args: [{ placa, fechaInicio: aIso(inicio), fechaFin: aIso(fin), completo: true }] },
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
      const num = (v: unknown) => Number(v);
      const lista = (v: unknown) => (Array.isArray(v) ? v : []) as Array<Record<string, unknown>>;
      const paradasPin: Parada[] = lista(d.paradas)
        .map(p => ({ lat: num(p.lat), lng: num(p.lng), ini: num(p.startT), fin: num(p.endT), min: num(p.durMin) }))
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.min >= UMBRAL_PARADA_MIN)
        .sort((a, b) => b.min - a.min).slice(0, MAX_PINES);
      const excesosPin: Exceso[] = lista(d.excesos)
        .map(e => ({ lat: num(e.lat), lng: num(e.lng), vel: num(e.velocidad), ini: num(e.tiempo), fin: num(e.tiempoFin) || num(e.tiempo) }))
        .filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lng) && e.vel >= UMBRAL_EXCESO)
        .sort((a, b) => b.vel - a.vel).slice(0, MAX_PINES);
      const m = (d.metricas ?? {}) as Record<string, unknown>;
      return {
        puntos, paradasPin, excesosPin, truncado: d.truncado === true, total: Number(d.totalPuntos) || todos.length, km: Number(m.totalKm) || 0, velMax: Number(m.maxSpeed) || 0, velProm: Number(m.avgSpeed) || 0,
        paradas: Number(m.paradasTotal) || 0, paradaMin: Number(m.tiempoDetenidoMin) || 0,
      };
    },
  });

  const contenedor = useRef<HTMLDivElement>(null);
  const [errorMapa, setErrorMapa] = useState('');
  const puntos = q.data?.puntos;
  const paradasPin = q.data?.paradasPin;
  const excesosPin = q.data?.excesosPin;
  const [verParadas, setVerParadas] = useState(true);
  const [verExcesos, setVerExcesos] = useState(true);
  const capas = useRef<{ mapa: Leaflet; paradas: Leaflet; excesos: Leaflet } | null>(null);

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
      const grupoParadas = L.layerGroup();
      const grupoExcesos = L.layerGroup();
      (paradasPin ?? []).forEach(p => {
        L.marker([p.lat, p.lng], {
          title: `Parada de ${duracion(p.min)}`,
          icon: L.divIcon({ className: '', html: pinHtml('#475569', '⏸'), iconSize: [24, 24], iconAnchor: [12, 12] }),
        }).bindPopup(`<b>Parada · ${esc(duracion(p.min))}</b><br>Inicio: ${hora(p.ini)}<br>Fin: ${hora(p.fin)}`).addTo(grupoParadas);
      });
      (excesosPin ?? []).forEach(e => {
        L.marker([e.lat, e.lng], {
          title: `Exceso de velocidad: ${Math.round(e.vel)} km/h`,
          icon: L.divIcon({ className: '', html: pinHtml('#dc2626', '!'), iconSize: [24, 24], iconAnchor: [12, 12] }),
        }).bindPopup(`<b>Exceso de velocidad · máx. ${Math.round(e.vel)} km/h</b><br>${hora(e.ini)}${e.fin > e.ini ? ` → ${hora(e.fin)}` : ''}`).addTo(grupoExcesos);
      });
      capas.current = { mapa, paradas: grupoParadas, excesos: grupoExcesos };
      mapa.fitBounds(linea.getBounds(), { padding: [24, 24] });
      setTimeout(() => mapa?.invalidateSize(), 50);
    }).catch((e: Error) => { if (vivo) setErrorMapa(e.message); });
    return () => { vivo = false; capas.current = null; mapa?.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos, paradasPin, excesosPin]);

  // Mostrar/ocultar cada tipo de pin sin reconstruir el mapa (conserva el zoom)
  useEffect(() => {
    const c = capas.current;
    if (!c) return;
    if (verParadas) c.paradas.addTo(c.mapa); else c.paradas.remove();
    if (verExcesos) c.excesos.addTo(c.mapa); else c.excesos.remove();
  }, [verParadas, verExcesos, puntos, paradasPin, excesosPin, q.dataUpdatedAt]);

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
      <div role="group" aria-label="Marcadores del mapa" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-3, 16px)', marginTop: 'var(--s-2)', fontSize: 13, color: 'var(--label-2)' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={verParadas} onChange={e => setVerParadas(e.target.checked)} />
          <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', background: '#475569', display: 'inline-block' }} />
          Paradas ≥ {UMBRAL_PARADA_MIN} min ({t.paradasPin.length})
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={verExcesos} onChange={e => setVerExcesos(e.target.checked)} />
          <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
          Excesos ≥ {UMBRAL_EXCESO} km/h ({t.excesosPin.length})
        </label>
      </div>
      {t.truncado && <Notice>El viaje es muy largo o denso y el GPS no pudo cargarse completo; el trazado puede tener huecos.</Notice>}
      <div className="tarjeta__lista" style={{ marginTop: 'var(--s-2)' }}>
        {dato('Tramo', `${hora(t.puntos[0].t)} → ${hora(t.puntos[t.puntos.length - 1].t)}`)}
        {dato('Distancia trazada', `${t.km.toLocaleString('es-PE', { maximumFractionDigits: 1 })} km`)}
        {dato('Velocidad máx. / prom.', `${t.velMax} / ${t.velProm} km/h`)}
        {dato(`Paradas (≥${UMBRAL_PARADA_MIN} min)`, `${t.paradas} · ${t.paradaMin} min`)}
        {dato('Puntos GPS', t.total > t.puntos.length ? `${t.puntos.length} de ${t.total} (reducidos)` : String(t.total))}
      </div>
    </div>
  );
}
