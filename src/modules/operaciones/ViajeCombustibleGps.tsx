import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import './seguimiento.css';
import { MapPin, RefreshCw } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { api, errorMessage } from '../../core/api/client';
import { MapaRecorridoViaje } from './ViajeMapaGps';

const num = (v: unknown) => Number(v) || 0;
const fmt = (v: unknown, d = 2) => num(v).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });

interface Telemetria {
  recorridoKmGps: number | null; combustibleConsumidoGps: number | null; rendimientoGps: number | null; velocidadMaxGps: number | null;
  rpmMediaGps: number | null; rpmMaxGps: number | null; horasMotorGps: number | null; consumoRalentiGps: number | null;
}
interface UnidadGps { placa?: string | null; km?: number | string | null; kilometraje?: number | string | null; km_wialon?: number | string | null; horas_motor?: number | string | null; horas_wialon?: number | string | null; horas?: number | string | null }

// GPS del viaje: odómetro y horas de motor de la unidad (disponibilidad de flota) y telemetría CAN de Wialon entre inicio y fin del viaje.
// Solo se consulta al pedirlo: Wialon es lento y no todas las unidades tienen CAN.
export function SeccionGpsViaje({ placa, inicio, fin }: { placa: string | null; inicio: string | null; fin: string | null }) {
  const [pedida, setPedida] = useState(false);
  const p = (placa ?? '').trim().toUpperCase();
  // Si el viaje no terminó, el periodo llega hasta ahora (hora local)
  const ahora = new Date().toLocaleString('sv-SE');
  const ini = String(inicio ?? '').replace('T', ' ').slice(0, 19);
  const fi = String(fin ?? '').replace('T', ' ').slice(0, 19) || ahora;

  const unidad = useQuery({
    queryKey: ['operaciones', 'gps-unidad', p],
    enabled: pedida && !!p,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await api<unknown>('/disponibilidad-flota');
      const lista = (Array.isArray(r) ? r : ((r as { data?: unknown[] })?.data ?? [])) as UnidadGps[];
      return lista.find(u => String(u.placa ?? '').trim().toUpperCase() === p) ?? null;
    },
  });
  const tele = useQuery({
    queryKey: ['operaciones', 'gps-telemetria', p, ini, fi],
    enabled: pedida && !!p && !!ini,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const qs = new URLSearchParams({ placa: p, fechaInicio: ini, fechaFin: fi });
      const r = await api<{ ok?: boolean; data?: Telemetria | null; error?: string }>(`/combustible/wialon-telemetria?${qs}`);
      if (!r.ok || !r.data) throw new Error(r.error || 'Sin telemetría para este viaje');
      return r.data;
    },
  });

  const kpi = (label: string, valor: number | null | undefined, unidadTxt: string, d = 1) => (
    <div className="vk__t"><span className="vk__l">{label}</span><strong>{valor == null ? '—' : <>{fmt(valor, d)} <small>{unidadTxt}</small></>}</strong></div>
  );
  const u = unidad.data;
  const t = tele.data;
  return (
    <div className="vg">
      <div className="vo__cab">
        <h4 className="vj-titulo" style={{ margin: 0 }}>GPS del viaje{p ? <span className="seg__placa" style={{ marginLeft: 8 }}>{p}</span> : null}</h4>
        {!pedida && <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => setPedida(true)} disabled={!p}>Consultar</Button>}
      </div>
      {!pedida && (
        <EmptyState icon={<MapPin size={22} />} title={p ? 'Consulta lo que reportó el GPS' : 'Sin tracto asignado'}>
          {p ? 'Odómetro, horas de motor, velocidad y recorrido de la unidad durante el viaje.' : 'Asigna un tracto al viaje para ver su GPS.'}
        </EmptyState>
      )}
      {pedida && (unidad.isFetching || tele.isFetching) && <p className="os-nota">Consultando GPS…</p>}
      {pedida && unidad.isError && <Notice tone="error">{errorMessage(unidad.error)}</Notice>}
      {pedida && tele.isError && <Notice tone="error">{errorMessage(tele.error)}</Notice>}
      {pedida && !unidad.isFetching && unidad.isSuccess && (
        u ? (
          <div className="vk">
            {kpi('Odómetro GPS actual', num(u.km ?? u.kilometraje ?? u.km_wialon) || null, 'km', 0)}
            {kpi('Horas de motor actuales', num(u.horas_motor ?? u.horas_wialon ?? u.horas) || null, 'h')}
          </div>
        ) : <p className="os-nota">La unidad no figura en la disponibilidad de flota.</p>
      )}
      {pedida && !!p && !!ini && <MapaRecorridoViaje placa={p} inicio={ini} fin={fi} />}
      {t && (
        <div className="vk">
          {kpi('Recorrido GPS', t.recorridoKmGps, 'km')}
          {kpi('Velocidad máxima', t.velocidadMaxGps, 'km/h')}
          {kpi('RPM media', t.rpmMediaGps, 'rpm', 0)}
          {kpi('RPM máxima', t.rpmMaxGps, 'rpm', 0)}
          {kpi('Horas de motor en el viaje', t.horasMotorGps, 'h')}
        </div>
      )}
    </div>
  );
}
