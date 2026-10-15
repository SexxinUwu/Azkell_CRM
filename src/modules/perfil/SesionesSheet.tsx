import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Monitor } from 'lucide-react';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

interface Sesion {
  id: number;
  ip: string | null;
  dispositivo: string | null;
  fecha_login: string;
  ultima_actividad: string;
  actual: number | boolean;
}

const fecha = (iso: string) => new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });

// Sesiones activas de la cuenta (las mismas que en Perfil de la versión actual).
// La sesión en uso no se puede cerrar desde aquí: para salir está "Cerrar sesión".
export function SesionesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [aRevocar, setARevocar] = useState<Sesion | null>(null);
  const [cerrandoOtras, setCerrandoOtras] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['perfil', 'sesiones'],
    queryFn: () => api<Sesion[]>('/perfil/sesiones'),
    enabled: open,
    staleTime: 0,
  });
  const lista = Array.isArray(q.data) ? q.data : [];
  const otras = lista.filter(s => !s.actual).length;
  const refrescar = () => qc.invalidateQueries({ queryKey: ['perfil', 'sesiones'] });

  async function revocar() {
    if (!aRevocar) return;
    setOcupado(true); setError(null);
    try {
      await api(`/perfil/sesiones/${aRevocar.id}`, { method: 'DELETE' });
      haptic('success');
      toast('Sesión cerrada.');
      setARevocar(null);
      await refrescar();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); setARevocar(null); }
    finally { setOcupado(false); }
  }

  async function revocarOtras() {
    setOcupado(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; eliminadas?: number }>('/perfil/sesiones-otras', { method: 'DELETE' });
      haptic('success');
      toast(`Se cerraron ${r.eliminadas ?? 0} sesiones.`);
      setCerrandoOtras(false);
      await refrescar();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); setCerrandoOtras(false); }
    finally { setOcupado(false); }
  }

  return (
    <>
      <Sheet open={open} onClose={() => !ocupado && onClose()} title="Sesiones activas"
        footer={otras > 0 ? <Button variant="destructive" onClick={() => setCerrandoOtras(true)} disabled={ocupado}>Cerrar las otras {otras}</Button> : undefined}>
        {error && <div style={{ marginBottom: 'var(--s-4)' }}><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        {q.isError && <Notice tone="error" icon={<CircleAlert size={16} />}>{errorMessage(q.error)}</Notice>}
        {q.isLoading && <p className="c-secondary">Cargando…</p>}
        {!q.isLoading && !q.isError && (
          <div className="list">
            {lista.map(s => (
              <div className="row" key={s.id}>
                <Monitor size={20} strokeWidth={1.8} />
                <div className="row__main">
                  <div className="row__title">
                    {s.dispositivo || 'Dispositivo desconocido'}{!!s.actual && <span className="c-secondary"> · esta sesión</span>}
                  </div>
                  <div className="row__subtitle">IP {s.ip || '—'} · última actividad {fecha(s.ultima_actividad)}</div>
                </div>
                {!s.actual && <Button variant="secondary" onClick={() => setARevocar(s)} disabled={ocupado}>Cerrar</Button>}
              </div>
            ))}
            {!lista.length && <div className="row"><span className="row__main c-secondary">No hay sesiones activas.</span></div>}
          </div>
        )}
      </Sheet>

      <ConfirmSheet open={!!aRevocar} onClose={() => setARevocar(null)} onConfirm={revocar} loading={ocupado}
        title="Cerrar esta sesión" confirmLabel="Cerrar sesión"
        message={`${aRevocar?.dispositivo || 'Ese dispositivo'} saldrá de tu cuenta.`} />
      <ConfirmSheet open={cerrandoOtras} onClose={() => setCerrandoOtras(false)} onConfirm={revocarOtras} loading={ocupado}
        title="Cerrar las demás sesiones" confirmLabel="Cerrar las demás"
        message="Todos los demás dispositivos saldrán de tu cuenta. La sesión de este equipo se mantiene." />
    </>
  );
}
