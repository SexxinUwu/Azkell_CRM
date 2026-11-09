// Vista de auditoría para personas: convierte el registro firmado (log_auditoria, una fila por petición que modifica datos)
// en eventos legibles («Anuló la orden ENT-2026-00337»), sin el ruido de las consultas automáticas (Wialon, fotos, etc.).
// Solo lectura. La fecha se guarda en UTC: aquí se entrega en ISO con «Z» y el cliente la muestra en hora de Lima.

/** Peticiones automáticas o de apoyo que no son decisiones de una persona */
const RUIDO_REGEX = '^/script/obtener|presign|wialon-telemetria|imagen-lectura|^/push|^/asistente|sincronizar-remoto|/fotos/confirmar|/archivos/confirmar|/notificaciones';

const CODIGO = '[A-Z]{2,4}-[0-9]{4}-[0-9]+';

/** Categoría de un evento: se calcula en SQL (para filtrar y contar) y se repite en JS (para mostrar) con las mismas reglas */
const CATEGORIA_SQL = `CASE
    WHEN ev.origen = 'sesion' THEN 'ingreso'
    WHEN ev.ruta REGEXP '/entradas/[^/]+/anular$' THEN 'anulo'
    WHEN ev.ruta REGEXP '/salidas/[^/]+$' AND ev.body_resumen LIKE '%"accion":"anular"%' THEN 'anulo'
    WHEN ev.ruta REGEXP '/entradas/[^/]+/estado$' AND ev.body_resumen LIKE '%"estado":"Rechazado"%' THEN 'rechazo'
    WHEN ev.ruta REGEXP '/entradas/[^/]+/estado$' AND ev.body_resumen LIKE '%"estado":"Aprobado"%' THEN 'aprobo'
    WHEN ev.metodo = 'DELETE' THEN 'elimino'
    WHEN ev.metodo = 'POST' THEN 'creo'
    ELSE 'modifico' END`;

/** Primer tramo de la ruta (almacen, ordenes-trabajo…) */
const SEGMENTO_SQL = "SUBSTRING_INDEX(SUBSTRING_INDEX(ev.ruta, '/', 2), '/', -1)";

/** Eventos = registro firmado sin ruido + ingresos al sistema de la bitácora corta */
const C = col => `CONVERT(${col} USING utf8mb4) COLLATE utf8mb4_unicode_ci`; // las dos tablas pueden tener collations distintas
const EVENTOS_SQL = `(
  SELECT ${C("CONCAT('L', l.id)")} AS uid, l.id AS id, ${C("'firmado'")} AS origen, l.fecha AS ts, ${C('l.usuario')} AS usuario, ${C('l.correo')} AS correo, ${C('l.ip')} AS ip,
         ${C('l.metodo')} AS metodo, ${C('l.ruta')} AS ruta, ${C('l.modulo')} AS modulo, ${C('l.body_resumen')} AS body_resumen, l.status_codigo AS status, ${C('l.firma_estado')} AS firma_estado
  FROM log_auditoria l
  WHERE l.ruta NOT REGEXP '${RUIDO_REGEX}'
  UNION ALL
  SELECT ${C("CONCAT('S', a.id)")}, a.id, ${C("'sesion'")}, a.created_at, ${C('a.user_name')}, NULL, ${C('a.ip')},
         ${C("'POST'")}, ${C("'/sesion/ingreso'")}, ${C("'sesion'")}, ${C('a.summary')}, 200, NULL
  FROM audit_logs a WHERE a.entity = 'session'
) ev`;

const ETIQUETA_MODULO = {
  almacen: 'Almacén', 'ordenes-trabajo': 'Órdenes de trabajo', 'ot-trabajos': 'Trabajos de OT', 'ot-materiales': 'Repuestos de OT', 'ot-backlog': 'Pendientes de OT',
  taller: 'Taller', 'taller-rampas': 'Rampas', mantenimiento: 'Mantenimiento', checklist: 'Checklist', combustible: 'Combustible',
  'disponibilidad-flota': 'Disponibilidad', seguridad: 'Seguridad', tesoreria: 'Tesorería', neumaticos: 'Neumáticos', operaciones: 'Operaciones',
  perfil: 'Perfil', auth: 'Acceso', roles: 'Roles y permisos', usuarios: 'Usuarios', 'documentos-flota': 'Documentos de flota', script: 'Sistema',
  'tipos-mantenimiento': 'Tipos de mantenimiento', 'cat-rampas': 'Catálogo de rampas', sesion: 'Sesión', placas: 'Placas', conductores: 'Conductores',
  'guias-remision': 'Guías de remisión', integraciones: 'Integraciones', 'log-auditoria': 'Auditoría',
};

function aObjeto(v) {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string' && v.trim()) { try { return JSON.parse(v); } catch { return null; } }
  return null;
}

