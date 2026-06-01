// ================================================================
// 🛡️ MÓDULO SEGURIDAD: UNIDADES (Checklist) — Lógica Aislada
// Ahora conectado a MySQL vía API + fotos en AWS S3
// ================================================================

// ── ESTADO ───────────────────────────────────────────────────────
var _sguView = 'list';        // list | form | detail | settings
var _sguRecords = [];         // Cargados desde API
var _sguDetailId = null;
var _sguGlobalTemplate = [];  // Cargado desde API
var _sguChecklist = {};
var _sguPhotos = { salida: [], retorno: [] };
var _sguEditMode = 'salida';
var _sguLoading = false;

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
    t.innerHTML = '<i class="bi ' + (icon || 'bi-check-circle-fill') + '" style="color:#10b981;"></i> ' + msg;
    c.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.remove(); }, 3500);
}

// ── API HELPERS ──────────────────────────────────────────────────
function _sguFetch(url, opts) {
    // El interceptor global de fetch ya agrega Authorization: Bearer ...
    return fetch(url, opts).then(function(r) {
        if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'Error del servidor'); });
        return r.json();
    });
}

// ── CARGAR REGISTROS DESDE API ───────────────────────────────────
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

// ── CARGAR TEMPLATE DESDE API ────────────────────────────────────
function _sguLoadTemplate(cb) {
    _sguFetch('/api/seguridad/template').then(function(data) {
        _sguGlobalTemplate = data || [];
        // Si no hay template en BD, usar el default
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
    }).catch(function(e) {
        console.error('Error cargando template:', e);
        if (cb) cb();
    });
}

function _sguSaveTemplate() {
    _sguFetch('/api/seguridad/template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: _sguGlobalTemplate })
    }).then(function() {
        _sguToast('Plantilla guardada');
    }).catch(function(e) {
        _sguToast('Error al guardar plantilla: ' + e.message, 'bi-exclamation-circle');
    });
}

// ── NAVEGACIÓN ───────────────────────────────────────────────────
window._sguNav = function(view, id) { window._sguShowView(view, id); };

window._sguShowView = function(view, id) {
    _sguView = view;
    if (id) _sguDetailId = id;
    ['sgu-view-list', 'sgu-view-form', 'sgu-view-detail', 'sgu-view-settings'].forEach(function(v) {
        var el = document.getElementById(v);
        if (el) el.style.display = 'none';
    });
    // In vista.html, the container ids are sgu-list, sgu-form, sgu-detail, sgu-settings, NOT sgu-view-list
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

window._sguFilterList = function() {
    _sguRenderList();
};

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
        var badgeClass = isEnRuta ? 'sgu-badge-route' : 'sgu-badge-done';
        var badgeText = isEnRuta ? 'En Ruta' : 'Completado';
        var alertIcon = (rec.salida_has_alert || rec.retorno_has_alert)
            ? '<i class="bi bi-exclamation-triangle-fill" style="color:#f59e0b;margin-left:.35rem;font-size:.7rem;" title="Tiene alertas"></i>'
            : '';

        html += '<div class="sgu-card" onclick="window._sguShowView(\'detail\',\'' + rec.id + '\')" style="cursor:pointer;">' +
            '<div class="sgu-card-header">' +
                '<div>' +
                    '<div style="font-weight:800;color:var(--text);font-size:.95rem;">' + rec.placa_tracto + (rec.placa_carreta ? ' / ' + rec.placa_carreta : '') + alertIcon + '</div>' +
                    '<div style="font-size:.78rem;color:var(--subtext);">' + rec.conductor + (rec.destino ? ' → ' + rec.destino : '') + '</div>' +
                '</div>' +
                '<span class="sgu-badge ' + badgeClass + '">' + badgeText + '</span>' +
            '</div>' +
            '<div class="sgu-card-footer">' +
                '<span><i class="bi bi-calendar3" style="margin-right:.3rem;"></i>' + (rec.salida_fecha || '') + ' ' + (rec.salida_hora || '') + '</span>' +
                '<span><i class="bi bi-speedometer2" style="margin-right:.3rem;"></i>' + (rec.salida_km || '---') + ' km</span>' +
            '</div>' +
        '</div>';
    });

    container.innerHTML = html;
}

