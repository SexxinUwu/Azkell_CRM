// Convierte el esquema leído con `prisma db pull` (un solo archivo, nombres de tabla)
// en prisma/schema/<modulo>.prisma con modelos en singular y mayúscula + @@map a la tabla real.
// Las columnas conservan su nombre actual (convención acordada mientras convive la versión actual).
//
// Uso: node scripts/prisma_por_modulo.js <schema-pull.prisma> <carpeta-salida>
const fs = require('fs');
const path = require('path');

// tabla → [módulo, Modelo]
const TABLAS = {
  // Sistema
  usuarios: ['sistema', 'Usuario'], roles: ['sistema', 'Rol'], sesiones_activas: ['sistema', 'SesionActiva'],
  auditoria: ['sistema', 'Auditoria'], api_keys: ['sistema', 'ApiKey'], api_logs: ['sistema', 'ApiLog'],
  integraciones_api: ['sistema', 'IntegracionApi'], configuracion_erp: ['sistema', 'ConfiguracionErp'],
  configuracion_email: ['sistema', 'ConfiguracionEmail'], destinatarios_alertas: ['sistema', 'DestinatarioAlerta'],
  reportes_programaciones_email: ['sistema', 'ReporteProgramacionEmail'], secuencias: ['sistema', 'Secuencia'],
  // Directorio
  clientes: ['directorio', 'Cliente'], conductores: ['directorio', 'Conductor'],
  // Flota
  placas: ['flota', 'Placa'], placa_auditoria: ['flota', 'PlacaAuditoria'], documentos_flota: ['flota', 'DocumentoFlota'],
  flota_disponibilidad: ['flota', 'FlotaDisponibilidad'], status_flota: ['flota', 'StatusFlota'],
  vehiculos_flota: ['flota', 'VehiculoFlota'], configuracion_flota: ['flota', 'ConfiguracionFlota'],
  km_snapshots: ['flota', 'KmSnapshot'], cat_situaciones: ['flota', 'CatSituacion'],
  // Mantenimiento
  ordenes_trabajo: ['mantenimiento', 'OrdenTrabajo'], trabajos_ot: ['mantenimiento', 'TrabajoOt'],
  trabajos_ot_repuestos: ['mantenimiento', 'TrabajoOtRepuesto'], ot_backlog: ['mantenimiento', 'OtBacklog'],
  ot_materiales: ['mantenimiento', 'OtMaterial'], backlog_mantenimiento: ['mantenimiento', 'BacklogMantenimiento'],
  inspecciones: ['mantenimiento', 'Inspeccion'], mant_insp_templates: ['mantenimiento', 'MantInspTemplate'],
  checklist_config_sistemas: ['mantenimiento', 'ChecklistConfigSistema'], mant_incidencias_ruta: ['mantenimiento', 'MantIncidenciaRuta'],
  planificacion: ['mantenimiento', 'Planificacion'], requerimientos_planificacion: ['mantenimiento', 'RequerimientoPlanificacion'],
  tipos_mantenimiento: ['mantenimiento', 'TipoMantenimiento'], tipos_preventivo: ['mantenimiento', 'TipoPreventivo'],
  tp_mp: ['mantenimiento', 'TpMp'], mantenimiento_kits: ['mantenimiento', 'MantenimientoKit'],
  fleetrun: ['mantenimiento', 'Fleetrun'], taller_personal: ['mantenimiento', 'TallerPersonal'],
  taller_rampas: ['mantenimiento', 'TallerRampa'], cat_rampas: ['mantenimiento', 'CatRampa'],
  reportes_fallas: ['mantenimiento', 'ReporteFalla'],
  // Neumáticos
  neumaticos_hoja_vida: ['neumaticos', 'NeumaticoHojaVida'], neumaticos_inspecciones: ['neumaticos', 'NeumaticoInspeccion'],
  neumaticos_inspecciones_det: ['neumaticos', 'NeumaticoInspeccionDet'], neumaticos_rotaciones: ['neumaticos', 'NeumaticoRotacion'],
  cat_neumaticos_acciones: ['neumaticos', 'CatNeumaticoAccion'], cat_neumaticos_marcas: ['neumaticos', 'CatNeumaticoMarca'],
  cat_neumaticos_medidas: ['neumaticos', 'CatNeumaticoMedida'], cat_neumaticos_modelos: ['neumaticos', 'CatNeumaticoModelo'],
  // Almacén
  almacen_almacenes: ['almacen', 'Almacen'], almacen_familias: ['almacen', 'AlmacenFamilia'], almacen_marcas: ['almacen', 'AlmacenMarca'],
  almacen_sistemas: ['almacen', 'AlmacenSistema'], almacen_unidades: ['almacen', 'AlmacenUnidad'], inventario: ['almacen', 'Inventario'],
  entradas_inv: ['almacen', 'EntradaInv'], detalle_entradas_inv: ['almacen', 'DetalleEntradaInv'],
  salidas_inv: ['almacen', 'SalidaInv'], detalle_salidas_inv: ['almacen', 'DetalleSalidaInv'],
  proveedores_inv: ['almacen', 'ProveedorInv'], proveedor_marcas_inv: ['almacen', 'ProveedorMarcaInv'],
  proveedor_cuentas_bancarias: ['almacen', 'ProveedorCuentaBancaria'], configuracion_almacen: ['almacen', 'ConfiguracionAlmacen'],
  // Compras
  ordenes_compra: ['compras', 'OrdenCompra'], ordenes_compra_items: ['compras', 'OrdenCompraItem'],
  recepciones_oc: ['compras', 'RecepcionOc'], detalle_recepciones_oc: ['compras', 'DetalleRecepcionOc'],
  oc_approval_tokens: ['compras', 'OcApprovalToken'],
  // Operaciones
  operaciones_ordenes_viaje: ['operaciones', 'OrdenViaje'], operaciones_ordenes_viaje_rutas: ['operaciones', 'OrdenViajeRuta'],
  operaciones_ordenes_servicio: ['operaciones', 'OrdenServicio'], operaciones_ordenes_servicio_docs: ['operaciones', 'OrdenServicioDoc'],
  operaciones_ordenes_servicio_rutas: ['operaciones', 'OrdenServicioRuta'],
  marsisa_ordenes_viaje: ['operaciones', 'MarsisaOrdenViaje'], marsisa_ordenes_viaje_rutas: ['operaciones', 'MarsisaOrdenViajeRuta'],
  // Combustible
  combustible_vales: ['combustible', 'CombustibleVale'], operaciones_combustible_vales: ['combustible', 'OperacionCombustibleVale'],
  marsisa_combustible_vales: ['combustible', 'MarsisaCombustibleVale'], combustible_estaciones_proveedores: ['combustible', 'CombustibleEstacionProveedor'],
  combustible_matriz_d2: ['combustible', 'CombustibleMatrizD2'], combustible_auditoria_viajes: ['combustible', 'CombustibleAuditoriaViaje'],
  // Guías SUNAT
  guias_remision: ['guias', 'GuiaRemision'], guias_remision_items: ['guias', 'GuiaRemisionItem'],
  guias_remitente: ['guias', 'GuiaRemitente'], guias_transportista: ['guias', 'GuiaTransportista'], guias_items: ['guias', 'GuiaItem'],
  // Tesorería
  tesoreria_bancos: ['tesoreria', 'TesoreriaBanco'], tesoreria_caja: ['tesoreria', 'TesoreriaCaja'],
  tesoreria_centros_costos: ['tesoreria', 'TesoreriaCentroCosto'], tesoreria_cuentas: ['tesoreria', 'TesoreriaCuenta'],
  tesoreria_cuentas_historial_facturas: ['tesoreria', 'TesoreriaCuentaHistorialFactura'],
  tesoreria_liquidaciones_gastos: ['tesoreria', 'TesoreriaLiquidacionGasto'], tesoreria_motivos_gastos: ['tesoreria', 'TesoreriaMotivoGasto'],
  // RRHH
  rrhh_personal: ['rrhh', 'RrhhPersonal'], rrhh_licencias: ['rrhh', 'RrhhLicencia'],
  rrhh_sst_registros: ['rrhh', 'RrhhSstRegistro'], rrhh_tareo: ['rrhh', 'RrhhTareo'],
  // Seguridad
  seguridad: ['seguridad', 'Seguridad'], seg_asistencia: ['seguridad', 'SegAsistencia'],
  seg_checklist_templates: ['seguridad', 'SegChecklistTemplate'], seg_entrega_vehiculos: ['seguridad', 'SegEntregaVehiculo'],
  seg_unidades_base: ['seguridad', 'SegUnidadBase'], seg_unidades_fotos: ['seguridad', 'SegUnidadFoto'],
  seg_unidades_registros: ['seguridad', 'SegUnidadRegistro'],
};

