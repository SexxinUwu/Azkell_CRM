const fs = require('fs');
const path = require('path');

const fileHtml = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'vista.html');
let html = fs.readFileSync(fileHtml, 'utf8');

// 1. Reemplazar inputs por cb-dropdown wrappers
html = html.replace(
    /<div class="kits-field-label">Marca Vehículo <span style="color:#ef4444;">\*<\/span><\/div>\s*<input type="text" id="kits-marca" class="kits-input-sm fw-bold text-uppercase" placeholder="Ej: VOLVO" list="kits-dl-marcas" autocomplete="off" onchange="window\.kitsMarcaCambiada\(this\.value\)>/g,
    `<div class="kits-field-label">Marca Vehículo <span style="color:#ef4444;">*</span></div>
          <div class="position-relative">
            <input type="text" id="kits-marca-txt" class="kits-input-sm fw-bold text-uppercase"
                   placeholder="Ej: VOLVO" autocomplete="off"
                   oninput="window._cbFiltrar('kits-marca')"
                   onfocus="window._cbFiltrar('kits-marca')"
                   onblur="window._kitsHideCombo('kits-marca'); setTimeout(function(){window.kitsMarcaCambiada(document.getElementById('kits-marca').value)}, 200);">
            <input type="hidden" id="kits-marca">
            <div id="kits-marca-dd" class="cb-dropdown"></div>
          </div>`
);

// Fallback in case the replacement didn't match exactly because of ">" at the end. Let's do it safer.
html = html.replace(
    /<input type="text" id="kits-marca" class="kits-input-sm fw-bold text-uppercase" placeholder="Ej: VOLVO" list="kits-dl-marcas" autocomplete="off" onchange="window\.kitsMarcaCambiada\(this\.value\)">/,
    `<div class="position-relative">
            <input type="text" id="kits-marca-txt" class="kits-input-sm fw-bold text-uppercase"
                   placeholder="Ej: VOLVO" autocomplete="off"
                   oninput="window._cbFiltrar('kits-marca')"
                   onfocus="window._cbFiltrar('kits-marca')"
                   onblur="window._kitsHideCombo('kits-marca'); setTimeout(function(){window.kitsMarcaCambiada(document.getElementById('kits-marca').value)}, 200);">
            <input type="hidden" id="kits-marca">
            <div id="kits-marca-dd" class="cb-dropdown"></div>
          </div>`
);


html = html.replace(
    /<input type="text" id="kits-modelo" class="kits-input-sm fw-bold text-uppercase" placeholder="TODOS LOS MODELOS" list="kits-dl-modelos" autocomplete="off">/,
    `<div class="position-relative">
            <input type="text" id="kits-modelo-txt" class="kits-input-sm fw-bold text-uppercase"
                   placeholder="TODOS LOS MODELOS" autocomplete="off"
                   oninput="window._cbFiltrar('kits-modelo')"
                   onfocus="window._cbFiltrar('kits-modelo')"
                   onblur="window._kitsHideCombo('kits-modelo')">
            <input type="hidden" id="kits-modelo">
            <div id="kits-modelo-dd" class="cb-dropdown"></div>
          </div>`
);

// Quitar datalists
html = html.replace(/<datalist id="kits-dl-marcas"><\/datalist>\s*<datalist id="kits-dl-modelos"><\/datalist>/, '');

fs.writeFileSync(fileHtml, html, 'utf8');

const fileJs = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// 2. _kitsPopularDatalists -> cbInit en logica.js
const regexPopular = /function _kitsPopularDatalists\(\) \{[\s\S]*?_fill\('kits-dl-marcas', marcas\);\s*\}/;
const newPopular = `function _kitsPopularDatalists() {
    var marcas = [];
    if (window.dataGlobalPlacas) {
        window.dataGlobalPlacas.forEach(function(p) {
            var m = (p[3] || '').trim().toUpperCase();
            if (m && !marcas.includes(m)) marcas.push(m);
        });
    }
    window.kitsData.forEach(function(k) {
        var m = (k.marca_vehiculo || '').trim().toUpperCase();
        if (m && !marcas.includes(m)) marcas.push(m);
    });
    marcas.sort();

    var items = marcas.map(function(m) { return { value: m, label: m }; });
    if (typeof window._cbInit === 'function') {
        window._cbInit('kits-marca', items, 'Buscar marca...');
        window._cbInit('kits-modelo', [], 'Todos los modelos');
        window._cbCallbacks = window._cbCallbacks || {};
        window._cbCallbacks['kits-marca'] = function(val) { window.kitsMarcaCambiada(val); };
    }
}`;

js = js.replace(regexPopular, newPopular);

// 3. Update kitsMarcaCambiada to use _cbInit instead of filling datalist
const regexMarca = /var dl = document\.getElementById\('kits-dl-modelos'\);\s*if \(dl\) \{\s*dl\.innerHTML = modelos\.map\(function\(v\)\{ return '<option value="'\+v\+'">'; \}\)\.join\(''\);\s*\}/;
const newMarca = `var itemsMod = modelos.map(function(m){ return { value: m, label: m }; });
    if (typeof window._cbInit === 'function') {
        window._cbInit('kits-modelo', itemsMod, 'Todos los modelos');
    }`;

js = js.replace(regexMarca, newMarca);

// 4. Reset in kitsAbrirModal and kitsEditarKit
// we need to _cbSet instead of just .value = ''
js = js.replace(
    /var mEl = document\.getElementById\('kits-marca'\);\s*if \(mEl\) mEl\.value = '';\s*var mMod = document\.getElementById\('kits-modelo'\);\s*if \(mMod\) mMod\.value = 'TODOS LOS MODELOS';/g,
    `if(window._cbSet) { window._cbSet('kits-marca', '', ''); window._cbSet('kits-modelo', 'TODOS LOS MODELOS', 'TODOS LOS MODELOS'); }`
);

js = js.replace(
    /var mEl = document\.getElementById\('kits-marca'\);\s*if \(mEl\) mEl\.value = marca;\s*var mMod = document\.getElementById\('kits-modelo'\);\s*if \(mMod\) mMod\.value = modelo;/g,
    `if(window._cbSet) { window._cbSet('kits-marca', marca, marca); window._cbSet('kits-modelo', modelo, modelo); }`
);

fs.writeFileSync(fileJs, js, 'utf8');

console.log('Update complete');
