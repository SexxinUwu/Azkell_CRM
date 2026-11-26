// Lotes de inventario: cada lote es una capa de costo de un artículo (Lote 1, Lote 2…).
//  · Cada compra recepcionada abre un lote NUEVO con su cantidad y su costo (en soles).
//  · Cada salida despachada descuenta de uno o varios lotes (PEPS: el más antiguo primero, o los lotes que se escanearon en el picking)
//    y se costea con el costo real de cada lote.
//  · El STOCK sigue calculándose como siempre (services/almacen_stock.js). Los lotes sirven para el costo y las etiquetas; si alguna vez se
//    desajustan del stock, sincronizarLotes() los corrige: crea un lote de ajuste si falta o descuenta del más antiguo si sobra.
// Todas las funciones reciben una conexión (o pool) con API de promesas.

const EPS = 1e-6;
const r4 = (x) => Math.round((Number(x) || 0) * 10000) / 10000;

// ─── Piezas puras (se prueban sin base de datos) ─────────────────────────────

/**
 * Reparte una cantidad entre lotes por PEPS (el de menor número primero).
 * @param {Array<{id:number, numero:number, saldo:number, costo_unitario:number}>} lotes
 * @returns {{ partes: Array<{lote_id:number, numero:number, cantidad:number, costo_unitario:number}>, faltante: number }}
 */
function repartirPEPS(lotes, cantidad) {
    let resto = Number(cantidad) || 0;
    const partes = [];
    for (const l of [...lotes].sort((a, b) => a.numero - b.numero)) {
        if (resto <= EPS) break;
        const saldo = Number(l.saldo) || 0;
        if (saldo <= EPS) continue;
        const toma = Math.min(saldo, resto);
        partes.push({ lote_id: l.id, numero: l.numero, cantidad: r4(toma), costo_unitario: r4(l.costo_unitario) });
        resto -= toma;
    }
    return { partes, faltante: resto > EPS ? r4(resto) : 0 };
}

/**
 * Reparte usando los lotes elegidos (los escaneados en el picking): [{numero, cantidad}].
 * Devuelve { error } si un lote no existe o no tiene saldo suficiente.
 */
function repartirElegidos(lotes, elegidos) {
    const porNumero = new Map(lotes.map(l => [Number(l.numero), l]));
    const usado = new Map();
    const partes = [];
    for (const e of elegidos) {
        const n = Number(e.numero);
        const cant = Number(e.cantidad) || 0;
        if (cant <= 0) continue;
        const l = porNumero.get(n);
        if (!l) return { error: `El lote ${n} no existe para este artículo.` };
        const ya = usado.get(n) || 0;
        if (cant + ya > (Number(l.saldo) || 0) + EPS) return { error: `El lote ${n} no tiene saldo suficiente (quedan ${r4((Number(l.saldo) || 0) - ya)}).` };
        usado.set(n, ya + cant);
        partes.push({ lote_id: l.id, numero: l.numero, cantidad: r4(cant), costo_unitario: r4(l.costo_unitario) });
    }
    return { partes };
}

/** Importe y costo unitario promedio de las partes de una línea */
function costearPartes(partes) {
    const cant = partes.reduce((s, p) => s + p.cantidad, 0);
    const importe = r4(partes.reduce((s, p) => s + p.cantidad * p.costo_unitario, 0));
    return { cantidad: r4(cant), importe, costo_unitario: cant > EPS ? r4(importe / cant) : 0 };
}

// ─── Base de datos ───────────────────────────────────────────────────────────

const esServicio = (id) => /^SERV/i.test(String(id || ''));

async function lotesDe(db, inventarioId, { conSaldo = false } = {}) {
    const [filas] = await db.query(
        `SELECT id, inventario_id, numero, costo_unitario, cantidad_inicial, saldo, origen, recepcion_id, entrada_id, fecha
         FROM inventario_lotes WHERE inventario_id = ? ${conSaldo ? 'AND saldo > 0' : ''} ORDER BY numero ASC`, [inventarioId]);
    return filas.map(f => ({ ...f, costo_unitario: Number(f.costo_unitario), cantidad_inicial: Number(f.cantidad_inicial), saldo: Number(f.saldo) }));
}

