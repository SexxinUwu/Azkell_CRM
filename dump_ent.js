const fs = require('fs');
const logica = fs.readFileSync('c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js', 'utf8');
const idx = logica.indexOf('items.forEach(function(item, i) {');
if (idx !== -1) {
    console.log(logica.substring(idx, idx + 3000));
}
