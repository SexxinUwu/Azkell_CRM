import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, ClipboardList, SearchX } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';

interface OrdenServicio {
  id?: number | string;
  codigo?: string | null;
  fecha?: string | null;
  cliente?: string | null;
  descripcion?: string | null;
  origen?: string | null;
  destino?: string | null;
  estado?: string | null;
  orden_viaje_code?: string | null;
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

export function OrdenesServicioPage() {
  const { data: raw, isLoading, isError, error } = useQuery({
    queryKey: ['operaciones-ordenes-servicio'],
    queryFn: () => api<unknown>('/operaciones/ordenes-servicio', { query: { limit: 1000 } }),
    staleTime: 30_000,
  });

  const [busqueda, setBusqueda] = useState('');
  const lista: OrdenServicio[] = arr<OrdenServicio>(raw);

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(o =>
      String(o.codigo ?? '').toUpperCase().includes(q) ||
      String(o.cliente ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Órdenes de servicio"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} órdenes`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('operaciones/ordenes-servicio') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Código, cliente…" />

          {visibles.length === 0 ? (
            <EmptyState
              icon={busqueda ? <SearchX size={22} /> : <ClipboardList size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin órdenes de servicio'}
            >
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Las órdenes de servicio aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '42rem' }}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Descripción</th>
                    <th>OV vinculada</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((o, i) => (
                    <tr key={String(o.id ?? i)}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem', color: 'var(--accent)' }}>
                        {o.codigo ?? '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                        {fmtFecha(o.fecha)}
                      </td>
                      <td style={{ fontWeight: 700 }}>{o.cliente ?? '—'}</td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--label-2)', maxWidth: '14rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.descripcion ?? '—'}
                      </td>
                      <td style={{ fontFamily: o.orden_viaje_code ? 'var(--font-mono)' : undefined, fontSize: '0.8125rem' }}>
                        {o.orden_viaje_code ?? '—'}
                      </td>
                      <td>
                        <span className={`ot-estado ot-estado--${estadoColor(o.estado)}`}>{o.estado ?? '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
