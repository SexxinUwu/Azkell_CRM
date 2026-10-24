// Kilometraje de neumáticos.
// Un neumático de remolque o carreta no tiene GPS propio: sus km salen del tracto con el que
// estuvo enganchado en cada viaje. Un neumático de tracto usa el odómetro GPS diario (km_snapshots).
//
// `db` es el pool con API de promesas del tenant actual (el mismo que usan operaciones y neumáticos):
// `db.query(sql, params)` devuelve `[rows]`.

// SUPUESTO: la tabla de instalaciones todavía no está en prisma/schema/neumaticos.prisma.
// Confirmar el nombre y las columnas (id_neumatico, placa, fecha_in, fecha_out) con el Agente 1.
const TABLA_INSTALACIONES = 'neumaticos_instalaciones';

const ESTADOS_VIAJE_CERRADO = ['FINALIZADO', 'LIQUIDADO']; // mismos estados que usa services/liquidacion_viaje.js
const VALORES_MOTORA = ['SI', '1', 'MOTORA'];              // mismos valores que routes/neumaticos.js (campo placas.motora)

// Placa sin guiones ni espacios, en mayúsculas (así se guardan y comparan en km_snapshots y placas)
function normPlaca(valor) {
    return String(valor || '').replace(/[-\s]/g, '').toUpperCase();
}

// Expresión SQL equivalente a normPlaca() sobre una columna
function sqlPlaca(columna) {
    return `UPPER(REPLACE(REPLACE(${columna}, '-', ''), ' ', ''))`;
}

