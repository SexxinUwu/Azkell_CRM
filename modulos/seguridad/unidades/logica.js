// ================================================================
// 🛡️ MÓDULO SEGURIDAD: UNIDADES (Checklist Camiones) — Lógica Aislada
// Cargado dinámicamente por cargarModuloAislado('seguridad/unidades')
// ================================================================

// ── ESTADO ───────────────────────────────────────────────────────
var _sguCurrentTab = 'activos';
var _sguFormMode = null;        // 'salida' | 'retorno'
var _sguFormRecordId = null;    // ID del registro al registrar retorno
var _sguChecklistData = null;   // checks temporales del modal
var _sguFormPhotos = [];        // fotos temporales del form
var _sguInputCallback = null;   // callback del modal de input

// Plantilla global — snapshot pattern
var _sguDefaultTemplate = [
    { id: 'cat_1', title: 'Documentación', items: [{ id: 'i_11', label: 'Tarjeta de Propiedad' }, { id: 'i_12', label: 'Rev. Técnica y SOAT' }, { id: 'i_13', label: 'DNI, Licencia y SCTR' }] },
    { id: 'cat_2', title: 'EPPs Personal', items: [{ id: 'i_21', label: 'Casco y Barbiquejo' }, { id: 'i_22', label: 'Chaleco Reflectivo' }, { id: 'i_23', label: 'Zapatos Seguridad' }] },
    { id: 'cat_3', title: 'Físico y Seguridad', items: [{ id: 'i_31', label: 'Botiquín y Extintor' }, { id: 'i_32', label: 'Luces y Llantas' }, { id: 'i_33', label: 'Furgón Hermético' }] }
];

// Cargar datos de localStorage
function _sguLoadRecords() {
    try { return JSON.parse(localStorage.getItem('sgu_truck_records') || '[]'); } catch(e) { return []; }
}
function _sguSaveRecords(records) {
    localStorage.setItem('sgu_truck_records', JSON.stringify(records));
}
function _sguLoadTemplate() {
    try {
        var t = JSON.parse(localStorage.getItem('sgu_global_template'));
        return (t && t.length) ? t : _sguDefaultTemplate;
    } catch(e) { return _sguDefaultTemplate; }
}
function _sguSaveTemplate(template) {
    localStorage.setItem('sgu_global_template', JSON.stringify(template));
}

// ── HELPERS ──────────────────────────────────────────────────────
function _sguTimestamp() {
    var d = new Date();
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yy = String(d.getFullYear()).slice(-2);
    var HH = String(d.getHours()).padStart(2, '0');
    var MM = String(d.getMinutes()).padStart(2, '0');
    var SS = String(d.getSeconds()).padStart(2, '0');
    return { date: dd + '-' + mm + '-' + yy, time: HH + ':' + MM, timeFull: HH + ':' + MM + ':' + SS };
}

function _sguHasAlert(checks) {
    if (!checks) return false;
    return Object.values(checks).indexOf('mal') >= 0;
}

function _sguToast(msg) {
    var c = document.getElementById('sgu-toast-container');
    if (!c) return;
    var t = document.createElement('div');
    t.className = 'sgu-toast';
    t.innerHTML = '<i class="bi bi-check-circle-fill" style="color:#10b981;"></i> ' + msg;
    c.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.remove(); }, 3000);
}

// ── NAVEGACIÓN INTERNA ──────────────────────────────────────────
window._sguNav = function(view, data) {
    var views = ['list', 'form', 'detail', 'settings'];
    views.forEach(function(v) {
        var el = document.getElementById('sgu-' + v);
        if (el) { el.classList.remove('active'); }
    });
    var target = document.getElementById('sgu-' + view);
    if (target) target.classList.add('active');

    if (view === 'list') {
        _sguRenderList();
    } else if (view === 'form') {
        _sguInitForm(data);
    } else if (view === 'detail') {
        _sguRenderDetail(data);
    } else if (view === 'settings') {
        _sguRenderSettings();
    }
};

