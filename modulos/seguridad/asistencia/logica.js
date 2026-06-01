// ================================================================
// 🛡️ MÓDULO SEGURIDAD: ASISTENCIA (Control QR) — Lógica Aislada
// Ahora conectado a MySQL vía API
// ================================================================

// ── ESTADO ───────────────────────────────────────────────────────
var _sgaLastScanResult = null;

// ── HELPERS ──────────────────────────────────────────────────────
function _sgaTimestamp() {
    var d = new Date();
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yy = String(d.getFullYear()).slice(-2);
    var HH = String(d.getHours()).padStart(2, '0');
    var MM = String(d.getMinutes()).padStart(2, '0');
    var SS = String(d.getSeconds()).padStart(2, '0');
    return {
        date: dd + '-' + mm + '-' + yy,
        timeFull: HH + ':' + MM + ':' + SS,
        isoDate: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + dd
    };
}

function _sgaFormatToLocal(isoDate) {
    if (!isoDate) return '';
    var parts = isoDate.split('-');
    return parts[2] + '-' + parts[1] + '-' + parts[0].slice(-2);
}

function _sgaToast(msg, icon) {
    var c = document.getElementById('sga-toast-container');
    if (!c) return;
    var t = document.createElement('div');
    t.className = 'sga-toast';
    t.innerHTML = '<i class="bi ' + (icon || 'bi-check-circle-fill') + '" style="color:#10b981;"></i> ' + msg;
    c.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.remove(); }, 3500);
}

function _sgaGetTodayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ── API HELPERS ──────────────────────────────────────────────────
function _sgaFetch(url, opts) {
    return fetch(url, opts).then(function(r) {
        if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'Error del servidor'); });
        return r.json();
    });
}

// ── ESCÁNER QR ───────────────────────────────────────────────────
window._sgaOpenScanner = function() {
    if (typeof window._abrirEscaner === 'function') {
        window._abrirEscaner(function(scannedText) {
            window._sgaProcessDNI(scannedText.trim());
        }, 'Escanear QR Personal');
    } else {
        window._sgaOpenManual();
        _sgaToast('Escáner no disponible, use ingreso manual', 'bi-exclamation-circle');
    }
};

// ── INGRESO MANUAL ───────────────────────────────────────────────
window._sgaOpenManual = function() {
    document.getElementById('sga-manual-dni').value = '';
    document.getElementById('sga-manual-nombre').value = '';
    document.getElementById('sga-manual-cargo').value = '';
    document.getElementById('sga-manual-overlay').classList.add('show');
    setTimeout(function() { document.getElementById('sga-manual-dni').focus(); }, 100);
};

window._sgaCloseManual = function() {
    document.getElementById('sga-manual-overlay').classList.remove('show');
};

window._sgaProcessManualDNI = function() {
    var dni = (document.getElementById('sga-manual-dni').value || '').trim();
    var nombre = (document.getElementById('sga-manual-nombre').value || '').trim().toUpperCase();
    var cargo = (document.getElementById('sga-manual-cargo').value || '').trim();
    if (!dni) { _sgaToast('Ingrese un DNI válido', 'bi-exclamation-circle'); return; }
    window._sgaCloseManual();
    window._sgaProcessDNI(dni, nombre, cargo);
};

// ── PROCESAR DNI (desde escáner o manual) ────────────────────────
window._sgaProcessDNI = function(dni, nombreManual, cargoManual) {
    if (!dni) return;

    var body = { dni: dni };
    if (nombreManual) body.nombre = nombreManual;
    if (cargoManual) body.cargo = cargoManual;

    _sgaFetch('/api/seguridad/asistencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function(data) {
        var scanResult = {
            actionText: data.accion === 'ingreso' ? 'INGRESO REGISTRADO' : 'SALIDA REGISTRADA',
            actionType: data.accion,
            nombre: data.nombre,
            dni: data.dni,
            cargo: data.cargo || '',
            time: data.time
        };

        _sgaLastScanResult = scanResult;
        _sgaShowScanResult(scanResult);

        // Recargar registros del día
        window._sgaRender();
    }).catch(function(e) {
        _sgaToast('Error: ' + e.message, 'bi-exclamation-circle');
    });
};