// Fecha como 'AAAA-MM-DD' (acepta Date o texto). Date se toma en hora local para no correr el día.
function fechaSql(valor) {
    if (!valor) return null;
    if (valor instanceof Date) {
        if (isNaN(valor.getTime())) return null;
        const y = valor.getFullYear();
        const m = String(valor.getMonth() + 1).padStart(2, '0');
        const d = String(valor.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const m = String(valor).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
}

// Hoy en Lima (fecha de salida de una instalación abierta)
function hoyLima() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function redondear1(n) {
    return Math.round(n * 10) / 10;
}

// Un viaje es "cerrado" cuando está FINALIZADO o LIQUIDADO
function sqlEstadoCerrado() {
    return `UPPER(TRIM(ov.estado)) IN (${ESTADOS_VIAJE_CERRADO.map(() => '?').join(', ')})`;
}

/**
 * Km de un remolque en un periodo: suma los viajes cerrados donde la placa aparece como placa_remolque.
 *
 * Por viaje:
 *   REGLA 1 (gps):      orden.km_recorrido_gps (guardado al cerrar el viaje, fuente WIALON). Si viene
 *                       `recorridoGpsPorViaje` (Map viaje -> km) y la orden no tiene el valor, se usa ese.
 *   REGLA 2 (odometro): si no hay km GPS, kilometraje_final - kilometraje_inicial (odómetro del tracto).
 *   Si ninguna aplica, el viaje cuenta 0 y se marca 'sin_dato'.
 *
 * Fecha del viaje: COALESCE(fecha_inicio, fecha_viaje). desde/hasta son opcionales y se comparan por día.
 */
async function calcularKmRemolquePorViaje(db, { placaRemolque, desde, hasta, recorridoGpsPorViaje } = {}) {
    const placa = normPlaca(placaRemolque);
    const vacio = { km: 0, viajes: [], sinDato: 0 };
    if (!db || !placa) return vacio;

    const params = [...ESTADOS_VIAJE_CERRADO, placa];
    let where = `${sqlEstadoCerrado()} AND ${sqlPlaca('ov.placa_remolque')} = ?`;
    const fechaViaje = 'DATE(COALESCE(ov.fecha_inicio, ov.fecha_viaje))';
    const d1 = fechaSql(desde);
    const d2 = fechaSql(hasta);
    if (d1) { where += ` AND ${fechaViaje} >= ?`; params.push(d1); }
    if (d2) { where += ` AND ${fechaViaje} <= ?`; params.push(d2); }

    const [viajes] = await db.query(
        `SELECT ov.viaje, ov.placa_tracto, ov.kilometraje_inicial, ov.kilometraje_final, ov.km_recorrido_gps
         FROM operaciones_ordenes_viaje ov
         WHERE ${where}
         ORDER BY COALESCE(ov.fecha_inicio, ov.fecha_viaje), ov.id`,
        params
    );

    let km = 0;
    let sinDato = 0;
    const detalle = [];

    for (const v of viajes) {
        let kmViaje = 0;
        let fuente = 'sin_dato';

        // REGLA 1: km GPS guardado en la orden; si no está, el que venga en el mapa
        const gpsGuardado = v.km_recorrido_gps == null ? NaN : Number(v.km_recorrido_gps);
        const gpsMapa = recorridoGpsPorViaje instanceof Map ? Number(recorridoGpsPorViaje.get(v.viaje)) : NaN;
        const gps = Number.isFinite(gpsGuardado) ? gpsGuardado : gpsMapa;
        const ini = v.kilometraje_inicial == null ? NaN : Number(v.kilometraje_inicial);
        const fin = v.kilometraje_final == null ? NaN : Number(v.kilometraje_final);

        // REGLA 2: odómetro del tracto (si no hay GPS)
        if (Number.isFinite(gps) && gps > 0) {
            kmViaje = gps;
            fuente = 'gps';
        } else if (Number.isFinite(ini) && Number.isFinite(fin) && ini > 0 && fin >= ini) {
            kmViaje = fin - ini;
            fuente = 'odometro';
        }

        if (fuente === 'sin_dato') sinDato++;
        km += kmViaje;
        detalle.push({ viaje: v.viaje, placa_tracto: v.placa_tracto, km: redondear1(kmViaje), fuente });
    }

    return { km: redondear1(km), viajes: detalle, sinDato };
}

// ¿La placa es tracto? Se decide con la ficha de placas (motora). Si no tiene ficha,
// se mira en qué columna aparece en las órdenes de viaje.
async function esTracto(db, placa) {
    const [fichas] = await db.query(
        `SELECT motora FROM placas WHERE ${sqlPlaca('placa')} = ? LIMIT 1`,
        [placa]
    );
    if (fichas.length) {
        return VALORES_MOTORA.includes(String(fichas[0].motora || '').trim().toUpperCase());
    }
    const [usos] = await db.query(
        `SELECT SUM(${sqlPlaca('placa_tracto')} = ?) AS como_tracto,
                SUM(${sqlPlaca('placa_remolque')} = ?) AS como_remolque
         FROM operaciones_ordenes_viaje`,
        [placa, placa]
    );
    const u = usos[0] || {};
    return Number(u.como_tracto) > 0 && !(Number(u.como_remolque) > 0);
}

// Odómetro GPS de la placa: lectura más cercana en o antes de la fecha (km_snapshots)
async function odometroGpsEn(db, placa, fecha) {
    const [rows] = await db.query(
        `SELECT km_gps FROM km_snapshots
         WHERE ${sqlPlaca('placa')} = ? AND fecha <= ? AND km_gps > 0
         ORDER BY fecha DESC LIMIT 1`,
        [placa, fecha]
    );
    return rows.length ? Number(rows[0].km_gps) : null;
}

/**
 * Km recorridos por un neumático durante una instalación.
 * instalacion = { placa, fecha_in, fecha_out } (fecha_out null = instalación abierta, se usa hoy en Lima).
 *   - Tracto: odómetro GPS en fecha_out menos odómetro GPS en fecha_in (km_snapshots).
 *   - Remolque: calcularKmRemolquePorViaje entre fecha_in y fecha_out.
 */
async function calcularKmInstalacion(db, instalacion, { recorridoGpsPorViaje } = {}) {
    const placa = normPlaca(instalacion && instalacion.placa);
    const desde = fechaSql(instalacion && instalacion.fecha_in);
    const hasta = fechaSql(instalacion && instalacion.fecha_out) || hoyLima();

    if (!db || !placa || !desde) {
        return { km: 0, fuente: 'sin_dato', tipo: null, motivo: 'Falta placa o fecha de entrada' };
    }
    if (hasta < desde) {
        return { km: 0, fuente: 'sin_dato', tipo: null, motivo: 'La fecha de salida es anterior a la de entrada' };
    }

    if (await esTracto(db, placa)) {
        const kmIn = await odometroGpsEn(db, placa, desde);
        const kmOut = await odometroGpsEn(db, placa, hasta);
        if (kmIn === null || kmOut === null || kmOut < kmIn) {
            return { km: 0, fuente: 'sin_dato', tipo: 'tracto', motivo: 'Sin lectura de odómetro GPS en o antes de la fecha' };
        }
        return { km: kmOut - kmIn, fuente: 'odometro_gps', tipo: 'tracto' };
    }

    const remolque = await calcularKmRemolquePorViaje(db, {
        placaRemolque: placa,
        desde,
        hasta,
        recorridoGpsPorViaje
    });
    return {
        km: remolque.km,
        fuente: 'viajes',
        tipo: 'remolque',
        viajes: remolque.viajes,
        sinDato: remolque.sinDato
    };
}

// Instalaciones de un neumático (ver SUPUESTO en TABLA_INSTALACIONES)
async function listarInstalaciones(db, idNeumatico) {
    const [rows] = await db.query(
        `SELECT placa, fecha_in, fecha_out FROM ${TABLA_INSTALACIONES}
         WHERE id_neumatico = ? ORDER BY fecha_in`,
        [idNeumatico]
    );
    return rows;
}

/**
 * Suma los km de todas las instalaciones del neumático. No escribe nada.
 * Devuelve { km_acumulado, instalaciones: [{ placa, fecha_in, fecha_out, km, fuente, tipo, ... }] }
 */
async function calcularKmAcumuladoLlanta(db, idNeumatico, { recorridoGpsPorViaje } = {}) {
    const instalaciones = await listarInstalaciones(db, idNeumatico);
    let total = 0;
    const detalle = [];
    for (const ins of instalaciones) {
        const r = await calcularKmInstalacion(db, ins, { recorridoGpsPorViaje });
        total += r.km || 0;
        detalle.push({ placa: ins.placa, fecha_in: fechaSql(ins.fecha_in), fecha_out: fechaSql(ins.fecha_out), ...r });
    }
    return { km_acumulado: Math.round(total), instalaciones: detalle };
}

/**
 * Recalcula y guarda neumaticos_hoja_vida.km_acumulado (columna Int).
 */
async function actualizarKmAcumuladoLlanta(db, idNeumatico, opciones = {}) {
    const resultado = await calcularKmAcumuladoLlanta(db, idNeumatico, opciones);
    await db.query(
        'UPDATE neumaticos_hoja_vida SET km_acumulado = ? WHERE id_neumatico = ?',
        [resultado.km_acumulado, idNeumatico]
    );
    return resultado;
}

module.exports = {
    calcularKmRemolquePorViaje,
    calcularKmInstalacion,
    calcularKmAcumuladoLlanta,
    actualizarKmAcumuladoLlanta
};
