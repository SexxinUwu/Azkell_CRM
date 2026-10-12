// Estado de la transición de bienvenida (después de iniciar sesión).
// La inicia LoginPage y la dibuja <WelcomeTransition/> por encima de todo, de modo que la
// pantalla principal ya se monta por debajo mientras se anima (y sus datos ya van cargando).
import { useSyncExternalStore } from 'react';

export interface WelcomeState {
  id: number;
  /** Dónde estaba la tarjeta del login: desde ahí se transforma en el ícono */
  from: { x: number; y: number; width: number; height: number };
  name: string;
}

let current: WelcomeState | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function startWelcome(from: WelcomeState['from'], name: string) {
  current = { id: ++seq, from, name };
  emit();
}

export function endWelcome() {
  current = null;
  emit();
}

export function useWelcome() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
    () => null,
  );
}
