// ================================================================
// 🛡️ MÓDULO SEGURIDAD: ASISTENCIA (Control QR) — Lógica Aislada
// Cargado dinámicamente por cargarModuloAislado('seguridad/asistencia')
// ================================================================

// ── ESTADO ───────────────────────────────────────────────────────
var _sgaLastScanResult = null;

// ── PERSISTENCIA ─────────────────────────────────────────────────
function _sgaLoadRecords() {
    try { return JSON.parse(localStorage.getItem('sga_attendance_records') || '[]'); } catch(e) { return []; }
}
function _sgaSaveRecords(records) {
    localStorage.setItem('sga_attendance_records', JSON.stringify(records));
}

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

// ── ESCÁNER QR ───────────────────────────────────────────────────
window._sgaOpenScanner = function() {
    if (typeof window._abrirEscaner === 'function') {
        window._abrirEscaner(function(scannedText) {
            window._sgaProcessDNI(scannedText.trim());
        }, 'Escanear QR Personal');
    } else {
        // Fallback: abrir ingreso manual
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
    var records = _sgaLoadRecords();
    var ts = _sgaTimestamp();

    // Buscar si tiene registro abierto HOY (ingresó pero no salió)
    var openRecordIndex = -1;
    for (var i = 0; i < records.length; i++) {
        if (records[i].dni === dni && records[i].fechaIngreso === ts.date && records[i].horaSalida === null) {
            openRecordIndex = i;
            break;
        }
    }

    var scanResult;

    if (openRecordIndex >= 0) {
        // SALIDA: Ya está adentro, registrar salida
        records[openRecordIndex].fechaSalida = ts.date;
        records[openRecordIndex].horaSalida = ts.timeFull;
        _sgaSaveRecords(records);

        scanResult = {
            actionText: 'SALIDA REGISTRADA',
            actionType: 'salida',
            nombre: records[openRecordIndex].nombre,
            dni: records[openRecordIndex].dni,
            cargo: records[openRecordIndex].cargo || '',
            time: ts.timeFull
        };
    } else {
        // INGRESO: Crear nuevo registro
        // Intentar buscar nombre del empleado en registros previos
        var prevRecord = null;
        for (var j = records.length - 1; j >= 0; j--) {
            if (records[j].dni === dni) { prevRecord = records[j]; break; }
        }

        var nombre = nombreManual || (prevRecord ? prevRecord.nombre : 'EMPLEADO ' + dni);
        var cargo = cargoManual || (prevRecord ? prevRecord.cargo : '');

        var newRec = {
            id: Date.now(),
            dni: dni,
            nombre: nombre,
            cargo: cargo,
            fechaIngreso: ts.date,
            horaIngreso: ts.timeFull,
            fechaSalida: null,
            horaSalida: null
        };
        records.unshift(newRec);
        _sgaSaveRecords(records);

        // Reset date filter to today
        document.getElementById('sga-date-filter').value = ts.isoDate;

        scanResult = {
            actionText: 'INGRESO REGISTRADO',
            actionType: 'ingreso',
            nombre: nombre,
            dni: dni,
            cargo: cargo,
            time: ts.timeFull
        };
    }

    _sgaLastScanResult = scanResult;
    _sgaShowScanResult(scanResult);
    window._sgaRender();
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

    // Auto-hide after 10 seconds
    setTimeout(function() {
        if (container) container.style.display = 'none';
    }, 10000);
}

// ── RENDER PRINCIPAL ─────────────────────────────────────────────
window._sgaRender = function() {
    var records = _sgaLoadRecords();
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

    // Filter records by date
    var todaysRecords = records.filter(function(r) { return r.fechaIngreso === dateLocal; });

    // Stats
    var inPlant = todaysRecords.filter(function(r) { return r.horaSalida === null; }).length;
    var finished = todaysRecords.filter(function(r) { return r.horaSalida !== null; }).length;

    var elInside = document.getElementById('sga-stat-inside');
    var elDone = document.getElementById('sga-stat-done');
    var elTotal = document.getElementById('sga-stat-total');
    if (elInside) elInside.textContent = inPlant;
    if (elDone) elDone.textContent = finished;
    if (elTotal) elTotal.textContent = todaysRecords.length;

    // Search filter
    var filtered = todaysRecords.filter(function(r) {
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
        var isInside = log.horaSalida === null;
        var statusBadge = isInside
            ? '<span class="sga-badge sga-badge-active" style="' + (isInside ? 'animation:sgaPulse 2s infinite;' : '') + '">En Planta</span>'
            : '<span class="sga-badge sga-badge-done">Turno Finalizado</span>';

        var inBg = 'rgba(16,185,129,.05)';
        var inBorder = 'rgba(16,185,129,.15)';
        var outBg = log.horaSalida ? 'rgba(234,88,12,.05)' : 'rgba(100,116,139,.05)';
        var outBorder = log.horaSalida ? 'rgba(234,88,12,.15)' : 'var(--border)';
        var outColor = log.horaSalida ? '#ea580c' : 'var(--subtext)';
        var outLabelColor = log.horaSalida ? '#ea580c' : 'var(--subtext)';

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
                        '<div class="sga-time-value">' + log.horaIngreso + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="sga-time-box" style="background:' + outBg + ';border-color:' + outBorder + ';">' +
                    '<i class="bi bi-box-arrow-right" style="color:' + outColor + ';font-size:.85rem;"></i>' +
                    '<div>' +
                        '<div class="sga-time-label" style="color:' + outLabelColor + ';">Salida</div>' +
                        '<div class="sga-time-value">' + (log.horaSalida || '--:--:--') + '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    });

    container.innerHTML = html;
};

// ── SET TODAY ────────────────────────────────────────────────────
window._sgaSetToday = function() {
    document.getElementById('sga-date-filter').value = _sgaGetTodayISO();
    window._sgaRender();
};

// ── EXPORT CSV ───────────────────────────────────────────────────
window._sgaExportCSV = function() {
    var records = _sgaLoadRecords();
    var dateFilter = document.getElementById('sga-date-filter').value;
    var dateLocal = _sgaFormatToLocal(dateFilter);

    var recordsToExport = records.filter(function(r) { return r.fechaIngreso === dateLocal; });

    if (recordsToExport.length === 0) {
        _sgaToast('No hay registros para exportar', 'bi-exclamation-circle');
        return;
    }

    var headers = "DNI,Nombre,Cargo,Fecha Ingreso,Hora Ingreso,Fecha Salida,Hora Salida\n";
    var csvContent = recordsToExport.map(function(log) {
        return '="' + log.dni + '","' + log.nombre + '","' + (log.cargo || '') + '",' +
               log.fechaIngreso + ',' + log.horaIngreso + ',' +
               (log.fechaSalida || '') + ',' + (log.horaSalida || '');
    }).join("\n");

    // Try using XLSX if available
    if (typeof XLSX !== 'undefined') {
        var data = [['DNI', 'Nombre', 'Cargo', 'Fecha Ingreso', 'Hora Ingreso', 'Fecha Salida', 'Hora Salida']];
        recordsToExport.forEach(function(log) {
            data.push([log.dni, log.nombre, log.cargo || '', log.fechaIngreso, log.horaIngreso, log.fechaSalida || '', log.horaSalida || '']);
        });
        var ws = XLSX.utils.aoa_to_sheet(data);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
        XLSX.writeFile(wb, 'Asistencia_' + dateLocal + '.xlsx');
        _sgaToast('Archivo Excel generado exitosamente');
        return;
    }

    // Fallback: CSV
    var blob = new Blob([headers + csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'asistencia_' + dateLocal + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    _sgaToast('Archivo generado exitosamente');
};

// ── INIT ─────────────────────────────────────────────────────────
window.init_asistencia = function() {
    // Set date filter to today
    var todayISO = _sgaGetTodayISO();
    document.getElementById('sga-date-filter').value = todayISO;
    _sgaLastScanResult = null;
    document.getElementById('sga-scan-result').style.display = 'none';
    window._sgaRender();
};
