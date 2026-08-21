// ================================================================
// 🛡️ MÓDULO SEGURIDAD: UNIDADES (Checklist) — Bento ERP Lógica
// ================================================================

// ── ESTADO ───────────────────────────────────────────────────────
var _sguView = 'list';
var _sguRecords = [];
var _sguDetailId = null;
var _sguGlobalTemplate = [];
var _sguChecklist = {};
var _sguPhotos = { salida: [], retorno: [] };
var _sguEditMode = 'salida';
var _sguActiveTab = 'activos';
var _sguRecursos = { placas: [], conductores: [] };

// ── HELPERS ──────────────────────────────────────────────────────
function _sguIsAdmin() {
    var ADMIN_ROLES = ['administrador', 'admin', 'sistema', 'master', 'fundador'];
    try {
        if (typeof rolLogueado !== 'undefined' && rolLogueado) {
            var r = rolLogueado.toLowerCase();
            if (ADMIN_ROLES.indexOf(r) >= 0) return true;
        }
    } catch(e) {}
    var rol = localStorage.getItem('fleet_rol') || '';
    rol = rol.toLowerCase();
    if (ADMIN_ROLES.indexOf(rol) >= 0) return true;
    try {
        var perms = JSON.parse(localStorage.getItem('fleet_permisos') || '{}');
        if (perms && perms.admin === true) return true;
    } catch(e2) {}
    return false;
}

function _sguTimestamp() {
    var d = new Date();
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yy = String(d.getFullYear()).slice(-2);
    var HH = String(d.getHours()).padStart(2, '0');
    var MM = String(d.getMinutes()).padStart(2, '0');
    return { date: dd + '-' + mm + '-' + yy, time: HH + ':' + MM };
}

function _sguToast(msg, icon) {
    var c = document.getElementById('sgu-toast-container');
    if (!c) return;
    var t = document.createElement('div');
    t.className = 'sgu-toast';
    t.style.cssText = 'position:fixed;top:1.25rem;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:.65rem 1.35rem;border-radius:50px;font-size:.85rem;font-weight:700;z-index:9999;box-shadow:0 10px 25px rgba(0,0,0,.25);display:flex;align-items:center;gap:.5rem;animation:sguFadeIn .2s ease;';
    t.innerHTML = '<i class="bi ' + (icon || 'bi-check-circle-fill') + '" style="color:#10b981;"></i> ' + msg;
    c.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.remove(); }, 3500);
}

// ── API HELPERS ──────────────────────────────────────────────────
function _sguFetch(url, opts) {
    return fetch(url, opts).then(function(r) {
        if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'Error del servidor'); });
        return r.json();
    });
}

