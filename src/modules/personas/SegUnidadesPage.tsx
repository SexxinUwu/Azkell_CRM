import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, SearchX, Shield, Truck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';

interface UnidadGarita {
  id: string | number;
  placa?: string;
  placa_carreta?: string;
  conductor?: string;
  empresa?: string;
  estado?: string;
  salida_fecha?: string;
  salida_hora?: string;
  retorno_fecha?: string;
  retorno_hora?: string;
  km_salida?: number | null;
  km_retorno?: number | null;
  destino?: string;
  tipo_viaje?: string;
  observaciones?: string;
  [key: string]: unknown;
}

function estadoColor(estado: string): string {
  const s = (estado ?? '').toLowerCase();
  if (s === 'activo' || s.includes('en ruta') || s.includes('salida')) return 'amber';
  if (s === 'retornado' || s.includes('retorno') || s.includes('cerrado')) return 'green';
  if (s.includes('anulad')) return 'neutral';
  return 'blue';
}

function fmtKm(v: unknown): string {
  const n = Number(v);
  if (!v || isNaN(n) || n === 0) return '—';
  return `${n.toLocaleString('es-PE')} km`;
}

export function SegUnidadesPage() {
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  const { data, isLoading, isError, error } = useQuery<UnidadGarita[]>({
    queryKey: ['personas', 'seg-unidades'],
    queryFn: () =>
      api('/seguridad/unidades').then((r: unknown) => {
        if (Array.isArray(r)) return r as UnidadGarita[];
        return (r as { data?: UnidadGarita[] }).data ?? [];
      }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const lista = data ?? [];
  const activos = lista.filter(u => {
    const s = (u.estado ?? '').toLowerCase();
    return s === 'activo' || s.includes('en ruta') || s.includes('salida');
  });

  const visibles = useMemo(() => {
    let fuente = lista;
    if (filtroEstado) {
      fuente = lista.filter(u => (u.estado ?? '').toUpperCase() === filtroEstado.toUpperCase());
    }
    if (!busqueda) return fuente;
    const q = busqueda.toUpperCase();
    return fuente.filter(u =>
      String(u.placa ?? '').toUpperCase().includes(q) ||
      String(u.conductor ?? '').toUpperCase().includes(q) ||
      String(u.empresa ?? '').toUpperCase().includes(q) ||
      String(u.destino ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda, filtroEstado]);

  const estados = [...new Set(lista.map(u => (u.estado ?? '').toUpperCase()).filter(Boolean))];

  return (
    <Page>
      <PageHeader
        eyebrow="Personas y seguridad"
        title="Garita: unidades"
        subtitle={activos.length > 0 ? `${activos.length} en ruta · ${lista.length} registros` : `${lista.length} registros`}
        actions={
          <MenuOtros opciones={[
            { label: 'Registrar en la versión actual', icon: <Shield size={17} />, onSelect: () => abrirClasico('seguridad/unidades') },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('seguridad/unidades') },
          ]} />
        }
      />

      {isError && <Notice tone="error">{errorMessage(error)}</Notice>}

      {isLoading ? <PageLoader /> : lista.length === 0 ? (
        <EmptyState icon={<Shield size={28} />} title="Sin registros de garita">
          No hay registros de entrada/salida de unidades.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            {[
              { label: 'En ruta', valor: activos.length, color: activos.length > 0 ? 'var(--amber-ink)' : 'var(--label-2)' },
              { label: 'Retornadas', valor: lista.filter(u => (u.estado ?? '').toLowerCase().includes('retorn') || (u.estado ?? '').toLowerCase().includes('cerrad')).length, color: 'var(--green-ink)' },
              { label: 'Total hoy', valor: lista.length, color: 'var(--label-1)' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--fill-1)', borderRadius: 8, padding: '10px 14px', flex: 1, minWidth: '5rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.25rem', color: k.color }}>{k.valor}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--label-2)', fontWeight: 600 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '12rem' }}>
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar placa, conductor o empresa…" />
            </div>
            {estados.length > 1 && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button"
                  onClick={() => setFiltroEstado('')}
                  style={{ padding: '5px 12px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', background: !filtroEstado ? 'var(--accent)' : 'var(--fill-2)', color: !filtroEstado ? '#fff' : 'var(--label-2)', border: '1px solid var(--separator)' }}>
                  Todos
                </button>
                {estados.map(e => (
                  <button key={e} type="button"
                    onClick={() => setFiltroEstado(filtroEstado === e ? '' : e)}
                    style={{ padding: '5px 12px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', background: filtroEstado === e ? 'var(--amber-tint)' : 'var(--fill-2)', color: filtroEstado === e ? 'var(--amber-ink)' : 'var(--label-2)', border: `1px solid ${filtroEstado === e ? 'var(--amber-ink)' : 'var(--separator)'}` }}>
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
              <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setFiltroEstado(''); }}>Limpiar filtros</button>
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '36rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--separator)' }}>
                    {['Placa', 'Conductor', 'Empresa', 'Salida', 'Retorno', 'KM', 'Estado'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((u, i) => {
                    const color = estadoColor(String(u.estado ?? ''));
                    return (
                      <tr key={String(u.id || i)} style={{ borderBottom: '1px solid var(--separator)' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Truck size={13} />
                            {u.placa ?? '—'}
                          </div>
                          {u.placa_carreta && <div style={{ fontSize: '0.72rem', color: 'var(--label-2)' }}>{u.placa_carreta}</div>}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '0.85rem' }}>{u.conductor ?? '—'}</td>
                        <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--label-2)' }}>{u.empresa ?? '—'}</td>
                        <td style={{ padding: '8px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          <div>{String(u.salida_fecha ?? '').split('T')[0] || '—'}</div>
                          {u.salida_hora && <div style={{ fontSize: '0.72rem', color: 'var(--label-2)' }}>{String(u.salida_hora).slice(0, 5)}</div>}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--label-2)', whiteSpace: 'nowrap' }}>
                          <div>{String(u.retorno_fecha ?? '').split('T')[0] || '—'}</div>
                          {u.retorno_hora && <div style={{ fontSize: '0.72rem' }}>{String(u.retorno_hora).slice(0, 5)}</div>}
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--label-2)' }}>
                          {u.km_retorno && u.km_salida
                            ? fmtKm(Number(u.km_retorno) - Number(u.km_salida))
                            : fmtKm(u.km_salida)}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span className={`ot-estado ot-estado--${color}`}>{u.estado ?? '—'}</span>
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
