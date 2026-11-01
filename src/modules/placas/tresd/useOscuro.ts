import { useCallback, useSyncExternalStore } from 'react';
import { esOscuro, guardarTema, suscribirTema } from '../../../core/lib/theme';

// Tema oscuro para la vista 3D. Usa el mismo tema de la app (core/lib/theme.ts), así que
// se sincroniza con Ajustes y con el botón de tema, sin guardar nada aparte.
export function useOscuro(): { oscuro: boolean; alternar(): void } {
  // Al cambiar el tema en cualquier parte de la app, esta vista se vuelve a pintar
  const oscuro = useSyncExternalStore(suscribirTema, () => esOscuro(), () => false);

  // Pasa de automático o claro a oscuro, y de oscuro a claro (fija la elección)
  const alternar = useCallback(() => {
    guardarTema(esOscuro() ? 'claro' : 'oscuro');
  }, []);

  return { oscuro, alternar };
}
