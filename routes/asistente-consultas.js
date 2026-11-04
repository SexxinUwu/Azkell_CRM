// Consultas de datos del asistente. Son herramientas fijas: Gemini elige una y pasa parámetros;
// el servidor valida esos parámetros, revisa los permisos y ejecuta una consulta de solo lectura
// escrita aquí. La IA nunca escribe SQL y solo recibe las filas que listan estas funciones.
const { tienePermiso, db_query, resolveRange, rangoParams, OT_TIPO_SQL, OT_TECNICO_SQL } = require('./asistente-reports');
const { COSTO_OT_SQL } = require('../services/costos_taller');
const { datosGpsUnidad, limpiarPlaca } = require('../services/wialon_unidad');
const { STOCK_SQL } = require('../services/almacen_stock');

const PERMISO_TALLER = ['ot.ver', 'status_rampa.ver', 'trabajos_ot.ver', 'reportes_ot.ver', 'sal_inv.ver'];
const PERMISO_GPS = ['gps.ver'];
const PERMISO_UNIDAD = ['placas.ver', 'fleet.ver', 'gps.ver'];
const PERMISO_MANTENIMIENTO = ['fleet.ver', 'placas.ver'];
const PERMISO_DOCUMENTOS = ['docs_flota.ver', 'placas.ver'];
const PERMISO_VIAJES = ['op_ordenes_viaje.ver', 'seguridad_unidades.ver', 'placas.ver', 'cond.ver'];
const PERMISO_INVENTARIO = ['inv.ver'];
const PERMISO_NEUMATICOS = ['neumaticos.ver'];

