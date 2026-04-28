// ================================================================
// MÓDULO ALMACÉN / MARCAS DE FABRICANTE — Lógica SPA Aislada
// ================================================================

window._mrcData     = window._mrcData     || [];
window._mrcFiltrado = window._mrcFiltrado || [];

window.init_marcas = function() {
    window.cargarMarcas();
};

// ── Cargar ─────────────────────────────────────────────────────
window.cargarMarcas = function() {
    var tb = document.getElementById('cuerpo-tabla-marcas');
    if (tb) tb.innerHTML = '<tr><td colspan="4" class="text-center py-4"><div class="spinner-border spinner-border-sm me-2"></div>Cargando…</td></tr>';
    fetch('/api/almacen/marcas')
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) {
            window._mrcData = data || [];
            window._mrcFiltrado = data || [];
            window.filtrarMarcas();
        })
        .catch(function(err) {
            var tb2 = document.getElementById('cuerpo-tabla-marcas');
            if (tb2) tb2.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle me-1"></i>' + _mrcEsc(err.message) + '</td></tr>';
        });
};

// ── Filtrar ───────────────────────────────────────────────────
window.filtrarMarcas = function() {
    var q = ((document.getElementById('mrc-buscar') || {}).value || '').toLowerCase().trim();
    window._mrcFiltrado = (window._mrcData || []).filter(function(m) {
        return !q ||
            (m.nombre || '').toLowerCase().includes(q) ||
            (m.descripcion || '').toLowerCase().includes(q);
    });
    window._mrcRender();
};

window._mrcRender = function() {
    var tb   = document.getElementById('cuerpo-tabla-marcas');
    var cnt  = document.getElementById('mrc-contador');
    var datos = window._mrcFiltrado || [];
    if (cnt) cnt.textContent = datos.length + ' marca' + (datos.length !== 1 ? 's' : '');
    if (!tb) return;
    if (!datos.length) {
        tb.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-2 d-block mb-2"></i>Sin marcas</td></tr>';
        return;
    }
    tb.innerHTML = datos.map(function(m) {
        return '<tr>' +
            '<td style="font-weight:700;color:var(--text);">' + _mrcEsc(m.nombre) + '</td>' +
            '<td class="text-muted small">' + _mrcEsc(m.descripcion || '—') + '</td>' +
            '<td>' + (m.activo ? '<span class="badge bg-success-subtle text-success">Activo</span>' : '<span class="badge bg-secondary">Inact.</span>') + '</td>' +
            '<td class="text-end">' +
                (window.checkPerm('cfg_almacen','e') ? '<button class="btn btn-xs btn-outline-primary me-1" onclick="window.abrirModalMarca(' + m.id + ')" title="Editar"><i class="bi bi-pencil"></i></button>' : '') +
                (window.checkPerm('cfg_almacen','d') ? '<button class="btn btn-xs btn-outline-danger" onclick="window.eliminarMarca(' + m.id + ')" title="Eliminar"><i class="bi bi-trash"></i></button>' : '') +
            '</td>' +
        '</tr>';
    }).join('');
};

// ── Modal ─────────────────────────────────────────────────────
window.abrirModalMarca = function(id) {
    var form = document.getElementById('form-marca');
    if (form) form.reset();
    var editId = document.getElementById('mrc-edit-id');
    if (editId) editId.value = '';
    var titulo = document.getElementById('modal-mrc-titulo');

    if (id) {
        var item = (window._mrcData || []).find(function(m) { return m.id == id; });
        if (!item) return;
        if (titulo) titulo.innerHTML = '<i class="bi bi-award-fill me-1"></i>Editar Marca — ' + _mrcEsc(item.nombre);
        if (editId) editId.value = item.id;
        var fn = document.getElementById('mrc-f-nombre');
        var fd = document.getElementById('mrc-f-descripcion');
        var fa = document.getElementById('mrc-f-activo');
        if (fn) fn.value = item.nombre || '';
        if (fd) fd.value = item.descripcion || '';
        if (fa) fa.value = item.activo ? '1' : '0';
    } else {
        if (titulo) titulo.innerHTML = '<i class="bi bi-award-fill me-1"></i>Nueva Marca';
    }
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-marca')).show();
};

window.guardarMarca = function(event) {
    if (event) event.preventDefault();
    var id     = (document.getElementById('mrc-edit-id') || {}).value || '';
    if (!window.guardAction('cfg_almacen', id ? 'e' : 'c')) return;
    var nombre = ((document.getElementById('mrc-f-nombre') || {}).value || '').trim().toUpperCase();
    var desc   = ((document.getElementById('mrc-f-descripcion') || {}).value || '').trim();
    var activo = ((document.getElementById('mrc-f-activo') || {}).value || '1');
    if (!nombre) { alert('El campo Nombre es obligatorio.'); return; }

    var url    = id ? '/api/almacen/marcas/' + encodeURIComponent(id) : '/api/almacen/marcas';
    var method = id ? 'PUT' : 'POST';
    fetch(url, { method: method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre, descripcion: desc || null, activo: activo === '1' ? 1 : 0 }) })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        var m = bootstrap.Modal.getInstance(document.getElementById('modal-marca'));
        if (m) m.hide();
        window.cargarMarcas();
    })
    .catch(function(err) { alert('Error al guardar: ' + err.message); });
};

window.eliminarMarca = function(id) {
    if (!window.guardAction('cfg_almacen', 'd')) return;
    if (!confirm('¿Eliminar esta marca?')) return;
    fetch('/api/almacen/marcas/' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() { window.cargarMarcas(); })
    .catch(function(err) { alert('Error: ' + err.message); });
};

function _mrcEsc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
