// ================================================================
// Módulo Config. Métrica — Azkell Fleet
// Permite definir si una placa usa KM o Horas Motor
// ================================================================

window.metricaData    = window.metricaData    || [];
window.metricaDataFil = window.metricaDataFil || [];

// ── Entry point ───────────────────────────────────────────────────
window['init_config-metrica'] = function() {
    if (!window.checkPerm('cfg_mant', 'l')) {
        window.showNoPermMsg('root-dinamico');
        return;
    }
    window.metricaCargar();
};

// ── Cargar tabla ──────────────────────────────────────────────────
window.metricaCargar = function() {
    var tb = document.getElementById('metrica-tbody');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="4" class="text-center py-4"><div class="spinner-border spinner-border-sm"></div></td></tr>';

    fetch('/api/config-metrica')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(data) {
            window.metricaData = data || [];
            window.metricaFiltrar();
        })
        .catch(function(e) {
            console.error(e);
            var tb2 = document.getElementById('metrica-tbody');
            if (tb2) tb2.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-danger">Error al cargar datos</td></tr>';
        });
};

// ── Filtrar ───────────────────────────────────────────────────────
window.metricaFiltrar = function() {
    var q = ((document.getElementById('metrica-buscar') || {}).value || '').toUpperCase().trim();
    window.metricaDataFil = (window.metricaData || []).filter(function(r) {
        return !q || (r.placa || '').toUpperCase().includes(q) || (r.marca || '').toUpperCase().includes(q);
    });
    window.metricaRenderizar();
};

// ── Renderizar ────────────────────────────────────────────────────
window.metricaRenderizar = function() {
    var tb = document.getElementById('metrica-tbody');
    if (!tb) return;

    var cntKm    = (window.metricaData || []).filter(function(r) { return r.metrica !== 'horas'; }).length;
    var cntHoras = (window.metricaData || []).filter(function(r) { return r.metrica === 'horas'; }).length;
    var elKm    = document.getElementById('metrica-count-km');
    var elHoras = document.getElementById('metrica-count-horas');
    if (elKm)    elKm.textContent    = cntKm    + ' KM';
    if (elHoras) elHoras.textContent = cntHoras + ' Horas';

    if (!window.metricaDataFil.length) {
        tb.innerHTML = '<tr><td colspan="4" class="text-center py-4" style="color:var(--subtext)">Sin placas</td></tr>';
        return;
    }

    tb.innerHTML = window.metricaDataFil.map(function(r) {
        var esHoras  = r.metrica === 'horas';
        var badgeKm  = !esHoras
            ? '<span class="badge bg-primary px-3 py-2"><i class="bi bi-speedometer2 me-1"></i>KM</span>'
            : '<span class="badge bg-secondary px-3 py-2" style="opacity:.45"><i class="bi bi-speedometer2 me-1"></i>KM</span>';
        var badgeH   = esHoras
            ? '<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-clock me-1"></i>Horas Motor</span>'
            : '<span class="badge bg-secondary px-3 py-2" style="opacity:.45"><i class="bi bi-clock me-1"></i>Horas Motor</span>';

        var btnKm    = !esHoras
            ? '<button class="btn btn-xs btn-primary disabled" style="font-size:0.72rem;padding:2px 8px" disabled><i class="bi bi-check2"></i> KM activo</button>'
            : '<button class="btn btn-xs btn-outline-primary" style="font-size:0.72rem;padding:2px 8px" onclick="window.metricaCambiar(\'' + r.placa + '\',\'km\')"><i class="bi bi-speedometer2"></i> Usar KM</button>';
        var btnH     = esHoras
            ? '<button class="btn btn-xs btn-warning disabled text-dark" style="font-size:0.72rem;padding:2px 8px" disabled><i class="bi bi-check2"></i> Horas activo</button>'
            : '<button class="btn btn-xs btn-outline-warning" style="font-size:0.72rem;padding:2px 8px" onclick="window.metricaCambiar(\'' + r.placa + '\',\'horas\')"><i class="bi bi-clock"></i> Usar Horas</button>';

        return '<tr>' +
            '<td class="fw-bold" style="font-family:monospace">' + (r.placa || '—') + '</td>' +
            '<td style="color:var(--subtext);font-size:0.85rem">' + (r.marca || '—') + '</td>' +
            '<td class="text-center">' + (esHoras ? badgeH : badgeKm) + '</td>' +
            '<td class="text-center"><div class="d-flex gap-2 justify-content-center">' + btnKm + btnH + '</div></td>' +
            '</tr>';
    }).join('');
};

// ── Cambiar métrica ───────────────────────────────────────────────
window.metricaCambiar = function(placa, metrica) {
    fetch('/api/config-metrica/' + encodeURIComponent(placa), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrica: metrica })
    })
    .then(function(r) { return r.ok ? r.json() : r.json().then(function(e) { throw new Error(e.error); }); })
    .then(function() {
        // Actualizar en memoria local sin re-fetch
        var row = (window.metricaData || []).find(function(x) { return x.placa === placa; });
        if (row) row.metrica = metrica;
        var rowFil = (window.metricaDataFil || []).find(function(x) { return x.placa === placa; });
        if (rowFil) rowFil.metrica = metrica;
        window.metricaRenderizar();
        // Actualizar mapa global para que Fleetrun lo use sin recargar
        if (window._metricaMap) window._metricaMap[placa.toUpperCase()] = metrica;
        window.mostrarToast('Métrica actualizada: ' + placa + ' → ' + (metrica === 'horas' ? 'Horas Motor' : 'KM'), 'success');
    })
    .catch(function(e) { window.mostrarToast('Error: ' + e.message, 'error'); });
};
