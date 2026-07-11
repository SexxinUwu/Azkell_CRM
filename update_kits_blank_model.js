const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// Update kitsMarcaCambiada
js = js.replace(
`    var foundMod = false;
    for (var i=0; i<window.kitsData.length; i++) {
        if (window.kitsData[i].marca_vehiculo === marcaStr && window.kitsData[i].modelo_vehiculo && window.kitsData[i].modelo_vehiculo !== 'TODOS LOS MODELOS') {
            if(window._cbSet) window._cbSet('kits-modelo', window.kitsData[i].modelo_vehiculo, window.kitsData[i].modelo_vehiculo);
            else document.getElementById('kits-modelo').value = window.kitsData[i].modelo_vehiculo;
            foundMod = true;
            break;
        }
    }
    if (!foundMod) {
        if(window._cbSet) window._cbSet('kits-modelo', 'TODOS LOS MODELOS', 'TODOS LOS MODELOS');
        else document.getElementById('kits-modelo').value = 'TODOS LOS MODELOS';
    }`,
`    if(window._cbSet) window._cbSet('kits-modelo', '', '');
    else document.getElementById('kits-modelo').value = '';`
);

// Update kitsAbrirModal
// Previous script added: if(window._cbSet) { window._cbSet('kits-marca', '', ''); window._cbSet('kits-modelo', 'TODOS LOS MODELOS', 'TODOS LOS MODELOS'); }
// But where did it insert it?
// Let's do a direct replacement of "TODOS LOS MODELOS" to "" if it's inside _cbSet for kits-modelo
js = js.replace(
    /window\._cbSet\('kits-modelo', 'TODOS LOS MODELOS', 'TODOS LOS MODELOS'\)/g,
    `window._cbSet('kits-modelo', '', '')`
);

// Also _kitsPopularDatalists initializes it:
// window._cbInit('kits-modelo', [], 'Todos los modelos');
js = js.replace(
    /window\._cbInit\('kits-modelo', \[\], 'Todos los modelos'\);/g,
    `window._cbInit('kits-modelo', [], 'Buscar modelo...');`
);

fs.writeFileSync(fileJs, js, 'utf8');
