// Tipos de unidad con nombre único (misma lista que src/modules/placas/tiposUnidad.ts).
// Un tipo se guarda con un solo nombre: "CARRETA", "carreta" y "Carreta" son lo mismo.
//
// Remolques, según cómo se enganchan:
// - Semirremolque: se acopla al tracto por la quinta rueda; parte de su peso va sobre el tracto.
// - Remolque: se jala con barra de tiro; todo su peso va sobre sus propios ejes.
// - Carreta: nombre común de un semirremolque de dos ejes. Se mantiene aparte hasta confirmar con la tarjeta de propiedad.
// Lo que está en la lista de abajo es lo que usa routes/legacy.js para clasificar las unidades como no motoras.

const TIPOS = ['Camión', 'Tracto', 'Semirremolque', 'Remolque', 'Carreta', 'Cisterna', 'Furgón', 'Plataforma', 'Tolva'];

// Variantes escritas a mano (sin tildes, sin espacios dobles, en minúsculas) → nombre único
const VARIANTES = {
    'camion': 'Camión',
    'tracto': 'Tracto',
    'tracto camion': 'Tracto',
    'semirremolque': 'Semirremolque',
    'semiremolque': 'Semirremolque',
    'semi remolque': 'Semirremolque',
    'remolque': 'Remolque',
    'carreta': 'Carreta',
    'cisterna': 'Cisterna',
    'furgon': 'Furgón',
    'plataforma': 'Plataforma',
    'tolva': 'Tolva',
};

const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function normalizarTipo(raw) {
    const texto = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!texto) return '';
    const clave = sinTildes(texto).toLowerCase().replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (VARIANTES[clave]) return VARIANTES[clave];
    // Tipo que no está en la lista: se deja con la primera letra en mayúscula, sin tocar el resto
    const sinEspacios = clave.replace(/ /g, '');
    const porSinEspacios = Object.keys(VARIANTES).find(k => k.replace(/ /g, '') === sinEspacios);
    if (porSinEspacios) return VARIANTES[porSinEspacios];
    return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

module.exports = { TIPOS, normalizarTipo };
