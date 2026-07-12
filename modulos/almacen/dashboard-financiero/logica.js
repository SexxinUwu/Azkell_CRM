window.finChartFamilia = null;
window.finChartConsumo = null;

window.finCriticoList = [];
window.init_almacen_dashboard = function() {
    document.getElementById('fin-loader').style.display = 'flex';
    document.getElementById('fin-content').style.display = 'none';
    
    // Indicadores de carga para las secciones dependientes de salidas
    document.getElementById('fin-val-muerto').innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    document.getElementById('fin-tb-muerto').innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3"><div class="spinner-border spinner-border-sm"></div> Cargando historial...</td></tr>';

    function fmtM(v) { return 'S/ ' + v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

    // 1. CARGAR INVENTARIO PRIMERO (Rápido)
    fetch('/api/almacen/inventario')
        .then(function(r){ return r.ok ? r.json() : []; })
        .then(function(invData) {
            
            var totalInmovilizado = 0;
            var totalCritico = 0;
            window.finCriticoList = [];
            var stockValuado = []; 
            var familiaValor = {};

            invData.forEach(function(item) {
                var stock = parseFloat(item.stock_actual || 0);
                if (stock <= 0) return;
                
                var costo = parseFloat(item.costo_soles != null ? item.costo_soles : (item.costo_referencial || 0));
                var valor = stock * costo;
                var fam = (item.familia || 'SIN FAMILIA').toUpperCase();

                totalInmovilizado += valor;

                var stockMin = parseFloat(item.stock_min || 0);
                if (stockMin > 0 && stock < stockMin) {
                    totalCritico += valor;
                    window.finCriticoList.push({ articulo: item.descripcion || item.articulo || item.nombre || 'Desconocido', stock: stock, min: stockMin, unidad: item.unidad || 'UND', valor: valor });
                }

                if (!familiaValor[fam]) familiaValor[fam] = 0;
                familiaValor[fam] += valor;

                stockValuado.push({
                    id: item.id,
                    articulo: item.descripcion || item.articulo || item.nombre || 'Desconocido',
                    stock: stock,
                    valor: valor,
                    unidad: item.unidad || 'UND'
                });
            });

            // Actualizar UI básica
            document.getElementById('fin-val-total').textContent = fmtM(totalInmovilizado);
            document.getElementById('fin-val-critico').textContent = fmtM(totalCritico);

            // Top 10 Inmovilizado
            stockValuado.sort(function(a,b){ return b.valor - a.valor; });
            var htmlTop10 = '';
            stockValuado.slice(0, 10).forEach(function(item) {
                htmlTop10 += '<tr>' +
                    '<td><span class="fin-td-nombre" title="' + item.articulo + '">' + item.articulo + '</span></td>' +
                    '<td><span class="fin-badge">' + item.stock + ' ' + item.unidad + '</span></td>' +
                    '<td class="fin-td-val">' + fmtM(item.valor) + '</td>' +
                    '</tr>';
            });
            document.getElementById('fin-tb-top10').innerHTML = htmlTop10;

            // Gráfico de Familias
            if (window.finChartFamilia) window.finChartFamilia.destroy();
            var famKeys = Object.keys(familiaValor).sort(function(a,b){ return familiaValor[b] - familiaValor[a]; });
            var famLabels = famKeys.slice(0,6);
            var famData = famLabels.map(function(k){ return familiaValor[k]; });
            var famLabelsFull = famLabels.map(function(k, i){ return k + ' (' + fmtM(famData[i]) + ')'; });
            
            var ctxFam = document.getElementById('fin-chart-familia');
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
                    }
                });
            }

            // Mostrar la UI ahora que lo básico cargó
            document.getElementById('fin-loader').style.display = 'none';
            document.getElementById('fin-content').style.display = 'block';

            // 2. CARGAR SALIDAS EN SEGUNDO PLANO (Pesado)
            return fetch('/api/almacen/salidas').then(function(r){ return r.ok ? r.json() : []; }).then(function(salData) {
                var ultimaSalida = {};
                var consumoFamilia = {};

                salData.forEach(function(salida) {
                    var f = new Date(salida.fecha_salida || salida.fecha || salida.created_at);
                    var ts = f.getTime();
                    
                    // Solo considerar salidas despachadas
                if (salida.estado && salida.estado !== 'Despachado') return;
                
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
                    });
                });

                // Inventario Muerto
                var seisMesesMs = 6 * 30 * 24 * 60 * 60 * 1000;
                var ahora = new Date().getTime();
                var inventarioMuerto = [];
                var totalMuerto = 0;

                stockValuado.forEach(function(item) {
                    var ultima = ultimaSalida[item.id];
                    var tsUltima = ultima ? ultima.ts : 0;
                    
                    if (ahora - tsUltima > seisMesesMs) {
                        totalMuerto += item.valor;
                        inventarioMuerto.push({
                            articulo: item.articulo,
                            valor: item.valor,
                            fecha_ult: ultima ? ultima.str : 'Nunca'
                        });
                    }
                });

                document.getElementById('fin-val-muerto').textContent = fmtM(totalMuerto);

                inventarioMuerto.sort(function(a,b){ return b.valor - a.valor; });
                var htmlMuerto = '';
                inventarioMuerto.slice(0, 10).forEach(function(item) {
                    htmlMuerto += '<tr>' +
                        '<td><span class="fin-td-nombre" title="' + item.articulo + '">' + item.articulo + '</span></td>' +
                        '<td><span class="fin-badge" style="background:#fee2e2;color:#dc2626;">' + item.fecha_ult + '</span></td>' +
                        '<td class="fin-td-val" style="color:#dc2626;">' + fmtM(item.valor) + '</td>' +
                        '</tr>';
                });
                document.getElementById('fin-tb-muerto').innerHTML = htmlMuerto || '<tr><td colspan="3" class="text-center text-muted py-3">No hay inventario muerto.</td></tr>';

                // Gráfico de Consumo
                if (window.finChartConsumo) window.finChartConsumo.destroy();
                var consKeys = Object.keys(consumoFamilia).sort(function(a,b){ return consumoFamilia[b] - consumoFamilia[a]; });
                var consLabels = consKeys.slice(0,5);
                var consData = consLabels.map(function(k){ return consumoFamilia[k]; });

                var ctxCons = document.getElementById('fin-chart-consumo');
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
                            }
                        }
                    });
                }
            });

        })
        .catch(function(e) {
            console.error(e);
            document.getElementById('fin-loader').innerHTML = '<div class="text-danger"><i class="bi bi-x-circle fs-2 mb-2 d-block text-center"></i> Error al cargar datos del dashboard.</div>';
        });
};


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

// Carga inicial al inyectar script
if (document.getElementById('dash-fin-container')) {
    init_almacen_dashboard();
}
