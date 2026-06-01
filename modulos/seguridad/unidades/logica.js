// ================================================================
// 🛡️ MÓDULO SEGURIDAD: UNIDADES (Checklist) — Lógica Aislada
// Ahora conectado a MySQL vía API + fotos en AWS S3
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

// ── CARGAR REGISTROS ─────────────────────────────────────────────
function _sguLoadRecords(cb) {
    _sguFetch('/api/seguridad/unidades').then(function(data) {
        _sguRecords = data || [];
        if (cb) cb();
    }).catch(function(e) {
        console.error('Error cargando unidades:', e);
        _sguRecords = [];
        if (cb) cb();
    });
}

function _sguLoadTemplate(cb) {
    _sguFetch('/api/seguridad/template').then(function(data) {
        _sguGlobalTemplate = data || [];
        if (!_sguGlobalTemplate.length) {
            _sguGlobalTemplate = [
                { id: 'cat_1', titulo: 'Documentación', items: [
                    { id: 'i_11', label: 'Tarjeta de Propiedad' },
                    { id: 'i_12', label: 'Rev. Técnica y SOAT' },
                    { id: 'i_13', label: 'DNI, Licencia y SCTR' }
                ]},
                { id: 'cat_2', titulo: 'EPPs Personal', items: [
                    { id: 'i_21', label: 'Casco y Barbiquejo' },
                    { id: 'i_22', label: 'Chaleco Reflectivo' },
                    { id: 'i_23', label: 'Zapatos Seguridad' }
                ]},
                { id: 'cat_3', titulo: 'Físico y Seguridad', items: [
                    { id: 'i_31', label: 'Botiquín y Extintor' },
                    { id: 'i_32', label: 'Luces y Llantas' },
                    { id: 'i_33', label: 'Furgón Hermético' }
                ]}
            ];
        }
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
        var alertBadge = hasAlert ? '<div class="sgu-list-card-alert"><i class="bi bi-exclamation-triangle-fill"></i></div>' : '';
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

// ── FORM: NUEVA SALIDA / LLEGADA ─────────────────────────────────
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
    
    ['sgu-f-placa','sgu-f-carreta','sgu-f-conductor','sgu-f-destino'].forEach(function(id) {
        document.getElementById(id).disabled = false;
    });

    _sguRenderChecklist('sgu-checklist-container');
    _sguRenderPhotosUI('sgu-photos-container', 'salida');
    window._sguCheckFormReady();
}

window._sguCheckFormReady = function() {
    var isRetorno = _sguEditMode === 'retorno';
    var p = document.getElementById('sgu-f-placa').value.trim();
    var c = document.getElementById('sgu-f-conductor').value.trim();
    var d = document.getElementById('sgu-f-destino').value.trim();
    var k = document.getElementById('sgu-f-km').value.trim();
    
    // Check fotos
    var photosList = _sguPhotos[_sguEditMode] || [];
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
    
    // Check checklist
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

    var valid = false;
    if (isRetorno) {
        valid = (k !== '' && hasPhotos && hasChecklist);
        document.getElementById('sgu-btn-save').textContent = 'Registrar Retorno Definitivo';
    } else {
        valid = (p !== '' && c !== '' && d !== '' && k !== '' && hasPhotos && hasChecklist);
        document.getElementById('sgu-btn-save').textContent = 'Registrar Salida Definitiva';
    }

    var btnSave = document.getElementById('sgu-btn-save');
    if (valid) {
        btnSave.disabled = false;
        btnSave.classList.add('ready');
    } else {
        btnSave.disabled = true;
        btnSave.classList.remove('ready');
    }
};

window._sguOpenPhotos = function() {
    document.getElementById('sgu-photos-overlay').classList.add('show');
};

window._sguOpenChecklist = function() {
    document.getElementById('sgu-checklist-overlay').classList.add('show');
};

// ── RENDER CHECKLIST ─────────────────────────────────────────────
function _sguRenderChecklist(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var html = '';
    _sguGlobalTemplate.forEach(function(cat) {
        html += '<div class="sgu-check-cat-title">' + cat.titulo + '</div>';
        (cat.items || []).forEach(function(item) {
            var val = _sguChecklist[item.id] || '';
            html += '<div class="sgu-check-item">' +
                '<span class="sgu-check-label">' + item.label + '</span>' +
                '<div class="sgu-check-btns">' +
                    '<button class="sgu-check-btn ok ' + (val === 'ok' ? 'active' : '') + '" onclick="window._sguSetCheck(\'' + item.id + '\',\'ok\',\'' + containerId + '\')">✓</button>' +
                    '<button class="sgu-check-btn mal ' + (val === 'mal' ? 'active' : '') + '" onclick="window._sguSetCheck(\'' + item.id + '\',\'mal\',\'' + containerId + '\')">✕</button>' +
                    '<button class="sgu-check-btn na ' + (val === 'na' ? 'active' : '') + '" onclick="window._sguSetCheck(\'' + item.id + '\',\'na\',\'' + containerId + '\')">—</button>' +
                '</div>' +
            '</div>';
        });
    });
    container.innerHTML = html;
}

window._sguSetCheck = function(itemId, valor, containerId) {
    _sguChecklist[itemId] = (_sguChecklist[itemId] === valor) ? '' : valor;
    _sguRenderChecklist(containerId);
    window._sguCheckFormReady();
};

// ── RENDER FOTOS UI ──────────────────────────────────────────────
function _sguRenderPhotosUI(containerId, tipo) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var photos = _sguPhotos[tipo] || [];
    var html = '<div class="sgu-photo-grid">';

    photos.forEach(function(p, i) {
        html += '<div class="sgu-photo-thumb">' +
            '<img src="' + p.url + '">' +
            '<button class="sgu-photo-del" onclick="window._sguRemovePhoto(' + i + ',\'' + tipo + '\',\'' + containerId + '\')"><i class="bi bi-x-lg"></i></button>' +
        '</div>';
    });

    html += '<label class="sgu-photo-add">' +
        '<i class="bi bi-camera"></i>' +
        '<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="window._sguAddPhotoInput(this,\'' + tipo + '\',\'' + containerId + '\')">' +
    '</label>';

    html += '</div>';
    container.innerHTML = html;
}

window._sguAddPhotoInput = function(input, tipo, containerId) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    var localUrl = URL.createObjectURL(file);
    _sguPhotos[tipo] = _sguPhotos[tipo] || [];
    _sguPhotos[tipo].push({ url: localUrl, file: file, uploaded: false });
    _sguRenderPhotosUI(containerId, tipo);
    window._sguCheckFormReady();
    input.value = '';
};

