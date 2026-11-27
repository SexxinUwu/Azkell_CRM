// Estado de conexión para el aviso flotante (ConnectionBanner).
// Por ahora solo usa la red del dispositivo. Los cambios en vivo entre dispositivos (SSE) se
// conectan al migrar el primer módulo: el servidor actual emite en /api/eventos con otro formato.
import { useEffect, useState } from 'react';
import { EVENTO_CON_RED, EVENTO_SIN_RED } from './client';

export type LiveState = 'connecting' | 'live' | 'offline';

export function useLiveUpdates(): LiveState {
  const [state, setState] = useState<LiveState>(() => (navigator.onLine ? 'live' : 'offline'));
  useEffect(() => {
    const on = () => setState('live');
    const off = () => setState('offline');
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    // Las llamadas a la API también avisan: hay Wi-Fi pero no hay internet
    window.addEventListener(EVENTO_SIN_RED, off);
    window.addEventListener(EVENTO_CON_RED, on);
    return () => {
      window.removeEventListener('online', on); window.removeEventListener('offline', off);
      window.removeEventListener(EVENTO_SIN_RED, off); window.removeEventListener(EVENTO_CON_RED, on);
    };
  }, []);
  // Sin internet pero con el dispositivo conectado: cada 15 s se prueba si ya volvió (el service worker marca sus copias guardadas)
  useEffect(() => {
    if (state !== 'offline' || !navigator.onLine) return;
    const t = setInterval(() => {
      fetch('/api/configuracion', { cache: 'no-store', credentials: 'include' })
        .then(r => { if (r.ok && r.headers.get('x-azkell-offline') !== '1') window.dispatchEvent(new Event(EVENTO_CON_RED)); })
        .catch(() => { /* sigue sin internet */ });
    }, 15000);
    return () => clearInterval(t);
  }, [state]);
  return state;
}
