const fs = require('fs');
let code = fs.readFileSync('modulos/mantenimiento/fleetrun/logica.js', 'utf8');

const regexMostrar = /if \(fila\[24\]\)\s*window\._cbSet\('eF_tec', fila\[24\], fila\[24\]\);/g;
const replaceMostrar = `if (fila[24]) window._cbSet('eF_tec', fila[24], fila[24]);
    if (document.getElementById('eF_combustible')) document.getElementById('eF_combustible').value = fila.length > 25 ? (fila[25] || '') : '';
    if (document.getElementById('eF_modelo')) document.getElementById('eF_modelo').value = fila.length > 26 ? (fila[26] || '') : '';`;
code = code.replace(regexMostrar, replaceMostrar);

fs.writeFileSync('modulos/mantenimiento/fleetrun/logica.js', code);
console.log('Fixed edit mappings for combustible and modelo in logica.js');