// ── INIT Y CARGA ─────────────────────────────────────────────────
window.init_unidades = function() {
    if (!window.checkPerm('checklist', 'l')) {
        var wrap = document.getElementById('sgu-app') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    _sguView = 'list';
    _sguLoadResources();
    _sguLoadTemplate(function() {
        _sguLoadRecords(function() {
            window._sguShowView('list');
        });
    });
};

function _sguLoadResources() {
    _sguFetch('/api/seguridad/recursos').then(function(data) {
        if (data.placas) _sguRecursos.placas = data.placas;
        if (data.conductores) _sguRecursos.conductores = data.conductores;
    }).catch(function(){});
}

function _sguLoadRecords(cb) {
    _sguFetch('/api/seguridad/unidades').then(function(data) {
        _sguRecords = data || [];
        if (cb) cb();
    }).catch(function(e) {
        _sguRecords = [];
        if (cb) cb();
    });
}

function _sguLoadTemplate(cb) {
    _sguFetch('/api/seguridad/template').then(function(data) {
        _sguGlobalTemplate = data || [];
        if (cb) cb();
    }).catch(function() { if (cb) cb(); });
}

window._sguRefresh = function() {
    _sguToast('Actualizando expedientes...', 'bi-arrow-clockwise');
    _sguLoadRecords(function() {
        _sguRenderList();
        _sguToast('Datos actualizados');
    });
};

// ── AUTOCOMPLETE PERSONALIZADO ───────────────────────────────────
window._sguHandleAutoInput = function(input, type) {
    var allLists = document.querySelectorAll('.sgu-autocomplete-list');
    allLists.forEach(function(l) {
        if (l !== input.nextElementSibling) l.classList.remove('show');
    });

    var val = input.value.toLowerCase().trim();
    var listEl = input.nextElementSibling;
    if (!listEl || !listEl.classList.contains('sgu-autocomplete-list')) return;

    var items = _sguRecursos[type] || [];
    var filtered = items.filter(function(item) {
        return item.toLowerCase().indexOf(val) >= 0;
    });

    filtered = filtered.slice(0, 40);

    var html = '';
    if (filtered.length === 0) {
        html = '<div class="sgu-autocomplete-empty">No se encontraron coincidencias...</div>';
    } else {
        filtered.forEach(function(item) {
            var safeItem = item.replace(/'/g, "\\'");
            html += '<div class="sgu-autocomplete-item" onclick="window._sguSelectAutoItem(\'' + input.id + '\', \'' + safeItem + '\')">' + item + '</div>';
        });
    }

    listEl.innerHTML = html;
    listEl.classList.add('show');
    window._sguCheckFormReady();
};

window._sguSelectAutoItem = function(inputId, value) {
    var input = document.getElementById(inputId);
    if (input) {
        input.value = value;
        var listEl = input.nextElementSibling;
        if (listEl) listEl.classList.remove('show');
        window._sguCheckFormReady();
    }
};

document.addEventListener('click', function(e) {
    if (!e.target.closest('.sgu-autocomplete-wrap')) {
        var lists = document.querySelectorAll('.sgu-autocomplete-list');
        lists.forEach(function(l) { l.classList.remove('show'); });
    }
});

// ── NAVEGACIÓN ───────────────────────────────────────────────────
window._sguNav = function(view, id) { window._sguShowView(view, id); };

window._sguOpenScanner = function() {
    if (typeof window._abrirEscaner === 'function') {
        window._abrirEscaner(function(valor) {
            var el = document.getElementById('sgu-f-placa');
            if (el) {
                el.value = valor.toUpperCase();
                window._sguHandleAutoInput(el, 'placas');
            }
        }, 'Escanear Placa / QR de Unidad');
    } else {
        _sguToast('Función de escáner no disponible', 'bi-qr-code-scan');
    }
};

window._sguShowView = function(view, id) {
    _sguView = view;
    if (id) _sguDetailId = id;
    ['sgu-list', 'sgu-form', 'sgu-detail', 'sgu-settings'].forEach(function(v) {
        var el = document.getElementById(v);
        if (el) {
            el.style.display = 'none';
            el.classList.remove('active');
        }
    });
    var target = document.getElementById('sgu-' + view);
    if (target) {
        target.style.display = 'block';
        target.classList.add('active');
    }

    if (view === 'list') { _sguRenderList(); }
    else if (view === 'form') { _sguInitForm(); }
    else if (view === 'detail') { _sguRenderDetail(id); }
    else if (view === 'settings') { _sguRenderSettings(); }
};

window._sguSetTab = function(tab) {
    _sguActiveTab = tab;
    ['activos', 'todos', 'historial', 'alertas'].forEach(function(t) {
        var el = document.getElementById('sgu-tab-' + t);
        if (el) el.classList.remove('active');
    });
    var activePill = document.getElementById('sgu-tab-' + tab);
    if (activePill) activePill.classList.add('active');

    // Highlight corresponding KPI card
    ['total', 'ruta', 'completados', 'alertas'].forEach(function(k) {
        var kpiEl = document.getElementById('sgu-kpi-' + k);
        if (kpiEl) kpiEl.classList.remove('active');
    });
    if (tab === 'todos') {
        var k = document.getElementById('sgu-kpi-total');
        if (k) k.classList.add('active');
    } else if (tab === 'activos') {
        var k = document.getElementById('sgu-kpi-ruta');
        if (k) k.classList.add('active');
    } else if (tab === 'historial') {
        var k = document.getElementById('sgu-kpi-completados');
        if (k) k.classList.add('active');
    } else if (tab === 'alertas') {
        var k = document.getElementById('sgu-kpi-alertas');
        if (k) k.classList.add('active');
    }

    _sguRenderList();
};

window._sguFilterList = function() { _sguRenderList(); };

// ── RENDER LISTA / DASHBOARD BENTO ───────────────────────────────
function _sguRenderList() {
    var tableBody = document.getElementById('sgu-table-body');
    var mobileContainer = document.getElementById('sgu-mobile-records-list');
    if (!tableBody && !mobileContainer) return;

    // Calcular KPIs
    var countTotal = _sguRecords.length;
    var countRuta = _sguRecords.filter(function(r) { return r.estado === 'en_ruta'; }).length;
    var countComp = _sguRecords.filter(function(r) { return r.estado === 'completado'; }).length;
    var countAlert = _sguRecords.filter(function(r) { return r.salida_has_alert || r.retorno_has_alert; }).length;

    var elTotal = document.getElementById('sgu-kpi-val-total');
    var elRuta = document.getElementById('sgu-kpi-val-ruta');
    var elComp = document.getElementById('sgu-kpi-val-completados');
    var elAlert = document.getElementById('sgu-kpi-val-alertas');

    if (elTotal) elTotal.textContent = countTotal;
    if (elRuta) elRuta.textContent = countRuta;
    if (elComp) elComp.textContent = countComp;
    if (elAlert) elAlert.textContent = countAlert;

    var search = (document.getElementById('sgu-search') || {}).value || '';
    search = search.toLowerCase().trim();

    var filtered = _sguRecords.filter(function(r) {
        if (_sguActiveTab === 'activos' && r.estado !== 'en_ruta') return false;
        if (_sguActiveTab === 'historial' && r.estado !== 'completado') return false;
        if (_sguActiveTab === 'alertas' && !(r.salida_has_alert || r.retorno_has_alert)) return false;
        
        if (!search) return true;
        return (r.id || '').toLowerCase().indexOf(search) >= 0 ||
               (r.placa_tracto || '').toLowerCase().indexOf(search) >= 0 ||
               (r.placa_carreta || '').toLowerCase().indexOf(search) >= 0 ||
               (r.conductor || '').toLowerCase().indexOf(search) >= 0 ||
               (r.destino || '').toLowerCase().indexOf(search) >= 0;
    });

    if (!filtered.length) {
        var emptyHtml = '<tr><td colspan="8" class="text-center py-5 text-secondary">' +
            '<i class="bi bi-inbox fs-2 d-block mb-2 text-muted"></i> No se encontraron registros coincidentes.' +
            '</td></tr>';
        if (tableBody) tableBody.innerHTML = emptyHtml;
        if (mobileContainer) mobileContainer.innerHTML = '<div class="text-center py-4 text-secondary"><i class="bi bi-inbox fs-3 d-block mb-2"></i>No hay registros para mostrar.</div>';
        return;
    }

    var htmlTable = '';
    var htmlMobile = '';
    var isAdmin = _sguIsAdmin();

    filtered.forEach(function(rec) {
        var isEnRuta = rec.estado === 'en_ruta';
        var hasAlert = rec.salida_has_alert || rec.retorno_has_alert;

        var statusBadge = isEnRuta
            ? '<span class="sgu-badge sgu-badge-en-ruta"><i class="bi bi-truck"></i> EN RUTA</span>'
            : '<span class="sgu-badge sgu-badge-completado"><i class="bi bi-check-circle-fill"></i> COMPLETADO</span>';

        var alertBadge = hasAlert
            ? '<span class="sgu-badge sgu-badge-alerta" title="Presentó observaciones"><i class="bi bi-exclamation-triangle-fill"></i> CON NOVEDAD</span>'
            : '<span class="sgu-badge sgu-badge-ok"><i class="bi bi-shield-check"></i> CONFORME</span>';

        var deleteBtn = isAdmin ? '<button class="sgu-action-btn sgu-btn-del-cell" onclick="event.stopPropagation(); window._sguDeleteRecord(\'' + rec.id + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>' : '';
        
        var actionBtn = isEnRuta
            ? '<button class="sgu-action-btn sgu-btn-ingresar-cell" onclick="event.stopPropagation(); window._sguShowView(\'detail\',\'' + rec.id + '\')"><i class="bi bi-arrow-left-circle-fill"></i> Ingresar</button>'
            : '<button class="sgu-action-btn sgu-btn-view-cell" onclick="event.stopPropagation(); window._sguShowView(\'detail\',\'' + rec.id + '\')"><i class="bi bi-eye"></i> Detalle</button>';

        var placaText = '<span class="sgu-placa-pill">' + rec.placa_tracto + '</span>' + 
            (rec.placa_carreta ? ' <span class="text-muted fw-semibold" style="font-size:0.78rem;">/ ' + rec.placa_carreta + '</span>' : '');

        var salidaText = '<div class="fw-bold text-dark" style="font-size:0.8rem;">' + (rec.salida_fecha || '--') + ' ' + (rec.salida_hora || '') + '</div>' +
            '<div class="text-secondary" style="font-size:0.75rem;">' + (rec.salida_km ? rec.salida_km + ' km' : 'Sin Km') + '</div>';

        var retornoText = isEnRuta
            ? '<span class="text-muted fst-italic" style="font-size:0.78rem;"><i class="bi bi-hourglass-split"></i> En trayecto</span>'
            : '<div class="fw-bold text-dark" style="font-size:0.8rem;">' + (rec.retorno_fecha || '--') + ' ' + (rec.retorno_hora || '') + '</div>' +
              '<div class="text-secondary" style="font-size:0.75rem;">' + (rec.retorno_km ? rec.retorno_km + ' km' : 'Sin Km') + '</div>';

        // 1. Fila Desktop Table
        htmlTable += '<tr onclick="window._sguShowView(\'detail\',\'' + rec.id + '\')">' +
            '<td><span class="fw-bold text-primary" style="font-family:monospace;font-size:0.85rem;">' + rec.id + '</span></td>' +
            '<td>' + placaText + '</td>' +
            '<td><div class="fw-bold text-dark">' + (rec.conductor || 'Sin conductor') + '</div><div class="text-secondary small">' + (rec.destino || '---') + '</div></td>' +
            '<td>' + salidaText + '</td>' +
            '<td>' + retornoText + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' + alertBadge + '</td>' +
            '<td class="text-end" onclick="event.stopPropagation();">' +
                '<div class="d-inline-flex align-items-center gap-1">' +
                    actionBtn +
                    '<button class="sgu-action-btn sgu-btn-view-cell" onclick="window._sguCurrentRecord=_sguRecords.find(function(r){return r.id===\''+rec.id+'\'}); window._sguGenerarPDFCompleto()" title="Descargar PDF"><i class="bi bi-file-earmark-pdf text-danger"></i></button>' +
                    deleteBtn +
                '</div>' +
            '</td>' +
        '</tr>';

        // 2. Tarjeta Móvil
        htmlMobile += '<div class="sgu-form-card p-3 mb-2" onclick="window._sguShowView(\'detail\',\'' + rec.id + '\')">' +
            '<div class="d-flex justify-content-between align-items-center mb-2">' +
                '<div>' + placaText + '</div>' +
                '<div>' + statusBadge + '</div>' +
            '</div>' +
            '<div class="fw-bold text-dark mb-1">' + (rec.conductor || '---') + '</div>' +
            '<div class="text-secondary small mb-2"><i class="bi bi-geo-alt me-1"></i>' + (rec.destino || '---') + '</div>' +
            '<div class="d-flex justify-content-between align-items-center pt-2 border-top">' +
                '<div class="small text-secondary">' + (rec.salida_fecha || '') + ' ' + (rec.salida_hora || '') + '</div>' +
                '<div class="d-flex gap-1" onclick="event.stopPropagation();">' +
                    actionBtn +
                    deleteBtn +
                '</div>' +
            '</div>' +
        '</div>';
    });

    if (tableBody) tableBody.innerHTML = htmlTable;
    if (mobileContainer) mobileContainer.innerHTML = htmlMobile;
}

// ── EXPORTACIÓN A EXCEL ──────────────────────────────────────────
window._sguExportarExcel = function() {
    if (!_sguRecords || !_sguRecords.length) {
        _sguToast('No hay datos para exportar', 'bi-exclamation-triangle');
        return;
    }
    _sguToast('Generando archivo Excel...', 'bi-hourglass-split');

    var rows = [
        ['Folio ID', 'Placa Tracto', 'Placa Carreta', 'Conductor', 'Destino', 'Salida Fecha', 'Salida Hora', 'Salida Km', 'Retorno Fecha', 'Retorno Hora', 'Retorno Km', 'Estado', 'Tiene Novedad']
    ];

    _sguRecords.forEach(function(r) {
        rows.push([
            r.id || '',
            r.placa_tracto || '',
            r.placa_carreta || '',
            r.conductor || '',
            r.destino || '',
            r.salida_fecha || '',
            r.salida_hora || '',
            r.salida_km || '',
            r.retorno_fecha || '',
            r.retorno_hora || '',
            r.retorno_km || '',
            r.estado || '',
            (r.salida_has_alert || r.retorno_has_alert) ? 'SI' : 'NO'
        ]);
    });

    var csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(function(e) {
        return e.map(function(val) {
            return '"' + String(val).replace(/"/g, '""') + '"';
        }).join(';');
    }).join('\n');

    var encodedUri = encodeURI(csvContent);
    var link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'Checklist_Unidades_' + new Date().toISOString().slice(0,10) + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    _sguToast('Descarga iniciada');
};

// ── FORM: NUEVA SALIDA ───────────────────────────────────────────
function _sguInitForm() {
    _sguEditMode = 'salida';
    _sguChecklist = {};
    _sguPhotos = { salida: [], retorno: [] };

    document.getElementById('sgu-f-placa').value = '';
    document.getElementById('sgu-f-carreta').value = '';
    document.getElementById('sgu-f-conductor').value = '';
    document.getElementById('sgu-f-destino').value = '';
    document.getElementById('sgu-f-km').value = '';

    _sguRenderChecklist();
    window._sguCheckFormReady();
}

window._sguCheckFormReady = function() {
    if (_sguView === 'detail' && _sguEditMode === 'retorno') {
        _sguCheckReturnReady();
        return;
    }

    var p = (document.getElementById('sgu-f-placa') || {}).value || '';
    var c = (document.getElementById('sgu-f-conductor') || {}).value || '';
    var d = (document.getElementById('sgu-f-destino') || {}).value || '';
    var k = (document.getElementById('sgu-f-km') || {}).value || '';

    p = p.trim(); c = c.trim(); d = d.trim(); k = k.trim();

    var photosList = _sguPhotos['salida'] || [];
    var hasPhotos = photosList.length > 0;
    var btnPhotos = document.getElementById('sgu-btn-open-photos');
    if (btnPhotos) {
        if (hasPhotos) {
            btnPhotos.innerHTML = '<i class="bi bi-check-lg"></i> ' + photosList.length + ' Foto(s)';
            btnPhotos.classList.add('done');
        } else {
            btnPhotos.innerHTML = 'Añadir';
            btnPhotos.classList.remove('done');
        }
    }

    var chkCount = Object.keys(_sguChecklist).length;
    var totalItems = 0;
    _sguGlobalTemplate.forEach(function(cat) { totalItems += (cat.items || []).length; });
    var hasChecklist = totalItems > 0 && chkCount === totalItems;
    var btnChk = document.getElementById('sgu-btn-open-checklist');
    if (btnChk) {
        if (hasChecklist) {
            btnChk.innerHTML = '<i class="bi bi-check-lg"></i> Completo';
            btnChk.classList.add('done');
        } else {
            btnChk.innerHTML = 'Llenar';
            btnChk.classList.remove('done');
        }
    }

    var valid = (p !== '' && c !== '' && d !== '' && k !== '' && hasPhotos && hasChecklist);
    var btnSave = document.getElementById('sgu-btn-save');
    if (btnSave) {
        btnSave.disabled = !valid;
    }
};

// ── OVERLAYS: CHECKLIST & FOTOS ──────────────────────────────────
window._sguOpenChecklist = function() {
    document.getElementById('sgu-chk-overlay-title').textContent = _sguEditMode === 'retorno' ? 'Checklist Retorno (Vuelta)' : 'Checklist Salida (Ida)';
    _sguRenderChecklist();
    document.getElementById('sgu-checklist-overlay').classList.add('show');
};

window._sguOpenPhotosChooser = function(tipo) {
    document.getElementById('sgu-photos-bsheet').classList.add('show');

    var inputCam = document.getElementById('sgu-input-cam');
    var inputGal = document.getElementById('sgu-input-gal');

    inputCam.onchange = function() { _sguHandlePhotoInput(this, tipo); };
    inputGal.onchange = function() { _sguHandlePhotoInput(this, tipo); };
};

function _sguHandlePhotoInput(input, tipo) {
    if (!input.files || !input.files.length) return;
    _sguPhotos[tipo] = _sguPhotos[tipo] || [];
    Array.from(input.files).forEach(function(file) {
        var url = URL.createObjectURL(file);
        _sguPhotos[tipo].push({ url: url, file: file, uploaded: false });
    });
    input.value = '';
    document.getElementById('sgu-photos-bsheet').classList.remove('show');
    _sguToast('Fotos adjuntadas (' + _sguPhotos[tipo].length + ')');
    window._sguCheckFormReady();
}

// ── RENDER CHECKLIST INTERACTIVO ─────────────────────────────────
function _sguRenderChecklist() {
    var container = document.getElementById('sgu-checklist-container');
    if (!container) return;

    if (!_sguGlobalTemplate || !_sguGlobalTemplate.length) {
        container.innerHTML = '<div class="text-center py-4 text-secondary">No se ha configurado la plantilla de checklist.</div>';
        return;
    }

    var html = '<div class="alert alert-info border-0 rounded-3 mb-3 d-flex align-items-center gap-2" style="background:#eff6ff;color:#0369a1;font-size:0.85rem;">' +
        '<i class="bi bi-info-circle-fill fs-5"></i>' +
        '<div>Marque cada componente del vehículo. Utilice <span class="badge bg-danger">X</span> en caso de detectar anomalías o daños mecánicos/físicos.</div>' +
    '</div>';

    _sguGlobalTemplate.forEach(function(cat) {
        html += '<div class="sgu-chk-group">';
        html += '<div class="sgu-chk-group-header">';
        html += '<h6 class="fw-bold text-dark m-0">' + (cat.titulo || 'Categoría') + '</h6>';
        html += '<button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fw-bold" style="font-size:0.75rem;" onclick="window._sguSetCatCheck(\'' + cat.id + '\')"><i class="bi bi-check2-all"></i> Todo OK</button>';
        html += '</div>';

        (cat.items || []).forEach(function(item) {
            var val = _sguChecklist[item.id] || '';
            html += '<div class="sgu-chk-row">';
            html += '<span class="sgu-chk-label-text">' + item.label + '</span>';
            html += '<div class="d-flex gap-1">';
            html += '<div class="sgu-chk-btn-circle x ' + (val==='mal'?'active':'') + '" onclick="window._sguSetCheck(\''+item.id+'\',\'mal\')" title="Observado / Dañado"><i class="bi bi-x-lg"></i></div>';
            html += '<div class="sgu-chk-btn-circle na ' + (val==='na'?'active':'') + '" onclick="window._sguSetCheck(\''+item.id+'\',\'na\')" title="No Aplica">N/A</div>';
            html += '<div class="sgu-chk-btn-circle ok ' + (val==='ok'?'active':'') + '" onclick="window._sguSetCheck(\''+item.id+'\',\'ok\')" title="Conforme"><i class="bi bi-check-lg"></i></div>';
            html += '</div></div>';
        });
        html += '</div>';
    });

    container.innerHTML = html;
}

window._sguSetCheck = function(itemId, valor) {
    _sguChecklist[itemId] = valor;
    _sguRenderChecklist();
    window._sguCheckFormReady();
};

window._sguSetCatCheck = function(catId) {
    var cat = _sguGlobalTemplate.find(function(c) { return c.id === catId; });
    if (cat && cat.items) {
        cat.items.forEach(function(item) { _sguChecklist[item.id] = 'ok'; });
    }
    _sguRenderChecklist();
    window._sguCheckFormReady();
};

// ── RENDER DETALLE Y CIERRE DE RETORNO ────────────────────────────
function _sguRenderDetail(recordId) {
    var container = document.getElementById('sgu-detail-content');
    if (!container) return;

    var rec = _sguRecords.find(function(r) { return r.id === recordId; });
    if (!rec) return;

    window._sguCurrentRecord = rec;

    var isEnRuta = rec.estado === 'en_ruta';
    _sguEditMode = isEnRuta ? 'retorno' : 'ver';
    if (isEnRuta) {
        _sguChecklist = {};
        _sguPhotos.retorno = [];
    }

    var badgeEl = document.getElementById('sgu-det-head-badge');
    var placaEl = document.getElementById('sgu-det-head-placa');
    var condEl  = document.getElementById('sgu-det-head-cond');

    if (placaEl) placaEl.textContent = rec.placa_tracto + (rec.placa_carreta ? ' / ' + rec.placa_carreta : '');
    if (condEl)  condEl.textContent = (rec.conductor || 'Sin conductor') + ' • Destino: ' + (rec.destino || '---');

    if (badgeEl) {
        if (isEnRuta) {
            badgeEl.textContent = 'EN RUTA';
            badgeEl.className = 'sgu-badge sgu-badge-en-ruta';
        } else {
            badgeEl.textContent = 'COMPLETADO';
            badgeEl.className = 'sgu-badge sgu-badge-completado';
        }
    }

    var html = '';

    if (rec.salida_has_alert || rec.retorno_has_alert) {
        html += '<div class="alert alert-danger border-0 rounded-3 mb-3 d-flex align-items-center gap-2" style="background:#fef2f2;color:#991b1b;font-size:0.88rem;">' +
            '<i class="bi bi-exclamation-triangle-fill fs-4"></i>' +
            '<div><strong>Novedad en Expediente:</strong> Este viaje registró observaciones o anomalías en la inspección física.</div>' +
        '</div>';
    }

    html += '<div class="row g-3">';

    // Columna Izquierda: Información del Viaje / Salida
    html += '<div class="col-12 col-lg-6">';
    html += '<div class="sgu-form-card">';
    html += '<div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">';
    html += '<h6 class="fw-bold text-dark m-0"><i class="bi bi-arrow-right-circle-fill text-primary me-1"></i> Inspección de Salida (Ida)</h6>';
    html += '<span class="badge bg-light text-dark border">' + (rec.salida_fecha || '--') + ' ' + (rec.salida_hora || '') + '</span>';
    html += '</div>';

    html += '<div class="row g-2 mb-3">';
    html += '<div class="col-6"><span class="sgu-form-label">Kilometraje Salida</span><div class="fw-bold text-dark fs-6">' + (rec.salida_km ? rec.salida_km + ' km' : '---') + '</div></div>';
    html += '<div class="col-6"><span class="sgu-form-label">Destino Reportado</span><div class="fw-bold text-dark fs-6">' + (rec.destino || '---') + '</div></div>';
    html += '</div>';

    html += '<div class="d-flex gap-2">';
    html += '<button class="sgu-btn-top flex-grow-1" onclick="window._sguVerDetalles(\'salida\')"><i class="bi bi-list-check"></i> Ver Checklist</button>';
    html += '<button class="sgu-btn-top flex-grow-1" onclick="window._sguVerFotos(\'salida\')"><i class="bi bi-images"></i> Fotos (' + (rec.fotos || []).filter(function(f){return f.tipo==='salida';}).length + ')</button>';
    html += '<button class="sgu-btn-top flex-grow-1" onclick="window._sguGenerarPDF(\'salida\')"><i class="bi bi-filetype-pdf text-danger"></i> PDF</button>';
    html += '</div>';

    html += '</div>';
    html += '</div>';

    // Columna Derecha: Retorno o Formulario de Cierre
    html += '<div class="col-12 col-lg-6">';

    if (isEnRuta) {
        html += '<div class="sgu-form-card" style="border: 2px solid #bfdbfe; background: #ffffff;">';
        html += '<div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">';
        html += '<h6 class="fw-bold text-primary m-0"><i class="bi bi-arrow-left-circle-fill me-1"></i> Registrar Llegada / Retorno</h6>';
        html += '<span class="badge bg-primary">EN CURSO</span>';
        html += '</div>';

        html += '<div class="mb-3">';
        html += '<label class="sgu-form-label">Kilometraje de Llegada (Retorno)</label>';
        html += '<input type="number" class="sgu-form-input-clean" id="sgu-det-km-retorno" placeholder="Ingrese odómetro actual" oninput="window._sguCheckFormReady()">';
        html += '</div>';

        html += '<div class="sgu-task-box mb-2">';
        html += '<div class="d-flex align-items-center gap-2">';
        html += '<i class="bi bi-camera fs-5 text-primary"></i>';
        html += '<span class="fw-bold text-dark small">Fotos de Llegada</span>';
        html += '</div>';
        html += '<button class="sgu-task-btn" id="sgu-det-btn-fotos" onclick="window._sguOpenPhotosChooser(\'retorno\')">Añadir</button>';
        html += '</div>';

        html += '<div class="sgu-task-box mb-3">';
        html += '<div class="d-flex align-items-center gap-2">';
        html += '<i class="bi bi-clipboard2-check fs-5 text-success"></i>';
        html += '<span class="fw-bold text-dark small">Checklist de Llegada</span>';
        html += '</div>';
        html += '<button class="sgu-task-btn" id="sgu-det-btn-chk" onclick="window._sguOpenChecklist()">Llenar</button>';
        html += '</div>';

        html += '<button class="btn btn-primary w-100 py-2 fw-bold shadow-sm" id="sgu-det-btn-save" onclick="window._sguSaveReturn()" disabled>';
        html += '<i class="bi bi-check-circle-fill me-1"></i> Confirmar Retorno y Cerrar Expediente';
        html += '</button>';

        html += '</div>';
    } else {
        html += '<div class="sgu-form-card">';
        html += '<div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">';
        html += '<h6 class="fw-bold text-dark m-0"><i class="bi bi-arrow-left-circle-fill text-success me-1"></i> Inspección de Retorno (Vuelta)</h6>';
        html += '<span class="badge bg-light text-dark border">' + (rec.retorno_fecha || '--') + ' ' + (rec.retorno_hora || '') + '</span>';
        html += '</div>';

        html += '<div class="row g-2 mb-3">';
        html += '<div class="col-6"><span class="sgu-form-label">Kilometraje Llegada</span><div class="fw-bold text-dark fs-6">' + (rec.retorno_km ? rec.retorno_km + ' km' : '---') + '</div></div>';
        var kmRecorrido = (rec.retorno_km && rec.salida_km) ? (Number(rec.retorno_km) - Number(rec.salida_km)) : null;
        html += '<div class="col-6"><span class="sgu-form-label">Km Total Recorrido</span><div class="fw-bold text-primary fs-6">' + (kmRecorrido !== null ? kmRecorrido + ' km' : '---') + '</div></div>';
        html += '</div>';

        html += '<div class="d-flex gap-2">';
        html += '<button class="sgu-btn-top flex-grow-1" onclick="window._sguVerDetalles(\'retorno\')"><i class="bi bi-list-check"></i> Ver Checklist</button>';
        html += '<button class="sgu-btn-top flex-grow-1" onclick="window._sguVerFotos(\'retorno\')"><i class="bi bi-images"></i> Fotos (' + (rec.fotos || []).filter(function(f){return f.tipo==='retorno';}).length + ')</button>';
        html += '<button class="sgu-btn-top flex-grow-1" onclick="window._sguGenerarPDF(\'retorno\')"><i class="bi bi-filetype-pdf text-danger"></i> PDF</button>';
        html += '</div>';

        html += '<div class="pt-3 mt-3 border-top d-flex gap-2">';
        html += '<button class="sgu-btn-top sgu-btn-primary flex-grow-1" onclick="window._sguGenerarPDFCompleto()"><i class="bi bi-file-earmark-arrow-down-fill"></i> Descargar Expediente Completo (Ida y Vuelta)</button>';
        if (_sguIsAdmin()) {
            html += '<button class="sgu-btn-top" style="color:#dc2626;" onclick="window._sguDeleteRecord(\'' + rec.id + '\')" title="Eliminar Expediente"><i class="bi bi-trash"></i></button>';
        }
        html += '</div>';

        html += '</div>';
    }

    html += '</div>';
    html += '</div>';

    container.innerHTML = html;
    if (isEnRuta) window._sguCheckFormReady();
}

window._sguCheckReturnReady = function() {
    var k = document.getElementById('sgu-det-km-retorno');
    if (!k) return;
    var km = k.value.trim();

    var photosList = _sguPhotos['retorno'] || [];
    var hasPhotos = photosList.length > 0;
    var btnFotos = document.getElementById('sgu-det-btn-fotos');
    if (btnFotos) {
        if (hasPhotos) {
            btnFotos.innerHTML = '<i class="bi bi-check-lg"></i> ' + photosList.length + ' Foto(s)';
            btnFotos.classList.add('done');
        } else {
            btnFotos.innerHTML = 'Añadir';
            btnFotos.classList.remove('done');
        }
    }

    var chkCount = Object.keys(_sguChecklist).length;
    var totalItems = 0;
    _sguGlobalTemplate.forEach(function(cat) { totalItems += (cat.items || []).length; });
    var hasChecklist = totalItems > 0 && chkCount === totalItems;
    var btnChk = document.getElementById('sgu-det-btn-chk');
    if (btnChk) {
        if (hasChecklist) {
            btnChk.innerHTML = '<i class="bi bi-check-lg"></i> Completo';
            btnChk.classList.add('done');
        } else {
            btnChk.innerHTML = 'Llenar';
            btnChk.classList.remove('done');
        }
    }

    var valid = (km !== '' && hasPhotos && hasChecklist);
    var btnSave = document.getElementById('sgu-det-btn-save');
    if (btnSave) {
        btnSave.disabled = !valid;
    }
};

// ── GUARDAR FOTOS A S3 ───────────────────────────────────────────
function _sguUploadPhotos(registroId, tipo, cb) {
    var pendientes = (_sguPhotos[tipo] || []).filter(function(p) { return !p.uploaded && p.file; });
    if (!pendientes.length) return cb();

    var archivosMetadata = pendientes.map(function(p) {
        return { nombre: p.file.name || 'foto.jpg', tipo: p.file.type || 'image/jpeg', fase: tipo };
    });

    _sguToast('Preparando subida directa a la nube...', 'bi-cloud-arrow-up');

    fetch('/api/seguridad/unidades/' + registroId + '/fotos/presigned', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + localStorage.getItem('fleet_token')
        },
        body: JSON.stringify({ archivos: archivosMetadata })
    })
    .then(function(r) {
        if (!r.ok) throw new Error('Error solicitando permisos de subida');
        return r.json();
    })
    .then(function(data) {
        var urls = data.urls || [];
        var exitosos = [];
        var promesas = [];

        _sguToast('Subiendo ' + pendientes.length + ' fotos a S3...', 'bi-hourglass-split');

        pendientes.forEach(function(p, i) {
            if (!urls[i]) return;
            var uploadUrl = urls[i].uploadUrl;
            var s3Key = urls[i].key;

            var req = fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': p.file.type || 'image/jpeg' },
                body: p.file
            })
            .then(function(resS3) {
                if (!resS3.ok) throw new Error('Fallo subida a S3');
                p.uploaded = true;
                exitosos.push({ key: s3Key, fase: tipo });
            })
            .catch(function(e) { console.error(e); });

            promesas.push(req);
        });

        return Promise.all(promesas).then(function() { return exitosos; });
    })
    .then(function(exitosos) {
        if (!exitosos.length) {
            _sguToast('Ninguna foto pudo subirse.', 'bi-x-circle');
            return cb();
        }

        return fetch('/api/seguridad/unidades/' + registroId + '/fotos/confirmar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('fleet_token')
            },
            body: JSON.stringify({ exitosos: exitosos })
        })
        .then(function(r) { 
            if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'Error BD'); });
            return r.json(); 
        })
        .then(function() {
            cb();
        });
    })
    .catch(function(e) {
        console.error('Error subida fotos:', e);
        _sguToast(e.message || 'Fallo de subida de fotos', 'bi-exclamation-triangle');
        setTimeout(cb, 2000);
    });
}

