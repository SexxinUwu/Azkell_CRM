const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// Fix kitsCargarTabla model filter init
const cargarTablaRegex = /var prevMarca = typeof window\._cbGet === 'function' \? window\._cbGet\('kits-fil-marca'\) : '';\s*var prevTipo  = typeof window\._cbGet === 'function' \? window\._cbGet\('kits-fil-tipo'\)  : '';\s*var marcas = \[\];/g;
const cargarTablaReplacement = `var prevMarca = typeof window._cbGet === 'function' ? window._cbGet('kits-fil-marca') : '';
        var prevModelo = typeof window._cbGet === 'function' ? window._cbGet('kits-fil-modelo') : '';
        var prevTipo  = typeof window._cbGet === 'function' ? window._cbGet('kits-fil-tipo')  : '';

        var marcas = [];`;
js = js.replace(cargarTablaRegex, cargarTablaReplacement);

const cargarTablaRegex2 = /if \(typeof window\._cbInit === 'function'\) \{ window\._cbInit\('kits-fil-marca', itemsMarca, 'Todas las marcas'\); if \(prevMarca\) window\._cbSet\('kits-fil-marca', prevMarca, prevMarca\); \}\s*var tipos = \[\];/g;
const cargarTablaReplacement2 = `if (typeof window._cbInit === 'function') { window._cbInit('kits-fil-marca', itemsMarca, 'Todas las marcas'); if (prevMarca) window._cbSet('kits-fil-marca', prevMarca, prevMarca); }

        var modelos = [];
        window.kitsData.forEach(function(k){ var m=(k.modelo_vehiculo||'TODOS LOS MODELOS').toUpperCase(); if(m && !modelos.includes(m)) modelos.push(m); });
        modelos.sort();
        var itemsModelo = modelos.map(function(m){ return { value: m, label: m }; });
        if (typeof window._cbInit === 'function') { window._cbInit('kits-fil-modelo', itemsModelo, 'Todos los modelos'); if (prevModelo) window._cbSet('kits-fil-modelo', prevModelo, prevModelo); }

        var tipos = [];`;
js = js.replace(cargarTablaRegex2, cargarTablaReplacement2);

fs.writeFileSync(fileJs, js, 'utf8');
