// Llantas despachadas por almacén para una OT, por código de fuego (tabla neumaticos_asignaciones).
//   asignada  → despachada a una placa, aún sin instalar (solo esa placa la ve como «disponible para uso»)
//   instalada → ya montada en la unidad
//   liberada  → se anuló la salida: vuelve a estar disponible para cualquier unidad
// Todas las funciones reciben una conexión con promesas (pool o conexión de transacción).
const { esArticuloLlanta, vidaInicialDe } = require('./neumaticos_codigo');

/** Almacenes de los que sale una llanta para usarse: Nuevas, Reencauche (ya reencauchadas), Reparadas y Retén */
const ALMACENES_DESPACHO = [100, 1142, 1144, 1146];

const aviso = (status, msg, extra) => Object.assign(new Error(msg), { status, aviso: true, ...(extra || {}) });
const mayus = v => String(v == null ? '' : v).trim().toUpperCase();
const ahoraLima = () => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(new Date()).replace('T', ' ');

/**
 * ¿La línea es una llanta? Devuelve { esLlanta, art, inv } (art = datos de neumaticos_articulo, inv = artículo de inventario).
 * Solo cuentan los artículos de familia NEUMATICOS con medida registrada (igual que la recepción de compra).
 */
async function datosDeLinea(db, inventarioId) {
    const id = String(inventarioId || '').trim();
    if (!id) return { esLlanta: false };
    const [invs] = await db.query('SELECT id, descripcion, familia, marca FROM inventario WHERE id = ? LIMIT 1', [id]);
    if (!invs.length) return { esLlanta: false };
    const [arts] = await db.query('SELECT * FROM neumaticos_articulo WHERE inventario_id = ?', [id]);
    const art = arts[0] || null;
    return { esLlanta: esArticuloLlanta(invs[0], art), art, inv: invs[0] };
}

/** Nombres de las líneas que son llantas (las llantas solo salen por solicitud con código de fuego) */
async function nombresDeLlantas(db, items) {
    const nombres = [];
    for (const it of Array.isArray(items) ? items : []) {
        const d = await datosDeLinea(db, it && it.inventario_id);
        if (d.esLlanta) nombres.push((it.descripcion || d.inv.descripcion || it.inventario_id));
    }
    return nombres;
}

/** Condiciones SQL y parámetros para las llantas de un artículo (misma medida, marca, modelo y vida) */
function filtroDeArticulo({ art, inv }) {
    const where = ['UPPER(TRIM(h.medida)) = ?', "COALESCE(h.vida, 'R0') = ?"];
    const params = [mayus(art.medida), vidaInicialDe(art)];
    if (mayus(inv.marca)) { where.push('UPPER(TRIM(h.marca)) = ?'); params.push(mayus(inv.marca)); }
    if (mayus(art.modelo)) { where.push('UPPER(TRIM(h.modelo)) = ?'); params.push(mayus(art.modelo)); }
    return { where, params };
}

/**
 * Llantas que almacén puede despachar de un artículo: con código de fuego, en un almacén de uso y sin asignación abierta.
 * `sinCodigo`: cuántas llantas de ese artículo siguen sin código de fuego (no se pueden despachar hasta asignárselo en Neumáticos).
 */
async function candidatasDeArticulo(db, inventarioId) {
    const d = await datosDeLinea(db, inventarioId);
    if (!d.esLlanta) return { es_llanta: false, llantas: [], sin_codigo: 0 };
    const { where, params } = filtroDeArticulo(d);
    const base = `FROM neumaticos_hoja_vida h
                  LEFT JOIN neumaticos_asignaciones a ON a.id_neumatico = h.id_neumatico AND a.estado = 'asignada'
                  WHERE h.estado_ciclo = 'en_almacen' AND h.almacen_id IN (?) AND a.id IS NULL AND ${where.join(' AND ')}`;
    const [llantas] = await db.query(
        `SELECT h.id_neumatico, h.codigo_llanta AS codigo, h.serie, COALESCE(h.vida, 'R0') AS vida, h.remanente_actual, h.almacen_id,
                h.marca, h.modelo, h.medida
         ${base} AND h.codigo_llanta IS NOT NULL AND TRIM(h.codigo_llanta) <> ''
         ORDER BY h.codigo_llanta`,
        [ALMACENES_DESPACHO, ...params]);
    const [[sc]] = await db.query(
        `SELECT COUNT(*) AS n ${base} AND (h.codigo_llanta IS NULL OR TRIM(h.codigo_llanta) = '')`,
        [ALMACENES_DESPACHO, ...params]);
    return { es_llanta: true, llantas, sin_codigo: Number(sc.n) || 0, medida: d.art.medida, descripcion: d.inv.descripcion };
}

/**
 * Valida los códigos de fuego elegidos para las líneas de llanta que se van a despachar. No escribe nada.
 *   lineas:   [{ detalle_id, inventario_id, cantidad, descripcion }]
 *   elegidas: { [detalle_id]: [codigo, ...] }
 * Devuelve la lista de { detalle_id, inventario_id, codigos: [{ codigo, id_neumatico }] } de las líneas que son llanta.
 * Lanza un aviso (400) si falta algún código, sobra, se repite o la llanta no corresponde al artículo.
 */
