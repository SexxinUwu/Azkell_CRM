import './mant.css';
import { ArrowUpRight, CheckCircle, Clock, LayoutDashboard, Truck, Wrench } from 'lucide-react';
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

function KpiCard({ icon, label, valor, sub, color }: {
  icon: React.ReactNode;
  label: string;
  valor: number | string;
  sub?: string;
  color?: string;
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

export function MantDashboardPage() {
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
  const tallerStatus = useQuery({
    queryKey: ['mant-dashboard', 'taller-status'],
    queryFn: () => api('/taller/status').then(r => arr<Record<string, unknown>>(r)),
    staleTime: 60_000,
  });

  const isLoading = ots.isLoading || flota.isLoading;

  const otsData = ots.data ?? [];
  const flotaData = flota.data ?? [];
  const tallerData = tallerStatus.data ?? [];

  const hoy = new Date().toISOString().split('T')[0];

  const otsPendientes = otsData.filter(o => {
    const s = String(o.estado ?? '').toLowerCase();
    return s.includes('pendiente') || s.includes('abierta');
  }).length;

  const otsProceso = otsData.filter(o => {
    const s = String(o.estado ?? '').toLowerCase();
    return s.includes('proceso') || s.includes('progreso') || s.includes('trabajo');
  }).length;

  const otsCerradasHoy = otsData.filter(o => {
    const s = String(o.estado ?? '').toLowerCase();
    const f = String(o.fecha_cierre ?? o.fecha_fin ?? o.updated_at ?? '').split('T')[0];
    return (s.includes('cerrada') || s.includes('completada') || s.includes('finalizada')) && f === hoy;
  }).length;

  const flotaEnTaller = flotaData.filter(v => {
    const s = String(v.estado ?? '').toLowerCase();
    return s.includes('taller') || s.includes('mantenimiento');
  }).length;

  const tallerEnProceso = tallerData.filter(t => {
    const s = String(t.estado ?? '').toLowerCase();
    return s.includes('proceso') || s.includes('abierto') || s.includes('ingreso');
  }).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Resumen de taller"
        subtitle="Estado operativo del taller"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/dashboard') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {(ots.isError || flota.isError) && (
            <Notice tone="error">Error al cargar algunos datos. Mostrando información parcial.</Notice>
          )}

          {/* Órdenes de trabajo */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wrench size={13} /> Órdenes de trabajo
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: 'var(--s-2)' }}>
              <KpiCard icon={<Wrench size={20} />} label="Total OTs" valor={otsData.length} />
              <KpiCard icon={<Clock size={20} />} label="Pendientes" valor={otsPendientes} color={otsPendientes > 0 ? 'var(--amber-ink)' : 'var(--green-ink)'} />
              {otsProceso > 0 && <KpiCard icon={<Wrench size={20} />} label="En proceso" valor={otsProceso} color="var(--accent)" />}
              {otsCerradasHoy > 0 && <KpiCard icon={<CheckCircle size={20} />} label="Cerradas hoy" valor={otsCerradasHoy} color="var(--green-ink)" />}
            </div>
          </div>

          {/* Flota en taller */}
          {flotaData.length > 0 && (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Truck size={13} /> Flota
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: 'var(--s-2)' }}>
                <KpiCard icon={<Truck size={20} />} label="Total flota" valor={flotaData.length} />
                <KpiCard icon={<Wrench size={20} />} label="En taller" valor={flotaEnTaller} color={flotaEnTaller > 0 ? 'var(--amber-ink)' : 'var(--green-ink)'} sub={flotaData.length > 0 ? `${Math.round(flotaEnTaller / flotaData.length * 100)}%` : undefined} />
              </div>
            </div>
          )}

          {/* Taller en proceso */}
          {tallerData.length > 0 && (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <LayoutDashboard size={13} /> Rampa
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: 'var(--s-2)' }}>
                <KpiCard icon={<Clock size={20} />} label="En rampa" valor={tallerData.length} />
                {tallerEnProceso > 0 && <KpiCard icon={<Wrench size={20} />} label="En proceso" valor={tallerEnProceso} color="var(--accent)" />}
              </div>
            </div>
          )}

          <Notice>Para gráficos detallados y análisis de eficiencia usa la versión actual.</Notice>
        </div>
      )}
    </Page>
  );
}
