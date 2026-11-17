import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

// Terceros: clientes y proveedores en un solo módulo (se llenan igual)
export const RUTAS: RutaModulo[] = [
  {
    path: 'terceros/clientes/*',
    permisos: ['clientes.ver', 'admin'],
    Page: lazy(() => import('./TercerosPaginas').then(m => ({ default: m.TercerosClientes }))),
    nav: { key: 'terceros', label: 'Clientes y proveedores', to: '/terceros/clientes', icon: 'Users', permisos: ['clientes.ver', 'prov_inv.ver'] },
  },
  {
    path: 'terceros/proveedores/*',
    permisos: ['prov_inv.ver', 'admin'],
    Page: lazy(() => import('./TercerosPaginas').then(m => ({ default: m.TercerosProveedores }))),
  },
  {
    path: 'terceros',
    permisos: ['clientes.ver', 'prov_inv.ver', 'admin'],
    Page: lazy(() => import('./TercerosPaginas').then(m => ({ default: m.RedirigirTerceros }))),
  },
];
