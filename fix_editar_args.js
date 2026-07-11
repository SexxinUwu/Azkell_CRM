const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// The tricky part: we want to replace `(\''+k.marca_vehiculo+'\',\''+k.tipo_mp+'\')`
// Let's use a regex that is insensitive to exact backslashes if possible, or just a simple split

const searchStr = "window.kitsEditarKit(\\''+k.marca_vehiculo+'\\',\\''+k.tipo_mp+'\\')";
const replaceStr = "window.kitsEditarKit(\\''+k.marca_vehiculo+'\\',\\''+(k.modelo_vehiculo||'TODOS LOS MODELOS')+'\\',\\''+k.tipo_mp+'\\')";

js = js.split(searchStr).join(replaceStr);

fs.writeFileSync(fileJs, js, 'utf8');
