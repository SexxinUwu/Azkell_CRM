const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// Fix kitsAbrirModal clearing of fields
js = js.replace(
/window\.kitsAbrirModal = function\(\) \{\s*var mEl = document\.getElementById\('kits-marca'\);\s*if \(mEl\) mEl\.value = '';\s*if \(typeof window\._cbReset === 'function'\) window\._cbReset\('kits-tipomp'\);\s*window\.kitsActualizarTituloModal\(\);/g,
`window.kitsAbrirModal = function() {
    if(window._cbSet) {
        window._cbSet('kits-marca', '', '');
        window._cbSet('kits-modelo', '', '');
        window._cbSet('kits-tipomp', '', '');
    }
    window.kitsActualizarTituloModal();`
);

// Fix Desktop Editar parameters
// Let's use simple string replacement since the regex failed
const originalDesktopEdit = `onclick="window.kitsEditarKit('\\''+k.marca_vehiculo+'\\','\\''+k.tipo_mp+'\\')"`;
const newDesktopEdit = `onclick="window.kitsEditarKit('\\''+k.marca_vehiculo+'\\','\\''+(k.modelo_vehiculo||'TODOS LOS MODELOS')+'\\','\\''+k.tipo_mp+'\\')"`;

js = js.split(originalDesktopEdit).join(newDesktopEdit);

fs.writeFileSync(fileJs, js, 'utf8');
