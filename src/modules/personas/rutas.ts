import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'personas/asistencia/*',
    permisos: ['rrhh_asistencia.ver', 'admin'],
    Page: lazy(() => import('./AsistenciaPage').then(m => ({ default: m.AsistenciaPage }))),
    nav: { key: 'asistencia', label: 'Asistencia', to: '/personas/asistencia', icon: 'ClipboardCheck', permisos: ['rrhh_asistencia.ver'] },
  },
  {
    path: 'personas/nomina/*',
    permisos: ['rrhh_nomina.ver', 'admin'],
    Page: lazy(() => import('./NominaPage').then(m => ({ default: m.NominaPage }))),
    nav: { key: 'nomina', label: 'Nómina', to: '/personas/nomina', icon: 'Banknote', permisos: ['rrhh_nomina.ver'] },
  },
  {
    path: 'personas/seg-unidades/*',
    permisos: ['seguridad_unidades.ver', 'admin'],
    Page: lazy(() => import('./SegUnidadesPage').then(m => ({ default: m.SegUnidadesPage }))),
    nav: { key: 'seg-unidades', label: 'Garita: unidades', to: '/personas/seg-unidades', icon: 'ShieldCheck', permisos: ['seguridad_unidades.ver', 'seguridad_unidades.ver', 'seguridad_unidades.ver'] },
  },
  {
    path: 'personas/portal-conductor/*',
    permisos: ['conductor_portal.ver', 'admin'],
    Page: lazy(() => import('./PortalConductorPage').then(m => ({ default: m.PortalConductorPage }))),
    nav: { key: 'conductor-portal', label: 'Portal del conductor', to: '/personas/portal-conductor', icon: 'IdCard', permisos: ['conductor_portal.ver'] },
  },
  {
    path: 'personas/seg-patrimonial/*',
    permisos: ['seguridad_unidades.ver', 'seguridad_unidades.ver', 'admin'],
    Page: lazy(() => import('./SegPatrimonialPage').then(m => ({ default: m.SegPatrimonialPage }))),
    nav: { key: 'seg-patrimonial', label: 'Panel patrimonial', to: '/personas/seg-patrimonial', icon: 'ShieldAlert', permisos: ['seguridad_unidades.ver', 'seguridad_unidades.ver', 'admin'] },
  },
];
