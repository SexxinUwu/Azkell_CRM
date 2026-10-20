import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'tesoreria/caja/*',
    permisos: ['tesoreria_caja.ver'],
    Page: lazy(() => import('./CajaPage').then(m => ({ default: m.CajaPage }))),
    nav: { key: 'caja', label: 'Caja', to: '/tesoreria/caja', icon: 'Banknote', permisos: ['tesoreria_caja.ver'] },
  },
  {
    path: 'tesoreria/movimientos/*',
    permisos: ['tesoreria_caja.ver', 'tesoreria_movimientos.ver'],
    Page: lazy(() => import('./MovimientosPage').then(m => ({ default: m.MovimientosPage }))),
    nav: { key: 'movimientos', label: 'Movimientos', to: '/tesoreria/movimientos', icon: 'ArrowLeftRight', permisos: ['tesoreria_caja.ver', 'tesoreria_movimientos.ver'] },
  },
  {
    path: 'tesoreria/liquidaciones/*',
    permisos: ['tesoreria_liquidaciones.ver'],
    Page: lazy(() => import('./LiquidacionesPage').then(m => ({ default: m.LiquidacionesPage }))),
    nav: { key: 'liquidaciones', label: 'Liquidaciones', to: '/tesoreria/liquidaciones', icon: 'ScrollText', permisos: ['tesoreria_liquidaciones.ver'] },
  },
  {
    path: 'tesoreria/cuentas/*',
    permisos: ['tesoreria_cuentas.ver'],
    Page: lazy(() => import('./CuentasPage').then(m => ({ default: m.CuentasPage }))),
    nav: { key: 'cuentas', label: 'Cuentas por cobrar', to: '/tesoreria/cuentas', icon: 'FileText', permisos: ['tesoreria_cuentas.ver'] },
  },
  {
    path: 'tesoreria/bancos/*',
    permisos: ['tesoreria_bancos.ver', 'tesoreria_caja.ver'],
    Page: lazy(() => import('./BancosPage').then(m => ({ default: m.BancosPage }))),
    nav: { key: 'bancos', label: 'Bancos', to: '/tesoreria/bancos', icon: 'Banknote', permisos: ['tesoreria_bancos.ver', 'tesoreria_caja.ver'] },
  },
  {
    path: 'tesoreria/centros-costos/*',
    permisos: ['tesoreria_centros_costos.ver', 'tesoreria_caja.ver'],
    Page: lazy(() => import('./CentrosCostosPage').then(m => ({ default: m.CentrosCostosPage }))),
    nav: { key: 'centros-costos', label: 'Centros de costos', to: '/tesoreria/centros-costos', icon: 'Boxes', permisos: ['tesoreria_centros_costos.ver', 'tesoreria_caja.ver'] },
  },
  {
    path: 'tesoreria/pago-requerimientos/*',
    permisos: ['tesoreria_caja.ver'],
    Page: lazy(() => import('./PagoRequerimientosPage').then(m => ({ default: m.PagoRequerimientosPage }))),
    nav: { key: 'pago-requerimientos', label: 'Pago de requerimientos', to: '/tesoreria/pago-requerimientos', icon: 'CreditCard', permisos: ['tesoreria_caja.ver'] },
  },
];
