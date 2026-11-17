import '../mantenimiento/mant.css';
import '../../core/ui/acciones-iconos.css';
import '../almacen/almacen.css';
import '../almacen/entradas.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Coins, Percent, RefreshCw, SearchX, TrendingUp } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { BarraFiltros } from '../../core/ui/FiltrosListado';
import { KpiTarjeta } from '../../core/ui/KpiTarjeta';
import { Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { api, errorMessage } from '../../core/api/client';
import { formatFechaPe, formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { Dato, Grupo } from '../almacen/EntradaDetalle';

interface FilaRent {
  codigo: string; fecha: string; cliente: string | null; ruta: string | null; es_retorno: boolean; estado: string | null; ejecucion: string | null;
  ingreso: number; combustible: number; gastos_viaje: number; tercero: number; gastos: number; utilidad: number; margen: number | null;
  km: number | null; gasto_por_km: number | null; ingreso_por_km: number | null;
}
interface DetalleRent extends FilaRent {
  origen: string | null; destino: string | null; sin_asignar: number;
  vales: Array<{ codigo: string; viaje: string; fecha: string; estacion_nombre: string; combustible: string | null; galones: number | string; total: number | string }>;
  gastos_rendidos: Array<{ id: number; viaje: string; fecha: string; tipo_gasto: string; sub_motivo: string | null; detalle: string | null; proveedor_nombre: string | null; importe: number | string }>;
}

const COLUMNAS: ColumnaTabla[] = [
  { id: 'codigo', titulo: 'Servicio', ancho: 130 },
  { id: 'fecha', titulo: 'Fecha', ancho: 105 },
  { id: 'tramo', titulo: 'Ida / regreso', ancho: 110 },
  { id: 'cliente', titulo: 'Cliente', ancho: 220 },
  { id: 'ruta', titulo: 'Ruta', ancho: 220 },
  { id: 'ingreso', titulo: 'Ingreso (sin IGV)', ancho: 140, alinear: 'right' },
  { id: 'combustible', titulo: 'Combustible', ancho: 120, alinear: 'right' },
  { id: 'gastosviaje', titulo: 'Gastos de viaje', ancho: 130, alinear: 'right' },
  { id: 'tercero', titulo: 'Tercero', ancho: 110, alinear: 'right' },
  { id: 'gastos', titulo: 'Gastos totales', ancho: 130, alinear: 'right' },
  { id: 'utilidad', titulo: 'Utilidad', ancho: 130, alinear: 'right' },
  { id: 'margen', titulo: 'Margen', ancho: 90, alinear: 'right' },
];
const pct = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
const colorUtilidad = (u: number) => (u < 0 ? 'var(--red-ink)' : 'var(--green-ink)');
const tramo = (r: FilaRent) => (r.es_retorno ? 'Regreso' : 'Ida');

/** Operaciones › Rentabilidad: lo que deja cada servicio. Ingreso (flete sin IGV) menos combustible, gastos rendidos del viaje y costo del tercero. */
export function RentabilidadPage() {
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [codigo, setCodigo] = useState<string | null>(null);
  const lista = useQuery({
    queryKey: ['rentabilidad', 'lista'],
    queryFn: () => api<{ data: FilaRent[] }>('/rentabilidad').then(r => r.data ?? []),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const todas = lista.data ?? [];
    return q ? todas.filter(r => `${r.codigo} ${r.cliente ?? ''} ${r.ruta ?? ''}`.toLowerCase().includes(q)) : todas;
  }, [lista.data, busqueda]);
  const total = useMemo(() => {
    const ingreso = filas.reduce((s, r) => s + r.ingreso, 0);
    const gastos = filas.reduce((s, r) => s + r.gastos, 0);
    return { ingreso, gastos, utilidad: ingreso - gastos, margen: ingreso > 0 ? ((ingreso - gastos) / ingreso) * 100 : null };
  }, [filas]);

  return (
    <Page>
      <PageHeader eyebrow="Operaciones" title="Rentabilidad"
        subtitle={lista.isLoading ? 'Cargando…' : `${filas.length} ${filas.length === 1 ? 'servicio' : 'servicios'} · ingreso sin IGV menos gastos directos`}
        actions={
          <div className="oc-acciones oc-acciones--sinfondo">
            <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--celeste" data-tip="Actualizar" aria-label="Actualizar" onClick={() => { void qc.invalidateQueries({ queryKey: ['rentabilidad'] }); }}>
              <RefreshCw size={17} />
            </button>
          </div>
        } />

      {lista.isError ? <Notice tone="error">{errorMessage(lista.error)}</Notice> : lista.isLoading ? <PageLoader /> : (
        <div>
          <div className="inv-kpis" style={{ marginBottom: 'var(--s-4)' }}>
            <KpiTarjeta etiqueta="Ingresos" valor={formatSoles(total.ingreso)} sub="Fletes sin IGV" icono={<ArrowUpRight size={18} />} />
            <KpiTarjeta etiqueta="Gastos" valor={formatSoles(total.gastos)} sub="Combustible, viaje y terceros" icono={<ArrowDownLeft size={18} />} tono="valor" />
            <KpiTarjeta etiqueta="Utilidad" valor={formatSoles(total.utilidad)} sub="Ingresos − gastos" icono={<Coins size={18} />} tono={total.utilidad < 0 ? 'warning' : undefined} />
            <KpiTarjeta etiqueta="Margen" valor={pct(total.margen)} sub="Utilidad ÷ ingresos" icono={<Percent size={18} />} />
          </div>
          <div style={{ marginBottom: 'var(--s-4)' }}>
            <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Servicio, cliente o ruta" activos={0} onAbrirFiltros={() => undefined}>
              <span className="badge">{filas.length} {filas.length === 1 ? 'servicio' : 'servicios'}</span>
            </BarraFiltros>
          </div>
          {filas.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <TrendingUp size={22} />} title={busqueda ? 'Ningún servicio coincide' : 'Aún no hay servicios'}>
              {busqueda ? null : 'Cuando haya servicios con su flete, aquí verás lo que deja cada uno.'}
            </EmptyState>
          ) : (
            <TablaRedimensionable id="rentabilidad-v1" columnas={COLUMNAS} ariaLabel="Rentabilidad por servicio" altoMax="68vh">
              {filas.map(r => (
                <tr key={r.codigo} className="tabla-redim__fila--click" onClick={() => { haptic('selection'); setCodigo(r.codigo); }}>
                  <Celda><button type="button" className="oc-codigo" onClick={e => { e.stopPropagation(); setCodigo(r.codigo); }}>{r.codigo}</button></Celda>
                  <Celda>{formatFechaPe(r.fecha)}</Celda>
                  <Celda><span className="oc-chip">{tramo(r)}</span></Celda>
                  <Celda>{r.cliente || '—'}</Celda>
                  <Celda>{r.ruta || '—'}</Celda>
                  <Celda alinear="right" mono>{formatSoles(r.ingreso)}</Celda>
                  <Celda alinear="right" mono>{formatSoles(r.combustible)}</Celda>
                  <Celda alinear="right" mono>{formatSoles(r.gastos_viaje)}</Celda>
                  <Celda alinear="right" mono>{formatSoles(r.tercero)}</Celda>
                  <Celda alinear="right" mono>{formatSoles(r.gastos)}</Celda>
                  <Celda alinear="right" mono><strong style={{ color: colorUtilidad(r.utilidad) }}>{formatSoles(r.utilidad)}</strong></Celda>
                  <Celda alinear="right" mono><strong style={{ color: colorUtilidad(r.utilidad) }}>{pct(r.margen)}</strong></Celda>
                </tr>
              ))}
            </TablaRedimensionable>
          )}
        </div>
      )}
      <DetalleRentabilidad codigo={codigo} onClose={() => setCodigo(null)} />
    </Page>
  );
}

