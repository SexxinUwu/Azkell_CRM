// ================================================================
// MÓDULO ALMACÉN / SISTEMAS Y SUB-SISTEMAS — Lógica SPA Aislada
// ================================================================

window._sisData         = window._sisData         || [];
window._sisFiltrado     = window._sisFiltrado     || [];
window._sisSubsActuales = window._sisSubsActuales || [];

window.init_sistemas = function() {
    window.cargarSistemas();
};

// ── Cargar ─────────────────────────────────────────────────────
window.cargarSistemas = function() {
    var tb = document.getElementById('cuerpo-tabla-sistemas');
    if (tb) tb.innerHTML = '<tr><td colspan="4" class="text-center py-4"><div class="spinner-border spinner-border-sm me-2"></div>Cargando…</td></tr>';
    fetch('/api/almacen/sistemas')
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) {
            window._sisData = data || [];
            window._sisFiltrado = data || [];
            window.filtrarSistemas();
        })
        .catch(function(err) {
            var tb2 = document.getElementById('cuerpo-tabla-sistemas');
            if (tb2) tb2.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle me-1"></i>' + _sisEsc(err.message) + '</td></tr>';
        });
};

// ── Filtrar ───────────────────────────────────────────────────
window.filtrarSistemas = function() {
    var q = ((document.getElementById('sis-buscar') || {}).value || '').toLowerCase().trim();
    window._sisFiltrado = (window._sisData || []).filter(function(s) {
        return !q || (s.nombre || '').toLowerCase().includes(q);
    });
    window._sisRender();
};

window._sisRender = function() {
    var tb  = document.getElementById('cuerpo-tabla-sistemas');
    var cnt = document.getElementById('sis-contador');
    var datos = window._sisFiltrado || [];
    if (cnt) cnt.textContent = datos.length + ' sistema' + (datos.length !== 1 ? 's' : '');
    if (!tb) return;
    if (!datos.length) {
        tb.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-2 d-block mb-2"></i>Sin sistemas</td></tr>';
        return;
    }
    tb.innerHTML = datos.map(function(s) {
        var subs = (s.sub_sistemas || []).map(function(n) {
            return '<span class="badge bg-secondary-subtle text-secondary fw-normal me-1" style="font-size:0.7rem;">' + _sisEsc(n) + '</span>';
        }).join('');
        return '<tr>' +
            '<td><span class="badge bg-warning text-dark fw-bold">' + _sisEsc(s.nombre) + '</span></td>' +
            '<td>' + (subs || '<small class="text-muted">Sin sub-sistemas</small>') + '</td>' +
            '<td>' + (s.activo ? '<span class="badge bg-success-subtle text-success">Activo</span>' : '<span class="badge bg-secondary">Inact.</span>') + '</td>' +
            '<td class="text-end">' +
                '<button class="btn btn-xs btn-outline-primary me-1" onclick="window.abrirModalSistema(' + s.id + ')" title="Editar"><i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-xs btn-outline-danger" onclick="window.eliminarSistema(' + s.id + ')" title="Eliminar"><i class="bi bi-trash"></i></button>' +
            '</td>' +
        '</tr>';
    }).join('');
};

// ── Chips sub-sistemas ─────────────────────────────────────────
window._sisRenderSubsChips = function() {
    var cont = document.getElementById('sis-subs-chips');
    if (!cont) return;
    cont.innerHTML = (window._sisSubsActuales || []).map(function(n, i) {
        return '<span class="badge d-inline-flex align-items-center gap-1 px-2 py-1" style="background:var(--crm-accent,#007aff);color:#fff;font-size:0.75rem;border-radius:20px;">' +
            _sisEsc(n) +
            '<button type="button" onclick="window._sisQuitarSub(' + i + ')" style="background:none;border:none;color:#fff;padding:0 2px;line-height:1;cursor:pointer;font-size:0.9rem;">&times;</button>' +
        '</span>';
    }).join('');
};

window._sisAgregarSub = function(nombre) {
    var n = (nombre || '').trim().toUpperCase();
    if (!n) return;
    window._sisSubsActuales = window._sisSubsActuales || [];
    if (window._sisSubsActuales.indexOf(n) >= 0) return;
    window._sisSubsActuales.push(n);
    window._sisRenderSubsChips();
    var inp = document.getElementById('sis-subs-input');
    if (inp) inp.value = '';
};

window._sisQuitarSub = function(idx) {
    if (!window._sisSubsActuales) return;
    window._sisSubsActuales.splice(idx, 1);
    window._sisRenderSubsChips();
};

window._sisSubsKeydown = function(event) {
    if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        var inp = document.getElementById('sis-subs-input');
        if (inp && inp.value.trim()) window._sisAgregarSub(inp.value);
    }
};

// ── Modal ─────────────────────────────────────────────────────
window.abrirModalSistema = function(id) {
    var form = document.getElementById('form-sistema');
    if (form) form.reset();
    var editId = document.getElementById('sis-edit-id');
    if (editId) editId.value = '';
    window._sisSubsActuales = [];
    window._sisRenderSubsChips();
    var titulo = document.getElementById('modal-sis-titulo');

    if (id) {
        var item = (window._sisData || []).find(function(s) { return s.id == id; });
        if (!item) return;
        if (titulo) titulo.innerHTML = '<i class="bi bi-diagram-3-fill me-1"></i>Editar Sistema — ' + _sisEsc(item.nombre);
        if (editId) editId.value = item.id;
        var fn = document.getElementById('sis-f-nombre');
        var fo = document.getElementById('sis-f-orden');
        var fa = document.getElementById('sis-f-activo');
        if (fn) fn.value = item.nombre || '';
        if (fo) fo.value = item.orden || '';
        if (fa) fa.value = item.activo ? '1' : '0';
        window._sisSubsActuales = (item.sub_sistemas || []).slice();
        window._sisRenderSubsChips();
    } else {
        if (titulo) titulo.innerHTML = '<i class="bi bi-diagram-3-fill me-1"></i>Nuevo Sistema';
    }
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-sistema')).show();
};

window.guardarSistema = function(event) {
    if (event) event.preventDefault();
    var id   = (document.getElementById('sis-edit-id') || {}).value || '';
    var nombre = ((document.getElementById('sis-f-nombre') || {}).value || '').trim().toUpperCase();
    var orden  = parseInt((document.getElementById('sis-f-orden') || {}).value || '0') || 0;
    var activo = ((document.getElementById('sis-f-activo') || {}).value || '1');
    if (!nombre) { alert('El campo Nombre es obligatorio.'); return; }

    // Tomar sub del input si tiene algo
    var inp = document.getElementById('sis-subs-input');
    if (inp && inp.value.trim()) window._sisAgregarSub(inp.value);

    var url    = id ? '/api/almacen/sistemas/' + encodeURIComponent(id) : '/api/almacen/sistemas';
    var method = id ? 'PUT' : 'POST';
    fetch(url, { method: method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre, orden: orden, activo: activo === '1' ? 1 : 0,
            sub_sistemas: window._sisSubsActuales || [] }) })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        var m = bootstrap.Modal.getInstance(document.getElementById('modal-sistema'));
        if (m) m.hide();
        window.cargarSistemas();
    })
    .catch(function(err) { alert('Error al guardar: ' + err.message); });
};

window.eliminarSistema = function(id) {
    if (!confirm('¿Eliminar este sistema y todos sus sub-sistemas?')) return;
    fetch('/api/almacen/sistemas/' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() { window.cargarSistemas(); })
    .catch(function(err) { alert('Error: ' + err.message); });
};

function _sisEsc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
