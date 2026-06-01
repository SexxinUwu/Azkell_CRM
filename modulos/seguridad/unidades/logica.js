// ================================================================
// 🛡️ MÓDULO SEGURIDAD: UNIDADES (Checklist) — Lógica Aislada
// ================================================================

// ── ESTADO ───────────────────────────────────────────────────────
var _sguView = 'list';
var _sguRecords = [];
var _sguDetailId = null;
var _sguGlobalTemplate = [];
var _sguChecklist = {};
var _sguPhotos = { salida: [], retorno: [] };
var _sguEditMode = 'salida';

// ── HELPERS ──────────────────────────────────────────────────────
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
    t.style.cssText = 'position:fixed;top:1rem;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:.65rem 1.25rem;border-radius:50px;font-size:.85rem;font-weight:700;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;align-items:center;gap:.5rem;';
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
    _sguView = 'list';
    _sguLoadResources();
    _sguLoadTemplate(function() {
        _sguLoadRecords(function() {
            window._sguShowView('list');
        });
    });
};

var _sguRecursos = { placas: [], conductores: [] };

function _sguLoadResources() {
    _sguFetch('/api/seguridad/recursos').then(function(data) {
        if (data.placas) _sguRecursos.placas = data.placas;
        if (data.conductores) _sguRecursos.conductores = data.conductores;
    }).catch(function(){}); // Ignorar si falla
}

