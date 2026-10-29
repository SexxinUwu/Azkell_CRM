// Calca de la pestaña "Seguimiento GPS" del Monitoreo Operativo de la versión actual
// (modulos/operaciones/ordenes-viaje: panel ov-mon-panel-gps, ovRenderGpsMap y la telemetría de la tarjeta).
import './monitoreo.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from '../../core/ui/Sheet';
import { useCssClasico } from '../../core/lib/clasicoCss';
import { estadoUnidad, useUnidadesGps, type EstadoUnidad, type UnidadMapa } from '../flota/api';
import { cargarLeaflet } from './ViajeMapaGps';

const CSS_CLASICO = ['/libs/bootstrap.min.css', '/libs/bootstrap-icons.css'] as const;

export interface ViajeMonitoreo {
  viaje: string;
  placa_tracto: string | null;
  ruta: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

// ovRenderGpsMap: coordenadas base por ciudad / punto conocido en Perú (copiadas de la versión actual)
const CIUDADES_COORDS: Record<string, [number, number]> = {
  'AREQUIPA': [-16.409047, -71.537451],
  'TRUJILLO': [-8.11599, -79.02998],
  'CHICLAYO': [-6.77137, -79.84088],
  'PIURA': [-5.19449, -80.63282],
  'CUSCO': [-13.53195, -71.96746],
  'HUANCAYO': [-12.06513, -75.20486],
  'ICA': [-14.06777, -75.72861],
  'PISCO': [-13.710278, -76.205],
  'CHINCHA': [-13.41847, -76.13235],
  'TACNA': [-18.00657, -70.24627],
  'CHIMBOTE': [-9.07444, -78.59361],
  'LIMA': [-12.046374, -77.042793],
  'CALLAO': [-12.0565, -77.1181],
};
const CARDINALES = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const placaLimpia = (s: string | null | undefined) => String(s ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const fechaSinT = (s: string | null) => (s ? String(s).replace('T', ' ').slice(0, 19) : '');
const ETIQUETA_ESTADO: Record<EstadoUnidad, string> = { movimiento: 'EN MOVIMIENTO', ralenti: 'RALENTÍ', detenido: 'DETENIDO', sin_senal: 'SIN SEÑAL' };

// Modal del monitoreo (ovAbrirModalMonitoreoViaje). Aquí se copia la pestaña GPS.
export function MonitoreoViajeSheet({ viaje, onClose }: { viaje: ViajeMonitoreo | null; onClose: () => void }) {
  useCssClasico(CSS_CLASICO);
  return (
    <Sheet open={!!viaje} onClose={onClose} title="Monitoreo Operativo" ancho>
      {viaje && <PanelGps viaje={viaje} />}
    </Sheet>
  );
}

function PanelGps({ viaje }: { viaje: ViajeMonitoreo }) {
  const q = useUnidadesGps();
  const p = placaLimpia(viaje.placa_tracto);
  const unidad: UnidadMapa | null = useMemo(() => (q.data ?? []).find(u => placaLimpia(u.placa) === p) ?? null, [q.data, p]);
  const mapaEl = useRef<HTMLDivElement>(null);
  const [errorMapa, setErrorMapa] = useState('');

  // ovRenderGpsMap: partida fija en Lima / Callao y llegada según el texto de la ruta
  const rutaTxt = (viaje.ruta ?? '').trim();
  const partidaTxt = 'LIMA / CALLAO';
  const llegadaTxt = rutaTxt || 'DESTINO NACIONAL';
  const destino = useMemo<[number, number]>(() => {
    let endCoords: [number, number] = [-16.409047, -71.537451];
    const matchKey = Object.keys(CIUDADES_COORDS).find(c => rutaTxt.toUpperCase().includes(c));
    if (matchKey && matchKey !== 'LIMA' && matchKey !== 'CALLAO') endCoords = CIUDADES_COORDS[matchKey];
    else if (matchKey === 'CALLAO' || matchKey === 'LIMA') endCoords = [-12.000, -77.000];
    return endCoords;
  }, [rutaTxt]);

  useEffect(() => {
    let vivo = true;
    let mapa: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    const startCoords: [number, number] = [-12.046374, -77.042793];
    cargarLeaflet().then(L => {
      if (!vivo || !mapaEl.current) return;
      mapa = L.map(mapaEl.current, { zoomControl: true, attributionControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapa);
      const startIcon = L.divIcon({
        className: 'ov-map-marker-start',
        html: '<div style="background:#16a34a; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid #fff;"><i class="bi bi-geo-alt-fill" style="font-size:14px;"></i></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      const endIcon = L.divIcon({
        className: 'ov-map-marker-end',
        html: '<div style="background:#dc2626; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid #fff;"><i class="bi bi-flag-fill" style="font-size:13px;"></i></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      L.marker(startCoords, { icon: startIcon }).addTo(mapa).bindPopup(`<b>Punto de Partida:</b><br>${partidaTxt}`);
      L.marker(destino, { icon: endIcon }).addTo(mapa).bindPopup(`<b>Punto de Llegada:</b><br>${llegadaTxt}`);
      L.polyline([startCoords, destino], { color: '#0284c7', weight: 4, opacity: 0.85, dashArray: '8, 8' }).addTo(mapa);
      mapa.fitBounds(L.latLngBounds([startCoords, destino]), { padding: [50, 50] });
      setTimeout(() => { if (mapa) mapa.invalidateSize(); }, 150);
    }).catch((e: Error) => { if (vivo) setErrorMapa(e.message); });
    return () => { vivo = false; if (mapa) mapa.remove(); };
  }, [destino, partidaTxt, llegadaTxt]);

  // Telemetría: la unidad del GPS (Wialon) cuando está disponible; si no, guiones
  const estado = unidad ? estadoUnidad(unidad) : null;
  const velocidadTxt = unidad ? Math.round(unidad.velocidad) : '—';
  const headingTxt = unidad ? `${Math.round(unidad.rumbo)}° ${CARDINALES[Math.round(((unidad.rumbo % 360) + 360) % 360 / 45) % 8]}` : '—';
  const conSenal = !!unidad && unidad.lat != null && unidad.lng != null;

  // Reportes del viaje: inicio y fin (la tabla de la versión actual muestra estos dos eventos)
  const reportes: Array<{ n: number; fecha: string; descripcion: string; clase: string }> = [];
  if (viaje.fecha_fin) reportes.push({ n: 2, fecha: fechaSinT(viaje.fecha_fin), descripcion: 'FIN DE VIAJE', clase: 'bg-danger-subtle text-danger border' });
  if (viaje.fecha_inicio) reportes.push({ n: 1, fecha: fechaSinT(viaje.fecha_inicio), descripcion: 'INICIO DE VIAJE', clase: 'bg-success-subtle text-success border' });

  return (
    <div>
      {errorMapa && <div className="alert alert-danger py-2">{errorMapa}</div>}
      <div className="ov-mon-card-section stagger-child">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 pb-2 border-bottom">
          <div>
            <div className="d-flex align-items-center gap-2">
              <span className="ov-beacon-dot"></span>
              <span className="fw-bolder text-dark" style={{ fontSize: '1rem', letterSpacing: '-0.2px' }}>Telemetría Satelital GNSS / 4G LTE</span>
            </div>
            <small className="text-secondary" style={{ fontSize: '0.73rem' }}>
              {unidad ? `${unidad.nombre || unidad.placa} • ${unidad.satelites ?? '—'} Satélites en línea` : `${p || viaje.placa_tracto || '—'} • Sin datos del GPS`}
            </small>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-success-subtle text-success border border-success-subtle px-3 py-1 font-monospace fw-bold" style={{ fontSize: '0.75rem', letterSpacing: '0.3px' }}>
              {velocidadTxt} KM/H{estado ? ` • ${ETIQUETA_ESTADO[estado]}` : ''}
            </span>
            <span className="badge bg-light text-secondary border px-3 py-1 font-monospace fw-semibold" style={{ fontSize: '0.75rem', letterSpacing: '0.3px' }}>
              HEADING {headingTxt}
            </span>
          </div>
        </div>

        <div className="row g-3 align-items-stretch">
          <div className="col-12 col-lg-5">
            <div className="border rounded-3 h-100 bg-white d-flex flex-column overflow-hidden">
              <div className="table-responsive flex-grow-1">
                <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: '0.75rem' }}>
                  <thead className="table-light">
                    <tr className="text-uppercase text-secondary" style={{ fontSize: '0.67rem' }}>
                      <th style={{ width: 40 }}>N°</th>
                      <th>FECHA</th>
                      <th>DESCRIPCIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportes.map(r => (
                      <tr key={r.n}>
                        <td className="font-monospace fw-bold text-secondary">{r.n}</td>
                        <td className="font-monospace text-dark">{r.fecha}</td>
                        <td><span className={`badge ${r.clase}`}>{r.descripcion}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-2 bg-light border-top text-muted d-flex justify-content-between" style={{ fontSize: '0.7rem' }}>
                <span>Total Reportes: <strong>{reportes.length}</strong></span>
                {conSenal
                  ? <span className="text-success"><i className="bi bi-broadcast"></i> Señal Óptima</span>
                  : <span className="text-secondary"><i className="bi bi-broadcast"></i> Sin señal</span>}
              </div>
            </div>
          </div>

          <div className="col-12 col-lg-7">
            <div className="position-relative rounded-3 overflow-hidden border shadow-sm h-100" style={{ minHeight: 380, background: '#f8fafc' }}>
              <div ref={mapaEl} style={{ width: '100%', height: '100%', minHeight: 380 }} />
              <div className="position-absolute bottom-0 start-0 m-2 p-2 px-3 rounded-3 bg-white bg-opacity-95 shadow border d-flex align-items-center gap-3" style={{ zIndex: 1000, fontSize: '0.75rem' }}>
                <div>
                  <span className="text-success fw-bold"><i className="bi bi-geo-alt-fill"></i> Partida:</span>
                  <span className="fw-semibold text-dark ms-1">{partidaTxt}</span>
                </div>
                <div className="text-muted">➔</div>
                <div>
                  <span className="text-danger fw-bold"><i className="bi bi-geo-alt-fill"></i> Llegada:</span>
                  <span className="fw-semibold text-dark ms-1">{llegadaTxt}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
