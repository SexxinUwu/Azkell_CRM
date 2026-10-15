// Catálogo de permisos por módulo: mismas claves que usa la versión actual (modulos/sistema/usuarios/logica.js).
// lcad = el módulo tiene las cuatro acciones (l ver, c crear, e editar, d eliminar); si no, solo "ver".
export interface ModuloPermiso {
  grupo: string;
  key: string;
  nombre: string;
  desc: string;
  lcad: boolean;
}

export const MODULOS_PERMISO: ModuloPermiso[] = [
  { grupo: 'DASHBOARD', key: 'dashboard', nombre: 'Dashboard Principal', desc: 'Vista ejecutiva y métricas generales', lcad: false },
  { grupo: 'FLOTA', key: 'disponibilidad', nombre: 'Disponibilidad', desc: 'Disponibilidad operativa', lcad: true },
  { grupo: 'FLOTA', key: 'gps', nombre: 'GPS / Ubicación', desc: 'Visualización en tiempo real', lcad: false },
  { grupo: 'FLOTA', key: 'docs_flota', nombre: 'Documentos Flota', desc: 'Control documentario', lcad: true },
  { grupo: 'FLOTA', key: 'placas', nombre: 'Maestro de Placas', desc: 'Configuración técnica de unidades', lcad: true },
  { grupo: 'FLOTA', key: 'entrega_vehiculos', nombre: 'Entrega de Vehículos', desc: 'Actas de entrega y recepción de flota', lcad: true },
  { grupo: 'FLOTA', key: 'checklist', nombre: 'Reporte de Fallas', desc: 'Checklist y reportes de falla de unidades', lcad: true },
  { grupo: 'MANTENIMIENTO', key: 'mant_dashboard', nombre: 'Dashboard Mantenimiento', desc: 'Centro de comando de taller e inspecciones', lcad: true },
  { grupo: 'MANTENIMIENTO', key: 'status_rampa', nombre: 'Status Rampa', desc: 'Gestión visual en taller', lcad: true },
  { grupo: 'MANTENIMIENTO', key: 'insp', nombre: 'Análisis de Inspecciones', desc: 'Registro de inspecciones', lcad: true },
  { grupo: 'MANTENIMIENTO', key: 'fleet', nombre: 'Mantenimiento Preventivo', desc: 'Datos operativos de la flota', lcad: true },
  { grupo: 'MANTENIMIENTO', key: 'reportes_ot', nombre: 'Reportes OT', desc: 'Métricas de mantenimiento', lcad: true },
  { grupo: 'MANTENIMIENTO', key: 'trabajos_ot', nombre: 'Historial de Trabajos', desc: 'Gestión de técnicos', lcad: true },
  { grupo: 'MANTENIMIENTO', key: 'neumaticos', nombre: 'Neumáticos', desc: 'Control e inspección de llantas', lcad: true },
  { grupo: 'MANTENIMIENTO', key: 'incidencias_ruta', nombre: 'Incidencias en Ruta', desc: 'Reportes e incidencias de auxilio en ruta', lcad: true },
  { grupo: 'MANTENIMIENTO', key: 'otros_mant', nombre: 'Otros (Catálogos y Parámetros)', desc: 'Hub de mantenimiento, plan, KPIs y configuraciones MP', lcad: true },
  { grupo: 'ALMACÉN', key: 'dash_alm', nombre: 'Dashboard Financiero', desc: 'Analítica de almacén', lcad: true },
  { grupo: 'ALMACÉN', key: 'inv', nombre: 'Inventario', desc: 'Catálogo de artículos', lcad: true },
  { grupo: 'ALMACÉN', key: 'ent_inv', nombre: 'Órdenes de Compra', desc: 'Ingresos al almacén', lcad: true },
  { grupo: 'ALMACÉN', key: 'rec_compras', nombre: 'Recepción de Compras', desc: 'Recepción e ingreso de compras aprobadas', lcad: true },
  { grupo: 'ALMACÉN', key: 'sal_inv', nombre: 'Órdenes de Salida', desc: 'Egresos del almacén', lcad: true },
  { grupo: 'ALMACÉN', key: 'kardex', nombre: 'Kardex', desc: 'Movimientos por artículo', lcad: false },
  { grupo: 'ALMACÉN', key: 'prov_inv', nombre: 'Proveedores', desc: 'Directorio de proveedores', lcad: true },
  { grupo: 'ALMACÉN', key: 'almacen_otros', nombre: 'Otros (Catálogos)', desc: 'Almacenes, familias, unidades, sistemas y marcas', lcad: true },
  { grupo: 'GERENCIA', key: 'gerencia_aprobaciones_oc', nombre: 'Aprobación de O/C', desc: 'Aprobación y autorización de órdenes de compra', lcad: true },
  { grupo: 'GERENCIA', key: 'gerencia_aprobaciones_caja', nombre: 'Aprobación de Caja', desc: 'Aprobación de vales y gastos de caja', lcad: true },
  { grupo: 'DIRECTORIO', key: 'cond', nombre: 'Personal', desc: 'Directorio de personal', lcad: true },
  { grupo: 'DIRECTORIO', key: 'clientes', nombre: 'Clientes', desc: 'Directorio de clientes', lcad: true },
  { grupo: 'OPERACIONES', key: 'op_programacion', nombre: 'Programación', desc: 'Planificación de vehículos y clientes', lcad: true },
  { grupo: 'OPERACIONES', key: 'op_ordenes_viaje', nombre: 'Órdenes de Viaje', desc: 'Asignación de viajes, tramos y fletes', lcad: true },
  { grupo: 'OPERACIONES', key: 'op_ordenes_servicio', nombre: 'Órdenes de Servicio', desc: 'Servicios de carga y facturación', lcad: true },
  { grupo: 'OPERACIONES', key: 'op_guias_remision', nombre: 'Guías de Remisión', desc: 'Control de guías y carga SUNAT', lcad: true },
  { grupo: 'OPERACIONES', key: 'op_reporte_viajes', nombre: 'Reporte de Viajes', desc: 'Reportes consolidados de viajes', lcad: true },
  { grupo: 'OPERACIONES', key: 'combustible_vales', nombre: 'Vales de Combustible', desc: 'Control y sincronización de vales', lcad: true },
  { grupo: 'OPERACIONES', key: 'combustible_analisis', nombre: 'Análisis de Combustible (D2)', desc: 'Tabla dinámica por viaje y rendimiento D2', lcad: true },
  { grupo: 'OPERACIONES', key: 'urea_analisis', nombre: 'Análisis de Urea', desc: 'Tabla dinámica por viaje y consumo Urea', lcad: true },
  { grupo: 'OPERACIONES', key: 'combustible_matriz', nombre: 'Matriz de Combustible', desc: 'Matriz de asignación y consumo', lcad: true },
  { grupo: 'CONDUCTOR', key: 'conductor_portal', nombre: 'Portal del Conductor', desc: 'Mi Viaje, ruta activa y rendición de gastos', lcad: true },
  { grupo: 'RRHH', key: 'rrhh_personal', nombre: 'Gestión Personal', desc: 'Legajos y contratos', lcad: true },
  { grupo: 'RRHH', key: 'rrhh_asistencia', nombre: 'Asistencia', desc: 'Tareo y control de asistencia', lcad: true },
  { grupo: 'RRHH', key: 'rrhh_nomina', nombre: 'Nómina y Pagos', desc: 'Gestión de pagos y nómina', lcad: true },
  { grupo: 'TESORERÍA', key: 'tesoreria_caja', nombre: 'Caja', desc: 'Movimientos de caja, ingresos y egresos', lcad: true },
  { grupo: 'TESORERÍA', key: 'tesoreria_pago_req', nombre: 'Pago de Requerimientos', desc: 'Pagos de órdenes de compra autorizadas', lcad: true },
  { grupo: 'TESORERÍA', key: 'tesoreria_movimientos', nombre: 'Movimientos', desc: 'Control de ingresos y egresos bancarios', lcad: true },
  { grupo: 'TESORERÍA', key: 'tesoreria_liquidaciones', nombre: 'Liquidación de Gastos', desc: 'Auditoría de gastos operativos de viaje', lcad: true },
  { grupo: 'TESORERÍA', key: 'tesoreria_cuentas', nombre: 'Cuentas Cobrar/Pagar', desc: 'Facturación y créditos', lcad: true },
  { grupo: 'TESORERÍA', key: 'tesoreria_bancos', nombre: 'Bancos', desc: 'Cuentas bancarias de la empresa', lcad: true },
  { grupo: 'TESORERÍA', key: 'tesoreria_centros_costos', nombre: 'Centros de Costos', desc: 'Distribución y centros analíticos', lcad: true },
  { grupo: 'SEGURIDAD', key: 'seguridad_unidades', nombre: 'CheckList Unidades', desc: 'Fichas y control de ingreso/salida', lcad: true },
  { grupo: 'SEGURIDAD', key: 'unidades_base', nombre: 'Unidades en Base', desc: 'Status y control de unidades en base', lcad: true },
  { grupo: 'CONFIGURACIÓN', key: 'usuarios', nombre: 'Usuarios y Roles', desc: 'Gestión de accesos y seguridad', lcad: true },
  { grupo: 'CONFIGURACIÓN', key: 'mod_auditoria', nombre: 'Auditoría', desc: 'Bitácora de actividad global', lcad: true },
  { grupo: 'CONFIGURACIÓN', key: 'integraciones', nombre: 'Integraciones', desc: 'Wialon, Fleetrun, WhatsApp y Webhooks', lcad: true },
];

/** Colores que ofrece la versión actual para el rol */
export const COLORES_ROL = ['#5865F2', '#57F287', '#1ABC9C', '#3498DB', '#E67E22', '#9B59B6', '#ED4245', '#EB459E', '#F1C40F', '#95A5A6'];
