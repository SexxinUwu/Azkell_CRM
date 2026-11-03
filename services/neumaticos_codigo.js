// Código de fuego de las llantas (flujo aprobado): letra de la empresa + año (2 dígitos) + número de 5 dígitos.
// La secuencia se reinicia cada año y nunca repite un número. Las llantas que llegan por recepción de compras
// entran como "Sin código de fuego"; las que ya existían con PROV- quedan como "Código provisional".

const ALMACEN_NUEVAS = 100;
const ALMACEN_REENCAUCHE = 1142;
const VIDAS_INICIALES = ['R0', 'R1', 'R2', 'R3'];
const ESTADO_ALMACEN = { ciclo: 'en_almacen', operativo: 'Stock Taller' };
const MOV_ALTA = 'ALTA';
const PREFIJO_PROVISIONAL = 'PROV-';
const PREFIJO_RECEPCION = 'SFC-';

// Error con código HTTP que se devuelve tal cual al usuario
const aviso = (status, msg) => Object.assign(new Error(msg), { status, aviso: true });

/** Año en Lima: la secuencia se reinicia con el año de Lima, no con el del servidor */
function anioLima(fecha = new Date()) {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', year: 'numeric' }).format(fecha));
}

/** R2600001: letra + dos dígitos del año + número de cinco dígitos */
function formatearCodigo(letra, anio, n) {
    return `${letra}${String(anio).slice(-2)}${String(n).padStart(5, '0')}`;
}

/** La letra de la empresa (configurador). Sin letra no se puede generar nada. */
async function leerLetra(conn) {
    const [filas] = await conn.query('SELECT letra FROM neumaticos_codigo_fuego_config WHERE id = 1');
    const letra = filas.length ? String(filas[0].letra || '').toUpperCase() : '';
    if (!/^[A-Z]$/.test(letra)) throw aviso(409, 'Falta configurar la letra del código de fuego de la empresa');
    return letra;
}

/**
 * Asigna códigos consecutivos a las llantas indicadas. Debe correr dentro de una transacción:
 * la fila de la secuencia queda bloqueada hasta el commit, así dos usuarios nunca reciben el mismo número.
 */
async function asignarCodigosFuego(conn, ids, anio = anioLima()) {
    const letra = await leerLetra(conn);
    await conn.query('INSERT IGNORE INTO neumaticos_codigo_fuego_secuencia (anio, ultimo) VALUES (?, 0)', [anio]);
    const [[seq]] = await conn.query('SELECT ultimo FROM neumaticos_codigo_fuego_secuencia WHERE anio = ? FOR UPDATE', [anio]);
    let n = Number(seq.ultimo);

    const asignados = [];
    for (const id of ids) {
        const [filas] = await conn.query(
            'SELECT id_neumatico, codigo_llanta FROM neumaticos_hoja_vida WHERE id_neumatico = ? FOR UPDATE', [id]);
        if (!filas.length) throw aviso(404, `No existe la llanta ${id}`);
        if (String(id).startsWith(PREFIJO_PROVISIONAL)) {
            throw aviso(409, `La llanta ${id} tiene código provisional y no recibe código de fuego`);
        }
        if (String(filas[0].codigo_llanta || '').trim()) {
            throw aviso(409, `La llanta ${id} ya tiene el código ${filas[0].codigo_llanta}`);
        }
        n += 1;
        const codigo = formatearCodigo(letra, anio, n);
        await conn.query('UPDATE neumaticos_hoja_vida SET codigo_llanta = ? WHERE id_neumatico = ?', [codigo, id]);
        asignados.push({ id_neumatico: id, codigo });
    }
    await conn.query('UPDATE neumaticos_codigo_fuego_secuencia SET ultimo = ? WHERE anio = ?', [n, anio]);
    return asignados;
}

