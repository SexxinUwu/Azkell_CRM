import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'flota/clientes/*',
    permisos: ['clientes.ver', 'admin'],
    Page: lazy(() => import('./ClientesPage').then(m => ({ default: m.ClientesPage }))),
    nav: { key: 'clientes', label: 'Clientes', to: '/flota/clientes', icon: 'Users', permisos: ['clientes.ver'] },
  },
  {
    // Ruta anterior (Directorio › Clientes): redirige a Flota › Clientes
    path: 'directorio/clientes/*',
    permisos: ['clientes.ver', 'admin'],
    Page: lazy(() => import('./RedirigirClientes').then(m => ({ default: m.RedirigirClientes }))),
  },
];
