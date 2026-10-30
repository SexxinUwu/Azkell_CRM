import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'operaciones/programacion/*',
    permisos: ['op_programacion.ver', 'op_guias_remision.ver', 'guias_remision.ver', 'admin'],
    Page: lazy(() => import('./ProgramacionPage').then(m => ({ default: m.ProgramacionPage }))),
    nav: { key: 'programacion', label: 'Programación', to: '/operaciones/programacion', icon: 'CalendarDays', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/ordenes-viaje/*',
    permisos: ['op_ordenes_viaje.ver', 'op_programacion.ver', 'guias_remision.ver', 'op_guias_remision.ver', 'admin'],
    Page: lazy(() => import('./OrdenesViajePage').then(m => ({ default: m.OrdenesViajePage }))),
    nav: { key: 'ordenes-viaje', label: 'Órdenes de viaje', to: '/operaciones/ordenes-viaje', icon: 'Truck', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/marsisa-ordenes-viaje/*',
    permisos: ['op_ordenes_viaje.ver', 'op_programacion.ver', 'guias_remision.ver', 'op_guias_remision.ver', 'admin'],
    Page: lazy(() => import('./MarsisaOrdenesViajePage').then(m => ({ default: m.MarsisaOrdenesViajePage }))),
    nav: { key: 'marsisa-ordenes-viaje', label: 'Órdenes de viaje Marsisa', to: '/operaciones/marsisa-ordenes-viaje', icon: 'Truck', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/ordenes-servicio/*',
    permisos: ['op_ordenes_servicio.ver', 'op_ordenes_viaje.ver', 'op_programacion.ver', 'guias_remision.ver', 'admin'],
    Page: lazy(() => import('./OrdenesServicioPage').then(m => ({ default: m.OrdenesServicioPage }))),
    nav: { key: 'ordenes-servicio', label: 'Órdenes de servicio', to: '/operaciones/ordenes-servicio', icon: 'ClipboardList', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/reporte-viajes/*',
    permisos: ['op_reporte_viajes.ver', 'admin'],
    Page: lazy(() => import('./ReporteViajesPage').then(m => ({ default: m.ReporteViajesPage }))),
  },
  {
    path: 'operaciones/vales/*',
    permisos: ['combustible_vales.ver', 'combustible.ver', 'admin'],
    Page: lazy(() => import('./ValesPage').then(m => ({ default: m.ValesPage }))),
    nav: { key: 'vales', label: 'Vales de combustible', to: '/operaciones/vales', icon: 'Fuel', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/marsisa-vales/*',
    permisos: ['combustible_vales.ver', 'combustible.ver', 'admin'],
    Page: lazy(() => import('./MarsisaValesPage').then(m => ({ default: m.MarsisaValesPage }))),
    nav: { key: 'marsisa-vales', label: 'Vales de combustible Marsisa', to: '/operaciones/marsisa-vales', icon: 'Fuel', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/analisis-combustible/*',
    permisos: ['combustible_analisis.ver', 'combustible.ver', 'admin'],
    Page: lazy(() => import('./AnalisisCombustiblePage').then(m => ({ default: m.AnalisisCombustiblePage }))),
    nav: { key: 'analisis-combustible', label: 'Análisis de combustible', to: '/operaciones/analisis-combustible', icon: 'BarChart2', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/matriz-combustible/*',
    permisos: ['combustible_analisis.ver', 'combustible.ver', 'admin'],
    Page: lazy(() => import('./MatrizCombustiblePage').then(m => ({ default: m.MatrizCombustiblePage }))),
  },
  {
    path: 'operaciones/combustible-estaciones/*',
    permisos: ['combustible_vales.ver', 'combustible.ver', 'admin'],
    Page: lazy(() => import('./EstacionesProveedoresPage').then(m => ({ default: m.EstacionesProveedoresPage }))),
    nav: { key: 'estaciones', label: 'Estaciones de proveedores', to: '/operaciones/combustible-estaciones', icon: 'MapPin', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/urea/*',
    permisos: ['urea_analisis.ver', 'combustible_analisis.ver', 'combustible.ver', 'admin'],
    Page: lazy(() => import('./UreaPage').then(m => ({ default: m.UreaPage }))),
    nav: { key: 'urea', label: 'Análisis de urea', to: '/operaciones/urea', icon: 'Droplets', permisos: ['operaciones.ver', 'admin'] },
  },
  {
    path: 'operaciones/guias-remitente/*',
    permisos: ['op_guias_remision.ver', 'guias_remision.ver', 'admin'],
    Page: lazy(() => import('./GuiasRemitentePage').then(m => ({ default: m.GuiasRemitentePage }))),
  },
  {
    path: 'operaciones/guias-transportista/*',
    permisos: ['op_guias_remision.ver', 'guias_remision.ver', 'admin'],
    Page: lazy(() => import('./GuiasTransportistaPage').then(m => ({ default: m.GuiasTransportistaPage }))),
  },
];
