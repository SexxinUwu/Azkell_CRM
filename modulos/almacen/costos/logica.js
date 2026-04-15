// ================================================================
// MÓDULO ALMACÉN / COSTOS — Lógica SPA Aislada
// Chart.js: destruir antes de crear (CLAUDE.md)
// ================================================================

window._cosChartFamilia = window._cosChartFamilia || null;
window._cosData         = window._cosData         || null;

window.init_costos = function() {
    // Setear fechas por defecto: primer día del mes actual → hoy
    var hoy = new Date();
    var primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
    var hoyStr    = hoy.toISOString().split('T')[0];
    var desdeEl   = document.getElementById('cos-desde');
    var hastaEl   = document.getElementById('cos-hasta');
    if (desdeEl && !desdeEl.value) desdeEl.value = primerDia;
    if (hastaEl && !hastaEl.value) hastaEl.value = hoyStr;
    window.cargarCostos();
};

window._cosClearFechas = function() {
    var d = document.getElementById('cos-desde');
    var h = document.getElementById('cos-hasta');
    if (d) d.value = '';
    if (h) h.value = '';
    window.cargarCostos();
};

window.cargarCostos = function() {
    var desde = ((document.getElementById('cos-desde')||{}).value || '');
    var hasta = ((document.getElementById('cos-hasta')||{}).value || '');
    var params = '';
    if (desde) params += (params?'&':'?') + 'desde='+encodeURIComponent(desde);
    if (hasta) params += (params?'&':'?') + 'hasta='+encodeURIComponent(hasta);

    ['tbody-cos-familia','tbody-cos-almacen','tbody-cos-top'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="spinner-border spinner-border-sm me-2"></div></td></tr>';
    });

    fetch('/api/almacen/costos' + params)
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(data) {
            window._cosData = data;
            window._cosRender(data);
        })
        .catch(function(err) {
            ['cos-kpi-entradas','cos-kpi-salidas','cos-kpi-balance','cos-kpi-familias'].forEach(function(id) {
                var el = document.getElementById(id); if(el) el.textContent = 'Error';
            });
        });
};

