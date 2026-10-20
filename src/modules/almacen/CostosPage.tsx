import '../mantenimiento/mant.css';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { api, errorMessage } from '../../core/api/client';

// Almacén › Costos: valorizado del inventario y consumo por artículo.
// Mismos datos y orden que la versión clásica (GET /api/almacen/valorizado y GET /api/almacen/costos).
interface ArticuloValorado {
  id: string; descripcion: string; familia: string | null; unidad: string | null; moneda: string | null;
  stock_actual: number; costo_referencial: number | string | null; valor_total: number;
}
interface FamiliaValorada { familia: string; valor_pen: number; valor_usd: number; articulos: number }
interface Valorizado { items: ArticuloValorado[]; totalPEN: number; totalUSD: number; porFamilia: FamiliaValorada[] }
interface ArticuloConsumo { id: string; descripcion: string; familia: string | null; unidad: string | null; cantidad_total: number | string; costo_total: number | string }
interface Consumo { topItems: ArticuloConsumo[] }

const num = (v: unknown) => Number(v) || 0;
const fmt = (v: unknown) => num(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const tarjeta = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 14, padding: 'var(--s-4)', minWidth: 0 } as const;
const titulo = { margin: '0 0 var(--s-3)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--label)' } as const;
const nota = { margin: 'var(--s-2) 0 0', fontSize: '0.75rem', color: 'var(--label-2)' } as const;

const COLUMNAS_CONSUMO: ColumnaTabla[] = [
  { id: 'n', titulo: '#', ancho: 56 },
  { id: 'articulo', titulo: 'Artículo', ancho: 300 },
  { id: 'familia', titulo: 'Familia', ancho: 180 },
  { id: 'cantidad', titulo: 'Cantidad', ancho: 150, alinear: 'right' },
  { id: 'importe', titulo: 'Importe (S/)', ancho: 150, alinear: 'right' },
];
const COLUMNAS_CAROS: ColumnaTabla[] = [
  { id: 'n', titulo: '#', ancho: 56 },
  { id: 'articulo', titulo: 'Artículo', ancho: 300 },
  { id: 'familia', titulo: 'Familia', ancho: 180 },
  { id: 'stock', titulo: 'Stock', ancho: 130, alinear: 'right' },
  { id: 'costo', titulo: 'Costo unitario', ancho: 150, alinear: 'right' },
  { id: 'valor', titulo: 'Valor total', ancho: 150, alinear: 'right' },
];
const COLUMNAS_FAMILIA: ColumnaTabla[] = [
  { id: 'familia', titulo: 'Familia', ancho: 220 },
  { id: 'articulos', titulo: 'Artículos', ancho: 110, alinear: 'right' },
  { id: 'valor', titulo: 'Valor (S/)', ancho: 160, alinear: 'right' },
  { id: 'participacion', titulo: 'Participación', ancho: 300 },
];

