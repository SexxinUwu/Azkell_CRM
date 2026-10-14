import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'flota/disponibilidad/*',
    permisos: ['disponibilidad.ver'],
    Page: lazy(() => import('./DisponibilidadPage').then(m => ({ default: m.DisponibilidadPage }))),
    nav: { key: 'disponibilidad', label: 'Disponibilidad', to: '/flota/disponibilidad', icon: 'Gauge', permisos: ['disponibilidad.ver'] },
  },
  {
    path: 'flota/ubicacion/*',
    permisos: ['gps.ver'],
    Page: lazy(() => import('./UbicacionPage').then(m => ({ default: m.UbicacionPage }))),
    nav: { key: 'ubicacion', label: 'Ubicación GPS', to: '/flota/ubicacion', icon: 'MapPin', permisos: ['gps.ver'] },
  },
  {
    path: 'flota/documentos/*',
    permisos: ['docs_flota.ver'],
    Page: lazy(() => import('./DocumentosPage').then(m => ({ default: m.DocumentosPage }))),
    nav: { key: 'documentos', label: 'Documentos', to: '/flota/documentos', icon: 'FileText', permisos: ['docs_flota.ver'] },
  },
  {
    path: 'flota/entrega-vehiculos/*',
    permisos: ['entrega_vehiculos.ver', 'seg_unidades.ver', 'placas.ver'],
    Page: lazy(() => import('./EntregaPage').then(m => ({ default: m.EntregaPage }))),
    nav: { key: 'entrega', label: 'Entrega de vehículos', to: '/flota/entrega-vehiculos', icon: 'ClipboardList', permisos: ['entrega_vehiculos.ver', 'seg_unidades.ver', 'placas.ver'] },
  },
  {
    path: 'flota/checklist/*',
    permisos: ['checklist.ver'],
    Page: lazy(() => import('./ChecklistPage').then(m => ({ default: m.ChecklistPage }))),
    nav: { key: 'checklist', label: 'Reporte de fallas', to: '/flota/checklist', icon: 'ClipboardCheck', permisos: ['checklist.ver'] },
  },
  {
    path: 'flota/checklist-entrega/*',
    permisos: ['entrega_vehiculos.ver', 'seg_unidades.ver', 'admin'],
    Page: lazy(() => import('./ChecklistEntregaPage').then(m => ({ default: m.ChecklistEntregaPage }))),
    nav: { key: 'checklist-entrega', label: 'Checklist de entrega', to: '/flota/checklist-entrega', icon: 'ClipboardList', permisos: ['entrega_vehiculos.ver', 'seg_unidades.ver', 'admin'] },
  },
];
