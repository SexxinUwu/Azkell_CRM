const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

const regex = /window\.filtrarInventario\s*=\s*function\(\)\s*\{[\s\S]*?window\._invRender\(\);\s*\};/;

const replacement = `window.filtrarInventario = function() {
    var buscar  = ((document.getElementById('inv-buscar')       || {}).value || '').toLowerCase().trim();
    var filFam  = ((document.getElementById('inv-fil-familia')  || {}).value || '');
    var filSis  = ((document.getElementById('inv-fil-sistema')  || {}).value || '');
    window._invFiltrados = (window._invData || []).filter(function(d) {
        var matchB = !buscar ||
            (d.id           || '').toLowerCase().includes(buscar) ||
            (d.descripcion  || '').toLowerCase().includes(buscar) ||
            (d.marca        || '').toLowerCase().includes(buscar) ||
            (d.familia      || '').toLowerCase().includes(buscar) ||
            (d.codigo_item  || '').toLowerCase().includes(buscar) ||
            (d.codigo_barras|| '').toLowerCase().includes(buscar);
        var matchF = !filFam || d.familia === filFam;
        var matchS = !filSis || d.sistema === filSis;
        
        var f = window._invKpiFiltro || 'todos';
        if (f === 'bajo') {
            var sa = parseFloat(d.stock_actual || 0);
            var sm = parseFloat(d.stock_min || 0);
            var sx = parseFloat(d.stock_max || 0);
            if (!(sm > 0 && sx > 0 && sa >= sm && sa < sx)) return false;
        } else if (f === 'critico') {
            var sa = parseFloat(d.stock_actual || 0);
            var sm = parseFloat(d.stock_min || 0);
            if (!(sm > 0 && sa < sm)) return false;
        }

        return matchB && matchF && matchS;
    });
    window._invPagActual = 1;
    window._invRender();
};`;

if (regex.test(js)) {
    js = js.replace(regex, replacement);
    fs.writeFileSync(fileJs, js, 'utf8');
    console.log('Fixed filtrarInventario!');
} else {
    console.log('Could not find window.filtrarInventario to replace.');
}