export function CostosPage() {
  const valorizado = useQuery<Valorizado>({
    queryKey: ['almacen', 'valorizado'],
    queryFn: () => api<Valorizado>('/almacen/valorizado'),
    staleTime: 60_000,
  });
  const consumo = useQuery<Consumo>({
    queryKey: ['almacen', 'costos'],
    queryFn: () => api<Consumo>('/almacen/costos'),
    staleTime: 60_000,
  });

  const items = useMemo(() => valorizado.data?.items ?? [], [valorizado.data]);
  const familias = useMemo(() => [...(valorizado.data?.porFamilia ?? [])].sort((a, b) => b.valor_pen - a.valor_pen), [valorizado.data]);
  // El servidor trae los 20 de mayor costo; se ordenan por cantidad consumida, como en el clásico
  const topConsumo = useMemo(() => [...(consumo.data?.topItems ?? [])].sort((a, b) => num(b.cantidad_total) - num(a.cantidad_total)), [consumo.data]);
  const masCaros = useMemo(() => [...items].sort((a, b) => num(b.costo_referencial) - num(a.costo_referencial)).slice(0, 10), [items]);
  const conStock = items.filter(i => num(i.stock_actual) > 0).length;
  const totalPEN = valorizado.data?.totalPEN ?? 0;
  const totalUSD = valorizado.data?.totalUSD ?? 0;
  const maxFamilia = familias.reduce((m, f) => Math.max(m, f.valor_pen), 0.01);
  const masConsumido = topConsumo[0];

  const cargando = valorizado.isLoading || consumo.isLoading;
  const error = valorizado.isError && consumo.isError ? valorizado.error ?? consumo.error : null;

  return (
    <Page>
      <PageHeader eyebrow="Almacén" title="Costos de almacén" subtitle="Valorizado del inventario y consumo por artículo" />
      {cargando ? <PageLoader /> : error ? <Notice tone="error">{errorMessage(error)}</Notice> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--s-3)' }}>
            <div style={tarjeta}><p style={titulo}>Valor en soles</p><strong style={{ fontSize: '1.4rem' }}>S/ {fmt(totalPEN)}</strong></div>
            <div style={tarjeta}><p style={titulo}>Valor en dólares</p><strong style={{ fontSize: '1.4rem' }}>$ {fmt(totalUSD)}</strong></div>
            <div style={tarjeta}><p style={titulo}>Familias</p><strong style={{ fontSize: '1.4rem' }}>{familias.length}</strong></div>
            <div style={tarjeta}><p style={titulo}>Artículos con stock</p><strong style={{ fontSize: '1.4rem' }}>{conStock}</strong></div>
          </div>

          <div style={tarjeta}>
            <p style={titulo}>Artículo más consumido</p>
            {masConsumido ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
                <Boxes size={28} aria-hidden />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong>{masConsumido.descripcion || '—'}</strong>
                  <p style={nota}>{masConsumido.familia || 'Sin familia'}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong style={{ fontSize: '1.2rem' }}>{fmt(masConsumido.cantidad_total)} {masConsumido.unidad || 'und'}</strong>
                  <p style={nota}>Importe total: S/ {fmt(masConsumido.costo_total)}</p>
                </div>
              </div>
            ) : <p style={nota}>Sin movimientos de salida registrados.</p>}
          </div>

          <div style={tarjeta}>
            <p style={titulo}>Consumo: los 10 artículos más usados</p>
            {topConsumo.length === 0 ? <p style={nota}>Sin movimientos de salida registrados.</p> : (
              <TablaRedimensionable id="almacen-costos-consumo" columnas={COLUMNAS_CONSUMO} ariaLabel="Artículos más consumidos">
                {topConsumo.slice(0, 10).map((it, i) => (
                  <tr key={it.id}>
                    <Celda mono>{i + 1}</Celda>
                    <Celda>{it.descripcion || '—'}</Celda>
                    <Celda>{it.familia || '—'}</Celda>
                    <Celda alinear="right" mono>{fmt(it.cantidad_total)} {it.unidad || ''}</Celda>
                    <Celda alinear="right" mono>S/ {fmt(it.costo_total)}</Celda>
                  </tr>
                ))}
              </TablaRedimensionable>
            )}
          </div>

          <div style={tarjeta}>
            <p style={titulo}>Artículos más caros (costo unitario)</p>
            {masCaros.length === 0 ? <p style={nota}>Sin artículos en inventario.</p> : (
              <TablaRedimensionable id="almacen-costos-caros" columnas={COLUMNAS_CAROS} ariaLabel="Artículos más caros">
                {masCaros.map((it, i) => {
                  const simbolo = it.moneda === 'USD' ? '$' : 'S/';
                  return (
                    <tr key={it.id}>
                      <Celda mono>{i + 1}</Celda>
                      <Celda>{it.descripcion || '—'}</Celda>
                      <Celda>{it.familia || '—'}</Celda>
                      <Celda alinear="right" mono>{fmt(it.stock_actual)} {it.unidad || ''}</Celda>
                      <Celda alinear="right" mono>{simbolo} {fmt(it.costo_referencial)}</Celda>
                      <Celda alinear="right" mono>{simbolo} {fmt(it.valor_total)}</Celda>
                    </tr>
                  );
                })}
              </TablaRedimensionable>
            )}
          </div>

          <div style={tarjeta}>
            <p style={titulo}>Valorizado por familia (soles)</p>
            {familias.length === 0 ? <p style={nota}>Sin familias disponibles.</p> : (
              <TablaRedimensionable id="almacen-costos-familias" columnas={COLUMNAS_FAMILIA} ariaLabel="Valorizado por familia">
                {familias.map(f => {
                  const pct = totalPEN > 0 ? Math.round((f.valor_pen / totalPEN) * 100) : 0;
                  const ancho = Math.round((f.valor_pen / maxFamilia) * 100);
                  return (
                    <tr key={f.familia}>
                      <Celda>{f.familia || '—'}</Celda>
                      <Celda alinear="right" mono>{f.articulos}</Celda>
                      <Celda alinear="right" mono>S/ {fmt(f.valor_pen)}</Celda>
                      <Celda>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)', width: '100%' }}>
                          <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--fill-2)', overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: `${ancho}%`, background: 'var(--accent)' }} />
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--label-2)', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
                        </span>
                      </Celda>
                    </tr>
                  );
                })}
              </TablaRedimensionable>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