// ── TAB SWITCH ──────────────────────────────────────────────────
window._sguSetTab = function(tab) {
    _sguCurrentTab = tab;
    document.getElementById('sgu-tab-activos').classList.toggle('active', tab === 'activos');
    document.getElementById('sgu-tab-historial').classList.toggle('active', tab === 'historial');
    _sguRenderList();
};

// ── FILTRO ───────────────────────────────────────────────────────
window._sguFilterList = function() {
    _sguRenderList();
};

// ── RENDER: LISTA ────────────────────────────────────────────────
function _sguRenderList() {
    var records = _sguLoadRecords();
    var search = (document.getElementById('sgu-search') || {}).value || '';
    search = search.toLowerCase().trim();

    var filtered = records.filter(function(r) {
        var matchTab = _sguCurrentTab === 'activos' ? r.estado === 'en_ruta' : r.estado === 'completado';
        var matchSearch = !search ||
            (r.placaTracto || '').toLowerCase().indexOf(search) >= 0 ||
            (r.conductor || '').toLowerCase().indexOf(search) >= 0 ||
            (r.placaCarreta || '').toLowerCase().indexOf(search) >= 0 ||
            (r.destino || '').toLowerCase().indexOf(search) >= 0;
        return matchTab && matchSearch;
    });

    // Update count
    var enRutaCount = records.filter(function(r) { return r.estado === 'en_ruta'; }).length;
    var el = document.getElementById('sgu-count-ruta');
    if (el) el.textContent = enRutaCount;

    var container = document.getElementById('sgu-records-list');
    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = '<div class="sgu-empty"><i class="bi bi-inbox" style="font-size:2rem;display:block;margin-bottom:.5rem;"></i>' +
            (search ? 'No se encontraron resultados.' : 'No hay registros para mostrar.') + '</div>';
        return;
    }

    var html = '';
    filtered.forEach(function(r) {
        var hasIssue = (r.salida && r.salida.hasAlert) || (r.retorno && r.retorno.hasAlert);
        var barColor = r.estado === 'en_ruta' ? 'var(--crm-accent,#2563eb)' : '#cbd5e1';
        var iconClass = r.estado === 'en_ruta' ? 'bi-truck-front-fill' : 'bi-check-circle-fill';
        var iconBg = r.estado === 'en_ruta' ? 'rgba(37,99,235,.1)' : 'rgba(100,116,139,.1)';
        var iconColor = r.estado === 'en_ruta' ? '#2563eb' : '#64748b';
        var subText = r.estado === 'en_ruta'
            ? ('Salió: ' + (r.salida ? r.salida.fecha + ' ' + r.salida.hora : '—') + (r.destino ? ' → ' + r.destino : ''))
            : ('Completado: ' + (r.retorno ? r.retorno.fecha : '—'));

        html += '<div class="sgu-card" onclick="window._sguNav(\'detail\',\'' + r.id + '\')">' +
            '<div class="sgu-card-bar" style="background:' + barColor + ';"></div>' +
            '<div style="display:flex;align-items:center;gap:.75rem;padding-left:.5rem;">' +
                '<div style="background:' + iconBg + ';color:' + iconColor + ';width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;">' +
                    '<i class="bi ' + iconClass + '" style="font-size:1.1rem;"></i>' +
                    (hasIssue ? '<div style="position:absolute;top:-3px;right:-3px;background:#ef4444;color:#fff;width:18px;height:18px;border-radius:50%;border:2px solid var(--surface);display:flex;align-items:center;justify-content:center;"><i class="bi bi-exclamation-triangle-fill" style="font-size:.55rem;"></i></div>' : '') +
                '</div>' +
                '<div style="flex:1;min-width:0;">' +
                    '<div style="font-weight:800;color:var(--text);">' + (r.placaTracto || '—') + '</div>' +
                    '<div style="font-size:.75rem;color:var(--subtext);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + subText + '</div>' +
                '</div>' +
                (r.estado === 'en_ruta'
                    ? '<span class="sgu-badge sgu-badge-blue" style="flex-shrink:0;">En Ruta</span>'
                    : '<i class="bi bi-chevron-right" style="color:var(--border);"></i>') +
            '</div>' +
        '</div>';
    });
    container.innerHTML = html;
}

