import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, History, RotateCcw } from 'lucide-react';
import { api, errorMessage } from '../../core/api/client';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { Sheet } from '../../core/ui/Sheet';
import { exportarExcelHojas } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe } from '../../core/lib/format';
import { useToast } from '../../core/ui/Toast';
import { MM_CRITICO } from './neumaticosSemaforo';

// Historial de una placa (GET /neumaticos/historial-placa/:placa): cada inspección con su resumen y cada
// llanta comparada contra su medición anterior en la misma posición. Por defecto muestra todo; el filtro
// de fechas acota la lista y el Excel al periodo elegido.

interface LlantaHistorial {
  posicion: string; marca: string | null; modelo: string | null; medida: string | null;
  r1: number | null; r2: number | null; r3: number | null; r4: number | null;
  promedio: number | null; presion_ant: string | number | null; presion_actual: string | number | null;
  estado: string | null; alerta_cambio: boolean;
  anterior_mm: number | null; delta_mm: number | null; km_desde_anterior: number | null; mm_por_1000km: number | null;
  observaciones: string | null;
}
interface InspeccionHistorial {
  id_inspeccion: string; fecha: string; km: number | null; km_fuente: 'inspeccion' | 'gps' | null;
  km_desde_anterior: number | null; llantas_cuenta: number; promedio_general: number | null; criticas: number;
  llantas: LlantaHistorial[];
}
interface RespuestaHistorial { ok: boolean; error?: string; placa: string; inspecciones: InspeccionHistorial[] }

const sinDato = (v: string | number | null | undefined): string | number => (v === null || v === undefined || v === '' ? '—' : v);
const mm = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} mm`);
const kmTexto = (v: number | null) => (v === null ? '—' : `${Math.round(v).toLocaleString('es-PE')} km`);
const fuenteTexto = (f: InspeccionHistorial['km_fuente']) => (f === 'gps' ? 'GPS' : f === 'inspeccion' ? 'Inspección' : 'Sin dato');

export function NeumaticosHistorialPlaca({ placa, open, onClose }: { placa: string; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const historial = useQuery<RespuestaHistorial>({
    queryKey: ['neumaticos', 'historial-placa', placa, desde, hasta],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (desde) qs.set('desde', desde);
      if (hasta) qs.set('hasta', hasta);
      const suf = qs.toString() ? `?${qs.toString()}` : '';
      const r = await api<RespuestaHistorial>(`/neumaticos/historial-placa/${encodeURIComponent(placa)}${suf}`);
      if (!r.ok) throw new Error(r.error || 'No se pudo cargar el historial');
      return r;
    },
    enabled: open && Boolean(placa),
    staleTime: 30_000,
  });

  const inspecciones = historial.data?.inspecciones ?? [];

  async function exportar() {
    try {
      const resumen = inspecciones.map(i => [
        formatFechaPe(i.fecha), i.km, fuenteTexto(i.km_fuente), i.km_desde_anterior, i.llantas_cuenta, i.promedio_general, i.criticas,
      ]);
      const detalle = inspecciones.flatMap(i => i.llantas.map(l => [
        formatFechaPe(i.fecha), i.km, l.posicion, sinDato(l.marca), sinDato(l.modelo), sinDato(l.medida),
        l.r1, l.r2, l.r3, l.promedio, l.anterior_mm, l.delta_mm, l.km_desde_anterior, l.mm_por_1000km,
        sinDato(l.presion_ant), sinDato(l.presion_actual), sinDato(l.estado), l.alerta_cambio ? 'Sí' : 'No', sinDato(l.observaciones),
      ]));
      await exportarExcelHojas(`Historial-${placa}`, [
        {
          hoja: 'Resumen',
          encabezados: ['Fecha', 'Odómetro (km)', 'Fuente km', 'Km desde anterior', 'Llantas', 'Promedio general (mm)', `Críticas (< ${MM_CRITICO} mm)`],
          filas: resumen,
        },
        {
          hoja: 'Detalle',
          encabezados: [
            'Fecha', 'Odómetro (km)', 'Posición', 'Marca', 'Modelo', 'Medida', 'R1 (mm)', 'R2 (mm)', 'R3 (mm)', 'Promedio (mm)',
            'Anterior (mm)', 'Δ mm', 'Km desde anterior', 'mm por 1.000 km', 'Presión anterior', 'Presión actual', 'Estado', 'Crítica', 'Observaciones',
          ],
          filas: detalle,
        },
      ]);
      haptic('success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Historial de ${placa}`} ancho>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75rem', color: 'var(--label-2)' }}>
            Desde
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} aria-label="Desde" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75rem', color: 'var(--label-2)' }}>
            Hasta
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} aria-label="Hasta" />
          </label>
          {(desde || hasta) && (
            <Button variant="plain" size="sm" icon={<RotateCcw size={15} />} onClick={() => { setDesde(''); setHasta(''); }}>Todo el historial</Button>
          )}
          <span style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={15} />} disabled={!inspecciones.length} onClick={exportar}>Exportar Excel</Button>
        </div>

        {historial.isLoading ? <PageLoader /> : historial.isError ? (
          <Notice tone="error">{errorMessage(historial.error)}</Notice>
        ) : inspecciones.length === 0 ? (
          <EmptyState icon={<History size={22} />} title="Sin inspecciones">
            {desde || hasta ? 'No hay inspecciones en ese periodo.' : 'Esta placa todavía no tiene inspecciones de neumáticos.'}
          </EmptyState>
        ) : inspecciones.map(i => (
          <section key={i.id_inspeccion} className="card" style={{ padding: 'var(--s-3) var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
            <header style={{ display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap', alignItems: 'baseline' }}>
              <strong>{formatFechaPe(i.fecha)}</strong>
              <span>Odómetro: {kmTexto(i.km)} <span style={{ color: 'var(--label-2)' }}>({fuenteTexto(i.km_fuente)})</span></span>
              <span>+{kmTexto(i.km_desde_anterior)} desde la anterior</span>
              <span>Promedio: {mm(i.promedio_general)}</span>
              <span>{i.llantas_cuenta} llanta(s) · {i.criticas} crítica(s)</span>
            </header>
            <div style={{ overflowX: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '46rem' }}>
                <thead>
                  <tr>
                    <th>Pos</th><th>Marca / modelo</th><th>Medida</th><th>R1</th><th>R2</th><th>R3</th>
                    <th>Promedio</th><th>Anterior</th><th>Δ mm</th><th>Km desde anterior</th><th>mm / 1.000 km</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {i.llantas.map(l => (
                    <tr key={l.posicion}>
                      <td>{l.posicion}</td>
                      <td>{sinDato(l.marca)} {l.modelo ? `· ${l.modelo}` : ''}</td>
                      <td>{sinDato(l.medida)}</td>
                      <td>{sinDato(l.r1)}</td><td>{sinDato(l.r2)}</td><td>{sinDato(l.r3)}</td>
                      <td>{mm(l.promedio)}</td>
                      <td>{mm(l.anterior_mm)}</td>
                      <td>{l.delta_mm === null ? '—' : l.delta_mm.toFixed(1)}</td>
                      <td>{kmTexto(l.km_desde_anterior)}</td>
                      <td>{l.mm_por_1000km === null ? '—' : l.mm_por_1000km.toFixed(2)}</td>
                      <td>{l.alerta_cambio ? 'Crítica' : sinDato(l.estado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
