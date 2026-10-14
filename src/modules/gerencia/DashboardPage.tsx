import '../mantenimiento/mant.css';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Boxes, Clock, Fuel, Package, Truck, Wrench } from 'lucide-react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { BarrasGrafico, DonaGrafico } from '../../core/ui/Graficos';
import { clavePlaca, useInspecciones, useInspeccionesNeumaticos } from '../inspecciones/api';
import { evaluarCiclo } from '../inspecciones/vigencia';
import { usePlacas } from '../placas/api';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';

function arr<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { data?: T[] })?.data) ?? [];
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
  const insp = useInspecciones();
  const neu = useInspeccionesNeumaticos();
  const placasQ = usePlacas();
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

  // ─── Vigencia de inspecciones: total, motoras y no motoras (misma regla que Mantenimiento) ───
  const vigencia = useMemo(() => {
    const ultimaMec = new Map<string, NonNullable<typeof insp.data>[number]>();
    [...(insp.data ?? [])].filter(i => i.tipo !== 'Solo Frenos')
      .sort((x, y) => (y.fecha?.getTime() ?? 0) - (x.fecha?.getTime() ?? 0))
      .forEach(i => { const k = clavePlaca(i.placa); if (!ultimaMec.has(k)) ultimaMec.set(k, i); });
    const ultimaNeu = new Map<string, NonNullable<typeof neu.data>[number]>();
    (neu.data ?? []).forEach(n => { const k = clavePlaca(n.placa); if (!ultimaNeu.has(k)) ultimaNeu.set(k, n); });
    const conteo = (filtro: (motora: boolean) => boolean) => {
      const c = { vigente: 0, proximo: 0, vencido: 0, sinRegistro: 0 };
      (placasQ.data ?? []).filter(p => p.estado.toLowerCase() === 'activa' && p.enUso && filtro(p.motora)).forEach(p => {
        const { estado } = evaluarCiclo(ultimaMec.get(clavePlaca(p.placa)) ?? null, ultimaNeu.get(clavePlaca(p.placa)) ?? null);
        if (estado === 'vigente') c.vigente++;
        else if (estado === 'proximo') c.proximo++;
        else if (estado === 'vencido') c.vencido++;
        else c.sinRegistro++;
      });
      return c;
    };
    return { total: conteo(() => true), motoras: conteo(m => m), noMotoras: conteo(m => !m) };
  }, [insp.data, neu.data, placasQ.data]);

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
    if (Number(i.activo ?? 1) === 0) return false;
    const stock = Number(i.stock_actual ?? 0);
    const min   = Number(i.stock_min ?? 0);
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

            {/* Dona de disponibilidad */}
            {flotaTotal > 0 && (
              <div style={{ background: 'var(--fill-1)', borderRadius: 'var(--radius-2)', padding: 'var(--s-3)' }}>
                <DonaGrafico centro={`${pctOperativa}%`} porciones={[
                  { nombre: 'Operativas', valor: flotaOperativa, color: 'var(--green-ink)' },
                  { nombre: 'En taller', valor: flotaEnTaller, color: 'var(--amber-ink)' },
                ]} />
              </div>
            )}

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

          {/* ─── Vigencia de inspecciones ─────────────────────────────── */}
          {(placasQ.data ?? []).length > 0 && (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--label-2)', textTransform: 'uppercase', marginBottom: 'var(--s-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Truck size={13} /> Vigencia de inspecciones
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
                {([['Toda la flota', vigencia.total], ['Motoras', vigencia.motoras], ['No motoras', vigencia.noMotoras]] as const).map(([titulo, c]) => {
                  const total = c.vigente + c.proximo + c.vencido + c.sinRegistro;
                  const vigPct = total > 0 ? Math.round((c.vigente / total) * 100) : 0;
                  return (
                    <div key={titulo} style={{ background: 'var(--fill-1)', borderRadius: 'var(--radius-2)', padding: 'var(--s-3)' }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: 'var(--s-2)' }}>{titulo}</div>
                      <DonaGrafico centro={`${vigPct}%`} porciones={[
                        { nombre: 'Vigentes', valor: c.vigente, color: 'var(--green-ink)' },
                        { nombre: 'Por vencer (7 días)', valor: c.proximo, color: 'var(--amber-ink)' },
                        { nombre: 'Vencidas', valor: c.vencido, color: 'var(--red-ink)' },
                        { nombre: 'Sin registro', valor: c.sinRegistro, color: 'var(--fill-3)' },
                      ]} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
            {otsData.length > 0 && (
              <div style={{ background: 'var(--fill-1)', borderRadius: 'var(--radius-2)', padding: 'var(--s-3)', marginTop: 'var(--s-2)' }}>
                <BarrasGrafico porciones={[
                  { nombre: 'OTs pendientes', valor: otsPendientes, color: 'var(--amber-ink)' },
                  { nombre: 'OTs cerradas hoy', valor: otsHoy, color: 'var(--green-ink)' },
                  { nombre: 'Reqs. de compra', valor: reqsPendientes, color: 'var(--red-ink)' },
                ]} />
              </div>
            )}
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
