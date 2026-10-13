import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'personas/asistencia/*',
    permisos: ['rrhh_asistencia.ver'],
    Page: lazy(() => import('./AsistenciaPage').then(m => ({ default: m.AsistenciaPage }))),
    nav: { key: 'asistencia', label: 'Asistencia', to: '/personas/asistencia', icon: 'ClipboardCheck', permisos: ['rrhh_asistencia.ver'] },
  },
  {
    path: 'personas/nomina/*',
    permisos: ['rrhh_nomina.ver'],
    Page: lazy(() => import('./NominaPage').then(m => ({ default: m.NominaPage }))),
    nav: { key: 'nomina', label: 'Nómina', to: '/personas/nomina', icon: 'Banknote', permisos: ['rrhh_nomina.ver'] },
  },
  {
    path: 'personas/seg-unidades/*',
    permisos: ['seguridad_unidades.ver', 'seg_unidades.ver', 'seg_checklist.ver'],
    Page: lazy(() => import('./SegUnidadesPage').then(m => ({ default: m.SegUnidadesPage }))),
    nav: { key: 'seg-unidades', label: 'Garita: unidades', to: '/personas/seg-unidades', icon: 'ShieldCheck', permisos: ['seguridad_unidades.ver', 'seg_unidades.ver', 'seg_checklist.ver'] },
  },
  {
    path: 'personas/portal-conductor/*',
    permisos: ['conductor_portal.ver'],
    Page: lazy(() => import('./PortalConductorPage').then(m => ({ default: m.PortalConductorPage }))),
    nav: { key: 'conductor-portal', label: 'Portal del conductor', to: '/personas/portal-conductor', icon: 'IdCard', permisos: ['conductor_portal.ver'] },
  },
];
