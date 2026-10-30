import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'seguridad/unidades-base/*',
    permisos: ['seguridad_unidades.ver', 'admin'],
    Page: lazy(() => import('./UnidadesBasePage').then(m => ({ default: m.UnidadesBasePage }))),
    nav: { key: 'seg-status', label: 'Status "Unidades en Base"', to: '/seguridad/unidades-base', icon: 'MapPin', permisos: ['seguridad_unidades.ver', 'seguridad_unidades.ver', 'admin'] },
  },
];