// ── FORM: NUEVO REGISTRO ─────────────────────────────────────────
function _sguInitForm() {
    _sguEditMode = 'salida';
    _sguChecklist = {};
    _sguPhotos = { salida: [], retorno: [] };
    var ts = _sguTimestamp();
    var el;
    el = document.getElementById('sgu-f-placa');     if (el) el.value = '';
    el = document.getElementById('sgu-f-carreta');   if (el) el.value = '';
    el = document.getElementById('sgu-f-conductor'); if (el) el.value = '';
    el = document.getElementById('sgu-f-destino');   if (el) el.value = '';
    el = document.getElementById('sgu-f-fecha');     if (el) el.value = ts.date;
    el = document.getElementById('sgu-f-hora');      if (el) el.value = ts.time;
    el = document.getElementById('sgu-f-km');        if (el) el.value = '';
    _sguRenderChecklist('sgu-checklist-container');
    _sguRenderPhotosUI('sgu-photos-container', 'salida');
}

// ── RENDER CHECKLIST ─────────────────────────────────────────────
function _sguRenderChecklist(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!_sguGlobalTemplate.length) {
        container.innerHTML = '<p style="color:var(--subtext);font-size:.85rem;text-align:center;padding:1rem;">No hay plantilla configurada. Ve a ⚙ Ajustes.</p>';
        return;
    }

    var html = '';
    _sguGlobalTemplate.forEach(function(cat) {
        html += '<div class="sgu-check-cat">' +
            '<div class="sgu-check-cat-header">' +
                '<span style="font-weight:800;font-size:.82rem;color:var(--text);">' + cat.titulo + '</span>' +
                '<button class="sgu-btn-allok" onclick="window._sguAllOK(\'' + cat.id + '\',\'' + containerId + '\')">Todo OK</button>' +
            '</div>';

        (cat.items || []).forEach(function(item) {
            var val = _sguChecklist[item.id] || '';
            html += '<div class="sgu-check-item">' +
                '<span class="sgu-check-label">' + item.label + '</span>' +
                '<div class="sgu-check-btns">' +
                    '<button class="sgu-ck ' + (val === 'ok' ? 'sgu-ck-ok-active' : '') + '" onclick="window._sguSetCheck(\'' + item.id + '\',\'ok\',\'' + containerId + '\')" title="OK">✓</button>' +
                    '<button class="sgu-ck ' + (val === 'mal' ? 'sgu-ck-mal-active' : '') + '" onclick="window._sguSetCheck(\'' + item.id + '\',\'mal\',\'' + containerId + '\')" title="Mal">✕</button>' +
                    '<button class="sgu-ck ' + (val === 'na' ? 'sgu-ck-na-active' : '') + '" onclick="window._sguSetCheck(\'' + item.id + '\',\'na\',\'' + containerId + '\')" title="N/A">—</button>' +
                '</div>' +
            '</div>';
        });

        html += '</div>';
    });
    container.innerHTML = html;
}

window._sguSetCheck = function(itemId, valor, containerId) {
    _sguChecklist[itemId] = (_sguChecklist[itemId] === valor) ? '' : valor;
    _sguRenderChecklist(containerId);
};

window._sguAllOK = function(catId, containerId) {
    var cat = _sguGlobalTemplate.find(function(c) { return c.id === catId; });
    if (cat) cat.items.forEach(function(item) { _sguChecklist[item.id] = 'ok'; });
    _sguRenderChecklist(containerId);
};

// ── RENDER FOTOS UI ──────────────────────────────────────────────
function _sguRenderPhotosUI(containerId, tipo) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var photos = _sguPhotos[tipo] || [];
    var html = '<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:flex-start;">';

    photos.forEach(function(p, i) {
        html += '<div style="position:relative;width:70px;height:70px;border-radius:10px;overflow:hidden;border:2px solid var(--border);">' +
            '<img src="' + p.url + '" style="width:100%;height:100%;object-fit:cover;">' +
            '<button onclick="window._sguRemovePhoto(' + i + ',\'' + tipo + '\',\'' + containerId + '\')" style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;font-size:.65rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>' +
        '</div>';
    });

    html += '<label style="width:70px;height:70px;border-radius:10px;border:2px dashed var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--subtext);font-size:1.3rem;">' +
        '<i class="bi bi-camera-fill"></i>' +
        '<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="window._sguAddPhoto(this,\'' + tipo + '\',\'' + containerId + '\')">' +
    '</label>';

    html += '</div>';
    container.innerHTML = html;
}

