import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
// Estilos base primero: los CSS de cada módulo (importados por App) deben poder sobrescribirlos.
import './core/styles/tokens.css';
import './core/styles/base.css';
import './core/ui/ui.css';
import { AuthProvider } from './core/auth/AuthProvider';
import { ToastProvider } from './core/ui/Toast';
import { ApiError } from './core/api/client';
import App from './App';

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
