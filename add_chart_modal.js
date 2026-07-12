const fs = require('fs');
const path = require('path');

const fileHtml = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'vista.html');
let html = fs.readFileSync(fileHtml, 'utf8');

const modalSalidasHtml = `
    <!-- Modal Salidas por Familia -->
    <div class="modal fade" id="finModalSalidasFam" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-xl">
        <div class="modal-content" style="border-radius:16px; border:none; box-shadow:0 10px 40px rgba(0,0,0,0.2);">
          <div class="modal-header" style="border-bottom:1px solid var(--border); background:var(--surface);">
            <h5 class="modal-title fw-bold" style="color:var(--text);"><i class="bi bi-bar-chart-steps text-primary me-2"></i>Historial de Consumo: <span id="fin-mod-fam-titulo" style="color:var(--primary);"></span></h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-0" style="background:var(--bg); max-height: 65vh; overflow-y:auto;">
            <table class="fin-table" style="margin:0;">
                <thead style="background:var(--surface); position:sticky; top:0; z-index:10;">
                    <tr>
                        <th style="white-space:nowrap;">Fecha</th>
                        <th style="white-space:nowrap;">Placa / OT</th>
                        <th style="width:100%;">Item (Artículo)</th>
                        <th style="white-space:nowrap; text-align:right;">Cantidad</th>
                        <th style="white-space:nowrap; text-align:right;">Costo Unit.</th>
                        <th style="white-space:nowrap; text-align:right;">Total (S/)</th>
                    </tr>
                </thead>
                <tbody id="fin-tb-modal-fam">
                    <!-- JS Injected -->
                </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
`;

if (!html.includes('finModalSalidasFam')) {
    html = html.replace('<!-- Modal Stock Crítico -->', modalSalidasHtml + '\n    <!-- Modal Stock Crítico -->');
    fs.writeFileSync(fileHtml, html, 'utf8');
    console.log('vista.html updated with salidas modal.');
}

