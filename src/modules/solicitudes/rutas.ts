import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

// Solicitudes: cualquier usuario pide; quien tiene el permiso «Aprobar» del tipo decide (se valida en el servidor)
export const RUTAS: RutaModulo[] = [
  {
    path: 'solicitudes/*',
    permisos: [],
    Page: lazy(() => import('./SolicitudesPage').then(m => ({ default: m.SolicitudesPage }))),
    nav: { key: 'solicitudes', label: 'Solicitudes', to: '/solicitudes', icon: 'ClipboardCheck', permisos: [] },
  },
];
