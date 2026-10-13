import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'operaciones/programacion/*',
    permisos: ['operaciones.ver', 'admin'],
    Page: lazy(() => import('./ProgramacionPage').then(m => ({ default: m.ProgramacionPage }))),
    nav: { key: 'programacion', label: 'Programación', to: '/operaciones/programacion', icon: 'CalendarDays', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/ordenes-viaje/*',
    permisos: ['operaciones.ver', 'admin'],
    Page: lazy(() => import('./OrdenesViajePage').then(m => ({ default: m.OrdenesViajePage }))),
    nav: { key: 'ordenes-viaje', label: 'Órdenes de viaje', to: '/operaciones/ordenes-viaje', icon: 'Truck', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/marsisa-ordenes-viaje/*',
    permisos: ['operaciones.ver', 'admin'],
    Page: lazy(() => import('./MarsisaOrdenesViajePage').then(m => ({ default: m.MarsisaOrdenesViajePage }))),
    nav: { key: 'marsisa-ordenes-viaje', label: 'Órdenes de viaje Marsisa', to: '/operaciones/marsisa-ordenes-viaje', icon: 'Truck', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/ordenes-servicio/*',
    permisos: ['operaciones.ver', 'admin'],
    Page: lazy(() => import('./OrdenesServicioPage').then(m => ({ default: m.OrdenesServicioPage }))),
    nav: { key: 'ordenes-servicio', label: 'Órdenes de servicio', to: '/operaciones/ordenes-servicio', icon: 'ClipboardList', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/vales/*',
    permisos: ['operaciones.ver', 'admin'],
    Page: lazy(() => import('./ValesPage').then(m => ({ default: m.ValesPage }))),
    nav: { key: 'vales', label: 'Vales de combustible', to: '/operaciones/vales', icon: 'Fuel', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/marsisa-vales/*',
    permisos: ['operaciones.ver', 'admin'],
    Page: lazy(() => import('./MarsisaValesPage').then(m => ({ default: m.MarsisaValesPage }))),
    nav: { key: 'marsisa-vales', label: 'Vales de combustible Marsisa', to: '/operaciones/marsisa-vales', icon: 'Fuel', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/analisis-combustible/*',
    permisos: ['operaciones.ver', 'admin'],
    Page: lazy(() => import('./AnalisisCombustiblePage').then(m => ({ default: m.AnalisisCombustiblePage }))),
    nav: { key: 'analisis-combustible', label: 'Análisis de combustible', to: '/operaciones/analisis-combustible', icon: 'BarChart2', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/urea/*',
    permisos: ['operaciones.ver', 'admin'],
    Page: lazy(() => import('./UreaPage').then(m => ({ default: m.UreaPage }))),
    nav: { key: 'urea', label: 'Análisis de urea', to: '/operaciones/urea', icon: 'Droplets', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/guias-remitente/*',
    permisos: ['operaciones.ver', 'admin'],
    Page: lazy(() => import('./GuiasRemitentePage').then(m => ({ default: m.GuiasRemitentePage }))),
    nav: { key: 'guias-remitente', label: 'Guías de remitente', to: '/operaciones/guias-remitente', icon: 'FileText', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/guias-transportista/*',
    permisos: ['operaciones.ver', 'admin'],
    Page: lazy(() => import('./GuiasTransportistaPage').then(m => ({ default: m.GuiasTransportistaPage }))),
    nav: { key: 'guias-transportista', label: 'Guías de transportista', to: '/operaciones/guias-transportista', icon: 'FileText', permisos: ['operaciones.ver', 'admin'] },
  },
];
