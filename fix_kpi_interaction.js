const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

const kpiRegex = /window\._invRenderKPIs\s*=\s*function\(data\)\s*\{[\s\S]*?\/\/\s*2\)\s*Render\s*para\s*Escritorio\s*\(Bento\s*Old\s*Style\)[\s\S]*?if\s*\(elDesktop\)\s*\{[\s\S]*?\}\s*\};/m;

const newKpiLogic = `window._invSetKpiFiltro = function(tipo) {
    if (window._invKpiFiltro === tipo) {
        window._invKpiFiltro = 'todos'; // toggle off
    } else {
        window._invKpiFiltro = tipo;
    }
    window.filtrarInventario();
    window._invRenderKPIs(window._invData || []);
};

window._invRenderKPIs = function(data) {
    var total = data.filter(function(d) {
        return parseFloat(d.stock_actual || 0) > 0.1;
    }).length;
    var criticos = data.filter(function(d) {
        var sa = parseFloat(d.stock_actual || 0);
        var sm = parseFloat(d.stock_min || 0);
        return sm > 0 && sa < sm;
    }).length;
    var advertencia = data.filter(function(d) {
        var sa = parseFloat(d.stock_actual || 0);
        var sm = parseFloat(d.stock_min || 0);
        var sx = parseFloat(d.stock_max || 0);
        return sm > 0 && sx > 0 && sa >= sm && sa < sx;
    }).length;
    var valorSoles = data.reduce(function(s, d) {
        var stock = parseFloat(d.stock_actual || 0);
        if (stock <= 0.1) return s;
        var cs = parseFloat(d.costo_soles != null ? d.costo_soles : d.costo_referencial || 0);
        return s + stock * cs;
    }, 0);
    function fmtV(v, pre) {
        return pre + v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    var elMobile = document.getElementById('inv-kpi-row');
    var elDesktop = document.getElementById('inv-kpi-row-desktop');

    var f = window._invKpiFiltro || 'todos';
    var opT = (f === 'todos' || f === 'total') ? '1' : '0.5';
    var opB = (f === 'bajo') ? '1' : (f === 'todos' ? '1' : '0.5');
    var opC = (f === 'critico') ? '1' : (f === 'todos' ? '1' : '0.5');
    var baseTrans = 'cursor:pointer; transition: opacity 0.2s, transform 0.1s;';

    // 1) Render para Mobile (iOS Style)
    if (elMobile) {
        elMobile.innerHTML =
            '<div onclick="window._invSetKpiFiltro(\\'total\\')" style="' + baseTrans + ' opacity:' + opT + '; background-color:white; border-radius:1rem; padding:0.75rem; box-shadow:0 1px 2px 0 rgba(0,0,0,0.05); display:flex; flex-direction:column; justify-content:space-between;">' +
              '<div class="d-flex justify-content-between align-items-start mb-2">' +
                '<span style="font-size:10px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em; line-height:1.1;">Total<br/>Artículos</span>' +
                '<div style="background-color:#eff6ff; color:#3b82f6; padding:6px; border-radius:8px; display:flex; align-items:center; justify-content:center;">' +
                  '<i class="bi bi-box-seam"></i>' +
                '</div>' +
              '</div>' +
              '<span style="font-size:1.5rem; font-weight:700; color:#111827; letter-spacing:-0.025em;">' + total.toLocaleString() + '</span>' +
            '</div>' +

            '<div onclick="window._invSetKpiFiltro(\\'bajo\\')" style="' + baseTrans + ' opacity:' + opB + '; background-color:white; border-radius:1rem; padding:0.75rem; box-shadow:0 1px 2px 0 rgba(0,0,0,0.05); display:flex; flex-direction:column; justify-content:space-between;">' +
              '<div class="d-flex justify-content-between align-items-start mb-2">' +
                '<span style="font-size:10px; font-weight:700; color:#f59e0b; text-transform:uppercase; letter-spacing:0.05em; line-height:1.1;">Stock<br/>Bajo</span>' +
                '<div style="background-color:#fffbeb; color:#f59e0b; padding:6px; border-radius:8px; display:flex; align-items:center; justify-content:center;">' +
                  '<i class="bi bi-exclamation-triangle"></i>' +
                '</div>' +
              '</div>' +
              '<span style="font-size:1.5rem; font-weight:700; color:#f59e0b; letter-spacing:-0.025em;">' + advertencia + '</span>' +
            '</div>' +

            '<div onclick="window._invSetKpiFiltro(\\'critico\\')" style="' + baseTrans + ' opacity:' + opC + '; background-color:#ef4444; border-radius:1rem; padding:0.75rem; box-shadow:0 1px 2px 0 rgba(0,0,0,0.05); display:flex; flex-direction:column; justify-content:space-between; color:white;">' +
              '<div class="d-flex justify-content-between align-items-start mb-2">' +
                '<span style="font-size:10px; font-weight:700; color:#fee2e2; text-transform:uppercase; letter-spacing:0.05em; line-height:1.1;">Stock<br/>Crítico</span>' +
                '<div style="background-color:rgba(248,113,113,0.5); color:white; padding:6px; border-radius:8px; display:flex; align-items:center; justify-content:center;">' +
                  '<i class="bi bi-exclamation-circle"></i>' +
                '</div>' +
              '</div>' +
              '<span style="font-size:1.5rem; font-weight:700; letter-spacing:-0.025em;">' + criticos + '</span>' +
            '</div>';
    }

    // 2) Render para Escritorio (Bento Old Style)
    if (elDesktop) {
        elDesktop.innerHTML =
            '<div onclick="window._invSetKpiFiltro(\\'total\\')" class="bento-kpi" style="' + baseTrans + ' opacity:' + opT + ';">' +
              '<div><div class="bento-kpi-label">Total Artículos</div><div class="bento-kpi-num">' + total.toLocaleString() + '</div></div>' +
              '<div class="bento-kpi-icon" style="background:#eff6ff;color:#2563eb"><i class="bi bi-boxes fs-4"></i></div>' +
            '</div>' +
            '<div onclick="window._invSetKpiFiltro(\\'bajo\\')" class="bento-kpi" style="' + baseTrans + ' opacity:' + opB + '; background:#fffbeb;border-color:#fde68a">' +
              '<div><div class="bento-kpi-label" style="color:#92400e">Stock Bajo</div><div class="bento-kpi-num" style="color:#d97706">' + advertencia + '</div></div>' +
              '<div class="bento-kpi-icon" style="background:#fef3c7;color:#d97706"><i class="bi bi-exclamation-triangle-fill fs-4"></i></div>' +
            '</div>' +
            '<div onclick="window._invSetKpiFiltro(\\'critico\\')" class="bento-kpi accent-red" style="' + baseTrans + ' opacity:' + opC + ';">' +
              '<div><div class="bento-kpi-label">Stock Crítico</div><div class="bento-kpi-num">' + criticos + '</div></div>' +
              '<div class="bento-kpi-icon"><i class="bi bi-exclamation-circle-fill fs-4"></i></div>' +
            '</div>' +
            '<div class="bento-kpi accent-dark" style="grid-column:span 1">' +
              '<div><div class="bento-kpi-label">Valorizado S/</div><div class="bento-kpi-num" style="font-size:1.4rem">' + fmtV(valorSoles, 'S/ ') + '</div></div>' +
              '<div class="bento-kpi-icon"><i class="bi bi-coin fs-4" style="color:#fbbf24"></i></div>' +
            '</div>';
    }
};`;

js = js.replace(kpiRegex, newKpiLogic);

// Now update filtrarInventario
const filterRegex = /window\._invFiltrados\s*=\s*\(window\._invData\s*\|\|\s*\[\]\)\.filter\(function\(d\)\s*\{([\s\S]*?return\s*matchB\s*&&\s*matchF\s*&&\s*matchS;)\s*\}\);/;

const newFilterInner = `$1
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
        }`;

js = js.replace(filterRegex, (match, p1) => {
    return match.replace(p1, newFilterInner);
});

fs.writeFileSync(fileJs, js, 'utf8');
console.log('Fixed KPI interaction.');
