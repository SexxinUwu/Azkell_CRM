import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
// Estilos base primero: los CSS de cada módulo (importados por App) deben poder sobrescribirlos.
import './core/styles/tokens.css';
import './core/styles/base.css';
import './core/ui/ui.css';
import './core/ui/listado.css';
import { AuthProvider } from './core/auth/AuthProvider';
import { ToastProvider } from './core/ui/Toast';
import { ApiError } from './core/api/client';
import App from './App';
import { iniciarAcento } from './core/lib/accent';
import { iniciarTema } from './core/lib/theme';

iniciarTema(); // claro / oscuro / automático, antes de pintar
iniciarAcento(); // color elegido, antes de pintar

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // No reintentar errores de permisos o de datos; sí los de red.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

// Sin service worker propio por ahora: el de la versión actual (/sw.js) controla todo el dominio.

// Si se publicó una versión nueva mientras la pestaña estaba abierta, el archivo de un módulo ya no existe.
// Se recarga la página una vez (sin bucles) en vez de mostrar el error de carga.
window.addEventListener('vite:preloadError', (e) => {
  const ultima = Number(sessionStorage.getItem('fleet_recarga_modulo') || 0);
  if (Date.now() - ultima < 30_000) return;
  sessionStorage.setItem('fleet_recarga_modulo', String(Date.now()));
  e.preventDefault();
  window.location.reload();
});
// Algunos navegadores no emiten vite:preloadError: el import dinámico falla con su propio mensaje. Mismo criterio de una recarga.
window.addEventListener('unhandledrejection', (e) => {
  const msg = String((e.reason && (e.reason.message || e.reason)) || '');
  if (!/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg)) return;
  const ultima = Number(sessionStorage.getItem('fleet_recarga_modulo') || 0);
  if (Date.now() - ultima < 30_000) return;
  sessionStorage.setItem('fleet_recarga_modulo', String(Date.now()));
  window.location.reload();
});

// Los imports diferidos (lazy) de cada pantalla no siempre pasan por vite:preloadError: si la pestaña
// tiene una versión anterior, el error llega como "Failed to fetch dynamically imported module". Mismo criterio: recargar una vez.
const FALLO_DE_MODULO = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
function recargarSiFalloDeModulo(mensaje: string) {
  if (!FALLO_DE_MODULO.test(mensaje)) return;
  const ultima = Number(sessionStorage.getItem('fleet_recarga_modulo') || 0);
  if (Date.now() - ultima < 30_000) return;
  sessionStorage.setItem('fleet_recarga_modulo', String(Date.now()));
  window.location.reload();
}
window.addEventListener('error', (e) => recargarSiFalloDeModulo(String(e.message || e.error?.message || '')));
window.addEventListener('unhandledrejection', (e) => recargarSiFalloDeModulo(String((e.reason as Error | undefined)?.message ?? e.reason ?? '')));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user": respeta "Reducir movimiento" del sistema (sin desplazamientos ni escalas) */}
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
);
