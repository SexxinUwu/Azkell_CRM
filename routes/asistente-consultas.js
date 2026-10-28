// Consultas de datos del asistente. Son herramientas fijas: Gemini elige una y pasa parámetros;
// el servidor valida esos parámetros, revisa los permisos y ejecuta una consulta de solo lectura
// escrita aquí. La IA nunca escribe SQL y solo recibe las filas que listan estas funciones.
const { tienePermiso, db_query, resolveRange, rangoParams, OT_TIPO_SQL, OT_TECNICO_SQL } = require('./asistente-reports');
const { COSTO_OT_SQL } = require('../services/costos_taller');

const PERMISO_TALLER = ['ot.ver', 'status_rampa.ver', 'trabajos_ot.ver', 'reportes_ot.ver', 'sal_inv.ver'];
const MAX_FILAS = 50;
const LIMITE_POR_DEFECTO = 10;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// Errores de validación: su mensaje sí se muestra a la IA. Los errores de base se ocultan.
class ErrorConsulta extends Error {}

function rangoDeArgs(args) {
  const desde = typeof args.desde === 'string' && DATE_KEY.test(args.desde) ? args.desde : undefined;
  const hasta = typeof args.hasta === 'string' && DATE_KEY.test(args.hasta) ? args.hasta : undefined;
  try {
    return resolveRange(desde, hasta); // máximo 366 días; fechas invertidas se rechazan
  } catch (err) {
    throw new ErrorConsulta(err.message);
  }
}

function limiteDeArgs(args) {
  const n = Math.trunc(Number(args.limite));
  if (!Number.isFinite(n)) return LIMITE_POR_DEFECTO;
  return Math.min(MAX_FILAS, Math.max(1, n));
}

const dinero = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Cómo se agrupan los costos: cada clave es un valor fijo (nunca texto de la IA dentro del SQL)
const AGRUPACIONES = {
  placa: "COALESCE(NULLIF(o.placa, ''), 'Sin placa')",
  mes: "DATE_FORMAT(o.fecha_ingreso, '%Y-%m')",
  tipo: `COALESCE(NULLIF(${OT_TIPO_SQL}, ''), 'Sin tipo')`,
};

