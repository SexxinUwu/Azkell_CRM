import '../mantenimiento/mant.css';
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

export function DashboardPage() {
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

  const isLoading = flota.isLoading || ots.isLoading;

  const flotaData = flota.data ?? [];
  const otsData = ots.data ?? [];
  const inventarioData = inventario.data ?? [];
  const valesData = vales.data ?? [];

  const flotaTotal = flotaData.length;
  const flotaDisponible = flotaData.filter(v => {
    const s = String(v.estado ?? v.disponibilidad ?? '').toLowerCase();
    return s.includes('disponible') || s.includes('libre');
  }).length;
  const flotaTaller = flotaData.filter(v => {
    const s = String(v.estado ?? '').toLowerCase();
    return s.includes('taller') || s.includes('mantenimiento');
  }).length;

  const otsPendientes = otsData.filter(o => {
    const s = String(o.estado ?? '').toLowerCase();
    return s.includes('pendiente') || s.includes('abierta') || s.includes('proceso');
  }).length;
  const otsHoy = otsData.filter(o => {
    const f = String(o.fecha_cierre ?? o.updated_at ?? '').split('T')[0];
    return f === new Date().toISOString().split('T')[0];
  }).length;

  const invBajoStock = inventarioData.filter(i => {
    const stock = Number(i.stock ?? i.cantidad ?? 0);
    const min = Number(i.stock_minimo ?? i.minimo ?? 0);
    return min > 0 && stock <= min;
  }).length;

  const valesPendientes = valesData.filter(v => {
    const s = String(v.estado ?? '').toLowerCase();
    return s.includes('pendiente') || s.includes('borrador');
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

          {/* Flota */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Truck size={13} /> Flota
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: 'var(--s-2)' }}>
              <KpiCard icon={<Truck size={20} />} label="Total flota" valor={flotaTotal} />
              <KpiCard icon={<Truck size={20} />} label="Disponibles" valor={flotaDisponible} color="var(--green-ink)" sub={flotaTotal > 0 ? `${Math.round(flotaDisponible / flotaTotal * 100)}%` : undefined} />
              <KpiCard icon={<Wrench size={20} />} label="En taller" valor={flotaTaller} color={flotaTaller > 0 ? 'var(--amber-ink)' : undefined} />
            </div>
          </div>

          {/* Mantenimiento */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wrench size={13} /> Mantenimiento
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: 'var(--s-2)' }}>
              <KpiCard icon={<Clock size={20} />} label="OTs pendientes" valor={otsPendientes} color={otsPendientes > 0 ? 'var(--amber-ink)' : 'var(--green-ink)'} />
              <KpiCard icon={<Wrench size={20} />} label="Total OTs" valor={otsData.length} />
              {otsHoy > 0 && <KpiCard icon={<Wrench size={20} />} label="Cerradas hoy" valor={otsHoy} color="var(--green-ink)" />}
            </div>
          </div>

          {/* Almacén */}
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

          {/* Combustible */}
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

          <Notice>Para gráficos y análisis detallado usa la versión actual.</Notice>
        </div>
      )}
    </Page>
  );
}
