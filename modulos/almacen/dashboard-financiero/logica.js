window.finChartFamilia = null;
window.finChartConsumo = null;

window.finCriticoList = [];
window.init_almacen_dashboard = function() {
    document.getElementById('fin-loader').style.display = 'flex';
    document.getElementById('fin-content').style.display = 'none';

    // Lazy-load Chart.js solo cuando se abre este módulo
    var chartsReady = (typeof Chart !== 'undefined') ? Promise.resolve() : window.loadCharts();
    chartsReady.then(function() { window._initDashFinanciero(); });
};

window._initDashFinanciero = function() {
    
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
            window.finInvPorFamilia = {};

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
                if (!window.finInvPorFamilia[fam]) window.finInvPorFamilia[fam] = [];
                window.finInvPorFamilia[fam].push({
                    articulo: item.descripcion || item.articulo || item.nombre || 'Desconocido',
                    stock: stock,
                    unidad: item.unidad || 'UND',
                    valor: valor
                });

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
            var topFamKeys = famKeys.slice(0, 7);
            var otrosFamVal = 0;
            famKeys.slice(7).forEach(function(k) { otrosFamVal += familiaValor[k]; });
            var famLabels = topFamKeys.slice();
            var famData = famLabels.map(function(k){ return familiaValor[k]; });
            if (otrosFamVal > 0) { famLabels.push('OTROS'); famData.push(otrosFamVal); }
            var famLabelsFull = famLabels.map(function(k, i){ return k + ' (' + fmtM(famData[i]) + ')'; });
            
            var ctxFam = document.getElementById('fin-chart-familia');
            if (ctxFam) {
                window.finChartFamilia = new Chart(ctxFam, {
                    type: 'doughnut',
                    data: {
                        labels: famLabelsFull,
                        datasets: [{
                            data: famData,
                            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#94a3b8', '#06b6d4', '#8b5cf6', '#14b8a6', '#f43f5e', '#a855f7', '#64748b'],
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
                                if (familyClicked !== 'OTROS') window.finAbrirInvFam(familyClicked);
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
                
                window.finInvMuertoList = inventarioMuerto;
                window.finInvMuertoPag = 1;
                window.finInvMuertoPorPag = 10;
                
                window.finRenderMuerto();

                // Gráfico de Consumo
                if (window.finChartConsumo) window.finChartConsumo.destroy();
                var consKeys = Object.keys(consumoFamilia).sort(function(a,b){ return consumoFamilia[b] - consumoFamilia[a]; });
                var topConsKeys = consKeys.slice(0, 8);
                var otrosConsVal = 0;
                consKeys.slice(8).forEach(function(k) { otrosConsVal += consumoFamilia[k]; });
                var consLabels = topConsKeys.slice();
                var consData = consLabels.map(function(k){ return consumoFamilia[k]; });
                if (otrosConsVal > 0) { consLabels.push('OTROS'); consData.push(otrosConsVal); }

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
                            onClick: function(e, activeEls) {
                                if (activeEls && activeEls.length > 0) {
                                    var idx = activeEls[0].index;
                                    var familyClicked = consLabels[idx]; // el nombre real de la familia
                                    if (familyClicked !== 'OTROS') window.finAbrirSalidasFam(familyClicked);
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

window.finAbrirSalidasFam = function(familia) {
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


// Funciones globales de modales extraídas del onClick
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