/**
 * ¿Este artículo del inventario es una llanta? Solo entonces una recepción da de alta llantas.
 * Debe ser de la familia NEUMATICOS, tener fila en neumaticos_articulo con medida, y su id no puede empezar con SERV
 * (parches, válvulas, aros y servicios de la familia no son llantas).
 * `datos` es la fila de neumaticos_articulo del artículo (o null si no tiene).
 */
function esArticuloLlanta(articulo, datos) {
    const id = String((articulo && articulo.id) || '').trim().toUpperCase();
    if (id.startsWith('SERV')) return false;
    if (String((articulo && articulo.familia) || '').trim().toUpperCase() !== 'NEUMATICOS') return false;
    return !!datos && String(datos.medida || '').trim() !== '';
}

/** Vida con la que se compra la llanta: R0 (nueva), R1, R2 o R3 (ya reencauchada). Sin dato o dato raro, R0. */
function vidaInicialDe(datos) {
    const v = String((datos && datos.vida_inicial) || '').trim().toUpperCase();
    return VIDAS_INICIALES.includes(v) ? v : 'R0';
}

/**
 * Crea una llanta "Sin código de fuego" por cada unidad recibida de un artículo que sí es llanta (ver esArticuloLlanta).
 * Medida, modelo, cocada y vida inicial vienen del artículo "Llanta" (neumaticos_articulo).
 * Vida R0: entra al almacén Nuevas (100). Otra vida (ya reencauchada): entra con esa vida al almacén Reencauche (1142).
 * Si el artículo no es una llanta, no crea nada. Idempotente: si una unidad ya existe (misma recepción y línea) no se vuelve a crear.
 */
async function crearLlantasDeRecepcion(conn, { recepcionId, linea, inventarioId, familia, marca, cantidad, costoUnitario, usuario, fecha }) {
    const cantidadEntera = Math.floor(Number(cantidad) || 0);
    if (cantidadEntera <= 0) return 0;

    // SELECT *: si la base aún no tiene la columna vida_inicial, la llanta entra como nueva (R0)
    const [arts] = await conn.query('SELECT * FROM neumaticos_articulo WHERE inventario_id = ?', [inventarioId]);
    const art = arts[0] || null;
    if (!esArticuloLlanta({ id: inventarioId, familia }, art)) return 0;

    const cocada = art.cocada_inicial == null ? null : Number(art.cocada_inicial);
    const costo = Number(costoUnitario) || 0;
    const vida = vidaInicialDe(art);
    const reencauchada = vida !== 'R0';
    const almacen = reencauchada ? ALMACEN_REENCAUCHE : ALMACEN_NUEVAS;
    const contador = Number(vida.slice(1));

    let creadas = 0;
    for (let k = 1; k <= cantidadEntera; k += 1) {
        const id = `${PREFIJO_RECEPCION}R${recepcionId}-L${linea}-${k}`;
        const [ya] = await conn.query('SELECT 1 FROM neumaticos_hoja_vida WHERE id_neumatico = ? LIMIT 1', [id]);
        if (ya.length) continue;

        await conn.query(
            `INSERT INTO neumaticos_hoja_vida
             (id_neumatico, marca, modelo, medida, estado, remanente_inicial, remanente_actual, costo_compra,
              km_acumulado, estado_ciclo, vida, contador_reencauches, costo_reencauches, almacen_id, estado_operativo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, ?, ?)`,
            [id, marca || '', art.modelo || '', art.medida || '', reencauchada ? 'RENCAUCHADA' : 'NUEVA',
             cocada ?? 0, cocada ?? 0, costo,
             ESTADO_ALMACEN.ciclo, vida, contador, almacen, ESTADO_ALMACEN.operativo]);

        await conn.query(
            `INSERT INTO neumaticos_movimientos
             (id_neumatico, tipo, almacen_origen_id, almacen_destino_id, placa, posicion, km, fecha, usuario, observacion)
             VALUES (?, ?, NULL, ?, NULL, NULL, 0, ?, ?, ?)`,
            [id, MOV_ALTA, almacen, fecha, usuario || null,
             `Recepción de compra ${recepcionId}, línea ${linea}. Costo de compra: ${costo}${reencauchada ? `. Comprada ya reencauchada (${vida})` : ''}`]);
        creadas += 1;
    }
    return creadas;
}

