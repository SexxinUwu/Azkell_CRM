import './flota.css';
import '../mantenimiento/mant.css';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Database, Layers, RefreshCw } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { estadoMotorColor, estadoMotorLabel, useGPS, type UnidadGPS } from './api';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    L: any;
  }
}

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

function cargarLeaflet(): Promise<void> {
  return new Promise((resolve) => {
    if (window.L) { resolve(); return; }
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    if (document.querySelector(`script[src="${LEAFLET_JS}"]`)) {
      const wait = () => window.L ? resolve() : setTimeout(wait, 50);
      wait(); return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

const COLOR_MOTOR: Record<string, string> = {
  en_marcha: '#16a34a',
  ralenti:   '#d97706',
  detenido:  '#2563eb',
  offline:   '#6b7280',
};

// Icono SVG de camión con rotación según curso
function crearIcono(estado: string, curso?: number) {
  const color = COLOR_MOTOR[estado] ?? COLOR_MOTOR.offline;
  const rot = curso ?? 0;
  const html = `<div style="width:38px;height:38px;display:flex;align-items:center;justify-content:center">
    <div style="transform:rotate(${rot}deg);display:flex;align-items:center;justify-content:center">
      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="${color}" filter="drop-shadow(0 1px 2px rgba(0,0,0,.5))">
        <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
      </svg>
    </div>
  </div>`;
  return window.L.divIcon({ html, className: '', iconSize: [38, 38], iconAnchor: [19, 19] });
}

// Interpolación lineal suave entre dos posiciones (60 FPS)
function animarMarcador(
  marker: ReturnType<typeof window.L.marker>,
  desde: [number, number],
  hasta: [number, number],
  duracionMs: number,
  animFrames: React.MutableRefObject<Record<string, number>>,
  placa: string,
) {
  if (animFrames.current[placa]) cancelAnimationFrame(animFrames.current[placa]);
  const latDiff = hasta[0] - desde[0];
  const lngDiff = hasta[1] - desde[1];
  if (Math.abs(latDiff) < 0.00001 && Math.abs(lngDiff) < 0.00001) {
    marker.setLatLng(hasta);
    return;
  }
  const inicio = performance.now();
  function step(now: number) {
    const elapsed = now - inicio;
    const t = Math.min(elapsed / duracionMs, 1);
    marker.setLatLng([desde[0] + latDiff * t, desde[1] + lngDiff * t]);
    if (t < 1) {
      animFrames.current[placa] = requestAnimationFrame(step);
    } else {
      delete animFrames.current[placa];
    }
  }
  animFrames.current[placa] = requestAnimationFrame(step);
}

export function UbicacionPage() {
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useGPS();
  const mapRef        = useRef<HTMLDivElement>(null);
  const mapInst       = useRef<ReturnType<typeof window.L.map> | null>(null);
  const markersMap    = useRef<Record<string, ReturnType<typeof window.L.marker>>>({});
  const posicionesRef = useRef<Record<string, [number, number]>>({});
  const animFrames    = useRef<Record<string, number>>({});
  const [leafletListo, setLeafletListo] = useState(!!window.L);
  const [seleccionada, setSeleccionada] = useState<UnidadGPS | null>(null);
  const [empresa, setEmpresa] = useState('Todas');
  const [capaMapa, setCapaMapa] = useState<'calle' | 'satelite'>('calle');
  const capaRef = useRef<{ calle: ReturnType<typeof window.L.tileLayer> | null; satelite: ReturnType<typeof window.L.tileLayer> | null }>({ calle: null, satelite: null });
  const [countdown, setCountdown] = useState(4);
  const [guardandoCAN, setGuardandoCAN] = useState(false);
  const [msgCAN, setMsgCAN] = useState('');

  // Countdown 4→1 sincronizado con dataUpdatedAt
  useEffect(() => {
    setCountdown(4);
    const timer = setInterval(() => setCountdown(c => Math.max(1, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [dataUpdatedAt]);

  // Cargar Leaflet
  useEffect(() => {
    if (window.L) { setLeafletListo(true); return; }
    cargarLeaflet().then(() => setLeafletListo(true));
  }, []);

  // Crear mapa cuando Leaflet esté listo
  useEffect(() => {
    if (!leafletListo || !mapRef.current || mapInst.current) return;
    const L = window.L;

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    });
    const satLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      attribution: '© Google',
      maxZoom: 20,
    });
    capaRef.current = { calle: osmLayer, satelite: satLayer };

    const map = L.map(mapRef.current, {
      center: [-9.19, -75.01],
      zoom: 6,
      zoomControl: true,
      attributionControl: false,
      layers: [osmLayer],
    });
    map.zoomControl.setPosition('bottomright');
    mapInst.current = map;

    return () => {
      Object.values(animFrames.current).forEach(id => cancelAnimationFrame(id));
      animFrames.current = {};
    };
  }, [leafletListo]);

  // Cambiar capa satelital / callejero
  useEffect(() => {
    const map = mapInst.current;
    const capas = capaRef.current;
    if (!map || !capas.calle || !capas.satelite) return;
    if (capaMapa === 'satelite') {
      if (map.hasLayer(capas.calle)) map.removeLayer(capas.calle);
      capas.satelite.addTo(map);
    } else {
      if (map.hasLayer(capas.satelite)) map.removeLayer(capas.satelite);
      capas.calle.addTo(map);
    }
  }, [capaMapa]);

  // Actualizar marcadores con animación cuando cambian los datos
  useEffect(() => {
    if (!mapInst.current || !data || !window.L) return;
    const L = window.L;
    const map = mapInst.current;

    for (const u of data.unidades) {
      const placa = u.placa;
      if (!placa || !u.lat || !u.lng) {
        if (markersMap.current[placa]) {
          map.removeLayer(markersMap.current[placa]);
          delete markersMap.current[placa];
        }
        continue;
      }

      const nuevaPos: [number, number] = [u.lat, u.lng];
      const icono = crearIcono(u.estado_motor, u.curso as number | undefined);
      const vel = u.velocidad > 0 ? ` · ${Math.round(u.velocidad)} km/h` : '';
      const popup = `<div style="font-family:system-ui;font-size:13px;line-height:1.5">
        <b style="font-size:14px">${u.placa}</b><br>
        ${u.estado_motor === 'en_marcha' ? '🟢 En movimiento' : u.estado_motor === 'ralenti' ? '🟡 Ralentí' : u.estado_motor === 'detenido' ? '🔵 Detenido' : '⚫ Sin señal'}${vel}<br>
        ${u.empresa ? `<span style="color:#888;font-size:12px">${u.empresa}</span>` : ''}
      </div>`;

      if (markersMap.current[placa]) {
        const marker = markersMap.current[placa];
        marker.setIcon(icono);
        const posAnterior = posicionesRef.current[placa];
        if (posAnterior) {
          animarMarcador(marker, posAnterior, nuevaPos, 3800, animFrames, placa);
        } else {
          marker.setLatLng(nuevaPos);
        }
        marker.getPopup()?.setContent(popup);
      } else {
        const marker = L.marker(nuevaPos, { icon: icono });
        marker.bindPopup(popup);
        marker.addTo(map);
        markersMap.current[placa] = marker;
      }
      posicionesRef.current[placa] = nuevaPos;
    }

    // Eliminar marcadores de unidades que ya no están en el feed
    const placasActuales = new Set(data.unidades.map(u => u.placa));
    for (const placa of Object.keys(markersMap.current)) {
      if (!placasActuales.has(placa)) {
        map.removeLayer(markersMap.current[placa]);
        delete markersMap.current[placa];
        delete posicionesRef.current[placa];
      }
    }

    // Primer encuadre automático
    const validas = data.unidades.filter(u => u.lat && u.lng);
    if (validas.length > 0 && !Object.keys(posicionesRef.current).length) {
      const bounds = L.latLngBounds(validas.map(u => [u.lat, u.lng]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [data]);

  const unidades = data?.unidades ?? [];
  const kpis = data?.kpis;
  const empresas = ['Todas', ...Array.from(new Set(unidades.map(u => u.empresa ?? '').filter(Boolean)))];
  const listaFiltrada = empresa === 'Todas' ? unidades : unidades.filter(u => u.empresa === empresa);

  function centrarEnUnidad(u: UnidadGPS) {
    if (!mapInst.current || !u.lat || !u.lng) return;
    mapInst.current.setView([u.lat, u.lng], 14);
    const marker = markersMap.current[u.placa];
    if (marker) marker.openPopup();
    setSeleccionada(u);
  }

  const countdownColor = countdown <= 1 ? 'var(--accent)' : countdown === 2 ? 'var(--amber-ink)' : 'var(--label-2)';

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Ubicación GPS"
        subtitle={kpis ? `${kpis.total} unidades · ${kpis.en_movimiento} en movimiento` : undefined}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
            {/* Countdown */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: '0.75rem', fontWeight: 600, color: countdownColor,
              fontFamily: 'var(--font-mono)',
              background: 'var(--fill-2)', borderRadius: 6, padding: '3px 8px',
              transition: 'color 300ms',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isFetching ? 'var(--accent)' : countdownColor, display: 'inline-block' }} />
              {isFetching ? '…' : `${countdown}s`}
            </div>

            {/* Toggle capa */}
            <button
              type="button"
              title={capaMapa === 'calle' ? 'Cambiar a satelital' : 'Cambiar a mapa'}
              onClick={() => setCapaMapa(c => c === 'calle' ? 'satelite' : 'calle')}
              style={{
                background: capaMapa === 'satelite' ? 'var(--accent)' : 'var(--fill-2)',
                color: capaMapa === 'satelite' ? '#fff' : 'var(--label-1)',
                border: 'none', borderRadius: 6, padding: '5px 8px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                fontSize: '0.75rem', fontWeight: 600,
              }}
            >
              <Layers size={13} />
              {capaMapa === 'satelite' ? 'Satelital' : 'Mapa'}
            </button>

            <MenuOtros opciones={[
              { label: 'Actualizar ahora', icon: <RefreshCw size={17} />, onSelect: () => refetch() },
              {
                label: guardandoCAN ? 'Guardando…' : 'Guardar telemetría CAN',
                icon: <Database size={17} />,
                onSelect: async () => {
                  const unidades = data?.unidades ?? [];
                  if (!unidades.length || guardandoCAN) return;
                  setGuardandoCAN(true);
                  try {
                    await api('/telemetria/guardar-lote', {
                      method: 'POST',
                      body: {
                        items: unidades.map(v => ({
                          placa: v.placa,
                          recorrido_km: v.km,
                          lat_ultimo: v.lat,
                          lng_ultimo: v.lng,
                          estado_motor: v.estado_motor,
                          raw_json: v,
                        })),
                      },
                    });
                    setMsgCAN(`✓ Telemetría guardada para ${unidades.length} unidades`);
                    setTimeout(() => setMsgCAN(''), 4000);
                  } catch { setMsgCAN('Error al guardar telemetría'); setTimeout(() => setMsgCAN(''), 4000); }
                  finally { setGuardandoCAN(false); }
                },
              },
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('flota/ubicacion') },
            ]} />
          </div>
        }
      />

      {isError && <Notice tone="error">{errorMessage(error)}</Notice>}
      {msgCAN && <Notice tone={msgCAN.startsWith('✓') ? 'success' : 'error'}>{msgCAN}</Notice>}

      {kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
          {[
            { label: 'Monitoreadas', valor: kpis.total, color: 'accent' },
            { label: 'Con señal',    valor: kpis.con_senal, color: 'green' },
            { label: 'En movimiento',valor: kpis.en_movimiento, color: 'blue' },
            { label: 'Sin señal',    valor: kpis.sin_senal, color: 'neutral' },
          ].map(k => (
            <div key={k.label} className="tarjeta__lista" style={{ padding: 'var(--s-3)', textAlign: 'center', opacity: isFetching ? 0.6 : 1, transition: 'opacity 200ms' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: `var(--${k.color === 'neutral' ? 'label-2' : k.color + '-ink'})` }}>{k.valor}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--s-3)', height: '62vh', minHeight: 420 }}>
        {/* Panel izquierdo: lista */}
        <div style={{ width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          {empresas.length > 2 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {empresas.map(e => (
                <button key={e} type="button"
                  onClick={() => setEmpresa(e)}
                  style={{
                    fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6,
                    border: `1px solid ${empresa === e ? 'var(--accent)' : 'var(--separator)'}`,
                    background: empresa === e ? 'var(--accent)' : 'transparent',
                    color: empresa === e ? '#fff' : 'var(--label-2)',
                    cursor: 'pointer', fontWeight: 600,
                  }}>
                  {e === 'Todas' ? 'Todas' : e.split(' ')[0]}
                </button>
              ))}
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {isLoading ? <PageLoader /> : listaFiltrada.map((u, i) => {
              const color = estadoMotorColor(u.estado_motor);
              const activa = seleccionada?.placa === u.placa;
              return (
                <button key={u.placa || i} type="button"
                  onClick={() => centrarEnUnidad(u)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    background: activa ? 'var(--fill-3)' : 'transparent',
                    borderRadius: 8, cursor: 'pointer', textAlign: 'left', border: 'none',
                    transition: 'background 100ms',
                  }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: `var(--${color}-ink)`, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem', color: 'var(--accent)' }}>{u.placa}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--label-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {estadoMotorLabel(u.estado_motor)}{u.velocidad > 0 ? ` · ${Math.round(u.velocidad)} km/h` : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mapa */}
        <div style={{ flex: 1, borderRadius: 'var(--radius-2)', overflow: 'hidden', border: '1px solid var(--separator)', position: 'relative' }}>
          {!leafletListo ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PageLoader />
            </div>
          ) : (
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
          )}
        </div>
      </div>
    </Page>
  );
}
