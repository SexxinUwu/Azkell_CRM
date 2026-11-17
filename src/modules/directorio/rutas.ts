import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    // Operaciones › Clientes pasó a Terceros: el enlace anterior sigue funcionando
    path: 'operaciones/clientes/*',
    permisos: ['clientes.ver', 'admin'],
    Page: lazy(() => import('./RedirigirClientes').then(m => ({ default: m.RedirigirClientes }))),
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
