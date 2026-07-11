const fs = require('fs');
const path = require('path');

const fileHtml = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'vista.html');
let html = fs.readFileSync(fileHtml, 'utf8');

// Cleanup stray closing divs from tabs
html = html.replace(/<\/div><!-- \/tab-imagen -->\s*<\/div><!-- \/tab-content -->/, '');

fs.writeFileSync(fileHtml, html, 'utf8');
console.log('HTML cleanup done.');
