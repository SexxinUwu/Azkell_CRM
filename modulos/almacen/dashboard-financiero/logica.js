window.finChartFamilia = null;
window.finChartConsumo = null;

window.init_almacen_dashboard = function() {
    document.getElementById('fin-loader').style.display = 'flex';
    document.getElementById('fin-content').style.display = 'none';

    Promise.all([
        fetch('/api/almacen/inventario').then(function(r){ return r.ok ? r.json() : []; }),
        fetch('/api/almacen/salidas').then(function(r){ return r.ok ? r.json() : []; })
    ]).then(function(results) {
        var invData = results[0];
        var salData = results[1];

        // ── PROCESAMIENTO INVENTARIO ──
        var totalInmovilizado = 0;
        var totalCritico = 0;
        var stockValuado = []; // Para top 10 y para cruzar con muertes
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

        // ── PROCESAMIENTO SALIDAS (Consumo & Inventario Muerto) ──
        // salData tiene { id, fecha, detalles: [...] } o aplanado si la API lo manda aplanado
        // Asumiendo que salData es un array de salidas y que las salidas tienen "detalles" 
        // o si son ítems directos (por cómo funciona el CRM general).
        // Vamos a extraer fechas máximas por ID de artículo
        var ultimaSalida = {};
        var consumoFamilia = {};

        // Parsear salidas
        salData.forEach(function(salida) {
            var f = new Date(salida.fecha_salida || salida.fecha || salida.created_at);
            var ts = f.getTime();
            
            // Si la API devuelve detalles anidados
            var dets = Array.isArray(salida.detalles) ? salida.detalles : [salida];
            
            dets.forEach(function(det) {
                var artId = det.articulo_id || det.inventario_id || det.id_articulo;
                if (!artId) return;

                // Ultima salida
                if (!ultimaSalida[artId] || ts > ultimaSalida[artId].ts) {
                    ultimaSalida[artId] = { ts: ts, str: f.toISOString().split('T')[0] };
                }

                // Consumo
                var cant = parseFloat(det.cantidad || 0);
                var costo = parseFloat(det.costo_unitario || 0);
                var val = cant * costo;
                
                var refInv = invData.find(function(x){ return x.id === artId; });
                var fam = refInv ? (refInv.familia || 'SIN FAMILIA').toUpperCase() : 'SIN FAMILIA';
                
                if (!consumoFamilia[fam]) consumoFamilia[fam] = 0;
                consumoFamilia[fam] += val;
            });
        });

        // ── INVENTARIO MUERTO (> 6 MESES) ──
        var seisMesesMs = 6 * 30 * 24 * 60 * 60 * 1000;
        var ahora = new Date().getTime();
        var inventarioMuerto = [];
        var totalMuerto = 0;

        stockValuado.forEach(function(item) {
            var ultima = ultimaSalida[item.id];
            var tsUltima = ultima ? ultima.ts : 0; // 0 si nunca ha salido
            
            // Si nunca salió y tiene más de 6 meses (asumimos que sí), o su última salida fue hace > 6 meses
            if (ahora - tsUltima > seisMesesMs) {
                totalMuerto += item.valor;
                inventarioMuerto.push({
                    articulo: item.articulo,
                    valor: item.valor,
                    fecha_ult: ultima ? ultima.str : 'Nunca',
                    ts: tsUltima
                });
            }
        });

        // ── ACTUALIZAR UI ──
        function fmtM(v) { return 'S/ ' + v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
        
        document.getElementById('fin-val-total').textContent = fmtM(totalInmovilizado);
        document.getElementById('fin-val-critico').textContent = fmtM(totalCritico);
        document.getElementById('fin-val-muerto').textContent = fmtM(totalMuerto);

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

        // Top Inventario Muerto
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

        // ── GRAFICOS ──
        if (window.finChartFamilia) window.finChartFamilia.destroy();
        if (window.finChartConsumo) window.finChartConsumo.destroy();

        // 1. Dona Familias
        var famKeys = Object.keys(familiaValor).sort(function(a,b){ return familiaValor[b] - familiaValor[a]; });
        var famLabels = famKeys.slice(0,6); // Top 6
        var famData = famLabels.map(function(k){ return familiaValor[k]; });
        
        var ctxFam = document.getElementById('fin-chart-familia');
        if (ctxFam) {
            window.finChartFamilia = new Chart(ctxFam, {
                type: 'doughnut',
                data: {
                    labels: famLabels,
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
                        tooltip: { callbacks: { label: function(c) { return ' ' + fmtM(c.raw); } } }
                    },
                    cutout: '70%'
                }
            });
        }

        // 2. Bar Consumo
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
                        tooltip: { callbacks: { label: function(c) { return ' ' + fmtM(c.raw); } } }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { borderDash: [2,4] } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        document.getElementById('fin-loader').style.display = 'none';
        document.getElementById('fin-content').style.display = 'block';
    }).catch(function(e) {
        console.error(e);
        document.getElementById('fin-loader').innerHTML = '<div class="text-danger"><i class="bi bi-x-circle fs-2 mb-2 d-block text-center"></i> Error al cargar datos.</div>';
    });
};

// Carga inicial al inyectar script
if (document.getElementById('dash-fin-container')) {
    init_almacen_dashboard();
}
