const fs = require('fs');
const path = require('path');

const fileHtml = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'vista.html');
let html = fs.readFileSync(fileHtml, 'utf8');

const modalInvHtml = `
    <!-- Modal Inventario por Familia -->
    <div class="modal fade" id="finModalInvFam" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content" style="border-radius:16px; border:none; box-shadow:0 10px 40px rgba(0,0,0,0.2);">
          <div class="modal-header" style="border-bottom:1px solid var(--border); background:var(--surface);">
            <h5 class="modal-title fw-bold" style="color:var(--text);"><i class="bi bi-pie-chart-fill text-info me-2"></i>Artículos Valorizados: <span id="fin-mod-inv-fam-titulo" style="color:var(--primary);"></span></h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-0" style="background:var(--bg); max-height: 60vh; overflow-y:auto;">
            <table class="fin-table" style="margin:0;">
                <thead style="background:var(--surface); position:sticky; top:0; z-index:10;">
                    <tr>
                        <th style="width:100%;">Artículo</th>
                        <th style="white-space:nowrap;">Stock Actual</th>
                        <th style="white-space:nowrap; text-align:right;">Valor (S/)</th>
                    </tr>
                </thead>
                <tbody id="fin-tb-modal-inv-fam">
                    <!-- JS Injected -->
                </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
`;

if (!html.includes('finModalInvFam')) {
    html = html.replace('<!-- Modal Stock Crítico -->', modalInvHtml + '\n    <!-- Modal Stock Crítico -->');
    fs.writeFileSync(fileHtml, html, 'utf8');
    console.log('vista.html updated with inventario por familia modal.');
}

// 2. Modificar logica.js
const fileJs = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// Añadir array a la logica
const regexVars = /var stockValuado = \[\];\s*var familiaValor = \{\};/;
const repVars = `var stockValuado = []; 
            var familiaValor = {};
            window.finInvPorFamilia = {};`;

if (!js.includes('window.finInvPorFamilia = {};')) {
    js = js.replace(regexVars, repVars);
    
    // Poblar el array dentro del forEach
    const regexFamVal = /if \(!familiaValor\[fam\]\) familiaValor\[fam\] = 0;\s*familiaValor\[fam\] \+= valor;/;
    const repFamVal = `if (!familiaValor[fam]) familiaValor[fam] = 0;
                familiaValor[fam] += valor;
                if (!window.finInvPorFamilia[fam]) window.finInvPorFamilia[fam] = [];
                window.finInvPorFamilia[fam].push({
                    articulo: item.descripcion || item.articulo || item.nombre || 'Desconocido',
                    stock: stock,
                    unidad: item.unidad || 'UND',
                    valor: valor
                });`;
    js = js.replace(regexFamVal, repFamVal);

    // Añadir onClick y hover al Doughnut
    const regexDoughnut = /var ctxFam = document\.getElementById\('fin-chart-familia'\);[\s\S]*?options: \{[\s\S]*?cutout: '70%'\s*\}/;
    const repDoughnut = `var ctxFam = document.getElementById('fin-chart-familia');
            if (ctxFam) {
                window.finChartFamilia = new Chart(ctxFam, {
                    type: 'doughnut',
                    data: {
                        labels: famLabelsFull,
                        datasets: [{
                            data: famData,
                            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#94a3b8'],
                            borderWidth: 0,
                            hoverOffset: 4
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        onClick: function(e, activeEls) {
                            if (activeEls && activeEls.length > 0) {
                                var idx = activeEls[0].index;
                                var familyClicked = famLabels[idx]; // el nombre original de la familia sin el monto
                                window.finAbrirInvFam(familyClicked);
                            }
                        },
                        onHover: function(e, activeEls) {
                            e.native.target.style.cursor = activeEls.length ? 'pointer' : 'default';
                        },
                        plugins: { 
                            legend: { position: 'right', labels: { font: { family: 'Inter', size: 11 } } },
                            tooltip: { callbacks: { label: function(c) { return ' ' + fmtM(c.raw); } } },
                            datalabels: {
                                color: '#fff',
                                font: { weight: 'bold' },
                                formatter: function(value, context) {
                                    var sum = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                    if (sum === 0) return '0%';
                                    var percentage = (value * 100 / sum).toFixed(1) + '%';
                                    return percentage;
                                }
                            }
                        },
                        cutout: '70%'
                    }`;
    js = js.replace(regexDoughnut, repDoughnut);

    // Añadir funcion modal
    const funcInvFam = `
window.finAbrirInvFam = function(familia) {
    var tb = document.getElementById('fin-tb-modal-inv-fam');
    if (!tb) return;
    
    document.getElementById('fin-mod-inv-fam-titulo').textContent = familia;
    
    var list = window.finInvPorFamilia[familia] || [];
    list.sort(function(a,b){ return b.valor - a.valor; }); // de mayor a menor valor
    
    var html = '';
    var totalVal = 0;
    list.forEach(function(item) {
        totalVal += item.valor;
        html += '<tr>' +
            '<td><span class="fin-td-nombre" style="width:100%; white-space:normal;">' + item.articulo + '</span></td>' +
            '<td><span class="fin-badge">' + item.stock + ' ' + item.unidad + '</span></td>' +
            '<td class="fin-td-val fw-bold" style="color:var(--text);">S/ ' + item.valor.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>' +
            '</tr>';
    });
    
    if (list.length > 0) {
        html += '<tr style="background:rgba(0,0,0,0.02);"><td colspan="2" class="text-end fw-bold">TOTAL:</td><td class="fin-td-val fw-bold" style="color:var(--primary);">S/ ' + totalVal.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td></tr>';
    }
    
    if (!list.length) html = '<tr><td colspan="3" class="text-center py-4 text-muted">No hay artículos.</td></tr>';
    tb.innerHTML = html;
    
    var modalEl = document.getElementById('finModalInvFam');
    if (modalEl) {
        var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }
};

window.finAbrirSalidasFam`;
    
    js = js.replace(/window\.finAbrirSalidasFam/, funcInvFam);
    
    fs.writeFileSync(fileJs, js, 'utf8');
    console.log('logica.js updated with inventario modal logic.');
} else {
    console.log('logica.js already patched.');
}
