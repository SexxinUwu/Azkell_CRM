// ================================================================
// MÓDULO ALMACÉN / UNIDADES DE MEDIDA — Lógica SPA Aislada
// ================================================================

window._undData     = window._undData     || [];
window._undFiltrado = window._undFiltrado || [];

window.init_unidades = function() {
    window.cargarUnidades();
};

// ── Cargar ─────────────────────────────────────────────────────
window.cargarUnidades = function() {
    var tb = document.getElementById('cuerpo-tabla-unidades');
    if (tb) tb.innerHTML = '<tr><td colspan="3" class="text-center py-4"><div class="spinner-border spinner-border-sm me-2"></div>Cargando…</td></tr>';
    fetch('/api/almacen/unidades')
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) {
            window._undData = data || [];
            window._undFiltrado = data || [];
            window.filtrarUnidades();
        })
        .catch(function(err) {
            var tb2 = document.getElementById('cuerpo-tabla-unidades');
            if (tb2) tb2.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle me-1"></i>' + _undEsc(err.message) + '</td></tr>';
        });
};

// ── Filtrar ───────────────────────────────────────────────────
window.filtrarUnidades = function() {
    var q = ((document.getElementById('und-buscar') || {}).value || '').toLowerCase().trim();
    window._undFiltrado = (window._undData || []).filter(function(u) {
        return !q ||
            (u.nombre || '').toLowerCase().includes(q) ||
            (u.descripcion || '').toLowerCase().includes(q);
    });
    window._undRender();
};

window._undRender = function() {
    var tb  = document.getElementById('cuerpo-tabla-unidades');
    var cnt = document.getElementById('und-contador');
    var datos = window._undFiltrado || [];
    if (cnt) cnt.textContent = datos.length + ' unidad' + (datos.length !== 1 ? 'es' : '');
    if (!tb) return;
    if (!datos.length) {
        tb.innerHTML = '<tr><td colspan="3" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-2 d-block mb-2"></i>Sin unidades</td></tr>';
        return;
    }
    tb.innerHTML = datos.map(function(u) {
        return '<tr>' +
            '<td>' + _undEsc(u.nombre || '—') + (u.descripcion ? '<br><small class="text-muted">' + _undEsc(u.descripcion) + '</small>' : '') + '</td>' +
            '<td>' + (u.activo ? '<span class="badge bg-success-subtle text-success">Activo</span>' : '<span class="badge bg-secondary">Inact.</span>') + '</td>' +
            '<td class="text-end">' +
                (window.checkPerm('cfg_almacen','e') ? '<button class="btn btn-xs btn-outline-primary me-1" onclick="window.abrirModalUnidad(' + u.id + ')" title="Editar"><i class="bi bi-pencil"></i></button>' : '') +
                (window.checkPerm('cfg_almacen','d') ? '<button class="btn btn-xs btn-outline-danger" onclick="window.eliminarUnidad(' + u.id + ')" title="Eliminar"><i class="bi bi-trash"></i></button>' : '') +
            '</td>' +
        '</tr>';
    }).join('');
};

// ── Modal ─────────────────────────────────────────────────────
window.abrirModalUnidad = function(id) {
    var form = document.getElementById('form-unidad');
    if (form) form.reset();
    var editId = document.getElementById('und-edit-id');
    if (editId) editId.value = '';
    var titulo = document.getElementById('modal-und-titulo');

    if (id) {
        var item = (window._undData || []).find(function(u) { return u.id == id; });
        if (!item) return;
        if (titulo) titulo.innerHTML = '<i class="bi bi-rulers me-1"></i>Editar Unidad — ' + _undEsc(item.nombre);
        if (editId) editId.value = item.id;
        var fn = document.getElementById('und-f-nombre');
        var fd = document.getElementById('und-f-descripcion');
        var fa = document.getElementById('und-f-activo');
        if (fn) fn.value = item.nombre || '';
        if (fd) fd.value = item.descripcion || '';
        if (fa) fa.value = item.activo ? '1' : '0';
    } else {
        if (titulo) titulo.innerHTML = '<i class="bi bi-rulers me-1"></i>Nueva Unidad';
    }
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-unidad')).show();
};

window.guardarUnidad = function(event) {
    if (event) event.preventDefault();
    var id   = (document.getElementById('und-edit-id') || {}).value || '';
    if (!window.guardAction('cfg_almacen', id ? 'e' : 'c')) return;
    var nombre = ((document.getElementById('und-f-nombre') || {}).value || '').trim().toUpperCase();
    var desc   = ((document.getElementById('und-f-descripcion') || {}).value || '').trim();
    var activo = ((document.getElementById('und-f-activo') || {}).value || '1');
    if (!nombre) { alert('El campo Código es obligatorio.'); return; }

    var url    = id ? '/api/almacen/unidades/' + encodeURIComponent(id) : '/api/almacen/unidades';
    var method = id ? 'PUT' : 'POST';
    fetch(url, { method: method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre, descripcion: desc || null, activo: activo === '1' ? 1 : 0 }) })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        var m = bootstrap.Modal.getInstance(document.getElementById('modal-unidad'));
        if (m) m.hide();
        window.cargarUnidades();
    })
    .catch(function(err) { alert('Error al guardar: ' + err.message); });
};

window.eliminarUnidad = function(id) {
    if (!window.guardAction('cfg_almacen', 'd')) return;
    if (!confirm('¿Eliminar esta unidad?')) return;
    fetch('/api/almacen/unidades/' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() { window.cargarUnidades(); })
    .catch(function(err) { alert('Error: ' + err.message); });
};

function _undEsc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
