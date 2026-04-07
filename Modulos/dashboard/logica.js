// ============================================================
// 📊 DASHBOARD MODULE — Módulo Aislado SPA
// ============================================================

// 🔥 VARIABLES GLOBALES (patrón window para evitar crash en F5)
window.chartDashFleetrunInst = window.chartDashFleetrunInst || null;
window.chartInspDashInst     = window.chartInspDashInst     || null;
window.mapaDashInst          = window.mapaDashInst          || null;

// ============================================================
// 📊 GRÁFICO FLEETRUN (Salud de Mantenimientos)
// ============================================================

window.initGraficoDashFleetrun = function() {
    let ctx = document.getElementById('chartDashFleetrunStatus');
    if (!ctx) return null;
    if (window.chartDashFleetrunInst) {
        window.chartDashFleetrunInst.destroy();
        window.chartDashFleetrunInst = null;
    }
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
    if (!window.chartDashFleetrunInst) window.chartDashFleetrunInst = initGraficoDashFleetrun();
    if (!window.chartDashFleetrunInst) return;
    let isDark = document.body.classList.contains('dark');
    window.chartDashFleetrunInst.options.plugins.legend.labels.color = isDark ? '#f8fafc' : '#1a1a2e';
    window.chartDashFleetrunInst.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
    window.chartDashFleetrunInst.options.plugins.datalabels.color = isDark ? '#ffffff' : '#000000';
    if (vigentes + porVencer + vencidos === 0) {
        window.chartDashFleetrunInst.data.labels = ['Sin Datos'];
        window.chartDashFleetrunInst.data.datasets[0].data = [1];
        window.chartDashFleetrunInst.data.datasets[0].backgroundColor = ['#475569'];
    } else {
        window.chartDashFleetrunInst.data.labels = ['Vigentes', 'Por Vencer', 'Vencidos'];
        window.chartDashFleetrunInst.data.datasets[0].data = [vigentes, porVencer, vencidos];
        window.chartDashFleetrunInst.data.datasets[0].backgroundColor = ['#16a34a', '#eab308', '#dc2626'];
    }
    window.chartDashFleetrunInst.update();
};

window.procesarFleetrunParaDashboard = function() {
    if (!window.dataGlobalFleetrun || window.dataGlobalFleetrun.length === 0 ||
        !window.dataGlobalPlacas    || window.dataGlobalPlacas.length === 0) {
        setTimeout(procesarFleetrunParaDashboard, 500);
        return;
    }
    let parseFecha = (str) => {
        if (!str) return 0;
        if (str.includes('/')) { let p = str.split('/'); return new Date(p[2], p[1]-1, p[0]).getTime(); }
        return new Date(str).getTime() || 0;
    };
    let cntTotalVig = 0, cntTotalPV = 0, cntTotalVenc = 0;
    let mapa = new Map();
    [...window.dataGlobalFleetrun].sort((a,b) => parseFecha(b[3]) - parseFecha(a[3])).forEach(row => {
        let placa = normalizeStr(row[4]);
        let tipo  = normalizeStr(row[8]);
        let key   = placa + "_" + tipo;
        let infoPlaca = window.dataGlobalPlacas.find(p => normalizeStr(p[0]) === placa);
        if (infoPlaca && infoPlaca[18] === 'Activa' && !mapa.has(key)) {
            mapa.set(key, { row: row, infoPlaca: infoPlaca });
        }
    });
    Array.from(mapa.values()).forEach(item => {
        let fila = item.row;
        let infoPlaca = item.infoPlaca;
        let placaRaw = fila[4];
        let km_prox  = parseFloat(fila[11]) || 0;
        let utsRaw   = (infoPlaca && infoPlaca[19] && String(infoPlaca[19]).trim() !== '')
                       ? infoPlaca[19] : (fila[7] || "-");
        let km_gps   = 0;
        let wialonData = buscarWialonPorPlaca(placaRaw);
        if (wialonData) { km_gps = wialonData.km; }
        let falta_km = km_prox - km_gps;
        if (falta_km <= 0) {
            cntTotalVenc++;
        } else if (falta_km > 0 && ((normalizeStr(utsRaw) === "NACIONAL" && falta_km <= 1500) ||
                                    (normalizeStr(utsRaw) === "LOCAL"    && falta_km <= 100))) {
            cntTotalPV++;
        } else {
            cntTotalVig++;
        }
    });
    updateGraficoDashFleetrun(cntTotalVig, cntTotalPV, cntTotalVenc);
};