async function validarDespacho(db, lineas, elegidas) {
    const mapa = elegidas && typeof elegidas === 'object' ? elegidas : {};
    const resultado = [];
    const usados = new Set();
    for (const l of lineas) {
        const d = await datosDeLinea(db, l.inventario_id);
        if (!d.esLlanta) continue;
        const nombre = l.descripcion || d.inv.descripcion || l.inventario_id;
        const cantidad = Math.round(Number(l.cantidad) || 0);
        if (Math.abs((Number(l.cantidad) || 0) - cantidad) > 1e-9) throw aviso(400, `${nombre}: la cantidad de llantas debe ser un número entero.`);
        const codigos = [...new Set((Array.isArray(mapa[l.detalle_id]) ? mapa[l.detalle_id] : []).map(mayus).filter(Boolean))];
        if (codigos.length !== cantidad) {
            throw aviso(400, `${nombre}: elige ${cantidad === 1 ? 'el código' : `los ${cantidad} códigos`} de fuego de ${cantidad === 1 ? 'la llanta' : 'las llantas'} que se entrega${cantidad === 1 ? '' : 'n'} (elegidos: ${codigos.length}).`,
                { llantas_requeridas: { detalle_id: l.detalle_id, inventario_id: l.inventario_id, cantidad } });
        }
        const { where, params } = filtroDeArticulo(d);
        const [filas] = await db.query(
            `SELECT h.id_neumatico, h.codigo_llanta, h.estado_ciclo, h.almacen_id,
                    (SELECT COUNT(*) FROM neumaticos_asignaciones a WHERE a.id_neumatico = h.id_neumatico AND a.estado = 'asignada') AS asignada,
                    (${where.join(' AND ')}) AS coincide
             FROM neumaticos_hoja_vida h WHERE UPPER(TRIM(h.codigo_llanta)) IN (?)`,
            [...params, codigos]);
        const porCodigo = new Map(filas.map(f => [mayus(f.codigo_llanta), f]));
        const items = [];
        for (const c of codigos) {
            const f = porCodigo.get(c);
            if (!f) throw aviso(400, `${nombre}: la llanta ${c} no existe o aún no tiene código de fuego.`);
            if (usados.has(c)) throw aviso(400, `La llanta ${c} está elegida en más de una línea.`);
            if (f.estado_ciclo !== 'en_almacen' || !ALMACENES_DESPACHO.includes(Number(f.almacen_id))) throw aviso(409, `La llanta ${c} no está disponible en el almacén (puede estar montada o en reforma).`);
            if (Number(f.asignada) > 0) throw aviso(409, `La llanta ${c} ya está asignada a otra solicitud.`);
            if (!Number(f.coincide)) throw aviso(400, `La llanta ${c} no corresponde al artículo «${nombre}» (marca, modelo, medida o vida distintas).`);
            usados.add(c);
            items.push({ codigo: c, id_neumatico: f.id_neumatico });
        }
        resultado.push({ detalle_id: l.detalle_id, inventario_id: l.inventario_id, codigos: items });
    }
    return resultado;
}

/** Registra la asignación de las llantas validadas: quedan ligadas a la salida, la OT y la placa de la salida */
async function asignarDespacho(db, salidaId, validadas, usuario) {
    if (!validadas.length) return 0;
    const [cab] = await db.query('SELECT placa, ticket_ot FROM salidas_inv WHERE id = ?', [salidaId]);
    const placa = cab.length ? (mayus(cab[0].placa) || null) : null;
    const ticket = cab.length ? (String(cab[0].ticket_ot || '').trim() || null) : null;
    let n = 0;
    for (const v of validadas) {
        for (const c of v.codigos) {
            const [r] = await db.query(
                `INSERT INTO neumaticos_asignaciones (id_neumatico, salida_id, detalle_id, ticket_ot, placa, estado, usuario)
                 VALUES (?, ?, ?, ?, ?, 'asignada', ?)`,
                [c.id_neumatico, String(salidaId), v.detalle_id, ticket, placa, usuario || null]);
            n += r.affectedRows || 0;
        }
    }
    return n;
}

/** Libera las llantas asignadas de una salida (anulada o eliminada). Las ya instaladas no se tocan. */
async function liberarDeSalida(db, salidaId, motivo) {
    const [r] = await db.query(
        `UPDATE neumaticos_asignaciones SET estado = 'liberada', liberada_en = ?, motivo_liberacion = ?
         WHERE salida_id = ? AND estado = 'asignada'`,
        [ahoraLima(), String(motivo || 'Salida anulada').slice(0, 200), String(salidaId)]);
    return r.affectedRows || 0;
}

/** Asignación abierta de una llanta (o null) */
async function asignacionAbierta(db, idNeumatico) {
    const [f] = await db.query("SELECT * FROM neumaticos_asignaciones WHERE id_neumatico = ? AND estado = 'asignada' LIMIT 1", [idNeumatico]);
    return f[0] || null;
}

/**
 * Antes de instalar: una llanta asignada a una placa solo se instala en esa placa.
 * Para usarla en otra hay que anular la solicitud (salida) y pedirla de nuevo.
 */
async function validarInstalacion(db, idNeumatico, placa) {
    const a = await asignacionAbierta(db, idNeumatico);
    if (!a || !mayus(a.placa)) return;
    if (mayus(a.placa) !== mayus(placa)) {
        throw aviso(409, `La llanta está asignada a la placa ${a.placa}${a.ticket_ot ? ` (OT ${a.ticket_ot})` : ''}. Para instalarla en ${placa}, anula esa solicitud en almacén y pídela de nuevo.`);
    }
}

/** Al instalar: se cierra la asignación abierta de la llanta */
async function cerrarAlInstalar(db, idNeumatico) {
    const [r] = await db.query(
        "UPDATE neumaticos_asignaciones SET estado = 'instalada', instalada_en = ? WHERE id_neumatico = ? AND estado = 'asignada'",
        [ahoraLima(), idNeumatico]);
    return r.affectedRows || 0;
}

module.exports = {
    ALMACENES_DESPACHO, aviso, datosDeLinea, nombresDeLlantas, candidatasDeArticulo, validarDespacho, asignarDespacho, liberarDeSalida,
    asignacionAbierta, validarInstalacion, cerrarAlInstalar,
};
