// Datos de los reportes del asistente. Los permisos se verifican aquí; los datos van
// directo al navegador, que arma el archivo. Gemini nunca ve datos de la empresa.

const { COSTO_OT_SQL } = require('../services/costos_taller');
const { STOCK_SQL } = require('../services/almacen_stock');

// Permisos de taller: los mismos que acepta GET /ordenes-trabajo (routes/taller.js y rbac.js)
const PERMISOS_TALLER = ['ot.ver', 'status_rampa.ver', 'trabajos_ot.ver', 'reportes_ot.ver', 'sal_inv.ver'];

const REPORTS = {
  placas: { label: 'Vehículos de la flota', perm: 'placas.ver', range: false },
  inspecciones: { label: 'Inspecciones técnicas', perm: 'insp.ver', range: true },
  conductores: { label: 'Directorio de conductores', perm: 'cond.ver', range: false },
  fleetrun: { label: 'Datos de mantenimiento Fleetrun', perm: 'fleet.ver', range: true },
  costos_ot: { label: 'Costos de órdenes de trabajo', perm: PERMISOS_TALLER, range: true },
  ordenes_trabajo: { label: 'Órdenes de trabajo', perm: PERMISOS_TALLER, range: true },
  compras: { label: 'Órdenes de compra', perm: 'ent_inv.ver', range: true },
  inventario: { label: 'Inventario de almacén', perm: 'inv.ver', range: false },
  neumaticos: { label: 'Neumáticos', perm: 'neumaticos.ver', range: false },
};

// Tipo y técnico de una OT: viven en detalles_json (los mismos campos que usa el dashboard de taller)
const OT_TIPO_SQL = "COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.detalles_json, '$.tipo_ot')), ''), '')";
const OT_TECNICO_SQL = "COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.detalles_json, '$.tecnicos_str')), ''), JSON_UNQUOTE(JSON_EXTRACT(o.detalles_json, '$.tecnico_lider')), '')";
// Día inicial desde 00:00 y día final hasta 23:59:59 (las fechas de OT y compras son datetime)
const rangoParams = (desde, hasta) => [`${desde} 00:00:00`, `${hasta} 23:59:59`];

function tienePermiso(user, clave) {
  if (Array.isArray(clave)) return clave.some(c => tienePermiso(user, c));
  if (!user) return false;
  if ((user.correo || '').toLowerCase() === 'admin@azkell.com') return true;
  const rol = (user.rol || '').toLowerCase();
  if (rol.includes('admin') || rol === 'fundador' || rol === 'gerente general') return true;
  try {
    const p = typeof user.permisos === 'string' ? JSON.parse(user.permisos || '{}') : (user.permisos || {});
    if (p.admin === true) return true;
    const [modulo, accion] = clave.split('.');
    const v = p[modulo];
    if (!v || typeof v !== 'object') return false;
    const map = { ver: 'l', crear: 'c', editar: 'e', eliminar: 'd' };
    return !!(v[map[accion]]);
  } catch { return false; }
}

function availableReports(user) {
  return Object.entries(REPORTS)
    .filter(([, r]) => tienePermiso(user, r.perm))
    .map(([k]) => k);
}

const key = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
function limaToday() {
  const [y, m, d] = key(new Date()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function resolveRange(desde, hasta) {
  const today = limaToday();
  const fromKey = desde || new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 12)).toISOString().slice(0, 10);
  const toKey = hasta || today.toISOString().slice(0, 10);
  const from = new Date(fromKey);
  const to = new Date(toKey);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new Error('Las fechas del reporte no son válidas.');
  const diff = (to - from) / 86_400_000;
  if (diff < 0) throw new Error('La fecha inicial no puede ser posterior a la final.');
  if (diff > 366) throw new Error('El rango máximo es de 366 días.');
  return { fromKey, toKey };
}

function todayForPrompt() {
  const d = new Date();
  const today = d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' });
  const weekday = d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday: 'long' });
  return { today, weekday };
}

const db_query = (db, sql, params) => new Promise((resolve, reject) => {
  const conn = db.promise ? db : db;
  if (conn.promise) {
    conn.promise().query(sql, params).then(([rows]) => resolve(rows)).catch(reject);
  } else {
    conn.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  }
});

