import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
// Estilos base primero: los CSS de cada módulo (importados por App) deben poder sobrescribirlos.
import './core/styles/tokens.css';
import './core/styles/base.css';
import './core/ui/ui.css';
import './core/ui/listado.css';
import './modules/sistema/accesibilidad.css';
import { AuthProvider } from './core/auth/AuthProvider';
import { ToastProvider } from './core/ui/Toast';
import { ApiError } from './core/api/client';
import { LimiteDeError, esFalloDeModulo, reintentarVersionNueva } from './core/ui/LimiteDeError';
import App from './App';
import { iniciarAcento } from './core/lib/accent';
import { iniciarTema } from './core/lib/theme';
import { aplicarPreferencias } from './core/lib/preferencias';
import { iniciarColaGastos } from './modules/personas/portalConductorCola';

iniciarTema(); // claro / oscuro / automático, antes de pintar
iniciarAcento(); // color elegido, antes de pintar
aplicarPreferencias(); // tamaño de texto, contraste y movimiento, antes de pintar

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

// El service worker de la versión actual (/sw.js) controla todo el dominio. Se registra también desde /app
// (es la misma ruta: el navegador no duplica el registro) para que la pantalla nueva abra sin señal.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(err => console.error('Error en Service Worker', err));
}
// Gastos del portal del conductor guardados sin señal: se envían al volver la conexión.
iniciarColaGastos();

// Si se publicó una versión nueva mientras la pestaña estaba abierta, el archivo de un módulo ya no existe.
// Se reintenta con la versión nueva, con esperas crecientes (ver LimiteDeError), en vez de mostrar el error.
window.addEventListener('vite:preloadError', (e) => {
  if (!reintentarVersionNueva()) return; // se agotaron los reintentos: el límite de errores muestra el aviso
  e.preventDefault();
});
// Los imports diferidos (lazy) no siempre pasan por vite:preloadError: llegan como error de módulo. Mismo criterio.
window.addEventListener('error', (e) => { if (esFalloDeModulo(String(e.message || e.error?.message || ''))) reintentarVersionNueva(); });
window.addEventListener('unhandledrejection', (e) => {
  if (esFalloDeModulo(String((e.reason as Error | undefined)?.message ?? e.reason ?? ''))) reintentarVersionNueva();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Si algo falla al pintar, se muestra un aviso en vez de la pantalla en blanco */}
    <LimiteDeError>
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
    </LimiteDeError>
  </StrictMode>,
);
