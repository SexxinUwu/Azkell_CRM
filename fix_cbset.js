const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

js = js.replace(
`    var foundMod = false;
    for (var i=0; i<window.kitsData.length; i++) {
        if (window.kitsData[i].marca_vehiculo === marcaStr && window.kitsData[i].modelo_vehiculo && window.kitsData[i].modelo_vehiculo !== 'TODOS LOS MODELOS') {
            document.getElementById('kits-modelo').value = window.kitsData[i].modelo_vehiculo;
            foundMod = true;
            break;
        }
    }
    if (!foundMod) document.getElementById('kits-modelo').value = 'TODOS LOS MODELOS';`,
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
    }`);

fs.writeFileSync(fileJs, js, 'utf8');
