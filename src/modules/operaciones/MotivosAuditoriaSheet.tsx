import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Plus } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { ToggleChips } from '../../core/ui/Chips';
import { api } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

/** Catálogo de motivos de la auditoría (Observado). Los motivos nuevos que se escriben quedan en la lista. */
export function useMotivosAuditoria() {
  return useQuery({
    queryKey: ['operaciones', 'auditoria-motivos'],
    queryFn: () => api<{ motivos?: string[] }>('/combustible/auditoria-motivos').then(r => r.motivos ?? []),
    staleTime: 5 * 60_000,
  });
}

/** Un motivo corto y legible: «Robo de combustible» en vez de «ROBO DE COMBUSTIBLE» */
export const motivoCorto = (m: string) => m.charAt(0) + m.slice(1).toLowerCase();

/** Elige uno o varios motivos del viaje observado. Se guarda solo al pulsar Guardar. */
export function MotivosAuditoriaSheet({ abierto, viaje, inicial, onGuardar, onClose }: {
  abierto: boolean; viaje: string; inicial: string[]; onGuardar: (motivos: string[]) => Promise<unknown>; onClose: () => void;
}) {
  const catalogo = useMotivosAuditoria();
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [extras, setExtras] = useState<string[]>([]);
  const [nuevo, setNuevo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { if (abierto) { setElegidos(inicial); setExtras([]); setNuevo(''); setError(null); } }, [abierto, viaje]); // eslint-disable-line react-hooks/exhaustive-deps

  const opciones = useMemo(() => {
    const todos = [...(catalogo.data ?? []), ...inicial, ...extras];
    return [...new Set(todos)].map(m => ({ value: m, label: motivoCorto(m) }));
  }, [catalogo.data, inicial, extras]);

  function agregar() {
    const m = nuevo.trim().toUpperCase().slice(0, 80);
    if (!m) return;
    haptic('selection');
    setExtras(x => (x.includes(m) ? x : [...x, m]));
    setElegidos(x => (x.includes(m) ? x : [...x, m]));
    setNuevo('');
  }

  async function guardar() {
    if (!elegidos.length) { setError('Elige al menos un motivo.'); haptic('warning'); return; }
    setEnviando(true); setError(null);
    try { await onGuardar(elegidos); onClose(); }
    catch { /* el aviso lo da el guardado */ }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={abierto} onClose={() => !enviando && onClose()} title={`Motivo del viaje ${viaje}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar observación</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
        <p className="t-footnote c-secondary" style={{ margin: 0 }}>Marca uno o varios motivos por los que el viaje queda observado.</p>
        <ToggleChips label="Motivos" options={opciones} value={elegidos} onChange={setElegidos} />
        <form onSubmit={e => { e.preventDefault(); agregar(); }} style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
          <input value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder="¿Otro motivo? Escríbelo y pulsa Agregar" aria-label="Nuevo motivo" autoComplete="off" className="input" style={{ flex: 1, minWidth: 0 }} />
          <Button type="submit" variant="secondary" icon={<Plus size={16} />} disabled={!nuevo.trim()}>Agregar</Button>
        </form>
      </div>
    </Sheet>
  );
}
