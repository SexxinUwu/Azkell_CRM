import './flota.css';
import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle, ClipboardList, SearchX, XCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';

interface TemplateItem {
  id?: string | number;
  nombre?: string;
  categoria?: string;
  orden?: number;
  requerido?: boolean | number;
  tipo?: string;
}

interface EntregaChecklist {
  id: string | number;
  folio?: string;
  placa?: string;
  conductor?: string;
  empresa?: string;
  estado?: string;
  fecha_entrega?: string;
  fecha_retorno?: string;
  salida_checklist_json?: Record<string, unknown>[] | null;
  retorno_checklist_json?: Record<string, unknown>[] | null;
  salida_has_alert?: boolean | number;
  retorno_has_alert?: boolean | number;
  [key: string]: unknown;
}

function calcPct(items: Record<string, unknown>[] | null | undefined): number {
  if (!items || !items.length) return 0;
  const ok = items.filter(i => i.valor === true || i.valor === 'ok' || i.valor === 'bueno' || i.ok === true).length;
  return Math.round((ok / items.length) * 100);
}

function MiniCheckBarra({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: '6rem' }}>
      <div style={{ flex: 1, height: 5, borderRadius: 99, background: 'var(--fill-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 400ms ease' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color, minWidth: '2.5rem' }}>{pct}%</span>
    </div>
  );
}