window._sguAddPhoto = function(input, tipo, containerId) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    // Preview inmediato con URL local
    var localUrl = URL.createObjectURL(file);
    _sguPhotos[tipo] = _sguPhotos[tipo] || [];
    _sguPhotos[tipo].push({ url: localUrl, file: file, uploaded: false });
    _sguRenderPhotosUI(containerId, tipo);
    input.value = '';
};

window._sguRemovePhoto = function(index, tipo, containerId) {
    var photo = _sguPhotos[tipo][index];
    if (photo && photo.s3Id) {
        // Si ya está en S3, eliminar del servidor
        var regId = _sguDetailId || '';
        _sguFetch('/api/seguridad/unidades/' + regId + '/fotos/' + photo.s3Id, { method: 'DELETE' })
            .catch(function(e) { console.warn('Error eliminando foto:', e); });
    }
    _sguPhotos[tipo].splice(index, 1);
    _sguRenderPhotosUI(containerId, tipo);
};

// ── SUBIR FOTOS A S3 ─────────────────────────────────────────────
function _sguUploadPhotos(registroId, tipo, cb) {
    var pendientes = (_sguPhotos[tipo] || []).filter(function(p) { return !p.uploaded && p.file; });
    if (!pendientes.length) return cb();

    var uploaded = 0;
    pendientes.forEach(function(p) {
        var formData = new FormData();
        formData.append('foto', p.file);
        formData.append('tipo', tipo);

        fetch('/api/seguridad/unidades/' + registroId + '/fotos', {
            method: 'POST',
            body: formData
        }).then(function(r) { return r.json(); })
        .then(function(data) {
            p.uploaded = true;
            p.url = data.url;
            p.s3Id = data.id;
            uploaded++;
            if (uploaded >= pendientes.length) cb();
        }).catch(function(e) {
            console.error('Error subiendo foto:', e);
            uploaded++;
            if (uploaded >= pendientes.length) cb();
        });
    });
}

// ── GUARDAR REGISTRO ─────────────────────────────────────────────
window._sguSaveRecord = function() {
    var placa     = (document.getElementById('sgu-f-placa')     || {}).value || '';
    var carreta   = (document.getElementById('sgu-f-carreta')   || {}).value || '';
    var conductor = (document.getElementById('sgu-f-conductor') || {}).value || '';
    var destino   = (document.getElementById('sgu-f-destino')   || {}).value || '';
    var fecha     = (document.getElementById('sgu-f-fecha')     || {}).value || '';
    var hora      = (document.getElementById('sgu-f-hora')      || {}).value || '';
    var km        = (document.getElementById('sgu-f-km')        || {}).value || '';

    if (!placa) { _sguToast('Ingrese la placa del tracto', 'bi-exclamation-circle'); return; }
    if (!conductor) { _sguToast('Ingrese el conductor', 'bi-exclamation-circle'); return; }

    var hasAlert = false;
    for (var key in _sguChecklist) {
        if (_sguChecklist[key] === 'mal') { hasAlert = true; break; }
    }

    var regId = 'REQ-' + Date.now();
    var body = {
        id: regId,
        placa_tracto: placa.toUpperCase(),
        placa_carreta: carreta.toUpperCase() || null,
        conductor: conductor,
        destino: destino,
        salida_fecha: fecha,
        salida_hora: hora,
        salida_km: km,
        salida_template_json: _sguGlobalTemplate,
        salida_checklist_json: _sguChecklist,
        salida_has_alert: hasAlert
    };

    _sguToast('Guardando...');
    _sguFetch('/api/seguridad/unidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function(data) {
        // Subir fotos a S3
        _sguUploadPhotos(data.id, 'salida', function() {
            _sguToast('Registro guardado exitosamente');
            _sguLoadRecords(function() {
                window._sguShowView('list');
            });
        });
    }).catch(function(e) {
        _sguToast('Error: ' + e.message, 'bi-exclamation-circle');
    });
};

