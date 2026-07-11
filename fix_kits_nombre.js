const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

const searchJs = `nombre: x.articulo || x.nombre || x.descripcion || ''`;
const replaceJs = `nombre: x.descripcion || x.articulo || x.nombre || ''`;

js = js.replace(searchJs, replaceJs);

fs.writeFileSync(fileJs, js, 'utf8');
console.log('Fixed kits-mp logica.js');
