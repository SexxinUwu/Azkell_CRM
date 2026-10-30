import '../mantenimiento/mant.css';
import { useNavigate } from 'react-router-dom';
import {
  Boxes, CalendarDays, ChevronRight, Clock, FileText, Fuel, Gauge, LayoutDashboard, Package, PackagePlus, RefreshCw,
  Route, ScrollText, Target, Truck, Wallet, Wrench,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { BarrasGrafico, DonaGrafico } from '../../core/ui/Graficos';
import { clavePlaca, useInspecciones, useInspeccionesNeumaticos } from '../inspecciones/api';
import { evaluarCiclo } from '../inspecciones/vigencia';
import { usePlacas } from '../placas/api';
import { api } from '../../core/api/client';
import { ALL_NAV_ITEMS } from '../../core/layout/navigation';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';

function arr<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { data?: T[] })?.data) ?? [];
}

// Tablero de accesos (como el clásico): solo pantallas de la app nueva; cada una se muestra si el usuario la puede ver.
const GRUPOS_ACCESO: Array<{ titulo: string; icono: ReactNode; enlaces: Array<{ to: string; label: string; icono: ReactNode }> }> = [
  { titulo: 'Flota', icono: <Truck size={13} />, enlaces: [
    { to: '/flota/disponibilidad', label: 'Disponibilidad 360°', icono: <Gauge size={17} /> },
  ] },
  { titulo: 'Operaciones y rutas', icono: <Route size={13} />, enlaces: [
    { to: '/operaciones/programacion', label: 'Programación', icono: <CalendarDays size={17} /> },
    { to: '/operaciones/ordenes-viaje', label: 'Órdenes de viaje y fletes', icono: <Truck size={17} /> },
    { to: '/operaciones/matriz-combustible', label: 'Matriz de rendimiento D2', icono: <Target size={17} /> },
    { to: '/operaciones/vales', label: 'Vales de combustible', icono: <Fuel size={17} /> },
  ] },
  { titulo: 'Taller y OTs', icono: <Wrench size={13} />, enlaces: [
    { to: '/mantenimiento/reportes-ot', label: 'Órdenes de trabajo', icono: <ScrollText size={17} /> },
    { to: '/mantenimiento/dashboard', label: 'Dashboard de mantenimiento', icono: <LayoutDashboard size={17} /> },
    { to: '/mantenimiento/status-rampa', label: 'Status de rampa', icono: <Wrench size={17} /> },
  ] },
  { titulo: 'Almacén y stock', icono: <Boxes size={13} />, enlaces: [
    { to: '/almacen/inventario', label: 'Inventario', icono: <Boxes size={17} /> },
    { to: '/almacen/entradas', label: 'Órdenes de compra', icono: <PackagePlus size={17} /> },
  ] },
  { titulo: 'Tesorería', icono: <Wallet size={13} />, enlaces: [
    { to: '/tesoreria/pago-requerimientos', label: 'Pago de requerimientos', icono: <Wallet size={17} /> },
    { to: '/tesoreria/cuentas', label: 'Cuentas por cobrar y pagar', icono: <FileText size={17} /> },
  ] },
];

// Fecha y hora de la última actualización, con el formato del clásico (es-PE, hora de 12 h)
const fechaTexto = (d: Date) => {
  const s = d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const horaTexto = (d: Date) => d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });

function KpiCard({ icon, label, valor, sub, color, to }: {
  icon: React.ReactNode; label: string; valor: number | string; sub?: string; color?: string; to?: string;
}) {
  const navigate = useNavigate();
  const estilo = { padding: 'var(--s-3)', display: 'flex', gap: 'var(--s-2)', alignItems: 'center', width: '100%' };
  const contenido = (
    <>
      <div style={{ color: color ?? 'var(--label-1)', flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>{valor}</div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', marginTop: 1 }}>{sub}</div>}
      </div>
    </>
  );
  return to ? (
    <button type="button" className="tarjeta__lista pressable" style={{ ...estilo, cursor: 'pointer' }} onClick={() => { haptic('selection'); navigate(to); }}>{contenido}</button>
  ) : (
    <div className="tarjeta__lista" style={estilo}>{contenido}</div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [actualizado, setActualizado] = useState(() => new Date());
  const [recargando, setRecargando] = useState(false);

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

  // Recarga ejecutiva (como el clásico): vuelve a pedir todas las fuentes y actualiza la fecha y la hora
  async function recargar() {
    if (recargando) return;
    haptic('selection');
    setRecargando(true);
    try {
      await Promise.all([
        flota.refetch(), ots.refetch(), inventario.refetch(), vales.refetch(), rampas.refetch(), reqs.refetch(),
        insp.refetch(), neu.refetch(), placasQ.refetch(),
      ]);
    } finally {
      setActualizado(new Date());
      setRecargando(false);
    }
  }

  const gruposAcceso = GRUPOS_ACCESO
    .map(g => ({
      ...g,
      enlaces: g.enlaces.filter(e => {
        const item = ALL_NAV_ITEMS.find(i => i.to === e.to);
        return !!item && can(...item.permissions);
      }),
    }))
    .filter(g => g.enlaces.length > 0);

  return (
    <Page>
      <PageHeader
        eyebrow="Gerencia"
        title="Centro de Comando"
        subtitle="Resumen operativo"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase' }}>{horaTexto(actualizado)}</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>{fechaTexto(actualizado)}</div>
            </div>
            <Button variant="plain" iconOnly icon={<RefreshCw size={17} />} aria-label="Actualizar datos" title="Actualizar datos"
              loading={recargando} onClick={recargar} />
          </div>
        }
      />

      {gruposAcceso.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))', gap: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
          {gruposAcceso.map(g => (
            <div key={g.titulo} className="tarjeta__lista">
              <p className="tarjeta__grupo-titulo" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--s-3) var(--s-4) var(--s-2)' }}>
                {g.icono} {g.titulo}
              </p>
              {g.enlaces.map(e => (
                <button key={e.to} type="button" className="mov-fila pressable"
                  onClick={() => { haptic('selection'); navigate(e.to); }}>
                  <div className="mov-fila__icon" style={{ background: 'var(--fill)', color: 'var(--label-2)' }}>{e.icono}</div>
                  <div className="mov-fila__cuerpo"><span className="mov-fila__titulo">{e.label}</span></div>
                  <div className="mov-fila__derecha"><ChevronRight size={16} style={{ color: 'var(--label-3)' }} /></div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

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
              <KpiCard icon={<Truck size={20} />} label="Total flota" valor={flotaTotal} to="/placas" />
              <KpiCard icon={<Truck size={20} />} label="Operativas" valor={flotaOperativa} color="var(--green-ink)" sub={`${pctOperativa}%`} />
              <KpiCard icon={<Wrench size={20} />} label="En taller" valor={flotaEnTaller} color={flotaEnTaller > 0 ? 'var(--amber-ink)' : 'var(--green-ink)'} sub={`${pctTaller}%`} to="/mantenimiento/status-rampa" />
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
              <KpiCard icon={<Clock size={20} />} label="OTs pendientes" valor={otsPendientes} color={otsPendientes > 0 ? 'var(--amber-ink)' : 'var(--green-ink)'} to="/mantenimiento/reportes-ot" />
              <KpiCard icon={<Wrench size={20} />} label="Total OTs" valor={otsData.length} to="/mantenimiento/reportes-ot" />
              {otsHoy > 0 && <KpiCard icon={<Wrench size={20} />} label="Cerradas hoy" valor={otsHoy} color="var(--green-ink)" />}
              {reqsPendientes > 0 && <KpiCard icon={<Package size={20} />} label="Reqs. compra" valor={reqsPendientes} color="var(--red-ink)" sub="pendientes" to="/almacen/recepcion-compras" />}
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
              <KpiCard icon={<Package size={20} />} label="Ítems inventario" valor={inventarioData.length} to="/almacen/inventario" />
              {invBajoStock > 0 && (
                <KpiCard icon={<Package size={20} />} label="Bajo stock mínimo" valor={invBajoStock} color="var(--red-ink)" sub="Requiere reposición" to="/almacen/inventario" />
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
                <KpiCard icon={<Fuel size={20} />} label="Vales registrados" valor={valesData.length} to="/operaciones/vales" />
                {valesPendientes > 0 && <KpiCard icon={<Fuel size={20} />} label="Vales pendientes" valor={valesPendientes} color="var(--amber-ink)" />}
              </div>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