window._sguRemovePhoto = function(index, tipo, containerId) {
    var photo = _sguPhotos[tipo][index];
    if (photo && photo.s3Id) {
        var regId = _sguDetailId || '';
        _sguFetch('/api/seguridad/unidades/' + regId + '/fotos/' + photo.s3Id, { method: 'DELETE' }).catch(function(e){});
    }
    _sguPhotos[tipo].splice(index, 1);
    _sguRenderPhotosUI(containerId, tipo);
    window._sguCheckFormReady();
};

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
            p.uploaded = true; p.url = data.url; p.s3Id = data.id; uploaded++;
            if (uploaded >= pendientes.length) cb();
        }).catch(function() {
            uploaded++; if (uploaded >= pendientes.length) cb();
        });
    });
}

// ── GUARDAR REGISTRO ─────────────────────────────────────────────
window._sguSaveRecord = function() {
    var p = document.getElementById('sgu-f-placa').value.toUpperCase();
    var c = document.getElementById('sgu-f-carreta').value.toUpperCase();
    var cond = document.getElementById('sgu-f-conductor').value;
    var dest = document.getElementById('sgu-f-destino').value;
    var km = document.getElementById('sgu-f-km').value;

    var isRetorno = _sguEditMode === 'retorno';
    var hasAlert = false;
    for (var key in _sguChecklist) { if (_sguChecklist[key] === 'mal') { hasAlert = true; break; } }

    var ts = _sguTimestamp();
    _sguToast('Guardando...');
    document.getElementById('sgu-btn-save').disabled = true;
    document.getElementById('sgu-btn-save').innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Procesando...';

    if (isRetorno) {
        var body = { retorno_fecha: ts.date, retorno_hora: ts.time, retorno_km: km, retorno_template_json: _sguGlobalTemplate, retorno_checklist_json: _sguChecklist, retorno_has_alert: hasAlert, estado: 'completado' };
        _sguFetch('/api/seguridad/unidades/' + _sguDetailId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function() {
            _sguUploadPhotos(_sguDetailId, 'retorno', function() {
                _sguToast('Retorno guardado exitosamente');
                _sguLoadRecords(function() { window._sguShowView('list'); });
            });
        }).catch(function(e) { _sguToast('Error: ' + e.message, 'bi-exclamation-circle'); window._sguCheckFormReady(); });
    } else {
        var regId = 'REQ-' + Date.now();
        var bodyOut = { id: regId, placa_tracto: p, placa_carreta: c, conductor: cond, destino: dest, salida_fecha: ts.date, salida_hora: ts.time, salida_km: km, salida_template_json: _sguGlobalTemplate, salida_checklist_json: _sguChecklist, salida_has_alert: hasAlert };
        _sguFetch('/api/seguridad/unidades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyOut) })
        .then(function(data) {
            _sguUploadPhotos(data.id, 'salida', function() {
                _sguToast('Salida guardada exitosamente');
                _sguLoadRecords(function() { window._sguShowView('list'); });
            });
        }).catch(function(e) { _sguToast('Error: ' + e.message, 'bi-exclamation-circle'); window._sguCheckFormReady(); });
    }
};

window._sguRegisterReturn = function(recordId) {
    _sguDetailId = recordId;
    _sguEditMode = 'retorno';
    _sguChecklist = {};
    _sguPhotos.retorno = [];

    window._sguShowView('form');
    document.getElementById('sgu-form-title').textContent = 'Registrar Llegada';

    var rec = _sguRecords.find(function(r) { return r.id === recordId; });
    document.getElementById('sgu-f-placa').value     = rec ? rec.placa_tracto : '';
    document.getElementById('sgu-f-carreta').value   = rec ? (rec.placa_carreta || '') : '';
    document.getElementById('sgu-f-conductor').value = rec ? rec.conductor : '';
    document.getElementById('sgu-f-destino').value   = rec ? (rec.destino || '') : '';
    document.getElementById('sgu-f-km').value        = '';

    ['sgu-f-placa','sgu-f-carreta','sgu-f-conductor','sgu-f-destino'].forEach(function(id) {
        document.getElementById(id).disabled = true;
    });

    _sguRenderChecklist('sgu-checklist-container');
    _sguRenderPhotosUI('sgu-photos-container', 'retorno');
    window._sguCheckFormReady();
};

// ── RENDER DETALLE ───────────────────────────────────────────────
function _sguRenderDetail(recordId) {
    var container = document.getElementById('sgu-detail-content');
    if (!container) return;

    var rec = _sguRecords.find(function(r) { return r.id === recordId; });
    if (!rec) { container.innerHTML = '<p>No encontrado.</p>'; return; }

    var isEnRuta = rec.estado === 'en_ruta';
    var html = '';

    html += '<div style="background:#fff;border-radius:16px;padding:1.5rem;border:1px solid #e2e8f0;margin-bottom:1rem;">';
    html += '<h3 style="margin:0 0 .5rem;font-weight:900;font-size:1.4rem;color:#0f172a;">' + rec.placa_tracto + (rec.placa_carreta ? ' / ' + rec.placa_carreta : '') + '</h3>';
    html += '<p style="margin:0 0 1.5rem;color:#64748b;font-size:.95rem;">Conductor: <strong>' + rec.conductor + '</strong></p>';
    
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">';
    html += '<div><div class="sgu-form-label">Destino</div><div style="font-weight:700;color:#0f172a;">' + (rec.destino||'---') + '</div></div>';
    html += '<div><div class="sgu-form-label">Estado</div><div><span style="background:'+(isEnRuta?'#eff6ff':'#f1f5f9')+';color:'+(isEnRuta?'#2563eb':'#64748b')+';padding:4px 10px;border-radius:6px;font-size:.75rem;font-weight:800;text-transform:uppercase;">' + (isEnRuta?'En Ruta':'Completado') + '</span></div></div>';
    html += '</div></div>';

    html += '<div style="background:#fff;border-radius:16px;padding:1.5rem;border:1px solid #e2e8f0;margin-bottom:1rem;">';
    html += '<h4 style="margin:0 0 1rem;font-weight:800;color:#1e3a8a;font-size:.95rem;text-transform:uppercase;">Datos de Salida</h4>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">';
    html += '<div><div class="sgu-form-label">Fecha/Hora</div><div style="font-weight:700;color:#0f172a;font-size:.9rem;">' + (rec.salida_fecha||'') + ' ' + (rec.salida_hora||'') + '</div></div>';
    html += '<div><div class="sgu-form-label">KM Inicial</div><div style="font-weight:700;color:#0f172a;font-size:.9rem;">' + (rec.salida_km||'---') + ' km</div></div>';
    html += '</div></div>';

    if (rec.retorno_fecha) {
        html += '<div style="background:#fff;border-radius:16px;padding:1.5rem;border:1px solid #e2e8f0;margin-bottom:1rem;">';
        html += '<h4 style="margin:0 0 1rem;font-weight:800;color:#1e3a8a;font-size:.95rem;text-transform:uppercase;">Datos de Retorno</h4>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">';
        html += '<div><div class="sgu-form-label">Fecha/Hora</div><div style="font-weight:700;color:#0f172a;font-size:.9rem;">' + rec.retorno_fecha + ' ' + (rec.retorno_hora||'') + '</div></div>';
        html += '<div><div class="sgu-form-label">KM Final</div><div style="font-weight:700;color:#0f172a;font-size:.9rem;">' + (rec.retorno_km||'---') + ' km</div></div>';
        html += '</div></div>';
    }

    if (rec.fotos && rec.fotos.length) {
        html += '<div style="background:#fff;border-radius:16px;padding:1.5rem;border:1px solid #e2e8f0;margin-bottom:1rem;">';
        html += '<h4 style="margin:0 0 1rem;font-weight:800;color:#1e3a8a;font-size:.95rem;text-transform:uppercase;">Fotos ('+rec.fotos.length+')</h4>';
        html += '<div style="display:flex;gap:.5rem;flex-wrap:wrap;">';
        rec.fotos.forEach(function(f) {
            html += '<img src="' + f.url + '" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:1px solid #e2e8f0;cursor:pointer;" onclick="window.open(\'' + f.url + '\',\'_blank\')">';
        });
        html += '</div></div>';
    }

    if (isEnRuta) {
        html += '<button onclick="window._sguRegisterReturn(\'' + rec.id + '\')" style="width:100%;padding:1.15rem;border-radius:16px;border:none;background:#2563eb;color:#fff;font-weight:800;font-size:1.05rem;cursor:pointer;margin-bottom:1rem;box-shadow:0 6px 16px rgba(37,99,235,.25);">' +
            'Registrar Retorno</button>';
    }

    html += '<button onclick="if(confirm(\'¿Eliminar registro?\'))window._sguDeleteRecord(\'' + rec.id + '\')" style="width:100%;padding:.85rem;border-radius:12px;border:2px solid #fee2e2;background:transparent;color:#ef4444;font-weight:700;font-size:.9rem;cursor:pointer;">' +
        'Eliminar Registro</button>';

    container.innerHTML = html;
}

window._sguDeleteRecord = function(id) {
    _sguFetch('/api/seguridad/unidades/' + id, { method: 'DELETE' })
        .then(function() {
            _sguToast('Eliminado');
            _sguLoadRecords(function() { window._sguShowView('list'); });
        }).catch(function(e) { _sguToast('Error: ' + e.message, 'bi-exclamation-circle'); });
};

// ── ESCÁNER QR ───────────────────────────────────────────────────
window._sguOpenScanner = function() {
    if (typeof window._abrirEscaner === 'function') {
        window._abrirEscaner(function(scannedText) {
            var el = document.getElementById('sgu-f-placa');
            if (el) { el.value = scannedText.trim().toUpperCase(); window._sguCheckFormReady(); }
        }, 'Escanear Placa');
    } else {
        _sguToast('Escáner no disponible', 'bi-exclamation-circle');
    }
};

// ── INIT ─────────────────────────────────────────────────────────
window.init_unidades = function() {
    _sguView = 'list';
    _sguLoadTemplate(function() {
        _sguLoadRecords(function() {
            window._sguShowView('list');
        });
    });
};
