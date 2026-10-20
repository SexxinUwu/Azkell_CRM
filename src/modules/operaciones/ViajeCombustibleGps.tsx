import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { api, errorMessage } from '../../core/api/client';
import { MapaRecorridoViaje } from './ViajeMapaGps';

const num = (v: unknown) => Number(v) || 0;
const fmt = (v: unknown, d = 2) => num(v).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
const soles = (v: unknown) => 'S/ ' + fmt(v);

interface Vale { id?: number | string; correlativo?: string | null; fecha?: string | null; estacion?: string | null; proveedor?: string | null; galones?: number | string | null; kilometraje?: number | string | null; importe?: number | string | null; estado?: string | null }
interface Telemetria {
  recorridoKmGps: number | null; combustibleConsumidoGps: number | null; rendimientoGps: number | null; velocidadMaxGps: number | null;
  rpmMediaGps: number | null; rpmMaxGps: number | null; horasMotorGps: number | null; consumoRalentiGps: number | null;
}
interface UnidadGps { placa?: string | null; km?: number | string | null; kilometraje?: number | string | null; km_wialon?: number | string | null; horas_motor?: number | string | null; horas_wialon?: number | string | null; horas?: number | string | null }

// Vales de combustible del viaje (mismo filtro del clásico: /combustible/vales?viaje=)
export function SeccionValesViaje({ codigo }: { codigo: string }) {
  const q = useQuery({
    queryKey: ['operaciones', 'vales-viaje', codigo],
    queryFn: () => api<{ data?: Vale[] }>(`/combustible/vales?viaje=${encodeURIComponent(codigo)}&limit=20`).then(r => r.data ?? []),
    staleTime: 15_000,
  });
  const lista = q.data ?? [];
  const galones = lista.reduce((s, v) => s + num(v.galones), 0);
  const importe = lista.reduce((s, v) => s + num(v.importe), 0);
  return (
    <div>
      <p className="tarjeta__grupo-titulo">Vales de combustible ({lista.length})</p>
      {q.isError && <Notice tone="error">{errorMessage(q.error)}</Notice>}
      {lista.length > 0 && (
        <div className="inv-metricas">
          <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>{fmt(galones)} GL</span><span className="inv-metrica__label">Galones</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>{soles(importe)}</span><span className="inv-metrica__label">Importe</span></div>
        </div>
      )}
      <div className="tarjeta__lista" style={{ marginTop: lista.length ? 'var(--s-2)' : undefined }}>
        {lista.map((v, i) => (
          <div key={v.id ?? i} className="dato" style={{ alignItems: 'center' }}>
            <span className="dato__label" style={{ fontFamily: 'var(--font-mono)' }}>{v.correlativo || '---'} · {String(v.fecha ?? '').slice(0, 10)}</span>
            <span className="dato__valor" style={{ textAlign: 'right' }}>
              {fmt(v.galones)} GL · {soles(v.importe)}{v.kilometraje ? ` · ${fmt(v.kilometraje, 0)} km` : ''}
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--label-2)' }}>{[v.estacion, v.proveedor, v.estado].filter(Boolean).join(' · ')}</span>
            </span>
          </div>
        ))}
        {!q.isLoading && !q.isError && lista.length === 0 && (
          <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>No se registran abastecimientos para este viaje.</span></div>
        )}
      </div>
    </div>
  );
}

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

  const dato = (label: string, valor: number | null | undefined, unidadTxt: string, d = 1) => (
    <div className="dato"><span className="dato__label">{label}</span><span className="dato__valor dato__valor--mono">{valor == null ? '—' : `${fmt(valor, d)} ${unidadTxt}`}</span></div>
  );
  const u = unidad.data;
  const t = tele.data;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="tarjeta__grupo-titulo">GPS del viaje {p ? `(${p})` : ''}</p>
        {!pedida && <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => setPedida(true)} disabled={!p}>Consultar</Button>}
      </div>
      {!pedida && <div className="tarjeta__lista"><div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>{p ? 'Consulta el odómetro, las horas de motor y el consumo que reporta el GPS durante el viaje.' : 'El viaje no tiene tracto asignado.'}</span></div></div>}
      {pedida && (unidad.isFetching || tele.isFetching) && <div className="tarjeta__lista"><div className="dato"><span className="dato__valor">Consultando GPS…</span></div></div>}
      {pedida && unidad.isError && <Notice tone="error">{errorMessage(unidad.error)}</Notice>}
      {pedida && tele.isError && <Notice tone="error">{errorMessage(tele.error)}</Notice>}
      {pedida && !unidad.isFetching && unidad.isSuccess && (
        <div className="tarjeta__lista">
          {u ? (
            <>
              {dato('Odómetro GPS actual', num(u.km ?? u.kilometraje ?? u.km_wialon) || null, 'km', 0)}
              {dato('Horas de motor actuales', num(u.horas_motor ?? u.horas_wialon ?? u.horas) || null, 'h')}
            </>
          ) : <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>La unidad no figura en la disponibilidad de flota.</span></div>}
        </div>
      )}
      {pedida && !!p && !!ini && <MapaRecorridoViaje placa={p} inicio={ini} fin={fi} />}
      {t && (
        <div className="tarjeta__lista" style={{ marginTop: 'var(--s-2)' }}>
          {dato('Recorrido GPS', t.recorridoKmGps, 'km')}{dato('Combustible consumido', t.combustibleConsumidoGps, 'gl')}
          {dato('Rendimiento GPS', t.rendimientoGps, 'km/gl')}{dato('Consumo en ralentí', t.consumoRalentiGps, 'gl')}
          {dato('Velocidad máxima', t.velocidadMaxGps, 'km/h')}{dato('RPM media', t.rpmMediaGps, 'rpm', 0)}{dato('RPM máxima', t.rpmMaxGps, 'rpm', 0)}
          {dato('Horas de motor en el viaje', t.horasMotorGps, 'h')}
        </div>
      )}
    </div>
  );
}