// Filtros del reporte de placas: cliente, marca, tipo de unidad y estado. Vienen de la frase
// (ver filtrosPlacasDelMensaje) o de los parámetros del reporte. Siempre se usan como valores de SQL.
const CAMPOS_PLACA = ['cliente', 'marca', 'tipo_unidad', 'estado'];
const ETIQUETA_PLACA = { cliente: 'cliente', marca: 'marca', tipo_unidad: 'tipo' };

const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const palabrasDe = (s) => normalizar(s).split(/[^a-z0-9ñ]+/).filter(Boolean);
// Palabras que casi todas las empresas tienen: no bastan para reconocer un cliente
const PALABRAS_GENERICAS = new Set(['transportes', 'transporte', 'logistica', 'servicios', 'empresa', 'grupo', 'corporacion', 'sociedad', 'comercial', 'industrias', 'peru', 'lima']);

function filtrosPlaca(args) {
  const out = {};
  for (const c of CAMPOS_PLACA) {
    const v = typeof args?.[c] === 'string' ? args[c].trim().slice(0, 60) : '';
    if (v) out[c] = v;
  }
  return out;
}

function tituloReporte(tipo, filtros = {}) {
  const partes = CAMPOS_PLACA.filter(c => filtros[c]).map(c => (ETIQUETA_PLACA[c] ? `${ETIQUETA_PLACA[c]} ${filtros[c]}` : filtros[c]));
  return partes.length ? `${REPORTS[tipo].label} · ${partes.join(' · ')}` : REPORTS[tipo].label;
}

function condicionesPlaca(f) {
  const cond = [];
  const params = [];
  const like = (v) => `%${v.replace(/[\\%_]/g, '\\$&')}%`;
  if (f.cliente) { cond.push('cliente LIKE ?'); params.push(like(f.cliente)); }
  if (f.marca) { cond.push('marca LIKE ?'); params.push(like(f.marca)); }
  if (f.tipo_unidad) { cond.push('tipo = ?'); params.push(f.tipo_unidad); }
  if (f.estado) { cond.push('estado = ?'); params.push(f.estado); }
  return { where: cond.length ? `WHERE ${cond.join(' AND ')}` : '', params };
}

// Filtros que la persona nombra en la frase, comparados contra lo que existe en la base.
// Así "placas de marsisa" filtra por el cliente MARSISA sin depender de que la IA adivine.
async function filtrosPlacasDelMensaje(db, mensaje) {
  const texto = normalizar(mensaje);
  const palabras = new Set(palabrasDe(mensaje).filter(p => p.length >= 3));
  const f = {};
  if (/\binactiv/.test(texto)) f.estado = 'Inactiva';
  else if (/\bactiv/.test(texto)) f.estado = 'Activa';
  if (!palabras.size) return f;
  const filas = await db_query(db, 'SELECT DISTINCT cliente, marca, tipo FROM placas', []);
  for (const r of filas) {
    if (!f.cliente) {
      const hit = palabrasDe(r.cliente).find(p => p.length >= 4 && !PALABRAS_GENERICAS.has(p) && palabras.has(p));
      if (hit) f.cliente = hit;
    }
    if (!f.marca && r.marca && palabras.has(normalizar(r.marca).trim())) f.marca = r.marca.trim();
    if (!f.tipo_unidad && r.tipo && palabras.has(normalizar(r.tipo).trim())) f.tipo_unidad = r.tipo.trim();
  }
  return f;
}

