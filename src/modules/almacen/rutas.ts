import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'almacen/inventario/*',
    permisos: ['inv.ver'],
    Page: lazy(() => import('./InventarioPage').then(m => ({ default: m.InventarioPage }))),
    nav: { key: 'inventario', label: 'Inventario', to: '/almacen/inventario', icon: 'Boxes', permisos: ['inv.ver'] },
  },
  {
    path: 'almacen/entradas/*',
    permisos: ['ent_inv.ver'],
    Page: lazy(() => import('./EntradasPage').then(m => ({ default: m.EntradasPage }))),
    nav: { key: 'entradas', label: 'Entradas', to: '/almacen/entradas', icon: 'PackagePlus', permisos: ['ent_inv.ver'] },
  },
  {
    path: 'almacen/salidas/*',
    permisos: ['sal_inv.ver'],
    Page: lazy(() => import('./SalidasPage').then(m => ({ default: m.SalidasPage }))),
    nav: { key: 'salidas', label: 'Salidas', to: '/almacen/salidas', icon: 'PackageMinus', permisos: ['sal_inv.ver'] },
  },
  {
    path: 'almacen/kardex/*',
    permisos: ['kardex.ver'],
    Page: lazy(() => import('./KardexPage').then(m => ({ default: m.KardexPage }))),
    nav: { key: 'kardex', label: 'Kardex', to: '/almacen/kardex', icon: 'History', permisos: ['kardex.ver'] },
  },
  {
    path: 'almacen/proveedores/*',
    permisos: ['prov_inv.ver'],
    Page: lazy(() => import('./ProveedoresPage').then(m => ({ default: m.ProveedoresPage }))),
    nav: { key: 'proveedores', label: 'Proveedores', to: '/almacen/proveedores', icon: 'Warehouse', permisos: ['prov_inv.ver'] },
  },
  {
    path: 'almacen/recepcion-compras/*',
    permisos: ['rec_compras.ver', 'ent_inv.ver'],
    Page: lazy(() => import('./RecepcionComprasPage').then(m => ({ default: m.RecepcionComprasPage }))),
    nav: { key: 'recepcion', label: 'Recepción de compras', to: '/almacen/recepcion-compras', icon: 'PackagePlus', permisos: ['rec_compras.ver', 'ent_inv.ver'] },
  },
];
