// ================================================================
// MÓDULO ALMACÉN / FAMILIAS — Lógica SPA Aislada
// ================================================================

window._famData     = window._famData     || [];
window._famFiltrado = window._famFiltrado || [];

window.init_familias = function() {
    window.cargarFamilias();
};

// ── Cargar ─────────────────────────────────────────────────────
window.cargarFamilias = function() {
    var tb = document.getElementById('cuerpo-tabla-familias');
    if (tb) tb.innerHTML = '<tr><td colspan="4" class="text-center py-4"><div class="spinner-border spinner-border-sm me-2"></div>Cargando…</td></tr>';
    fetch('/api/almacen/familias')
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) {
            window._famData = data || [];
            window._famFiltrado = data || [];
            window.filtrarFamilias();
        })
        .catch(function(err) {
            var tb2 = document.getElementById('cuerpo-tabla-familias');
            if (tb2) tb2.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle me-1"></i>' + _famEsc(err.message) + '</td></tr>';
        });
};

// ── Filtrar ───────────────────────────────────────────────────
window.filtrarFamilias = function() {
    var q = ((document.getElementById('fam-buscar') || {}).value || '').toLowerCase().trim();
    window._famFiltrado = (window._famData || []).filter(function(f) {
        return !q ||
            (f.nombre || '').toLowerCase().includes(q) ||
            (f.descripcion || '').toLowerCase().includes(q);
    });
    window._famRender();
};

window._famRender = function() {
    var tb  = document.getElementById('cuerpo-tabla-familias');
    var cnt = document.getElementById('fam-contador');
    var datos = window._famFiltrado || [];
    if (cnt) cnt.textContent = datos.length + ' familia' + (datos.length !== 1 ? 's' : '');
    if (!tb) return;
    if (!datos.length) {
        tb.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-2 d-block mb-2"></i>Sin familias</td></tr>';
        return;
    }
    tb.innerHTML = datos.map(function(f) {
        return '<tr>' +
            '<td><span class="badge bg-primary fw-bold">' + _famEsc(f.nombre) + '</span></td>' +
            '<td class="text-muted small">' + _famEsc(f.descripcion || '—') + '</td>' +
            '<td>' + (f.activo ? '<span class="badge bg-success-subtle text-success">Activo</span>' : '<span class="badge bg-secondary">Inact.</span>') + '</td>' +
            '<td class="text-end">' +
                (window.checkPerm('cfg_almacen','e') ? '<button class="btn btn-xs btn-outline-primary me-1" onclick="window.abrirModalFamilia(' + f.id + ')" title="Editar"><i class="bi bi-pencil"></i></button>' : '') +
                (window.checkPerm('cfg_almacen','d') ? '<button class="btn btn-xs btn-outline-danger" onclick="window.eliminarFamilia(' + f.id + ')" title="Eliminar"><i class="bi bi-trash"></i></button>' : '') +
            '</td>' +
        '</tr>';
    }).join('');
};

// ── Modal ─────────────────────────────────────────────────────
window.abrirModalFamilia = function(id) {
    var form = document.getElementById('form-familia');
    if (form) form.reset();
    var editId = document.getElementById('fam-edit-id');
    if (editId) editId.value = '';
    var titulo = document.getElementById('modal-fam-titulo');

    if (id) {
        var item = (window._famData || []).find(function(f) { return f.id == id; });
        if (!item) return;
        if (titulo) titulo.innerHTML = '<i class="bi bi-tags-fill me-1"></i>Editar Familia — ' + _famEsc(item.nombre);
        if (editId) editId.value = item.id;
        var fn = document.getElementById('fam-f-nombre');
        var fd = document.getElementById('fam-f-descripcion');
        var fa = document.getElementById('fam-f-activo');
        if (fn) fn.value = item.nombre || '';
        if (fd) fd.value = item.descripcion || '';
        if (fa) fa.value = item.activo ? '1' : '0';
    } else {
        if (titulo) titulo.innerHTML = '<i class="bi bi-tags-fill me-1"></i>Nueva Familia';
    }
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-familia')).show();
};

window.guardarFamilia = function(event) {
    if (event) event.preventDefault();
    var id   = (document.getElementById('fam-edit-id') || {}).value || '';
    if (!window.guardAction('cfg_almacen', id ? 'e' : 'c')) return;
    var nombre = ((document.getElementById('fam-f-nombre') || {}).value || '').trim().toUpperCase();
    var desc   = ((document.getElementById('fam-f-descripcion') || {}).value || '').trim();
    var activo = ((document.getElementById('fam-f-activo') || {}).value || '1');
    if (!nombre) { alert('El campo Nombre es obligatorio.'); return; }

    var url    = id ? '/api/almacen/familias/' + encodeURIComponent(id) : '/api/almacen/familias';
    var method = id ? 'PUT' : 'POST';
    fetch(url, { method: method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre, descripcion: desc || null, activo: activo === '1' ? 1 : 0 }) })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        var m = bootstrap.Modal.getInstance(document.getElementById('modal-familia'));
        if (m) m.hide();
        window.cargarFamilias();
    })
    .catch(function(err) { alert('Error al guardar: ' + err.message); });
};

window.eliminarFamilia = function(id) {
    if (!window.guardAction('cfg_almacen', 'd')) return;
    if (!confirm('¿Eliminar esta familia?')) return;
    fetch('/api/almacen/familias/' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() { window.cargarFamilias(); })
    .catch(function(err) { alert('Error: ' + err.message); });
};

function _famEsc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