// ── INIT FORM ────────────────────────────────────────────────────
function _sguInitForm(data) {
    _sguChecklistData = null;
    _sguFormPhotos = [];

    if (data && typeof data === 'string' && data.startsWith('retorno:')) {
        _sguFormMode = 'retorno';
        _sguFormRecordId = data.replace('retorno:', '');
        var records = _sguLoadRecords();
        var rec = records.find(function(r) { return r.id === _sguFormRecordId; });
        document.getElementById('sgu-form-title').textContent = 'Registrar Llegada';
        document.getElementById('sgu-btn-save-text').textContent = 'Registrar Llegada';
        _sguRenderFormFields(rec, true);
    } else {
        _sguFormMode = 'salida';
        _sguFormRecordId = null;
        document.getElementById('sgu-form-title').textContent = 'Registrar Salida';
        document.getElementById('sgu-btn-save-text').textContent = 'Registrar Salida';
        _sguRenderFormFields(null, false);
    }

    _sguUpdatePhotoGrid();
    _sguUpdateChecklistStatus();
    _sguUpdateSaveButton();
}

function _sguRenderFormFields(record, isRetorno) {
    var container = document.getElementById('sgu-form-fields');
    if (!container) return;

    if (isRetorno && record) {
        container.innerHTML =
            '<div class="sgu-info-row">' +
                '<div class="sgu-info-box"><div class="sgu-label">Placa Tracto</div><div style="font-weight:800;color:var(--text);">' + (record.placaTracto || '—') + '</div></div>' +
                '<div class="sgu-info-box"><div class="sgu-label">Conductor</div><div style="font-weight:800;color:var(--text);">' + (record.conductor || '—') + '</div></div>' +
            '</div>' +
            '<div class="sgu-form-group">' +
                '<label class="sgu-form-label">Kilometraje Actual</label>' +
                '<input type="number" class="sgu-form-input" id="sgu-km" placeholder="Ej: 125000" min="0" oninput="window._sguUpdateSaveButton()">' +
            '</div>';
    } else {
        container.innerHTML =
            '<div class="sgu-form-group">' +
                '<label class="sgu-form-label"><i class="bi bi-truck-front me-1"></i> Placa Tracto *</label>' +
                '<input type="text" class="sgu-form-input" id="sgu-tracto" placeholder="Ej: C2Q-747" style="text-transform:uppercase;" oninput="window._sguUpdateSaveButton()">' +
            '</div>' +
            '<div class="sgu-form-group">' +
                '<label class="sgu-form-label">Placa Carreta</label>' +
                '<input type="text" class="sgu-form-input" id="sgu-carreta" placeholder="Opcional" style="text-transform:uppercase;">' +
            '</div>' +
            '<div class="sgu-form-group">' +
                '<label class="sgu-form-label"><i class="bi bi-person-fill me-1"></i> Conductor *</label>' +
                '<input type="text" class="sgu-form-input" id="sgu-conductor" placeholder="Nombre del conductor" style="text-transform:uppercase;" oninput="window._sguUpdateSaveButton()">' +
            '</div>' +
            '<div class="sgu-form-group">' +
                '<label class="sgu-form-label"><i class="bi bi-geo-alt-fill me-1"></i> Destino</label>' +
                '<input type="text" class="sgu-form-input" id="sgu-destino" placeholder="Ej: Arequipa" style="text-transform:uppercase;">' +
            '</div>' +
            '<div class="sgu-form-group">' +
                '<label class="sgu-form-label">Kilometraje</label>' +
                '<input type="number" class="sgu-form-input" id="sgu-km" placeholder="Ej: 125000" min="0">' +
            '</div>';
    }
}

