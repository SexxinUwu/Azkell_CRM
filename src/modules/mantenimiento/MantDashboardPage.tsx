import './mant.css';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, CheckCircle, Clock, LayoutDashboard, Truck, Wrench } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';

function arr<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { data?: T[] })?.data) ?? [];
}

// ─── Componentes de visualización ────────────────────────────────────────────

function Donut({ pct, color, label, size = 64 }: { pct: number; color: string; label?: string; size?: number }) {
  const r = 15.9155;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--fill-3)" strokeWidth="3.5" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3.5"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      {label !== undefined && (
        <span style={{ position: 'absolute', fontSize: size < 60 ? '0.7rem' : '0.85rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color }}>
          {label}
        </span>
      )}
    </div>
  );
}

function BarraKpi({ label, valor, total, color }: { label: string; valor: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, marginBottom: 3 }}>
        <span style={{ color: 'var(--label-2)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', color }}>{valor} <span style={{ color: 'var(--label-2)', fontWeight: 400 }}>/ {total}</span></span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: 'var(--fill-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 600ms ease' }} />
      </div>
    </div>
  );
}

function KpiCard({ icon, label, valor, sub, color, onClick }: {
  icon: React.ReactNode; label: string; valor: number | string; sub?: string; color?: string; onClick?: () => void;
}) {
  return (
    <div className="tarjeta__lista"
      onClick={onClick}
      style={{ padding: 'var(--s-3)', display: 'flex', gap: 'var(--s-2)', alignItems: 'center', cursor: onClick ? 'pointer' : undefined }}>
      <div style={{ color: color ?? 'var(--accent)', flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>{valor}</div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Mini tabla de próximas a vencer ─────────────────────────────────────────
function ProximasVencer({ items }: { items: { placa: string; tipo: string; diasRestantes: number }[] }) {
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.slice(0, 6).map((it, i) => {
        const color = it.diasRestantes <= 0 ? 'var(--red-ink)' : it.diasRestantes <= 15 ? 'var(--amber-ink)' : 'var(--accent)';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', borderRadius: 7, background: 'var(--fill-2)', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)' }}>{it.placa}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--label-2)', flex: 1, marginLeft: 8 }}>{it.tipo}</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              {it.diasRestantes <= 0 ? 'VENCIDO' : `${it.diasRestantes}d`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface FallasStats {
  total?: number;
  abiertas?: number;
  criticas?: number;
  sin_stock?: number;
  hoy?: number;
}

// ─── Página ───────────────────────────────────────────────────────────────────
export function MantDashboardPage() {
  const navigate = useNavigate();

  const ots = useQuery({
    queryKey: ['mant-dashboard', 'ots'],
    queryFn: () => api('/ordenes-trabajo').then(r => arr<Record<string, unknown>>(r)),
    staleTime: 60_000,
  });
  const flota = useQuery({
    queryKey: ['mant-dashboard', 'flota'],
    queryFn: () => api('/disponibilidad-flota').then(r => arr<Record<string, unknown>>(r)),
    staleTime: 60_000,
  });
  const rampas = useQuery({
    queryKey: ['mant-dashboard', 'rampas'],
    queryFn: () => api('/taller/status').then(r => arr<Record<string, unknown>>(r)),
    staleTime: 30_000,
  });
  const inspeccionesQ = useQuery({
    queryKey: ['mant-dashboard', 'inspecciones'],
    queryFn: () =>
      api('/script/obtenerDatosInspecciones', { method: 'POST', body: { args: [] } }).then(
        (r: unknown) => arr<Record<string, unknown>>(r)
      ),
    staleTime: 120_000,
  });
  const fallasQ = useQuery<FallasStats>({
    queryKey: ['mant-dashboard', 'fallas-stats'],
    queryFn: () => api('/fallas/stats') as Promise<FallasStats>,
    staleTime: 60_000,
  });

  const isLoading = ots.isLoading || flota.isLoading;

  const otsData          = ots.data ?? [];
  const flotaData        = flota.data ?? [];
  const rampasData       = rampas.data ?? [];
  const inspeccionesData = inspeccionesQ.data ?? [];
  const fallasStats      = fallasQ.data ?? {};

  const hoy = new Date().toISOString().split('T')[0];

  // ─── OTs ─────────────────────────────────────────────────────────────────
  const otsPendientes = otsData.filter(o => {
    const s = String(o.estado ?? '').toLowerCase();
    return s.includes('pendiente') || s.includes('abierta');
  }).length;
  const otsProceso = otsData.filter(o => {
    const s = String(o.estado ?? '').toLowerCase();
    return s.includes('proceso') || s.includes('progreso');
  }).length;
  const otsCerradasHoy = otsData.filter(o => {
    const s = String(o.estado ?? '').toLowerCase();
    const f = String(o.fecha_cierre ?? o.fecha_fin ?? o.updated_at ?? '').split('T')[0];
    return (s.includes('cerrada') || s.includes('completada') || s.includes('finalizada')) && f === hoy;
  }).length;

  // ─── Flota ───────────────────────────────────────────────────────────────
  const flotaTotal = flotaData.length;
  const placasEnRampa = [...new Set([
    ...rampasData.map(r => String(r.placa ?? '')).filter(Boolean),
    ...otsData.filter(o => {
      const s = String(o.estado ?? '').toLowerCase();
      return !['finalizado','finalizada','cerrado','cerrada','anulado','anulada'].some(x => s.includes(x));
    }).map(o => String(o.placa ?? '')).filter(Boolean),
  ])];
  const flotaEnTaller   = placasEnRampa.length;
  const flotaOperativa  = Math.max(0, flotaTotal - flotaEnTaller);
  const pctOperativa    = flotaTotal > 0 ? Math.round((flotaOperativa / flotaTotal) * 100) : 0;

  // ─── Inspecciones + próximas a vencer ────────────────────────────────────
  const hoyDate = new Date(); hoyDate.setHours(0, 0, 0, 0);

  const proximas30: { placa: string; tipo: string; diasRestantes: number }[] = [];
  const inspPorPlaca = new Map<string, Record<string, unknown>[]>();

  for (const insp of inspeccionesData) {
    const placa = String(insp.placa ?? insp.nombre ?? '');
    if (!placa) continue;
    if (!inspPorPlaca.has(placa)) inspPorPlaca.set(placa, []);
    inspPorPlaca.get(placa)!.push(insp);
  }

  for (const [placa, insps] of inspPorPlaca) {
    for (const i of insps) {
      const vencRaw = i.fecha_vencimiento ?? i.vencimiento ?? i.vigente_hasta;
      if (!vencRaw) continue;
      const vencDate = new Date(String(vencRaw).split('T')[0] + 'T00:00:00');
      const dias = Math.round((vencDate.getTime() - hoyDate.getTime()) / 86_400_000);
      if (dias <= 30) {
        proximas30.push({
          placa,
          tipo: String(i.tipo ?? i.tipo_inspeccion ?? i.descripcion ?? 'Inspección'),
          diasRestantes: dias,
        });
      }
    }
  }
  proximas30.sort((a, b) => a.diasRestantes - b.diasRestantes);

  const totalInsp    = inspeccionesData.length;
  const inspVencidos = proximas30.filter(x => x.diasRestantes <= 0).length;
  const inspVigentes = totalInsp - inspVencidos;
  const pctVigentes  = totalInsp > 0 ? Math.round((inspVigentes / totalInsp) * 100) : 0;

  const rampasActivas = rampasData.length;

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Resumen de taller"
        subtitle="Estado operativo en tiempo real"
        actions={
          <MenuOtros opciones={[
            { label: 'Status Rampa', icon: <LayoutDashboard size={17} />, onSelect: () => navigate('/mantenimiento/status-rampa') },
            { label: 'Fallas en ruta', icon: <AlertTriangle size={17} />, onSelect: () => navigate('/mantenimiento/fallas') },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/dashboard') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {(ots.isError || flota.isError) && (
            <Notice tone="error">Error al cargar algunos datos.</Notice>
          )}

          {/* ─── OTs ─────────────────────────────────────────────────── */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wrench size={13} /> Órdenes de trabajo
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: 'var(--s-2)' }}>
              <KpiCard icon={<Wrench size={20} />} label="Total OTs" valor={otsData.length}
                onClick={() => navigate('/mantenimiento/ordenes-trabajo')} />
              <KpiCard icon={<Clock size={20} />} label="Pendientes" valor={otsPendientes}
                color={otsPendientes > 0 ? 'var(--amber-ink)' : 'var(--green-ink)'}
                onClick={() => navigate('/mantenimiento/ordenes-trabajo')} />
              {otsProceso > 0 && (
                <KpiCard icon={<Wrench size={20} />} label="En proceso" valor={otsProceso}
                  color="var(--accent)" onClick={() => navigate('/mantenimiento/ordenes-trabajo')} />
              )}
              {otsCerradasHoy > 0 && (
                <KpiCard icon={<CheckCircle size={20} />} label="Cerradas hoy" valor={otsCerradasHoy}
                  color="var(--green-ink)" />
              )}
            </div>
          </div>

          {/* ─── Fallas en ruta ──────────────────────────────────────── */}
          {(fallasStats.abiertas ?? 0) > 0 && (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={13} /> Fallas en ruta
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: 'var(--s-2)' }}>
                <KpiCard icon={<AlertTriangle size={20} />} label="Abiertas" valor={fallasStats.abiertas ?? 0}
                  color="var(--amber-ink)" onClick={() => navigate('/mantenimiento/fallas')} />
                {(fallasStats.criticas ?? 0) > 0 && (
                  <KpiCard icon={<AlertTriangle size={20} />} label="Críticas" valor={fallasStats.criticas ?? 0}
                    color="var(--red-ink)" onClick={() => navigate('/mantenimiento/fallas')} />
                )}
                {(fallasStats.sin_stock ?? 0) > 0 && (
                  <KpiCard icon={<AlertTriangle size={20} />} label="Sin stock" valor={fallasStats.sin_stock ?? 0}
                    color="var(--accent)" sub="Esperan repuesto" onClick={() => navigate('/mantenimiento/fallas')} />
                )}
                {(fallasStats.hoy ?? 0) > 0 && (
                  <KpiCard icon={<Clock size={20} />} label="Reportadas hoy" valor={fallasStats.hoy ?? 0}
                    color="var(--blue-ink)" />
                )}
              </div>
            </div>
          )}

          {/* ─── Disponibilidad flota ────────────────────────────────── */}
          {flotaTotal > 0 && (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Truck size={13} /> Disponibilidad de flota
              </div>
              <div style={{ background: 'var(--fill-1)', borderRadius: 'var(--radius-2)', padding: 'var(--s-3)', display: 'flex', gap: 'var(--s-4)', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Donut pct={pctOperativa} color="var(--green-ink)" label={`${pctOperativa}%`} size={76} />
                </div>
                <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
                  <BarraKpi label="Operativas" valor={flotaOperativa} total={flotaTotal} color="var(--green-ink)" />
                  <BarraKpi label="En taller / rampa" valor={flotaEnTaller} total={flotaTotal} color="var(--amber-ink)" />
                </div>
              </div>
              {placasEnRampa.length > 0 && (
                <div style={{ marginTop: 'var(--s-2)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {placasEnRampa.slice(0, 12).map(placa => (
                    <button key={placa} type="button"
                      onClick={() => navigate('/mantenimiento/status-rampa')}
                      style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700,
                        padding: '2px 7px', borderRadius: 5,
                        background: 'var(--amber-tint)', color: 'var(--amber-ink)',
                        border: '1px solid var(--amber-ink)', cursor: 'pointer',
                      }}>
                      {placa}
                    </button>
                  ))}
                  {placasEnRampa.length > 12 && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--label-2)', alignSelf: 'center' }}>+{placasEnRampa.length - 12} más</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Rampa activa ─────────────────────────────────────────── */}
          {rampasActivas > 0 && (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <LayoutDashboard size={13} /> Rampa
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: 'var(--s-2)' }}>
                <KpiCard icon={<Clock size={20} />} label="Activas en rampa" valor={rampasActivas}
                  color="var(--amber-ink)" onClick={() => navigate('/mantenimiento/status-rampa')} />
              </div>
            </div>
          )}

          {/* ─── Inspecciones + donut ─────────────────────────────────── */}
          {totalInsp > 0 && (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={13} /> Inspecciones
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
                <div style={{ background: 'var(--fill-1)', borderRadius: 'var(--radius-2)', padding: 'var(--s-3)', display: 'flex', gap: 'var(--s-4)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Donut pct={pctVigentes} color="var(--green-ink)" label={`${pctVigentes}%`} size={76} />
                  </div>
                  <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
                    <BarraKpi label="Vigentes" valor={inspVigentes} total={totalInsp} color="var(--green-ink)" />
                    <BarraKpi label="Vencidas / próximas 30d" valor={inspVencidos + proximas30.filter(x => x.diasRestantes > 0 && x.diasRestantes <= 30).length} total={totalInsp} color="var(--red-ink)" />
                  </div>
                </div>

                {/* Próximas a vencer */}
                {proximas30.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--label-2)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Clock size={11} />
                      Próximas a vencer (30 días)
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--amber-ink)' }}>{proximas30.length}</span>
                    </div>
                    <ProximasVencer items={proximas30} />
                    {proximas30.length > 6 && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--label-2)', marginTop: 4, paddingLeft: 10 }}>
                        +{proximas30.length - 6} más — ver en módulo de Inspecciones
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