const TITULOS = {
  sistema: 'Sistema: usuarios, roles, sesiones, auditoría, API y configuración',
  directorio: 'Directorio: clientes y conductores',
  flota: 'Flota: placas, documentos, disponibilidad y status',
  mantenimiento: 'Mantenimiento: OT, inspecciones, checklist, planificación, preventivos, Fleetrun y taller',
  neumaticos: 'Neumáticos: hoja de vida, inspecciones, rotaciones y catálogos',
  almacen: 'Almacén: inventario, entradas, salidas y proveedores',
  compras: 'Compras: órdenes de compra, recepciones y aprobaciones',
  operaciones: 'Operaciones: órdenes de viaje y de servicio',
  combustible: 'Combustible: vales, estaciones y matriz D2',
  guias: 'Guías de remisión SUNAT',
  tesoreria: 'Tesorería: caja, bancos, cuentas y liquidaciones',
  rrhh: 'Recursos humanos',
  seguridad: 'Seguridad: garita, unidades y entrega de vehículos',
};

const pascal = s => s.split('_').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('');

const [, , ENTRADA, SALIDA] = process.argv;
const src = fs.readFileSync(ENTRADA, 'utf8');
const bloques = [...src.matchAll(/^(\/\/\/[^\n]*\n)*(model|enum) (\w+) \{\n[\s\S]*?^\}/gm)].map(m => ({ texto: m[0], tipo: m[2], nombre: m[3] }));

