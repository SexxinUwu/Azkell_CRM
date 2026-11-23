import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, Tags, Trash2 } from 'lucide-react';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

interface Motivo { id: number; nombre: string; usos: number }

/** Configurar los motivos (tipos de incidencia) que se pueden elegir al registrar un siniestro: agregar y eliminar */
export function MotivosSiniestroSheet({ open, onClose, puedeAgregar, puedeEliminar }: { open: boolean; onClose: () => void; puedeAgregar: boolean; puedeEliminar: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery<Motivo[]>({
    queryKey: ['mant', 'siniestros', 'motivos'], enabled: open, staleTime: 0,
    queryFn: () => api<{ data?: Motivo[] }>('/mantenimiento/siniestros/motivos').then(r => r.data ?? []),
  });
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [porQuitar, setPorQuitar] = useState<Motivo | null>(null);

  const refrescar = () => Promise.all([q.refetch(), qc.invalidateQueries({ queryKey: ['mant', 'siniestros', 'catalogo'] })]);

  async function agregar() {
    const n = nombre.trim();
    if (!n) return;
    setOcupado(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string }>('/mantenimiento/siniestros/motivos', { method: 'POST', body: { nombre: n } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo agregar');
      haptic('success'); setNombre(''); await refrescar();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function quitar() {
    if (!porQuitar) return;
    setOcupado(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/mantenimiento/siniestros/motivos/${porQuitar.id}`, { method: 'DELETE' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo eliminar');
      haptic('success'); toast('Motivo eliminado'); setPorQuitar(null); await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  return (
    <>
      <Sheet open={open} onClose={() => !ocupado && onClose()} title="Motivos de siniestro" footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
        <div className="gr gr--compacto">
          <p className="os-nota">Son las opciones de «Tipo de incidencia» al registrar un siniestro. Si escribes uno nuevo al registrar, se agrega solo. Al eliminar uno, los siniestros que ya lo usan no cambian.</p>
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
          {puedeAgregar && (
            <div style={{ display: 'flex', gap: 8 }}>
              <TextInput aria-label="Nuevo motivo" value={nombre} placeholder="Nuevo motivo, por ejemplo «Falla eléctrica»" maxLength={120}
                onChange={e => setNombre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void agregar(); } }} />
              <Button variant="primary" icon={<Plus size={16} />} onClick={agregar} loading={ocupado} disabled={!nombre.trim()}>Agregar</Button>
            </div>
          )}
          {q.isLoading ? <PageLoader /> : (q.data ?? []).length === 0 ? (
            <EmptyState icon={<Tags size={22} />} title="Sin motivos">Agrega el primero arriba.</EmptyState>
          ) : (
            <ul className="sin-motivos">
              {(q.data ?? []).map(m => (
                <li key={m.id}>
                  <span className="sin-motivos__nombre">{m.nombre}</span>
                  <span className="t-footnote c-secondary">{m.usos === 0 ? 'Sin usar' : `${m.usos} ${m.usos === 1 ? 'siniestro' : 'siniestros'}`}</span>
                  {puedeEliminar && <Button variant="plain" size="sm" iconOnly icon={<Trash2 size={15} />} aria-label={`Eliminar ${m.nombre}`} onClick={() => setPorQuitar(m)} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
      <ConfirmSheet open={!!porQuitar} onClose={() => !ocupado && setPorQuitar(null)} onConfirm={quitar} loading={ocupado} confirmLabel="Eliminar"
        title="¿Eliminar este motivo?" message={porQuitar ? `«${porQuitar.nombre}» deja de ofrecerse al registrar. ${porQuitar.usos ? `Los ${porQuitar.usos} siniestros que lo usan lo conservan.` : ''}` : ''} />
    </>
  );
}
