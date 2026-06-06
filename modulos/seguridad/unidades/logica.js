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
    // Fallback: check permisos.admin flag
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

window._sguOpenScanner = function() {
    if (typeof window._abrirEscaner === 'function') {
        window._abrirEscaner(function(valor) {
            var el = document.getElementById('sgu-f-placa');
            if (el) {
                el.value = valor;
                window._sguHandleAutoInput(el, 'placas');
            }
        }, 'Escanear QR de Unidad');
    } else {
        _sguToast('Función de escáner no disponible', 'bi-qr-code-scan');
    }
};

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
        var isAdmin = _sguIsAdmin();
        var deleteBtn = isAdmin ? '<button class="sgu-btn-eliminar-card" onclick="event.stopPropagation(); window._sguDeleteRecord(\'' + rec.id + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>' : '';
        var btnText = isEnRuta ? 'Ingresar' : 'Ver Resumen';

        html += '<div class="sgu-list-card">' +
            '<div class="sgu-list-card-border" style="background:' + color + ';"></div>' +
            '<div class="sgu-list-card-icon" style="color:' + color + ';background:' + bg + ';">' +
                '<i class="bi bi-truck"></i>' + alertBadge +
            '</div>' +
            '<div class="sgu-list-card-info">' +
                '<h4 class="sgu-list-card-title">' + rec.placa_tracto + (rec.placa_carreta ? ' / ' + rec.placa_carreta : '') + '</h4>' +
                '<p class="sgu-list-card-subtitle">' + (isEnRuta ? 'Salió a: ' : 'Completado: ') + (rec.destino || '---') + '</p>' +
            '</div>' +
            '<div class="sgu-list-card-actions" style="display:flex; gap:8px; align-items:center;">' +
                '<button class="sgu-btn-ingresar" onclick="window._sguShowView(\'detail\',\'' + rec.id + '\')">' + btnText + '</button>' +
                deleteBtn +
            '</div>' +
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
    
    // Asignar a variable global para los modales de Fotos, Detalles y PDF
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
        html += '<button style="width:100%;padding:.8rem;border-radius:12px;border:none;background:#2563eb;color:#fff;font-weight:700;" onclick="window._sguGenerarPDFCompleto()"><i class="bi bi-download"></i> Descargar Viaje (Ida y Vuelta PDF)</button>';
        if (_sguIsAdmin()) {
            html += '<button style="width:100%;padding:.8rem;border-radius:12px;border:none;background:#ef4444;color:#fff;font-weight:700;margin-top:10px;" onclick="window._sguDeleteRecord(\'' + rec.id + '\')"><i class="bi bi-trash"></i> Eliminar Expediente</button>';
        }
        html += '</div>';

        html += '<div class="sgu-det-card">';
        html += '<h3 class="sgu-det-card-title"><i class="bi bi-arrow-left-circle"></i> RETORNO (VUELTA)</h3>';
        html += '<div class="sgu-det-row">';
        html += '<div class="sgu-det-col"><div class="sgu-det-label">LLEGADA</div><div class="sgu-det-value">' + (rec.retorno_hora||'---') + '</div></div>';
        html += '<div class="sgu-det-col"><div class="sgu-det-label">KM FINAL</div><div class="sgu-det-value">' + (rec.retorno_km||'---') + '</div></div>';
        html += '</div>';
        html += '<div class="sgu-det-actions">';
        html += '<div class="sgu-det-action-btn" style="color:#2563eb;" onclick="window._sguVerDetalles(\'retorno\')"><i class="bi bi-eye"></i> Detalles</div>';
        html += '<div class="sgu-det-action-btn" style="color:#10b981;" onclick="window._sguGenerarPDF(\'retorno\')"><i class="bi bi-file-earmark-text"></i> PDF (Vuelta)</div>';
        html += '<div class="sgu-det-action-btn" style="color:#ea580c;" onclick="window._sguVerFotos(\'retorno\')"><i class="bi bi-image"></i> Fotos ('+rec.fotos.filter(function(f){return f.tipo==='retorno';}).length+')</div>';
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
    html += '<div class="sgu-det-action-btn" style="color:#2563eb;" onclick="window._sguVerDetalles(\'salida\')"><i class="bi bi-eye"></i> Detalles</div>';
    html += '<div class="sgu-det-action-btn" style="color:#10b981;" onclick="window._sguGenerarPDF(\'salida\')"><i class="bi bi-file-earmark-text"></i> PDF (Ida)</div>';
    html += '<div class="sgu-det-action-btn" style="color:#ea580c;" onclick="window._sguVerFotos(\'salida\')"><i class="bi bi-image"></i> Fotos ('+rec.fotos.filter(function(f){return f.tipo==='salida';}).length+')</div>';
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

    var archivosMetadata = pendientes.map(function(p) {
        return { nombre: p.file.name || 'foto.jpg', tipo: p.file.type || 'image/jpeg', fase: tipo };
    });

    _sguToast('Preparando subida directa...', 'bi-cloud-arrow-up');

    // 1. Pedir URLs prefirmadas al backend
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

        _sguToast('Subiendo ' + pendientes.length + ' fotos a la nube...', 'bi-hourglass-split');

        // 2. Subir directo a S3 en paralelo
        pendientes.forEach(function(p, i) {
            if (!urls[i]) return; // Fallback
            var uploadUrl = urls[i].uploadUrl;
            var s3Key = urls[i].key;

            var req = fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': p.file.type || 'image/jpeg' },
                body: p.file // <- El archivo va directo a Amazon S3
            })
            .then(function(resS3) {
                if (!resS3.ok) throw new Error('Fallo subida a S3 de foto ' + (i+1));
                p.uploaded = true;
                exitosos.push({ key: s3Key, fase: tipo });
            })
            .catch(function(e) {
                console.error(e);
            });

            promesas.push(req);
        });

        return Promise.all(promesas).then(function() { return exitosos; });
    })
    .then(function(exitosos) {
        if (!exitosos.length) {
            _sguToast('Ninguna foto pudo subirse.', 'bi-x-circle');
            return cb();
        }

        // 3. Confirmar al backend las fotos exitosas
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
        .then(function(resData) {
            console.log("Confirmación exitosa:", resData);
            cb();
        });
    })
    .catch(function(e) {
        console.error('Error subida fotos:', e);
        _sguToast(e.message || 'Fallo de subida de fotos', 'bi-exclamation-triangle');
        setTimeout(cb, 3000);
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

    var bodyOut = { placa_tracto: p, placa_carreta: c, conductor: cond, destino: dest, salida_fecha: ts.date, salida_hora: ts.time, salida_km: km, salida_template_json: _sguGlobalTemplate, salida_checklist_json: _sguChecklist, salida_has_alert: hasAlert };
    
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
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:#64748b;">No hay fotos de ' + tipo + '</div>';
    } else {
        var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;">';
        fotos.forEach(function(f) {
            html += '<a href="' + f.url + '" target="_blank" style="display:block;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">';
            html += '<img src="' + f.url + '" style="width:100%;height:120px;object-fit:cover;display:block;" alt="Foto" crossorigin="anonymous">';
            html += '</a>';
        });
        html += '</div>';
        container.innerHTML = html;
    }
    
    document.getElementById('sgu-gallery-title').textContent = 'Fotos de ' + (tipo === 'salida' ? 'Ida' : 'Vuelta');
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
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:#64748b;">No se llenó el checklist en ' + tipo + '</div>';
    } else {
        var html = '<div class="sgu-det-card" style="margin-bottom:0;">';
        if (template && template.length) {
            template.forEach(function(cat) {
                html += '<div style="margin-bottom:1rem;">';
                html += '<h4 style="margin:0 0 .5rem 0;font-size:0.95rem;color:#1e293b;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">' + (cat.titulo || cat.name || 'Sin categoría') + '</h4>';
                if (cat.items && cat.items.length) {
                    cat.items.forEach(function(item) {
                        var valor = checklist[item.id];
                        var badge = '';
                        if (valor === 'ok') badge = '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;">OK</span>';
                        else if (valor === 'na') badge = '<span style="background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;">N/A</span>';
                        else if (valor === 'mal') badge = '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;">MAL</span>';
                        else badge = '<span style="background:#f1f5f9;color:#94a3b8;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;">-</span>';
                        
                        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:0.85rem;color:#475569;">';
                        html += '<span>' + item.label + '</span>';
                        html += '<div>' + badge + '</div>';
                        html += '</div>';
                    });
                }
                html += '</div>';
            });
        }
        html += '</div>';
        
        // Agregar fotos como evidencia si existen
        var fotos = (rec.fotos || []).filter(function(f) { return f.tipo === tipo; });
        if (fotos.length > 0) {
            html += '<h4 style="margin:1rem 0 .5rem 0;font-size:0.95rem;color:#1e293b;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">Evidencias (' + fotos.length + ')</h4>';
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:10px;">';
            fotos.forEach(function(f) {
                html += '<a href="' + f.url + '" target="_blank" style="display:block;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">';
                html += '<img src="' + f.url + '" style="width:100%;height:100px;object-fit:cover;display:block;" alt="Evidencia" crossorigin="anonymous">';
                html += '</a>';
            });
            html += '</div>';
        }

        container.innerHTML = html;
    }
    
    document.getElementById('sgu-details-title').textContent = 'Checklist de ' + (tipo === 'salida' ? 'Ida' : 'Vuelta');
    document.getElementById('sgu-details-overlay').classList.add('show');
};

