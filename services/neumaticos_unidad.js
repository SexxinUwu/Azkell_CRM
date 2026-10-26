// Posiciones de una unidad para el tablero de neumáticos. Fuente de verdad:
// - La última inspección de la placa define qué llanta hay en cada posición y su medición (r1, r2, r3, remanente).
// - Un movimiento posterior a esa inspección en la misma posición manda: la llanta que entró después es la montada.
// Las filas de inspección no siempre traen el código de la llanta (id_neumatico), así que la posición es la que liga.
// Sin dependencias de la base: los datos llegan ya leídos (ver routes/neumaticos-ciclo.js, cargarTablero).

/** Posición normalizada en mayúsculas. El repuesto se guarda como "R" en la inspección y como "R1" en la configuración. */
function normalizarPosicion(valor) {
    const p = String(valor ?? '').trim().toUpperCase();
    return p === 'R' ? 'R1' : p;
}

/**
 * Decide, por posición, de dónde sale la llanta.
 * @param {object} args
 * @param {string|null} args.fechaInspeccion  fecha yyyy-mm-dd de la última inspección (null si no hay)
 * @param {Array} args.detalleInspeccion      filas de esa inspección: { posicion, id_neumatico, ... }
 * @param {Array} args.instalaciones          montadas abiertas de la unidad: { posicion, fecha_in, id_neumatico, ... }
 * @returns {Array<{posicion: string, fuente: 'movimiento'|'inspeccion', instalacion: object|null, detalle: object|null}>}
 */
function armarPosicionesUnidad({ fechaInspeccion, detalleInspeccion, instalaciones }) {
    const porInspeccion = new Map();
    for (const d of detalleInspeccion) {
        const clave = normalizarPosicion(d.posicion);
        if (!porInspeccion.has(clave)) porInspeccion.set(clave, d);
    }
    // Si hay varias instalaciones abiertas en una posición, la más reciente es la montada
    const porInstalacion = new Map();
    for (const i of instalaciones) {
        const clave = normalizarPosicion(i.posicion);
        const actual = porInstalacion.get(clave);
        if (!actual || String(i.fecha_in) > String(actual.fecha_in)) porInstalacion.set(clave, i);
    }

    const posiciones = [...new Set([...porInspeccion.keys(), ...porInstalacion.keys()])];
    const salida = [];
    for (const posicion of posiciones) {
        const detalle = porInspeccion.get(posicion) || null;
        const instalacion = porInstalacion.get(posicion) || null;
        // Movimiento posterior a la inspección (o posición sin inspección): la instalación manda.
        // La medición de la inspección solo vale si es de la misma llanta.
        if (instalacion && (!detalle || String(instalacion.fecha_in) > String(fechaInspeccion))) {
            const mismaLlanta = !!detalle && !!detalle.id_neumatico && detalle.id_neumatico === instalacion.id_neumatico;
            salida.push({ posicion, fuente: 'movimiento', instalacion, detalle: mismaLlanta ? detalle : null });
        } else if (detalle) {
            // La inspección es igual o más reciente que la instalación: manda la inspección
            salida.push({ posicion, fuente: 'inspeccion', instalacion, detalle });
        }
    }
    return salida;
}

module.exports = { normalizarPosicion, armarPosicionesUnidad };
