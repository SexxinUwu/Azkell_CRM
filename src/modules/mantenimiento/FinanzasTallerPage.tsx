import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FileSpreadsheet, SearchX, Wallet } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput } from '../../core/ui/Field';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { DonaGrafico, useColores, type Porcion } from '../../core/ui/Graficos';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage, api } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { useToast } from '../../core/ui/Toast';

// Las mismas listas que usa el reporte clásico: órdenes de trabajo, trabajos (mano de obra) y salidas de repuestos por OT
interface OT { id_ot?: string; ticket_entrada?: string; placa?: string; aprobacion?: string; creado_en?: string; detalles_json?: unknown }
interface Trabajo { ticket_visita?: string; ticket_ot?: string; id_ot?: string; estado?: string; costo?: number | string }
interface SalidaRepuesto { ticket_ot?: string; estado?: string; total_pen?: number | string; items?: { importe?: number | string }[] }

interface Fila { ticket: string; placa: string; tipo: string; fecha: string; mo: number; rep: number; total: number }

const n = (v: unknown) => Number(v) || 0;
const soles = (v: number) => `S/ ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const etiquetaMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

// Lista de OT aprobadas o cerradas, con su mano de obra y sus repuestos (sin lo anulado)
function construirFilas(ots: OT[], trabajos: Trabajo[], salidas: SalidaRepuesto[]): Fila[] {
  const aprobadas = ots.filter(o => ['Aprobada', 'Cerrada'].includes(String(o.aprobacion ?? '').trim()));
  return aprobadas.map(o => {
    let detalles: { tipo_ot?: string; f_inicio?: string } = {};
    try {
      detalles = typeof o.detalles_json === 'string' ? JSON.parse(o.detalles_json) : (o.detalles_json as typeof detalles) ?? {};
    } catch { detalles = {}; }
    const ticket = String(o.ticket_entrada || o.id_ot || '');
    const mo = trabajos
      .filter(t => String(t.ticket_visita || t.ticket_ot || t.id_ot) === ticket && String(t.estado ?? '').toLowerCase() !== 'anulado')
      .reduce((s, t) => s + n(t.costo), 0);
    const rep = salidas
      .filter(s => String(s.ticket_ot ?? '') === ticket && String(s.estado ?? '').toLowerCase() !== 'anulado')
      .reduce((s, x) => s + (n(x.total_pen) || (x.items ?? []).reduce((a, i) => a + n(i.importe), 0)), 0);
    return {
      ticket: ticket || '—',
      placa: String(o.placa ?? '').toUpperCase(),
      tipo: String(detalles.tipo_ot ?? '').trim() || 'Sin tipo',
      fecha: String(detalles.f_inicio || o.creado_en || '').slice(0, 10),
      mo: Math.round(mo * 100) / 100,
      rep: Math.round(rep * 100) / 100,
      total: Math.round((mo + rep) * 100) / 100,
    };
  });
}

const COLUMNAS_UNIDADES: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Unidad', ancho: 150 },
  { id: 'ots', titulo: 'OT', ancho: 90, alinear: 'right' },
  { id: 'mo', titulo: 'Mano de obra', ancho: 150, alinear: 'right' },
  { id: 'rep', titulo: 'Repuestos', ancho: 150, alinear: 'right' },
  { id: 'total', titulo: 'Total', ancho: 160, alinear: 'right' },
];

// Operaciones › Reporte financiero de taller: costo de mantenimiento por OT (mano de obra + repuestos)
export function FinanzasTallerPage() {
  const toast = useToast();
  const toastErr = (e: unknown) => errorMessage(e);
  const [tipo, setTipo] = useState('');
  const [placa, setPlaca] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const ots = useQuery<OT[]>({ queryKey: ['finanzas-taller', 'ots'], queryFn: () => api<OT[]>('/ordenes-trabajo'), staleTime: 60_000 });
  const trabajos = useQuery<Trabajo[]>({ queryKey: ['finanzas-taller', 'trabajos'], queryFn: () => api<Trabajo[]>('/ot-trabajos'), staleTime: 60_000 });
  const salidas = useQuery<SalidaRepuesto[]>({ queryKey: ['finanzas-taller', 'salidas'], queryFn: () => api<SalidaRepuesto[]>('/taller/ot-materiales'), staleTime: 60_000 });
  const [colAzul, colNaranja] = useColores(['var(--accent)', 'var(--amber)']);

  const cargando = ots.isLoading || trabajos.isLoading || salidas.isLoading;
  const error = ots.error ?? trabajos.error ?? salidas.error;
  const todas = useMemo(() => (ots.data && trabajos.data && salidas.data ? construirFilas(ots.data, trabajos.data, salidas.data) : []),
    [ots.data, trabajos.data, salidas.data]);

  const filas = useMemo(() => todas.filter(f =>
    (!tipo || f.tipo === tipo) &&
    (!placa || f.placa.includes(placa.toUpperCase())) &&
    (!desde || f.fecha >= desde) &&
    (!hasta || f.fecha <= hasta)), [todas, tipo, placa, desde, hasta]);

  const totales = useMemo(() => {
    const total = filas.reduce((s, f) => s + f.total, 0);
    const rep = filas.reduce((s, f) => s + f.rep, 0);
    const mo = filas.reduce((s, f) => s + f.mo, 0);
    return { total, rep, mo, promedio: filas.length ? total / filas.length : 0, ots: filas.length };
  }, [filas]);

  // Evolución: últimos 12 meses (los que tienen OT en el filtro, en orden)
  const mensual = useMemo(() => {
    const mapa = new Map<string, { mes: string; mo: number; rep: number }>();
    filas.forEach(f => {
      const ym = f.fecha.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(ym)) return;
      const cur = mapa.get(ym) ?? { mes: etiquetaMes(ym), mo: 0, rep: 0 };
      cur.mo += f.mo; cur.rep += f.rep;
      mapa.set(ym, cur);
    });
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([, v]) => ({ ...v, mo: Math.round(v.mo), rep: Math.round(v.rep) }));
  }, [filas]);

  // Correctivo contra preventivo (y otros tipos) por costo
  const porTipo: Porcion[] = useMemo(() => {
    const m = new Map<string, number>();
    filas.forEach(f => m.set(f.tipo, (m.get(f.tipo) ?? 0) + f.total));
    const colores = ['var(--accent)', 'var(--amber)', 'var(--green)', 'var(--blue)', 'var(--gray)'];
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([nombre, valor], i) => ({ nombre: `${nombre} · ${soles(valor)}`, valor: Math.round(valor), color: colores[i % colores.length] }));
  }, [filas]);

  // Unidades con mayor costo acumulado
  const unidades = useMemo(() => {
    const m = new Map<string, { placa: string; ots: number; mo: number; rep: number; total: number }>();
    filas.forEach(f => {
      if (!f.placa) return;
      const cur = m.get(f.placa) ?? { placa: f.placa, ots: 0, mo: 0, rep: 0, total: 0 };
      cur.ots += 1; cur.mo += f.mo; cur.rep += f.rep; cur.total += f.total;
      m.set(f.placa, cur);
    });
    return [...m.values()].sort((a, b) => b.total - a.total).slice(0, 15);
  }, [filas]);

  async function exportar() {
    try {
      await exportarExcel('Reporte-financiero-taller', 'OT', ['OT', 'Unidad', 'Tipo', 'Fecha', 'Mano de obra (S/)', 'Repuestos (S/)', 'Total (S/)'],
        filas.map(f => [f.ticket, f.placa, f.tipo, f.fecha, f.mo, f.rep, f.total]));
      haptic('success');
    } catch (e) { toast(toastErr(e), 'error'); haptic('warning'); }
  }

  const tipos = [...new Set(todas.map(f => f.tipo))].sort();

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Reporte financiero de taller"
        subtitle={cargando ? 'Cargando…' : `${totales.ots} OT aprobadas o cerradas en el filtro`}
        actions={<MenuOtros opciones={[{ label: 'Exportar Excel', detalle: `${filas.length} OT`, icon: <FileSpreadsheet size={17} />, onSelect: exportar }]} />}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--s-3)' }}>
          {[
            { t: 'Gasto total en taller', v: soles(totales.total), c: 'var(--label)' },
            { t: 'Repuestos (almacén)', v: soles(totales.rep), c: 'var(--accent)' },
            { t: 'Mano de obra', v: soles(totales.mo), c: 'var(--amber-ink)' },
            { t: 'Costo promedio por OT', v: soles(totales.promedio), c: 'var(--green-ink)' },
          ].map(k => (
            <div key={k.t} style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 16, padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--label-2)' }}>{k.t}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.375rem', fontWeight: 800, color: k.c, fontVariantNumeric: 'tabular-nums' }}>{k.v}</span>
            </div>
          ))}
        </div>

        <SearchField value={placa} placeholder="Filtrar por placa…" onChange={setPlaca} />
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <SelectInput value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo de OT" style={{ width: 'auto' }}>
            <option value="">Todos los tipos</option>
            {tipos.map(t => <option key={t} value={t}>{t}</option>)}
          </SelectInput>
          <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /></label>
          <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></label>
        </div>

        {error ? <Notice tone="error">{toastErr(error)}</Notice> : cargando ? <PageLoader /> : filas.length === 0 ? (
          <EmptyState icon={todas.length ? <SearchX size={22} /> : <Wallet size={22} />} title={todas.length ? 'Sin coincidencias' : 'Sin OT aprobadas'}>
            Aparecen las OT aprobadas o cerradas, con su mano de obra y sus repuestos.
          </EmptyState>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 'var(--s-3)' }}>
              <section style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 14, padding: 'var(--s-4)', gridColumn: '1 / -1', minWidth: 0 }}>
                <h3 style={{ margin: '0 0 var(--s-3)', fontSize: '0.875rem', fontWeight: 700 }}>Costo mensual · mano de obra y repuestos</h3>
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mensual} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 4" />
                      <XAxis dataKey="mes" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={v => (Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : `${v}`)} />
                      <Tooltip formatter={(v, nombre) => [soles(Number(v)), nombre === 'mo' ? 'Mano de obra' : 'Repuestos']} />
                      <Bar dataKey="mo" stackId="c" fill={colAzul} isAnimationActive={false} />
                      <Bar dataKey="rep" stackId="c" fill={colNaranja} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 14, padding: 'var(--s-4)', minWidth: 0 }}>
                <h3 style={{ margin: '0 0 var(--s-3)', fontSize: '0.875rem', fontWeight: 700 }}>Costo por tipo de OT</h3>
                <DonaGrafico porciones={porTipo} altura={180} />
              </section>

              <section style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 14, padding: 'var(--s-4)', minWidth: 0 }}>
                <h3 style={{ margin: '0 0 var(--s-3)', fontSize: '0.875rem', fontWeight: 700 }}>Unidades con mayor costo</h3>
                <TablaRedimensionable id="finanzas-taller-unidades" columnas={COLUMNAS_UNIDADES} ariaLabel="Unidades con mayor costo en taller" altoMax="360px">
                  {unidades.map(u => (
                    <tr key={u.placa}>
                      <Celda><LicensePlate plate={u.placa} size="sm" /></Celda>
                      <Celda alinear="right" mono>{u.ots}</Celda>
                      <Celda alinear="right" mono>{soles(u.mo)}</Celda>
                      <Celda alinear="right" mono>{soles(u.rep)}</Celda>
                      <Celda alinear="right" mono>{soles(u.total)}</Celda>
                    </tr>
                  ))}
                </TablaRedimensionable>
              </section>
            </div>
          </>
        )}
      </div>
    </Page>
  );
}
