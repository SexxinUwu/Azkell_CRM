import './flota.css';
import '../mantenimiento/mant.css';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
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

function crearIcono(estado: string) {
  const color = COLOR_MOTOR[estado] ?? COLOR_MOTOR.offline;
  const html = `<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center">
    <div style="width:20px;height:20px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>
  </div>`;
  return window.L.divIcon({ html, className: '', iconSize: [32, 32], iconAnchor: [16, 16] });
}

export function UbicacionPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useGPS();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<ReturnType<typeof window.L.map> | null>(null);
  const markersRef = useRef<ReturnType<typeof window.L.layerGroup> | null>(null);
  const [leafletListo, setLeafletListo] = useState(!!window.L);
  const [seleccionada, setSeleccionada] = useState<UnidadGPS | null>(null);
  const [empresa, setEmpresa] = useState('Todas');

  // Cargar Leaflet
  useEffect(() => {
    if (window.L) { setLeafletListo(true); return; }
    cargarLeaflet().then(() => setLeafletListo(true));
  }, []);

  // Crear mapa cuando Leaflet esté listo
  useEffect(() => {
    if (!leafletListo || !mapRef.current || mapInstanceRef.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, { center: [-9.19, -75.01], zoom: 6 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapInstanceRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);
  }, [leafletListo]);

  // Actualizar marcadores cuando cambian los datos
  useEffect(() => {
    if (!mapInstanceRef.current || !markersRef.current || !data) return;
    const L = window.L;
    markersRef.current.clearLayers();

    const unidades = data.unidades.filter(u => u.lat && u.lng);
    for (const u of unidades) {
      if (!u.lat || !u.lng) continue;
      const marker = L.marker([u.lat, u.lng], { icon: crearIcono(u.estado_motor) });
      const vel = u.velocidad > 0 ? ` · ${Math.round(u.velocidad)} km/h` : '';
      const popup = `<div style="font-family:system-ui;font-size:13px;line-height:1.5">
        <b style="font-size:14px">${u.placa}</b><br>
        ${u.estado_motor === 'en_marcha' ? '🟢 En movimiento' : u.estado_motor === 'ralenti' ? '🟡 Ralentí' : u.estado_motor === 'detenido' ? '🔵 Detenido' : '⚫ Sin señal'}${vel}<br>
        ${u.empresa ? `<span style="color:#666">${u.empresa}</span>` : ''}
      </div>`;
      marker.bindPopup(popup);
      markersRef.current.addLayer(marker);
    }
  }, [data]);

  const unidades = data?.unidades ?? [];
  const kpis = data?.kpis;
  const empresas = ['Todas', ...Array.from(new Set(unidades.map(u => u.empresa ?? '').filter(Boolean)))];
  const listaFiltrada = empresa === 'Todas' ? unidades : unidades.filter(u => u.empresa === empresa);

  function centrarEnUnidad(u: UnidadGPS) {
    if (!mapInstanceRef.current || !u.lat || !u.lng) return;
    mapInstanceRef.current.setView([u.lat, u.lng], 13);
    setSeleccionada(u);
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Ubicación GPS"
        subtitle={kpis ? `${kpis.total} unidades · ${kpis.en_movimiento} en movimiento` : undefined}
        actions={
          <MenuOtros opciones={[
            { label: 'Actualizar', icon: <RefreshCw size={17} />, onSelect: () => refetch() },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('flota/ubicacion') },
          ]} />
        }
      />

      {isError && <Notice tone="error">{errorMessage(error)}</Notice>}

      {kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
          {[
            { label: 'Monitoreadas', valor: kpis.total, color: 'accent' },
            { label: 'Con señal GPS', valor: kpis.con_senal, color: 'green' },
            { label: 'En movimiento', valor: kpis.en_movimiento, color: 'blue' },
            { label: 'Sin señal', valor: kpis.sin_senal, color: 'neutral' },
          ].map(k => (
            <div key={k.label} className="tarjeta__lista" style={{ padding: 'var(--s-3)', textAlign: 'center', opacity: isFetching ? 0.7 : 1, transition: 'opacity 200ms' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: `var(--${k.color === 'neutral' ? 'label-2' : k.color + '-ink'})` }}>{k.valor}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--s-3)', height: '60vh', minHeight: 400 }}>
        {/* Panel izquierdo: lista */}
        <div style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          {empresas.length > 2 && (
            <div style={{ display: 'flex', gap: 'var(--s-1)', flexWrap: 'wrap' }}>
              {empresas.map(e => (
                <button key={e} type="button" className={`chip chip--sm${empresa === e ? ' chip--active' : ''}`}
                  onClick={() => setEmpresa(e)} style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                  {e === 'Todas' ? 'Todas' : e.split(' ')[0]}
                </button>
              ))}
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                    <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {estadoMotorLabel(u.estado_motor)}{u.velocidad > 0 ? ` · ${Math.round(u.velocidad)} km/h` : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mapa */}
        <div style={{ flex: 1, borderRadius: 'var(--radius-2)', overflow: 'hidden', border: '1px solid var(--separator)' }}>
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
