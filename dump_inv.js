const fs = require('fs');
const logica = fs.readFileSync('c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/logica.js', 'utf8');
const idx = logica.indexOf('window._invRender = function() {');
if (idx !== -1) {
    console.log(logica.substring(idx, idx + 4000));
}
