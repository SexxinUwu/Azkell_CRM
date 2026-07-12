const fs = require('fs');
const path = require('path');

// 1. Fix mobile padding in dashboard vista.html
const fileVista = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'vista.html');
let vistaHtml = fs.readFileSync(fileVista, 'utf8');
if (!vistaHtml.includes('padding-bottom: 90px;')) {
    vistaHtml = vistaHtml.replace('font-family: \'Inter\', system-ui, sans-serif;', 'font-family: \'Inter\', system-ui, sans-serif;\n        padding-bottom: 90px;');
    fs.writeFileSync(fileVista, vistaHtml, 'utf8');
}

// 2. Add to mobile options in Index.html
const fileIndex = path.join(__dirname, 'Index.html');
let indexHtml = fs.readFileSync(fileIndex, 'utf8');
if (!indexHtml.includes('mbnav-finanzas-inv')) {
    const finanzasBtn = `
            <div id="mbnav-finanzas-inv" class="bnav-card" onclick="bootstrap.Offcanvas.getInstance(document.getElementById('bnavSheetAlmacen')).hide(); cargarModuloAislado('almacen/dashboard-financiero'); setBottomNavActive('bnav-almacen');">
                <div class="bnav-card-icon" style="background: rgba(139,92,246,.1); color: #8b5cf6;"><i class="bi bi-pie-chart-fill"></i></div>
                <div><p class="bnav-card-title">Dashboard Financiero</p><p class="bnav-card-desc">Análisis y valorización</p></div>
            </div>`;
    indexHtml = indexHtml.replace(
        '<div id="mbnav-inventario" class="bnav-card"', 
        finanzasBtn.trim() + '\n            <div id="mbnav-inventario" class="bnav-card"'
    );
    fs.writeFileSync(fileIndex, indexHtml, 'utf8');
}

// 3. Add to maps in logica.js
const fileLogica = path.join(__dirname, 'logica.js');
let logicaJs = fs.readFileSync(fileLogica, 'utf8');

if (!logicaJs.includes("'almacen/dashboard-financiero'")) {
    logicaJs = logicaJs.replace(
        "'almacen/inventario':         'Inventario',",
        "'almacen/dashboard-financiero': 'Dashboard Financiero',\n    'almacen/inventario':         'Inventario',"
    );
    logicaJs = logicaJs.replace(
        "'almacen/inventario':         'bi-box-fill',",
        "'almacen/dashboard-financiero': 'bi-pie-chart-fill',\n    'almacen/inventario':         'bi-box-fill',"
    );
    logicaJs = logicaJs.replace(
        "'almacen/inventario':          'Inventario',",
        "'almacen/dashboard-financiero': 'Dashboard Financiero',\n    'almacen/inventario':          'Inventario',"
    );
    logicaJs = logicaJs.replace(
        "'almacen/inventario':          'nav-inventario',",
        "'almacen/dashboard-financiero': 'nav-finanzas-inv',\n    'almacen/inventario':          'nav-inventario',"
    );
    logicaJs = logicaJs.replace(
        "'almacen/inventario':         'almacen',",
        "'almacen/dashboard-financiero': 'almacen',\n    'almacen/inventario':         'almacen',"
    );
    logicaJs = logicaJs.replace(
        "'almacen/inventario':         ['Almacén','Inventario'],",
        "'almacen/dashboard-financiero': ['Almacén','Dashboard Financiero'],\n    'almacen/inventario':         ['Almacén','Inventario'],"
    );
    fs.writeFileSync(fileLogica, logicaJs, 'utf8');
}

console.log('Mobile UI and shading fixed.');