// 2. Modificar logica.js
const fileJs = path.join(__dirname, 'modulos', 'almacen', 'dashboard-financiero', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// Modificar el bucle de salidas
const regexSalLoop = /var consumoFamilia = \{\};[\s\S]*?\/\/ Inventario Muerto/;
const repSalLoop = `var consumoFamilia = {};
                window.finSalidasPorFamilia = {};

                salData.forEach(function(salida) {
                    if (salida.estado && salida.estado !== 'Despachado') return;

                    var f = new Date(salida.fecha_salida || salida.fecha || salida.created_at);
                    var ts = f.getTime();
                    
                    var dets = Array.isArray(salida.items) ? salida.items : (Array.isArray(salida.detalles) ? salida.detalles : []);
                    
                    dets.forEach(function(det) {
                        var artId = det.articulo_id || det.inventario_id || det.id_articulo;
                        if (!artId) return;

                        if (!ultimaSalida[artId] || ts > ultimaSalida[artId].ts) {
                            ultimaSalida[artId] = { ts: ts, str: f.toISOString().split('T')[0] };
                        }

                        var cant = parseFloat(det.cantidad || 0);
                        var costo = parseFloat(det.costo_unitario || 0);
                        var val = cant * costo;
                        
                        var refInv = invData.find(function(x){ return x.id === artId; });
                        var fam = refInv ? (refInv.familia || 'SIN FAMILIA').toUpperCase() : 'SIN FAMILIA';
                        
                        if (!consumoFamilia[fam]) consumoFamilia[fam] = 0;
                        consumoFamilia[fam] += val;

                        if (!window.finSalidasPorFamilia[fam]) window.finSalidasPorFamilia[fam] = [];
                        window.finSalidasPorFamilia[fam].push({
                            fecha: f.toISOString().split('T')[0],
                            placa: salida.placa || '—',
                            ot: salida.ticket_ot || '—',
                            articulo: refInv ? (refInv.descripcion || refInv.articulo) : (det.descripcion || 'Desconocido'),
                            cant: cant,
                            costo: costo,
                            total: val,
                            ts: ts
                        });
                    });
                });

                // Inventario Muerto`;

if (js.includes('window.finSalidasPorFamilia = {};')) {
    console.log('Already patched logica.js salidas loop');
} else {
    js = js.replace(regexSalLoop, repSalLoop);

    // Update chart config to handle click
    const regexChart = /var ctxCons = document\.getElementById\('fin-chart-consumo'\);[\s\S]*?options: \{[\s\S]*?x: \{ grid: \{ display: false \} \}\s*\}/;
    const repChart = `var ctxCons = document.getElementById('fin-chart-consumo');
                if (ctxCons) {
                    window.finChartConsumo = new Chart(ctxCons, {
                        type: 'bar',
                        data: {
                            labels: consLabels.map(function(l){ return l.length > 15 ? l.substring(0,15)+'...' : l; }),
                            datasets: [{
                                label: 'Gasto Consumo (S/)',
                                data: consData,
                                backgroundColor: '#6366f1',
                                borderRadius: 6
                            }]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            onClick: function(e, activeEls) {
                                if (activeEls && activeEls.length > 0) {
                                    var idx = activeEls[0].index;
                                    var familyClicked = consLabels[idx]; // el nombre real de la familia
                                    window.finAbrirSalidasFam(familyClicked);
                                }
                            },
                            onHover: function(e, activeEls) {
                                e.native.target.style.cursor = activeEls.length ? 'pointer' : 'default';
                            },
                            plugins: { 
                                legend: { display: false },
                                tooltip: { callbacks: { label: function(c) { return ' ' + fmtM(c.raw); } } },
                                datalabels: {
                                    align: 'end',
                                    anchor: 'end',
                                    color: '#6366f1',
                                    font: { size: 10, weight: 'bold' },
                                    formatter: function(value) {
                                        return fmtM(value);
                                    }
                                }
                            },
                            scales: {
                                y: { beginAtZero: true, grid: { borderDash: [2,4] }, suggestedMax: Math.max(...consData) * 1.2 },
                                x: { grid: { display: false } }
                            }`;
    
    js = js.replace(regexChart, repChart);

    const funcModal = `window.finAbrirSalidasFam = function(familia) {
    var tb = document.getElementById('fin-tb-modal-fam');
    if (!tb) return;
    
    document.getElementById('fin-mod-fam-titulo').textContent = familia;
    
    var list = window.finSalidasPorFamilia[familia] || [];
    list.sort(function(a,b){ return b.ts - a.ts; }); // más recientes primero
    
    var html = '';
    list.forEach(function(item) {
        var fmt = function(v) { return 'S/ ' + v.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}); };
        html += '<tr class="sal-item-sub">' +
            '<td style="white-space:nowrap;">' + item.fecha + '</td>' +
            '<td style="white-space:nowrap;"><strong>' + item.placa + '</strong> <span style="font-size:0.75rem;color:var(--subtext);">(' + item.ot + ')</span></td>' +
            '<td><span class="fin-td-nombre" style="width:100%; white-space:normal; overflow:visible; display:inline-block; font-size:0.85rem;">' + item.articulo + '</span></td>' +
            '<td class="text-end fw-bold">' + item.cant + '</td>' +
            '<td class="fin-td-val" style="color:var(--subtext);">' + fmt(item.costo) + '</td>' +
            '<td class="fin-td-val text-success">' + fmt(item.total) + '</td>' +
            '</tr>';
    });
    
    if (!list.length) html = '<tr><td colspan="6" class="text-center py-4 text-muted">No hay registros de salidas.</td></tr>';
    tb.innerHTML = html;
    
    var modalEl = document.getElementById('finModalSalidasFam');
    if (modalEl) {
        var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }
};

window.finAbrirCritico = function`;

    js = js.replace(/window\.finAbrirCritico = function/, funcModal);

    fs.writeFileSync(fileJs, js, 'utf8');
    console.log('logica.js updated with salidas modal logic.');
}
