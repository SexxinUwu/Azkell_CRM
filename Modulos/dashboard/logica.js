// ============================================================
// 📊 DASHBOARD MODULE — Módulo Aislado SPA
// ============================================================

// 🔥 VARIABLES LOCALES DEL DASHBOARD
let chartDashFleetrunInst = null;

// ============================================================
// 📊 GRÁFICO FLEETRUN PARA DASHBOARD
// ============================================================

window.procesarFleetrunParaDashboard = function() {
    if (!window.dataGlobalFleetrun || window.dataGlobalFleetrun.length === 0 || !window.dataGlobalPlacas || window.dataGlobalPlacas.length === 0) {
        setTimeout(procesarFleetrunParaDashboard, 500);
        return;
    }

    let cntTotalVig = 0, cntTotalPV = 0, cntTotalVenc = 0;
    let parseFecha = (str) => {
        if(!str) return 0;
        if(str.includes('/')) { let p = str.split('/'); return new Date(p[2], p[1]-1, p[0]).getTime(); }
        return new Date(str).getTime() || 0;
    };

    let mapa = new Map();
    [...window.dataGlobalFleetrun].sort((a,b) => parseFecha(b[3]) - parseFecha(a[3])).forEach(row => {
        let placa = normalizeStr(row[4]);
        let tipo = normalizeStr(row[8]);
        let key = placa + "_" + tipo;

        let infoPlaca = window.dataGlobalPlacas.find(p => normalizeStr(p[0]) === placa);
        if (infoPlaca && infoPlaca[18] === 'Activa' && !mapa.has(key)) {
            mapa.set(key, { row: row, infoPlaca: infoPlaca });
        }
    });

    let datosActuales = Array.from(mapa.values());

    datosActuales.forEach((item) => {
        let fila = item.row;
        let infoPlaca = item.infoPlaca;

        let placaRaw = fila[4];
        let km_prox = parseFloat(fila[11]) || 0;

        // 🔥 REGLA DE ORO: Si Placas (19) está vacío, usa el respaldo de Fleetrun (7)
        let utsRaw = (infoPlaca && infoPlaca[19] && String(infoPlaca[19]).trim() !== '') ? infoPlaca[19] : (fila[7] || "-");

        let km_gps = 0;
        let wialonData = buscarWialonPorPlaca(placaRaw);
        if (wialonData) { km_gps = wialonData.km; }

        let falta_km = km_prox - km_gps;

        if (falta_km <= 0) {
            cntTotalVenc++;
        } else if (falta_km > 0 && ((normalizeStr(utsRaw) === "NACIONAL" && falta_km <= 1500) || (normalizeStr(utsRaw) === "LOCAL" && falta_km <= 100))) {
            cntTotalPV++;
        } else {
            cntTotalVig++;
        }
    });

    updateGraficoDashFleetrun(cntTotalVig, cntTotalPV, cntTotalVenc);
};

window.initGraficoDashFleetrun = function() {
    let ctx = document.getElementById('chartDashFleetrunStatus');
    if (!ctx) return null;
    Chart.defaults.font.family = 'Inter';

    return new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Vigentes', 'Por Vencer', 'Vencidos'],
            datasets: [{
                data: [1, 0, 0],
                backgroundColor: ['#16a34a', '#eab308', '#dc2626'],
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            layout: { padding: { left: 10, right: 10, top: 10, bottom: 10 } },
            plugins: {
                legend: { position: 'bottom', labels: { font: { weight: 'bold' } } },
                datalabels: {
                    color: document.body.classList.contains('dark') ? '#ffffff' : '#000000',
                    font: { weight: 'bold', size: 12 },
                    formatter: (value, context) => {
                        let total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        if (total === 0 || value === 0 || context.chart.data.labels[0] === 'Sin Datos') return "";
                        return Math.round((value / total) * 100) + "%";
                    }
                }
            }
        }
    });
};

window.updateGraficoDashFleetrun = function(vigentes, porVencer, vencidos) {
    if(!chartDashFleetrunInst) chartDashFleetrunInst = initGraficoDashFleetrun();
    if(!chartDashFleetrunInst) return;
    let isDark = document.body.classList.contains('dark');
    chartDashFleetrunInst.options.plugins.legend.labels.color = isDark ? '#f8fafc' : '#1a1a2e';
    chartDashFleetrunInst.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
    chartDashFleetrunInst.options.plugins.datalabels.color = isDark ? '#ffffff' : '#000000';
    if(vigentes + porVencer + vencidos === 0) {
        chartDashFleetrunInst.data.labels = ['Sin Datos'];
        chartDashFleetrunInst.data.datasets[0].data = [1];
        chartDashFleetrunInst.data.datasets[0].backgroundColor = ['#475569'];
    } else {
        chartDashFleetrunInst.data.labels = ['Vigentes', 'Por Vencer', 'Vencidos'];
        chartDashFleetrunInst.data.datasets[0].data = [vigentes, porVencer, vencidos];
        chartDashFleetrunInst.data.datasets[0].backgroundColor = ['#16a34a', '#eab308', '#dc2626'];
    }
    chartDashFleetrunInst.update();
};

// ============================================================
// 🔄 RECARGAR DASHBOARD (FUNCIÓN PRINCIPAL)
// ============================================================

window.recargarDashboard = function() {
    if (typeof procesarFleetrunParaDashboard === 'function') {
        procesarFleetrunParaDashboard();
    }
};

// ============================================================
// 📍 INICIALIZACIÓN DEL MÓDULO DASHBOARD
// ============================================================

window.init_dashboard = function() {
    console.log('🎯 Inicializando módulo Dashboard...');

    // Esperar a que el DOM esté listo (defensivo)
    if (document.getElementById('chartDashFleetrunStatus')) {
        // Inicializar gráficos
        chartDashFleetrunInst = initGraficoDashFleetrun();

        // Cargar datos del dashboard
        setTimeout(() => {
            recargarDashboard();
        }, 100);
    } else {
        // Si el DOM no está listo, reintentar
        setTimeout(window.init_dashboard, 200);
    }
};
