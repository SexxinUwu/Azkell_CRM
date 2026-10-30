import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'mantenimiento/dashboard/*',
    permisos: ['mant_dashboard.ver', 'dashboard.ver', 'status_rampa.ver', 'checklist.ver', 'admin'],
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
    path: 'mantenimiento/config-metrica/*',
    permisos: ['cfg_mant.ver', 'admin'],
    Page: lazy(() => import('./ConfigMetricaPage').then(m => ({ default: m.ConfigMetricaPage }))),
    nav: { key: 'config-metrica', label: 'Config. métrica', to: '/mantenimiento/config-metrica', icon: 'Target', permisos: ['cfg_mant.ver', 'admin'] },
  },
  {
    path: 'mantenimiento/configuracion-mp/*',
    permisos: ['cfg_mant.ver', 'admin'],
    Page: lazy(() => import('./FrecuenciasMpPage').then(m => ({ default: m.FrecuenciasMpPage }))),
    nav: { key: 'frecuencias-mp', label: 'Frecuencias MP', to: '/mantenimiento/configuracion-mp', icon: 'Settings', permisos: ['cfg_mant.ver', 'admin'] },
  },
  {
    path: 'mantenimiento/kpis-taller/*',
    permisos: ['mant_dashboard.ver', 'admin'],
    Page: lazy(() => import('./KpisTallerPage').then(m => ({ default: m.KpisTallerPage }))),
    nav: { key: 'kpis', label: 'Métricas y KPIs', to: '/mantenimiento/kpis-taller', icon: 'Activity', permisos: ['mant_dashboard.ver', 'admin'] },
  },
  {
    path: 'mantenimiento/productividad/*',
    permisos: ['pers_mant.ver', 'mant_dashboard.ver', 'admin'],
    Page: lazy(() => import('./ProductividadPage').then(m => ({ default: m.ProductividadPage }))),
    nav: { key: 'productividad', label: 'Productividad personal', to: '/mantenimiento/productividad', icon: 'HardHat', permisos: ['pers_mant.ver', 'mant_dashboard.ver', 'admin'] },
  },
  {
    path: 'mantenimiento/reportes-ot/*',
    permisos: ['reportes_ot.ver', 'ot.ver', 'admin'],
    Page: lazy(() => import('./OrdenesTrabajoPage').then(m => ({ default: m.OrdenesTrabajoPage }))),
    nav: { key: 'reportes-ot', label: 'Órdenes de trabajo', to: '/mantenimiento/reportes-ot', icon: 'ScrollText', permisos: ['reportes_ot.ver', 'ot.ver'] },
  },
  {
    path: 'mantenimiento/trabajos-ot/*',
    permisos: ['trabajos_ot.ver', 'admin'],
    Page: lazy(() => import('./TrabajosOtPage').then(m => ({ default: m.TrabajosOtPage }))),
    nav: { key: 'trabajos-ot', label: 'Trabajos de OT', to: '/mantenimiento/trabajos-ot', icon: 'Wrench', permisos: ['trabajos_ot.ver'] },
  },
  {
    path: 'mantenimiento/status-rampa/*',
    permisos: ['status_rampa.ver', 'admin'],
    Page: lazy(() => import('./StatusRampaPage').then(m => ({ default: m.StatusRampaPage }))),
    nav: { key: 'status-rampa', label: 'Status de rampa', to: '/mantenimiento/status-rampa', icon: 'Wrench', permisos: ['status_rampa.ver'] },
  },
  {
    path: 'mantenimiento/fleetrun/*',
    permisos: ['fleetrun.ver', 'fleet.ver', 'admin'],
    Page: lazy(() => import('./FleetrunPage').then(m => ({ default: m.FleetrunPage }))),
    nav: { key: 'fleetrun', label: 'Fleetrun', to: '/mantenimiento/fleetrun', icon: 'Gauge', permisos: ['fleetrun.ver', 'fleet.ver'] },
  },
  {
    path: 'mantenimiento/fleetrun-config/*',
    permisos: ['cfg_fleetrun.ver', 'admin'],
    Page: lazy(() => import('./FleetrunConfigPage').then(m => ({ default: m.FleetrunConfigPage }))),
  },
  {
    path: 'mantenimiento/neumaticos-analisis/*',
    permisos: ['neumaticos.ver', 'admin'],
    Page: lazy(() => import('./NeumaticosAnalisis').then(m => ({ default: m.NeumaticosAnalisisPage }))),
    nav: { key: 'neumaticos-analisis', label: 'Análisis de neumáticos', to: '/mantenimiento/neumaticos-analisis', icon: 'Disc3', permisos: ['neumaticos.ver'] },
  },
  {
    path: 'mantenimiento/neumaticos-ultimas/*',
    permisos: ['neumaticos.ver', 'admin'],
    Page: lazy(() => import('./NeumaticosUltimasPage').then(m => ({ default: m.NeumaticosUltimasPage }))),
    nav: { key: 'neumaticos', label: 'Últimas inspecciones', to: '/mantenimiento/neumaticos-ultimas', icon: 'Disc3', permisos: ['neumaticos.ver'] },
  },
  {
    // Listado de todos los neumáticos (ciclo de vida); cada fila abre la ficha
    path: 'mantenimiento/neumaticos-listado/*',
    permisos: ['neumaticos.ver', 'admin'],
    Page: lazy(() => import('./NeumaticosListado').then(m => ({ default: m.NeumaticosListado }))),
  },
  {
    // Tablero de movimientos de llantas (se abre desde la pestaña Neumáticos de la placa)
    path: 'mantenimiento/neumaticos-tablero/:placa?',
    permisos: ['neumaticos.ver'],
    Page: lazy(() => import('./NeumaticosTablero').then(m => ({ default: m.NeumaticosTablero }))),
  },
  {
    // Ficha de un neumático (pantalla completa; también existe como hoja desde las inspecciones)
    path: 'mantenimiento/neumaticos-ficha/:codigo',
    permisos: ['neumaticos.ver'],
    Page: lazy(() => import('./NeumaticoHojaVida').then(m => ({ default: m.NeumaticoHojaVidaRuta }))),
  },
  {
    // Ruta antigua: redirige a una de las dos pantallas para no romper enlaces
    path: 'mantenimiento/neumaticos/*',
    permisos: ['neumaticos.ver'],
    Page: lazy(() => import('./NeumaticosRedirect').then(m => ({ default: m.NeumaticosRedirect }))),
  },
  {
    path: 'mantenimiento/planificacion/*',
    permisos: ['plan.ver', 'admin'],
    Page: lazy(() => import('./PlanificacionPage').then(m => ({ default: m.PlanificacionPage }))),
    nav: { key: 'planificacion', label: 'Planificación', to: '/mantenimiento/planificacion', icon: 'History', permisos: ['plan.ver'] },
  },
  {
    path: 'mantenimiento/otros/*',
    permisos: [],
    Page: lazy(() => import('./OtrosMantenimientoPage').then(m => ({ default: m.OtrosMantenimientoPage }))),
  },
  {
    path: 'mantenimiento/tipos-mp/*',
    permisos: ['cfg_mant.ver', 'admin'],
    Page: lazy(() => import('./TiposAlertasPage').then(m => ({ default: m.TiposAlertasPage }))),
  },
  {
    path: 'mantenimiento/incidencias/*',
    permisos: ['incidencias_ruta.ver', 'admin'],
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
    permisos: ['cfg_mant.ver', 'admin'],
    Page: lazy(() => import('./KitsMpPage').then(m => ({ default: m.KitsMpPage }))),
    nav: { key: 'kits-mp', label: 'Kits de mantenimiento', to: '/mantenimiento/kits-mp', icon: 'PackageCheck', permisos: ['plan.ver', 'admin'] },
  },
];
