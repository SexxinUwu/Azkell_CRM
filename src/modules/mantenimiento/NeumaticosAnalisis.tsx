import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Disc3 } from 'lucide-react';
import { api, errorMessage } from '../../core/api/client';
import { EmptyState, Notice } from '../../core/ui/Display';
import { PageLoader } from '../../core/ui/Button';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { MedidaDetalleSheet } from './NeumaticosExtras';

// Análisis de la flota de neumáticos (GET /api/neumaticos/analisis). Todo se lee de la base de la empresa.
interface Resumen {
  total_inspecciones: number;
  vigentes: number;
  no_vigentes: number;
  sin_inspeccion: number;
  llantas_criticas: number;
  unidades_en_uso: number;
  total_llantas_rodando: number;
  total_llantas_flota: number | null;
}

interface UnidadAnalisis {
  placa: string;
  dueno: string | null;
  marca_unidad: string | null;
  tipo_unidad: string | null;
  fecha_inspeccion: string | null;
  km_vehiculo: number | null;
  fecha_proxima: string | null;
  dias_restantes: number | null;
  total_llantas: number;
  total_criticas: number;
}

export interface AnalisisNeumaticos {
  resumen: Resumen;
  marcas: Array<{ marca: string; cantidad: number }>;
  medidas: Array<{ medida: string; cantidad: number }>;
  inspecciones: UnidadAnalisis[];
}

export function useAnalisisNeumaticos() {
  return useQuery<AnalisisNeumaticos>({
    queryKey: ['mant', 'neumaticos-analisis'],
    queryFn: async () => {
      const r = await api<AnalisisNeumaticos & { ok?: boolean; error?: string }>('/neumaticos/analisis');
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo cargar el análisis');
      return r;
    },
    staleTime: 60_000,
  });
}

const num = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('es-PE'));

/** Semáforo según los días restantes para la próxima inspección */
function semaforo(dias: number | null): { color: string; texto: string } {
  if (dias == null) return { color: 'var(--label-3)', texto: 'Sin inspección' };
  if (dias < 0) return { color: 'var(--red-ink)', texto: `Vencida hace ${Math.abs(dias)} d` };
  if (dias <= 7) return { color: 'var(--amber-ink)', texto: `${dias} d` };
  return { color: 'var(--green-ink)', texto: `${dias} d` };
}

export function NeumaticosAnalisis() {
  const { data, isLoading, isError, error } = useAnalisisNeumaticos();
  const [medidaSel, setMedidaSel] = useState<string | null>(null);

  if (isLoading) return <PageLoader />;
  if (isError) return <Notice tone="error">{errorMessage(error)}</Notice>;
  if (!data) return null;

  const r = data.resumen;
  const maxMarca = Math.max(1, ...data.marcas.map(m => m.cantidad));
  const maxMedida = Math.max(1, ...data.medidas.map(m => m.cantidad));

  if (r.unidades_en_uso === 0) {
    return <EmptyState icon={<Disc3 size={22} />} title="Sin unidades en uso">Cuando haya unidades activas en la flota, aquí verás su análisis de neumáticos.</EmptyState>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      {/* KPI */}
      <div className="inv-metricas">
        <div className="inv-metrica"><span className="inv-metrica__num">{num(r.unidades_en_uso)}</span><span className="inv-metrica__label">Unidades en uso</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num" style={{ color: 'var(--green-ink)' }}>{num(r.vigentes)}</span><span className="inv-metrica__label">Inspección vigente</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num" style={{ color: 'var(--amber-ink)' }}>{num(r.no_vigentes)}</span><span className="inv-metrica__label">Inspección no vigente</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num">{num(r.sin_inspeccion)}</span><span className="inv-metrica__label">Sin inspección</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num" style={{ color: 'var(--red-ink)' }}>{num(r.llantas_criticas)}</span><span className="inv-metrica__label">Llantas críticas</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num">{num(r.total_llantas_rodando)}</span><span className="inv-metrica__label">Llantas rodando</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num">{num(r.total_llantas_flota)}</span><span className="inv-metrica__label">Llantas de la flota</span></div>
      </div>

      {/* Distribución */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', gap: 'var(--s-3)' }}>
        <div className="tarjeta__lista" style={{ padding: 'var(--s-3) var(--s-4)' }}>
          <p className="tarjeta__grupo-titulo">Marcas principales</p>
          {data.marcas.length === 0 ? <p className="t-footnote c-secondary">Sin marcas registradas.</p> : data.marcas.map(m => (
            <div key={m.marca} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, padding: '6px 0' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{m.marca}</span>
              <span className="t-numeric" style={{ fontSize: '0.8125rem' }}>{num(m.cantidad)}</span>
              <div style={{ gridColumn: '1 / -1', height: 4, borderRadius: 2, background: 'var(--fill)' }}>
                <div style={{ width: `${(m.cantidad / maxMarca) * 100}%`, height: '100%', borderRadius: 2, background: 'var(--accent)' }} />
              </div>
            </div>
          ))}
        </div>
        <div className="tarjeta__lista" style={{ padding: 'var(--s-3) var(--s-4)' }}>
          <p className="tarjeta__grupo-titulo">Medidas en uso</p>
          {data.medidas.length === 0 ? <p className="t-footnote c-secondary">Sin medidas registradas.</p> : data.medidas.map(m => (
            <div key={m.medida} role="button" tabIndex={0} title="Ver llantas de esta medida"
              onClick={() => setMedidaSel(m.medida)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMedidaSel(m.medida); } }}
              style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, padding: '6px 0', cursor: 'pointer' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{m.medida}</span>
              <span className="t-numeric" style={{ fontSize: '0.8125rem' }}>{num(m.cantidad)}</span>
              <div style={{ gridColumn: '1 / -1', height: 4, borderRadius: 2, background: 'var(--fill)' }}>
                <div style={{ width: `${(m.cantidad / maxMedida) * 100}%`, height: '100%', borderRadius: 2, background: 'var(--blue-ink)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Listado por unidad */}
      <div>
        <p className="tarjeta__grupo-titulo">Unidades en uso</p>
        <div className="tarjeta__lista">
          {data.inspecciones.map(u => {
            const s = semaforo(u.dias_restantes);
            return (
              <div key={u.placa} className="row" style={{ alignItems: 'center', gap: 12 }}>
                <LicensePlate plate={u.placa} size="sm" />
                <div className="row__main" style={{ minWidth: 0 }}>
                  <div className="row__title">{[u.marca_unidad, u.tipo_unidad].filter(Boolean).join(' · ') || 'Unidad'}</div>
                  <div className="row__subtitle">
                    {u.dueno || 'Sin cliente'}{u.km_vehiculo != null ? ` · ${num(u.km_vehiculo)} km` : ''}{u.fecha_inspeccion ? ` · inspección ${String(u.fecha_inspeccion).split('T')[0]}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: s.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <CalendarClock size={12} /> {s.texto}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: u.total_criticas > 0 ? 'var(--red-ink)' : 'var(--label-2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {u.total_criticas > 0 && <AlertTriangle size={12} />}
                    {u.total_criticas} crítica{u.total_criticas === 1 ? '' : 's'} de {u.total_llantas} llanta{u.total_llantas === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="t-footnote c-secondary" style={{ marginTop: 'var(--s-2)' }}>
          Crítica: remanente de menos de 3 mm, o alerta de cambio marcada en la inspección.
        </p>
      </div>
      <MedidaDetalleSheet medida={medidaSel} onClose={() => setMedidaSel(null)} />
    </div>
  );
}