// ── REGISTRAR RETORNO ────────────────────────────────────────────
window._sguRegisterReturn = function(recordId) {
    _sguDetailId = recordId;
    _sguEditMode = 'retorno';
    _sguChecklist = {};
    _sguPhotos.retorno = [];

    // Reusar el form pero en modo retorno
    window._sguShowView('form');

    var ts = _sguTimestamp();
    var rec = _sguRecords.find(function(r) { return r.id === recordId; });

    document.getElementById('sgu-f-placa').value     = rec ? rec.placa_tracto : '';
    document.getElementById('sgu-f-carreta').value   = rec ? (rec.placa_carreta || '') : '';
    document.getElementById('sgu-f-conductor').value = rec ? rec.conductor : '';
    document.getElementById('sgu-f-destino').value   = rec ? (rec.destino || '') : '';
    document.getElementById('sgu-f-fecha').value     = ts.date;
    document.getElementById('sgu-f-hora').value      = ts.time;
    document.getElementById('sgu-f-km').value        = '';

    // Deshabilitar campos que no se editan en retorno
    document.getElementById('sgu-f-placa').disabled     = true;
    document.getElementById('sgu-f-carreta').disabled   = true;
    document.getElementById('sgu-f-conductor').disabled = true;
    document.getElementById('sgu-f-destino').disabled   = true;

    // Cambiar botón de guardar
    var btnGuardar = document.getElementById('sgu-btn-guardar');
    if (btnGuardar) {
        btnGuardar.textContent = 'Registrar Retorno';
        btnGuardar.onclick = function() { window._sguSaveReturn(recordId); };
    }

    _sguRenderChecklist('sgu-checklist-container');
    _sguRenderPhotosUI('sgu-photos-container', 'retorno');
};

window._sguSaveReturn = function(recordId) {
    var fecha = (document.getElementById('sgu-f-fecha') || {}).value || '';
    var hora  = (document.getElementById('sgu-f-hora')  || {}).value || '';
    var km    = (document.getElementById('sgu-f-km')    || {}).value || '';

    var hasAlert = false;
    for (var key in _sguChecklist) {
        if (_sguChecklist[key] === 'mal') { hasAlert = true; break; }
    }

    var body = {
        retorno_fecha: fecha,
        retorno_hora: hora,
        retorno_km: km,
        retorno_template_json: _sguGlobalTemplate,
        retorno_checklist_json: _sguChecklist,
        retorno_has_alert: hasAlert,
        estado: 'completado'
    };

    _sguToast('Guardando retorno...');
    _sguFetch('/api/seguridad/unidades/' + recordId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function() {
        _sguUploadPhotos(recordId, 'retorno', function() {
            _sguToast('Retorno registrado exitosamente');
            // Rehabilitar campos
            ['sgu-f-placa','sgu-f-carreta','sgu-f-conductor','sgu-f-destino'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.disabled = false;
            });
            var btnGuardar = document.getElementById('sgu-btn-guardar');
            if (btnGuardar) {
                btnGuardar.textContent = 'Guardar Registro';
                btnGuardar.onclick = window._sguSaveRecord;
            }
            _sguEditMode = 'salida';
            _sguLoadRecords(function() {
                window._sguShowView('list');
            });
        });
    }).catch(function(e) {
        _sguToast('Error: ' + e.message, 'bi-exclamation-circle');
    });
};