/**
 * Quita las llantas que dio de alta una recepción de compra (SFC-R{recepcion}-L{linea}-{k}).
 * Solo si ninguna se ha movido: si tiene movimientos distintos de la alta, no se borra nada y lanza error.
 */
async function borrarLlantasDeRecepcion(conn, recepcionId) {
    // Acepta la conexión con callbacks (la de las rutas) o con promesas
    const db = typeof conn.promise === 'function' ? conn.promise() : conn;
    const patron = `${PREFIJO_RECEPCION}R${recepcionId}-L%`;
    const [movidas] = await db.query(
        `SELECT DISTINCT m.id_neumatico FROM neumaticos_movimientos m
         WHERE m.id_neumatico LIKE ? AND m.tipo <> ?`, [patron, MOV_ALTA]);
    if (movidas.length) {
        const err = new Error(`No se puede eliminar: ${movidas.length} llanta(s) de esta recepción ya se movieron (por ejemplo ${movidas[0].id_neumatico}).`);
        err.codigo = 'LLANTAS_MOVIDAS';
        throw err;
    }
    await db.query('DELETE FROM neumaticos_movimientos WHERE id_neumatico LIKE ?', [patron]);
    const [res] = await db.query('DELETE FROM neumaticos_hoja_vida WHERE id_neumatico LIKE ?', [patron]);
    return res.affectedRows || 0;
}

/**
 * Corrige las llantas cuando un artículo deja de ser NEUMATICOS en inventario: quita las llantas que dio de alta
 * su línea de recepción. La línea es la posición de la fila dentro de la recepción (el mismo orden del alta).
 * Si alguna de esas llantas ya se movió, no se borra nada de esa línea.
 */
async function corregirLlantasPorInventario(conn, inventarioId) {
    const [arts] = await conn.query('SELECT familia FROM inventario WHERE id = ? LIMIT 1', [inventarioId]);
    if (!arts.length || String(arts[0].familia || '').trim().toUpperCase() === 'NEUMATICOS') return 0;

    const [recs] = await conn.query('SELECT DISTINCT recepcion_id FROM detalle_recepciones_oc WHERE inventario_id = ?', [inventarioId]);
    let borradas = 0;
    for (const { recepcion_id: recepcionId } of recs) {
        const [filas] = await conn.query('SELECT id, inventario_id FROM detalle_recepciones_oc WHERE recepcion_id = ? ORDER BY id', [recepcionId]);
        for (let i = 0; i < filas.length; i += 1) {
            if (filas[i].inventario_id !== inventarioId) continue;
            const patron = `${PREFIJO_RECEPCION}R${recepcionId}-L${i + 1}-%`;
            const [movidas] = await conn.query(
                'SELECT 1 FROM neumaticos_movimientos WHERE id_neumatico LIKE ? AND tipo <> ? LIMIT 1', [patron, MOV_ALTA]);
            if (movidas.length) continue;
            await conn.query('DELETE FROM neumaticos_movimientos WHERE id_neumatico LIKE ?', [patron]);
            const [res] = await conn.query('DELETE FROM neumaticos_hoja_vida WHERE id_neumatico LIKE ?', [patron]);
            borradas += res.affectedRows || 0;
        }
    }
    return borradas;
}

module.exports = {
    ALMACEN_NUEVAS,
    PREFIJO_PROVISIONAL,
    aviso,
    anioLima,
    formatearCodigo,
    leerLetra,
    asignarCodigosFuego,
    crearLlantasDeRecepcion,
    esArticuloLlanta,
    vidaInicialDe,
    borrarLlantasDeRecepcion,
    corregirLlantasPorInventario,
};
