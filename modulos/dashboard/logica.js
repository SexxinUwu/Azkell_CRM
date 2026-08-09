// ============================================================
// 📊 DASHBOARD MODULE — Módulo Aislado SPA
// ============================================================

// 🔥 VARIABLES GLOBALES (patrón window para evitar crash en F5)
window.chartDashFleetrunInst = window.chartDashFleetrunInst || null;
window.chartInspDashInst     = window.chartInspDashInst     || null;
window.mapaDashInst          = window.mapaDashInst          || null;
window.chartPrediccion90dInst = window.chartPrediccion90dInst || null;
window._dashWeatherLoaded    = window._dashWeatherLoaded    || false;

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
            layout: { padding: 6 },
            plugins: {
                legend: { position: 'right', labels: { font: { weight: 'bold', size: 11 }, boxWidth: 12, padding: 8 } },
                datalabels: {
                    display: function(ctx) {
                        var total = ctx.chart.data.datasets[0].data.reduce(function(a,b){return a+b;},0);
                        if (!total || ctx.chart.data.labels[0]==='Sin Datos') return false;
                        return (ctx.dataset.data[ctx.dataIndex] / total) >= 0.06;
                    },
                    color: '#ffffff',
                    font: { weight: 'bold', size: 11, family: 'Inter' },
                    formatter: function(value, ctx) {
                        var total = ctx.chart.data.datasets[0].data.reduce(function(a,b){return a+b;},0);
                        if (!total || ctx.chart.data.labels[0]==='Sin Datos') return '';
                        return Math.round(value/total*100)+'%';
                    },
                    anchor: 'center', align: 'center'
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
    if (vigentes + porVencer + vencidos === 0) {
        window.chartDashFleetrunInst.data.labels = ['Sin Datos'];
        window.chartDashFleetrunInst.data.datasets[0].data = [1];
        window.chartDashFleetrunInst.data.datasets[0].backgroundColor = ['#475569'];
    } else {
        let total = vigentes + porVencer + vencidos;
        let pVig = Math.round(vigentes/total*100);
        let pPv = Math.round(porVencer/total*100);
        let pVen = Math.round(vencidos/total*100);
        window.chartDashFleetrunInst.data.labels = [pVig+'% Vigentes', pPv+'% Por Vencer', pVen+'% Vencidos'];
        window.chartDashFleetrunInst.data.datasets[0].data = [vigentes, porVencer, vencidos];
        window.chartDashFleetrunInst.data.datasets[0].backgroundColor = ['#16a34a', '#eab308', '#dc2626'];
    }
    window.chartDashFleetrunInst.update();
};

window.procesarFleetrunParaDashboard = async function() {
    var placas = window.dataGlobalPlacas || [];
    if (!placas.length) { setTimeout(procesarFleetrunParaDashboard, 500); return; }

    // Si el módulo Fleetrun ya está activo y tiene los valores reales con GPS live, usarlos
    if (window._fleetrun_kpi_venc !== undefined && window._fleetrun_kpi_desde_modulo) {
        _aplicarKpisFleetrunDashboard(window._fleetrun_kpi_venc, window._fleetrun_kpi_prox, window._fleetrun_kpi_vig);
        return;
    }

    // Si Wialon está en proceso de carga, esperar
    if (window._wialonCargando) { setTimeout(procesarFleetrunParaDashboard, 800); return; }

    // Cargar datos de Wialon (GPS) en CACHE si aún no han cargado (indispensable en móvil)
    if (typeof CACHE !== 'undefined' && (!CACHE.wialon || !Array.isArray(CACHE.wialon) || CACHE.wialon.length === 0)) {
        window._wialonCargando = true;
        try {
            var resW = await fetch('/api/script/obtenerDatosWialon', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (resW.ok) {
                var jsonW = await resW.json();
                var datosW = jsonW.data || [];
                if (Array.isArray(datosW)) {
                    CACHE['wialon'] = datosW;
                }
            }
        } catch(e) {}
        window._wialonCargando = false;
    }

    // Si no hay datos de fleetrun en caché, consultar la API directamente (igual que inspecciones)
    var datos = window.dataGlobalFleetrun;
    if (!datos || datos.length === 0) {
        try {
            var res = await fetch('/api/script/obtenerDatosFleetrun', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ args: [] })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var json = await res.json();
            datos = json.data || [];
            window.dataGlobalFleetrun = datos;
        } catch(e) {
            console.warn('Dashboard: error cargando fleetrun', e);
            return;
        }
    }

    // Cargar umbrales si no están
    if (window._fleetrun_umbrales_uts === undefined || window._fleetrun_umbrales_uts === null) {
        try {
            var resCfg = await fetch('/api/configuracion');
            var cfg = resCfg.ok ? await resCfg.json() : {};
            try { window._fleetrun_umbrales_uts = JSON.parse(cfg['fleetrun_uts_umbrales'] || '{}'); } catch(e) { window._fleetrun_umbrales_uts = {}; }
        } catch(e) { window._fleetrun_umbrales_uts = {}; }
    }

    // Calcular KPIs con la MISMA lógica que mostrarFleetrun:
    // ordenar descendente por fecha, tomar último por placa+tipo, solo placas ACTIVAS
    var parseFecha = function(str) {
        if (!str) return 0;
        var p = str.split('/');
        if (p.length === 3) return new Date(p[2], p[1]-1, p[0]).getTime();
        return new Date(str).getTime() || 0;
    };
    var _hoy = Date.now();
    var datosOrd = datos.slice().sort(function(a, b) {
        var ta = parseFecha(a[3]), tb = parseFecha(b[3]);
        var aF = ta > _hoy + 86400000, bF = tb > _hoy + 86400000;
        if (aF !== bF) return aF ? 1 : -1;
        if (tb !== ta) return tb - ta;
        return parseInt((String(b[0]).match(/\d+$/) || [0])[0], 10) - parseInt((String(a[0]).match(/\d+$/) || [0])[0], 10);
    });

    var mapa = new Map();
    datosOrd.forEach(function(row) {
        var placaRaw = row[4]; if (!placaRaw) return;
        var placa = normalizeStr(placaRaw);
        var key = placa + '_' + normalizeStr(row[8]);
        var infoPlaca = placas.find(function(p) { return normalizeStr(p[0]) === placa || normalizeStr(p[0]).replace(/[^A-Z0-9]/g,'') === placa.replace(/[^A-Z0-9]/g,''); });
        var estadoPlaca = normalizeStr((infoPlaca && infoPlaca[18]) ? infoPlaca[18] : ((infoPlaca && infoPlaca[8]) ? infoPlaca[8] : ''));
        if (!mapa.has(key) && (infoPlaca && (estadoPlaca === 'ACTIVA' || estadoPlaca === ''))) {
            mapa.set(key, { row: row, placaRaw: placaRaw, infoPlaca: infoPlaca });
        }
    });

    var placaEstadoMap = new Map();
    var estadoPrio = { 'VIGENTE': 0, 'PROXIMO': 1, 'VENCIDO': 2 };
    mapa.forEach(function(item) {
        var row = item.row, placaRaw = item.placaRaw, infoP = item.infoPlaca;
        var km_prox = parseFloat(row[11]) || 0;
        var km_gps  = parseFloat(row[14]) || 0;
        var esHoras = window._metricaMap && window._metricaMap[placaRaw.toUpperCase()] === 'horas';
        var wd = typeof buscarWialonPorPlaca === 'function' ? buscarWialonPorPlaca(placaRaw) : null;
        if (wd) km_gps = esHoras ? (wd.horas || 0) : wd.km;

        var km_restante = km_prox - km_gps;
        var utsDisplay = (infoP && infoP[19] && String(infoP[19]).trim() !== '') ? infoP[19] : (row[7] || '-');
        var utsUmbral = 2000;
        var ck = utsDisplay.toUpperCase() + (esHoras ? '_HORAS' : '_KM');
        var u = window._fleetrun_umbrales_uts;
        if (u && Object.keys(u).length) {
            if (u[ck] !== undefined) utsUmbral = parseFloat(u[ck]);
            else if (u[utsDisplay.toUpperCase()] !== undefined) utsUmbral = parseFloat(u[utsDisplay.toUpperCase()]);
            else { if (normalizeStr(utsDisplay) === 'NACIONAL') utsUmbral = 1500; else if (normalizeStr(utsDisplay) === 'LOCAL') utsUmbral = 100; }
        } else { if (normalizeStr(utsDisplay) === 'NACIONAL') utsUmbral = 1500; else if (normalizeStr(utsDisplay) === 'LOCAL') utsUmbral = 100; }

        var estadoKpi = km_restante <= 0 ? 'VENCIDO' : (km_restante <= utsUmbral ? 'PROXIMO' : 'VIGENTE');
        var prev = placaEstadoMap.get(placaRaw);
        if (prev === undefined || estadoPrio[estadoKpi] > estadoPrio[prev]) placaEstadoMap.set(placaRaw, estadoKpi);
    });

    var venc = 0, prox = 0, vig = 0;
    placaEstadoMap.forEach(function(e) { if (e === 'VENCIDO') venc++; else if (e === 'PROXIMO') prox++; else vig++; });

    _aplicarKpisFleetrunDashboard(venc, prox, vig);
};

function _aplicarKpisFleetrunDashboard(venc, prox, vig) {
    updateGraficoDashFleetrun(vig, prox, venc);
    var fv = document.getElementById('dash-mob-fleet-vencidos');
    var fp = document.getElementById('dash-mob-fleet-porvencer');
    if (fv) fv.textContent = venc;
    if (fp) fp.textContent = prox;
}

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
            layout: { padding: 6 },
            plugins: {
                legend: { position: 'right', labels: { font: { weight: 'bold', size: 11 }, boxWidth: 12, padding: 8 } },
                datalabels: {
                    display: function(ctx) {
                        var total = ctx.chart.data.datasets[0].data.reduce(function(a,b){return a+b;},0);
                        if (!total || ctx.chart.data.labels[0]==='Sin Datos') return false;
                        return (ctx.dataset.data[ctx.dataIndex] / total) >= 0.06;
                    },
                    color: '#ffffff',
                    font: { weight: 'bold', size: 11 },
                    formatter: function(value, ctx) {
                        var total = ctx.chart.data.datasets[0].data.reduce(function(a,b){return a+b;},0);
                        if (!total || ctx.chart.data.labels[0]==='Sin Datos') return '';
                        return Math.round(value/total*100)+'%';
                    },
                    anchor: 'center', align: 'center'
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
    let inspecciones = inspData.filter(i => i.estado !== 'Eliminada' && i.tipo_inspeccion !== 'Solo Frenos');

    // Todas las placas ACTIVAS (sin filtro de en_uso)
    let placasActivas = window.dataGlobalPlacas.filter(p => {
        if ((p[0] || '').toUpperCase() === 'PLACA') return false;
        let estado = normalizeStr(p[18] || p[8] || '');
        return estado === "ACTIVA";
    });

    let numId = (id) => {
        if (!id) return 0;
        let parts = id.split('-');
        if (parts.length > 2 && parts[1].length === 4) return parseInt(parts[1] + parts[2] + parts[3]) || 0;
        return parseInt(parts[1]) || 0;
    };

    placasActivas.forEach(p => {
        let placaStr = normalizeStr(p[0]);
        let insp = [...inspecciones]
            .sort((a, b) => numId(b.id) - numId(a.id))
            .find(i => normalizeStr(i.placa) === placaStr);

        // Sin registro → vencida (igual que el módulo real: data-dias=-9999 < 0)
        if (!insp || !insp.fecha_ingreso) { vencidas++; return; }

        let fIngreso;
        try {
            if (insp.fecha_ingreso.includes('/')) {
                let px = insp.fecha_ingreso.split('/');
                fIngreso = new Date(px[2], px[1]-1, px[0]);
            } else {
                let ds = insp.fecha_ingreso.split('T')[0].split('-');
                fIngreso = ds.length === 3 ? new Date(parseInt(ds[0]), parseInt(ds[1])-1, parseInt(ds[2])) : new Date(insp.fecha_ingreso);
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
        let pVig = Math.round(vigentes/total*100);
        let pVen = Math.round(vencidas/total*100);
        window.chartInspDashInst.data.labels = [pVig+'% Vigentes', pVen+'% Vencidas'];
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
    window._wialonCargando = true;
    window._wialonListo = false;
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
            window._wialonCargando = false;
            window._wialonListo = false;
            return;
        }
        initMapaDashboard(datos);
        window._wialonCargando = false;
        window._wialonListo = true;
        // Re-calcular fleetrun con km GPS real
        if (typeof procesarFleetrunParaDashboard === 'function') procesarFleetrunParaDashboard();
    } catch (err) {
        console.error('Error cargando Wialon para dashboard:', err);
        initMapaDashboard([]);
        window._wialonCargando = false;
        window._wialonListo = false;
    }
};

// ============================================================
// 📈 KPI METRICS + ACTIVITY FEED
// ============================================================

window.renderKpiMetrics = async function() {
    var placasActivas = (window.dataGlobalPlacas || []).filter(function(p) {
        if ((p[0] || '').toUpperCase() === 'PLACA') return false;
        var estado = normalizeStr(p[18] || p[8] || '');
        return estado === 'ACTIVA';
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
    var inspecciones = (inspData || []).filter(function(i) { return i.estado !== 'Eliminada' && i.tipo_inspeccion !== 'Solo Frenos'; });

    var vigentes = 0, porVencer = 0, vencidas = 0;

    var numId = function(id) {
        if (!id) return 0;
        var parts = id.split('-');
        if (parts.length > 2 && parts[1].length === 4) return parseInt(parts[1] + parts[2] + parts[3]) || 0;
        return parseInt(parts[1]) || 0;
    };

    placasActivas.forEach(function(p) {
        var placaStr = normalizeStr(p[0]);
        var listaOrd = inspecciones.slice().sort(function(a, b) {
            return numId(b.id) - numId(a.id);
        });
        var insp = listaOrd.find(function(i) { return normalizeStr(i.placa) === placaStr; });

        if (!insp || !insp.fecha_ingreso) { vencidas++; return; }

        var fIngreso;
        try {
            if (insp.fecha_ingreso.includes('/')) {
                var px = insp.fecha_ingreso.split('/');
                fIngreso = new Date(px[2], px[1]-1, px[0]);
            } else {
                var ds = insp.fecha_ingreso.split('T')[0].split('-');
                fIngreso = ds.length === 3 ? new Date(parseInt(ds[0]), parseInt(ds[1])-1, parseInt(ds[2])) : new Date(insp.fecha_ingreso);
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

    if (typeof window.procesarFleetrunParaDashboard === 'function') {
        window.procesarFleetrunParaDashboard();
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
                var ds = i.fecha_ingreso.split('T')[0].split('-');
                fi = ds.length === 3 ? new Date(parseInt(ds[0]), parseInt(ds[1])-1, parseInt(ds[2])) : new Date(i.fecha_ingreso);
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

    var numId = function(id) {
        if (!id) return 0;
        var parts = id.split('-');
        if (parts.length > 2 && parts[1].length === 4) return parseInt(parts[1] + parts[2] + parts[3]) || 0;
        return parseInt(parts[1]) || 0;
    };

    var sorted = (inspData || [])
        .filter(function(i) { return i.estado !== 'Eliminada' && i.fecha_ingreso; })
        .sort(function(a, b) {
            return numId(b.id) - numId(a.id);
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
                var ds = i.fecha_ingreso.split('T')[0].split('-');
                fi = ds.length === 3 ? new Date(parseInt(ds[0]), parseInt(ds[1])-1, parseInt(ds[2])) : new Date(i.fecha_ingreso);
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
            var fi; if (i.fecha_ingreso.includes('/')) { var px=i.fecha_ingreso.split('/'); fi=new Date(px[2],px[1]-1,px[0]); } else { var ds=i.fecha_ingreso.split('T')[0].split('-'); fi=ds.length===3?new Date(parseInt(ds[0]),parseInt(ds[1])-1,parseInt(ds[2])):new Date(i.fecha_ingreso); }
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
    // Cargar Wialon (desktop) — al terminar recalcula fleetrun con GPS real
    if (typeof window.cargarMapaWialonDash === 'function') window.cargarMapaWialonDash();
};

// ============================================================
// 📍 INICIALIZACIÓN DEL MÓDULO DASHBOARD
// ============================================================

window.init_dashboard = function(retries) {
    if (!window.checkPerm('dashboard', 'l')) {
        var dashWrap = document.getElementById('moduloDashboard');
        if (dashWrap) window.showNoPermMsg(dashWrap);
        return;
    }
    retries = retries || 0;
    // Lazy-load Chart.js + Leaflet antes de inicializar
    var chartsReady = (typeof Chart !== 'undefined') ? Promise.resolve() : window.loadCharts();
    var leafletReady = (typeof L !== 'undefined') ? Promise.resolve() : window.loadLeaflet();
    Promise.all([chartsReady, leafletReady]).then(function() {
        window._initDashboardReal(retries);
    });
};

window._initDashboardReal = function(retries) {
    console.log('🎯 Inicializando módulo Dashboard...');
    retries = retries || 0;

    let ctx1 = document.getElementById('chartDashFleetrunStatus');
    let ctx2 = document.getElementById('chartGeneralInspecciones');

    if (!ctx1 || !ctx2) {
        if (retries >= 10) { console.warn('Dashboard: canvas no encontrado después de 10 intentos, abortando.'); return; }
        setTimeout(function() { window.init_dashboard(retries + 1); }, 200);
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

    // Resetear flag para que el cálculo de Fleetrun siempre sea fresco (con GPS live)
    window._fleetrun_kpi_desde_modulo = false;
    window._fleetrun_kpi_venc = undefined;
    window._fleetrun_kpi_prox = undefined;
    window._fleetrun_kpi_vig  = undefined;

    // Inicializar gráficos
    if (!window.chartDashFleetrunInst) window.chartDashFleetrunInst = initGraficoDashFleetrun();
    if (!window.chartInspDashInst)     window.chartInspDashInst     = initGraficoInspDash();

    // Widget de clima
    cargarWidgetClima();

    // Cargar datos con pequeño delay para que el DOM esté pintado
    setTimeout(() => {
        recargarDashboard();
    }, 150);
};

// ============================================================
// 🌤️ WIDGET CLIMA — Open-Meteo (sin API key) + Nominatim
// ============================================================

// Mapeo WMO weathercode → { desc, icon BootstrapIcon }
var _wmoMap = {
    0:  { d: 'Despejado',         i: 'bi-sun' },
    1:  { d: 'Mayormente despejado', i: 'bi-sun' },
    2:  { d: 'Parcialmente nublado', i: 'bi-cloud-sun' },
    3:  { d: 'Nublado',           i: 'bi-cloud' },
    45: { d: 'Niebla',            i: 'bi-cloud-fog2' },
    48: { d: 'Niebla con escarcha', i: 'bi-cloud-fog2' },
    51: { d: 'Llovizna ligera',   i: 'bi-cloud-drizzle' },
    53: { d: 'Llovizna moderada', i: 'bi-cloud-drizzle' },
    55: { d: 'Llovizna intensa',  i: 'bi-cloud-drizzle' },
    61: { d: 'Lluvia ligera',     i: 'bi-cloud-rain' },
    63: { d: 'Lluvia moderada',   i: 'bi-cloud-rain' },
    65: { d: 'Lluvia intensa',    i: 'bi-cloud-rain-heavy' },
    71: { d: 'Nieve ligera',      i: 'bi-cloud-snow' },
    73: { d: 'Nieve moderada',    i: 'bi-cloud-snow' },
    75: { d: 'Nieve intensa',     i: 'bi-cloud-snow' },
    80: { d: 'Chubascos ligeros', i: 'bi-cloud-rain' },
    81: { d: 'Chubascos moderados', i: 'bi-cloud-rain-heavy' },
    82: { d: 'Chubascos violentos', i: 'bi-cloud-lightning-rain' },
    95: { d: 'Tormenta eléctrica', i: 'bi-lightning-rain' },
    99: { d: 'Tormenta con granizo', i: 'bi-cloud-hail' }
};

function cargarWidgetClima() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        function(pos) {
            var lat = pos.coords.latitude.toFixed(4);
            var lon = pos.coords.longitude.toFixed(4);
            // Obtener nombre de ciudad con Nominatim
            fetch('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lon + '&format=json', {
                headers: { 'Accept-Language': 'es' }
            })
            .then(function(r) { return r.ok ? r.json() : {}; })
            .then(function(geo) {
                var addr = geo.address || {};
                var ciudad = addr.city || addr.town || addr.village || addr.county || addr.state || 'Mi ubicación';
                var elCity = document.getElementById('dash-weather-city');
                if (elCity) elCity.innerHTML = '<i class="bi bi-geo-alt-fill me-1" style="font-size:0.7rem"></i>' + ciudad.toUpperCase();
            })
            .catch(function() {});

            // Obtener clima con Open-Meteo
            fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
                  '&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1')
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (!data || !data.current_weather) return;
                var cw   = data.current_weather;
                var code = cw.weathercode;
                var info = _wmoMap[code] || _wmoMap[2];
                var temp = Math.round(cw.temperature);
                var tmax = data.daily && data.daily.temperature_2m_max ? Math.round(data.daily.temperature_2m_max[0]) : '—';
                var tmin = data.daily && data.daily.temperature_2m_min ? Math.round(data.daily.temperature_2m_min[0]) : '—';

                var elDesc = document.getElementById('dash-weather-desc');
                var elIcon = document.getElementById('dash-weather-icon');
                var elTemp = document.getElementById('dash-weather-temp');
                var elMin  = document.getElementById('dash-weather-min');
                var elMax  = document.getElementById('dash-weather-max');

                if (elDesc) elDesc.textContent = info.d;
                if (elIcon) elIcon.innerHTML   = '<i class="bi ' + info.i + '" style="font-size:2.4rem"></i>';
                if (elTemp) elTemp.textContent = temp + '°';
                if (elMin)  elMin.textContent  = tmin + '°';
                if (elMax)  elMax.textContent  = tmax + '°';
            })
            .catch(function() {});
        },
        function() {
            // Sin permiso de ubicación — mostrar ciudad por defecto (Lima)
            var elCity = document.getElementById('dash-weather-city');
            if (elCity) elCity.innerHTML = '<i class="bi bi-geo-alt-fill me-1" style="font-size:0.7rem"></i>LIMA';
            fetch('https://api.open-meteo.com/v1/forecast?latitude=-12.0464&longitude=-77.0428' +
                  '&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1')
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (!data || !data.current_weather) return;
                var cw   = data.current_weather;
                var info = _wmoMap[cw.weathercode] || _wmoMap[2];
                var elDesc = document.getElementById('dash-weather-desc');
                var elIcon = document.getElementById('dash-weather-icon');
                var elTemp = document.getElementById('dash-weather-temp');
                var elMin  = document.getElementById('dash-weather-min');
                var elMax  = document.getElementById('dash-weather-max');
                if (elDesc) elDesc.textContent = info.d;
                if (elIcon) elIcon.innerHTML   = '<i class="bi ' + info.i + '" style="font-size:2.4rem"></i>';
                if (elTemp) elTemp.textContent = Math.round(cw.temperature) + '°';
                if (elMin && data.daily) elMin.textContent = Math.round(data.daily.temperature_2m_min[0]) + '°';
                if (elMax && data.daily) elMax.textContent = Math.round(data.daily.temperature_2m_max[0]) + '°';
            })
            .catch(function() {});
        },
        { timeout: 6000 }
    );
}
