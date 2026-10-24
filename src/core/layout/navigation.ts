// Navegación de Azkell Fleet. Orden y nombres según el modelo de menú del producto:
// Dashboard, Operaciones, Operaciones Marsisa, Flota, Mantenimiento, Almacén, Gerencia, RRHH,
// Tesorería, Conductor, Seguridad, Directorio y Configuración.
//
// Mientras dure la migración, cada pantalla es de uno de dos tipos:
//   - nueva   (`to`):     ruta de la app nueva, registrada en src/App.tsx
//   - actual  (`clasico`): ruta de la versión actual (cargarModuloAislado). Se abre en la app
//                         actual con la misma sesión. Al migrar una pantalla, se cambia `clasico` por `to`.
//
// Un elemento con `children` es un grupo desplegable (submenú). Un elemento con `pronto` todavía no
// existe en la app: se muestra deshabilitado con "Pronto" y solo lo ven los administradores.
//
// Permisos: 'clave.ver' según la matriz de permisos actual (ver core/auth/permisos.ts). Los administradores ven todo.
import {
  Accessibility, Activity, ArrowLeftRight, Banknote, BarChart3, Boxes, Building2, Cog, Code, Contact, Disc3, Droplet, FileText, Fuel, Gauge, HardHat, History, Hourglass, IdCard, Landmark, Layers, LayoutDashboard, MapPin, Package, PackageMinus, PackagePlus, Palette, Route, Ruler, ScrollText, Settings, ShieldCheck, Tag, Target, Truck, UserCog, Users, Wallet, Warehouse, Wrench, CalendarDays, ClipboardCheck, ClipboardList, Clock, type LucideIcon, Bell,
} from 'lucide-react';
import type { RutaModulo } from '../../modules/personal/rutas.tipos';

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Ruta de la app nueva */
  to?: string;
  /** Ruta de la versión actual (se abre allí) */
  clasico?: string;
  /** Visible si tiene al menos uno (vacío = cualquiera con sesión) */
  permissions: string[];
  /** Solo en el subdominio de esa empresa (pantallas propias de una empresa) */
  soloEmpresa?: string;
  /** Oculto en esta empresa (su versión propia está en otra sección) */
  noEmpresa?: string;
  /** Submenú: el elemento agrupa estas opciones */
  children?: NavItem[];
  /** Todavía no existe en la app: se muestra deshabilitado con "Pronto" */
  pronto?: boolean;
  /** Contador de pendientes que aparece junto al nombre */
  badge?: 'aprob-oc' | 'aprob-caja';
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const ver = (...claves: string[]) => claves.map(c => `${c}.ver`);

