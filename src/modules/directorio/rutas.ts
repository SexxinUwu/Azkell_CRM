import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'operaciones/clientes/*',
    permisos: ['clientes.ver', 'admin'],
    Page: lazy(() => import('./ClientesPage').then(m => ({ default: m.ClientesPage }))),
    nav: { key: 'clientes', label: 'Clientes', to: '/operaciones/clientes', icon: 'Users', permisos: ['clientes.ver'] },
  },
  {
    // Rutas anteriores (Directorio › Clientes y Flota › Clientes): redirigen a Operaciones › Clientes
    path: 'directorio/clientes/*',
    permisos: ['clientes.ver', 'admin'],
    Page: lazy(() => import('./RedirigirClientes').then(m => ({ default: m.RedirigirClientes }))),
  },
  {
    path: 'flota/clientes/*',
    permisos: ['clientes.ver', 'admin'],
    Page: lazy(() => import('./RedirigirClientes').then(m => ({ default: m.RedirigirClientes }))),
  },
];