// Nombres nuevos de modelos y listas (enum)
const nuevo = {};
const faltan = [];
for (const b of bloques) {
  if (b.tipo === 'model') { if (TABLAS[b.nombre]) nuevo[b.nombre] = TABLAS[b.nombre][1]; else faltan.push(b.nombre); }
  else nuevo[b.nombre] = pascal(b.nombre);
}
if (faltan.length) { console.error('Tablas sin módulo asignado:', faltan.join(', ')); process.exit(1); }

const porModulo = {};
const enumDe = {}; // enum → módulo del primer modelo que lo usa
for (const b of bloques.filter(x => x.tipo === 'model')) {
  const modulo = TABLAS[b.nombre][0];
  let t = b.texto.replace(`model ${b.nombre} {`, `model ${nuevo[b.nombre]} {`);
  // Tipos de los campos: modelos y listas renombrados (con ? o [])
  t = t.replace(/^(\s+\w+\s+)(\w+)(\[\]|\?)?/gm, (m, pre, tipo, suf) => {
    if (nuevo[tipo] && tipo !== nuevo[tipo]) {
      if (!TABLAS[tipo]) enumDe[tipo] ||= modulo;
      return pre + nuevo[tipo] + (suf || '');
    }
    if (nuevo[tipo] && !TABLAS[tipo]) enumDe[tipo] ||= modulo;
    return m;
  });
  if (nuevo[b.nombre] !== b.nombre) t = t.replace(/\n\}$/, `\n\n  @@map("${b.nombre}")\n}`);
  (porModulo[modulo] ||= []).push(t);
}
for (const b of bloques.filter(x => x.tipo === 'enum')) {
  const modulo = enumDe[b.nombre] || 'sistema';
  porModulo[modulo].push(b.texto.replace(`enum ${b.nombre} {`, `enum ${nuevo[b.nombre]} {`));
}

fs.mkdirSync(SALIDA, { recursive: true });
fs.writeFileSync(path.join(SALIDA, 'core.prisma'), `// AZKELL FLEET — esquema base: conexión.
// El modelo de datos está dividido por módulo en esta carpeta (prisma/schema/*.prisma).
// Una base por empresa: DATABASE_URL apunta a la base de la empresa sobre la que se trabaja;
// en ejecución, el cliente de cada empresa se crea con su propia URL (server/core/db).
// Convención: modelos en singular con mayúscula y @@map a la tabla; columnas con su nombre actual.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
`);
for (const [modulo, lista] of Object.entries(porModulo)) {
  fs.writeFileSync(path.join(SALIDA, `${modulo}.prisma`), `// ${TITULOS[modulo]}\n\n${lista.join('\n\n')}\n`);
}
console.log(Object.entries(porModulo).map(([m, l]) => `${m}: ${l.length}`).join(' · '));