// ── PHOTOS ───────────────────────────────────────────────────────
window._sguAddPhoto = function() {
    // Use file input to pick image from gallery
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
            _sguFormPhotos.push(ev.target.result);
            _sguUpdatePhotoGrid();
            _sguUpdateSaveButton();
        };
        reader.readAsDataURL(file);
    };
    input.click();
};

function _sguRemovePhoto(idx) {
    _sguFormPhotos.splice(idx, 1);
    _sguUpdatePhotoGrid();
    _sguUpdateSaveButton();
}

function _sguUpdatePhotoGrid() {
    var grid = document.getElementById('sgu-photo-grid');
    if (!grid) return;
    if (_sguFormPhotos.length === 0) { grid.innerHTML = ''; return; }

    var html = '';
    _sguFormPhotos.forEach(function(src, i) {
        html += '<div class="sgu-photo-thumb">' +
            '<img src="' + src + '" alt="foto">' +
            '<div class="sgu-photo-del" onclick="event.stopPropagation();window._sguRemovePhoto(' + i + ')"><i class="bi bi-x"></i></div>' +
        '</div>';
    });
    if (_sguFormPhotos.length < 20) {
        html += '<div class="sgu-photo-add" onclick="window._sguAddPhoto()"><i class="bi bi-camera-fill"></i></div>';
    }
    grid.innerHTML = html;
}
window._sguRemovePhoto = _sguRemovePhoto;

// ── CHECKLIST ────────────────────────────────────────────────────
window._sguOpenChecklist = function() {
    var template = _sguLoadTemplate();
    var checks = _sguChecklistData || {};
    var body = document.getElementById('sgu-checklist-body');
    if (!body) return;

    var html = '';
    template.forEach(function(section) {
        html += '<div class="sgu-check-section">' +
            '<div class="sgu-check-header">' +
                '<h4>' + section.title + '</h4>' +
                '<button class="sgu-badge sgu-badge-blue" style="border:none;cursor:pointer;" onclick="window._sguCheckAllOk(\'' + section.id + '\')">✓ Todo OK</button>' +
            '</div>';
        section.items.forEach(function(item) {
            var s = checks[item.id] || '';
            html += '<div class="sgu-check-item">' +
                '<span>' + item.label + '</span>' +
                '<div class="sgu-check-btns">' +
                    '<button class="sgu-check-btn mal' + (s === 'mal' ? ' active' : '') + '" onclick="window._sguCheckMark(\'' + item.id + '\',\'mal\')"><i class="bi bi-x-circle-fill"></i></button>' +
                    '<button class="sgu-check-btn na' + (s === 'na' ? ' active' : '') + '" onclick="window._sguCheckMark(\'' + item.id + '\',\'na\')">N/A</button>' +
                    '<button class="sgu-check-btn ok' + (s === 'ok' ? ' active' : '') + '" onclick="window._sguCheckMark(\'' + item.id + '\',\'ok\')"><i class="bi bi-check-circle-fill"></i></button>' +
                '</div>' +
            '</div>';
        });
        html += '</div>';
    });
    body.innerHTML = html;

    _sguUpdateChecklistSaveBtn();
    document.getElementById('sgu-checklist-overlay').classList.add('show');
};

window._sguCloseChecklist = function() {
    document.getElementById('sgu-checklist-overlay').classList.remove('show');
};

window._sguCheckMark = function(itemId, value) {
    if (!_sguChecklistData) _sguChecklistData = {};
    _sguChecklistData[itemId] = value;

    // Update button visuals
    var template = _sguLoadTemplate();
    template.forEach(function(section) {
        section.items.forEach(function(item) {
            if (item.id === itemId) {
                var parent = document.querySelector('.sgu-check-item span[class]');
                // Re-render is simpler
            }
        });
    });
    // Re-render checklist to update visuals
    window._sguOpenChecklist();
};

