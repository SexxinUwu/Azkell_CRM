const fs = require('fs');

let js = fs.readFileSync('modulos/mantenimiento/status-rampa/logica.js', 'utf8');

js = js.replace(
    /\['sr-drawer-registro','sr-drawer-ot','sr-drawer-ot-det','sr-drawer-trabajo','sr-drawer-material','sr-drawer-editar-ot'\].forEach/g,
    "['sr-drawer-registro','sr-drawer-ot','sr-drawer-ot-det','sr-drawer-trabajo','sr-drawer-material','sr-drawer-editar-ot', 'sr-panel-detalle', 'sr-panel-detalle-hist'].forEach"
);

js = js.replace(
    "panel.classList.add('open');",
    "panel.classList.add('open');\n    var bd = document.getElementById('srDrawerBackdrop');\n    if (bd) bd.classList.add('open');"
);

js = js.replace(
    "var panel   = document.getElementById('sr-panel-detalle-hist');\n    if (scroll) scroll.innerHTML = html;",
    "var panel   = document.getElementById('sr-panel-detalle-hist');\n    if (scroll) scroll.innerHTML = html;\n    var bd = document.getElementById('srDrawerBackdrop');\n    if (bd && panel && panel.classList.contains('open')) bd.classList.add('open');"
);

js = js.replace(
    /window\.srCerrarDetalle = function\(\) \{[\s\S]*?srRenderTabla\(\);\n\};/,
    `window.srCerrarDetalle = function() {
    window.srCerrarDrawers();
    window.srDetalleId = null;
    srRenderTabla();
};`
);

js = js.replace(
    /window\.srCerrarDetalleHist = function\(\) \{[\s\S]*?\n\};/,
    `window.srCerrarDetalleHist = function() {
    window.srCerrarDrawers();
};`
);

fs.writeFileSync('modulos/mantenimiento/status-rampa/logica.js', js);
console.log('status-rampa/logica.js updated');
