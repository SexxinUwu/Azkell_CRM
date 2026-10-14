import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Shield, ShieldAlert, Truck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';

interface UnidadBase {
  placa?: string;
  conductor?: string;
  empresa?: string;
  estado?: string;
  fecha?: string;
  hora?: string;
  km_inicio?: number | null;
  km_fin?: number | null;
  ruta?: string;
  destino?: string;
  tipo?: string;
  [key: string]: unknown;
}

interface EmpresaStat {
  empresa?: string;
  total?: number;
  activos?: number;
  [key: string]: unknown;
}

function estadoColor(estado: string): string {
  const s = (estado ?? '').toLowerCase();
  if (s.includes('activ') || s.includes('ruta') || s === 'salida') return 'amber';
  if (s.includes('base') || s.includes('retorn') || s.includes('llegada')) return 'green';
  if (s.includes('incid') || s.includes('alert')) return 'accent';
  return 'neutral';
}

// Donut SVG inline
function MiniDonut({ pct, color }: { pct: number; color: string }) {
  const r = 15.9155;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <svg width={48} height={48} viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--fill-3)" strokeWidth="4" />
      <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
    </svg>
  );
}

export function SegPatrimonialPage() {
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<'panorama' | 'empresas'>('panorama');

  const panorama = useQuery<UnidadBase[]>({
    queryKey: ['seg-patrimonial', 'panorama'],
    queryFn: () => api('/seguridad/unidades-base/panorama-en-vivo').then((r: unknown) => {
      if (Array.isArray(r)) return r as UnidadBase[];
      return (r as { data?: UnidadBase[] }).data ?? [];
    }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const empresas = useQuery<EmpresaStat[]>({
    queryKey: ['seg-patrimonial', 'empresas'],
    queryFn: () => api('/seguridad/empresas-stats').then((r: unknown) => {
      if (Array.isArray(r)) return r as EmpresaStat[];
      return (r as { data?: EmpresaStat[] }).data ?? [];
    }),
    staleTime: 60_000,
    enabled: vista === 'empresas',
  });

  const lista = panorama.data ?? [];
  const enRuta = lista.filter(u => {
    const s = (u.estado ?? '').toLowerCase();
    return s.includes('activ') || s.includes('ruta') || s === 'salida';
  });
  const enBase = lista.filter(u => {
    const s = (u.estado ?? '').toLowerCase();
    return s.includes('base') || s.includes('retorn') || s.includes('llegada');
  });

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(u =>
      String(u.placa ?? '').toUpperCase().includes(q) ||
      String(u.conductor ?? '').toUpperCase().includes(q) ||
      String(u.empresa ?? '').toUpperCase().includes(q) ||
      String(u.destino ?? u.ruta ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  const pctRuta = lista.length > 0 ? Math.round((enRuta.length / lista.length) * 100) : 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Personas y seguridad"
        title="Panel patrimonial"
        subtitle={lista.length > 0 ? `${enRuta.length} en ruta · ${enBase.length} en base · ${lista.length} total` : 'Cargando unidades…'}
        actions={
          <MenuOtros opciones={[
            { label: 'Ver garita', icon: <Shield size={17} />, onSelect: () => abrirClasico('seguridad/unidades') },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('seguridad/patrimonial') },
          ]} />
        }
      />

      {panorama.isError && <Notice tone="error">{errorMessage(panorama.error)}</Notice>}

      {panorama.isLoading ? <PageLoader /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {/* Resumen visual */}
          <div style={{ background: 'var(--fill-1)', borderRadius: 'var(--radius-2)', padding: 'var(--s-3)', display: 'flex', gap: 'var(--s-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MiniDonut pct={pctRuta} color="var(--amber-ink)" />
              <span style={{ position: 'absolute', fontSize: '0.75rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--amber-ink)' }}>{pctRuta}%</span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap', flex: 1 }}>
              {[
                { label: 'En ruta', valor: enRuta.length, color: 'var(--amber-ink)' },
                { label: 'En base', valor: enBase.length, color: 'var(--green-ink)' },
                { label: 'Total unidades', valor: lista.length, color: 'var(--label-1)' },
              ].map(k => (
                <div key={k.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.35rem', color: k.color }}>{k.valor}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--label-2)', fontWeight: 600 }}>{k.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Vista tabs */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { key: 'panorama', label: 'Panorama en vivo' },
              { key: 'empresas', label: 'Por empresa' },
            ].map(t => (
              <button key={t.key} type="button"
                onClick={() => setVista(t.key as 'panorama' | 'empresas')}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', background: vista === t.key ? 'var(--accent)' : 'var(--fill-2)', color: vista === t.key ? '#fff' : 'var(--label-2)', border: `1px solid ${vista === t.key ? 'var(--accent)' : 'var(--separator)'}` }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Vista: panorama en vivo */}
          {vista === 'panorama' && (
            lista.length === 0 ? (
              <EmptyState icon={<ShieldAlert size={28} />} title="Sin datos de panorama">
                Usa la versión actual para ingresar unidades al sistema de control patrimonial.
              </EmptyState>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
                <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar placa, conductor, empresa o destino…" />
                <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '30rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--separator)' }}>
                        {['Placa', 'Conductor', 'Empresa', 'Destino / Ruta', 'Estado'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((u, i) => {
                        const color = estadoColor(String(u.estado ?? ''));
                        return (
                          <tr key={String(u.placa ?? i)} style={{ borderBottom: '1px solid var(--separator)' }}>
                            <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <Truck size={13} />{u.placa ?? '—'}
                              </div>
                            </td>
                            <td style={{ padding: '7px 12px', fontSize: '0.85rem' }}>{u.conductor ?? '—'}</td>
                            <td style={{ padding: '7px 12px', fontSize: '0.78rem', color: 'var(--label-2)' }}>{u.empresa ?? '—'}</td>
                            <td style={{ padding: '7px 12px', fontSize: '0.78rem', color: 'var(--label-2)', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {u.destino ?? u.ruta ?? '—'}
                            </td>
                            <td style={{ padding: '7px 12px' }}>
                              <span className={`ot-estado ot-estado--${color}`}>{u.estado ?? '—'}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

          {/* Vista: por empresa */}
          {vista === 'empresas' && (
            empresas.isLoading ? <PageLoader /> :
            !empresas.data?.length ? (
              <EmptyState icon={<Shield size={22} />} title="Sin datos por empresa" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(11rem, 1fr))', gap: 'var(--s-2)' }}>
                {(empresas.data ?? []).map((e, i) => (
                  <div key={String(e.empresa ?? i)} style={{ background: 'var(--fill-1)', borderRadius: 10, padding: 'var(--s-3)', border: '1px solid var(--separator)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.empresa ?? 'Sin empresa'}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--accent)' }}>{e.total ?? 0}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--label-2)' }}>unidades</div>
                    {e.activos != null && (
                      <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--amber-ink)', fontWeight: 600 }}>
                        {e.activos} activas
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </Page>
  );
}
