import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, SearchX, Truck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';

interface OrdenViaje {
  id?: number | string;
  codigo?: string | null;
  fecha_salida?: string | null;
  fecha_retorno?: string | null;
  placa?: string | null;
  conductor?: string | null;
  ruta?: string | null;
  origen?: string | null;
  destino?: string | null;
  cliente?: string | null;
  estado?: string | null;
  [key: string]: unknown;
}

function arr<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { data?: T[] })?.data) ?? [];
}

function estadoColor(e: string | null | undefined): string {
  const s = String(e ?? '').toLowerCase();
  if (s.includes('finalizado') || s.includes('completado') || s.includes('entregado')) return 'green';
  if (s.includes('activo') || s.includes('curso') || s.includes('viaje')) return 'accent';
  if (s.includes('pendiente') || s.includes('borrador') || s.includes('asignado')) return 'amber';
  if (s.includes('anulado') || s.includes('cancelado')) return 'red';
  return 'neutral';
}

function fmtFecha(f: string | null | undefined): string {
  if (!f) return '—';
  return String(f).split('T')[0];
}

export function OrdenesViajePage() {
  const { data: raw, isLoading, isError, error } = useQuery({
    queryKey: ['operaciones-ordenes-viaje'],
    queryFn: () => api<unknown>('/operaciones/ordenes-viaje', { query: { limit: 1000 } }),
    staleTime: 30_000,
  });

  const [busqueda, setBusqueda] = useState('');
  const lista: OrdenViaje[] = arr<OrdenViaje>(raw);

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(o =>
      String(o.codigo ?? '').toUpperCase().includes(q) ||
      String(o.placa ?? '').toUpperCase().includes(q) ||
      String(o.conductor ?? '').toUpperCase().includes(q) ||
      String(o.cliente ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Órdenes de viaje"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} órdenes`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('operaciones/ordenes-viaje') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Código, placa, conductor, cliente…" />

          {visibles.length === 0 ? (
            <EmptyState
              icon={busqueda ? <SearchX size={22} /> : <Truck size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin órdenes de viaje'}
            >
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Las órdenes de viaje aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '50rem' }}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Fecha salida</th>
                    <th>Placa</th>
                    <th>Conductor</th>
                    <th>Origen → Destino</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((o, i) => {
                    const ruta = (o.origen && o.destino)
                      ? `${o.origen} → ${o.destino}`
                      : (o.ruta ?? '—');
                    return (
                      <tr key={String(o.id ?? i)}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem', color: 'var(--accent)' }}>
                          {o.codigo ?? '—'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                          {fmtFecha(o.fecha_salida)}
                        </td>
                        <td style={{ fontWeight: 700 }}>{o.placa ?? '—'}</td>
                        <td>{o.conductor ?? '—'}</td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>{ruta}</td>
                        <td>{o.cliente ?? '—'}</td>
                        <td>
                          <span className={`ot-estado ot-estado--${estadoColor(o.estado)}`}>{o.estado ?? '—'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
