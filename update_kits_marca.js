const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(file, 'utf8');

const targetFunction = `window.kitsMarcaCambiada = function(marcaStr) {
    if(!marcaStr) return;
    marcaStr = marcaStr.toUpperCase();
    var foundMod = false;
    for (var i=0; i<window.kitsData.length; i++) {
        if (window.kitsData[i].marca_vehiculo === marcaStr && window.kitsData[i].modelo_vehiculo && window.kitsData[i].modelo_vehiculo !== 'TODOS LOS MODELOS') {
            document.getElementById('kits-modelo').value = window.kitsData[i].modelo_vehiculo;
            foundMod = true;
            break;
        }
    }
    if (!foundMod) document.getElementById('kits-modelo').value = 'TODOS LOS MODELOS';
};`;

const newFunction = `window.kitsMarcaCambiada = function(marcaStr) {
    if(!marcaStr) return;
    marcaStr = marcaStr.toUpperCase();
    
    // Poblar datalist con modelos de esta marca
    var modelos = [];
    if (window.dataGlobalPlacas) {
        window.dataGlobalPlacas.forEach(function(p) {
            var mMarca = (p[3] || '').trim().toUpperCase();
            var mMod = (p[4] || '').trim().toUpperCase();
            if (mMarca === marcaStr && mMod && mMod !== '-' && !modelos.includes(mMod)) {
                modelos.push(mMod);
            }
        });
    }
    window.kitsData.forEach(function(k) {
        var mMarca = (k.marca_vehiculo || '').trim().toUpperCase();
        var mMod = (k.modelo_vehiculo || 'TODOS LOS MODELOS').trim().toUpperCase();
        if (mMarca === marcaStr && mMod && mMod !== 'TODOS LOS MODELOS' && !modelos.includes(mMod)) {
            modelos.push(mMod);
        }
    });
    modelos.sort();
    
    var dl = document.getElementById('kits-dl-modelos');
    if (dl) {
        dl.innerHTML = modelos.map(function(v){ return '<option value="'+v+'">'; }).join('');
    }

    var foundMod = false;
    for (var i=0; i<window.kitsData.length; i++) {
        if (window.kitsData[i].marca_vehiculo === marcaStr && window.kitsData[i].modelo_vehiculo && window.kitsData[i].modelo_vehiculo !== 'TODOS LOS MODELOS') {
            document.getElementById('kits-modelo').value = window.kitsData[i].modelo_vehiculo;
            foundMod = true;
            break;
        }
    }
    if (!foundMod) document.getElementById('kits-modelo').value = 'TODOS LOS MODELOS';
};`;

js = js.replace(targetFunction, newFunction);

fs.writeFileSync(file, js, 'utf8');
console.log('kitsMarcaCambiada updated successfully');