// ── GUARDAR SALIDA / RETORNO ─────────────────────────────────────
window._sguSaveRecord = function() {
    var p = document.getElementById('sgu-f-placa').value.toUpperCase().trim();
    var c = document.getElementById('sgu-f-carreta').value.toUpperCase().trim();
    var cond = document.getElementById('sgu-f-conductor').value.trim();
    var dest = document.getElementById('sgu-f-destino').value.trim();
    var km = document.getElementById('sgu-f-km').value.trim();

    var hasAlert = false;
    for (var key in _sguChecklist) { if (_sguChecklist[key] === 'mal') { hasAlert = true; break; } }

    var ts = _sguTimestamp();
    _sguToast('Guardando registro de salida...');
    var btn = document.getElementById('sgu-btn-save');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Guardando...';
    }

    var bodyOut = {
        placa_tracto: p,
        placa_carreta: c,
        conductor: cond,
        destino: dest,
        salida_fecha: ts.date,
        salida_hora: ts.time,
        salida_km: km,
        salida_template_json: _sguGlobalTemplate,
        salida_checklist_json: _sguChecklist,
        salida_has_alert: hasAlert
    };

    _sguFetch('/api/seguridad/unidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyOut)
    })
    .then(function(data) {
        _sguUploadPhotos(data.id, 'salida', function() {
            _sguToast('Salida registrada con éxito');
            _sguLoadRecords(function() { window._sguShowView('list'); });
        });
    })
    .catch(function(e) {
        _sguToast('Error: ' + e.message, 'bi-exclamation-circle');
        window._sguCheckFormReady();
    });
};