// ── RENDER DETALLE ───────────────────────────────────────────────
function _sguRenderDetail(recordId) {
    var container = document.getElementById('sgu-detail-content');
    if (!container) return;

    var rec = _sguRecords.find(function(r) { return r.id === recordId; });
    if (!rec) { container.innerHTML = '<p>Registro no encontrado.</p>'; return; }

    var isEnRuta = rec.estado === 'en_ruta';

    var html = '';

    // Header
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;">' +
        '<div>' +
            '<div style="font-weight:900;font-size:1.15rem;color:var(--text);">' + rec.placa_tracto + (rec.placa_carreta ? ' / ' + rec.placa_carreta : '') + '</div>' +
            '<div style="font-size:.82rem;color:var(--subtext);">' + rec.conductor + '</div>' +
        '</div>' +
        '<span class="sgu-badge ' + (isEnRuta ? 'sgu-badge-route' : 'sgu-badge-done') + '">' + (isEnRuta ? 'En Ruta' : 'Completado') + '</span>' +
    '</div>';

    // Info
    html += '<div class="sgu-detail-grid">' +
        '<div class="sgu-detail-item"><div class="sgu-detail-label">Destino</div><div class="sgu-detail-value">' + (rec.destino || '—') + '</div></div>' +
        '<div class="sgu-detail-item"><div class="sgu-detail-label">Salida</div><div class="sgu-detail-value">' + (rec.salida_fecha || '') + ' ' + (rec.salida_hora || '') + '</div></div>' +
        '<div class="sgu-detail-item"><div class="sgu-detail-label">KM Salida</div><div class="sgu-detail-value">' + (rec.salida_km || '—') + '</div></div>' +
    '</div>';

    if (rec.retorno_fecha) {
        html += '<div class="sgu-detail-grid" style="margin-top:.5rem;">' +
            '<div class="sgu-detail-item"><div class="sgu-detail-label">Retorno</div><div class="sgu-detail-value">' + rec.retorno_fecha + ' ' + (rec.retorno_hora || '') + '</div></div>' +
            '<div class="sgu-detail-item"><div class="sgu-detail-label">KM Retorno</div><div class="sgu-detail-value">' + (rec.retorno_km || '—') + '</div></div>' +
        '</div>';
    }

    // Checklist de Salida
    if (rec.salida_checklist_json && rec.salida_template_json) {
        html += _sguRenderChecklistPreview('Checklist de Salida', rec.salida_template_json, rec.salida_checklist_json);
    }

    // Checklist de Retorno
    if (rec.retorno_checklist_json && rec.retorno_template_json) {
        html += _sguRenderChecklistPreview('Checklist de Retorno', rec.retorno_template_json, rec.retorno_checklist_json);
    }

    // Fotos
    if (rec.fotos && rec.fotos.length) {
        html += '<div style="margin-top:1rem;"><div style="font-weight:800;font-size:.82rem;color:var(--text);margin-bottom:.5rem;">📷 Evidencia Fotográfica</div>';
        html += '<div style="display:flex;gap:.5rem;flex-wrap:wrap;">';
        rec.fotos.forEach(function(f) {
            html += '<img src="' + f.url + '" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:2px solid var(--border);cursor:pointer;" onclick="window.open(\'' + f.url + '\',\'_blank\')">';
        });
        html += '</div></div>';
    }

    // Acciones
    if (isEnRuta) {
        html += '<div style="margin-top:1.25rem;">' +
            '<button onclick="window._sguRegisterReturn(\'' + rec.id + '\')" style="width:100%;padding:.85rem;border-radius:14px;border:none;background:#2563eb;color:#fff;font-weight:800;font-size:.9rem;cursor:pointer;">' +
            '<i class="bi bi-box-arrow-in-left" style="margin-right:.5rem;"></i>Registrar Retorno</button></div>';
    }

    html += '<div style="margin-top:.75rem;">' +
        '<button onclick="if(confirm(\'¿Eliminar este registro?\'))window._sguDeleteRecord(\'' + rec.id + '\')" style="width:100%;padding:.65rem;border-radius:12px;border:2px solid rgba(239,68,68,.2);background:transparent;color:#ef4444;font-weight:700;font-size:.82rem;cursor:pointer;">' +
        '<i class="bi bi-trash3" style="margin-right:.4rem;"></i>Eliminar Registro</button></div>';

    container.innerHTML = html;
}

function _sguRenderChecklistPreview(titulo, template, checklist) {
    var html = '<div style="margin-top:1rem;">' +
        '<div style="font-weight:800;font-size:.82rem;color:var(--text);margin-bottom:.5rem;">' + titulo + '</div>';

    (template || []).forEach(function(cat) {
        html += '<div style="margin-bottom:.5rem;">' +
            '<div style="font-size:.7rem;font-weight:700;color:var(--subtext);text-transform:uppercase;margin-bottom:.25rem;">' + cat.titulo + '</div>';
        (cat.items || []).forEach(function(item) {
            var val = (checklist || {})[item.id] || '';
            var icon = val === 'ok' ? '<span style="color:#10b981;">✓</span>' :
                       val === 'mal' ? '<span style="color:#ef4444;">✕</span>' :
                       val === 'na' ? '<span style="color:#94a3b8;">—</span>' : '<span style="color:#cbd5e1;">○</span>';
            html += '<div style="display:flex;justify-content:space-between;padding:.2rem 0;font-size:.78rem;">' +
                '<span style="color:var(--text);">' + item.label + '</span>' + icon + '</div>';
        });
        html += '</div>';
    });

    html += '</div>';
    return html;
}