const SECCIONES_BASE: NavSection[] = [
  {
    title: 'Dashboard',
    items: [
      { key: 'inicio', label: 'Dashboard principal', to: '/', icon: LayoutDashboard, permissions: [] },
    ],
  },
  {
    title: 'Operaciones',
    items: [
      { key: 'programacion', label: 'Programación', to: '/operaciones/programacion', icon: CalendarDays, permissions: ver('op_programacion', 'op_guias_remision', 'guias_remision') },
      { key: 'ordenes-viaje', noEmpresa: 'marsisa', label: 'Órdenes de viaje', clasico: 'operaciones/ordenes-viaje', icon: Route, permissions: ver('op_ordenes_viaje', 'op_programacion', 'guias_remision', 'op_guias_remision') },
      { key: 'ordenes-servicio', label: 'Órdenes de servicio', to: '/operaciones/ordenes-servicio', icon: ScrollText, permissions: ver('op_ordenes_servicio', 'op_ordenes_viaje', 'op_programacion', 'guias_remision') },
      { key: 'reporte-viajes', label: 'Reporte de viajes', to: '/operaciones/reporte-viajes', icon: BarChart3, permissions: ver('op_reporte_viajes') },
      {
        key: 'guias-grupo', label: 'Guías de remisión', icon: FileText, permissions: [],
        children: [
          { key: 'guias-remitente', label: 'Guía de remisión electrónica (remitente)', clasico: 'operaciones/guia-remitente', icon: FileText, permissions: ver('op_guias_remision', 'guias_remision') },
          { key: 'guias-transportista', label: 'Guía de remisión de transportista', clasico: 'operaciones/guia-transportista', icon: FileText, permissions: ver('op_guias_remision', 'guias_remision') },
        ],
      },
      {
        key: 'combustible-grupo', label: 'Combustible', icon: Fuel, permissions: [],
        children: [
          { key: 'vales', noEmpresa: 'marsisa', label: 'Vales de combustible', to: '/operaciones/vales', icon: Fuel, permissions: ver('combustible_vales', 'combustible') },
          { key: 'matriz-combustible', noEmpresa: 'marsisa', label: 'Matriz de combustible (D2)', to: '/operaciones/matriz-combustible', icon: Target, permissions: ver('combustible_analisis', 'combustible') },
          { key: 'analisis-combustible', noEmpresa: 'marsisa', label: 'Análisis de combustible (D2)', to: '/operaciones/analisis-combustible', icon: Gauge, permissions: ver('combustible_analisis', 'combustible') },
          { key: 'urea', noEmpresa: 'marsisa', label: 'Análisis de urea', to: '/operaciones/urea', icon: Droplet, permissions: ver('urea_analisis', 'combustible_analisis', 'combustible') },
          { key: 'estaciones', label: 'Estaciones de proveedores', clasico: 'operaciones/combustible-estaciones', icon: MapPin, permissions: ver('combustible_vales', 'combustible') },
        ],
      },
    ],
  },
  {
    title: 'Operaciones Marsisa',
    items: [
      { key: 'marsisa-ordenes-viaje', label: 'Órdenes de viaje (Marsisa)', clasico: 'operaciones/marsisa-ordenes-viaje', icon: Route, permissions: ver('op_ordenes_viaje', 'op_programacion', 'guias_remision', 'op_guias_remision'), soloEmpresa: 'marsisa' },
      {
        key: 'marsisa-combustible-grupo', label: 'Combustible Marsisa', icon: Fuel, permissions: [], soloEmpresa: 'marsisa',
        children: [
          { key: 'marsisa-vales', label: 'Vales de combustible', to: '/operaciones/marsisa-vales', icon: Fuel, permissions: ver('combustible_vales', 'combustible'), soloEmpresa: 'marsisa' },
          { key: 'marsisa-matriz', label: 'Matriz de combustible (D2)', to: '/operaciones/matriz-combustible', icon: Target, permissions: ver('combustible_analisis', 'combustible'), soloEmpresa: 'marsisa' },
          { key: 'marsisa-analisis', label: 'Análisis de combustible (D2)', to: '/operaciones/analisis-combustible', icon: Gauge, permissions: ver('combustible_analisis', 'combustible'), soloEmpresa: 'marsisa' },
          { key: 'marsisa-urea', label: 'Análisis de urea', to: '/operaciones/urea', icon: Droplet, permissions: ver('urea_analisis', 'combustible_analisis', 'combustible'), soloEmpresa: 'marsisa' },
        ],
      },
    ],
  },
  {
    title: 'Flota',
    items: [
      { key: 'placas', label: 'Placas', to: '/placas', icon: Truck, permissions: ver('placas') },
      { key: 'disponibilidad', label: 'Disponibilidad', to: '/flota/disponibilidad', icon: Gauge, permissions: ver('disponibilidad') },
      { key: 'ubicacion', label: 'GPS', to: '/flota/ubicacion', icon: MapPin, permissions: ver('gps') },
      { key: 'documentos', label: 'Documentos', to: '/flota/documentos', icon: FileText, permissions: ver('docs_flota') },
      { key: 'entrega', label: 'Entrega de vehículos', to: '/flota/entrega-vehiculos', icon: ClipboardList, permissions: ver('entrega_vehiculos', 'seguridad_unidades', 'seg_unidades', 'placas') },
      { key: 'almacen-flota', label: 'Almacén de flota', to: '/flota/almacen-flota', icon: Warehouse, permissions: ver('inv', 'sal_inv', 'ent_inv') },
      { key: 'checklist', label: 'Reporte de fallas', to: '/flota/checklist', icon: ClipboardCheck, permissions: ver('checklist') },
    ],
  },
  {
    title: 'Mantenimiento',
    items: [
      { key: 'mant-dashboard', label: 'Dashboard mantenimiento', to: '/mantenimiento/dashboard', icon: LayoutDashboard, permissions: ver('mant_dashboard', 'dashboard', 'status_rampa', 'checklist') },
      { key: 'status-rampa', label: 'Status de rampa', clasico: 'mantenimiento/status-rampa', icon: Wrench, permissions: ver('status_rampa') },
      { key: 'inspecciones', label: 'Análisis de inspecciones', to: '/inspecciones', icon: ClipboardList, permissions: ver('insp') },
      { key: 'fleetrun', label: 'Mantenimiento preventivo (Fleetrun)', to: '/mantenimiento/fleetrun', icon: Gauge, permissions: ver('fleetrun', 'fleet') },
      { key: 'reportes-ot', label: 'Reportes OT', clasico: 'mantenimiento/reportes-ot', icon: ScrollText, permissions: ver('reportes_ot', 'ot') },
      { key: 'trabajos-ot', label: 'Historial de trabajos', to: '/mantenimiento/trabajos-ot', icon: History, permissions: ver('trabajos_ot') },
      { key: 'ingresos-taller', label: 'Ingresos a taller', to: '/mantenimiento/ingresos-taller', icon: BarChart3, permissions: ver('mant_dashboard', 'reportes_ot', 'ot') },
      {
        key: 'neumaticos-grupo', label: 'Neumáticos', icon: Disc3, permissions: [],
        children: [
          { key: 'neumaticos-analisis', label: 'Análisis de neumáticos', to: '/mantenimiento/neumaticos-analisis', icon: Disc3, permissions: ver('neumaticos') },
          { key: 'neumaticos', label: 'Últimas inspecciones', to: '/mantenimiento/neumaticos-ultimas', icon: Clock, permissions: ver('neumaticos') },
        ],
      },
      { key: 'incidencias', label: 'Incidencias en ruta', to: '/mantenimiento/incidencias', icon: ShieldCheck, permissions: ver('incidencias_ruta') },
      {
        key: 'mant-otros-grupo', label: 'Otros (hub de mantenimiento avanzado)', icon: Layers, permissions: [],
        children: [
          { key: 'planificacion', label: 'Planificación de mantenimientos', to: '/mantenimiento/planificacion', icon: CalendarDays, permissions: ver('plan') },
          { key: 'backlog', label: 'Backlog pendientes', to: '/mantenimiento/reportes-ot?tab=backlog', icon: Hourglass, permissions: ver('mant_dashboard', 'trabajos_ot') },
          { key: 'kpis', label: 'Métricas y KPIs', clasico: 'mantenimiento/kpis-taller', icon: Activity, permissions: ver('mant_dashboard') },
          { key: 'productividad', label: 'Productividad personal', clasico: 'mantenimiento/productividad', icon: HardHat, permissions: ver('pers_mant', 'mant_dashboard') },
          { key: 'finanzas-taller', label: 'Reporte financiero', clasico: 'mantenimiento/finanzas-taller', icon: Wallet, permissions: ver('mant_dashboard') },
          { key: 'frecuencias-mp', label: 'Frecuencias MP', clasico: 'mantenimiento/configuracion-mp', icon: Settings, permissions: ver('cfg_mant') },
          { key: 'kits-mp', label: 'Kits MP', to: '/mantenimiento/kits-mp', icon: Package, permissions: ver('cfg_mant') },
          { key: 'tipos-mp', label: 'Tipos MP', to: '/mantenimiento/tipos-mp', icon: Wrench, permissions: ver('cfg_mant') },
          { key: 'fleetrun-config', label: 'Umbrales Fleetrun', to: '/mantenimiento/fleetrun-config', icon: Gauge, permissions: ver('cfg_fleetrun') },
          { key: 'config-metrica', label: 'Config. métrica', clasico: 'mantenimiento/config-metrica', icon: Target, permissions: ver('cfg_mant') },
        ],
      },
    ],
  },
  {
    title: 'Almacén',
    items: [
      { key: 'almacen-dashboard', label: 'Dashboard financiero', clasico: 'almacen/dashboard-financiero', icon: BarChart3, permissions: ver('inv') },
      { key: 'almacen-costos', label: 'Costos de almacén', clasico: 'almacen/costos', icon: Boxes, permissions: ver('inv') },
      { key: 'inventario', label: 'Inventario', clasico: 'almacen/inventario', icon: Boxes, permissions: ver('inv') },
      { key: 'entradas', label: 'Órdenes de compra', clasico: 'almacen/entradas', icon: PackagePlus, permissions: ver('ent_inv') },
      { key: 'recepcion', label: 'Recepción de compras', clasico: 'almacen/recepcion-compras', icon: PackagePlus, permissions: ver('rec_compras', 'ent_inv', 'inv') },
      { key: 'salidas', label: 'Órdenes de salida', to: '/almacen/salidas', icon: PackageMinus, permissions: ver('sal_inv') },
      { key: 'kardex', label: 'Kardex', clasico: 'almacen/kardex', icon: History, permissions: ver('kardex') },
      { key: 'proveedores', label: 'Proveedores', clasico: 'almacen/proveedores', icon: Warehouse, permissions: ver('prov_inv') },
      {
        key: 'almacen-otros-grupo', label: 'Otros (catálogos de almacén)', icon: Layers, permissions: [],
        children: [
          { key: 'almacenes', label: 'Almacenes y sucursales', to: '/almacen/almacenes', icon: Building2, permissions: ver('cfg_almacen', 'inv') },
          { key: 'familias', label: 'Familias', to: '/almacen/familias', icon: Layers, permissions: ver('cfg_familias') },
          { key: 'unidades', label: 'Unidades de medida', to: '/almacen/unidades', icon: Ruler, permissions: ver('cfg_unidades') },
          { key: 'sistemas', label: 'Sistemas de vehículos', to: '/almacen/sistemas', icon: Cog, permissions: ver('cfg_sistemas') },
          { key: 'marcas', label: 'Marcas', to: '/almacen/marcas', icon: Tag, permissions: ver('cfg_marcas') },
          { key: 'almacen-kits-mp', label: 'Kits MP', to: '/mantenimiento/kits-mp', icon: Package, permissions: ver('cfg_mant', 'inv') },
        ],
      },
    ],
  },
  {
    title: 'Gerencia',
    items: [
      { key: 'aprobaciones-oc', label: 'Aprobación de O/C', clasico: 'gerencia/aprobaciones-oc', icon: ClipboardCheck, permissions: ver('gerencia'), badge: 'aprob-oc' },
      { key: 'aprobaciones-caja', label: 'Aprobación de caja', clasico: 'gerencia/aprobaciones-caja', icon: ClipboardCheck, permissions: ver('gerencia'), badge: 'aprob-caja' },
    ],
  },
  {
    title: 'RRHH',
    items: [
      { key: 'personal', label: 'Gestión de personal', to: '/directorio/personal', icon: Contact, permissions: ver('rrhh_personal') },
      { key: 'asistencia', label: 'Asistencia y turnos', clasico: 'rrhh/asistencia', icon: ClipboardCheck, permissions: ver('rrhh_asistencia') },
      { key: 'nomina', label: 'Nómina y pagos', clasico: 'rrhh/nomina', icon: Banknote, permissions: ver('rrhh_nomina') },
    ],
  },
  {
    title: 'Tesorería',
    items: [
      { key: 'caja', label: 'Caja', clasico: 'tesoreria/caja', icon: Banknote, permissions: ver('tesoreria_caja') },
      { key: 'pago-requerimientos', label: 'Pago de requerimientos', to: '/tesoreria/pago-requerimientos', icon: Wallet, permissions: ver('tesoreria_caja', 'tesoreria_pagos') },
      { key: 'movimientos', label: 'Movimientos', to: '/tesoreria/movimientos', icon: ArrowLeftRight, permissions: ver('tesoreria_caja', 'tesoreria_movimientos') },
      { key: 'liquidaciones', label: 'Liquidación de gastos', to: '/tesoreria/liquidaciones', icon: ScrollText, permissions: ver('tesoreria_liquidaciones') },
      { key: 'cuentas', label: 'Cuentas por cobrar y pagar', clasico: 'tesoreria/cuentas', icon: FileText, permissions: ver('tesoreria_cuentas') },
      { key: 'bancos', label: 'Bancos', clasico: 'tesoreria/bancos', icon: Landmark, permissions: ver('tesoreria_bancos', 'tesoreria_caja') },
      { key: 'centros-costos', label: 'Centros de costos', clasico: 'tesoreria/centros-costos', icon: Boxes, permissions: ver('tesoreria_centros_costos', 'tesoreria_caja') },
      { key: 'flujo-caja', label: 'Flujo de caja', clasico: 'tesoreria/flujo-caja', icon: BarChart3, permissions: ver('tesoreria_caja') },
    ],
  },
  {
    title: 'Conductor',
    items: [
      { key: 'conductor-portal', label: 'Mi viaje y rendición', clasico: 'operaciones/conductor-portal', icon: IdCard, permissions: ver('conductor_portal') },
    ],
  },
  {
    title: 'Seguridad',
    items: [
      { key: 'seg-unidades', label: 'Checklist "Unidades"', clasico: 'seguridad/unidades', icon: ShieldCheck, permissions: ver('seguridad_unidades', 'seg_unidades', 'seg_checklist') },
      { key: 'seg-status', label: 'Status "Unidades en Base"', clasico: 'seguridad/unidades-base', icon: MapPin, permissions: ver('seguridad_unidades', 'seg_unidades') },
    ],
  },
  {
    title: 'Directorio',
    items: [
      { key: 'conductores', label: 'Personal (conductores)', to: '/conductores', icon: IdCard, permissions: ver('cond') },
      { key: 'clientes', label: 'Clientes', clasico: 'directorio/clientes', icon: Users, permissions: ver('clientes') },
    ],
  },
  {
    title: 'Configuración',
    items: [
      { key: 'usuarios', label: 'Usuarios', clasico: 'sistema/usuarios', icon: UserCog, permissions: ver('usuarios') },
      { key: 'superadmin', label: 'Empresas SaaS (SuperAdmin)', clasico: 'sistema/superadmin', icon: Building2, permissions: ver('administracion') },
      { key: 'auditoria', label: 'Auditoría', clasico: 'sistema/auditoria', icon: History, permissions: ver('mod_auditoria') },
      { key: 'api-gateway', label: 'API y desarrolladores', to: '/sistema/api', icon: Code, permissions: ver('administracion') },
      { key: 'empresa', label: 'Empresa', to: '/sistema/empresa', icon: Building2, permissions: ver('administracion', 'cfg_empresa') },
      { key: 'notificaciones', label: 'Notificaciones', to: '/sistema/notificaciones', icon: Bell, permissions: ver('administracion') },
      { key: 'apariencia', label: 'Apariencia', to: '/perfil', icon: Palette, permissions: [] },
      { key: 'accesibilidad', label: 'Accesibilidad e idioma', to: '/sistema/accesibilidad', icon: Accessibility, permissions: [] },
      { key: 'integraciones', label: 'Integraciones', clasico: 'sistema/integraciones', icon: Cog, permissions: ver('integraciones', 'administracion') },
    ],
  },
];