async function buildReport(db, user, tipo, query) {
  if (!REPORTS[tipo]) throw { status: 400, message: 'Tipo de reporte no válido.' };
  if (!tienePermiso(user, REPORTS[tipo].perm)) throw { status: 403, message: 'Sin permiso para este reporte.' };

  const targetDb = db;
  const subtitle = todayForPrompt().today;

  if (tipo === 'placas') {
    const filtros = filtrosPlaca(query);
    const { where, params } = condicionesPlaca(filtros);
    const rows = await db_query(targetDb,
      `SELECT placa, cliente, marca, modelo_uts, tipo, sub_tipo, color, anio, estado FROM placas ${where} ORDER BY placa LIMIT 3000`,
      params
    );
    return {
      title: tituloReporte('placas', filtros),
      subtitle: `Generado el ${subtitle}`,
      columns: [
        { key: 'placa', label: 'Placa' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'marca', label: 'Marca' },
        { key: 'modelo_uts', label: 'Modelo' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'sub_tipo', label: 'Sub tipo' },
        { key: 'color', label: 'Color' },
        { key: 'anio', label: 'Año', type: 'number' },
        { key: 'estado', label: 'Estado' },
      ],
      rows: rows.map(r => ({
        placa: r.placa ?? '',
        cliente: r.cliente ?? '',
        marca: r.marca ?? '',
        modelo_uts: r.modelo_uts ?? '',
        tipo: r.tipo ?? '',
        sub_tipo: r.sub_tipo ?? '',
        color: r.color ?? '',
        anio: r.anio ? Number(r.anio) : null,
        estado: r.estado ?? '',
      })),
      truncated: rows.length >= 3000,
    };
  }

  if (tipo === 'conductores') {
    const rows = await db_query(targetDb,
      'SELECT nombre, dni, licencia, telefono, estado FROM conductores ORDER BY nombre LIMIT 2000',
      []
    );
    return {
      title: REPORTS.conductores.label,
      subtitle: `Generado el ${subtitle}`,
      columns: [
        { key: 'nombre', label: 'Nombre' },
        { key: 'dni', label: 'DNI' },
        { key: 'licencia', label: 'Licencia' },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'estado', label: 'Estado' },
      ],
      rows: rows.map(r => ({
        nombre: r.nombre ?? '',
        dni: r.dni ?? '',
        licencia: r.licencia ?? '',
        telefono: r.telefono ?? '',
        estado: r.estado ?? '',
      })),
      truncated: rows.length >= 2000,
    };
  }

  if (tipo === 'inspecciones') {
    const { fromKey, toKey } = resolveRange(query.desde, query.hasta);
    const rows = await db_query(targetDb,
      'SELECT id, placa, fecha_ingreso, tipo_inspeccion, dias_propuestos, km_tablero FROM inspecciones WHERE fecha_ingreso BETWEEN ? AND ? ORDER BY fecha_ingreso DESC LIMIT 3000',
      [fromKey, toKey]
    );
    const fmt = (f) => f instanceof Date ? f.toISOString().slice(0, 10) : (String(f || '').split('T')[0] || '');
    // La tabla no guarda estado: se calcula igual que en Inspecciones (fecha de ingreso + días propuestos, 30 por defecto)
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const estadoDe = (f, dias) => {
      const base = f instanceof Date ? new Date(f) : new Date(String(f || '').split('T')[0] + 'T00:00:00');
      if (Number.isNaN(base.getTime())) return '';
      base.setDate(base.getDate() + (Number(dias) || 30));
      return base >= hoy ? 'Vigente' : 'Vencida';
    };
    return {
      title: REPORTS.inspecciones.label,
      subtitle: `Del ${fromKey} al ${toKey} · Generado el ${subtitle}`,
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'placa', label: 'Placa' },
        { key: 'fecha_ingreso', label: 'Fecha' },
        { key: 'tipo_inspeccion', label: 'Tipo' },
        { key: 'estado', label: 'Estado' },
        { key: 'km_tablero', label: 'Km tablero', type: 'number' },
      ],
      rows: rows.map(r => ({
        id: r.id ?? '',
        placa: r.placa ?? '',
        fecha_ingreso: fmt(r.fecha_ingreso),
        tipo_inspeccion: r.tipo_inspeccion ?? '',
        estado: estadoDe(r.fecha_ingreso, r.dias_propuestos),
        km_tablero: r.km_tablero != null ? Number(r.km_tablero) : null,
      })),
      truncated: rows.length >= 3000,
    };
  }

  if (tipo === 'fleetrun') {
    const { fromKey, toKey } = resolveRange(query.desde, query.hasta);
    const rows = await db_query(targetDb,
      'SELECT idRegistro, placa, fecha, km_actual, tipo_mp FROM fleetrun WHERE fecha BETWEEN ? AND ? ORDER BY fecha DESC LIMIT 3000',
      [fromKey, toKey]
    );
    const fmt = (f) => f instanceof Date ? f.toISOString().slice(0, 10) : (String(f || '').split('T')[0] || '');
    return {
      title: REPORTS.fleetrun.label,
      subtitle: `Del ${fromKey} al ${toKey} · Generado el ${subtitle}`,
      columns: [
        { key: 'idRegistro', label: 'Registro' },
        { key: 'placa', label: 'Placa' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'km_actual', label: 'Km actual', type: 'number' },
        { key: 'tipo_mp', label: 'Tipo mantenimiento' },
      ],
      rows: rows.map(r => ({
        idRegistro: r.idRegistro ?? '',
        placa: r.placa ?? '',
        fecha: fmt(r.fecha),
        km_actual: r.km_actual != null ? Number(r.km_actual) : null,
        tipo_mp: r.tipo_mp ?? '',
      })),
      truncated: rows.length >= 3000,
    };
  }

  if (tipo === 'costos_ot') {
    const { fromKey, toKey } = resolveRange(query.desde, query.hasta);
    const rows = await db_query(targetDb,
      `SELECT COALESCE(NULLIF(o.id_ot, ''), o.ticket_entrada) AS ot, o.placa, ${OT_TIPO_SQL} AS tipo, ${OT_TECNICO_SQL} AS tecnico,
              DATE_FORMAT(o.fecha_ingreso, '%Y-%m-%d') AS fecha, ${COSTO_OT_SQL} AS costo_total
       FROM ordenes_trabajo o
       WHERE o.fecha_ingreso BETWEEN ? AND ?
       ORDER BY costo_total DESC LIMIT 3000`,
      rangoParams(fromKey, toKey)
    );
    return {
      title: REPORTS.costos_ot.label,
      subtitle: `Del ${fromKey} al ${toKey} · Generado el ${subtitle}`,
      columns: [
        { key: 'ot', label: 'OT' },
        { key: 'placa', label: 'Placa' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'tecnico', label: 'Técnico' },
        { key: 'fecha', label: 'Fecha ingreso' },
        { key: 'costo_total', label: 'Costo total', type: 'money' },
      ],
      rows: rows.map(r => ({
        ot: r.ot ?? '',
        placa: r.placa ?? '',
        tipo: r.tipo ?? '',
        tecnico: r.tecnico ?? '',
        fecha: r.fecha ?? '',
        costo_total: Number(r.costo_total) || 0,
      })),
      truncated: rows.length >= 3000,
    };
  }

  if (tipo === 'ordenes_trabajo') {
    const { fromKey, toKey } = resolveRange(query.desde, query.hasta);
    const rows = await db_query(targetDb,
      `SELECT COALESCE(NULLIF(o.id_ot, ''), o.ticket_entrada) AS ot, o.placa, o.estado, ${OT_TIPO_SQL} AS tipo, ${OT_TECNICO_SQL} AS tecnico,
              DATE_FORMAT(o.fecha_ingreso, '%Y-%m-%d %H:%i') AS fecha_ingreso, DATE_FORMAT(o.fecha_hora_salida, '%Y-%m-%d %H:%i') AS fecha_salida
       FROM ordenes_trabajo o
       WHERE o.fecha_ingreso BETWEEN ? AND ?
       ORDER BY o.fecha_ingreso DESC LIMIT 3000`,
      rangoParams(fromKey, toKey)
    );
    return {
      title: REPORTS.ordenes_trabajo.label,
      subtitle: `Del ${fromKey} al ${toKey} · Generado el ${subtitle}`,
      columns: [
        { key: 'ot', label: 'OT' },
        { key: 'placa', label: 'Placa' },
        { key: 'estado', label: 'Estado' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'tecnico', label: 'Técnico' },
        { key: 'fecha_ingreso', label: 'Ingreso' },
        { key: 'fecha_salida', label: 'Salida' },
      ],
      rows: rows.map(r => ({
        ot: r.ot ?? '',
        placa: r.placa ?? '',
        estado: r.estado ?? '',
        tipo: r.tipo ?? '',
        tecnico: r.tecnico ?? '',
        fecha_ingreso: r.fecha_ingreso ?? '',
        fecha_salida: r.fecha_salida ?? '',
      })),
      truncated: rows.length >= 3000,
    };
  }

  if (tipo === 'compras') {
    const { fromKey, toKey } = resolveRange(query.desde, query.hasta);
    const rows = await db_query(targetDb,
      `SELECT e.id, DATE_FORMAT(e.fecha, '%Y-%m-%d') AS fecha, e.proveedor_nombre, e.documento_referencia, e.placa, e.estado, e.total_pen
       FROM entradas_inv e
       WHERE e.tipo_orden = 'Orden de compra' AND e.fecha BETWEEN ? AND ?
       ORDER BY e.fecha DESC LIMIT 3000`,
      rangoParams(fromKey, toKey)
    );
    return {
      title: REPORTS.compras.label,
      subtitle: `Del ${fromKey} al ${toKey} · Generado el ${subtitle}`,
      columns: [
        { key: 'id', label: 'Código' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'proveedor', label: 'Proveedor' },
        { key: 'documento', label: 'Documento' },
        { key: 'placa', label: 'Placa' },
        { key: 'estado', label: 'Estado' },
        { key: 'total', label: 'Total', type: 'money' },
      ],
      rows: rows.map(r => ({
        id: r.id ?? '',
        fecha: r.fecha ?? '',
        proveedor: r.proveedor_nombre ?? '',
        documento: r.documento_referencia ?? '',
        placa: r.placa ?? '',
        estado: r.estado ?? '',
        total: Number(r.total_pen) || 0,
      })),
      truncated: rows.length >= 3000,
    };
  }

  if (tipo === 'inventario') {
    // Mismo cálculo de stock que el inventario de almacén (services/almacen_stock.js)
    const rows = await db_query(targetDb, STOCK_SQL, []);
    return {
      title: REPORTS.inventario.label,
      subtitle: `Stock al ${subtitle}`,
      columns: [
        { key: 'id', label: 'Código' },
        { key: 'articulo', label: 'Artículo' },
        { key: 'familia', label: 'Familia' },
        { key: 'almacen', label: 'Almacén' },
        { key: 'unidad', label: 'Unidad' },
        { key: 'stock_actual', label: 'Stock actual', type: 'number' },
        { key: 'stock_min', label: 'Stock mínimo', type: 'number' },
        { key: 'costo_unit', label: 'Costo unitario', type: 'money' },
      ],
      rows: rows.slice(0, 3000).map(r => ({
        id: r.id ?? '',
        articulo: r.descripcion ?? '',
        familia: r.familia ?? '',
        almacen: r.almacen ?? '',
        unidad: r.unidad ?? '',
        stock_actual: Number(r.stock_actual) || 0,
        stock_min: Number(r.stock_min) || 0,
        costo_unit: Number(r.costo_soles) || 0,
      })),
      truncated: rows.length > 3000,
    };
  }

  if (tipo === 'neumaticos') {
    const rows = await db_query(targetDb,
      `SELECT id_neumatico, codigo_llanta, marca, medida, estado_operativo, placa_actual, posicion_actual,
              remanente_actual, km_acumulado, costo_compra
       FROM neumaticos_hoja_vida
       ORDER BY placa_actual, posicion_actual LIMIT 3000`,
      []
    );
    return {
      title: REPORTS.neumaticos.label,
      subtitle: `Generado el ${subtitle}`,
      columns: [
        { key: 'id_neumatico', label: 'Código' },
        { key: 'codigo_llanta', label: 'Código llanta' },
        { key: 'marca', label: 'Marca' },
        { key: 'medida', label: 'Medida' },
        { key: 'estado_operativo', label: 'Estado' },
        { key: 'placa', label: 'Placa' },
        { key: 'posicion', label: 'Posición' },
        { key: 'remanente', label: 'Remanente (mm)', type: 'number' },
        { key: 'km_acumulado', label: 'Km acumulado', type: 'number' },
        { key: 'costo_compra', label: 'Costo compra', type: 'money' },
      ],
      rows: rows.map(r => ({
        id_neumatico: r.id_neumatico ?? '',
        codigo_llanta: r.codigo_llanta ?? '',
        marca: r.marca ?? '',
        medida: r.medida ?? '',
        estado_operativo: r.estado_operativo ?? '',
        placa: r.placa_actual ?? '',
        posicion: r.posicion_actual ?? '',
        remanente: r.remanente_actual != null ? Number(r.remanente_actual) : null,
        km_acumulado: r.km_acumulado != null ? Number(r.km_acumulado) : null,
        costo_compra: r.costo_compra != null ? Number(r.costo_compra) : null,
      })),
      truncated: rows.length >= 3000,
    };
  }

  throw { status: 400, message: 'Tipo de reporte no reconocido.' };
}

module.exports = { REPORTS, availableReports, buildReport, resolveRange, todayForPrompt, filtrosPlaca, filtrosPlacasDelMensaje, tituloReporte, condicionesPlaca, tienePermiso, db_query, rangoParams, OT_TIPO_SQL, OT_TECNICO_SQL };