const HERRAMIENTAS = {
  top_ordenes_costo: {
    permiso: PERMISO_TALLER,
    declaracion: {
      name: 'top_ordenes_costo',
      description: 'Lista las órdenes de trabajo (OT) de taller con mayor costo total en un rango de fechas, de mayor a menor. Úsala para preguntas como "gastos más fuertes" u "OT más caras".',
      parameters: {
        type: 'OBJECT',
        properties: {
          desde: { type: 'STRING', description: 'Fecha inicial YYYY-MM-DD. Sin fecha, usa el mes actual.' },
          hasta: { type: 'STRING', description: 'Fecha final YYYY-MM-DD. Sin fecha, usa hoy.' },
          limite: { type: 'INTEGER', description: 'Cuántas OT listar, de 1 a 50. Por defecto 10.' },
        },
      },
    },
    async ejecutar(args, db) {
      const { fromKey, toKey } = rangoDeArgs(args);
      const limite = limiteDeArgs(args);
      const [filas, [total]] = await Promise.all([
        db_query(db,
          `SELECT COALESCE(NULLIF(o.id_ot, ''), o.ticket_entrada) AS ot, o.placa, ${OT_TIPO_SQL} AS tipo,
                  DATE_FORMAT(o.fecha_ingreso, '%Y-%m-%d') AS fecha, ${COSTO_OT_SQL} AS costo_total
           FROM ordenes_trabajo o
           WHERE o.fecha_ingreso BETWEEN ? AND ?
           ORDER BY costo_total DESC
           LIMIT ${limite}`,
          rangoParams(fromKey, toKey)),
        db_query(db,
          `SELECT COUNT(*) AS ots, COALESCE(SUM(x.costo), 0) AS costo
           FROM (SELECT ${COSTO_OT_SQL} AS costo FROM ordenes_trabajo o WHERE o.fecha_ingreso BETWEEN ? AND ?) x`,
          rangoParams(fromKey, toKey)),
      ]);
      return {
        rango: { desde: fromKey, hasta: toKey },
        moneda: 'S/',
        ots_en_rango: Number(total?.ots) || 0,
        costo_total_rango: dinero(total?.costo),
        ots: filas.map(r => ({
          ot: r.ot ?? '',
          placa: r.placa || 'Sin placa',
          tipo: r.tipo || 'Sin tipo',
          fecha: r.fecha ?? '',
          costo: dinero(r.costo_total),
        })),
      };
    },
  },

  resumen_costos_taller: {
    permiso: PERMISO_TALLER,
    declaracion: {
      name: 'resumen_costos_taller',
      description: 'Resumen de costos de taller en un rango de fechas: total y cantidad de OT, agrupados por placa, por mes o por tipo de mantenimiento, de mayor a menor costo.',
      parameters: {
        type: 'OBJECT',
        properties: {
          desde: { type: 'STRING', description: 'Fecha inicial YYYY-MM-DD. Sin fecha, usa el mes actual.' },
          hasta: { type: 'STRING', description: 'Fecha final YYYY-MM-DD. Sin fecha, usa hoy.' },
          agrupar: { type: 'STRING', enum: Object.keys(AGRUPACIONES), description: 'placa, mes o tipo. Por defecto placa.' },
        },
      },
    },
    async ejecutar(args, db) {
      const { fromKey, toKey } = rangoDeArgs(args);
      const agrupar = Object.prototype.hasOwnProperty.call(AGRUPACIONES, args.agrupar) ? args.agrupar : 'placa';
      const [grupos, [total]] = await Promise.all([
        db_query(db,
          `SELECT x.grupo, COUNT(*) AS ots, SUM(x.costo) AS total
           FROM (SELECT ${AGRUPACIONES[agrupar]} AS grupo, ${COSTO_OT_SQL} AS costo
                 FROM ordenes_trabajo o WHERE o.fecha_ingreso BETWEEN ? AND ?) x
           GROUP BY x.grupo
           ORDER BY total DESC
           LIMIT ${MAX_FILAS}`,
          rangoParams(fromKey, toKey)),
        db_query(db,
          `SELECT COUNT(*) AS ots, COALESCE(SUM(x.costo), 0) AS costo
           FROM (SELECT ${COSTO_OT_SQL} AS costo FROM ordenes_trabajo o WHERE o.fecha_ingreso BETWEEN ? AND ?) x`,
          rangoParams(fromKey, toKey)),
      ]);
      return {
        rango: { desde: fromKey, hasta: toKey },
        moneda: 'S/',
        agrupado_por: agrupar,
        ots_en_rango: Number(total?.ots) || 0,
        costo_total_rango: dinero(total?.costo),
        grupos: grupos.map(g => ({ [agrupar]: g.grupo, ots: Number(g.ots) || 0, costo: dinero(g.total) })),
      };
    },
  },
};

const NOMBRES_CONSULTA = Object.keys(HERRAMIENTAS);

/** Declaraciones (para Gemini) de las consultas que esta persona puede usar. */
function declaracionesDisponibles(user) {
  return NOMBRES_CONSULTA
    .filter(n => tienePermiso(user, HERRAMIENTAS[n].permiso))
    .map(n => HERRAMIENTAS[n].declaracion);
}

/** Ejecuta una consulta pedida por la IA. Devuelve { ok, ...datos } o { error }. Nunca lanza. */
async function ejecutarConsulta(nombre, args, user, db) {
  if (!Object.prototype.hasOwnProperty.call(HERRAMIENTAS, nombre)) {
    return { error: 'Esa consulta no existe. Usa solo las herramientas que se te dieron.' };
  }
  const h = HERRAMIENTAS[nombre];
  if (!tienePermiso(user, h.permiso)) {
    return { error: 'Esta persona no tiene permiso para ver costos de taller. Dile que lo solicite al administrador.' };
  }
  try {
    return { ok: true, ...(await h.ejecutar(args && typeof args === 'object' ? args : {}, db)) };
  } catch (err) {
    if (err instanceof ErrorConsulta) return { error: err.message };
    console.error(`[asistente] consulta ${nombre}:`, err.code || err.message);
    return { error: 'No se pudo consultar la base en este momento. Intenta de nuevo en un momento.' };
  }
}

module.exports = { declaracionesDisponibles, ejecutarConsulta, NOMBRES_CONSULTA, MAX_FILAS };
