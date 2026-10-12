// Estado de conexión para el aviso flotante (ConnectionBanner).
// Por ahora solo usa la red del dispositivo. Los cambios en vivo entre dispositivos (SSE) se
// conectan al migrar el primer módulo: el servidor actual emite en /api/eventos con otro formato.
import { useEffect, useState } from 'react';

export type LiveState = 'connecting' | 'live' | 'offline';

export function useLiveUpdates(): LiveState {
  const [state, setState] = useState<LiveState>(() => (navigator.onLine ? 'live' : 'offline'));
  useEffect(() => {
    const on = () => setState('live');
    const off = () => setState('offline');
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return state;
}
