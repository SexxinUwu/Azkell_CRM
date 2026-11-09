// Vista de auditoría para personas: convierte el registro firmado (log_auditoria, una fila por petición que modifica datos
// o lee algo sensible) en eventos legibles («Anuló la orden ENT-2026-00337»), sin el ruido de las consultas automáticas
// (Wialon, fotos, etc.). Solo lectura. La fecha se guarda en UTC: aquí se entrega en ISO con «Z» y el cliente la muestra en hora de Lima.

/** Peticiones automáticas o de apoyo que no son decisiones de una persona */
const RUIDO_REGEX = '^/script/obtener|presign|wialon-telemetria|imagen-lectura|^/push|^/asistente|sincronizar-remoto|/fotos/confirmar|/archivos/confirmar|/notificaciones';

const CODIGO = '[A-Z]{2,4}-[0-9]{4}-[0-9]+';

/**
 * Categoría de un evento: se calcula en SQL (para filtrar y contar) y se repite en JS (para mostrar) con las mismas reglas.
 *  ingreso · acceso_fallido · bloqueo (la petición fue rechazada) · consulta (lectura sensible) · anulo · rechazo · aprobo · elimino · creo · modifico
 */
const CATEGORIA_SQL = `CASE
    WHEN ev.origen = 'sesion' AND ev.sub = 'LOGIN_FAILED' THEN 'acceso_fallido'
    WHEN ev.origen = 'sesion' THEN 'ingreso'
    WHEN ev.status >= 400 THEN 'bloqueo'
    WHEN ev.metodo = 'GET' THEN 'consulta'
    WHEN ev.ruta REGEXP '/entradas/[^/]+/anular$' THEN 'anulo'
    WHEN ev.ruta REGEXP '/salidas/[^/]+$' AND ev.body_resumen LIKE '%"accion":"anular"%' THEN 'anulo'
    WHEN ev.ruta REGEXP '/entradas/[^/]+/estado$' AND ev.body_resumen LIKE '%"estado":"Rechazado"%' THEN 'rechazo'
    WHEN ev.ruta REGEXP '/entradas/[^/]+/estado$' AND ev.body_resumen LIKE '%"estado":"Aprobado"%' THEN 'aprobo'
    WHEN ev.metodo = 'DELETE' THEN 'elimino'
    WHEN ev.metodo = 'POST' THEN 'creo'
    ELSE 'modifico' END`;

/** Primer tramo de la ruta (almacen, ordenes-trabajo…) */
const SEGMENTO_SQL = "SUBSTRING_INDEX(SUBSTRING_INDEX(ev.ruta, '/', 2), '/', -1)";

/** Eventos = registro firmado sin ruido + ingresos (y accesos fallidos) de la bitácora corta */
const C = col => `CONVERT(${col} USING utf8mb4) COLLATE utf8mb4_unicode_ci`; // las dos tablas pueden tener collations distintas
const EVENTOS_SQL = `(
  SELECT ${C("CONCAT('L', l.id)")} AS uid, l.id AS id, ${C("'firmado'")} AS origen, ${C("''")} AS sub, l.fecha AS ts, ${C('l.usuario')} AS usuario, ${C('l.correo')} AS correo, ${C('l.ip')} AS ip,
         ${C('l.metodo')} AS metodo, ${C('l.ruta')} AS ruta, ${C('l.modulo')} AS modulo, ${C('l.body_resumen')} AS body_resumen, l.status_codigo AS status, ${C('l.firma_estado')} AS firma_estado,
         ${C('LEFT(l.despues, 420)')} AS despues
  FROM log_auditoria l
  WHERE l.ruta NOT REGEXP '${RUIDO_REGEX}'
  UNION ALL
  SELECT ${C("CONCAT('S', a.id)")}, a.id, ${C("'sesion'")}, ${C('a.action')}, a.created_at, ${C('a.user_name')}, NULL, ${C('a.ip')},
         ${C("'POST'")}, ${C("'/sesion/ingreso'")}, ${C("'sesion'")}, ${C('a.summary')}, 200, NULL, NULL
  FROM audit_logs a WHERE a.entity = 'session'
) ev`;

