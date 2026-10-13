import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Fuel, SearchX } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';

interface Vale {
  id?: number | string;
  correlativo?: string | null;
  fecha?: string | null;
  vehiculo?: string | null;
  conductor?: string | null;
  tipo_combustible?: string | null;
  galones?: number | string | null;
  importe?: number | string | null;
  estado?: string | null;
  [key: string]: unknown;
}

function arr<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { data?: T[] })?.data) ?? [];
}

function estadoColor(e: string | null | undefined): string {
  const s = String(e ?? '').toLowerCase();
  if (s.includes('aprobado') || s.includes('pagado')) return 'green';
  if (s.includes('anulado') || s.includes('rechazado')) return 'red';
  if (s.includes('pendiente') || s.includes('borrador')) return 'amber';
  return 'neutral';
}

function fmtMonto(v: number | string | null | undefined): string {
  const n = Number(v);
  if (isNaN(n) || v === null || v === undefined || v === '') return '—';
  return 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCantidad(v: number | string | null | undefined): string {
  const n = Number(v);
  if (isNaN(n) || v === null || v === undefined || v === '') return '—';
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function useVales() {
  return useQuery<Vale[]>({
    queryKey: ['operaciones', 'vales'],
    queryFn: () => api('/combustible/vales?limit=500').then((r) => arr<Vale>(r)),
    staleTime: 60_000,
  });
}

export function ValesPage() {
  const { data, isLoading, isError, error } = useVales();
  const [busqueda, setBusqueda] = useState('');
  const lista: Vale[] = data ?? [];

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(v =>
      String(v.vehiculo ?? '').toUpperCase().includes(q) ||
      String(v.conductor ?? '').toUpperCase().includes(q) ||
      String(v.correlativo ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Vales de combustible"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} vales`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('operaciones/combustible-vales') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, conductor, correlativo…" />

          {visibles.length === 0 ? (
            <EmptyState
              icon={busqueda ? <SearchX size={22} /> : <Fuel size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin vales de combustible'}
            >
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Los vales de combustible aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '52rem' }}>
                <thead>
                  <tr>
                    <th>N° / Código</th>
                    <th>Fecha</th>
                    <th>Placa</th>
                    <th>Conductor</th>
                    <th>Tipo combustible</th>
                    <th style={{ textAlign: 'right' }}>Galones</th>
                    <th style={{ textAlign: 'right' }}>Importe</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((v, i) => (
                    <tr key={String(v.id ?? i)}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--accent)', fontWeight: 600 }}>
                        {v.correlativo ?? '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                        {v.fecha ? String(v.fecha).split('T')[0] : '—'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{v.vehiculo ?? '—'}</td>
                      <td style={{ fontSize: '0.875rem' }}>{v.conductor ?? '—'}</td>
                      <td style={{ fontSize: '0.875rem' }}>{v.tipo_combustible ?? '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtCantidad(v.galones)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtMonto(v.importe)}</td>
                      <td>
                        <span className={`ot-estado ot-estado--${estadoColor(v.estado)}`}>{v.estado ?? '—'}</span>
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
