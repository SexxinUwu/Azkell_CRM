import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

// Terceros: clientes y proveedores en un solo módulo (se llenan igual)
export const RUTAS: RutaModulo[] = [
  {
    path: 'terceros/clientes/*',
    permisos: ['clientes.crear', 'clientes.editar', 'admin'],
    Page: lazy(() => import('./TercerosPaginas').then(m => ({ default: m.TercerosClientes }))),
    nav: { key: 'terceros', label: 'Clientes, proveedores y estaciones', to: '/terceros/clientes', icon: 'Users', permisos: ['clientes.crear', 'clientes.editar', 'prov_inv.crear', 'prov_inv.editar', 'combustible_vales.crear', 'combustible_vales.editar'] },
  },
  {
    path: 'terceros/proveedores/*',
    permisos: ['prov_inv.crear', 'prov_inv.editar', 'admin'],
    Page: lazy(() => import('./TercerosPaginas').then(m => ({ default: m.TercerosProveedores }))),
  },
  {
    path: 'terceros/estaciones/*',
    permisos: ['combustible_vales.crear', 'combustible_vales.editar', 'admin'],
    Page: lazy(() => import('./TercerosPaginas').then(m => ({ default: m.TercerosEstaciones }))),
  },
  {
    path: 'terceros',
    permisos: ['clientes.crear', 'clientes.editar', 'prov_inv.crear', 'prov_inv.editar', 'combustible_vales.crear', 'combustible_vales.editar', 'admin'],
    Page: lazy(() => import('./TercerosPaginas').then(m => ({ default: m.RedirigirTerceros }))),
  },
];
