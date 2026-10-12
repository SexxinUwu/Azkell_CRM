const fs = require('fs');
const path = require('path');

// 1. Fix vista.html backdrop z-index
const fileHtml = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'vista.html');
let html = fs.readFileSync(fileHtml, 'utf8');
html = html.replace(/id="inv-drawer-backdrop"(.*?)z-index:1049;/s, 'id="inv-drawer-backdrop"$1z-index:1058;');
fs.writeFileSync(fileHtml, html, 'utf8');

// 2. Fix logica.js missing display: flex on open
const fileJs = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');
const searchStr = `    var modal = document.getElementById('inv-form-drawer');
    if (modal) { modal.classList.add('open'); }`;
const replaceStr = `    var modal = document.getElementById('inv-form-drawer');
    if (modal) { modal.style.display = 'flex'; void modal.offsetWidth; modal.classList.add('open'); }`;

js = js.replace(searchStr, replaceStr);

fs.writeFileSync(fileJs, js, 'utf8');
console.log('Fixed visibility bugs.');
