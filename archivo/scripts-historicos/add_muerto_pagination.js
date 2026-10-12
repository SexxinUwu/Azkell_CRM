const fs = require('fs');
const path = require('path');

// 1. Modificar vista.html
const fileHtml = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'vista.html');
let html = fs.readFileSync(fileHtml, 'utf8');

const targetHtml = '</tbody>\n                    </table>\n                </div>\n            </div>';
const replaceHtml = '</tbody>\n                    </table>\n                </div>\n                <div id="fin-pag-muerto" class="mt-3 d-flex justify-content-end gap-3 align-items-center"></div>\n            </div>';

if (html.includes(targetHtml)) {
    html = html.replace(targetHtml, replaceHtml);
    fs.writeFileSync(fileHtml, html, 'utf8');
    console.log('vista.html updated with pagination container.');
}

// 2. Modificar logica.js
const fileJs = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

const regexMuerto = /inventarioMuerto\.sort\(function\(a,b\)\{ return b\.valor - a\.valor; \}\);[\s\S]*?document\.getElementById\('fin-tb-muerto'\)\.innerHTML = htmlMuerto \|\| '<tr><td colspan="3" class="text-center text-muted py-3">No hay inventario muerto\.<\/td><\/tr>';/;

const replaceJs = `inventarioMuerto.sort(function(a,b){ return b.valor - a.valor; });
                
                window.finInvMuertoList = inventarioMuerto;
                window.finInvMuertoPag = 1;
                window.finInvMuertoPorPag = 10;
                
                window.finRenderMuerto();`;

if (regexMuerto.test(js)) {
    js = js.replace(regexMuerto, replaceJs);
    
    const paginationFuncs = `
window.finRenderMuerto = function() {
    var tb = document.getElementById('fin-tb-muerto');
    var pagEl = document.getElementById('fin-pag-muerto');
    if (!tb) return;

    var inicio = (window.finInvMuertoPag - 1) * window.finInvMuertoPorPag;
    var fin = inicio + window.finInvMuertoPorPag;
    var slice = window.finInvMuertoList.slice(inicio, fin);
    
    function fmtM(v) { return 'S/ ' + v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

    var htmlMuerto = '';
    slice.forEach(function(item) {
        htmlMuerto += '<tr>' +
            '<td><span class="fin-td-nombre" style="width:100%;">' + item.articulo + '</span></td>' +
            '<td><span class="fin-badge" style="background:#fee2e2;color:#dc2626;">' + item.fecha_ult + '</span></td>' +
            '<td class="fin-td-val" style="color:#dc2626; white-space:nowrap;">' + fmtM(item.valor) + '</td>' +
            '</tr>';
    });
    tb.innerHTML = htmlMuerto || '<tr><td colspan="3" class="text-center text-muted py-3">No hay inventario muerto.</td></tr>';

    if (pagEl) {
        var totalPag = Math.ceil(window.finInvMuertoList.length / window.finInvMuertoPorPag) || 1;
        if (totalPag > 1) {
            var btnPrev = '<button class="btn btn-sm" style="border:1.5px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-weight:600;" onclick="window.finMuertoIrPag('+(window.finInvMuertoPag-1)+')" '+(window.finInvMuertoPag<=1?'disabled':'')+'><i class="bi bi-chevron-left"></i> Anterior</button>';
            var btnNext = '<button class="btn btn-sm" style="border:1.5px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-weight:600;" onclick="window.finMuertoIrPag('+(window.finInvMuertoPag+1)+')" '+(window.finInvMuertoPag>=totalPag?'disabled':'')+'>Siguiente <i class="bi bi-chevron-right"></i></button>';
            var lbl = '<span style="font-size:0.8rem; font-weight:700; color:var(--subtext);">Pág. '+window.finInvMuertoPag+' / '+totalPag+'</span>';
            pagEl.innerHTML = btnPrev + lbl + btnNext;
        } else {
            pagEl.innerHTML = '';
        }
    }
};

window.finMuertoIrPag = function(pag) {
    var totalPag = Math.ceil(window.finInvMuertoList.length / window.finInvMuertoPorPag) || 1;
    if (pag < 1) pag = 1;
    if (pag > totalPag) pag = totalPag;
    window.finInvMuertoPag = pag;
    window.finRenderMuerto();
};

window.finAbrirCritico = function() {`;

    js = js.replace(/window\.finAbrirCritico = function\(\) \{/, paginationFuncs);
    
    fs.writeFileSync(fileJs, js, 'utf8');
    console.log('logica.js updated with pagination logic.');
} else {
    console.log('Regex did not match logic in logica.js.');
}