window._sguCheckAllOk = function(sectionId) {
    if (!_sguChecklistData) _sguChecklistData = {};
    var template = _sguLoadTemplate();
    var section = template.find(function(s) { return s.id === sectionId; });
    if (section) {
        section.items.forEach(function(item) {
            _sguChecklistData[item.id] = 'ok';
        });
    }
    window._sguOpenChecklist();
};

window._sguSaveChecklist = function() {
    document.getElementById('sgu-checklist-overlay').classList.remove('show');
    _sguUpdateChecklistStatus();
    _sguUpdateSaveButton();
    _sguToast('Checklist guardado');
};

function _sguUpdateChecklistSaveBtn() {
    var template = _sguLoadTemplate();
    var totalItems = template.reduce(function(acc, s) { return acc + s.items.length; }, 0);
    var markedItems = _sguChecklistData ? Object.keys(_sguChecklistData).length : 0;
    var btn = document.getElementById('sgu-checklist-save-btn');
    if (btn) {
        var complete = markedItems >= totalItems;
        btn.disabled = !complete;
        btn.className = 'sgu-badge ' + (complete ? 'sgu-badge-blue' : 'sgu-badge-gray');
        btn.style.cursor = complete ? 'pointer' : 'not-allowed';
    }
}

function _sguUpdateChecklistStatus() {
    var el = document.getElementById('sgu-checklist-status');
    if (!el) return;
    if (_sguChecklistData && Object.keys(_sguChecklistData).length > 0) {
        var template = _sguLoadTemplate();
        var total = template.reduce(function(acc, s) { return acc + s.items.length; }, 0);
        var marked = Object.keys(_sguChecklistData).length;
        el.innerHTML = '<i class="bi bi-check-circle-fill text-success me-1"></i> Checklist Completo (' + marked + '/' + total + ')';
    } else {
        el.textContent = 'Abrir Checklist';
    }
}

// ── SAVE BUTTON STATE ────────────────────────────────────────────
window._sguUpdateSaveButton = function() {
    var btn = document.getElementById('sgu-btn-save');
    if (!btn) return;

    var isReady = false;
    if (_sguFormMode === 'retorno') {
        isReady = _sguFormPhotos.length > 0 && _sguChecklistData !== null && Object.keys(_sguChecklistData).length > 0;
    } else {
        var tracto = (document.getElementById('sgu-tracto') || {}).value || '';
        var conductor = (document.getElementById('sgu-conductor') || {}).value || '';
        isReady = tracto.trim() !== '' && conductor.trim() !== '' && _sguFormPhotos.length > 0 && _sguChecklistData !== null && Object.keys(_sguChecklistData).length > 0;
    }
    btn.disabled = !isReady;
};

// ── SAVE RECORD ──────────────────────────────────────────────────
window._sguSaveRecord = function() {
    var ts = _sguTimestamp();
    var template = _sguLoadTemplate();
    var km = (document.getElementById('sgu-km') || {}).value || '';

    var eventData = {
        fecha: ts.date,
        hora: ts.time,
        km: km,
        fotos: _sguFormPhotos.slice(),
        template: JSON.parse(JSON.stringify(template)), // SNAPSHOT
        checklist: JSON.parse(JSON.stringify(_sguChecklistData || {})),
        hasAlert: _sguHasAlert(_sguChecklistData)
    };

    var records = _sguLoadRecords();

    if (_sguFormMode === 'retorno' && _sguFormRecordId) {
        var idx = records.findIndex(function(r) { return r.id === _sguFormRecordId; });
        if (idx >= 0) {
            records[idx].retorno = eventData;
            records[idx].estado = 'completado';
            _sguSaveRecords(records);
            _sguToast('Llegada registrada correctamente');
            window._sguNav('list');
        }
    } else {
        var tracto = (document.getElementById('sgu-tracto') || {}).value || '';
        var carreta = (document.getElementById('sgu-carreta') || {}).value || '';
        var conductor = (document.getElementById('sgu-conductor') || {}).value || '';
        var destino = (document.getElementById('sgu-destino') || {}).value || '';

        var newRecord = {
            id: 'REQ-' + Date.now(),
            placaTracto: tracto.toUpperCase().trim(),
            placaCarreta: carreta.toUpperCase().trim(),
            conductor: conductor.toUpperCase().trim(),
            destino: destino.toUpperCase().trim(),
            estado: 'en_ruta',
            salida: eventData,
            retorno: null
        };

        records.unshift(newRecord);
        _sguSaveRecords(records);
        _sguToast('Salida registrada correctamente');
        window._sguNav('list');
    }
};

