import '../mantenimiento/mant.css';
import './liq.css';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, FileSpreadsheet, RefreshCw, ScrollText, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { ChoiceChips } from '../../core/ui/Chips';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { api, errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { MOBILE_QUERY, useMediaQuery } from '../../core/lib/useMediaQuery';
import { abrirClasico } from '../../core/layout/navigation';
import { LiquidacionDetalle } from './liq-DetalleSheet';
import { etiquetaBalance, fechaPe, num, soles, solesConSigno, tonoBalance, type Viaje } from './liq-utils';

type Estado = 'TODOS' | 'PENDIENTE' | 'SALDO_EMPRESA' | 'SALDO_CONDUCTOR' | 'CUADRADO';

const COLUMNAS: ColumnaTabla[] = [
  { id: 'viaje', titulo: 'Viaje', ancho: 130 },
  { id: 'fecha', titulo: 'Fecha', ancho: 110 },
  { id: 'conductor', titulo: 'Conductor', ancho: 200 },
  { id: 'placas', titulo: 'Tracto / Remolque', ancho: 180 },
  { id: 'ruta', titulo: 'Ruta', ancho: 230 },
  { id: 'entregado', titulo: 'Total entregado', ancho: 140, alinear: 'right' },
  { id: 'rendido', titulo: 'Total rendido', ancho: 140, alinear: 'right' },
  { id: 'saldo', titulo: 'Saldo / diferencia', ancho: 150, alinear: 'right' },
  { id: 'balance', titulo: 'Estado balance', ancho: 140 },
];

function useViajes(q: string, estado: Estado) {
  return useQuery<Viaje[]>({
    queryKey: ['tesoreria', 'liquidaciones', q, estado],
    queryFn: () => {
      const p = new URLSearchParams({ limit: '100' });
      if (q) p.set('q', q);
      if (estado !== 'TODOS') p.set('estado_balance', estado);
      return api<{ ok?: boolean; data?: Viaje[] }>(`/tesoreria/liquidaciones-gastos?${p}`).then(r => (Array.isArray(r.data) ? r.data : []));
    },
    staleTime: 30_000,
  });
}

// Tesorería › Liquidaciones: balance depositado vs. rendido por viaje, y caja de compensación.
export function LiquidacionesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const movil = useMediaQuery(MOBILE_QUERY);
  const [busqueda, setBusqueda] = useState('');
  // La búsqueda va al servidor (límite de 100 viajes): espera a que la persona deje de escribir
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<Estado>('TODOS');
  const [seleccion, setSeleccion] = useState<Viaje | null>(null);
  const [detalleAbierto, setDetalleAbierto] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(busqueda.trim()), 350);
    return () => window.clearTimeout(t);
  }, [busqueda]);

  const { data, isLoading, isError, error } = useViajes(q, estado);
  const lista = data ?? [];
  const pendientes = lista.filter(v => v.estado_balance !== 'CUADRADO').length;
  const totales = useMemo(() => ({
    entregado: lista.reduce((s, v) => s + num(v.total_depositado), 0),
    rendido: lista.reduce((s, v) => s + num(v.total_rendido), 0),
  }), [lista]);
  const filtrando = !!q || estado !== 'TODOS';

  function abrir(v: Viaje) {
    haptic('selection');
    setSeleccion(v);
    setDetalleAbierto(true);
  }

  async function exportar() {
    try {
      await exportarExcel('Liquidaciones-por-viaje', 'Liquidaciones',
        ['Viaje', 'Fecha', 'Conductor', 'Tracto', 'Remolque', 'Ruta', 'Total entregado', 'Total rendido', 'Saldo / diferencia', 'Estado balance'],
        lista.map(v => [v.viaje, fechaPe(v.fecha), v.conductor, v.placa_tracto, v.placa_remolque, v.ruta,
          num(v.total_depositado), num(v.total_rendido), num(v.saldo_diferencia), etiquetaBalance(v.estado_balance)]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Liquidaciones"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} viajes · ${pendientes} por regularizar`}
        actions={
          <>
            <Button variant="plain" iconOnly icon={<RefreshCw size={17} />} aria-label="Actualizar" onClick={() => { haptic('selection'); void qc.invalidateQueries({ queryKey: ['tesoreria'] }); }} />
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${lista.length} viajes`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('tesoreria/liquidaciones') },
            ]} />
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div className="inv-metricas">
          <div className="inv-metrica"><span className="inv-metrica__num liq-num">{soles(totales.entregado)}</span><span className="inv-metrica__label">Total entregado</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num liq-num">{soles(totales.rendido)}</span><span className="inv-metrica__label">Total rendido</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num inv-metrica__num--warning">{pendientes}</span><span className="inv-metrica__label">Por regularizar</span></div>
        </div>

        <SearchField value={busqueda} onChange={setBusqueda} placeholder="Viaje, conductor, placa o ruta…" />
        <ChoiceChips
          label="Estado del balance"
          value={estado}
          onChange={setEstado}
          options={[
            { value: 'TODOS', label: 'Todos' },
            { value: 'PENDIENTE', label: 'Sin cuadrar' },
            { value: 'SALDO_EMPRESA', label: 'Sobrantes' },
            { value: 'SALDO_CONDUCTOR', label: 'Faltantes' },
            { value: 'CUADRADO', label: 'Cuadrados' },
          ]}
        />

        {isLoading ? <PageLoader /> : isError ? (
          <Notice tone="error">{errorMessage(error)}</Notice>
        ) : lista.length === 0 ? (
          <EmptyState icon={filtrando ? <SearchX size={22} /> : <ScrollText size={22} />} title={filtrando ? 'Sin coincidencias' : 'Sin liquidaciones'}>
            {filtrando ? 'Prueba con otra búsqueda o quita el filtro.' : 'Aparecen cuando hay viajes con cajas de viáticos y gastos rendidos.'}
          </EmptyState>
        ) : movil ? (
          <div className="tarjeta__lista">
            {lista.map(v => {
              const t = tonoBalance(v.estado_balance);
              return (
                <button key={v.viaje} type="button" className="mov-fila pressable" onClick={() => abrir(v)}>
                  <div className="mov-fila__icon" style={{ background: `var(--${t}-tint)`, color: `var(--${t}-ink)` }}>
                    <ScrollText size={16} />
                  </div>
                  <div className="mov-fila__cuerpo">
                    <span className="mov-fila__titulo">{v.viaje} · {v.conductor || 'Sin conductor'}</span>
                    <span className="mov-fila__sub">{[v.placa_tracto, v.placa_remolque, v.ruta].filter(Boolean).join(' · ') || fechaPe(v.fecha)}</span>
                    <span className="mov-fila__sub">Entregado {soles(v.total_depositado)} · Rendido {soles(v.total_rendido)}</span>
                  </div>
                  <div className="mov-fila__derecha">
                    <span className="mov-fila__monto liq-num">{solesConSigno(v.saldo_diferencia)}</span>
                    <Badge tone={t}>{etiquetaBalance(v.estado_balance)}</Badge>
                    {num(v.fondos_pendientes) > 0 && <span className="liq-celda-aviso">Pendiente {soles(v.fondos_pendientes)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <TablaRedimensionable id="liq-viajes" ariaLabel="Liquidaciones por viaje" columnas={COLUMNAS} altoMax="68vh">
            {lista.map(v => (
              <tr
                key={v.viaje}
                className="liq-fila"
                tabIndex={0}
                onClick={() => abrir(v)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(v); } }}
              >
                <Celda mono>{v.viaje}</Celda>
                <Celda>{fechaPe(v.fecha)}</Celda>
                <Celda>{v.conductor || 'Sin conductor'}</Celda>
                <Celda>{[v.placa_tracto, v.placa_remolque].filter(Boolean).join(' / ') || '—'}</Celda>
                <Celda>{v.ruta || '—'}</Celda>
                <Celda mono alinear="right">{soles(v.total_depositado)}</Celda>
                <Celda mono alinear="right">{soles(v.total_rendido)}</Celda>
                <Celda mono alinear="right">
                  <span className={`liq-num${num(v.saldo_diferencia) < 0 ? ' inv-metrica__num--critical' : num(v.saldo_diferencia) > 0 ? ' inv-metrica__num--warning' : ''}`}>
                    {solesConSigno(v.saldo_diferencia)}
                  </span>
                </Celda>
                <Celda>
                  <Badge tone={tonoBalance(v.estado_balance)}>{etiquetaBalance(v.estado_balance)}</Badge>
                  {num(v.fondos_pendientes) > 0 && <span className="liq-celda-aviso"> · Pendiente {soles(v.fondos_pendientes)}</span>}
                </Celda>
              </tr>
            ))}
          </TablaRedimensionable>
        )}
      </div>

      <LiquidacionDetalle viaje={seleccion} abierto={detalleAbierto} onClose={() => setDetalleAbierto(false)} />
    </Page>
  );
}