// ── ELIMINAR REGISTRO ────────────────────────────────────────────
window._sguDeleteRecord = function(id) {
    _sguFetch('/api/seguridad/unidades/' + id, { method: 'DELETE' })
        .then(function() {
            _sguToast('Registro eliminado');
            _sguLoadRecords(function() {
                window._sguShowView('list');
            });
        }).catch(function(e) {
            _sguToast('Error: ' + e.message, 'bi-exclamation-circle');
        });
};

// ── SETTINGS: EDITOR DE PLANTILLA ────────────────────────────────
function _sguRenderSettings() {
    var container = document.getElementById('sgu-settings-content');
    if (!container) return;

    var html = '';
    _sguGlobalTemplate.forEach(function(cat, ci) {
        html += '<div class="sgu-card" style="margin-bottom:.75rem;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;">' +
                '<input type="text" value="' + cat.titulo + '" onchange="window._sguEditCatTitle(' + ci + ',this.value)" style="border:none;background:transparent;font-weight:800;font-size:.9rem;color:var(--text);outline:none;flex:1;">' +
                '<button onclick="window._sguRemoveCat(' + ci + ')" style="border:none;background:rgba(239,68,68,.1);color:#ef4444;border-radius:8px;padding:.25rem .5rem;font-size:.7rem;font-weight:700;cursor:pointer;">Eliminar</button>' +
            '</div>';

        (cat.items || []).forEach(function(item, ii) {
            html += '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.35rem;">' +
                '<span style="color:var(--subtext);font-size:.7rem;">•</span>' +
                '<input type="text" value="' + item.label + '" onchange="window._sguEditItemLabel(' + ci + ',' + ii + ',this.value)" style="flex:1;border:none;background:transparent;font-size:.82rem;color:var(--text);outline:none;">' +
                '<button onclick="window._sguRemoveItem(' + ci + ',' + ii + ')" style="border:none;background:transparent;color:#ef4444;font-size:.75rem;cursor:pointer;"><i class="bi bi-x-circle"></i></button>' +
            '</div>';
        });

        html += '<button onclick="window._sguAddItem(' + ci + ')" style="border:none;background:rgba(37,99,235,.06);color:#2563eb;border-radius:8px;padding:.35rem .65rem;font-size:.75rem;font-weight:700;cursor:pointer;margin-top:.25rem;"><i class="bi bi-plus-circle" style="margin-right:.3rem;"></i>Agregar ítem</button>';
        html += '</div>';
    });

    html += '<button onclick="window._sguAddCat()" style="width:100%;padding:.75rem;border-radius:14px;border:2px dashed var(--border);background:transparent;color:var(--subtext);font-weight:700;font-size:.85rem;cursor:pointer;margin-top:.5rem;"><i class="bi bi-plus-lg" style="margin-right:.4rem;"></i>Nueva Categoría</button>';

    container.innerHTML = html;
}

window._sguEditCatTitle = function(ci, val) { _sguGlobalTemplate[ci].titulo = val; _sguSaveTemplate(); };
window._sguEditItemLabel = function(ci, ii, val) { _sguGlobalTemplate[ci].items[ii].label = val; _sguSaveTemplate(); };

window._sguRemoveCat = function(ci) {
    _sguGlobalTemplate.splice(ci, 1);
    _sguSaveTemplate();
    _sguRenderSettings();
};

window._sguRemoveItem = function(ci, ii) {
    _sguGlobalTemplate[ci].items.splice(ii, 1);
    _sguSaveTemplate();
    _sguRenderSettings();
};

window._sguAddItem = function(ci) {
    var newId = 'i_' + Date.now();
    _sguGlobalTemplate[ci].items.push({ id: newId, label: 'Nuevo ítem' });
    _sguSaveTemplate();
    _sguRenderSettings();
};

window._sguAddCat = function() {
    var newId = 'cat_' + Date.now();
    _sguGlobalTemplate.push({ id: newId, titulo: 'Nueva Categoría', items: [] });
    _sguSaveTemplate();
    _sguRenderSettings();
};

// ── ESCÁNER QR ───────────────────────────────────────────────────
window._sguOpenScanner = function() {
    if (typeof window._abrirEscaner === 'function') {
        window._abrirEscaner(function(scannedText) {
            var el = document.getElementById('sgu-f-placa');
            if (el) el.value = scannedText.trim().toUpperCase();
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
