import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'dashboard/*',
    permisos: ['dashboard.ver', 'dashboard.ver', 'admin'],
    Page: lazy(() => import('./DashboardPage').then(m => ({ default: m.DashboardPage }))),
    nav: { key: 'dashboard', label: 'Centro de Comando', to: '/dashboard', icon: 'LayoutDashboard', permisos: ['dashboard.ver', 'dashboard.ver', 'admin'] },
  },
  {
    path: 'gerencia/aprobaciones-oc/*',
    permisos: ['gerencia_aprobaciones_oc.ver', 'admin'],
    Page: lazy(() => import('./AprobacionesOCPage').then(m => ({ default: m.AprobacionesOCPage }))),
    nav: { key: 'aprobaciones-oc', label: 'Aprobación de compras', to: '/gerencia/aprobaciones-oc', icon: 'ClipboardCheck', permisos: ['gerencia_aprobaciones_oc.ver'] },
  },
  {
    path: 'gerencia/aprobaciones-caja/*',
    permisos: ['gerencia_aprobaciones_caja.ver', 'admin'],
    Page: lazy(() => import('./AprobacionesCajaPage').then(m => ({ default: m.AprobacionesCajaPage }))),
    nav: { key: 'aprobaciones-caja', label: 'Aprobación de caja', to: '/gerencia/aprobaciones-caja', icon: 'ClipboardCheck', permisos: ['gerencia_aprobaciones_oc.ver'] },
  },
];