const ETIQUETA_MODULO = {
  almacen: 'Almacén', 'ordenes-trabajo': 'Órdenes de trabajo', 'ot-trabajos': 'Trabajos de OT', 'ot-materiales': 'Repuestos de OT', 'ot-backlog': 'Pendientes de OT',
  taller: 'Taller', 'taller-rampas': 'Rampas', mantenimiento: 'Mantenimiento', checklist: 'Checklist', combustible: 'Combustible',
  'disponibilidad-flota': 'Disponibilidad', seguridad: 'Seguridad', tesoreria: 'Tesorería', neumaticos: 'Neumáticos', operaciones: 'Operaciones',
  perfil: 'Perfil', auth: 'Acceso', roles: 'Roles y permisos', usuarios: 'Usuarios', 'usuarios-v2': 'Usuarios', 'documentos-flota': 'Documentos de flota', script: 'Sistema',
  'tipos-mantenimiento': 'Tipos de mantenimiento', 'tipos-preventivo': 'Tipos de preventivo', 'cat-rampas': 'Catálogo de rampas', sesion: 'Sesión', placas: 'Placas',
  conductores: 'Conductores', 'guias-remision': 'Guías de remisión', integraciones: 'Integraciones', 'log-auditoria': 'Auditoría', audit: 'Auditoría',
  'ot-pdf': 'PDF de OT', 'vehiculos-flota': 'Vehículos de flota', 'mantenimiento-kits': 'Kits de mantenimiento', 'taller-personal': 'Personal de taller',
  flota: 'Flota', importarPlacasMasivo: 'Importación de placas',
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
  [/^\/roles/, 'el rol'], [/^\/usuarios/, 'el usuario'], [/^\/placas/, 'la placa'],
];

const INFINITIVO = { 'Anuló': 'anular', 'Despachó': 'despachar', 'Aprobó': 'aprobar', 'Rechazó': 'rechazar', 'Registró': 'registrar', 'Modificó': 'modificar',
  'Eliminó': 'eliminar', 'Editó': 'editar', 'Recepcionó': 'recepcionar', 'Cambió': 'cambiar', 'Actualizó': 'actualizar', 'Solicitó': 'solicitar',
  'Procesó': 'procesar', 'Auditó': 'auditar', 'Creó': 'crear', 'Abrió': 'abrir', 'Consultó': 'consultar', 'Exportó': 'exportar', 'Regularizó': 'regularizar' };

/** Texto corto del motivo cuando el sistema rechazó la petición (lo guarda el servidor en «despues» como {"error": "..."}) */
function motivoBloqueo(e) {
  const d = aObjeto(e.despues);
  let t = d && d.error ? String(d.error) : '';
  if (!t && typeof e.despues === 'string') { const m = e.despues.match(/"error":"([^"]*)/); if (m) t = m[1]; }
  t = t.replace(/\\n/g, ' ').replace(/\s*[•·]\s*/g, ' · ').replace(/\s+/g, ' ').trim();
  if (t) return t.length > 170 ? t.slice(0, 167) + '…' : t;
  if (Number(e.status) === 403) return 'sin permiso para esta acción';
  // Eventos anteriores a que se guardara el motivo: despachar sin stock siempre se rechazó por falta de stock; registrar una salida solo desde que se valida el stock (08/11/2026)
  const ruta = String(e.ruta || '');
  const despachar = /^\/almacen\/salidas\/[^/]+$/.test(ruta) && String(e.metodo).toUpperCase() === 'PUT' && /"accion":"despachar"/.test(String(e.body_resumen || ''));
  const registrarConValidacion = /^\/almacen\/salidas$/.test(ruta) && Number(e.status) === 400 && new Date(aIso(e.ts) || 0).getTime() >= Date.UTC(2026, 10, 8);
  if (Number(e.status) === 400 && (despachar || registrarConValidacion)) return 'stock insuficiente en almacén (registro anterior, sin detalle)';
  return 'el sistema lo rechazó';
}