// =========================================================
// 📄 GENERAR PDF
// =========================================================
window._sguGenerarPDF = async function(tipo) {
    if (!window._sguCurrentRecord) return;
    if (typeof html2pdf === 'undefined') {
        _sguToast('Error: Librería PDF no cargada', 'bi-exclamation-triangle');
        return;
    }
    
    var rec = window._sguCurrentRecord;
    var checklist = tipo === 'salida' ? rec.salida_checklist_json : rec.retorno_checklist_json;
    var template = tipo === 'salida' ? rec.salida_template_json : rec.retorno_template_json;
    var fecha = tipo === 'salida' ? rec.salida_fecha : rec.retorno_fecha;
    var hora = tipo === 'salida' ? rec.salida_hora : rec.retorno_hora;
    var km = tipo === 'salida' ? rec.salida_km : rec.retorno_km;
    
    var div = document.createElement('div');
    // 794px es exactamente el ancho de un A4 a 96DPI. Usamos 750px para margen de seguridad
    div.style.width = '750px'; 
    div.style.padding = '30px';
    div.style.fontFamily = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    div.style.color = '#1e293b';
    div.style.backgroundColor = '#ffffff';
    div.style.boxSizing = 'border-box';
    
    // Cabecera moderna
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #2563eb;padding-bottom:15px;margin-bottom:25px;">';
    html += '<div>';
    html += '<h1 style="margin:0;font-size:26px;color:#0f172a;letter-spacing:-0.5px;">INSPECCIÓN DE UNIDAD</h1>';
    html += '<p style="margin:5px 0 0 0;font-size:14px;color:#64748b;font-weight:bold;text-transform:uppercase;">FASE: ' + tipo + '</p>';
    html += '</div>';
    html += '<div style="text-align:right;">';
    html += '<p style="margin:0;font-size:16px;font-weight:bold;color:#0f172a;">ID: ' + rec.id + '</p>';
    html += '<p style="margin:5px 0 0 0;font-size:13px;color:#64748b;">' + (fecha||'--') + ' ' + (hora||'--') + '</p>';
    html += '</div>';
    html += '</div>';
    
    // Datos Generales
    html += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:15px;margin-bottom:25px;">';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">';
    html += '<div><p style="margin:0;font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Placa Tracto</p><p style="margin:2px 0 0 0;font-size:15px;font-weight:bold;">' + rec.placa_tracto + '</p></div>';
    html += '<div><p style="margin:0;font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Placa Carreta</p><p style="margin:2px 0 0 0;font-size:15px;font-weight:bold;">' + (rec.placa_carreta || '---') + '</p></div>';
    html += '<div><p style="margin:0;font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Conductor</p><p style="margin:2px 0 0 0;font-size:15px;font-weight:bold;">' + rec.conductor + '</p></div>';
    html += '<div><p style="margin:0;font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Kilometraje</p><p style="margin:2px 0 0 0;font-size:15px;font-weight:bold;">' + (km||'---') + '</p></div>';
    html += '</div></div>';
    
    // Checklist
    html += '<h3 style="margin:0 0 15px 0;font-size:18px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Detalle de Revisión</h3>';
    if (template && template.length && checklist) {
        template.forEach(function(cat) {
            html += '<div style="margin-bottom:15px;break-inside:avoid;">';
            html += '<h4 style="margin:0 0 8px 0;font-size:14px;background:#f1f5f9;padding:6px 10px;border-radius:4px;color:#334155;">' + (cat.titulo || cat.name || 'Sin categoría') + '</h4>';
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
        _sguToast('Preparando ' + fotos.length + ' imágenes...', 'bi-hourglass-split');
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
                console.error("Error al cargar imagen " + i, e);
                fotosBase64.push({ b64: fotos[i].url, num: i + 1 });
            }
        }
        
        html += '<div style="break-inside:avoid;margin-top:20px;">';
        html += '<h3 style="margin:0 0 15px 0;font-size:18px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Evidencias Fotográficas (' + fotos.length + ')</h3>';
        html += '<div style="display:flex;flex-direction:column;gap:25px;">';
        fotosBase64.forEach(function(f) {
            html += '<div style="text-align:center;border:1px solid #e2e8f0;padding:15px;border-radius:8px;background:#f8fafc;break-inside:avoid;">';
            html += '<h4 style="margin:0 0 10px 0;font-size:15px;color:#334155;font-weight:bold;">Evidencia ' + f.num + '</h4>';
            html += '<img src="' + f.b64 + '" style="width:100%;max-height:500px;object-fit:contain;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.06);" crossorigin="anonymous">';
            html += '</div>';
        });
        html += '</div></div>';
    }
    
    div.innerHTML = html;
    
    var opt = {
        margin:       [10, 10, 10, 10], // top, left, bottom, right
        filename:     'Checklist_' + rec.placa_tracto + '_' + tipo + '.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    _sguToast('Generando PDF, por favor espere...', 'bi-hourglass-split');
    html2pdf().set(opt).from(div).save().then(function() {
        _sguToast('PDF descargado correctamente.', 'bi-check-circle');
    });
};

// =========================================================
// 🗑️ ELIMINAR REGISTRO
// =========================================================
window._sguDeleteRecord = function(id) {
    if (!confirm('¿Está seguro de eliminar este expediente? Esta acción no se puede deshacer y borrará también las fotos.')) return;
    
    _sguToast('Eliminando expediente...', 'bi-hourglass-split');
    fetch('/api/seguridad/unidades/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('fleet_token') }
    }).then(function(r) {
        if(!r.ok) throw new Error('Error al eliminar');
        return r.json();
    }).then(function() {
        _sguToast('Expediente eliminado', 'bi-check-circle');
        _sguLoadRecords(function() {
            window._sguNav('list');
        });
    }).catch(function(e) {
        _sguToast(e.message, 'bi-exclamation-circle');
    });
};