// ── MOSTRAR RESULTADO DE ESCANEO ─────────────────────────────────
function _sgaShowScanResult(result) {
    var container = document.getElementById('sga-scan-result');
    if (!container) return;

    var isIngreso = result.actionType === 'ingreso';
    var bgColor = isIngreso ? 'rgba(16,185,129,.1)' : 'rgba(234,88,12,.1)';
    var iconColor = isIngreso ? '#059669' : '#ea580c';
    var icon = isIngreso ? 'bi-box-arrow-in-right' : 'bi-box-arrow-right';
    var labelColor = isIngreso ? '#059669' : '#ea580c';

    container.style.display = 'block';
    container.innerHTML = '<div class="sga-scan-result">' +
        '<div class="sga-scan-icon" style="background:' + bgColor + ';color:' + iconColor + ';">' +
            '<i class="bi ' + icon + '" style="font-size:1.5rem;"></i>' +
        '</div>' +
        '<div style="flex:1;">' +
            '<div style="font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:' + labelColor + ';">' + result.actionText + '</div>' +
            '<div style="font-weight:800;font-size:1.05rem;color:var(--text);margin:.15rem 0;">' + result.nombre + '</div>' +
            '<div style="font-size:.75rem;color:var(--subtext);font-family:monospace;">DNI: ' + result.dni + ' • ' + result.time + (result.cargo ? ' • ' + result.cargo : '') + '</div>' +
        '</div>' +
    '</div>';

    setTimeout(function() { if (container) container.style.display = 'none'; }, 10000);
}

// ── RENDER PRINCIPAL ─────────────────────────────────────────────
window._sgaRender = function() {
    var dateFilter = document.getElementById('sga-date-filter').value;
    var search = (document.getElementById('sga-search') || {}).value || '';
    search = search.toLowerCase().trim();

    var todayISO = _sgaGetTodayISO();
    var dateLocal = _sgaFormatToLocal(dateFilter);

    // Show/hide "Volver a Hoy" button
    var btnHoy = document.getElementById('sga-btn-hoy');
    if (btnHoy) btnHoy.style.display = (dateFilter !== todayISO) ? 'block' : 'none';

    // Show/hide scanner button based on whether we're looking at today
    var btnScan = document.getElementById('sga-btn-scan');
    if (btnScan) btnScan.style.display = (dateFilter === todayISO) ? 'flex' : 'none';

    // Fetch records from API filtered by date
    _sgaFetch('/api/seguridad/asistencia?fecha=' + encodeURIComponent(dateLocal))
        .then(function(records) {
            _sgaRenderRecords(records, search, dateLocal);
        })
        .catch(function(e) {
            console.error('Error cargando asistencia:', e);
            _sgaRenderRecords([], search, dateLocal);
        });
};

