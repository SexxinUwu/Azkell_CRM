import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'flota/disponibilidad/*',
    permisos: ['disponibilidad.ver', 'admin'],
    Page: lazy(() => import('./DisponibilidadPage').then(m => ({ default: m.DisponibilidadPage }))),
    nav: { key: 'disponibilidad', label: 'Disponibilidad', to: '/flota/disponibilidad', icon: 'Gauge', permisos: ['disponibilidad.ver'] },
  },
  {
    path: 'flota/ubicacion/*',
    permisos: ['gps.ver', 'admin'],
    Page: lazy(() => import('./UbicacionPage').then(m => ({ default: m.UbicacionPage }))),
    nav: { key: 'ubicacion', label: 'Ubicación GPS', to: '/flota/ubicacion', icon: 'MapPin', permisos: ['gps.ver'] },
  },
  {
    path: 'flota/documentos/*',
    permisos: ['docs_flota.ver', 'admin'],
    Page: lazy(() => import('./DocumentosPage').then(m => ({ default: m.DocumentosPage }))),
    nav: { key: 'documentos', label: 'Documentos', to: '/flota/documentos', icon: 'FileText', permisos: ['docs_flota.ver'] },
  },
  {
    // Lista de actas simple (pantalla anterior). Ya no está en el menú: el menú abre el checklist completo.
    path: 'flota/entrega-vehiculos/*',
    permisos: ['entrega_vehiculos.ver', 'seguridad_unidades.ver', 'placas.ver'],
    Page: lazy(() => import('./EntregaPage').then(m => ({ default: m.EntregaPage }))),
  },
  {
    path: 'flota/almacen-flota/*',
    permisos: ['inv.ver', 'sal_inv.ver', 'ent_inv.ver', 'admin'],
    Page: lazy(() => import('./AlmacenFlotaPage').then(m => ({ default: m.AlmacenFlotaPage }))),
    nav: { key: 'almacen-flota', label: 'Almacén de flota', to: '/flota/almacen-flota', icon: 'Warehouse', permisos: ['inv.ver', 'sal_inv.ver', 'ent_inv.ver'] },
  },
  {
    path: 'flota/checklist/*',
    permisos: ['checklist.ver', 'admin'],
    Page: lazy(() => import('./ChecklistPage').then(m => ({ default: m.ChecklistPage }))),
    nav: { key: 'checklist', label: 'Reporte de fallas', to: '/flota/checklist', icon: 'ClipboardCheck', permisos: ['checklist.ver'] },
  },
  {
    // Entrega de vehículos (CheckList por empresa): el menú "Entrega de vehículos" abre esta pantalla
    path: 'flota/checklist-entrega/*',
    permisos: ['entrega_vehiculos.ver', 'seguridad_unidades.ver', 'placas.ver', 'admin'],
    Page: lazy(() => import('./ChecklistEntregaPage').then(m => ({ default: m.ChecklistEntregaPage }))),
    nav: { key: 'entrega', label: 'Entrega de vehículos', to: '/flota/checklist-entrega', icon: 'ClipboardList', permisos: ['entrega_vehiculos.ver', 'seguridad_unidades.ver', 'placas.ver'] },
  },
];
