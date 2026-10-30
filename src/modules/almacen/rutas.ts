import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'almacen/inventario/*',
    permisos: ['inv.ver', 'admin'],
    Page: lazy(() => import('./InventarioPage').then(m => ({ default: m.InventarioPage }))),
    nav: { key: 'inventario', label: 'Inventario', to: '/almacen/inventario', icon: 'Boxes', permisos: ['inv.ver'] },
  },
  {
    path: 'almacen/entradas/*',
    permisos: ['ent_inv.ver', 'admin'],
    Page: lazy(() => import('./EntradasPage').then(m => ({ default: m.EntradasPage }))),
    nav: { key: 'entradas', label: 'Entradas', to: '/almacen/entradas', icon: 'PackagePlus', permisos: ['ent_inv.ver'] },
  },
  {
    path: 'almacen/salidas/*',
    permisos: ['sal_inv.ver', 'admin'],
    Page: lazy(() => import('./SalidasPage').then(m => ({ default: m.SalidasPage }))),
    nav: { key: 'salidas', label: 'Salidas', to: '/almacen/salidas', icon: 'PackageMinus', permisos: ['sal_inv.ver'] },
  },
  {
    path: 'almacen/kardex/*',
    permisos: ['kardex.ver', 'admin'],
    Page: lazy(() => import('./KardexPage').then(m => ({ default: m.KardexPage }))),
    nav: { key: 'kardex', label: 'Kardex', to: '/almacen/kardex', icon: 'History', permisos: ['kardex.ver'] },
  },
  {
    path: 'almacen/proveedores/*',
    permisos: ['prov_inv.ver', 'admin'],
    Page: lazy(() => import('./ProveedoresPage').then(m => ({ default: m.ProveedoresPage }))),
    nav: { key: 'proveedores', label: 'Proveedores', to: '/almacen/proveedores', icon: 'Warehouse', permisos: ['prov_inv.ver'] },
  },
  {
    path: 'almacen/recepcion-compras/*',
    permisos: ['rec_compras.ver', 'ent_inv.ver', 'inv.ver', 'admin'],
    Page: lazy(() => import('./RecepcionComprasPage').then(m => ({ default: m.RecepcionComprasPage }))),
    nav: { key: 'recepcion', label: 'Recepción de compras', to: '/almacen/recepcion-compras', icon: 'PackagePlus', permisos: ['rec_compras.ver', 'ent_inv.ver'] },
  },
  {
    path: 'almacen/dashboard/*',
    permisos: ['inv.ver', 'admin'],
    Page: lazy(() => import('./DashboardPage').then(m => ({ default: m.DashboardPage }))),
    nav: { key: 'almacen-dashboard', label: 'Dashboard', to: '/almacen/dashboard', icon: 'BarChart2', permisos: ['dash_alm.ver', 'inv.ver'] },
  },
  {
    path: 'almacen/otros/*',
    permisos: ['almacen_otros.ver', 'inv.ver', 'admin'],
    Page: lazy(() => import('./AlmacenOtrosPage').then(m => ({ default: m.AlmacenOtrosPage }))),
    nav: { key: 'almacen-otros', label: 'Otros', to: '/almacen/otros', icon: 'Layers', permisos: ['almacen_otros.ver', 'inv.ver', 'admin'] },
  },
  {
    path: 'almacen/configuracion/*',
    permisos: ['cfg_almacen.ver', 'inv.ver'],
    Page: lazy(() => import('./AlmacenConfiguracionPage').then(m => ({ default: m.AlmacenConfiguracionPage }))),
  },
];
