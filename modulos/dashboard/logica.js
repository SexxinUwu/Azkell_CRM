// ============================================================
// 📊 DASHBOARD MODULE — Módulo Aislado SPA
// ============================================================

// 🔥 VARIABLES GLOBALES (patrón window para evitar crash en F5)
window.chartDashFleetrunInst = window.chartDashFleetrunInst || null;
window.chartInspDashInst     = window.chartInspDashInst     || null;
window.mapaDashInst          = window.mapaDashInst          || null;
window.chartPrediccion90dInst = window.chartPrediccion90dInst || null;

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
            labels: ['Vigentes', 'Vencidas'],
            datasets: [{
                data: [1, 0],
                backgroundColor: ['#16a34a', '#dc2626'],
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

window.procesarInspeccionesParaDashboard = async function() {
    // Si no hay datos de placas, reintentar
    if (!window.dataGlobalPlacas || window.dataGlobalPlacas.length === 0) {
        setTimeout(procesarInspeccionesParaDashboard, 600);
        return;
    }

    // Si no hay datos de inspecciones en caché, fetchear del API directamente
    let inspData = window.dataGlobalInspecciones;
    if (!inspData || inspData.length === 0) {
        try {
            const res = await fetch('/api/script/obtenerDatosInspecciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            inspData = json.data || [];
            window.dataGlobalInspecciones = inspData; // guardar para otros módulos
        } catch(e) {
            console.warn('Dashboard: no se pudo cargar inspecciones:', e);
            return;
        }
    }

    let hoy = new Date(); hoy.setHours(0,0,0,0);
    let vigentes = 0, vencidas = 0;
    let inspecciones = inspData.filter(i => i.estado !== 'Eliminada');

    // Mismo filtro que el módulo de inspecciones (Activa + en uso)
    let placasActivas = window.dataGlobalPlacas.filter(p => {
        if ((p[0] || '').toUpperCase() === 'PLACA') return false;
        let estado = normalizeStr(p[18] || p[8] || '');
        let enUso  = normalizeStr(p[22] || p[13] || '');
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

        // Sin registro → vencida (igual que el módulo real: data-dias=-9999 < 0)
        if (!insp || !insp.fecha_ingreso) { vencidas++; return; }

        let fIngreso;
        try {
            if (insp.fecha_ingreso.includes('/')) {
                let px = insp.fecha_ingreso.split('/');
                fIngreso = new Date(px[2], px[1]-1, px[0]);
            } else {
                fIngreso = new Date(insp.fecha_ingreso + "T00:00:00");
            }
        } catch(e) { vencidas++; return; }

        let dProp = parseInt(insp.dias_propuestos) || 30;
        let fProx = new Date(fIngreso.getTime());
        fProx.setDate(fProx.getDate() + dProp);
        let diasRestantes = Math.ceil((fProx - hoy) / (1000 * 60 * 60 * 24));

        // dias >= 0 → vigente (incluye por vencer), dias < 0 → vencida
        if (diasRestantes >= 0) vigentes++;
        else                    vencidas++;
    });

    if (!window.chartInspDashInst) window.chartInspDashInst = initGraficoInspDash();
    if (!window.chartInspDashInst) return;

    let isDark = document.body.classList.contains('dark');
    let total = vigentes + vencidas;
    if (total === 0) {
        window.chartInspDashInst.data.labels = ['Sin Datos'];
        window.chartInspDashInst.data.datasets[0].data = [1];
        window.chartInspDashInst.data.datasets[0].backgroundColor = ['#475569'];
    } else {
        window.chartInspDashInst.data.labels = ['Vigentes', 'Vencidas'];
        window.chartInspDashInst.data.datasets[0].data = [vigentes, vencidas];
        window.chartInspDashInst.data.datasets[0].backgroundColor = ['#16a34a', '#dc2626'];
    }
    window.chartInspDashInst.options.plugins.datalabels.color = isDark ? '#ffffff' : '#000000';
    window.chartInspDashInst.options.plugins.legend.labels.color = isDark ? '#f8fafc' : '#1a1a2e';
    window.chartInspDashInst.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
    window.chartInspDashInst.update();

    // Calcular vencimientos AQUÍ — los datos ya están en window.dataGlobalInspecciones
    if (typeof window.calcularPrediccionVencimientos === 'function') window.calcularPrediccionVencimientos();
};

// ============================================================
// 🗺️ MAPA GPS WIALON (Leaflet)
// ============================================================

// ============================================================
// 🗺️ MAPA GPS WIALON (Google Maps embed)
// ============================================================

window.initMapaDashboard = function(datos) {
    let contenedor = document.getElementById('mapaDashboard');
    if (!contenedor) return;

    // Limpiar instancia Leaflet anterior si existía
    if (window.mapaDashInst) {
        try { window.mapaDashInst.remove(); } catch(e) {}
        window.mapaDashInst = null;
    }

    let vehiculosConPos = (datos || []).filter(w => w.lat !== 0 && w.lng !== 0);
    let countEl = document.getElementById('dash-gps-count');
    if (countEl) countEl.textContent = (datos || []).length + ' Unidades';

    // Calcular centroide para centrar el mapa en toda la flota
    let lat = -12.0464, lng = -77.0428, zoom = 12;
    if (vehiculosConPos.length === 1) {
        lat = vehiculosConPos[0].lat;
        lng = vehiculosConPos[0].lng;
        zoom = 14;
    } else if (vehiculosConPos.length > 1) {
        let sumLat = 0, sumLng = 0;
        vehiculosConPos.forEach(v => { sumLat += v.lat; sumLng += v.lng; });
        lat = sumLat / vehiculosConPos.length;
        lng = sumLng / vehiculosConPos.length;
        zoom = 12;
    }

    let iframeSrc = 'https://maps.google.com/maps?q=' + lat.toFixed(6) + ',' + lng.toFixed(6)
        + '&z=' + zoom + '&output=embed';
    contenedor.innerHTML = '<iframe src="' + iframeSrc + '" '
        + 'style="width:100%;height:100%;min-height:320px;border:0;display:block;" '
        + 'loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>';
};

window.cargarMapaWialonDash = async function() {
    // Skip mapa en móvil — pesado e innecesario en pantallas pequeñas
    if (window.innerWidth < 768) return;
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
        // Re-calcular fleetrun con km GPS real (antes podía tener km_gps=0 si Wialon no had cargado)
        if (typeof procesarFleetrunParaDashboard === 'function') procesarFleetrunParaDashboard();
    } catch (err) {
        console.error('Error cargando Wialon para dashboard:', err);
        initMapaDashboard([]);
    }
};

// ============================================================
// 📈 KPI METRICS + ACTIVITY FEED
// ============================================================

window.renderKpiMetrics = async function() {
    var placasActivas = (window.dataGlobalPlacas || []).filter(function(p) {
        if ((p[0] || '').toUpperCase() === 'PLACA') return false;
        var estado = normalizeStr(p[18] || p[8] || '');
        var enUso  = normalizeStr(p[22] || p[13] || '');
        return estado === 'ACTIVA' && (enUso === 'SI' || enUso === 'SÍ');
    });
    var flotaTotal = placasActivas.length;

    var elFlota = document.getElementById('kpi-val-flota');
    if (elFlota) {
        elFlota.textContent = '—';
        if (typeof window.animarContador === 'function') window.animarContador(elFlota, flotaTotal);
        else elFlota.textContent = flotaTotal;
    }

    // Sparkline flota: línea plana con valor actual (sin historial real)
    var sparkFlota = document.getElementById('kpi-spark-flota');
    if (sparkFlota && typeof window.sparklineSVG === 'function') {
        var fakeFlota = [flotaTotal, flotaTotal, flotaTotal, flotaTotal, flotaTotal, flotaTotal];
        sparkFlota.innerHTML = window.sparklineSVG(fakeFlota, 'var(--crm-accent)');
    }

    // Cargar inspecciones si no hay en caché
    var inspData = window.dataGlobalInspecciones;
    if (!inspData || inspData.length === 0) {
        try {
            var res = await fetch('/api/script/obtenerDatosInspecciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var json = await res.json();
            inspData = json.data || [];
            window.dataGlobalInspecciones = inspData;
        } catch(e) {
            console.warn('KPI dashboard: error cargando inspecciones', e);
            return;
        }
    }

    var hoy = new Date(); hoy.setHours(0,0,0,0);
    var inspecciones = (inspData || []).filter(function(i) { return i.estado !== 'Eliminada'; });

    var vigentes = 0, porVencer = 0, vencidas = 0;

    placasActivas.forEach(function(p) {
        var placaStr = normalizeStr(p[0]);
        var listaOrd = inspecciones.slice().sort(function(a, b) {
            var pa = parseInt((a.id || '').split('-')[1]) || 0;
            var pb = parseInt((b.id || '').split('-')[1]) || 0;
            return pb - pa;
        });
        var insp = listaOrd.find(function(i) { return normalizeStr(i.placa) === placaStr; });

        if (!insp || !insp.fecha_ingreso) { vencidas++; return; }

        var fIngreso;
        try {
            if (insp.fecha_ingreso.includes('/')) {
                var px = insp.fecha_ingreso.split('/');
                fIngreso = new Date(px[2], px[1]-1, px[0]);
            } else {
                fIngreso = new Date(insp.fecha_ingreso + 'T00:00:00');
            }
        } catch(e) { vencidas++; return; }

        var dProp = parseInt(insp.dias_propuestos) || 30;
        var fProx = new Date(fIngreso.getTime());
        fProx.setDate(fProx.getDate() + dProp);
        var diasRestantes = Math.ceil((fProx - hoy) / (1000 * 60 * 60 * 24));

        if (diasRestantes < 0)       vencidas++;
        else if (diasRestantes <= 7) porVencer++;
        else                         vigentes++;
    });

    var elVig  = document.getElementById('kpi-val-vigentes');
    var elPV   = document.getElementById('kpi-val-porvencer');
    var elVenc = document.getElementById('kpi-val-vencidas');
    if (elVig  && typeof window.animarContador === 'function') window.animarContador(elVig,  vigentes);
    else if (elVig)  elVig.textContent  = vigentes;
    if (elPV   && typeof window.animarContador === 'function') window.animarContador(elPV,   porVencer);
    else if (elPV)   elPV.textContent   = porVencer;
    if (elVenc && typeof window.animarContador === 'function') window.animarContador(elVenc, vencidas);
    else if (elVenc) elVenc.textContent = vencidas;

    // Sync acciones rápidas móvil
    var dMobV = document.getElementById('dash-mob-vencidas');
    var dMobP = document.getElementById('dash-mob-porvencer');
    if (dMobV) dMobV.textContent = vencidas;
    if (dMobP) dMobP.textContent = porVencer;
    // kpi-fleet-vencidos lo actualiza el módulo fleetrun; intentamos leerlo si ya está
    var dMobF = document.getElementById('dash-mob-fleet-vencidos');
    if (dMobF) {
        var kpiFlV = document.getElementById('kpi-fleet-vencidos');
        if (kpiFlV) dMobF.textContent = kpiFlV.textContent || '—';
    }

    // PWA Badge
    if (typeof window.actualizarPWABadge === 'function') window.actualizarPWABadge();

    // Sparklines semanales (últimas 6 semanas basado en fecha_ingreso)
    var ahora = Date.now();
    var semVig  = [0,0,0,0,0,0];
    var semPV   = [0,0,0,0,0,0];
    var semVenc = [0,0,0,0,0,0];

    inspecciones.forEach(function(i) {
        if (!i.fecha_ingreso) return;
        var fi;
        try {
            if (i.fecha_ingreso.includes('/')) {
                var px = i.fecha_ingreso.split('/');
                fi = new Date(px[2], px[1]-1, px[0]);
            } else {
                fi = new Date(i.fecha_ingreso + 'T00:00:00');
            }
        } catch(e) { return; }
        var dProp = parseInt(i.dias_propuestos) || 30;
        var fProx = new Date(fi.getTime());
        fProx.setDate(fProx.getDate() + dProp);
        var dias = Math.ceil((fProx - hoy) / (1000 * 60 * 60 * 24));
        var weeksAgo = Math.floor((ahora - fi.getTime()) / (7 * 24 * 60 * 60 * 1000));
        var idx = 5 - weeksAgo;
        if (idx >= 0 && idx < 6) {
            if (dias < 0)       semVenc[idx]++;
            else if (dias <= 7) semPV[idx]++;
            else                semVig[idx]++;
        }
    });

    var sparkVig  = document.getElementById('kpi-spark-vigentes');
    var sparkPV   = document.getElementById('kpi-spark-porvencer');
    var sparkVenc = document.getElementById('kpi-spark-vencidas');
    if (sparkVig  && typeof window.sparklineSVG === 'function') sparkVig.innerHTML  = window.sparklineSVG(semVig,  '#16a34a');
    if (sparkPV   && typeof window.sparklineSVG === 'function') sparkPV.innerHTML   = window.sparklineSVG(semPV,   '#eab308');
    if (sparkVenc && typeof window.sparklineSVG === 'function') sparkVenc.innerHTML = window.sparklineSVG(semVenc, '#ef4444');

    // Badges de tendencia (semana anterior vs semana actual)
    _dashTrendBadge('kpi-trend-vigentes',  semVig[4],  semVig[5],  'up-good');
    _dashTrendBadge('kpi-trend-vencidas',  semVenc[4], semVenc[5], 'down-good');
    _dashTrendBadge('kpi-trend-porvencer', semPV[4],   semPV[5],   'down-good');

    // Activity feed
    _renderDashActivityFeed(inspData);

    // Actualizar badges de sidebar con los datos ya cargados
    if (typeof window.actualizarBadgesSidebar === 'function') window.actualizarBadgesSidebar();
};

function _dashTrendBadge(id, prev, curr, better) {
    var el = document.getElementById(id);
    if (!el) return;
    if (curr === 0 && prev === 0) { el.innerHTML = ''; return; }
    var diff = curr - prev;
    var isUp   = diff > 0;
    var isGood = (better === 'up-good') ? isUp : !isUp;
    var color  = diff === 0 ? '#6b7280' : (isGood ? '#16a34a' : '#ef4444');
    var icon   = diff === 0 ? '→' : (isUp ? '↑' : '↓');
    el.innerHTML = '<span style="font-size:0.68rem;font-weight:700;padding:2px 6px;border-radius:20px;background:' + color + '22;color:' + color + '">' + icon + ' ' + Math.abs(diff) + '</span>';
}

function _renderDashActivityFeed(inspData) {
    var feed = document.getElementById('dash-activity-feed');
    if (!feed) return;
    var hoy = new Date(); hoy.setHours(0,0,0,0);

    var sorted = (inspData || [])
        .filter(function(i) { return i.estado !== 'Eliminada' && i.fecha_ingreso; })
        .sort(function(a, b) {
            var pa = parseInt((a.id || '').split('-')[1]) || 0;
            var pb = parseInt((b.id || '').split('-')[1]) || 0;
            return pb - pa;
        })
        .slice(0, 12);

    if (sorted.length === 0) {
        feed.innerHTML = typeof window.generarEstadoVacio === 'function'
            ? window.generarEstadoVacio('bi-activity', 'Sin actividad', 'Aún no hay inspecciones registradas.', true)
            : '<div class="text-center py-3" style="color:var(--subtext);font-size:0.82rem;">Sin actividad reciente</div>';
        return;
    }

    feed.innerHTML = sorted.map(function(i) {
        var fi;
        try {
            if (i.fecha_ingreso.includes('/')) {
                var px = i.fecha_ingreso.split('/');
                fi = new Date(px[2], px[1]-1, px[0]);
            } else {
                fi = new Date(i.fecha_ingreso + 'T00:00:00');
            }
        } catch(e) { fi = null; }

        var dProp = parseInt(i.dias_propuestos) || 30;
        var dRest = fi ? Math.ceil((new Date(fi.getTime() + dProp * 86400000) - hoy) / 86400000) : -999;

        var badge, badgeColor;
        if (dRest < 0)       { badge = 'Vencida'; badgeColor = '#ef4444'; }
        else if (dRest <= 7) { badge = dRest + 'd';  badgeColor = '#eab308'; }
        else                 { badge = 'OK';      badgeColor = '#16a34a'; }

        var fechaStr = fi ? fi.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : '—';
        var tipo = (i.tipo_inspeccion || i.tipo || '').substring(0, 24);

        return '<div class="dash-feed-item">' +
            '<div class="dash-feed-dot" style="background:' + badgeColor + '"></div>' +
            '<div class="dash-feed-content">' +
                '<span class="dash-feed-placa">' + (i.placa || '—') + '</span> ' +
                '<span class="dash-feed-tipo">' + tipo + '</span>' +
                '<div class="dash-feed-meta">' + fechaStr + ' · <span style="color:' + badgeColor + ';font-weight:700;">' + badge + '</span></div>' +
            '</div>' +
        '</div>';
    }).join('');
}

// ============================================================
// 📅 PREDICCIÓN DE VENCIMIENTOS — 90 DÍAS (inspecciones)
// ============================================================

window.calcularPrediccionVencimientos = function() {
    var ctx = document.getElementById('chartPrediccion90d');
    if (!ctx) return;

    var hoy = new Date(); hoy.setHours(0,0,0,0);
    var semanas = new Array(13).fill(0); // semanas 0-12 (próximos 91 días)

    (window.dataGlobalInspecciones||[]).forEach(function(i) {
        if (i.estado === 'Eliminada' || !i.fecha_ingreso) return;
        try {
            var fi; if (i.fecha_ingreso.includes('/')) { var px=i.fecha_ingreso.split('/'); fi=new Date(px[2],px[1]-1,px[0]); } else { fi=new Date(i.fecha_ingreso+'T00:00:00'); }
            var fp=new Date(fi.getTime()); fp.setDate(fp.getDate()+(parseInt(i.dias_propuestos)||30));
            var dRest=Math.ceil((fp-hoy)/864e5);
            if (dRest >= 0 && dRest < 91) { semanas[Math.min(Math.floor(dRest/7), 12)]++; }
        } catch(e) {}
    });

    var total = semanas.reduce(function(a,b){ return a+b; }, 0);
    var badge = document.getElementById('dash-pred-total');
    if (badge) badge.textContent = total + ' en 90d';

    var labels = semanas.map(function(_, i){ return i === 0 ? 'Esta sem.' : 'S+'+(i); });
    var bgColors = semanas.map(function(v, i) {
        if (i === 0) return '#dc2626cc';
        if (i <= 2)  return '#eab308cc';
        return '#2563ebcc';
    });

    if (window.chartPrediccion90dInst && !document.contains(window.chartPrediccion90dInst.canvas)) {
        window.chartPrediccion90dInst.destroy(); window.chartPrediccion90dInst = null;
    }
    if (window.chartPrediccion90dInst) {
        window.chartPrediccion90dInst.data.datasets[0].data = semanas;
        window.chartPrediccion90dInst.data.datasets[0].backgroundColor = bgColors;
        window.chartPrediccion90dInst.update();
        return;
    }
    Chart.defaults.font.family = 'Inter';
    window.chartPrediccion90dInst = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: 'Insp. que vencen', data: semanas, backgroundColor: bgColors, borderRadius: 4, borderSkipped: false }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: {
                label: function(c) { return c.raw + ' inspección' + (c.raw !== 1 ? 'es' : ''); }
            }}},
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#64748b' } },
                y: { grid: { color: '#e2e8f033' }, ticks: { font: { size: 10 }, color: '#64748b', stepSize: 1 }, beginAtZero: true }
            }
        }
    });
};

