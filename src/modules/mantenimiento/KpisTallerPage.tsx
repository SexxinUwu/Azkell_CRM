import '../mantenimiento/mant.css';
import { useMemo } from 'react';
import { Activity, Gauge, Timer, Wrench } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { useOrdenesTrabajoData } from './api';
import { errorMessage } from '../../core/api/client';

// Mantenimiento › Métricas y KPIs: MTTR, MTBF, porcentaje preventivo y horas de paro, con las mismas fórmulas del clásico
const PERIODO_HORAS = 8640; // 360 días × 24 h, período de referencia del clásico

interface OtKpi { aprobacion?: string | null; detalles_json?: unknown }

function detalles(o: OtKpi): { tipo_ot?: string; f_inicio?: string; f_fin?: string } {
  try {
    return typeof o.detalles_json === 'string' ? JSON.parse(o.detalles_json) : ((o.detalles_json as object) ?? {});
  } catch { return {}; }
}

function calcular(ots: OtKpi[]) {
  const total = ots.length;
  let preventivas = 0;
  const correctivas: number[] = [];
  for (const o of ots) {
    const d = detalles(o);
    const tipo = (d.tipo_ot ?? '').trim();
    if (tipo === 'Preventivo') preventivas++;
    if (tipo === 'Correctivo' && (o.aprobacion ?? '').trim() === 'Cerrada') {
      const ms = d.f_inicio && d.f_fin ? new Date(d.f_fin).getTime() - new Date(d.f_inicio).getTime() : 0;
      correctivas.push(ms > 0 ? ms / 3600000 : 0);
    }
  }
  const paro = correctivas.reduce((s, h) => s + h, 0);
  const n = correctivas.length;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    total, preventivas, correctivos: n,
    mttr: n ? r1(paro / n) : 0,
    mtbf: n ? r1((PERIODO_HORAS - paro) / n) : PERIODO_HORAS,
    pmPct: total ? r1((preventivas / total) * 100) : 0,
    paro: r1(paro),
  };
}

export function KpisTallerPage() {
  const ots = useOrdenesTrabajoData();
  const k = useMemo(() => calcular((ots.data ?? []) as OtKpi[]), [ots.data]);

  const tarjetas = [
    { t: 'MTTR (h)', v: k.mttr.toLocaleString('es-PE'), d: 'Tiempo medio de reparación de correctivos cerrados', c: 'var(--accent)', i: <Timer size={18} /> },
    { t: 'MTBF (h)', v: k.mtbf.toLocaleString('es-PE'), d: 'Horas medias entre fallas en el período de 360 días', c: 'var(--green-ink)', i: <Gauge size={18} /> },
    { t: '% preventivo', v: `${k.pmPct.toLocaleString('es-PE')} %`, d: `${k.preventivas} de ${k.total} OT son preventivas`, c: 'var(--amber-ink)', i: <Activity size={18} /> },
    { t: 'Horas de paro', v: k.paro.toLocaleString('es-PE'), d: `${k.correctivos} correctivos cerrados`, c: 'var(--red-ink)', i: <Wrench size={18} /> },
  ];

  return (
    <Page>
      <PageHeader eyebrow="Mantenimiento" title="Métricas y KPIs de taller"
        subtitle={ots.isLoading ? 'Cargando…' : `${k.total} órdenes de trabajo consideradas`} />
      {ots.isLoading ? <PageLoader /> : ots.isError ? <Notice tone="error">{errorMessage(ots.error)}</Notice> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 'var(--s-3)' }}>
          {tarjetas.map(x => (
            <div key={x.t} style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 16, padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: x.c, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{x.i}{x.t}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.625rem', fontWeight: 800, color: x.c, fontVariantNumeric: 'tabular-nums' }}>{x.v}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{x.d}</span>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