window._sguSaveReturn = function() {
    var km = document.getElementById('sgu-det-km-retorno').value.trim();
    var hasAlert = false;
    for (var key in _sguChecklist) { if (_sguChecklist[key] === 'mal') { hasAlert = true; break; } }

    var ts = _sguTimestamp();
    _sguToast('Guardando retorno...');
    var btn = document.getElementById('sgu-det-btn-save');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Guardando...';
    }

    var body = {
        retorno_fecha: ts.date,
        retorno_hora: ts.time,
        retorno_km: km,
        retorno_template_json: _sguGlobalTemplate,
        retorno_checklist_json: _sguChecklist,
        retorno_has_alert: hasAlert,
        estado: 'completado'
    };

    _sguFetch('/api/seguridad/unidades/' + _sguDetailId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    .then(function() {
        _sguUploadPhotos(_sguDetailId, 'retorno', function() {
            _sguToast('Retorno registrado con éxito');
            _sguLoadRecords(function() { window._sguShowView('list'); });
        });
    })
    .catch(function(e) {
        _sguToast('Error: ' + e.message, 'bi-exclamation-circle');
        window._sguCheckReturnReady();
    });
};

// ── AJUSTES (Constructor Dinámico de Checklist) ──────────────────
var _sguEditingTemplate = [];