// ── CUSTOM AUTOCOMPLETE LOGIC ────────────────────────────────────
window._sguHandleAutoInput = function(input, type) {
    // Hide all other lists first
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

    // Limit to top 50 to prevent huge DOM if lists are too large
    filtered = filtered.slice(0, 50);

    var html = '';
    if (filtered.length === 0) {
        html = '<div class="sgu-autocomplete-empty">No se encontraron resultados...</div>';
    } else {
        filtered.forEach(function(item) {
            // Escape quotes for onclick
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

// Close autocomplete lists when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.sgu-autocomplete-wrap')) {
        var lists = document.querySelectorAll('.sgu-autocomplete-list');
        lists.forEach(function(l) { l.classList.remove('show'); });
    }
});

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

// ── NAVEGACIÓN ───────────────────────────────────────────────────
window._sguNav = function(view, id) { window._sguShowView(view, id); };

window._sguShowView = function(view, id) {
    _sguView = view;
    if (id) _sguDetailId = id;
    ['sgu-list', 'sgu-form', 'sgu-detail', 'sgu-settings'].forEach(function(v) {
        var el = document.getElementById(v);
        if (el) el.style.display = 'none';
    });
    var target = document.getElementById('sgu-' + view);
    if (target) target.style.display = 'block';

    if (view === 'list') { _sguRenderList(); }
    else if (view === 'form') { _sguInitForm(); }
    else if (view === 'detail') { _sguRenderDetail(id); }
    else if (view === 'settings') { _sguRenderSettings(); }
};

var _sguActiveTab = 'activos';
window._sguSetTab = function(tab) {
    _sguActiveTab = tab;
    document.getElementById('sgu-tab-activos').classList.remove('active');
    document.getElementById('sgu-tab-historial').classList.remove('active');
    document.getElementById('sgu-tab-' + tab).classList.add('active');
    _sguRenderList();
};
window._sguFilterList = function() { _sguRenderList(); };

// ── RENDER LISTA ─────────────────────────────────────────────────
function _sguRenderList() {
    var container = document.getElementById('sgu-records-list');
    if (!container) return;

    var actCount = _sguRecords.filter(function(r) { return r.estado === 'en_ruta'; }).length;
    var elCount = document.getElementById('sgu-count-ruta');
    if (elCount) elCount.textContent = actCount;

    var search = (document.getElementById('sgu-search') || {}).value || '';
    search = search.toLowerCase().trim();

    var filtered = _sguRecords.filter(function(r) {
        if (_sguActiveTab === 'activos' && r.estado !== 'en_ruta') return false;
        if (_sguActiveTab === 'historial' && r.estado !== 'completado') return false;
        if (!search) return true;
        return (r.placa_tracto || '').toLowerCase().indexOf(search) >= 0 ||
               (r.conductor || '').toLowerCase().indexOf(search) >= 0 ||
               (r.destino || '').toLowerCase().indexOf(search) >= 0;
    });

    if (!filtered.length) {
        container.innerHTML = '<div class="sgu-empty"><i class="bi bi-inbox" style="font-size:2rem;display:block;margin-bottom:.5rem;"></i>No se encontraron resultados.</div>';
        return;
    }

    var html = '';
    filtered.forEach(function(rec) {
        var isEnRuta = rec.estado === 'en_ruta';
        var hasAlert = rec.salida_has_alert || rec.retorno_has_alert;
        var alertBadge = hasAlert ? '<div class="sgu-list-card-alert"><i class="bi bi-exclamation-triangle"></i></div>' : '';
        var color = isEnRuta ? '#2563eb' : '#64748b';
        var bg = isEnRuta ? '#eff6ff' : '#f1f5f9';
        
        html += '<div class="sgu-list-card">' +
            '<div class="sgu-list-card-border" style="background:' + color + ';"></div>' +
            '<div class="sgu-list-card-icon" style="color:' + color + ';background:' + bg + ';">' +
                '<i class="bi bi-truck"></i>' + alertBadge +
            '</div>' +
            '<div class="sgu-list-card-info">' +
                '<h4 class="sgu-list-card-title">' + rec.placa_tracto + (rec.placa_carreta ? ' / ' + rec.placa_carreta : '') + '</h4>' +
                '<p class="sgu-list-card-subtitle">' + (isEnRuta ? 'Salió a: ' : 'Completado: ') + (rec.destino || '---') + '</p>' +
            '</div>' +
            '<button class="sgu-btn-ingresar" onclick="window._sguShowView(\'detail\',\'' + rec.id + '\')">Ingresar</button>' +
        '</div>';
    });
    container.innerHTML = html;
}

// ── FORM: NUEVA SALIDA ───────────────────────────────────────────
function _sguInitForm() {
    _sguEditMode = 'salida';
    _sguChecklist = {};
    _sguPhotos = { salida: [], retorno: [] };
    
    document.getElementById('sgu-form-title').textContent = 'Salida Unidad';
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

    var p = document.getElementById('sgu-f-placa').value.trim();
    var c = document.getElementById('sgu-f-conductor').value.trim();
    var d = document.getElementById('sgu-f-destino').value.trim();
    var k = document.getElementById('sgu-f-km').value.trim();
    
    var photosList = _sguPhotos['salida'] || [];
    var hasPhotos = photosList.length > 0;
    var btnPhotos = document.getElementById('sgu-btn-open-photos');
    if (btnPhotos) {
        if (hasPhotos) {
            btnPhotos.textContent = photosList.length + ' Foto(s)';
            btnPhotos.classList.add('done');
        } else {
            btnPhotos.textContent = 'Añadir';
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
            btnChk.textContent = 'Lleno';
            btnChk.classList.add('done');
        } else {
            btnChk.textContent = 'Llenar';
            btnChk.classList.remove('done');
        }
    }

    var valid = (p !== '' && c !== '' && d !== '' && k !== '' && hasPhotos && hasChecklist);
    var btnSave = document.getElementById('sgu-btn-save');
    if (btnSave) {
        if (valid) {
            btnSave.disabled = false;
            btnSave.classList.add('ready');
        } else {
            btnSave.disabled = true;
            btnSave.classList.remove('ready');
        }
    }
};

// ── OVERLAYS: CHECKLIST & FOTOS ──────────────────────────────────
window._sguOpenChecklist = function() {
    document.getElementById('sgu-chk-overlay-title').textContent = _sguEditMode === 'retorno' ? 'Checklist Ingreso' : 'Checklist Salida';
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
    _sguToast('Fotos añadidas');
    window._sguCheckFormReady();
}

// ── RENDER CHECKLIST (Rediseñado) ────────────────────────────────
function _sguRenderChecklist() {
    var container = document.getElementById('sgu-checklist-container');
    if (!container) return;

    var html = '<div class="sgu-alert-box"><i class="bi bi-info-circle"></i> Marque todos los campos. Utilice "X" si reporta observaciones o daños.</div>';

    _sguGlobalTemplate.forEach(function(cat) {
        html += '<div class="sgu-chk-cat">';
        html += '<div class="sgu-chk-cat-header">';
        html += '<h4 class="sgu-chk-cat-title">' + cat.titulo + '</h4>';
        html += '<button class="sgu-btn-all-ok" onclick="window._sguSetCatCheck(\''+cat.id+'\')"><i class="bi bi-check2"></i> Todo OK</button>';
        html += '</div>';

        (cat.items || []).forEach(function(item) {
            var val = _sguChecklist[item.id] || '';
            html += '<div class="sgu-chk-item">';
            html += '<span class="sgu-chk-label">' + item.label + '</span>';
            html += '<div class="sgu-chk-actions">';
            html += '<div class="sgu-chk-circle x ' + (val==='mal'?'active':'') + '" onclick="window._sguSetCheck(\''+item.id+'\',\'mal\')"><i class="bi bi-x-lg"></i></div>';
            html += '<div class="sgu-chk-circle na ' + (val==='na'?'active':'') + '" onclick="window._sguSetCheck(\''+item.id+'\',\'na\')">N/A</div>';
            html += '<div class="sgu-chk-circle ok ' + (val==='ok'?'active':'') + '" onclick="window._sguSetCheck(\''+item.id+'\',\'ok\')"><i class="bi bi-check-lg"></i></div>';
            html += '</div></div>';
        });
        html += '</div>';
    });
    container.innerHTML = html;
}

window._sguSetCheck = function(itemId, valor) {
    _sguChecklist[itemId] = valor;
    _sguRenderChecklist();
};

window._sguSetCatCheck = function(catId) {
    var cat = _sguGlobalTemplate.find(function(c) { return c.id === catId; });
    if (cat && cat.items) {
        cat.items.forEach(function(item) { _sguChecklist[item.id] = 'ok'; });
    }
    _sguRenderChecklist();
};

// ── RENDER DETALLE (Rediseñado) ──────────────────────────────────
function _sguRenderDetail(recordId) {
    var container = document.getElementById('sgu-detail-content');
    if (!container) return;

    var rec = _sguRecords.find(function(r) { return r.id === recordId; });
    if (!rec) return;

    var isEnRuta = rec.estado === 'en_ruta';
    _sguEditMode = isEnRuta ? 'retorno' : 'ver';
    if (isEnRuta) {
        _sguChecklist = {};
        _sguPhotos.retorno = [];
    }

    var badgeEl = document.getElementById('sgu-det-head-badge');
    var placaEl = document.getElementById('sgu-det-head-placa');
    var condEl  = document.getElementById('sgu-det-head-cond');
    
    placaEl.textContent = rec.placa_tracto + (rec.placa_carreta ? ' / ' + rec.placa_carreta : '');
    condEl.textContent = rec.conductor;
    
    if (isEnRuta) {
        badgeEl.textContent = 'EN RUTA';
        badgeEl.className = 'sgu-badge-header en-ruta';
    } else {
        badgeEl.textContent = 'COMPLETADO';
        badgeEl.className = 'sgu-badge-header completado';
    }

    var html = '';

    if (rec.salida_has_alert || rec.retorno_has_alert) {
        html += '<div class="sgu-det-alert"><i class="bi bi-exclamation-triangle"></i><div><h4>Alerta en Expediente</h4><p>Este viaje presentó observaciones en la documentación o estado físico del vehículo.</p></div></div>';
    }

    if (isEnRuta) {
        // Tarjeta Registrar Llegada
        html += '<div class="sgu-det-card sgu-det-card-primary">';
        html += '<h3 class="sgu-det-card-title" style="color:#1e40af;"><i class="bi bi-arrow-left-circle text-primary"></i> Registrar Llegada</h3>';
        html += '<div class="sgu-form-group" style="margin-bottom:1.5rem;">';
        html += '<label class="sgu-form-label">KM LLEGADA</label>';
        html += '<input type="number" class="sgu-form-input" id="sgu-det-km-retorno" placeholder="Ingrese KM" oninput="window._sguCheckFormReady()">';
        html += '<div class="sgu-form-line"></div></div>';
        
        html += '<div class="sgu-section-title">Tareas Obligatorias</div>';
        html += '<div class="sgu-task-card"><div class="sgu-task-icon-wrap" style="background:#eff6ff;"><i class="bi bi-camera sgu-task-icon" style="color:#2563eb;"></i></div>';
        html += '<div class="sgu-task-info"><h4 class="sgu-task-title">Fotos Llegada</h4><p class="sgu-task-desc">Tome fotos.</p></div>';
        html += '<button class="sgu-btn-task" id="sgu-det-btn-fotos" onclick="window._sguOpenPhotosChooser(\'retorno\')">Añadir</button></div>';

        html += '<div class="sgu-task-card"><div class="sgu-task-icon-wrap" style="background:#fef3c7;"><i class="bi bi-clipboard-check sgu-task-icon" style="color:#d97706;"></i></div>';
        html += '<div class="sgu-task-info"><h4 class="sgu-task-title">Checklist Ingreso</h4><p class="sgu-task-desc">Revisión requerida.</p></div>';
        html += '<button class="sgu-btn-task" id="sgu-det-btn-chk" onclick="window._sguOpenChecklist()">Llenar</button></div>';

        html += '<button class="sgu-btn-submit" id="sgu-det-btn-save" onclick="window._sguSaveReturn()" disabled><i class="bi bi-check-circle"></i> Cerrar Expediente</button>';
        html += '</div>';

    } else {
        // Tarjetas Viaje Completado + Retorno
        html += '<div class="sgu-det-card sgu-det-card-dark" style="display:flex;flex-direction:column;align-items:center;padding:1.5rem;">';
        html += '<h3 class="sgu-det-card-title"><i class="bi bi-file-earmark-check"></i> Viaje Completado</h3>';
        html += '<button style="width:100%;padding:.8rem;border-radius:12px;border:none;background:#2563eb;color:#fff;font-weight:700;"><i class="bi bi-download"></i> Descargar Viaje (Ida y Vuelta PDF)</button>';
        html += '</div>';

        html += '<div class="sgu-det-card">';
        html += '<h3 class="sgu-det-card-title"><i class="bi bi-arrow-left-circle"></i> RETORNO (VUELTA)</h3>';
        html += '<div class="sgu-det-row">';
        html += '<div class="sgu-det-col"><div class="sgu-det-label">LLEGADA</div><div class="sgu-det-value">' + (rec.retorno_hora||'---') + '</div></div>';
        html += '<div class="sgu-det-col"><div class="sgu-det-label">KM FINAL</div><div class="sgu-det-value">' + (rec.retorno_km||'---') + '</div></div>';
        html += '</div>';
        html += '<div class="sgu-det-actions">';
        html += '<div class="sgu-det-action-btn" style="color:#2563eb;" onclick="_sguToast(\'Ver detalles proximamente\')"><i class="bi bi-eye"></i> Detalles</div>';
        html += '<div class="sgu-det-action-btn" style="color:#10b981;" onclick="_sguToast(\'Ver PDF proximamente\')"><i class="bi bi-file-earmark-text"></i> PDF (Vuelta)</div>';
        html += '<div class="sgu-det-action-btn" style="color:#ea580c;" onclick="_sguToast(\'Fotos en consola\')"><i class="bi bi-image"></i> Fotos ('+rec.fotos.filter(function(f){return f.tipo==='retorno';}).length+')</div>';
        html += '</div></div>';
    }

    // Tarjeta Salida (Para ambos casos)
    html += '<div class="sgu-det-card">';
    html += '<h3 class="sgu-det-card-title"><i class="bi bi-arrow-right-circle"></i> SALIDA (IDA)</h3>';
    html += '<div class="sgu-det-row">';
    html += '<div class="sgu-det-col"><div class="sgu-det-label">SALIDA</div><div class="sgu-det-value">' + (rec.salida_hora||'---') + '</div></div>';
    html += '<div class="sgu-det-col"><div class="sgu-det-label">KM INICIAL</div><div class="sgu-det-value">' + (rec.salida_km||'---') + '</div></div>';
    html += '</div>';
    html += '<div class="sgu-det-actions">';
    html += '<div class="sgu-det-action-btn" style="color:#2563eb;" onclick="_sguToast(\'Ver detalles proximamente\')"><i class="bi bi-eye"></i> Detalles</div>';
    html += '<div class="sgu-det-action-btn" style="color:#10b981;" onclick="_sguToast(\'Ver PDF proximamente\')"><i class="bi bi-file-earmark-text"></i> PDF (Ida)</div>';
    html += '<div class="sgu-det-action-btn" style="color:#ea580c;" onclick="_sguToast(\'Fotos en consola\')"><i class="bi bi-image"></i> Fotos ('+rec.fotos.filter(function(f){return f.tipo==='salida';}).length+')</div>';
    html += '</div></div>';

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
        if (hasPhotos) { btnFotos.textContent = photosList.length + ' Foto(s)'; btnFotos.classList.add('done'); }
        else { btnFotos.textContent = 'Añadir'; btnFotos.classList.remove('done'); }
    }

    var chkCount = Object.keys(_sguChecklist).length;
    var totalItems = 0;
    _sguGlobalTemplate.forEach(function(cat) { totalItems += (cat.items || []).length; });
    var hasChecklist = totalItems > 0 && chkCount === totalItems;
    var btnChk = document.getElementById('sgu-det-btn-chk');
    if (btnChk) {
        if (hasChecklist) { btnChk.textContent = 'Lleno'; btnChk.classList.add('done'); }
        else { btnChk.textContent = 'Llenar'; btnChk.classList.remove('done'); }
    }

    var valid = (km !== '' && hasPhotos && hasChecklist);
    var btnSave = document.getElementById('sgu-det-btn-save');
    if (btnSave) {
        if (valid) { btnSave.disabled = false; btnSave.classList.add('ready'); }
        else { btnSave.disabled = true; btnSave.classList.remove('ready'); }
    }
};