window._cosRender = function(data) {
    var tot    = data.totales || {};
    var totEnt = parseFloat(tot.total_entradas || 0);
    var totSal = parseFloat(tot.total_salidas  || 0);
    var bal    = totEnt - totSal;
    var fmt    = function(n) { return 'S/ ' + n.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}); };

    _cosSetText('cos-kpi-entradas', fmt(totEnt));
    _cosSetText('cos-kpi-salidas',  fmt(totSal));
    _cosSetText('cos-kpi-balance',  (bal >= 0 ? '+' : '') + fmt(bal));
    _cosSetText('cos-kpi-familias', (data.porFamilia || []).length + ' familias');

    // ── Por Familia ─────────────────────────────────────────────
    var totalFam = (data.porFamilia || []).reduce(function(a,d) { return a + parseFloat(d.total||0); }, 0);
    var tbodyFam = document.getElementById('tbody-cos-familia');
    if (tbodyFam) {
        if (!data.porFamilia || !data.porFamilia.length) {
            tbodyFam.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-muted"><i class="bi bi-inbox me-2"></i>Sin datos</td></tr>';
        } else {
            tbodyFam.innerHTML = data.porFamilia.map(function(d) {
                var pct = totalFam > 0 ? (parseFloat(d.total||0)/totalFam*100).toFixed(1) : 0;
                return '<tr>'+
                    '<td><i class="bi bi-tag-fill me-1 text-warning"></i>'+_cosEsc(d.familia||'—')+'</td>'+
                    '<td class="text-end fw-semibold">'+fmt(parseFloat(d.total||0))+'</td>'+
                    '<td class="text-center">'+d.movimientos+'</td>'+
                    '<td><div class="d-flex align-items-center gap-2">'+
                        '<div class="progress flex-grow-1" style="height:6px;"><div class="progress-bar bg-warning" style="width:'+pct+'%"></div></div>'+
                        '<small class="text-muted">'+pct+'%</small>'+
                    '</div></td>'+
                '</tr>';
            }).join('');
        }
    }

    // ── Por Almacén ─────────────────────────────────────────────
    var totalAlm = (data.porAlmacen || []).reduce(function(a,d) { return a + parseFloat(d.total||0); }, 0);
    var tbodyAlm = document.getElementById('tbody-cos-almacen');
    if (tbodyAlm) {
        if (!data.porAlmacen || !data.porAlmacen.length) {
            tbodyAlm.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-muted"><i class="bi bi-inbox me-2"></i>Sin datos</td></tr>';
        } else {
            tbodyAlm.innerHTML = data.porAlmacen.map(function(d) {
                var pct = totalAlm > 0 ? (parseFloat(d.total||0)/totalAlm*100).toFixed(1) : 0;
                return '<tr>'+
                    '<td><i class="bi bi-building me-1 text-info"></i>'+_cosEsc(d.almacen||'—')+'</td>'+
                    '<td class="text-end fw-semibold">'+fmt(parseFloat(d.total||0))+'</td>'+
                    '<td class="text-center">'+d.movimientos+'</td>'+
                    '<td><div class="d-flex align-items-center gap-2">'+
                        '<div class="progress flex-grow-1" style="height:6px;"><div class="progress-bar bg-info" style="width:'+pct+'%"></div></div>'+
                        '<small class="text-muted">'+pct+'%</small>'+
                    '</div></td>'+
                '</tr>';
            }).join('');
        }
    }

    // ── Top Artículos ────────────────────────────────────────────
    var tbodyTop = document.getElementById('tbody-cos-top');
    if (tbodyTop) {
        if (!data.topItems || !data.topItems.length) {
            tbodyTop.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted"><i class="bi bi-inbox me-2"></i>Sin datos</td></tr>';
        } else {
            tbodyTop.innerHTML = data.topItems.map(function(d, i) {
                var rankBadge = i < 3 ? ['🥇','🥈','🥉'][i] : (i+1)+'.';
                return '<tr>'+
                    '<td>'+rankBadge+' <span class="badge bg-secondary fw-normal">'+_cosEsc(d.id||'')+'</span></td>'+
                    '<td>'+_cosEsc(d.descripcion||'')+'</td>'+
                    '<td><small class="badge bg-warning-subtle text-warning border">'+_cosEsc(d.familia||'—')+'</small></td>'+
                    '<td class="text-end">'+parseFloat(d.cantidad_total||0).toLocaleString('es-PE',{minimumFractionDigits:2})+' '+_cosEsc(d.unidad||'')+'</td>'+
                    '<td class="text-end fw-semibold">'+fmt(parseFloat(d.costo_total||0))+'</td>'+
                '</tr>';
            }).join('');
        }
    }

    // ── Gráfico Por Familia ──────────────────────────────────────
    window._cosRenderChart(data.porFamilia || []);
};

window._cosRenderChart = function(porFamilia) {
    var canvas = document.getElementById('chart-cos-familia');
    if (!canvas) return;

    // Destruir instancia anterior si canvas ya no está en DOM o existe
    if (window._cosChartFamilia) {
        if (!document.contains(window._cosChartFamilia.canvas)) {
            window._cosChartFamilia.destroy();
            window._cosChartFamilia = null;
        }
    }
    if (window._cosChartFamilia) {
        window._cosChartFamilia.destroy();
        window._cosChartFamilia = null;
    }
    if (!porFamilia.length) return;

    var labels = porFamilia.slice(0, 10).map(function(d) { return d.familia || 'Sin familia'; });
    var valores = porFamilia.slice(0, 10).map(function(d) { return parseFloat(d.total||0); });

    var isDark = document.body.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
    var textColor = isDark ? '#e2e8f0' : '#334155';

    window._cosChartFamilia = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Costo Total (S/)',
                data: valores,
                backgroundColor: 'rgba(245, 158, 11, 0.7)',
                borderColor: 'rgba(245, 158, 11, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctx) { return ' S/ ' + ctx.parsed.y.toLocaleString('es-PE',{minimumFractionDigits:2}); }
                    }
                }
            },
            scales: {
                x: { ticks: { color: textColor } },
                y: { ticks: { color: textColor, callback: function(v) { return 'S/ ' + v.toLocaleString(); } } }
            }
        }
    });
};

function _cosSetText(id, val) { var el = document.getElementById(id); if(el) el.textContent = val; }
function _cosEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