async function siguienteNumero(db, inventarioId) {
    const [[f]] = await db.query('SELECT COALESCE(MAX(numero), 0) AS n FROM inventario_lotes WHERE inventario_id = ?', [inventarioId]);
    return Number(f.n) + 1;
}

/** Abre un lote nuevo (cada compra es un lote nuevo) */
async function crearLote(db, { inventario_id, cantidad, costo_unitario, origen = 'RECEPCION', recepcion_id = null, entrada_id = null, fecha = null }) {
    if (!inventario_id || esServicio(inventario_id) || !(Number(cantidad) > 0)) return null;
    const numero = await siguienteNumero(db, inventario_id);
    const [r] = await db.query(
        `INSERT INTO inventario_lotes (inventario_id, numero, costo_unitario, cantidad_inicial, saldo, origen, recepcion_id, entrada_id, fecha)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
        [inventario_id, numero, r4(costo_unitario), r4(cantidad), r4(cantidad), origen, recepcion_id, entrada_id, fecha]);
    return { id: r.insertId, numero };
}

/**
 * Descuenta una línea de salida de los lotes y la costea. `elegidos` = [{numero, cantidad}] del picking (si no hay, PEPS).
 * Lo que los lotes no cubran se costea con `costoRespaldo` (el costo actual del artículo) para que nunca se frene un despacho.
 * Es idempotente: antes de repartir, devuelve lo que esa línea ya hubiera consumido.
 */
async function consumirLinea(db, { salida_id, detalle_id, inventario_id, cantidad, elegidos = null, costoRespaldo = 0 }) {
    if (!inventario_id || esServicio(inventario_id) || !(Number(cantidad) > 0)) return null;
    await devolverLinea(db, detalle_id);
    const lotes = await lotesDe(db, inventario_id, { conSaldo: true });
    let partes, faltante = 0;
    if (elegidos && elegidos.length) {
        const r = repartirElegidos(lotes, elegidos);
        if (r.error) throw new Error(r.error);
        partes = r.partes;
        const tomado = partes.reduce((s, p) => s + p.cantidad, 0);
        if (Number(cantidad) - tomado > EPS) {
            // Lo escaneado no alcanza: el resto sale por PEPS de lo que quede
            const restantes = lotes.map(l => ({ ...l, saldo: l.saldo - (partes.filter(p => p.lote_id === l.id).reduce((s, p) => s + p.cantidad, 0)) }));
            const extra = repartirPEPS(restantes, Number(cantidad) - tomado);
            partes = [...partes, ...extra.partes];
            faltante = extra.faltante;
        }
    } else {
        const r = repartirPEPS(lotes, cantidad);
        partes = r.partes; faltante = r.faltante;
    }
    for (const p of partes) {
        await db.query('UPDATE inventario_lotes SET saldo = GREATEST(0, saldo - ?) WHERE id = ?', [p.cantidad, p.lote_id]);
        await db.query('INSERT INTO salida_lotes (salida_id, detalle_id, inventario_id, lote_id, cantidad, costo_unitario) VALUES (?, ?, ?, ?, ?, ?)',
            [salida_id, detalle_id, inventario_id, p.lote_id, p.cantidad, p.costo_unitario]);
    }
    const costeo = costearPartes(partes);
    // Lo que no cubrieron los lotes se costea al costo actual del artículo
    const importe = r4(costeo.importe + faltante * (Number(costoRespaldo) || 0));
    const total = r4(costeo.cantidad + faltante);
    return { partes, faltante, importe, costo_unitario: total > EPS ? r4(importe / total) : 0 };
}

/** Devuelve a sus lotes lo que una línea de salida había consumido (al anular, editar o volver a costear) */
async function devolverLinea(db, detalleId) {
    const [filas] = await db.query('SELECT id, lote_id, cantidad FROM salida_lotes WHERE detalle_id = ?', [detalleId]);
    for (const f of filas) await db.query('UPDATE inventario_lotes SET saldo = saldo + ? WHERE id = ?', [f.cantidad, f.lote_id]);
    if (filas.length) await db.query('DELETE FROM salida_lotes WHERE detalle_id = ?', [detalleId]);
    return filas.length;
}

/** Devuelve a sus lotes todo lo que consumió una salida (al anularla o eliminarla) */
async function devolverSalida(db, salidaId) {
    const [filas] = await db.query('SELECT id, lote_id, cantidad FROM salida_lotes WHERE salida_id = ?', [salidaId]);
    for (const f of filas) await db.query('UPDATE inventario_lotes SET saldo = saldo + ? WHERE id = ?', [f.cantidad, f.lote_id]);
    if (filas.length) await db.query('DELETE FROM salida_lotes WHERE salida_id = ?', [salidaId]);
    return filas.length;
}

/** Quita de los lotes lo que aportó una recepción que se elimina (descuenta del lote que ella abrió) */
async function quitarRecepcion(db, recepcionId) {
    const [lotes] = await db.query('SELECT id, saldo, cantidad_inicial FROM inventario_lotes WHERE recepcion_id = ?', [recepcionId]);
    for (const l of lotes) {
        const [[uso]] = await db.query('SELECT COUNT(*) AS n FROM salida_lotes WHERE lote_id = ?', [l.id]);
        if (Number(uso.n) > 0) await db.query('UPDATE inventario_lotes SET saldo = 0 WHERE id = ?', [l.id]); // ya salió mercadería de ese lote: se agota, se conserva su historia
        else await db.query('DELETE FROM inventario_lotes WHERE id = ?', [l.id]);
    }
    return lotes.length;
}

/**
 * Deja los lotes de un artículo iguales a su stock real. Si no hay lotes, crea el Lote 1 inicial con el costo actual.
 * Si el stock es mayor que la suma de saldos, abre un lote de AJUSTE por la diferencia; si es menor, descuenta del más antiguo.
 * @returns {{ accion: 'inicial'|'ajuste_mas'|'ajuste_menos'|'igual'|'sin_stock', diferencia: number }}
 */
async function sincronizarLotes(db, { inventario_id, stock, costo }) {
    if (!inventario_id || esServicio(inventario_id)) return { accion: 'sin_stock', diferencia: 0 };
    const stk = Math.max(0, r4(stock));
    const lotes = await lotesDe(db, inventario_id);
    const total = r4(lotes.reduce((s, l) => s + l.saldo, 0));
    if (!lotes.length) {
        if (stk <= EPS) return { accion: 'sin_stock', diferencia: 0 };
        await crearLote(db, { inventario_id, cantidad: stk, costo_unitario: costo, origen: 'INICIAL' });
        return { accion: 'inicial', diferencia: stk };
    }
    const dif = r4(stk - total);
    if (Math.abs(dif) <= EPS) return { accion: 'igual', diferencia: 0 };
    if (dif > 0) {
        await crearLote(db, { inventario_id, cantidad: dif, costo_unitario: costo, origen: 'AJUSTE' });
        return { accion: 'ajuste_mas', diferencia: dif };
    }
    let resto = -dif;
    for (const l of lotes.filter(x => x.saldo > EPS)) {
        if (resto <= EPS) break;
        const toma = Math.min(l.saldo, resto);
        await db.query('UPDATE inventario_lotes SET saldo = saldo - ? WHERE id = ?', [r4(toma), l.id]);
        resto -= toma;
    }
    return { accion: 'ajuste_menos', diferencia: dif };
}

/**
 * Valida los lotes elegidos en el picking ANTES de despachar: { [detalleId]: [{numero, cantidad}] }.
 * @returns {Promise<string|null>} mensaje de error, o null si todo está bien
 */
async function validarElegidos(db, detalles, elegidosPorDetalle) {
    const claves = Object.keys(elegidosPorDetalle || {});
    if (!claves.length) return null;
    const porId = new Map(detalles.map(d => [String(d.detalle_id), d]));
    for (const k of claves) {
        const det = porId.get(String(k));
        const elegidos = Array.isArray(elegidosPorDetalle[k]) ? elegidosPorDetalle[k] : [];
        if (!det || !elegidos.length) continue;
        const lotes = await lotesDe(db, det.inventario_id);
        const r = repartirElegidos(lotes, elegidos);
        if (r.error) return `${det.descripcion || det.inventario_id}: ${r.error}`;
    }
    return null;
}

/**
 * Costea con lotes las líneas recién despachadas de una salida y deja su total al día.
 * Corre en su propia transacción: si algo falla, el despacho ya hecho no se toca y las líneas conservan el costo que traían.
 * @param detalles [{ detalle_id, inventario_id, cantidad }]
 * @param elegidosPorDetalle { [detalleId]: [{numero, cantidad}] } (lo que se escaneó en el picking; vacío = PEPS)
 */
async function aplicarDespacho(db, salidaId, detalles, elegidosPorDetalle = {}) {
    const conn = typeof db.getConnection === 'function' ? await db.getConnection() : db;
    try {
        await conn.beginTransaction();
        const ids = [...new Set(detalles.map(d => d.inventario_id).filter(i => i && !esServicio(i)))];
        const costos = new Map();
        if (ids.length) {
            const [inv] = await conn.query('SELECT id, costo_soles, costo_referencial FROM inventario WHERE id IN (?)', [ids]);
            inv.forEach(i => costos.set(String(i.id), Number(i.costo_soles) || Number(i.costo_referencial) || 0));
        }
        let cambio = false;
        for (const d of detalles) {
            if (!d.inventario_id || esServicio(d.inventario_id)) continue;
            const r = await consumirLinea(conn, {
                salida_id: salidaId, detalle_id: d.detalle_id, inventario_id: d.inventario_id, cantidad: d.cantidad,
                elegidos: elegidosPorDetalle[String(d.detalle_id)] || null, costoRespaldo: costos.get(String(d.inventario_id)) || 0,
            });
            if (!r) continue;
            cambio = true;
            await conn.query("UPDATE detalle_salidas_inv SET costo_unitario = ?, importe = ?, moneda = 'PEN' WHERE id = ?", [r.costo_unitario, r.importe, d.detalle_id]);
        }
        if (cambio) await conn.query('UPDATE salidas_inv SET total_pen = (SELECT COALESCE(SUM(importe), 0) FROM detalle_salidas_inv WHERE salida_id = ?) WHERE id = ?', [salidaId, salidaId]);
        await conn.commit();
    } catch (e) {
        try { await conn.rollback(); } catch { /* sin transacción */ }
        throw e;
    } finally {
        if (conn !== db && typeof conn.release === 'function') conn.release();
    }
}

/** Si la salida está despachada, vuelve a costearla con lotes (se usa después de editarla, cuando sus líneas se rehacen) */
async function reaplicarSiDespachada(db, salidaId) {
    const [[s]] = await db.query('SELECT estado FROM salidas_inv WHERE id = ?', [salidaId]);
    if (!s || s.estado !== 'Despachado') return false;
    const [det] = await db.query('SELECT id AS detalle_id, inventario_id, cantidad FROM detalle_salidas_inv WHERE salida_id = ?', [salidaId]);
    await aplicarDespacho(db, salidaId, det.map(d => ({ ...d, cantidad: Number(d.cantidad) })));
    return true;
}

module.exports = { validarElegidos, aplicarDespacho, reaplicarSiDespachada, repartirPEPS, repartirElegidos, costearPartes, lotesDe, crearLote, consumirLinea, devolverLinea, devolverSalida, quitarRecepcion, sincronizarLotes };
