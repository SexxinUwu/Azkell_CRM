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
    // Directorio › Clientes, Proveedores y Estaciones: solo consulta (el alta y la edición son de Terceros)
    path: 'directorio/clientes/*',
    permisos: ['clientes.ver', 'admin'],
    Page: lazy(() => import('./DirectorioPaginas').then(m => ({ default: m.DirectorioClientes }))),
  },
  {
    path: 'directorio/proveedores/*',
    permisos: ['prov_inv.ver', 'admin'],
    Page: lazy(() => import('./DirectorioPaginas').then(m => ({ default: m.DirectorioProveedores }))),
  },
  {
    path: 'directorio/estaciones/*',
    permisos: ['combustible_vales.ver', 'admin'],
    Page: lazy(() => import('./DirectorioPaginas').then(m => ({ default: m.DirectorioEstaciones }))),
  },
  {
    path: 'directorio',
    permisos: ['rrhh_personal.ver', 'cond.ver', 'clientes.ver', 'prov_inv.ver', 'combustible_vales.ver', 'admin'],
    Page: lazy(() => import('./DirectorioPaginas').then(m => ({ default: m.RedirigirDirectorio }))),
  },
  {
    path: 'flota/clientes/*',
    permisos: ['clientes.ver', 'admin'],
    Page: lazy(() => import('./RedirigirClientes').then(m => ({ default: m.RedirigirClientes }))),
  },
];
