const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

js = js.replace(
`    if(window._cbSet) window._cbSet('kits-modelo', '', '');
    else document.getElementById('kits-modelo').value = '';`,
`    if (modelos.length === 1) {
        if(window._cbSet) window._cbSet('kits-modelo', modelos[0], modelos[0]);
        else document.getElementById('kits-modelo').value = modelos[0];
    } else {
        if(window._cbSet) window._cbSet('kits-modelo', '', '');
        else document.getElementById('kits-modelo').value = '';
    }`
);

fs.writeFileSync(fileJs, js, 'utf8');