// ============================================================
// 📊 GRÁFICO INSPECCIONES (Estado General del Mes)
// ============================================================

window.initGraficoInspDash = function() {
    let ctx = document.getElementById('chartGeneralInspecciones');
    if (!ctx) return null;
    if (window.chartInspDashInst) {
        window.chartInspDashInst.destroy();
        window.chartInspDashInst = null;
    }
    return new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Vigentes', 'Por Vencer', 'Sin Registro', 'Vencidos'],
            datasets: [{
                data: [1, 0, 0, 0],
                backgroundColor: ['#16a34a', '#eab308', '#64748b', '#dc2626'],
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
                        if (total === 0 || value === 0) return "";
                        return Math.round((value / total) * 100) + "%";
                    }
                }
            }
        }
    });
};

window.procesarInspeccionesParaDashboard = function() {
    if (!window.dataGlobalInspecciones || window.dataGlobalInspecciones.length === 0 ||
        !window.dataGlobalPlacas        || window.dataGlobalPlacas.length === 0) {
        setTimeout(procesarInspeccionesParaDashboard, 600);
        return;
    }
    let hoy = new Date(); hoy.setHours(0,0,0,0);
    let vigentes = 0, porVencer = 0, sinRegistro = 0, vencidos = 0;
    let inspecciones = window.dataGlobalInspecciones.filter(i => i.estado !== 'Eliminada');

    let placasActivas = window.dataGlobalPlacas.filter(p => {
        if ((p[0] || '').toUpperCase() === 'PLACA') return false;
        let estado = normalizeStr(p[18] || '');
        let enUso  = normalizeStr(p[22] || '');
        return estado === "ACTIVA" && (enUso === "SI" || enUso === "SÍ");
    });

    placasActivas.forEach(p => {
        let placaStr = normalizeStr(p[0]);
        let insp = [...inspecciones]
            .sort((a, b) => {
                let pa = parseInt((a.id || '').split('-')[1]) || 0;
                let pb = parseInt((b.id || '').split('-')[1]) || 0;
                return pb - pa;
            })
            .find(i => normalizeStr(i.placa) === placaStr);

        if (!insp || !insp.fecha_ingreso) { sinRegistro++; return; }

        let fIngreso;
        try {
            if (insp.fecha_ingreso.includes('/')) {
                let px = insp.fecha_ingreso.split('/');
                fIngreso = new Date(px[2], px[1]-1, px[0]);
            } else {
                fIngreso = new Date(insp.fecha_ingreso + "T00:00:00");
            }
        } catch(e) { sinRegistro++; return; }

        let dProp = parseInt(insp.dias_propuestos) || 30;
        let fProx = new Date(fIngreso.getTime());
        fProx.setDate(fProx.getDate() + dProp);
        let diasRestantes = Math.ceil((fProx - hoy) / (1000 * 60 * 60 * 24));

        if      (diasRestantes < 0)              vencidos++;
        else if (diasRestantes >= 0 && diasRestantes <= 7) porVencer++;
        else                                     vigentes++;
    });

    if (!window.chartInspDashInst) window.chartInspDashInst = initGraficoInspDash();
    if (!window.chartInspDashInst) return;

    let isDark = document.body.classList.contains('dark');
    window.chartInspDashInst.data.datasets[0].data = [vigentes, porVencer, sinRegistro, vencidos];
    window.chartInspDashInst.options.plugins.datalabels.color = isDark ? '#f8fafc' : '#1a1a2e';
    window.chartInspDashInst.options.scales.x.ticks.color = isDark ? '#98989d' : '#8e8e93';
    window.chartInspDashInst.options.scales.y.ticks.color = isDark ? '#98989d' : '#8e8e93';
    window.chartInspDashInst.options.scales.y.grid.color  = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    window.chartInspDashInst.update();
};

// ============================================================
// 🗺️ MAPA GPS WIALON (Leaflet)
// ============================================================