/** ISO con «Z» a partir de lo que devuelva el driver (texto UTC o Date) */
function aIso(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const t = String(v).trim().replace(' ', 'T');
  return /Z$|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`;
}

function codigoDe(ruta) {
  const m = String(ruta || '').match(new RegExp(CODIGO));
  return m ? m[0] : null;
}
function idDeRuta(ruta, tras) {
  const m = String(ruta || '').match(new RegExp(`/${tras}/([^/?]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

const NOMBRE_OBJETO = [
  [/^\/almacen\/entradas/, 'la orden'], [/^\/almacen\/salidas/, 'la salida'], [/^\/almacen\/recepciones/, 'la recepción de mercadería'],
  [/^\/almacen\/inventario/, 'el artículo'], [/^\/almacen\/proveedores/, 'el proveedor'], [/^\/ordenes-trabajo/, 'la OT'],
  [/^\/ot-trabajos/, 'un trabajo de OT'], [/^\/ot-materiales|^\/taller\/ot-materiales/, 'una solicitud de repuestos'],
  [/^\/disponibilidad-flota/, 'la disponibilidad'], [/^\/seguridad\/unidades/, 'la unidad'], [/^\/tesoreria/, 'un movimiento de tesorería'],
  [/^\/combustible\/auditar-viaje/, 'la auditoría de un viaje'], [/^\/neumaticos/, 'neumáticos'], [/^\/checklist|^\/mantenimiento\/checklist/, 'un checklist'],
];

/** Categoría y texto legible de un evento (misma lógica que CATEGORIA_SQL) */
function describir(e) {
  const ruta = String(e.ruta || '');
  const metodo = String(e.metodo || '').toUpperCase();
  const body = aObjeto(e.body_resumen) || {};
  const usuario = e.usuario || 'Alguien';
  if (e.origen === 'sesion') return { categoria: 'ingreso', texto: `${usuario} ingresó al sistema` };

  const codigo = codigoDe(ruta) || body.numero_correlativo || null;
  const idRuta = idDeRuta(ruta, 'salidas') || idDeRuta(ruta, 'entradas');
  const quien = codigo || idRuta || '';

  if (/\/entradas\/[^/]+\/anular$/.test(ruta)) {
    return { categoria: 'anulo', texto: `Anuló la orden ${quien}${body.motivo ? ` · Motivo: ${body.motivo}` : ''}` };
  }
  if (/\/entradas\/[^/]+\/estado$/.test(ruta)) {
    const est = String(body.estado || '');
    const accion = est === 'Rechazado' ? 'Rechazó' : est === 'Aprobado' ? 'Aprobó' : `Cambió a «${est || '—'}»`;
    return { categoria: est === 'Rechazado' ? 'rechazo' : est === 'Aprobado' ? 'aprobo' : 'modifico', texto: `${accion} la orden ${quien}${body.comentario ? ` · ${body.comentario}` : ''}` };
  }
  if (/^\/almacen\/salidas\/[^/]+$/.test(ruta) && metodo === 'PUT') {
    const a = String(body.accion || '');
    const verbo = a === 'despachar' ? 'Despachó' : a === 'anular' ? 'Anuló' : 'Editó';
    return { categoria: a === 'anular' ? 'anulo' : 'modifico', texto: `${verbo} la salida ${quien}${a === 'anular' && body.motivo ? ` · Motivo: ${body.motivo}` : ''}` };
  }
  if (metodo === 'POST' && /^\/almacen\/entradas$/.test(ruta)) {
    return { categoria: 'creo', texto: `Registró ${String(body.tipo_orden || '').toLowerCase().includes('servicio') ? 'una orden de servicio' : 'una orden de compra'}${codigo ? ' ' + codigo : ''}${body.proveedor_nombre ? ` · ${body.proveedor_nombre}` : ''}` };
  }
  if (metodo === 'POST' && /^\/almacen\/salidas$/.test(ruta)) {
    return { categoria: 'creo', texto: `Registró una salida${body.ticket_ot ? ` para la ${body.ticket_ot}` : ''}${body.placa ? ` · ${body.placa}` : ''}` };
  }
  if (metodo === 'POST' && /^\/almacen\/recepciones-oc\/registrar/.test(ruta)) {
    return { categoria: 'creo', texto: `Recepcionó mercadería${body.oc_id ? ' de la orden ' + body.oc_id : ''}` };
  }

  const categoria = metodo === 'DELETE' ? 'elimino' : metodo === 'POST' ? 'creo' : 'modifico';
  const verbo = metodo === 'DELETE' ? 'Eliminó' : metodo === 'POST' ? 'Registró' : 'Modificó';
  const objeto = (NOMBRE_OBJETO.find(([re]) => re.test(ruta)) || [null, null])[1];
  const modulo = ETIQUETA_MODULO[e.segmento] || e.segmento || 'el sistema';
  const id = codigoDe(ruta) || (ruta.match(/\/([0-9]+)(?:$|\/)/) || [])[1] || '';
  return { categoria, texto: `${verbo} ${objeto ? objeto : `en ${modulo}`}${id ? ' ' + id : ''}` };
}

module.exports = { EVENTOS_SQL, CATEGORIA_SQL, SEGMENTO_SQL, ETIQUETA_MODULO, RUIDO_REGEX, describir, aIso, aObjeto, idDeRuta };