// Placa sin guiones ni espacios, para comparar sin importar cómo esté escrita en cada tabla
const SQL_PLACA = (col) => `REPLACE(REPLACE(UPPER(${col}), '-', ''), ' ', '')`;
function placaDeArgs(args) {
  const placa = limpiarPlaca(args.placa);
  if (placa.length < 5) throw new ErrorConsulta('No entendí la placa. Pídele que la repita completa (por ejemplo BSS899).');
  return placa;
}
const fechaCorta = (v) => (v instanceof Date && !isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : (v ? String(v).slice(0, 10) : ''));
const texto = (v, n = 160) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
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

  datos_gps_unidad: {
    permiso: PERMISO_GPS,
    sinPermiso: 'Esta persona no tiene permiso para ver el GPS. Dile que lo solicite al administrador.',
    declaracion: {
      name: 'datos_gps_unidad',
      description: 'Datos EN VIVO del GPS de una unidad por su placa: dónde está ahora (dirección), si está en marcha o detenida, velocidad, kilometraje total (odómetro) y horas de motor. Úsala para "dónde está la placa X", "ubicación de X", "cuántos km tiene X" u "horas de X".',
      parameters: {
        type: 'OBJECT',
        properties: { placa: { type: 'STRING', description: 'Placa de la unidad, por ejemplo BSS899 (con o sin guion).' } },
        required: ['placa'],
      },
    },
    async ejecutar(args, db) {
      const r = await datosGpsUnidad(db, args.placa);
      if (!r.ok) throw new ErrorConsulta(r.error);
      const { ok, ...datos } = r;
      return datos;
    },
  },

  ficha_unidad: {
    permiso: PERMISO_UNIDAD,
    sinPermiso: 'Esta persona no tiene permiso para ver vehículos. Dile que lo solicite al administrador.',
    declaracion: {
      name: 'ficha_unidad',
      description: 'Ficha de un vehículo por su placa: cliente, marca, modelo, tipo, año, combustible, estado y si mide por km u horas.',
      parameters: {
        type: 'OBJECT',
        properties: { placa: { type: 'STRING', description: 'Placa del vehículo, por ejemplo BSS899.' } },
        required: ['placa'],
      },
    },
    async ejecutar(args, db) {
      const placa = limpiarPlaca(args.placa);
      if (placa.length < 5) throw new ErrorConsulta('No entendí la placa. Pídele que la repita completa.');
      const [f] = await db_query(db,
        `SELECT placa, cliente, marca, modelo_uts, tipo, sub_tipo, anio, combustible, estado, metrica, configuracion, color, tara, carga_util
         FROM placas WHERE REPLACE(REPLACE(UPPER(placa), '-', ''), ' ', '') = ? LIMIT 1`, [placa]);
      if (!f) throw new ErrorConsulta(`La placa ${placa} no está registrada en el sistema.`);
      return { placa: f.placa, cliente: f.cliente || '', marca: f.marca || '', modelo: f.modelo_uts || '', tipo: f.tipo || '', subtipo: f.sub_tipo || '',
        anio: f.anio || '', combustible: f.combustible || '', estado: f.estado || '', se_mide_por: f.metrica || 'km', configuracion: f.configuracion || '', color: f.color || '',
        tara: f.tara || '', carga_util: f.carga_util || '' };
    },
  },

  proximo_mantenimiento: {
    permiso: PERMISO_MANTENIMIENTO,
    sinPermiso: 'Esta persona no tiene permiso para ver mantenimientos. Dile que lo solicite al administrador.',
    declaracion: {
      name: 'proximo_mantenimiento',
      description: 'Próximos mantenimientos preventivos de una unidad por su placa: para cada tipo de mantenimiento (MP), el último que se hizo, el km al que toca el siguiente y cuántos km faltan (negativo = ya vencido). Usa el kilometraje actual del GPS.',
      parameters: {
        type: 'OBJECT',
        properties: { placa: { type: 'STRING', description: 'Placa de la unidad, por ejemplo BSS899.' } },
        required: ['placa'],
      },
    },
    async ejecutar(args, db) {
      const placa = limpiarPlaca(args.placa);
      if (placa.length < 5) throw new ErrorConsulta('No entendí la placa. Pídele que la repita completa.');
      const limpia = "REPLACE(REPLACE(UPPER(%s), '-', ''), ' ', '')";
      const [unidad] = await db_query(db, `SELECT placa, metrica FROM placas WHERE ${limpia.replace('%s', 'placa')} = ? LIMIT 1`, [placa]);
      const filas = await db_query(db,
        `SELECT f.tipo_mp, DATE_FORMAT(f.fecha, '%Y-%m-%d') AS fecha, f.km_actual, f.km_proximo, f.frecuencia_km
         FROM fleetrun f
         INNER JOIN (SELECT tipo_mp, MAX(fecha) AS max_fecha FROM fleetrun WHERE ${limpia.replace('%s', 'placa')} = ? GROUP BY tipo_mp) u
           ON u.tipo_mp = f.tipo_mp AND u.max_fecha = f.fecha
         WHERE ${limpia.replace('%s', 'f.placa')} = ?
         ORDER BY f.tipo_mp`, [placa, placa]);
      if (!filas.length) throw new ErrorConsulta(`La placa ${placa} no tiene mantenimientos preventivos registrados.`);

      // Kilometraje actual: el del GPS; si no responde, el del último mantenimiento registrado
      const gps = await datosGpsUnidad(db, placa);
      const porHoras = String(unidad?.metrica || '').toLowerCase().startsWith('hora');
      const actualGps = gps.ok ? (porHoras ? gps.horas_motor : gps.km_gps) : null;
      const ultimoRegistrado = Math.max(...filas.map(f => Number(f.km_actual) || 0));
      const actual = actualGps || ultimoRegistrado || null;
      const unidadMedida = porHoras ? 'horas' : 'km';

      const mantenimientos = filas
        .filter(f => Number(f.km_proximo) > 0)
        .map(f => {
          const proximo = Number(f.km_proximo);
          const faltan = actual != null ? Math.round(proximo - actual) : null;
          return {
            tipo: f.tipo_mp, ultimo_realizado: f.fecha, km_del_ultimo: Number(f.km_actual) || null, toca_a_los: proximo,
            faltan, estado: faltan == null ? 'sin dato actual' : faltan < 0 ? 'VENCIDO' : faltan <= 1000 ? 'por vencer' : 'al día',
          };
        })
        .sort((a, b) => (a.faltan ?? 1e9) - (b.faltan ?? 1e9))
        .slice(0, 8);
      return {
        placa, medido_en: unidadMedida, actual, fuente_actual: actualGps ? 'GPS en vivo' : 'último mantenimiento registrado (el GPS no respondió)',
        mantenimientos,
      };
    },
  },

  ordenes_trabajo_unidad: {
    permiso: PERMISO_TALLER,
    sinPermiso: 'Esta persona no tiene permiso para ver el taller. Dile que lo solicite al administrador.',
    declaracion: {
      name: 'ordenes_trabajo_unidad',
      description: 'Órdenes de trabajo (OT) de taller de una unidad por su placa: las que están abiertas ahora (en proceso o pausadas, con su situación, motivo, rampa y técnicos) y las últimas terminadas. Úsala para "¿está en taller?", "¿qué le están haciendo?" o "estado de las OT de la placa X".',
      parameters: {
        type: 'OBJECT',
        properties: { placa: { type: 'STRING', description: 'Placa de la unidad, por ejemplo BSS899.' } },
        required: ['placa'],
      },
    },
    async ejecutar(args, db) {
      const placa = placaDeArgs(args);
      const filas = await db_query(db,
        `SELECT COALESCE(NULLIF(o.id_ot, ''), o.ticket_entrada) AS ot, o.estado, DATE_FORMAT(o.fecha_ingreso, '%Y-%m-%d') AS ingreso,
                DATE_FORMAT(o.fecha_hora_salida, '%Y-%m-%d') AS salida, ${OT_TIPO_SQL} AS tipo,
                JSON_UNQUOTE(JSON_EXTRACT(o.detalles_json, '$.situacion')) AS situacion,
                JSON_UNQUOTE(JSON_EXTRACT(o.detalles_json, '$.motivo')) AS motivo,
                JSON_UNQUOTE(JSON_EXTRACT(o.detalles_json, '$.rampa')) AS rampa,
                ${OT_TECNICO_SQL} AS tecnicos
         FROM ordenes_trabajo o
         WHERE ${SQL_PLACA('o.placa')} = ?
         ORDER BY o.fecha_ingreso DESC LIMIT 40`, [placa]);
      if (!filas.length) throw new ErrorConsulta(`La placa ${placa} no tiene órdenes de trabajo registradas.`);
      const cerrada = (e) => /finaliz|anulad|cerrad/i.test(String(e || ''));
      const fila = (r) => ({ ot: r.ot || '', estado: r.estado || '', ingreso: r.ingreso || '', salida: r.salida || '', tipo: r.tipo || '',
        situacion: r.situacion && r.situacion !== 'null' ? r.situacion : '', motivo: texto(r.motivo), rampa: r.rampa && r.rampa !== 'null' ? r.rampa : '', tecnicos: texto(r.tecnicos, 80) });
      return {
        placa,
        en_taller_ahora: filas.some(r => !cerrada(r.estado)),
        abiertas: filas.filter(r => !cerrada(r.estado)).map(fila),
        ultimas_terminadas: filas.filter(r => /finaliz/i.test(String(r.estado || ''))).slice(0, 3).map(fila),
        total_registradas: filas.length,
      };
    },
  },

  documentos_unidad: {
    permiso: PERMISO_DOCUMENTOS,
    sinPermiso: 'Esta persona no tiene permiso para ver los documentos de flota. Dile que lo solicite al administrador.',
    declaracion: {
      name: 'documentos_unidad',
      description: 'Documentos de una unidad por su placa con su vencimiento: tarjeta de circulación, SOAT, MATPEL, revisión técnica, bonificación, seguros (vehicular y de carga), fumigación y extintor. Indica cuáles están vencidos o por vencer. Úsala también para "¿qué documentos vencen pronto?" de una placa.',
      parameters: {
        type: 'OBJECT',
        properties: { placa: { type: 'STRING', description: 'Placa de la unidad, por ejemplo BSS899.' } },
        required: ['placa'],
      },
    },
    async ejecutar(args, db) {
      const placa = placaDeArgs(args);
      const [v] = await db_query(db,
        `SELECT placa, tc_vencimiento, soat_entidad, soat_vencimiento, matpel_vencimiento, rt_vencimiento, boni_vencimiento,
                sv_entidad, sv_vencimiento, sc_entidad, sc_vencimiento, fum_vencimiento, ext_vencimiento
         FROM vehiculos_flota WHERE ${SQL_PLACA('placa')} = ? LIMIT 1`, [placa]);
      if (!v) throw new ErrorConsulta(`La placa ${placa} no tiene documentos cargados en Flota > Documentos.`);
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const lista = [
        ['Tarjeta de circulación', v.tc_vencimiento, ''], ['SOAT', v.soat_vencimiento, v.soat_entidad], ['MATPEL', v.matpel_vencimiento, ''],
        ['Revisión técnica', v.rt_vencimiento, ''], ['Bonificación', v.boni_vencimiento, ''], ['Seguro vehicular', v.sv_vencimiento, v.sv_entidad],
        ['Seguro de carga', v.sc_vencimiento, v.sc_entidad], ['Fumigación', v.fum_vencimiento, ''], ['Extintor', v.ext_vencimiento, ''],
      ].map(([documento, f, entidad]) => {
        const d = f ? new Date(`${fechaCorta(f)}T00:00:00`) : null;
        const dias = d && !isNaN(d.getTime()) ? Math.round((d - hoy) / 86400000) : null;
        return { documento, vence: dias == null ? 'sin fecha cargada' : fechaCorta(f), dias_restantes: dias, entidad: entidad || undefined,
          estado: dias == null ? 'sin dato' : dias < 0 ? 'VENCIDO' : dias <= 30 ? 'por vencer (30 días o menos)' : 'vigente' };
      });
      lista.sort((a, b) => (a.dias_restantes ?? 1e9) - (b.dias_restantes ?? 1e9));
      return { placa, documentos: lista };
    },
  },

  conductor_unidad: {
    permiso: PERMISO_VIAJES,
    sinPermiso: 'Esta persona no tiene permiso para ver viajes ni conductores. Dile que lo solicite al administrador.',
    declaracion: {
      name: 'conductor_unidad',
      description: 'Quién maneja una unidad por su placa: el conductor de sus últimos viajes (con ruta, fecha y estado) y el último registrado en el status de unidades en base y en taller. No hay una asignación fija: se informa el conductor más reciente registrado.',
      parameters: {
        type: 'OBJECT',
        properties: { placa: { type: 'STRING', description: 'Placa de la unidad (tracto o remolque), por ejemplo BSS899.' } },
        required: ['placa'],
      },
    },
    async ejecutar(args, db) {
      const placa = placaDeArgs(args);
      const [viajes, base, taller] = await Promise.all([
        db_query(db,
          `SELECT viaje, conductor, DATE_FORMAT(fecha_viaje, '%Y-%m-%d') AS fecha, ruta, estado, placa_tracto, placa_remolque
           FROM operaciones_ordenes_viaje
           WHERE ${SQL_PLACA('placa_tracto')} = ? OR ${SQL_PLACA('placa_remolque')} = ?
           ORDER BY fecha_viaje DESC LIMIT 3`, [placa, placa]).catch(() => []),
        db_query(db,
          `SELECT conductor, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, zona, estado
           FROM seg_unidades_base WHERE ${SQL_PLACA('placa_camion')} = ? AND conductor IS NOT NULL AND conductor != ''
           ORDER BY fecha DESC, id DESC LIMIT 1`, [placa]).catch(() => []),
        db_query(db,
          `SELECT JSON_UNQUOTE(JSON_EXTRACT(o.detalles_json, '$.conductor')) AS conductor, DATE_FORMAT(o.fecha_ingreso, '%Y-%m-%d') AS fecha
           FROM ordenes_trabajo o WHERE ${SQL_PLACA('o.placa')} = ? ORDER BY o.fecha_ingreso DESC LIMIT 1`, [placa]).catch(() => []),
      ]);
      if (!viajes.length && !base.length && !(taller[0]?.conductor && taller[0].conductor !== 'null')) {
        throw new ErrorConsulta(`No hay conductor registrado para la placa ${placa} en viajes, unidades en base ni taller.`);
      }
      return {
        placa,
        ultimos_viajes: viajes.map(r => ({ viaje: r.viaje, conductor: r.conductor || '', fecha: r.fecha, ruta: r.ruta || '', estado: r.estado || '',
          tracto: r.placa_tracto || '', remolque: r.placa_remolque || '' })),
        ultimo_en_unidades_base: base[0] ? { conductor: base[0].conductor, fecha: base[0].fecha, zona: base[0].zona || '', estado: base[0].estado || '' } : null,
        ultimo_en_taller: taller[0]?.conductor && taller[0].conductor !== 'null' ? { conductor: taller[0].conductor, fecha: taller[0].fecha } : null,
      };
    },
  },

  stock_articulo: {
    permiso: PERMISO_INVENTARIO,
    sinPermiso: 'Esta persona no tiene permiso para ver el inventario. Dile que lo solicite al administrador.',
    declaracion: {
      name: 'stock_articulo',
      description: 'Stock actual de artículos del almacén buscando por código (INV-0123) o por palabras de la descripción (por ejemplo "filtro de aceite" o "llanta 295"). Devuelve hasta 8 coincidencias con stock, mínimo, unidad, almacén y costo.',
      parameters: {
        type: 'OBJECT',
        properties: { buscar: { type: 'STRING', description: 'Código del artículo o palabras de su descripción.' } },
        required: ['buscar'],
      },
    },
    async ejecutar(args, db) {
      const palabras = String(args.buscar || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(w => w.length >= 2).slice(0, 5);
      if (!palabras.length) throw new ErrorConsulta('Dime qué artículo buscar (código o palabras de su nombre).');
      const cond = palabras.map(() => "(LOWER(i.id) LIKE ? OR LOWER(i.descripcion) LIKE ? OR LOWER(COALESCE(i.marca, '')) LIKE ?)").join(' AND ');
      const params = palabras.flatMap(w => [`%${w}%`, `%${w}%`, `%${w}%`]);
      // Mismo cálculo de stock que el inventario: se le agrega el filtro a su consulta
      const sql = STOCK_SQL.replace(/WHERE i\.activo=1\s+ORDER BY i\.id/, `WHERE i.activo=1 AND ${cond} ORDER BY stock_actual DESC LIMIT 8`);
      if (sql === STOCK_SQL) throw new Error('STOCK_SQL cambió: revisar stock_articulo');
      const filas = await db_query(db, sql, params);
      if (!filas.length) throw new ErrorConsulta(`No encontré artículos que coincidan con "${texto(args.buscar, 60)}".`);
      return {
        coincidencias: filas.length,
        articulos: filas.map(r => ({ codigo: r.id, descripcion: r.descripcion, familia: r.familia || '', almacen: r.almacen || '', unidad: r.unidad || '',
          stock: Number(r.stock_actual) || 0, stock_minimo: Number(r.stock_min) || 0,
          bajo_minimo: Number(r.stock_min) > 0 && Number(r.stock_actual) <= Number(r.stock_min),
          costo_soles: dinero(r.costo_soles), estado: r.estado_art || '' })),
      };
    },
  },

  llantas_unidad: {
    permiso: PERMISO_NEUMATICOS,
    sinPermiso: 'Esta persona no tiene permiso para ver neumáticos. Dile que lo solicite al administrador.',
    declaracion: {
      name: 'llantas_unidad',
      description: 'Llantas montadas ahora en una unidad por su placa: posición, código, marca, modelo, medida, vida (R0 nueva, R1 reencauchada…), remanente en mm y km acumulado.',
      parameters: {
        type: 'OBJECT',
        properties: { placa: { type: 'STRING', description: 'Placa de la unidad, por ejemplo BSS899.' } },
        required: ['placa'],
      },
    },
    async ejecutar(args, db) {
      const placa = placaDeArgs(args);
      const filas = await db_query(db,
        `SELECT i.posicion, DATE_FORMAT(i.fecha_in, '%Y-%m-%d') AS desde, i.km_in, h.id_neumatico, h.codigo_llanta, h.marca, h.modelo, h.medida, h.vida,
                h.remanente_actual, h.km_acumulado
         FROM neumaticos_instalaciones i
         JOIN neumaticos_hoja_vida h ON h.id_neumatico = i.id_neumatico COLLATE utf8mb4_unicode_ci
         WHERE ${SQL_PLACA('i.placa')} = ? AND i.fecha_out IS NULL
         ORDER BY CAST(i.posicion AS UNSIGNED), i.posicion`, [placa]);
      if (!filas.length) throw new ErrorConsulta(`La placa ${placa} no tiene llantas montadas registradas.`);
      return {
        placa, llantas_montadas: filas.length,
        llantas: filas.map(r => ({ posicion: r.posicion || '', codigo: r.codigo_llanta || r.id_neumatico, marca: r.marca || '', modelo: r.modelo || '', medida: r.medida || '',
          vida: r.vida || '', remanente_mm: r.remanente_actual != null ? Number(r.remanente_actual) : null,
          km_acumulado: r.km_acumulado != null ? Number(r.km_acumulado) : null, montada_desde: r.desde || '' })),
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
    return { error: h.sinPermiso || 'Esta persona no tiene permiso para ver costos de taller. Dile que lo solicite al administrador.' };
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
