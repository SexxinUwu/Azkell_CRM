import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'mantenimiento/reportes-ot/*',
    permisos: ['reportes_ot.ver', 'ot.ver'],
    Page: lazy(() => import('./OrdenesTrabajoPage').then(m => ({ default: m.OrdenesTrabajoPage }))),
    nav: { key: 'reportes-ot', label: 'Órdenes de trabajo', to: '/mantenimiento/reportes-ot', icon: 'ScrollText', permisos: ['reportes_ot.ver', 'ot.ver'] },
  },
  {
    path: 'mantenimiento/trabajos-ot/*',
    permisos: ['trabajos_ot.ver'],
    Page: lazy(() => import('./TrabajosOtPage').then(m => ({ default: m.TrabajosOtPage }))),
    nav: { key: 'trabajos-ot', label: 'Trabajos de OT', to: '/mantenimiento/trabajos-ot', icon: 'Wrench', permisos: ['trabajos_ot.ver'] },
  },
  {
    path: 'mantenimiento/status-rampa/*',
    permisos: ['status_rampa.ver'],
    Page: lazy(() => import('./StatusRampaPage').then(m => ({ default: m.StatusRampaPage }))),
    nav: { key: 'status-rampa', label: 'Status de rampa', to: '/mantenimiento/status-rampa', icon: 'Wrench', permisos: ['status_rampa.ver'] },
  },
];