/** Categoría y texto legible de un evento (misma lógica que CATEGORIA_SQL). Un intento que el sistema rechazó (HTTP 400 o más) se muestra como bloqueado y con su motivo. */
function describir(e) {
  if (e.origen === 'sesion') {
    if (e.sub === 'LOGIN_FAILED') return { categoria: 'acceso_fallido', texto: `${e.body_resumen || 'Intento de ingreso fallido'} · ${e.usuario || 'Desconocido'}` };
    return { categoria: 'ingreso', texto: `${e.usuario || 'Alguien'} ingresó al sistema` };
  }
  const d = describirHecho(e);
  if (Number(e.status) >= 400) {
    const [verbo, ...resto] = d.texto.split(' · ')[0].split(' ');
    return { categoria: 'bloqueo', texto: `Intentó ${INFINITIVO[verbo] || verbo.toLowerCase()} ${resto.join(' ')} · No se realizó: ${motivoBloqueo(e)}` };
  }
  return d;
}

function describirHecho(e) {
  const ruta = String(e.ruta || '');
  const metodo = String(e.metodo || '').toUpperCase();
  const body = aObjeto(e.body_resumen) || {};
  const codigo = codigoDe(ruta) || body.numero_correlativo || null;
  const idRuta = idDeRuta(ruta, 'salidas') || idDeRuta(ruta, 'entradas');
  const quien = codigo || idRuta || '';

  // Lecturas sensibles
  if (metodo === 'GET') {
    if (/^\/log-auditoria/.test(ruta)) return { categoria: 'consulta', texto: 'Consultó el registro firmado de auditoría' };
    if (/^\/audit\//.test(ruta)) return { categoria: 'consulta', texto: 'Consultó anulaciones y rechazos' };
    if (/(^|\/)(ot-)?pdf(\/|$)|\/imprimir\//.test(ruta)) return { categoria: 'consulta', texto: `Abrió el PDF${codigo ? ' de ' + codigo : ''}${/ot-pdf/.test(ruta) ? ' de una OT' : ''}` };
    if (/\/archivo\//.test(ruta)) return { categoria: 'consulta', texto: `Abrió un archivo adjunto${codigo ? ' de ' + codigo : ''}` };
    if (/\/exportar/.test(ruta)) return { categoria: 'consulta', texto: `Exportó datos de ${ETIQUETA_MODULO[e.segmento] || e.segmento || 'el sistema'}` };
    return { categoria: 'consulta', texto: `Consultó ${ETIQUETA_MODULO[e.segmento] || e.segmento || 'el sistema'}` };
  }

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
  if (metodo === 'POST' && /^\/almacen\/inventario$/.test(ruta)) {
    return { categoria: 'creo', texto: `Creó el artículo${body.descripcion || body.articulo ? ' ' + String(body.descripcion || body.articulo).slice(0, 60) : ''}` };
  }
  if (/^\/almacen\/inventario\/[^/]+\/regularizar/.test(ruta)) {
    return { categoria: 'modifico', texto: `Regularizó el stock del artículo ${idDeRuta(ruta, 'inventario') || ''}${body.stock_fisico !== undefined ? ` a ${body.stock_fisico}` : ''}` };
  }
  if (metodo === 'PUT' && /^\/ordenes-trabajo\/+/.test(ruta)) {
    return { categoria: 'modifico', texto: `Actualizó la OT ${body.id_ot || (ruta.match(/([^/]+)$/) || [])[1] || ''}${body.estado ? ` · Estado: ${body.estado}` : ''}` };
  }
  if (metodo === 'POST' && /^\/ot-trabajos$/.test(ruta)) {
    return { categoria: 'creo', texto: `Registró un trabajo en la OT ${body.ticket_visita || body.id_ot || ''}` };
  }
  if (metodo === 'POST' && /^\/(taller\/)?ot-materiales$/.test(ruta)) {
    return { categoria: 'creo', texto: `Solicitó repuestos para la OT ${body.ticket_ot || ''}` };
  }
  if (/^\/disponibilidad-flota/.test(ruta) && (metodo === 'PUT' || metodo === 'POST')) {
    return { categoria: metodo === 'POST' ? 'creo' : 'modifico', texto: `Cambió la disponibilidad de ${body.placa || 'una unidad'}${body.estado_unidad ? ` a «${body.estado_unidad}»` : ''}` };
  }
  if (metodo === 'POST' && /^\/(mantenimiento\/)?checklist$/.test(ruta)) {
    return { categoria: 'creo', texto: `Registró un checklist${body.placa ? ' de ' + body.placa : ''}` };
  }
  if (metodo === 'POST' && /^\/neumaticos\/inspecciones/.test(ruta)) {
    return { categoria: 'creo', texto: `Registró una inspección de neumáticos${body.placa ? ' de ' + body.placa : ''}` };
  }
  if (metodo === 'POST' && /^\/combustible\/auditar-viaje/.test(ruta)) {
    return { categoria: 'modifico', texto: `Auditó un viaje${body.viaje || body.id_viaje ? ' ' + (body.viaje || body.id_viaje) : ''}${body.estado ? ` · ${body.estado}` : ''}` };
  }
  if (metodo === 'POST' && /^\/tesoreria\/pago-requerimientos\/[^/]+\/procesar/.test(ruta)) {
    return { categoria: 'modifico', texto: 'Procesó un pago de requerimiento en Tesorería' };
  }
  if (/^\/taller-rampas/.test(ruta) && metodo === 'PUT') {
    return { categoria: 'modifico', texto: `Actualizó la rampa${body.placa ? ' de ' + body.placa : ''}${body.estado ? ` · ${body.estado}` : ''}` };
  }
  if (/^\/roles/.test(ruta) || /^\/usuarios/.test(ruta)) {
    const que = /^\/roles/.test(ruta) ? 'el rol' : 'el usuario';
    return { categoria: metodo === 'DELETE' ? 'elimino' : metodo === 'POST' ? 'creo' : 'modifico', texto: `${metodo === 'DELETE' ? 'Eliminó' : metodo === 'POST' ? 'Creó' : 'Modificó'} ${que}${body.nombre ? ' ' + body.nombre : ''}` };
  }

  const categoria = metodo === 'DELETE' ? 'elimino' : metodo === 'POST' ? 'creo' : 'modifico';
  const verbo = metodo === 'DELETE' ? 'Eliminó' : metodo === 'POST' ? 'Registró' : 'Modificó';
  const objeto = (NOMBRE_OBJETO.find(([re]) => re.test(ruta)) || [null, null])[1];
  const modulo = ETIQUETA_MODULO[e.segmento] || e.segmento || 'el sistema';
  const id = codigoDe(ruta) || (ruta.match(/\/([0-9]+)(?:$|\/)/) || [])[1] || '';
  return { categoria, texto: `${verbo} ${objeto ? objeto : `en ${modulo}`}${id ? ' ' + id : ''}` };
}

/** Campos que cambiaron entre el registro anterior y lo que se envió (solo los que existen en ambos y difieren) */
function cambiosEntre(antes, cuerpo) {
  if (!antes || !cuerpo || typeof antes !== 'object' || typeof cuerpo !== 'object') return [];
  const norm = v => {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const t = String(v).trim();
    return /^\d{4}-\d{2}-\d{2}[T ]/.test(t) ? t.slice(0, 10) : t;
  };
  const num = v => (v !== '' && !isNaN(Number(v)) ? String(Number(v)) : v);
  const salida = [];
  for (const campo of Object.keys(cuerpo)) {
    if (!Object.prototype.hasOwnProperty.call(antes, campo)) continue;
    if (typeof cuerpo[campo] === 'object' && cuerpo[campo] !== null) continue;
    const a = num(norm(antes[campo]));
    const b = num(norm(cuerpo[campo]));
    if (a !== b) salida.push({ campo, antes: a === '' ? null : a, despues: b === '' ? null : b });
  }
  return salida;
}

module.exports = { EVENTOS_SQL, CATEGORIA_SQL, SEGMENTO_SQL, ETIQUETA_MODULO, RUIDO_REGEX, describir, aIso, aObjeto, idDeRuta, cambiosEntre, motivoBloqueo };