window._sguOpenSettings = function() {
    _sguEditingTemplate = JSON.parse(JSON.stringify(_sguGlobalTemplate));
    window._sguNav('settings');
};

window._sguRenderSettings = function() {
    var c = document.getElementById('sgu-settings-container');
    if (!c) return;

    if (!_sguEditingTemplate.length) {
        c.innerHTML = '<div class="text-center py-4 text-secondary"><i class="bi bi-grid fs-3 d-block mb-2"></i>No hay categorías. Crea una nueva.</div>';
        return;
    }

    var html = '';
    _sguEditingTemplate.forEach(function(cat, index) {
        html += '<div class="sgu-form-card mb-3">';
        html += '<div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">';
        html += '<div class="d-flex align-items-center gap-2 flex-grow-1 me-2">';
        html += '<span class="badge bg-primary rounded-circle" style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;">' + (index + 1) + '</span>';
        html += '<input type="text" class="sgu-form-input-clean fw-bold text-dark" value="' + cat.titulo + '" onchange="window._sguUpdateSettingsCatTitle(\'' + cat.id + '\', this.value)" placeholder="Nombre de Categoría">';
        html += '</div>';
        html += '<button class="btn btn-sm btn-outline-danger" onclick="window._sguDelSettingsCat(\'' + cat.id + '\')" title="Eliminar Categoría"><i class="bi bi-trash"></i></button>';
        html += '</div>';

        (cat.items || []).forEach(function(item) {
            html += '<div class="d-flex align-items-center justify-content-between gap-2 mb-2 ps-3">';
            html += '<i class="bi bi-dot fs-4 text-secondary"></i>';
            html += '<input type="text" class="sgu-form-input-clean flex-grow-1" style="font-size:0.85rem;" value="' + item.label + '" onchange="window._sguUpdateSettingsItemLabel(\'' + cat.id + '\',\'' + item.id + '\', this.value)" placeholder="Nombre de Subcategoría / Ítem">';
            html += '<button class="btn btn-sm btn-light text-secondary border" onclick="window._sguDelSettingsItem(\'' + cat.id + '\',\'' + item.id + '\')"><i class="bi bi-x"></i></button>';
            html += '</div>';
        });

        html += '<button class="btn btn-sm btn-light border w-100 mt-2 fw-semibold text-secondary" onclick="window._sguAddSettingsItem(\'' + cat.id + '\')">';
        html += '<i class="bi bi-plus-lg me-1"></i> Añadir Subcategoría';
        html += '</button>';
        html += '</div>';
    });

    c.innerHTML = html;
};

