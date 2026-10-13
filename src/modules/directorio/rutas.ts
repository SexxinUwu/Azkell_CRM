import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'directorio/clientes/*',
    permisos: ['clientes.ver'],
    Page: lazy(() => import('./ClientesPage').then(m => ({ default: m.ClientesPage }))),
    nav: { key: 'clientes', label: 'Clientes', to: '/directorio/clientes', icon: 'Users', permisos: ['clientes.ver'] },
  },
];