// Pantallas que declara cada módulo en src/modules/<modulo>/rutas.ts (ver personal/rutas.tipos.ts).
// Si su `key` ya está en el menú, la pantalla pasa de la versión actual a la nueva. Las que no están
// en el modelo no se agregan al menú (siguen accesibles desde sus propios enlaces).
const MODULOS = import.meta.glob<{ RUTAS?: RutaModulo[] }>('../../modules/*/rutas.{ts,tsx}', { eager: true });
export const RUTAS_MODULOS: RutaModulo[] = Object.values(MODULOS).flatMap(m => m.RUTAS ?? []);

function aplanar(items: NavItem[]): NavItem[] {
  return items.flatMap(i => [i, ...(i.children ? aplanar(i.children) : [])]);
}

function conModulos(base: NavSection[]): NavSection[] {
  const secciones = base.map(s => ({ ...s, items: [...s.items] }));
  const todos = aplanar(secciones.flatMap(s => s.items));
  for (const r of RUTAS_MODULOS) {
    const n = r.nav;
    if (!n?.to) continue;
    const existente = todos.find(i => i.key === n.key && !i.children);
    if (!existente) continue;
    existente.to = n.to;
    existente.clasico = undefined;
    existente.permissions = n.permisos;
    existente.soloEmpresa = n.soloEmpresa ?? existente.soloEmpresa;
  }
  return secciones;
}