// ── RENDER: DETAIL ───────────────────────────────────────────────
function _sguRenderDetail(recordId) {
    var records = _sguLoadRecords();
    var r = records.find(function(rec) { return rec.id === recordId; });
    if (!r) { window._sguNav('list'); return; }

    document.getElementById('sgu-detail-title').textContent = r.placaTracto || 'Detalle';
    var container = document.getElementById('sgu-detail-content');
    if (!container) return;

    var statusBadge = r.estado === 'en_ruta'
        ? '<span class="sgu-badge sgu-badge-blue">En Ruta</span>'
        : '<span class="sgu-badge sgu-badge-green">Completado</span>';

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">' +
        '<div>' +
            '<div style="font-weight:800;font-size:1.15rem;color:var(--text);">' + r.placaTracto + '</div>' +
            '<div style="font-size:.8rem;color:var(--subtext);">' + (r.conductor || '—') + (r.destino ? ' → ' + r.destino : '') + '</div>' +
        '</div>' + statusBadge +
    '</div>';

    // Info card
    html += '<div class="sgu-info-row">' +
        '<div class="sgu-info-box"><div class="sgu-label">ID</div><div style="font-weight:700;color:var(--text);font-size:.85rem;">' + r.id + '</div></div>' +
        (r.placaCarreta ? '<div class="sgu-info-box"><div class="sgu-label">Carreta</div><div style="font-weight:700;color:var(--text);">' + r.placaCarreta + '</div></div>' : '') +
    '</div>';

    // Salida section
    if (r.salida) {
        html += _sguRenderEventSection('Salida', r.salida, 'bi-box-arrow-right', '#2563eb');
    }

    // Retorno section
    if (r.retorno) {
        html += _sguRenderEventSection('Retorno', r.retorno, 'bi-box-arrow-in-left', '#059669');
    }

    // Action button
    if (r.estado === 'en_ruta') {
        html += '<button class="sgu-btn-primary orange" onclick="window._sguNav(\'form\',\'retorno:' + r.id + '\')" style="margin-top:1rem;">' +
            '<i class="bi bi-box-arrow-in-left"></i> Registrar Llegada' +
        '</button>';
    }

    // Delete button
    html += '<button class="sgu-btn-outline" onclick="window._sguDeleteRecord(\'' + r.id + '\')" style="margin-top:.75rem;color:#ef4444;border-color:#fecaca;">' +
        '<i class="bi bi-trash"></i> Eliminar Registro' +
    '</button>';

    container.innerHTML = html;
}

