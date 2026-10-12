// Navegación de Azkell Fleet, agrupada por proceso.
//
// Mientras dure la migración, cada pantalla es de uno de dos tipos:
//   - nueva   (`to`):     ruta de la app nueva, registrada en src/App.tsx
//   - actual  (`clasico`): ruta de la versión actual (cargarModuloAislado). Se abre en la app
//                         actual con la misma sesión. Al migrar una pantalla, se cambia `clasico` por `to`.
//
// Permisos: 'clave.ver' según la matriz de permisos actual (ver core/auth/permisos.ts y la
// visibilidad de la barra lateral en logica.js). Los administradores ven todo.
import {
  Banknote, Boxes, ClipboardCheck, ClipboardList, Disc3, FileText, Fuel, Gauge, History, House, IdCard, LayoutDashboard,
  type LucideIcon, MapPin, PackageMinus, PackagePlus, Route, ScrollText, ShieldCheck, Truck, UserCog, Users, Warehouse, Wrench,
} from 'lucide-react';

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
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const ver = (...claves: string[]) => claves.map(c => `${c}.ver`);

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Gerencia',
    items: [
      { key: 'inicio', label: 'Inicio', to: '/', icon: House, permissions: [] },
      { key: 'dashboard', label: 'Centro de Comando', clasico: 'dashboard', icon: LayoutDashboard, permissions: ver('dashboard', 'dash') },
      { key: 'aprobaciones-oc', label: 'Aprobación de compras', clasico: 'gerencia/aprobaciones-oc', icon: ClipboardCheck, permissions: ver('gerencia') },
      { key: 'aprobaciones-caja', label: 'Aprobación de caja', clasico: 'gerencia/aprobaciones-caja', icon: ClipboardCheck, permissions: ver('gerencia') },
    ],
  },
  {
    title: 'Flota',
    items: [
      { key: 'placas', label: 'Placas', clasico: 'flota/placas', icon: Truck, permissions: ver('placas') },
      { key: 'disponibilidad', label: 'Disponibilidad', clasico: 'flota/disponibilidad', icon: Gauge, permissions: ver('disponibilidad') },
      { key: 'ubicacion', label: 'Ubicación GPS', clasico: 'flota/ubicacion', icon: MapPin, permissions: ver('gps') },
      { key: 'documentos', label: 'Documentos', clasico: 'flota/documentos', icon: FileText, permissions: ver('docs_flota') },
      { key: 'entrega', label: 'Entrega de vehículos', clasico: 'flota/entrega-vehiculos', icon: ClipboardList, permissions: ver('entrega_vehiculos', 'seguridad_unidades', 'seg_unidades', 'placas') },
    ],
  },
  {
    title: 'Mantenimiento',
    items: [
      { key: 'mant-dashboard', label: 'Resumen de taller', clasico: 'mantenimiento/dashboard', icon: LayoutDashboard, permissions: ver('mant_dashboard', 'dashboard', 'status_rampa', 'checklist') },
      { key: 'status-rampa', label: 'Status de rampa', clasico: 'mantenimiento/status-rampa', icon: Wrench, permissions: ver('status_rampa') },
      { key: 'reportes-ot', label: 'Órdenes de trabajo', clasico: 'mantenimiento/reportes-ot', icon: ScrollText, permissions: ver('reportes_ot', 'ot') },
      { key: 'trabajos-ot', label: 'Trabajos de OT', clasico: 'mantenimiento/trabajos-ot', icon: Wrench, permissions: ver('trabajos_ot') },
      { key: 'checklist', label: 'Checklist', clasico: 'mantenimiento/checklist', icon: ClipboardCheck, permissions: ver('checklist') },
      { key: 'inspecciones', label: 'Inspecciones', clasico: 'mantenimiento/inspecciones', icon: ClipboardList, permissions: ver('insp') },
      { key: 'fleetrun', label: 'Fleetrun', clasico: 'mantenimiento/fleetrun', icon: Gauge, permissions: ver('fleetrun', 'fleet') },
      { key: 'neumaticos', label: 'Neumáticos', clasico: 'mantenimiento/neumaticos-ultimas', icon: Disc3, permissions: ver('neumaticos') },
      { key: 'planificacion', label: 'Planificación', clasico: 'mantenimiento/planificacion', icon: History, permissions: ver('plan') },
      { key: 'incidencias', label: 'Incidencias en ruta', clasico: 'mantenimiento/incidencias-ruta', icon: ShieldCheck, permissions: ver('incidencias_ruta') },
    ],
  },
  {
    title: 'Almacén',
    items: [
      { key: 'inventario', label: 'Inventario', clasico: 'almacen/inventario', icon: Boxes, permissions: ver('inv') },
      { key: 'entradas', label: 'Entradas', clasico: 'almacen/entradas', icon: PackagePlus, permissions: ver('ent_inv') },
      { key: 'recepcion', label: 'Recepción de compras', clasico: 'almacen/recepcion-compras', icon: PackagePlus, permissions: ver('rec_compras', 'ent_inv', 'inv') },
      { key: 'salidas', label: 'Salidas', clasico: 'almacen/salidas', icon: PackageMinus, permissions: ver('sal_inv') },
      { key: 'kardex', label: 'Kardex', clasico: 'almacen/kardex', icon: History, permissions: ver('kardex') },
      { key: 'proveedores', label: 'Proveedores', clasico: 'almacen/proveedores', icon: Warehouse, permissions: ver('prov_inv') },
    ],
  },
  {
    title: 'Operaciones',
    items: [
      { key: 'programacion', label: 'Programación', clasico: 'operaciones/programacion', icon: Route, permissions: ver('op_programacion', 'op_guias_remision', 'guias_remision') },
      { key: 'ordenes-viaje', label: 'Órdenes de viaje', clasico: 'operaciones/ordenes-viaje', icon: Route, permissions: ver('op_ordenes_viaje', 'op_programacion', 'guias_remision', 'op_guias_remision') },
      { key: 'marsisa-ordenes-viaje', label: 'Órdenes de viaje Marsisa', clasico: 'operaciones/marsisa-ordenes-viaje', icon: Route, permissions: ver('op_ordenes_viaje', 'op_programacion', 'guias_remision', 'op_guias_remision'), soloEmpresa: 'marsisa' },
      { key: 'ordenes-servicio', label: 'Órdenes de servicio', clasico: 'operaciones/ordenes-servicio', icon: ScrollText, permissions: ver('op_ordenes_servicio', 'op_ordenes_viaje', 'op_programacion', 'guias_remision') },
      { key: 'vales', label: 'Vales de combustible', clasico: 'operaciones/combustible-vales', icon: Fuel, permissions: ver('combustible_vales', 'combustible') },
      { key: 'marsisa-vales', label: 'Vales de combustible Marsisa', clasico: 'operaciones/marsisa-combustible-vales', icon: Fuel, permissions: ver('combustible_vales', 'combustible'), soloEmpresa: 'marsisa' },
      { key: 'analisis-combustible', label: 'Análisis de combustible', clasico: 'operaciones/combustible-analisis', icon: Gauge, permissions: ver('combustible_analisis', 'combustible') },
      { key: 'urea', label: 'Análisis de urea', clasico: 'operaciones/urea-analisis', icon: Gauge, permissions: ver('urea_analisis', 'combustible_analisis', 'combustible') },
      { key: 'guias-remitente', label: 'Guías de remitente', clasico: 'operaciones/guia-remitente', icon: FileText, permissions: ver('op_guias_remision', 'guias_remision') },
      { key: 'guias-transportista', label: 'Guías de transportista', clasico: 'operaciones/guia-transportista', icon: FileText, permissions: ver('op_guias_remision', 'guias_remision') },
    ],
  },
  {
    title: 'Directorio',
    items: [
      { key: 'conductores', label: 'Conductores', clasico: 'directorio/conductores', icon: IdCard, permissions: ver('cond') },
      { key: 'clientes', label: 'Clientes', clasico: 'directorio/clientes', icon: Users, permissions: ver('clientes') },
    ],
  },
  {
    title: 'Tesorería',
    items: [
      { key: 'caja', label: 'Caja', clasico: 'tesoreria/caja', icon: Banknote, permissions: ver('tesoreria_caja') },
      { key: 'liquidaciones', label: 'Liquidaciones', clasico: 'tesoreria/liquidaciones', icon: ScrollText, permissions: ver('tesoreria_liquidaciones') },
      { key: 'cuentas', label: 'Cuentas por cobrar', clasico: 'tesoreria/cuentas', icon: FileText, permissions: ver('tesoreria_cuentas') },
      { key: 'bancos', label: 'Bancos', clasico: 'tesoreria/bancos', icon: Banknote, permissions: ver('tesoreria_bancos', 'tesoreria_caja') },
      { key: 'centros-costos', label: 'Centros de costos', clasico: 'tesoreria/centros-costos', icon: Boxes, permissions: ver('tesoreria_centros_costos', 'tesoreria_caja') },
    ],
  },
  {
    title: 'Personas y seguridad',
    items: [
      { key: 'personal', label: 'Personal', clasico: 'rrhh/personal', icon: Users, permissions: ver('rrhh_personal') },
      { key: 'asistencia', label: 'Asistencia', clasico: 'rrhh/asistencia', icon: ClipboardCheck, permissions: ver('rrhh_asistencia') },
      { key: 'nomina', label: 'Nómina', clasico: 'rrhh/nomina', icon: Banknote, permissions: ver('rrhh_nomina') },
      { key: 'seg-unidades', label: 'Garita: unidades', clasico: 'seguridad/unidades', icon: ShieldCheck, permissions: ver('seguridad_unidades', 'seg_unidades', 'seg_checklist') },
      { key: 'conductor-portal', label: 'Portal del conductor', clasico: 'operaciones/conductor-portal', icon: IdCard, permissions: ver('conductor_portal') },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { key: 'usuarios', label: 'Usuarios y roles', clasico: 'sistema/usuarios', icon: UserCog, permissions: ver('usuarios') },
      { key: 'auditoria', label: 'Auditoría', clasico: 'sistema/auditoria', icon: History, permissions: ver('mod_auditoria') },
    ],
  },
];

const empresaDelDominio = () => (typeof window === 'undefined' ? '' : window.location.hostname.split('.')[0].toLowerCase());

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items);

export function visibleSections(can: (...p: string[]) => boolean): NavSection[] {
  const empresa = empresaDelDominio();
  return NAV_SECTIONS
    .map(s => ({ ...s, items: s.items.filter(i => can(...i.permissions) && (!i.soloEmpresa || empresa.includes(i.soloEmpresa))) }))
    .filter(s => s.items.length > 0);
}

/** Abre una pantalla de la versión actual en esta misma pestaña, con la misma sesión */
export function abrirClasico(ruta: string) {
  try { sessionStorage.setItem('fleet_rutaActual', ruta); } catch { /* sin almacenamiento */ }
  window.location.assign('/');
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