function _sgaRenderRecords(records, search, dateLocal) {
    // Stats
    var inPlant = records.filter(function(r) { return r.hora_salida === null; }).length;
    var finished = records.filter(function(r) { return r.hora_salida !== null; }).length;

    var elInside = document.getElementById('sga-stat-inside');
    var elDone = document.getElementById('sga-stat-done');
    var elTotal = document.getElementById('sga-stat-total');
    if (elInside) elInside.textContent = inPlant;
    if (elDone) elDone.textContent = finished;
    if (elTotal) elTotal.textContent = records.length;

    // Search filter
    var filtered = records.filter(function(r) {
        if (!search) return true;
        return (r.nombre || '').toLowerCase().indexOf(search) >= 0 ||
               (r.dni || '').indexOf(search) >= 0 ||
               (r.cargo || '').toLowerCase().indexOf(search) >= 0;
    });

    // Render list
    var container = document.getElementById('sga-records-list');
    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = '<div class="sga-empty"><i class="bi bi-inbox" style="font-size:2rem;display:block;margin-bottom:.5rem;"></i>' +
            (search ? 'No se encontraron resultados.' : 'No hay registros de asistencia para esta fecha.') + '</div>';
        return;
    }

    var html = '';
    filtered.forEach(function(log) {
        var isInside = log.hora_salida === null;
        var statusBadge = isInside
            ? '<span class="sga-badge sga-badge-active">En Planta</span>'
            : '<span class="sga-badge sga-badge-done">Turno Finalizado</span>';

        var inBg = 'rgba(16,185,129,.05)';
        var inBorder = 'rgba(16,185,129,.15)';
        var outBg = log.hora_salida ? 'rgba(234,88,12,.05)' : 'rgba(100,116,139,.05)';
        var outBorder = log.hora_salida ? 'rgba(234,88,12,.15)' : 'var(--border)';
        var outColor = log.hora_salida ? '#ea580c' : 'var(--subtext)';
        var outLabelColor = log.hora_salida ? '#ea580c' : 'var(--subtext)';

        html += '<div class="sga-card sga-record">' +
            '<div class="sga-record-header">' +
                '<div>' +
                    '<div style="font-weight:800;color:var(--text);font-size:.9rem;">' + log.nombre + '</div>' +
                    '<div style="font-size:.75rem;color:var(--subtext);">' + (log.cargo || '') + (log.cargo ? ' • ' : '') + log.dni + '</div>' +
                '</div>' +
                statusBadge +
            '</div>' +
            '<div class="sga-record-times">' +
                '<div class="sga-time-box" style="background:' + inBg + ';border-color:' + inBorder + ';">' +
                    '<i class="bi bi-box-arrow-in-right" style="color:#10b981;font-size:.85rem;"></i>' +
                    '<div>' +
                        '<div class="sga-time-label" style="color:#059669;">Ingreso</div>' +
                        '<div class="sga-time-value">' + log.hora_ingreso + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="sga-time-box" style="background:' + outBg + ';border-color:' + outBorder + ';">' +
                    '<i class="bi bi-box-arrow-right" style="color:' + outColor + ';font-size:.85rem;"></i>' +
                    '<div>' +
                        '<div class="sga-time-label" style="color:' + outLabelColor + ';">Salida</div>' +
                        '<div class="sga-time-value">' + (log.hora_salida || '--:--:--') + '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    });

    container.innerHTML = html;
}

// ── SET TODAY ────────────────────────────────────────────────────
window._sgaSetToday = function() {
    document.getElementById('sga-date-filter').value = _sgaGetTodayISO();
    window._sgaRender();
};

// ── EXPORT CSV ───────────────────────────────────────────────────
window._sgaExportCSV = function() {
    var dateFilter = document.getElementById('sga-date-filter').value;
    var dateLocal = _sgaFormatToLocal(dateFilter);

    // Descargar CSV directamente del servidor
    var url = '/api/seguridad/asistencia/export?fecha=' + encodeURIComponent(dateLocal);

    // Usar fetch con auth para obtener el CSV
    fetch(url).then(function(r) {
        if (!r.ok) {
            return r.json().then(function(e) { _sgaToast(e.error || 'No hay datos', 'bi-exclamation-circle'); });
        }
        return r.blob().then(function(blob) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'asistencia_' + dateLocal + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            _sgaToast('Archivo generado exitosamente');
        });
    }).catch(function(e) {
        _sgaToast('Error: ' + e.message, 'bi-exclamation-circle');
    });
};

// ── INIT ─────────────────────────────────────────────────────────
window.init_asistencia = function() {
    var todayISO = _sgaGetTodayISO();
    document.getElementById('sga-date-filter').value = todayISO;
    _sgaLastScanResult = null;
    document.getElementById('sga-scan-result').style.display = 'none';
    window._sgaRender();
};