function _sguRenderEventSection(title, data, icon, color) {
    var html = '<div style="margin-bottom:1rem;">' +
        '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">' +
            '<i class="bi ' + icon + '" style="color:' + color + ';"></i>' +
            '<span style="font-weight:800;color:var(--text);">' + title + '</span>' +
            (data.hasAlert ? '<span class="sgu-badge sgu-badge-red"><i class="bi bi-exclamation-triangle-fill me-1"></i>Observaciones</span>' : '') +
        '</div>' +
        '<div class="sgu-info-row">' +
            '<div class="sgu-info-box"><div class="sgu-label">Fecha y Hora</div><div style="font-weight:700;color:var(--text);font-size:.85rem;">' + data.fecha + ' - ' + data.hora + '</div></div>' +
            '<div class="sgu-info-box"><div class="sgu-label">Kilometraje</div><div style="font-weight:700;color:var(--text);font-size:.85rem;">' + (data.km || '—') + '</div></div>' +
        '</div>';

    // Checklist preview button
    html += '<button class="sgu-btn-outline" style="margin-bottom:.5rem;" onclick="window._sguShowChecklistPreview(\'' + title + '\',\'' + btoa(JSON.stringify({ template: data.template, checklist: data.checklist })) + '\')">' +
        '<i class="bi bi-clipboard2-check"></i> Ver Checklist de ' + title +
    '</button>';

    // Photos
    if (data.fotos && data.fotos.length > 0) {
        html += '<div class="sgu-photo-grid">';
        data.fotos.forEach(function(src) {
            html += '<div class="sgu-photo-thumb" style="cursor:default;"><img src="' + src + '" alt="evidencia"></div>';
        });
        html += '</div>';
    }

    html += '</div>';
    return html;
}

// ── CHECKLIST PREVIEW ────────────────────────────────────────────
window._sguShowChecklistPreview = function(title, encodedData) {
    try {
        var data = JSON.parse(atob(encodedData));
        var body = document.getElementById('sgu-preview-body');
        document.getElementById('sgu-preview-title').textContent = 'Checklist de ' + title;

        var html = '';
        (data.template || []).forEach(function(section) {
            html += '<div class="sgu-check-section">' +
                '<div class="sgu-check-header"><h4>' + section.title + '</h4></div>';
            section.items.forEach(function(item) {
                var status = data.checklist[item.id];
                var statusHtml = '';
                if (status === 'ok') statusHtml = '<i class="bi bi-check-circle-fill" style="color:#10b981;font-size:1.1rem;"></i>';
                else if (status === 'mal') statusHtml = '<i class="bi bi-x-circle-fill" style="color:#ef4444;font-size:1.1rem;"></i>';
                else if (status === 'na') statusHtml = '<span class="sgu-badge sgu-badge-gray">N/A</span>';
                else statusHtml = '<span style="font-size:.75rem;color:var(--subtext);font-style:italic;">Sin marcar</span>';

                html += '<div class="sgu-check-item"><span>' + item.label + '</span>' + statusHtml + '</div>';
            });
            html += '</div>';
        });
        body.innerHTML = html;
        document.getElementById('sgu-preview-overlay').classList.add('show');
    } catch(e) { console.error('Error preview:', e); }
};

// ── DELETE RECORD ────────────────────────────────────────────────
window._sguDeleteRecord = function(id) {
    if (typeof window.confirmar === 'function') {
        window.confirmar({
            titulo: '¿Eliminar registro?',
            mensaje: 'Esta acción no se puede deshacer.',
            icono: '🗑️',
            tipo: 'danger',
            btnConfirmar: 'Eliminar'
        }).then(function(ok) {
            if (ok) {
                var records = _sguLoadRecords();
                records = records.filter(function(r) { return r.id !== id; });
                _sguSaveRecords(records);
                _sguToast('Registro eliminado');
                window._sguNav('list');
            }
        });
    } else if (confirm('¿Eliminar este registro?')) {
        var records = _sguLoadRecords();
        records = records.filter(function(r) { return r.id !== id; });
        _sguSaveRecords(records);
        _sguToast('Registro eliminado');
        window._sguNav('list');
    }
};

