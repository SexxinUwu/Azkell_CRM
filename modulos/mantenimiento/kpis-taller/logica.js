// ================================================================
// Módulo KPIs Taller — Azkell Fleet
// Ruta SPA: mantenimiento/kpis-taller
// Entry point: window.init_kpis_taller()
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.kpiDataOts = window.kpiDataOts || [];

// ── Entry point ─────────────────────────────────────────────────
window.init_kpis_taller = function() {
    kpiCargar();
};

// ── Carga de datos ───────────────────────────────────────────────
window.kpiCargar = function() {
    // Mostrar spinner
    var loading = document.getElementById('kpiLoadingMsg');
    var gridTop = document.getElementById('kpiGridTop');
    var gridBot = document.getElementById('kpiGridBottom');
    if (loading) loading.style.display = 'flex';
    if (gridTop) gridTop.style.display = 'none';
    if (gridBot) gridBot.style.display = 'none';

    // Deshabilitar botón mientras carga
    var btn = document.getElementById('kpiBtnActualizar');
    if (btn) btn.disabled = true;

    fetch('/api/ordenes-trabajo')
        .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function(data) {
            window.kpiDataOts = Array.isArray(data) ? data : [];
            var kpis = kpiCalcular(window.kpiDataOts);
            kpiRender(kpis);
        })
        .catch(function(err) {
            console.error('[KPIs Taller] Error cargando datos:', err);
            if (loading) {
                loading.innerHTML = '<i class="bi bi-exclamation-circle text-danger me-2"></i>Error al cargar indicadores. <button class="btn btn-sm btn-link p-0 ms-2" onclick="kpiCargar()">Reintentar</button>';
            }
        })
        .finally(function() {
            if (btn) btn.disabled = false;
        });
};

// ── Cálculo de KPIs ──────────────────────────────────────────────
window.kpiCalcular = function(ots) {
    var PERIODO_HRS = 8640; // 360 días × 24 hrs — período de referencia

    var totalOts      = ots.length;
    var correctivasCerradas = [];
    var preventivas   = 0;

    ots.forEach(function(ot) {
        // Parsear detalles_json para extraer tipo_ot, f_inicio, f_fin
        var detalles = {};
        try {
            if (ot.detalles_json) {
                detalles = typeof ot.detalles_json === 'string'
                    ? JSON.parse(ot.detalles_json)
                    : ot.detalles_json;
            }
        } catch(e) { detalles = {}; }

        var tipoOt = (detalles.tipo_ot || '').trim();
        var aprobacion = (ot.aprobacion || '').trim();

        if (tipoOt === 'Preventivo') preventivas++;

        if (tipoOt === 'Correctivo' && aprobacion === 'Cerrada') {
            var fInicio = detalles.f_inicio || null;
            var fFin    = detalles.f_fin    || null;
            var durHrs  = 0;
            if (fInicio && fFin) {
                var ms = new Date(fFin).getTime() - new Date(fInicio).getTime();
                if (ms > 0) durHrs = ms / 3600000;
            }
            correctivasCerradas.push({ ot: ot, durHrs: durHrs });
        }
    });

    var cantCorrectivos = correctivasCerradas.length;
    var downtime = correctivasCerradas.reduce(function(acc, c) { return acc + c.durHrs; }, 0);

    var mttr = cantCorrectivos > 0
        ? downtime / cantCorrectivos
        : 0;

    var pmPct = totalOts > 0
        ? (preventivas / totalOts) * 100
        : 0;

    var mtbf = cantCorrectivos > 0
        ? (PERIODO_HRS - downtime) / cantCorrectivos
        : PERIODO_HRS;

    return {
        downtime:       Math.round(downtime * 10) / 10,
        mttr:           Math.round(mttr * 10) / 10,
        pmPct:          Math.round(pmPct * 10) / 10,
        mtbf:           Math.round(mtbf * 10) / 10,
        cantCorrectivos: cantCorrectivos,
        cantPreventivos: preventivas,
        totalOts:        totalOts
    };
};

// ── Render de valores ────────────────────────────────────────────
window.kpiRender = function(kpis) {
    var loading = document.getElementById('kpiLoadingMsg');
    var gridTop = document.getElementById('kpiGridTop');
    var gridBot = document.getElementById('kpiGridBottom');

    // Llenar valores
    var elMtbf = document.getElementById('kpiValMtbf');
    var elMttr = document.getElementById('kpiValMttr');
    var elPm   = document.getElementById('kpiValPm');
    var elDown = document.getElementById('kpiValDowntime');
    var elCCorr = document.getElementById('kpiCtaCorrectivos');
    var elCPrev = document.getElementById('kpiCtaPreventivos');
    var elCTot  = document.getElementById('kpiCtaTotal');

    if (elMtbf) elMtbf.innerHTML = kpis.mtbf + '<span class="kpi-unit">hrs</span>';
    if (elMttr) elMttr.innerHTML = kpis.mttr + '<span class="kpi-unit">hrs</span>';
    if (elPm)   elPm.innerHTML   = kpis.pmPct + '<span class="kpi-unit">%</span>';
    if (elDown) elDown.innerHTML = kpis.downtime + '<span class="kpi-unit">hrs</span>';
    if (elCCorr) elCCorr.textContent = kpis.cantCorrectivos;
    if (elCPrev) elCPrev.textContent = kpis.cantPreventivos;
    if (elCTot)  elCTot.textContent  = kpis.totalOts;

    // Ocultar spinner, mostrar grids
    if (loading) loading.style.display = 'none';
    if (gridTop) gridTop.style.display = 'grid';
    if (gridBot) gridBot.style.display = 'grid';
};
