import '../mantenimiento/mant.css';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Boxes, Clock, Fuel, Package, Truck, Wrench } from 'lucide-react';
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

// Gráfico donut SVG sin librerías
function Donut({ pct, color, size = 64 }: { pct: number; color: string; size?: number }) {
  const r = 15.9155;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--fill-3)" strokeWidth="3.5" />
      <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
    </svg>
  );
}

function KpiCard({ icon, label, valor, sub, color }: {
  icon: React.ReactNode; label: string; valor: number | string; sub?: string; color?: string;
}) {
  return (
    <div className="tarjeta__lista" style={{ padding: 'var(--s-3)', display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
      <div style={{ color: color ?? 'var(--accent)', flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>{valor}</div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();

  const flota = useQuery({
    queryKey: ['dashboard', 'flota'],
    queryFn: () => api('/disponibilidad-flota').then(r => arr<Record<string, unknown>>(r)),
    staleTime: 60_000,
  });
  const ots = useQuery({
    queryKey: ['dashboard', 'ots'],
    queryFn: () => api('/ordenes-trabajo').then(r => arr<Record<string, unknown>>(r)),
    staleTime: 60_000,
  });
  const inventario = useQuery({
    queryKey: ['dashboard', 'inventario'],
    queryFn: () => api('/almacen/inventario').then(r => arr<Record<string, unknown>>(r)),
    staleTime: 120_000,
  });
  const vales = useQuery({
    queryKey: ['dashboard', 'vales'],
    queryFn: () => api('/combustible/vales?limit=200').then(r => arr<Record<string, unknown>>(r)),
    staleTime: 60_000,
  });
  const rampas = useQuery({
    queryKey: ['dashboard', 'rampas'],
    queryFn: () => api('/taller-rampas').then(r => arr<Record<string, unknown>>(r)),
    staleTime: 30_000,
  });
  const reqs = useQuery({
    queryKey: ['dashboard', 'reqs'],
    queryFn: () => api('/tesoreria/pago-requerimientos').then(r => arr<Record<string, unknown>>(r)),
    staleTime: 60_000,
  });

  const isLoading = flota.isLoading || ots.isLoading;

  const flotaData = flota.data ?? [];
  const otsData = ots.data ?? [];
  const inventarioData = inventario.data ?? [];
  const valesData = vales.data ?? [];
  const rampasData = rampas.data ?? [];
  const reqsData = reqs.data ?? [];

  // ─── Flota ───────────────────────────────────────────────────────────────────
  const flotaTotal = flotaData.length;

  // Obtener placas en rampa activa
  const placasEnRampa = [...new Set([
    ...rampasData.map(r => String(r.placa ?? '')).filter(Boolean),
    ...otsData.filter(o => {
      const s = String(o.estado ?? '').toLowerCase();
      return !['finalizado','finalizada','cerrado','cerrada','anulado','anulada'].some(x => s.includes(x));
    }).map(o => String(o.placa ?? '')).filter(Boolean),
  ])];

  const flotaEnTaller = placasEnRampa.length;
  const flotaOperativa = Math.max(0, flotaTotal - flotaEnTaller);
  const pctOperativa = flotaTotal > 0 ? Math.round((flotaOperativa / flotaTotal) * 100) : 0;
  const pctTaller    = flotaTotal > 0 ? Math.round((flotaEnTaller / flotaTotal) * 100) : 0;

  // ─── OTs ─────────────────────────────────────────────────────────────────────
  const otsPendientes = otsData.filter(o => {
    const s = String(o.estado ?? '').toLowerCase();
    return s.includes('pendiente') || s.includes('abierta') || s.includes('proceso');
  }).length;
  const otsHoy = otsData.filter(o => {
    const f = String(o.fecha_cierre ?? o.updated_at ?? '').split('T')[0];
    return f === new Date().toISOString().split('T')[0];
  }).length;

  // ─── Inventario ──────────────────────────────────────────────────────────────
  const invBajoStock = inventarioData.filter(i => {
    const stock = Number(i.stock ?? i.cantidad ?? 0);
    const min   = Number(i.stock_minimo ?? i.minimo ?? 0);
    return min > 0 && stock <= min;
  }).length;

  // ─── Vales ───────────────────────────────────────────────────────────────────
  const valesPendientes = valesData.filter(v => {
    const s = String(v.estado ?? '').toLowerCase();
    return s.includes('pendiente') || s.includes('borrador');
  }).length;

  // ─── Requerimientos ──────────────────────────────────────────────────────────
  const reqsPendientes = reqsData.filter(r => {
    const s = String(r.estado ?? '').toLowerCase();
    return s.includes('pendiente') || s.includes('enviado') || s.includes('proceso');
  }).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Gerencia"
        title="Centro de Comando"
        subtitle="Resumen operativo"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('dashboard') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {(flota.isError || ots.isError) && (
            <Notice tone="error">Error al cargar algunos datos. Mostrando información parcial.</Notice>
          )}

          {/* ─── Flota ──────────────────────────────────────────────────── */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Truck size={13} /> Flota
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
              <KpiCard icon={<Truck size={20} />} label="Total flota" valor={flotaTotal} />
              <KpiCard icon={<Truck size={20} />} label="Operativas" valor={flotaOperativa} color="var(--green-ink)" sub={`${pctOperativa}%`} />
              <KpiCard icon={<Wrench size={20} />} label="En taller" valor={flotaEnTaller} color={flotaEnTaller > 0 ? 'var(--amber-ink)' : 'var(--green-ink)'} sub={`${pctTaller}%`} />
            </div>

            {/* Donut + barras de disponibilidad */}
            <div style={{ background: 'var(--fill-1)', borderRadius: 'var(--radius-2)', padding: 'var(--s-3)', display: 'flex', gap: 'var(--s-4)', alignItems: 'center', flexWrap: 'wrap' }}>
              {flotaTotal > 0 && (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Donut pct={pctOperativa} color="var(--green-ink)" size={72} />
                  <span style={{ position: 'absolute', fontSize: '0.85rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--green-ink)' }}>
                    {pctOperativa}%
                  </span>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' }}>
                {[
                  { label: 'Operativas', pct: pctOperativa, color: 'var(--green-ink)', n: flotaOperativa },
                  { label: 'En taller',  pct: pctTaller,    color: 'var(--amber-ink)', n: flotaEnTaller },
                ].map(b => (
                  <div key={b.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, marginBottom: 3 }}>
                      <span style={{ color: 'var(--label-2)' }}>{b.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: b.color }}>{b.n}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 99, background: 'var(--fill-3)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${b.pct}%`, background: b.color, borderRadius: 99, transition: 'width 600ms ease' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Placas en rampa */}
            {placasEnRampa.length > 0 && (
              <div style={{ marginTop: 'var(--s-2)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', fontWeight: 600, marginBottom: 6 }}>
                  Unidades en taller ({placasEnRampa.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {placasEnRampa.slice(0, 12).map(placa => (
                    <button key={placa} type="button"
                      onClick={() => navigate('/mantenimiento/status-rampa')}
                      style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700,
                        padding: '3px 8px', borderRadius: 6,
                        background: 'var(--amber-tint)', color: 'var(--amber-ink)',
                        border: '1px solid var(--amber-ink)', cursor: 'pointer',
                      }}>
                      <Wrench size={11} style={{ display: 'inline', marginRight: 3 }} />{placa}
                    </button>
                  ))}
                  {placasEnRampa.length > 12 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--label-2)', alignSelf: 'center' }}>
                      +{placasEnRampa.length - 12} más
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ─── Mantenimiento ───────────────────────────────────────────── */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wrench size={13} /> Mantenimiento
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: 'var(--s-2)' }}>
              <KpiCard icon={<Clock size={20} />} label="OTs pendientes" valor={otsPendientes} color={otsPendientes > 0 ? 'var(--amber-ink)' : 'var(--green-ink)'} />
              <KpiCard icon={<Wrench size={20} />} label="Total OTs" valor={otsData.length} />
              {otsHoy > 0 && <KpiCard icon={<Wrench size={20} />} label="Cerradas hoy" valor={otsHoy} color="var(--green-ink)" />}
              {reqsPendientes > 0 && <KpiCard icon={<Package size={20} />} label="Reqs. compra" valor={reqsPendientes} color="var(--red-ink)" sub="pendientes" />}
            </div>
          </div>

          {/* ─── Almacén ─────────────────────────────────────────────────── */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Boxes size={13} /> Almacén
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: 'var(--s-2)' }}>
              <KpiCard icon={<Package size={20} />} label="Ítems inventario" valor={inventarioData.length} />
              {invBajoStock > 0 && (
                <KpiCard icon={<Package size={20} />} label="Bajo stock mínimo" valor={invBajoStock} color="var(--red-ink)" sub="Requiere reposición" />
              )}
            </div>
          </div>

          {/* ─── Combustible ─────────────────────────────────────────────── */}
          {valesData.length > 0 && (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Fuel size={13} /> Combustible
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: 'var(--s-2)' }}>
                <KpiCard icon={<Fuel size={20} />} label="Vales registrados" valor={valesData.length} />
                {valesPendientes > 0 && <KpiCard icon={<Fuel size={20} />} label="Vales pendientes" valor={valesPendientes} color="var(--amber-ink)" />}
              </div>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
