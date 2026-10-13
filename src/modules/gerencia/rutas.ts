import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'gerencia/aprobaciones-oc/*',
    permisos: ['gerencia.ver'],
    Page: lazy(() => import('./AprobacionesOCPage').then(m => ({ default: m.AprobacionesOCPage }))),
    nav: { key: 'aprobaciones-oc', label: 'Aprobación de compras', to: '/gerencia/aprobaciones-oc', icon: 'ClipboardCheck', permisos: ['gerencia.ver'] },
  },
  {
    path: 'gerencia/aprobaciones-caja/*',
    permisos: ['gerencia.ver'],
    Page: lazy(() => import('./AprobacionesCajaPage').then(m => ({ default: m.AprobacionesCajaPage }))),
    nav: { key: 'aprobaciones-caja', label: 'Aprobación de caja', to: '/gerencia/aprobaciones-caja', icon: 'ClipboardCheck', permisos: ['gerencia.ver'] },
  },
];