// ── RENDER: SETTINGS ─────────────────────────────────────────────
function _sguRenderSettings() {
    var template = _sguLoadTemplate();
    var container = document.getElementById('sgu-settings-list');
    if (!container) return;

    var html = '';
    template.forEach(function(cat, index) {
        html += '<div class="sgu-check-section" style="margin-bottom:.75rem;">' +
            '<div class="sgu-check-header">' +
                '<h4><span style="background:var(--border);color:var(--subtext);width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.7rem;margin-right:.5rem;">' + (index + 1) + '</span>' + cat.title + '</h4>' +
                '<button class="sgu-settings-del" onclick="window._sguDeleteCategory(\'' + cat.id + '\')" title="Eliminar categoría"><i class="bi bi-trash" style="font-size:.9rem;"></i></button>' +
            '</div>';
        cat.items.forEach(function(item) {
            html += '<div class="sgu-settings-item">' +
                '<span>' + item.label + '</span>' +
                '<button class="sgu-settings-del" onclick="window._sguDeleteItem(\'' + cat.id + '\',\'' + item.id + '\')"><i class="bi bi-x-lg" style="font-size:.75rem;"></i></button>' +
            '</div>';
        });
        html += '<div style="padding:.65rem;background:var(--bg);border-top:1px solid var(--border);">' +
            '<button class="sgu-btn-outline" onclick="window._sguAddItem(\'' + cat.id + '\',\'' + cat.title + '\')">' +
                '<i class="bi bi-plus-lg"></i> Añadir Subcategoría' +
            '</button>' +
        '</div></div>';
    });
    container.innerHTML = html;
}

// ── SETTINGS: ADD/DELETE ─────────────────────────────────────────
window._sguAddCategory = function() {
    _sguShowInput('Nueva Categoría Principal', 'Ej: Revisión de Cabina', function(val) {
        var template = _sguLoadTemplate();
        template.push({ id: 'cat_' + Date.now(), title: val.toUpperCase(), items: [] });
        _sguSaveTemplate(template);
        _sguRenderSettings();
        _sguToast('Categoría añadida');
    });
};

window._sguAddItem = function(catId, catTitle) {
    _sguShowInput('Nuevo ítem en ' + catTitle, 'Ej: Extintor vigente', function(val) {
        var template = _sguLoadTemplate();
        var cat = template.find(function(c) { return c.id === catId; });
        if (cat) {
            cat.items.push({ id: 'i_' + Date.now(), label: val });
            _sguSaveTemplate(template);
            _sguRenderSettings();
            _sguToast('Ítem añadido');
        }
    });
};

window._sguDeleteCategory = function(catId) {
    var template = _sguLoadTemplate();
    template = template.filter(function(c) { return c.id !== catId; });
    _sguSaveTemplate(template);
    _sguRenderSettings();
    _sguToast('Categoría eliminada');
};

window._sguDeleteItem = function(catId, itemId) {
    var template = _sguLoadTemplate();
    var cat = template.find(function(c) { return c.id === catId; });
    if (cat) {
        cat.items = cat.items.filter(function(i) { return i.id !== itemId; });
        _sguSaveTemplate(template);
        _sguRenderSettings();
    }
};

// ── INPUT MODAL ──────────────────────────────────────────────────
function _sguShowInput(title, placeholder, callback) {
    _sguInputCallback = callback;
    document.getElementById('sgu-input-title').textContent = title;
    var inp = document.getElementById('sgu-input-value');
    inp.value = '';
    inp.placeholder = placeholder;
    document.getElementById('sgu-input-modal').style.display = 'flex';
    setTimeout(function() { inp.focus(); }, 100);
}

window._sguCloseInput = function() {
    document.getElementById('sgu-input-modal').style.display = 'none';
    _sguInputCallback = null;
};

window._sguConfirmInput = function() {
    var val = (document.getElementById('sgu-input-value') || {}).value || '';
    if (val.trim() && _sguInputCallback) {
        _sguInputCallback(val.trim());
    }
    window._sguCloseInput();
};

// ── INIT ─────────────────────────────────────────────────────────
window.init_unidades = function() {
    _sguCurrentTab = 'activos';
    window._sguNav('list');
};