export function ChecklistEntregaPage() {
  const [busqueda, setBusqueda] = useState('');
  const [detalleId, setDetalleId] = useState<string | number | null>(null);

  const entregas = useQuery<EntregaChecklist[]>({
    queryKey: ['flota', 'checklist-entregas'],
    queryFn: () =>
      api('/seguridad/entrega-vehiculos').then((r: unknown) => {
        if (Array.isArray(r)) return r as EntregaChecklist[];
        return (r as { data?: EntregaChecklist[] }).data ?? [];
      }),
    staleTime: 30_000,
  });

  const template = useQuery<TemplateItem[]>({
    queryKey: ['flota', 'checklist-template'],
    queryFn: () =>
      api('/seguridad/template').then((r: unknown) => {
        if (Array.isArray(r)) return r as TemplateItem[];
        return (r as { data?: TemplateItem[] }).data ?? [];
      }),
    staleTime: 300_000,
  });

  const lista = entregas.data ?? [];
  const conChecklist = lista.filter(e => e.salida_checklist_json || e.retorno_checklist_json);
  const conAlerta    = lista.filter(e => e.salida_has_alert || e.retorno_has_alert);

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(e =>
      String(e.placa ?? '').toUpperCase().includes(q) ||
      String(e.conductor ?? '').toUpperCase().includes(q) ||
      String(e.folio ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  const detalle = detalleId != null ? lista.find(e => e.id === detalleId) : null;

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Checklist de entrega"
        subtitle={lista.length > 0 ? `${conChecklist.length} con checklist · ${conAlerta.length > 0 ? `${conAlerta.length} con alertas` : 'sin alertas'}` : undefined}
        actions={
          <MenuOtros opciones={[
            { label: 'Nueva entrega con checklist', icon: <ClipboardList size={17} />, onSelect: () => abrirClasico('seguridad/entrega-vehiculos') },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('seguridad/entrega-vehiculos') },
          ]} />
        }
      />

      {entregas.isError && <Notice tone="error">{errorMessage(entregas.error)}</Notice>}

      {/* Plantilla del checklist */}
      {template.data && template.data.length > 0 && (
        <div style={{ background: 'var(--fill-1)', borderRadius: 10, padding: 'var(--s-3)', marginBottom: 'var(--s-3)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Plantilla activa — {template.data.length} ítems
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {template.data.slice(0, 20).map((t, i) => (
              <span key={String(t.id ?? i)} style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'var(--fill-3)', color: 'var(--label-2)', border: '1px solid var(--separator)' }}>
                {t.nombre ?? `Ítem ${i + 1}`}
              </span>
            ))}
            {template.data.length > 20 && (
              <span style={{ fontSize: '0.72rem', color: 'var(--label-2)', alignSelf: 'center' }}>+{template.data.length - 20} más</span>
            )}
          </div>
        </div>
      )}

      {entregas.isLoading ? <PageLoader /> : lista.length === 0 ? (
        <EmptyState icon={<ClipboardList size={28} />} title="Sin actas de entrega">
          Registra la primera entrega con checklist desde la versión actual.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar por placa, conductor o folio…" />

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
              <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Limpiar</button>
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '36rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--separator)' }}>
                    {['Folio', 'Placa', 'Conductor', 'Fecha entrega', 'Checklist salida', 'Checklist retorno', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((e, i) => {
                    const pctSal = calcPct(e.salida_checklist_json as Record<string, unknown>[] | null);
                    const pctRet = calcPct(e.retorno_checklist_json as Record<string, unknown>[] | null);
                    const hasAlert = e.salida_has_alert || e.retorno_has_alert;
                    return (
                      <tr key={String(e.id || i)} style={{ borderBottom: '1px solid var(--separator)', background: hasAlert ? 'var(--accent-tint)' : undefined }}>
                        <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--label-2)' }}>
                          {e.folio ?? String(e.id)}
                        </td>
                        <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: '0.85rem' }}>
                          {e.placa ?? '—'}
                        </td>
                        <td style={{ padding: '7px 12px', fontSize: '0.85rem' }}>{e.conductor ?? '—'}</td>
                        <td style={{ padding: '7px 12px', fontSize: '0.78rem', color: 'var(--label-2)', whiteSpace: 'nowrap' }}>
                          {String(e.fecha_entrega ?? '').split('T')[0] || '—'}
                        </td>
                        <td style={{ padding: '7px 12px' }}>
                          {e.salida_checklist_json
                            ? <MiniCheckBarra pct={pctSal} color={pctSal >= 80 ? 'var(--green-ink)' : pctSal >= 50 ? 'var(--amber-ink)' : 'var(--red-ink)'} />
                            : <span style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>Sin checklist</span>
                          }
                        </td>
                        <td style={{ padding: '7px 12px' }}>
                          {e.retorno_checklist_json
                            ? <MiniCheckBarra pct={pctRet} color={pctRet >= 80 ? 'var(--green-ink)' : pctRet >= 50 ? 'var(--amber-ink)' : 'var(--red-ink)'} />
                            : <span style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{e.fecha_retorno ? 'Sin checklist' : 'Pendiente'}</span>
                          }
                        </td>
                        <td style={{ padding: '7px 12px' }}>
                          {(e.salida_checklist_json || e.retorno_checklist_json) && (
                            <button type="button"
                              onClick={() => setDetalleId(detalleId === e.id ? null : e.id)}
                              style={{ padding: '3px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: detalleId === e.id ? 'var(--accent)' : 'var(--fill-2)', color: detalleId === e.id ? '#fff' : 'var(--label-2)', border: '1px solid var(--separator)', cursor: 'pointer' }}>
                              {detalleId === e.id ? 'Cerrar' : 'Ver'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Panel de detalle inline */}
          {detalle && (
            <div style={{ background: 'var(--fill-1)', borderRadius: 12, padding: 'var(--s-3)', border: '1px solid var(--separator)' }}>
              <div style={{ fontWeight: 700, marginBottom: 'var(--s-2)' }}>Checklist — {detalle.placa} ({detalle.folio})</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
                {[
                  { label: 'Salida', items: detalle.salida_checklist_json as Record<string, unknown>[] | null },
                  { label: 'Retorno', items: detalle.retorno_checklist_json as Record<string, unknown>[] | null },
                ].map(({ label, items }) => (
                  <div key={label}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
                    {!items || !items.length ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--label-2)' }}>Sin datos de {label.toLowerCase()}</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {(items as Record<string, unknown>[]).map((it, k) => {
                          const ok = it.valor === true || it.valor === 'ok' || it.valor === 'bueno' || it.ok === true;
                          return (
                            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                              {ok ? <CheckCircle size={13} style={{ color: 'var(--green-ink)', flexShrink: 0 }} /> : <XCircle size={13} style={{ color: 'var(--red-ink)', flexShrink: 0 }} />}
                              <span style={{ color: ok ? 'var(--label-1)' : 'var(--accent)' }}>{String(it.nombre ?? it.item ?? `Ítem ${k+1}`)}</span>
                              {it.observacion != null && <span style={{ fontSize: '0.72rem', color: 'var(--label-2)', marginLeft: 'auto' }}>— {String(it.observacion)}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
