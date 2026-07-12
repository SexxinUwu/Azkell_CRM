const fs = require('fs');
const path = require('path');

const fileHtml = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'vista.html');
let html = fs.readFileSync(fileHtml, 'utf8');

// 1. Añadir onclick al card de Stock Crítico
const regexCard = /<div class="fin-kpi-card">(\s*<div class="fin-kpi-info">\s*<div class="fin-kpi-label">Stock Crítico)/;
html = html.replace(regexCard, `<div class="fin-kpi-card" style="cursor:pointer; transition:transform 0.15s; box-shadow:0 4px 12px rgba(220,38,38,0.15);" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='none'" onclick="window.finAbrirCritico()">$1`);

// 2. Insertar Modal al final
const modalHtml = `
    <!-- Modal Stock Crítico -->
    <div class="modal fade" id="finModalCritico" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content" style="border-radius:16px; border:none; box-shadow:0 10px 40px rgba(0,0,0,0.2);">
          <div class="modal-header" style="border-bottom:1px solid var(--border); background:var(--surface);">
            <h5 class="modal-title fw-bold" style="color:var(--text);"><i class="bi bi-exclamation-triangle-fill text-danger me-2"></i>Detalle de Stock Crítico</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-0" style="background:var(--bg); max-height: 60vh; overflow-y:auto;">
            <table class="fin-table" style="margin:0;">
                <thead style="background:var(--surface); position:sticky; top:0; z-index:10;">
                    <tr>
                        <th style="width:100%;">Artículo</th>
                        <th style="white-space:nowrap;">Stock / Mínimo</th>
                        <th style="white-space:nowrap; text-align:right;">Valor (S/)</th>
                    </tr>
                </thead>
                <tbody id="fin-tb-modal-critico">
                    <!-- JS Injected -->
                </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
</div>`;
html = html.replace(/<\/div>\s*<script src="modulos\/almacen\/dashboard-financiero\/logica.js"><\/script>/, modalHtml + '\n<script src="modulos/almacen/dashboard-financiero/logica.js"></script>');

fs.writeFileSync(fileHtml, html, 'utf8');
console.log('vista.html updated.');

const fileJs = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// Modificar JS para atrapar los items críticos
const regexLoop = /totalCritico \+= valor;\n\s*\}/;
const repLoop = `totalCritico += valor;
                    window.finCriticoList.push({ articulo: item.descripcion || item.articulo || item.nombre || 'Desconocido', stock: stock, min: stockMin, unidad: item.unidad || 'UND', valor: valor });
                }`;

if (js.includes('window.finCriticoList = [];')) {
    console.log('Already patched logica.js');
} else {
    js = js.replace(/window\.init_almacen_dashboard = function\(\) \{/, 'window.finCriticoList = [];\nwindow.init_almacen_dashboard = function() {');
    js = js.replace(/var totalCritico = 0;/, 'var totalCritico = 0;\n            window.finCriticoList = [];');
    js = js.replace(regexLoop, repLoop);

    // Añadir función para abrir modal
    const funcHtml = `
window.finAbrirCritico = function() {
    var tb = document.getElementById('fin-tb-modal-critico');
    if (!tb) return;
    
    var html = '';
    var list = (window.finCriticoList || []).sort(function(a,b){ return b.valor - a.valor; });
    
    list.forEach(function(item) {
        html += '<tr>' +
            '<td><span class="fin-td-nombre" style="width:100%;">' + item.articulo + '</span></td>' +
            '<td><span class="fin-badge" style="background:#fee2e2;color:#dc2626;">' + item.stock + ' / ' + item.min + ' ' + item.unidad + '</span></td>' +
            '<td class="fin-td-val" style="color:#dc2626;">S/ ' + item.valor.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>' +
            '</tr>';
    });
    
    if (!list.length) html = '<tr><td colspan="3" class="text-center py-4 text-muted">No hay artículos en estado crítico.</td></tr>';
    tb.innerHTML = html;
    
    var modalEl = document.getElementById('finModalCritico');
    if (modalEl) {
        var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }
};

// Carga inicial al inyectar script`;
    
    js = js.replace(/\/\/ Carga inicial al inyectar script/, funcHtml);
    fs.writeFileSync(fileJs, js, 'utf8');
    console.log('logica.js updated.');
}