window._sguUpdateSettingsCatTitle = function(catId, val) {
    var cat = _sguEditingTemplate.find(function(c) { return c.id === catId; });
    if (cat) cat.titulo = val;
};
window._sguUpdateSettingsItemLabel = function(catId, itemId, val) {
    var cat = _sguEditingTemplate.find(function(c) { return c.id === catId; });
    if (!cat) return;
    var item = (cat.items || []).find(function(i) { return i.id === itemId; });
    if (item) item.label = val;
};

window._sguAddSettingsCat = function() {
    _sguEditingTemplate.push({ id: 'cat_' + Date.now(), titulo: 'Nueva Categoría', items: [] });
    _sguRenderSettings();
};
window._sguDelSettingsCat = function(catId) {
    if (!confirm('¿Eliminar esta categoría completa?')) return;
    _sguEditingTemplate = _sguEditingTemplate.filter(function(c) { return c.id !== catId; });
    _sguRenderSettings();
};

window._sguAddSettingsItem = function(catId) {
    var cat = _sguEditingTemplate.find(function(c) { return c.id === catId; });
    if (!cat) return;
    cat.items = cat.items || [];
    cat.items.push({ id: 'i_' + Date.now(), label: 'Nuevo Ítem de Revisión' });
    _sguRenderSettings();
};
window._sguDelSettingsItem = function(catId, itemId) {
    var cat = _sguEditingTemplate.find(function(c) { return c.id === catId; });
    if (!cat) return;
    cat.items = (cat.items || []).filter(function(i) { return i.id !== itemId; });
    _sguRenderSettings();
};

window._sguSaveSettings = function() {
    _sguToast('Guardando plantilla...');
    _sguFetch('/api/seguridad/template', { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ template: _sguEditingTemplate }) 
    }).then(function() {
        _sguToast('¡Plantilla actualizada con éxito!');
        _sguGlobalTemplate = JSON.parse(JSON.stringify(_sguEditingTemplate));
        window._sguNav('list');
    }).catch(function(e) {
        _sguToast('Error al guardar: ' + e.message, 'bi-exclamation-circle');
    });
};

// =========================================================
// 📸 GALERÍA DE FOTOS
// =========================================================
window._sguVerFotos = function(tipo) {
    if (!window._sguCurrentRecord) return;
    var rec = window._sguCurrentRecord;
    var fotos = (rec.fotos || []).filter(function(f) { return f.tipo === tipo; });

    var container = document.getElementById('sgu-gallery-container');
    if (!container) return;

    if (fotos.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-secondary">No hay evidencias fotográficas registradas en la fase de ' + tipo + '.</div>';
    } else {
        var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;">';
        fotos.forEach(function(f) {
            html += '<a href="' + f.url + '" target="_blank" style="display:block;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 2px 6px rgba(0,0,0,0.04);">';
            html += '<img src="' + f.url + '" style="width:100%;height:130px;object-fit:cover;display:block;" alt="Evidencia" crossorigin="anonymous">';
            html += '</a>';
        });
        html += '</div>';
        container.innerHTML = html;
    }

    var titleEl = document.getElementById('sgu-gallery-title');
    if (titleEl) titleEl.textContent = 'Evidencias Fotográficas — ' + (tipo === 'salida' ? 'Ida' : 'Vuelta');
    document.getElementById('sgu-gallery-overlay').classList.add('show');
};

// =========================================================
// 📝 DETALLES DEL CHECKLIST
// =========================================================
window._sguVerDetalles = function(tipo) {
    if (!window._sguCurrentRecord) return;
    var rec = window._sguCurrentRecord;
    var checklist = tipo === 'salida' ? rec.salida_checklist_json : rec.retorno_checklist_json;
    var template = tipo === 'salida' ? rec.salida_template_json : rec.retorno_template_json;

    var container = document.getElementById('sgu-details-container');
    if (!container) return;

    if (!checklist || Object.keys(checklist).length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-secondary">No se registró checklist en esta fase.</div>';
    } else {
        var html = '<div class="sgu-form-card mb-0">';
        if (template && template.length) {
            template.forEach(function(cat) {
                html += '<div class="mb-3">';
                html += '<h6 class="fw-bold text-dark border-bottom pb-2 mb-2">' + (cat.titulo || 'Categoría') + '</h6>';
                if (cat.items && cat.items.length) {
                    cat.items.forEach(function(item) {
                        var valor = checklist[item.id];
                        var badge = '';
                        if (valor === 'ok') badge = '<span class="badge bg-success">OK / CONFORME</span>';
                        else if (valor === 'na') badge = '<span class="badge bg-secondary">N/A</span>';
                        else if (valor === 'mal') badge = '<span class="badge bg-danger">OBSERVADO</span>';
                        else badge = '<span class="badge bg-light text-dark border">-</span>';

                        html += '<div class="d-flex justify-content-between align-items-center py-1 border-bottom border-light" style="font-size:0.85rem;">';
                        html += '<span class="text-secondary">' + item.label + '</span>';
                        html += '<div>' + badge + '</div>';
                        html += '</div>';
                    });
                }
                html += '</div>';
            });
        }
        html += '</div>';

        var fotos = (rec.fotos || []).filter(function(f) { return f.tipo === tipo; });
        if (fotos.length > 0) {
            html += '<h6 class="fw-bold text-dark mt-3 mb-2">Evidencias Fotográficas (' + fotos.length + ')</h6>';
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;">';
            fotos.forEach(function(f) {
                html += '<a href="' + f.url + '" target="_blank" style="display:block;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">';
                html += '<img src="' + f.url + '" style="width:100%;height:100px;object-fit:cover;display:block;" alt="Evidencia" crossorigin="anonymous">';
                html += '</a>';
            });
            html += '</div>';
        }

        container.innerHTML = html;
    }

    var titleEl = document.getElementById('sgu-details-title');
    if (titleEl) titleEl.textContent = 'Checklist Técnico — ' + (tipo === 'salida' ? 'Ida' : 'Vuelta');
    document.getElementById('sgu-details-overlay').classList.add('show');
};