window.initMapaDashboard = function(datos) {
    let contenedor = document.getElementById('mapaDashboard');
    if (!contenedor) return;

    // Destruir mapa anterior si existe
    if (window.mapaDashInst) {
        window.mapaDashInst.remove();
        window.mapaDashInst = null;
    }

    let vehiculosConPos = (datos || []).filter(w => w.lat !== 0 && w.lng !== 0);
    let countEl = document.getElementById('dash-gps-count');
    if (countEl) countEl.textContent = (datos || []).length + ' Unidades';

    window.mapaDashInst = L.map('mapaDashboard', { zoomControl: true, scrollWheelZoom: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OSM', maxZoom: 18
    }).addTo(window.mapaDashInst);

    if (vehiculosConPos.length === 0) {
        window.mapaDashInst.setView([-12.0464, -77.0428], 11); // Lima, Perú
        return;
    }

    let bounds = [];
    vehiculosConPos.forEach(w => {
        let marker = L.marker([w.lat, w.lng]).addTo(window.mapaDashInst);
        let popup = `<div style="font-family: system-ui; min-width:160px;">
            <b style="font-size:0.95rem;">🚛 ${w.nombre_wialon}</b><br>
            <span style="font-size:0.8rem; color:#555;">Placa: <b>${w.placa}</b></span><br>
            <span style="font-size:0.8rem; color:#555;"><i>📍</i> ${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}</span><br>
            <span style="font-size:0.8rem; color:#555;">🏁 ${(w.km || 0).toLocaleString()} km</span>
        </div>`;
        marker.bindPopup(popup);
        bounds.push([w.lat, w.lng]);
    });

    window.mapaDashInst.fitBounds(bounds, { padding: [30, 30] });
    // Forzar repintado del mapa (fix Leaflet en SPA)
    setTimeout(() => { if (window.mapaDashInst) window.mapaDashInst.invalidateSize(); }, 300);
};

window.cargarMapaWialonDash = async function() {
    try {
        const res = await fetch('/api/script/obtenerDatosWialon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const datos = json.data || [];

        // Actualizar caché global
        if (typeof CACHE !== 'undefined') CACHE['wialon'] = datos;

        if (!Array.isArray(datos) || datos.error) {
            console.warn('Wialon sin datos:', datos);
            initMapaDashboard([]);
            return;
        }
        initMapaDashboard(datos);
    } catch (err) {
        console.error('Error cargando Wialon para dashboard:', err);
        initMapaDashboard([]);
    }
};

// ============================================================
// 🔄 RECARGAR DASHBOARD
// ============================================================

window.recargarDashboard = function() {
    if (typeof procesarFleetrunParaDashboard === 'function') procesarFleetrunParaDashboard();
    if (typeof procesarInspeccionesParaDashboard === 'function') procesarInspeccionesParaDashboard();
    cargarMapaWialonDash();
};

// ============================================================
// 📍 INICIALIZACIÓN DEL MÓDULO DASHBOARD
// ============================================================

window.init_dashboard = function() {
    console.log('🎯 Inicializando módulo Dashboard...');

    let ctx1 = document.getElementById('chartDashFleetrunStatus');
    let ctx2 = document.getElementById('chartGeneralInspecciones');
    let mapa = document.getElementById('mapaDashboard');

    if (!ctx1 || !ctx2 || !mapa) {
        setTimeout(window.init_dashboard, 200);
        return;
    }

    // Destruir instancias viejas si el canvas ya no está en el DOM activo
    if (window.chartDashFleetrunInst && !document.contains(window.chartDashFleetrunInst.canvas)) {
        window.chartDashFleetrunInst.destroy();
        window.chartDashFleetrunInst = null;
    }
    if (window.chartInspDashInst && !document.contains(window.chartInspDashInst.canvas)) {
        window.chartInspDashInst.destroy();
        window.chartInspDashInst = null;
    }

    // Inicializar gráficos
    if (!window.chartDashFleetrunInst) window.chartDashFleetrunInst = initGraficoDashFleetrun();
    if (!window.chartInspDashInst)     window.chartInspDashInst     = initGraficoInspDash();

    // Cargar datos con pequeño delay para que el DOM esté pintado
    setTimeout(() => {
        recargarDashboard();
    }, 150);
};
