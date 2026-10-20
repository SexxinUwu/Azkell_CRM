import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'mantenimiento/dashboard/*',
    permisos: ['mant_dashboard.ver', 'status_rampa.ver', 'admin'],
    Page: lazy(() => import('./MantDashboardPage').then(m => ({ default: m.MantDashboardPage }))),
    nav: { key: 'mant-dashboard', label: 'Resumen de taller', to: '/mantenimiento/dashboard', icon: 'LayoutDashboard', permisos: ['mant_dashboard.ver', 'status_rampa.ver', 'admin'] },
  },
  {
    path: 'mantenimiento/finanzas-taller/*',
    permisos: ['mant_dashboard.ver', 'admin'],
    Page: lazy(() => import('./FinanzasTallerPage').then(m => ({ default: m.FinanzasTallerPage }))),
    nav: { key: 'finanzas-taller', label: 'Reporte financiero', to: '/mantenimiento/finanzas-taller', icon: 'Wallet', permisos: ['mant_dashboard.ver', 'admin'] },
  },
  {
    path: 'mantenimiento/reportes-ot/*',
    permisos: ['reportes_ot.ver', 'ot.ver'],
    Page: lazy(() => import('./OrdenesTrabajoPage').then(m => ({ default: m.OrdenesTrabajoPage }))),
    nav: { key: 'reportes-ot', label: 'Órdenes de trabajo', to: '/mantenimiento/reportes-ot', icon: 'ScrollText', permisos: ['reportes_ot.ver', 'ot.ver'] },
  },
  {
    path: 'mantenimiento/trabajos-ot/*',
    permisos: ['trabajos_ot.ver'],
    Page: lazy(() => import('./TrabajosOtPage').then(m => ({ default: m.TrabajosOtPage }))),
    nav: { key: 'trabajos-ot', label: 'Trabajos de OT', to: '/mantenimiento/trabajos-ot', icon: 'Wrench', permisos: ['trabajos_ot.ver'] },
  },
  {
    path: 'mantenimiento/status-rampa/*',
    permisos: ['status_rampa.ver'],
    Page: lazy(() => import('./StatusRampaPage').then(m => ({ default: m.StatusRampaPage }))),
    nav: { key: 'status-rampa', label: 'Status de rampa', to: '/mantenimiento/status-rampa', icon: 'Wrench', permisos: ['status_rampa.ver'] },
  },
  {
    path: 'mantenimiento/fleetrun/*',
    permisos: ['fleetrun.ver', 'fleet.ver'],
    Page: lazy(() => import('./FleetrunPage').then(m => ({ default: m.FleetrunPage }))),
    nav: { key: 'fleetrun', label: 'Fleetrun', to: '/mantenimiento/fleetrun', icon: 'Gauge', permisos: ['fleetrun.ver', 'fleet.ver'] },
  },
  {
    path: 'mantenimiento/neumaticos/*',
    permisos: ['neumaticos.ver'],
    Page: lazy(() => import('./NeumaticosPage').then(m => ({ default: m.NeumaticosPage }))),
    nav: { key: 'neumaticos', label: 'Neumáticos', to: '/mantenimiento/neumaticos', icon: 'Disc3', permisos: ['neumaticos.ver'] },
  },
  {
    path: 'mantenimiento/planificacion/*',
    permisos: ['plan.ver'],
    Page: lazy(() => import('./PlanificacionPage').then(m => ({ default: m.PlanificacionPage }))),
    nav: { key: 'planificacion', label: 'Planificación', to: '/mantenimiento/planificacion', icon: 'History', permisos: ['plan.ver'] },
  },
  {
    path: 'mantenimiento/tipos-mp/*',
    permisos: ['plan.ver'],
    Page: lazy(() => import('./TiposAlertasPage').then(m => ({ default: m.TiposAlertasPage }))),
  },
  {
    path: 'mantenimiento/incidencias/*',
    permisos: ['incidencias_ruta.ver'],
    Page: lazy(() => import('./IncidenciasPage').then(m => ({ default: m.IncidenciasPage }))),
    nav: { key: 'incidencias', label: 'Incidencias en ruta', to: '/mantenimiento/incidencias', icon: 'ShieldCheck', permisos: ['incidencias_ruta.ver'] },
  },
  {
    path: 'mantenimiento/fallas/*',
    permisos: ['fallas.ver', 'admin'],
    Page: lazy(() => import('./FallasPage').then(m => ({ default: m.FallasPage }))),
    nav: { key: 'fallas', label: 'Fallas en ruta', to: '/mantenimiento/fallas', icon: 'AlertTriangle', permisos: ['fallas.ver', 'admin'] },
  },
  {
    path: 'mantenimiento/kits-mp/*',
    permisos: ['plan.ver', 'admin'],
    Page: lazy(() => import('./KitsMpPage').then(m => ({ default: m.KitsMpPage }))),
    nav: { key: 'kits-mp', label: 'Kits de mantenimiento', to: '/mantenimiento/kits-mp', icon: 'PackageCheck', permisos: ['plan.ver', 'admin'] },
  },
  {
    path: 'mantenimiento/otros/*',
    permisos: ['admin', 'status_rampa.ver', 'ot.ver'],
    Page: lazy(() => import('./MantOtrosPage').then(m => ({ default: m.MantOtrosPage }))),
    nav: { key: 'mant-otros', label: 'Otros', to: '/mantenimiento/otros', icon: 'Layers', permisos: ['admin', 'status_rampa.ver', 'ot.ver'] },
  },
];