// ── GUARDAR FOTOS A S3 ───────────────────────────────────────────
function _sguUploadPhotos(registroId, tipo, cb) {
    var pendientes = (_sguPhotos[tipo] || []).filter(function(p) { return !p.uploaded && p.file; });
    if (!pendientes.length) return cb();

    var uploaded = 0;
    pendientes.forEach(function(p) {
        var formData = new FormData();
        formData.append('foto', p.file);
        formData.append('tipo', tipo);

        fetch('/api/seguridad/unidades/' + registroId + '/fotos', { method: 'POST', body: formData })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            p.uploaded = true; p.url = data.url; uploaded++;
            if (uploaded >= pendientes.length) cb();
        }).catch(function() {
            uploaded++; if (uploaded >= pendientes.length) cb();
        });
    });
}

// ── GUARDAR SALIDA / RETORNO ─────────────────────────────────────
window._sguSaveRecord = function() {
    var p = document.getElementById('sgu-f-placa').value.toUpperCase();
    var c = document.getElementById('sgu-f-carreta').value.toUpperCase();
    var cond = document.getElementById('sgu-f-conductor').value;
    var dest = document.getElementById('sgu-f-destino').value;
    var km = document.getElementById('sgu-f-km').value;

    var hasAlert = false;
    for (var key in _sguChecklist) { if (_sguChecklist[key] === 'mal') { hasAlert = true; break; } }

    var ts = _sguTimestamp();
    _sguToast('Guardando salida...');
    document.getElementById('sgu-btn-save').disabled = true;
    document.getElementById('sgu-btn-save').innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Procesando...';

    var regId = 'REQ-' + Date.now();
    var bodyOut = { id: regId, placa_tracto: p, placa_carreta: c, conductor: cond, destino: dest, salida_fecha: ts.date, salida_hora: ts.time, salida_km: km, salida_template_json: _sguGlobalTemplate, salida_checklist_json: _sguChecklist, salida_has_alert: hasAlert };
    
    _sguFetch('/api/seguridad/unidades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyOut) })
    .then(function(data) {
        _sguUploadPhotos(data.id, 'salida', function() {
            _sguToast('Salida guardada exitosamente');
            _sguLoadRecords(function() { window._sguShowView('list'); });
        });
    }).catch(function(e) { _sguToast('Error: ' + e.message, 'bi-exclamation-circle'); window._sguCheckFormReady(); });
};

window._sguSaveReturn = function() {
    var km = document.getElementById('sgu-det-km-retorno').value;
    var hasAlert = false;
    for (var key in _sguChecklist) { if (_sguChecklist[key] === 'mal') { hasAlert = true; break; } }

    var ts = _sguTimestamp();
    _sguToast('Guardando llegada...');
    document.getElementById('sgu-det-btn-save').disabled = true;
    document.getElementById('sgu-det-btn-save').innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Procesando...';

    var body = { retorno_fecha: ts.date, retorno_hora: ts.time, retorno_km: km, retorno_template_json: _sguGlobalTemplate, retorno_checklist_json: _sguChecklist, retorno_has_alert: hasAlert, estado: 'completado' };
    
    _sguFetch('/api/seguridad/unidades/' + _sguDetailId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function() {
        _sguUploadPhotos(_sguDetailId, 'retorno', function() {
            _sguToast('Retorno guardado exitosamente');
            _sguLoadRecords(function() { window._sguShowView('list'); });
        });
    }).catch(function(e) { _sguToast('Error: ' + e.message, 'bi-exclamation-circle'); window._sguCheckReturnReady(); });
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
        c.innerHTML = '<div class="sgu-empty"><i class="bi bi-grid" style="font-size:2rem;display:block;margin-bottom:.5rem;"></i>No hay categorías. Crea una.</div>';
        return;
    }

    var html = '';
    _sguEditingTemplate.forEach(function(cat, index) {
        html += '<div class="sgu-set-cat">';
        html += '<div class="sgu-set-cat-header">';
        html += '<div class="sgu-set-cat-title-wrap">';
        html += '<div class="sgu-set-cat-num">' + (index + 1) + '</div>';
        html += '<input type="text" class="sgu-set-cat-title" value="' + cat.titulo + '" onchange="window._sguUpdateSettingsCatTitle(\''+cat.id+'\', this.value)" placeholder="Nombre Categoría">';
        html += '</div>';
        html += '<button class="sgu-btn-del-cat" onclick="window._sguDelSettingsCat(\''+cat.id+'\')"><i class="bi bi-trash"></i></button>';
        html += '</div>';

        (cat.items || []).forEach(function(item) {
            html += '<div class="sgu-set-item">';
            html += '<input type="text" class="sgu-set-item-input" value="' + item.label + '" onchange="window._sguUpdateSettingsItemLabel(\''+cat.id+'\',\''+item.id+'\', this.value)" placeholder="Nombre Subcategoría">';
            html += '<button class="sgu-btn-del-item" onclick="window._sguDelSettingsItem(\''+cat.id+'\',\''+item.id+'\')"><i class="bi bi-x"></i></button>';
            html += '</div>';
        });

        html += '<button class="sgu-btn-add-item" onclick="window._sguAddSettingsItem(\''+cat.id+'\')">';
        html += '<i class="bi bi-plus"></i> Añadir Subcategoría';
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
    cat.items.push({ id: 'i_' + Date.now(), label: 'Nueva Subcategoría' });
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
        _sguToast('¡Plantilla actualizada!');
        _sguGlobalTemplate = JSON.parse(JSON.stringify(_sguEditingTemplate));
        window._sguNav('list');
    }).catch(function(e) {
        _sguToast('Error al guardar: ' + e.message, 'bi-exclamation-circle');
    });
};
