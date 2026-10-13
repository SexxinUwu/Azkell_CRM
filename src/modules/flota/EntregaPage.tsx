import './flota.css';
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

interface EntregaVehiculo {
  id: string | number;
  folio?: string;
  placa?: string;
  placa_carreta?: string;
  conductor?: string;
  empresa?: string;
  tipo?: string;
  estado?: string;
  fecha_entrega?: string;
  fecha_retorno?: string;
  km_salida?: number | null;
  km_retorno?: number | null;
  observaciones?: string | null;
  [key: string]: unknown;
}

function estadoColor(estado: string): string {
  const s = (estado ?? '').toLowerCase();
  if (s.includes('activ') || s.includes('entregad')) return 'amber';
  if (s.includes('devuelt') || s.includes('retorn') || s.includes('cerrad')) return 'green';
  if (s.includes('anulad')) return 'neutral';
  return 'blue';
}

function fmtFecha(f: string | null | undefined): string {
  if (!f) return '—';
  return String(f).split('T')[0];
}

function useEntregas() {
  return useQuery<EntregaVehiculo[]>({
    queryKey: ['flota', 'entrega-vehiculos'],
    queryFn: () =>
      api('/seguridad/entrega-vehiculos').then((r: unknown) => {
        if (Array.isArray(r)) return r as EntregaVehiculo[];
        return (r as { data?: EntregaVehiculo[] }).data ?? [];
      }),
    staleTime: 30_000,
  });
}

export function EntregaPage() {
  const { data, isLoading, isError, error } = useEntregas();
  const [busqueda, setBusqueda] = useState('');

  const lista = data ?? [];

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(e =>
      String(e.placa ?? '').toUpperCase().includes(q) ||
      String(e.conductor ?? '').toUpperCase().includes(q) ||
      String(e.empresa ?? '').toUpperCase().includes(q) ||
      String(e.folio ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Entrega de vehículos"
        subtitle={lista.length > 0 ? `${lista.length} actas registradas` : undefined}
        actions={
          <MenuOtros opciones={[
            { label: 'Nueva entrega', icon: <ClipboardList size={17} />, onSelect: () => abrirClasico('flota/entrega-vehiculos') },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('flota/entrega-vehiculos') },
          ]} />
        }
      />

      {isError && <Notice tone="error">{errorMessage(error)}</Notice>}

      {isLoading ? <PageLoader /> : lista.length === 0 ? (
        <EmptyState icon={<ClipboardList size={22} />} title="Sin actas registradas">
          Usa la versión actual para registrar la primera entrega.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar por placa, conductor, empresa o folio…" />

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin resultados">
              <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Limpiar búsqueda</button>
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '36rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--separator)' }}>
                    {['Folio', 'Placa', 'Conductor', 'Empresa', 'Entrega', 'Retorno', 'Estado'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((e, i) => {
                    const color = estadoColor(String(e.estado ?? ''));
                    return (
                      <tr key={String(e.id || i)} style={{ borderBottom: '1px solid var(--separator)' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--label-2)' }}>
                          {e.folio ?? String(e.id)}
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: '0.85rem' }}>
                          {e.placa ?? '—'}{e.placa_carreta ? `/${e.placa_carreta}` : ''}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '0.85rem' }}>{e.conductor ?? '—'}</td>
                        <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--label-2)' }}>{e.empresa ?? '—'}</td>
                        <td style={{ padding: '8px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{fmtFecha(e.fecha_entrega)}</td>
                        <td style={{ padding: '8px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', color: 'var(--label-2)' }}>{fmtFecha(e.fecha_retorno)}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span className={`ot-estado ot-estado--${color}`}>
                            {e.estado ?? '—'}
                          </span>
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
