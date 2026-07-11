const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

const regex = /marca_vehiculo: marca,\s*tipo_mp: tipo,/g;
js = js.replace(regex, `marca_vehiculo: marca,\n            modelo_vehiculo: getCombo('kits-modelo') || 'TODOS LOS MODELOS',\n            tipo_mp: tipo,`);

fs.writeFileSync(fileJs, js, 'utf8');
