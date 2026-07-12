const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

const regex = /var dets = Array\.isArray\(salida\.detalles\)\s*\?\s*salida\.detalles\s*:\s*\[salida\];/;

const replacement = `// Solo considerar salidas despachadas
                if (salida.estado && salida.estado !== 'Despachado') return;
                
                var dets = Array.isArray(salida.items) ? salida.items : (Array.isArray(salida.detalles) ? salida.detalles : []);`;

if (regex.test(js)) {
    js = js.replace(regex, replacement);
    fs.writeFileSync(fileJs, js, 'utf8');
    console.log('Fixed parsing of salidas items.');
} else {
    console.log('Could not find parsing logic.');
}