// =========================================================
// 📄 GENERAR PDF COMPLETO (IDA Y VUELTA)
// =========================================================
window._sguGenerarPDFCompleto = async function() {
    if (typeof html2pdf === 'undefined') {
        _sguToast('Error: Librería PDF no cargada', 'bi-exclamation-triangle');
        return;
    }
    
    if (!window._sguCurrentRecord) return;
    var rec = window._sguCurrentRecord;
    
    // Crear un contenedor temporal que agrupe ambos HTML (Ida y Vuelta)
    var div = document.createElement('div');
    // 794px es ancho A4
    div.style.width = '750px'; 
    div.style.padding = '30px';
    div.style.fontFamily = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    div.style.color = '#1e293b';
    div.style.backgroundColor = '#ffffff';
    div.style.boxSizing = 'border-box';
    
    function buildTable(tipo) {
        var fecha = tipo === 'salida' ? rec.salida_fecha : rec.retorno_fecha;
        var hora = tipo === 'salida' ? rec.salida_hora : rec.retorno_hora;
        var km = tipo === 'salida' ? rec.salida_km : rec.retorno_km;
        var checklist = tipo === 'salida' ? rec.salida_checklist_json : rec.retorno_checklist_json;
        var template = tipo === 'salida' ? rec.salida_template_json : rec.retorno_template_json;
        
        var html = '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #2563eb;padding-bottom:15px;margin-bottom:25px;">';
        html += '<div>';
        html += '<h1 style="margin:0;font-size:26px;color:#0f172a;letter-spacing:-0.5px;">INSPECCIÓN DE UNIDAD</h1>';
        html += '<p style="margin:5px 0 0 0;font-size:14px;color:#64748b;font-weight:bold;text-transform:uppercase;">FASE: ' + tipo + '</p>';
        html += '</div>';
        html += '<div style="text-align:right;">';
        html += '<p style="margin:0;font-size:16px;font-weight:bold;color:#0f172a;">ID: ' + rec.id + '</p>';
        html += '<p style="margin:5px 0 0 0;font-size:13px;color:#64748b;">' + (fecha||'--') + ' ' + (hora||'--') + '</p>';
        html += '</div>';
        html += '</div>';
        
        html += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:15px;margin-bottom:25px;">';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">';
        html += '<div><p style="margin:0;font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Placa Tracto</p><p style="margin:2px 0 0 0;font-size:15px;font-weight:bold;">' + rec.placa_tracto + '</p></div>';
        html += '<div><p style="margin:0;font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Placa Carreta</p><p style="margin:2px 0 0 0;font-size:15px;font-weight:bold;">' + (rec.placa_carreta || '---') + '</p></div>';
        html += '<div><p style="margin:0;font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Conductor</p><p style="margin:2px 0 0 0;font-size:15px;font-weight:bold;">' + rec.conductor + '</p></div>';
        html += '<div><p style="margin:0;font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Kilometraje</p><p style="margin:2px 0 0 0;font-size:15px;font-weight:bold;">' + (km||'---') + '</p></div>';
        html += '</div></div>';
        
        html += '<h3 style="margin:0 0 15px 0;font-size:18px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Detalle de Revisión</h3>';
        if (template && template.length && checklist) {
            template.forEach(function(cat) {
                html += '<div style="margin-bottom:15px;break-inside:avoid;">';
                html += '<h4 style="margin:0 0 8px 0;font-size:14px;background:#f1f5f9;padding:6px 10px;border-radius:4px;color:#334155;">' + (cat.titulo || cat.name || 'Sin categoría') + '</h4>';
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
        return { html: html, fotos: fotos };
    }
    
    var salidaData = buildTable('salida');
    var retornoData = buildTable('retorno');
    
    var todasFotos = salidaData.fotos.concat(retornoData.fotos);
    var fotosMap = {}; // url -> base64
    
    if (todasFotos.length > 0) {
        _sguToast('Preparando ' + todasFotos.length + ' imágenes...', 'bi-hourglass-split');
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
                console.error("Error al cargar imagen", e);
                fotosMap[url] = url;
            }
        }
    }
    
    function buildFotosHtml(fotosArray) {
        if (!fotosArray || fotosArray.length === 0) return '';
        var h = '<div style="break-inside:avoid;margin-top:20px;">';
        h += '<h3 style="margin:0 0 15px 0;font-size:18px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Evidencias Fotográficas (' + fotosArray.length + ')</h3>';
        h += '<div style="display:flex;flex-direction:column;gap:25px;margin-bottom:25px;">';
        fotosArray.forEach(function(f, index) {
            h += '<div style="text-align:center;border:1px solid #e2e8f0;padding:15px;border-radius:8px;background:#f8fafc;break-inside:avoid;">';
            h += '<h4 style="margin:0 0 10px 0;font-size:15px;color:#334155;font-weight:bold;">Evidencia ' + (index + 1) + '</h4>';
            h += '<img src="' + fotosMap[f.url] + '" style="width:100%;max-height:500px;object-fit:contain;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.06);" crossorigin="anonymous">';
            h += '</div>';
        });
        h += '</div></div>';
        return h;
    }
    
    var htmlFinal = salidaData.html + buildFotosHtml(salidaData.fotos);
    // Salto de página para el PDF
    htmlFinal += '<div class="html2pdf__page-break"></div>';
    htmlFinal += retornoData.html + buildFotosHtml(retornoData.fotos);
    
    div.innerHTML = htmlFinal;
    
    var opt = {
        margin:       [10, 10, 10, 10],
        filename:     'Expediente_Completo_' + rec.placa_tracto + '.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    _sguToast('Generando Expediente PDF...', 'bi-hourglass-split');
    html2pdf().set(opt).from(div).save().then(function() {
        _sguToast('Expediente descargado.', 'bi-check-circle');
    });
};
