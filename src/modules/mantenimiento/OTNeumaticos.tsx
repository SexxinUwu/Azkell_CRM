import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Disc, Eye, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { InspeccionDetalleSheet } from './NeumaticosDetalleSheet';

// Inspecciones de neumáticos de la OT (rotRenderSecNeumaticos / rotEliminarInspeccionNeumatico del clásico):
// lista con llantas críticas, "Ver" el resumen y "Eliminar" con confirmación.

interface InspeccionNeumaticoOT {
  id_inspeccion: string;
  fecha_inspeccion: string | null;
  km_vehiculo: number | string | null;
  llantas_criticas: number | null;
  total_llantas: number | null;
}

export function OTNeumaticos({ idOt, puedeEditar }: { idOt: string; puedeEditar: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [ver, setVer] = useState<string | null>(null);
  const [quitar, setQuitar] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const lista = useQuery<InspeccionNeumaticoOT[]>({
    queryKey: ['mant', 'neumaticos-ot', idOt],
    enabled: !!idOt,
    queryFn: () => api<{ ok?: boolean; data?: InspeccionNeumaticoOT[] } | InspeccionNeumaticoOT[]>(`/neumaticos/inspecciones?id_ot=${encodeURIComponent(idOt)}`)
      .then(r => (Array.isArray(r) ? r : (r.data ?? []))),
    staleTime: 30_000,
  });

  async function eliminar() {
    if (!quitar) return;
    setOcupado(true);
    try {
      await api(`/neumaticos/inspecciones/${encodeURIComponent(quitar)}`, { method: 'DELETE' });
      toast(`Inspección ${quitar} eliminada correctamente`);
      setQuitar(null);
      await qc.invalidateQueries({ queryKey: ['mant', 'neumaticos-ot', idOt] });
      await qc.invalidateQueries({ queryKey: ['inspecciones'] });
    } catch (e) {
      toast(`Error al eliminar: ${errorMessage(e)}`, 'error');
    } finally {
      setOcupado(false);
    }
  }

  if (lista.isLoading) return <PageLoader />;
  if (lista.isError) return <Notice tone="error">{errorMessage(lista.error)}</Notice>;
  const filas = lista.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <p className="tarjeta__grupo-titulo" style={{ margin: 0 }}>Inspecciones de neumáticos ({filas.length})</p>
      {filas.length === 0 ? (
        <EmptyState icon={<Disc size={22} />} title="Sin inspecciones de neumáticos">No hay inspecciones de neumáticos registradas para esta OT.</EmptyState>
      ) : (
        <div className="tarjeta__lista">
          {filas.map(n => {
            const criticas = Number(n.llantas_criticas ?? 0);
            const fecha = String(n.fecha_inspeccion ?? '').split('T')[0];
            return (
              <div key={n.id_inspeccion} className="dato" style={{ alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--accent)' }}>{n.id_inspeccion}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                      background: criticas > 0 ? 'var(--red-tint, #fee2e2)' : 'var(--green-tint, #dcfce7)',
                      color: criticas > 0 ? 'var(--red-ink)' : 'var(--green-ink, #15803d)' }}>
                      {criticas > 0 ? `${criticas} críticas` : 'Óptimas'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>
                    {fecha || '—'} · {Number(n.km_vehiculo ?? 0).toLocaleString('es-PE')} km · {n.total_llantas ?? 0} llantas evaluadas
                  </div>
                </div>
                <Button size="sm" variant="secondary" icon={<Eye size={14} />} onClick={() => setVer(n.id_inspeccion)}>Ver</Button>
                {puedeEditar && (
                  <Button size="sm" variant="plain" iconOnly icon={<Trash2 size={15} />} aria-label={`Eliminar inspección ${n.id_inspeccion}`}
                    title="Eliminar inspección" onClick={() => setQuitar(n.id_inspeccion)} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <InspeccionDetalleSheet id={ver} onClose={() => setVer(null)} />
      <ConfirmSheet open={!!quitar} onClose={() => !ocupado && setQuitar(null)} onConfirm={eliminar} loading={ocupado}
        title="¿Eliminar inspección de neumáticos?"
        message={`¿Estás seguro de eliminar esta inspección de neumáticos (${quitar ?? ''})? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar" />
    </div>
  );
}