/** Rentabilidad de un servicio: de dónde sale el ingreso, cada gasto con su documento y el resultado */
function DetalleRentabilidad({ codigo, onClose }: { codigo: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['rentabilidad', 'servicio', codigo],
    enabled: !!codigo,
    queryFn: () => api<{ data: DetalleRent }>(`/rentabilidad/servicio/${encodeURIComponent(codigo ?? '')}`).then(r => r.data),
  });
  const d = q.data;
  return (
    <Sheet open={!!codigo} onClose={onClose} title={codigo ? `Rentabilidad · ${codigo}` : 'Rentabilidad'} ancho ligera>
      {q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : !d ? <PageLoader /> : (
        <div className="oc-ficha">
          <header className="oc-hero">
            <div className="oc-hero__izq">
              <span className="oc-hero__id">{tramo(d)} · {d.cliente || 'Sin cliente'}</span>
              <h2 className="oc-hero__titulo">{d.ruta || [d.origen, d.destino].filter(Boolean).join(' → ') || d.codigo}</h2>
            </div>
          </header>
          {d.sin_asignar > 0 && (
            <Notice tone="accent">El viaje tiene {d.sin_asignar} {d.sin_asignar === 1 ? 'gasto' : 'gastos'} sin servicio asignado: no entran en esta rentabilidad hasta que se asignen.</Notice>
          )}
          <div className="oc-datos">
            <Grupo titulo="Resultado" ancho>
              <Dato etiqueta="Ingreso (flete sin IGV)" valor={formatSoles(d.ingreso)} />
              <Dato etiqueta="Gastos directos" valor={formatSoles(d.gastos)} />
              <Dato etiqueta="Utilidad" valor={formatSoles(d.utilidad)} />
              <Dato etiqueta="Margen" valor={pct(d.margen)} />
              {d.km ? <Dato etiqueta="Kilómetros" valor={`${d.km.toLocaleString('es-PE')} km`} extra={`Gasto ${formatSoles(d.gasto_por_km ?? 0)} por km · ingreso ${formatSoles(d.ingreso_por_km ?? 0)} por km`} ancho /> : null}
            </Grupo>
            <Grupo titulo="Gastos por categoría" ancho>
              <Dato etiqueta="Combustible" valor={formatSoles(d.combustible)} />
              <Dato etiqueta="Gastos de viaje rendidos" valor={formatSoles(d.gastos_viaje)} />
              <Dato etiqueta="Tercero" valor={formatSoles(d.tercero)} extra={d.tercero > 0 ? 'Costo del tercero repartido entre los servicios del viaje' : undefined} />
            </Grupo>
          </div>
          <div>
            <p className="oc-seccion">Vales de combustible ({d.vales.length})</p>
            {d.vales.length === 0 ? <p className="t-footnote c-secondary">Sin vales asignados a este servicio.</p> : (
              <ul className="sol-historial">
                {d.vales.map(v => <li key={v.codigo}><span><strong>{v.codigo}</strong> · {formatFechaPe(v.fecha)} · {v.estacion_nombre || 'Estación'} · {v.combustible ?? ''} — <strong>{formatSoles(Number(v.total))}</strong></span></li>)}
              </ul>
            )}
          </div>
          <div>
            <p className="oc-seccion">Gastos rendidos del viaje ({d.gastos_rendidos.length})</p>
            {d.gastos_rendidos.length === 0 ? <p className="t-footnote c-secondary">Sin gastos asignados a este servicio.</p> : (
              <ul className="sol-historial">
                {d.gastos_rendidos.map(g => <li key={g.id}><span><strong>G-{String(g.id).padStart(4, '0')}</strong> · {formatFechaPe(g.fecha)} · {g.sub_motivo || g.tipo_gasto}{g.detalle ? ` · ${g.detalle}` : ''} — <strong>{formatSoles(Number(g.importe))}</strong></span></li>)}
              </ul>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