// =========================================================
// 📄 GENERAR PDF INDIVIDUAL
// =========================================================
window._sguGenerarPDF = async function(tipo) {
    if (!window._sguCurrentRecord) return;
    if (typeof html2pdf === 'undefined') {
        _sguToast('Error: Librería PDF no disponible', 'bi-exclamation-triangle');
        return;
    }

    var rec = window._sguCurrentRecord;
    var checklist = tipo === 'salida' ? rec.salida_checklist_json : rec.retorno_checklist_json;
    var template = tipo === 'salida' ? rec.salida_template_json : rec.retorno_template_json;
    var fecha = tipo === 'salida' ? rec.salida_fecha : rec.retorno_fecha;
    var hora = tipo === 'salida' ? rec.salida_hora : rec.retorno_hora;
    var km = tipo === 'salida' ? rec.salida_km : rec.retorno_km;

    var div = document.createElement('div');
    div.style.width = '750px'; 
    div.style.padding = '30px';
    div.style.fontFamily = '"Plus Jakarta Sans", "Helvetica Neue", Helvetica, Arial, sans-serif';
    div.style.color = '#1e293b';
    div.style.backgroundColor = '#ffffff';
    div.style.boxSizing = 'border-box';

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0284c7;padding-bottom:15px;margin-bottom:25px;">';
    html += '<div>';
    html += '<h1 style="margin:0;font-size:24px;color:#0f172a;letter-spacing:-0.5px;">AZKELL FLEET — ACTA DE INSPECCIÓN</h1>';
    html += '<p style="margin:5px 0 0 0;font-size:13px;color:#64748b;font-weight:bold;text-transform:uppercase;">FASE: ' + tipo.toUpperCase() + '</p>';
    html += '</div>';
    html += '<div style="text-align:right;">';
    html += '<p style="margin:0;font-size:16px;font-weight:bold;color:#0f172a;">ID: ' + rec.id + '</p>';
    html += '<p style="margin:5px 0 0 0;font-size:13px;color:#64748b;">' + (fecha||'--') + ' ' + (hora||'--') + '</p>';
    html += '</div>';
    html += '</div>';

    html += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:15px;margin-bottom:25px;">';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">';
    html += '<div><p style="margin:0;font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Placa Tracto</p><p style="margin:2px 0 0 0;font-size:15px;font-weight:bold;">' + rec.placa_tracto + '</p></div>';
    html += '<div><p style="margin:0;font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Placa Carreta</p><p style="margin:2px 0 0 0;font-size:15px;font-weight:bold;">' + (rec.placa_carreta || '---') + '</p></div>';
    html += '<div><p style="margin:0;font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Conductor</p><p style="margin:2px 0 0 0;font-size:15px;font-weight:bold;">' + rec.conductor + '</p></div>';
    html += '<div><p style="margin:0;font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Kilometraje</p><p style="margin:2px 0 0 0;font-size:15px;font-weight:bold;">' + (km||'---') + '</p></div>';
    html += '</div></div>';

    html += '<h3 style="margin:0 0 15px 0;font-size:16px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Detalle de Revisión Técnica</h3>';
    if (template && template.length && checklist) {
        template.forEach(function(cat) {
            html += '<div style="margin-bottom:15px;break-inside:avoid;">';
            html += '<h4 style="margin:0 0 8px 0;font-size:13px;background:#f1f5f9;padding:6px 10px;border-radius:6px;color:#334155;">' + (cat.titulo || 'Categoría') + '</h4>';
            html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
            if (cat.items) {
                cat.items.forEach(function(item) {
                    var valor = checklist[item.id] || '---';
                    var valStr = valor.toUpperCase();
                    var color = valor === 'ok' ? '#16a34a' : (valor === 'mal' ? '#dc2626' : '#64748b');
                    var bg = valor === 'ok' ? '#dcfce7' : (valor === 'mal' ? '#fee2e2' : '#f1f5f9');
                    html += '<tr style="border-bottom:1px solid #f1f5f9;">';
                    html += '<td style="padding:6px 4px;width:80%;color:#475569;">' + item.label + '</td>';
                    html += '<td style="padding:6px 4px;text-align:right;"><span style="background:'+bg+';color:'+color+';padding:3px 8px;border-radius:12px;font-weight:bold;font-size:11px;">' + valStr + '</span></td>';
                    html += '</tr>';
                });
            }
            html += '</table></div>';
        });
    } else {
        html += '<p style="font-size:13px;color:#64748b;font-style:italic;">No se registró checklist.</p>';
    }

    var fotos = (rec.fotos || []).filter(function(f) { return f.tipo === tipo; });
    var fotosBase64 = [];
    if (fotos.length > 0) {
        _sguToast('Procesando evidencias fotográficas...', 'bi-hourglass-split');
        for (var i = 0; i < fotos.length; i++) {
            try {
                var res = await fetch(fotos[i].url, { mode: 'cors', cache: 'no-store' });
                var blob = await res.blob();
                var b64 = await new Promise(function(resolve) {
                    var r = new FileReader();
                    r.onloadend = function() { resolve(r.result); };
                    r.readAsDataURL(blob);
                });
                fotosBase64.push({ b64: b64, num: i + 1 });
            } catch(e) {
                fotosBase64.push({ b64: fotos[i].url, num: i + 1 });
            }
        }

        html += '<div style="break-inside:avoid;margin-top:20px;">';
        html += '<h3 style="margin:0 0 15px 0;font-size:16px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Evidencias Fotográficas (' + fotos.length + ')</h3>';
        html += '<div style="display:flex;flex-direction:column;gap:20px;">';
        fotosBase64.forEach(function(f) {
            html += '<div style="text-align:center;border:1px solid #e2e8f0;padding:12px;border-radius:8px;background:#f8fafc;break-inside:avoid;">';
            html += '<h4 style="margin:0 0 8px 0;font-size:13px;color:#334155;font-weight:bold;">Evidencia ' + f.num + '</h4>';
            html += '<img src="' + f.b64 + '" style="max-width:100%;height:auto;display:block;margin:0 auto;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.06);" crossorigin="anonymous">';
            html += '</div>';
        });
        html += '</div></div>';
    }

    div.innerHTML = html;

    var opt = {
        margin:       [10, 10, 10, 10],
        filename:     'Checklist_' + rec.placa_tracto + '_' + tipo + '.pdf',
        image:        { type: 'jpeg', quality: 1.0 },
        html2canvas:  { scale: 2.5, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    _sguToast('Generando PDF...', 'bi-hourglass-split');
    html2pdf().set(opt).from(div).save().then(function() {
        _sguToast('PDF descargado correctamente.');
    });
};

// =========================================================
// 📄 GENERAR PDF COMPLETO (IDA Y VUELTA)
// =========================================================
window._sguGenerarPDFCompleto = async function() {
    if (typeof html2pdf === 'undefined') {
        _sguToast('Error: Librería PDF no disponible', 'bi-exclamation-triangle');
        return;
    }

    if (!window._sguCurrentRecord) return;
    var rec = window._sguCurrentRecord;

    var div = document.createElement('div');
    div.style.width = '750px'; 
    div.style.padding = '30px';
    div.style.fontFamily = '"Plus Jakarta Sans", "Helvetica Neue", Helvetica, Arial, sans-serif';
    div.style.color = '#1e293b';
    div.style.backgroundColor = '#ffffff';
    div.style.boxSizing = 'border-box';

    function buildTable(tipo) {
        var fecha = tipo === 'salida' ? rec.salida_fecha : rec.retorno_fecha;
        var hora = tipo === 'salida' ? rec.salida_hora : rec.retorno_hora;
        var km = tipo === 'salida' ? rec.salida_km : rec.retorno_km;
        var checklist = tipo === 'salida' ? rec.salida_checklist_json : rec.retorno_checklist_json;
        var template = tipo === 'salida' ? rec.salida_template_json : rec.retorno_template_json;

        var html = '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0284c7;padding-bottom:15px;margin-bottom:20px;">';
        html += '<div>';
        html += '<h1 style="margin:0;font-size:22px;color:#0f172a;letter-spacing:-0.5px;">EXPEDIENTE DE VIAJE — ' + tipo.toUpperCase() + '</h1>';
        html += '<p style="margin:4px 0 0 0;font-size:13px;color:#64748b;font-weight:bold;">AZKELL FLEET ERP</p>';
        html += '</div>';
        html += '<div style="text-align:right;">';
        html += '<p style="margin:0;font-size:15px;font-weight:bold;color:#0f172a;">FOLIO: ' + rec.id + '</p>';
        html += '<p style="margin:4px 0 0 0;font-size:12px;color:#64748b;">' + (fecha||'--') + ' ' + (hora||'--') + '</p>';
        html += '</div>';
        html += '</div>';

        html += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:20px;">';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
        html += '<div><p style="margin:0;font-size:10px;color:#64748b;font-weight:bold;text-transform:uppercase;">Placa Tracto</p><p style="margin:2px 0 0 0;font-size:14px;font-weight:bold;">' + rec.placa_tracto + '</p></div>';
        html += '<div><p style="margin:0;font-size:10px;color:#64748b;font-weight:bold;text-transform:uppercase;">Placa Carreta</p><p style="margin:2px 0 0 0;font-size:14px;font-weight:bold;">' + (rec.placa_carreta || '---') + '</p></div>';
        html += '<div><p style="margin:0;font-size:10px;color:#64748b;font-weight:bold;text-transform:uppercase;">Conductor</p><p style="margin:2px 0 0 0;font-size:14px;font-weight:bold;">' + rec.conductor + '</p></div>';
        html += '<div><p style="margin:0;font-size:10px;color:#64748b;font-weight:bold;text-transform:uppercase;">Kilometraje</p><p style="margin:2px 0 0 0;font-size:14px;font-weight:bold;">' + (km||'---') + '</p></div>';
        html += '</div></div>';

        html += '<h4 style="margin:0 0 12px 0;font-size:15px;color:#0f172a;border-bottom:1.5px solid #e2e8f0;padding-bottom:6px;">Detalle de Revisión</h4>';
        if (template && template.length && checklist) {
            template.forEach(function(cat) {
                html += '<div style="margin-bottom:12px;break-inside:avoid;">';
                html += '<h5 style="margin:0 0 6px 0;font-size:12px;background:#f1f5f9;padding:5px 8px;border-radius:4px;color:#334155;">' + (cat.titulo || 'Categoría') + '</h5>';
                html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
                if (cat.items) {
                    cat.items.forEach(function(item) {
                        var valor = checklist[item.id] || '---';
                        var valStr = valor.toUpperCase();
                        var color = valor === 'ok' ? '#16a34a' : (valor === 'mal' ? '#dc2626' : '#64748b');
                        var bg = valor === 'ok' ? '#dcfce7' : (valor === 'mal' ? '#fee2e2' : '#f1f5f9');
                        html += '<tr style="border-bottom:1px solid #f1f5f9;">';
                        html += '<td style="padding:4px;width:80%;color:#475569;">' + item.label + '</td>';
                        html += '<td style="padding:4px;text-align:right;"><span style="background:'+bg+';color:'+color+';padding:2px 6px;border-radius:10px;font-weight:bold;font-size:10px;">' + valStr + '</span></td>';
                        html += '</tr>';
                    });
                }
                html += '</table></div>';
            });
        } else {
            html += '<p style="font-size:12px;color:#64748b;font-style:italic;">No se registró checklist.</p>';
        }

        var fotos = (rec.fotos || []).filter(function(f) { return f.tipo === tipo; });
        return { html: html, fotos: fotos };
    }

    var salidaData = buildTable('salida');
    var retornoData = buildTable('retorno');

    var todasFotos = salidaData.fotos.concat(retornoData.fotos);
    var fotosMap = {};

    if (todasFotos.length > 0) {
        _sguToast('Preparando imágenes...', 'bi-hourglass-split');
        for (var i = 0; i < todasFotos.length; i++) {
            var url = todasFotos[i].url;
            if (fotosMap[url]) continue;
            try {
                var res = await fetch(url, { mode: 'cors', cache: 'no-store' });
                var blob = await res.blob();
                var b64 = await new Promise(function(resolve) {
                    var r = new FileReader();
                    r.onloadend = function() { resolve(r.result); };
                    r.readAsDataURL(blob);
                });
                fotosMap[url] = b64;
            } catch(e) {
                fotosMap[url] = url;
            }
        }
    }

    function buildFotosHtml(fotosArray) {
        if (!fotosArray || fotosArray.length === 0) return '';
        var h = '<div style="break-inside:avoid;margin-top:15px;">';
        h += '<h4 style="margin:0 0 10px 0;font-size:14px;color:#0f172a;border-bottom:1.5px solid #e2e8f0;padding-bottom:6px;">Evidencias Fotográficas (' + fotosArray.length + ')</h4>';
        h += '<div style="display:flex;flex-direction:column;gap:15px;margin-bottom:15px;">';
        fotosArray.forEach(function(f, index) {
            h += '<div style="text-align:center;border:1px solid #e2e8f0;padding:10px;border-radius:6px;background:#f8fafc;break-inside:avoid;">';
            h += '<h5 style="margin:0 0 6px 0;font-size:12px;color:#334155;">Evidencia ' + (index + 1) + '</h5>';
            h += '<img src="' + fotosMap[f.url] + '" style="max-width:100%;height:auto;display:block;margin:0 auto;border-radius:4px;" crossorigin="anonymous">';
            h += '</div>';
        });
        h += '</div></div>';
        return h;
    }

    var htmlFinal = salidaData.html + buildFotosHtml(salidaData.fotos);
    htmlFinal += '<div class="html2pdf__page-break"></div>';
    htmlFinal += retornoData.html + buildFotosHtml(retornoData.fotos);

    div.innerHTML = htmlFinal;

    var opt = {
        margin:       [10, 10, 10, 10],
        filename:     'Expediente_Completo_' + rec.placa_tracto + '.pdf',
        image:        { type: 'jpeg', quality: 1.0 },
        html2canvas:  { scale: 2.5, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    _sguToast('Generando Expediente PDF...', 'bi-hourglass-split');
    html2pdf().set(opt).from(div).save().then(function() {
        _sguToast('Expediente descargado con éxito.');
    });
};

// =========================================================
// 🗑️ ELIMINAR REGISTRO
// =========================================================
window._sguDeleteRecord = function(id) {
    if (!confirm('¿Está seguro de eliminar este expediente? Esta acción borrará el registro y todas sus fotos en la nube.')) return;

    _sguToast('Eliminando expediente...', 'bi-hourglass-split');
    fetch('/api/seguridad/unidades/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('fleet_token') }
    }).then(function(r) {
        if(!r.ok) throw new Error('Error al eliminar');
        return r.json();
    }).then(function() {
        _sguToast('Expediente eliminado');
        _sguLoadRecords(function() {
            window._sguNav('list');
        });
    }).catch(function(e) {
        _sguToast(e.message, 'bi-exclamation-circle');
    });
};
