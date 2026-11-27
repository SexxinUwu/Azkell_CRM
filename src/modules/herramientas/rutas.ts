import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    // Herramientas PDF: sin permiso especial, las usa cualquiera con sesión
    path: 'herramientas/:herramienta?',
    permisos: [],
    Page: lazy(() => import('./HerramientasPage').then(m => ({ default: m.HerramientasPage }))),
  },
];