export const NAV_SECTIONS: NavSection[] = conModulos(SECCIONES_BASE);

const empresaDelDominio = () => (typeof window === 'undefined' ? '' : window.location.hostname.split('.')[0].toLowerCase());

export const ALL_NAV_ITEMS = aplanar(NAV_SECTIONS.flatMap(s => s.items));

// Quita lo que el usuario no puede ver. Un grupo solo aparece si le queda alguna opción visible.
function filtrarItems(items: NavItem[], can: (...p: string[]) => boolean, empresa: string): NavItem[] {
  return items
    .map(i => (i.children ? { ...i, children: filtrarItems(i.children, can, empresa) } : i))
    .filter(i => {
      if (i.children && i.children.length === 0) return false;
      if (i.soloEmpresa && !empresa.includes(i.soloEmpresa)) return false;
      if (i.noEmpresa && empresa.includes(i.noEmpresa)) return false;
      return can(...i.permissions);
    });
}

export function visibleSections(can: (...p: string[]) => boolean): NavSection[] {
  const empresa = empresaDelDominio();
  return NAV_SECTIONS
    .map(s => ({ ...s, items: filtrarItems(s.items, can, empresa) }))
    .filter(s => s.items.length > 0);
}

/** Abre una pantalla de la versión actual en esta misma pestaña, con la misma sesión */
export function abrirClasico(ruta: string) {
  try { sessionStorage.setItem('fleet_rutaActual', ruta); } catch { /* sin almacenamiento */ }
  // La ruta va en el hash con barra (#sistema/perfil): la versión actual la abre directo, sin depender de sessionStorage
  window.location.assign(`/#${ruta}`);
}

// Pestañas inferiores en el celular: solo pantallas de la app nueva (el resto, en "Más").
export function mobileTabs(can: (...p: string[]) => boolean): NavItem[] {
  return ALL_NAV_ITEMS.filter(i => i.to && can(...i.permissions)).slice(0, 3);
}

/** Primera pantalla de la app nueva a la que puede entrar el usuario */
export function homePath(can: (...p: string[]) => boolean) {
  return ALL_NAV_ITEMS.find(i => i.to && can(...i.permissions))?.to ?? '/perfil';
}

export function findNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find(i => i.to && (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)));
}