// ============================================================
// 🔄 RECARGAR DASHBOARD
// ============================================================

window.recargarDashboard = function() {
    if (typeof procesarFleetrunParaDashboard === 'function') procesarFleetrunParaDashboard();
    if (typeof procesarInspeccionesParaDashboard === 'function') procesarInspeccionesParaDashboard();
    if (typeof window.renderKpiMetrics === 'function') window.renderKpiMetrics();
};

// ============================================================
// 📍 INICIALIZACIÓN DEL MÓDULO DASHBOARD
// ============================================================

window.init_dashboard = function() {
    console.log('🎯 Inicializando módulo Dashboard...');

    let ctx1 = document.getElementById('chartDashFleetrunStatus');
    let ctx2 = document.getElementById('chartGeneralInspecciones');

    if (!ctx1 || !ctx2) {
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
    if (window.chartPrediccion90dInst && !document.contains(window.chartPrediccion90dInst.canvas)) {
        window.chartPrediccion90dInst.destroy();
        window.chartPrediccion90dInst = null;
    }

    // Inicializar gráficos
    if (!window.chartDashFleetrunInst) window.chartDashFleetrunInst = initGraficoDashFleetrun();
    if (!window.chartInspDashInst)     window.chartInspDashInst     = initGraficoInspDash();

    // Cargar datos con pequeño delay para que el DOM esté pintado
    setTimeout(() => {
        recargarDashboard();
    }, 150);
};
