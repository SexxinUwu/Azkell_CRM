// Vincula el nombre de una unidad en Wialon con la placa de la base.
// 1. Nombre exacto cargado en la ficha de la placa (placas.wialon_name).
// 2. Placa peruana dentro del nombre (ABC-123, ABC123, D0L-914), con dígitos; se prefiere la que existe en la base.
// 3. Sin vínculo: se muestra el nombre completo limpio, nunca un recorte (MARSISA01 no pasa a MARSIS).

const normalizarNombre = s => String(s || '').toUpperCase().trim();
const limpiarPlaca = s => String(s || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

// placasRows: filas de `placas` con las columnas placa y wialon_name
function crearResolutorPlacas(placasRows) {
    const porWialon = new Map();
    const placasConocidas = new Set();
    (placasRows || []).forEach(p => {
        const placa = limpiarPlaca(p.placa);
        if (!placa) return;
        placasConocidas.add(placa);
        const wn = normalizarNombre(p.wialon_name);
        if (wn) porWialon.set(wn, placa);
    });

    return function resolverPlaca(nombreWialon) {
        const nombre = normalizarNombre(nombreWialon);
        if (!nombre) return { placa: '', origen: 'sin_nombre' };

        if (porWialon.has(nombre)) return { placa: porWialon.get(nombre), origen: 'wialon_name' };

        // Cada palabra del nombre se revisa sola: una placa peruana tiene 6 caracteres, con o sin guion
        const candidatos = nombre.split(/\s+/)
            .map(t => t.replace(/[^A-Z0-9-]/g, '').replace(/-/g, ''))
            .filter(t => t.length === 6 && /\d/.test(t) && /[A-Z]/.test(t));
        const enBase = candidatos.find(c => placasConocidas.has(c));
        if (enBase) return { placa: enBase, origen: 'patron' };
        if (candidatos.length) return { placa: candidatos[0], origen: 'patron_sin_base' };

        return { placa: limpiarPlaca(nombre), origen: 'nombre' };
    };
}

module.exports = { crearResolutorPlacas };
