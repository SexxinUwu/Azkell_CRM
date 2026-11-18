import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

// Novedades: la ven todas las personas (lo que se ha publicado, lo más nuevo arriba)
export const RUTAS: RutaModulo[] = [
  {
    path: 'novedades/*',
    permisos: [],
    Page: lazy(() => import('./NovedadesPage').then(m => ({ default: m.NovedadesPage }))),
    nav: { key: 'novedades', label: 'Novedades', to: '/novedades', icon: 'Sparkles', permisos: [] },
  },
];
