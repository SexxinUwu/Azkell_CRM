// ================================================================
// Módulo Tipos de Preventivo — Azkell Fleet
// Lista maestra de tipos de MP usada en toda la aplicación
// ================================================================

window.tiposMpData    = window.tiposMpData    || [];
window.tiposMpDataFil = window.tiposMpDataFil || [];

function _tiposBsModal(el) {
    if (!el) return { show: function(){}, hide: function(){} };
    return bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el);
}

// ── Entry point ───────────────────────────────────────────────────
window['init_tipos-mp'] = function() {
    if (!window.checkPerm('cfg_mant', 'l')) {
        window.showNoPermMsg('root-dinamico');
        return;
    }
    window.tiposMpCargar();
};

// ── Cargar tabla ──────────────────────────────────────────────────
window.tiposMpCargar = function() {
    var tb = document.getElementById('tiposmp-tbody');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="3" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>';
    fetch('/api/tipos-preventivo')
        .then(function(r) { return r.ok ? r.json() : { data: [] }; })
        .then(function(j) {
            window.tiposMpData    = j.data || [];
            window.tiposMpDataFil = window.tiposMpData.slice();
            window.tiposMpFiltrar();
        })
        .catch(function(e) { console.error(e); });
};

// ── Filtrar tabla ─────────────────────────────────────────────────
window.tiposMpFiltrar = function() {
    var q = ((document.getElementById('tiposmp-buscador') || {}).value || '').trim().toUpperCase();
    window.tiposMpDataFil = q
        ? window.tiposMpData.filter(function(t) {
            return (t.nombre || '').toUpperCase().includes(q) ||
                   (t.descripcion || '').toUpperCase().includes(q);
          })
        : window.tiposMpData.slice();

    var cnt = document.getElementById('tiposmp-count');
    if (cnt) cnt.textContent = window.tiposMpDataFil.length + ' tipo(s)';

    var tb = document.getElementById('tiposmp-tbody');
    if (!tb) return;
    if (!window.tiposMpDataFil.length) {
        tb.innerHTML = '<tr><td colspan="3" class="text-center py-4" style="color:var(--subtext)">Sin tipos de preventivo</td></tr>';
        return;
    }
    tb.innerHTML = window.tiposMpDataFil.map(function(t) {
        return '<tr>' +
            '<td><span class="badge bg-primary" style="font-size:0.78rem;letter-spacing:0.3px">' + _escHtml(t.nombre) + '</span></td>' +
            '<td style="color:var(--subtext); font-size:0.8rem">' + _escHtml(t.descripcion || '—') + '</td>' +
            '<td class="text-end">' +
                '<button class="btn btn-xs btn-outline-secondary me-1" onclick="window.tiposMpEditar(' + t.id + ')" style="font-size:0.7rem;padding:1px 6px"><i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-xs btn-outline-danger" onclick="window.tiposMpEliminar(' + t.id + ',\'' + (t.nombre || '').replace(/'/g, '') + '\')" style="font-size:0.7rem;padding:1px 6px"><i class="bi bi-trash"></i></button>' +
            '</td></tr>';
    }).join('');
};

function _escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Abrir modal nuevo ─────────────────────────────────────────────
window.tiposMpAbrirModal = function() {
    var idEl = document.getElementById('tiposmp-id');
    var nm   = document.getElementById('tiposmp-nombre');
    var dc   = document.getElementById('tiposmp-desc');
    if (idEl) idEl.value = '';
    if (nm)   nm.value   = '';
    if (dc)   dc.value   = '';
    var t = document.getElementById('tiposMpModal-titulo');
    if (t) t.innerHTML = '<i class="bi bi-plus-circle me-1 text-primary"></i>Nuevo Tipo de Preventivo';
    _tiposBsModal(document.getElementById('tiposMpModal')).show();
    setTimeout(function() { var el = document.getElementById('tiposmp-nombre'); if (el) el.focus(); }, 400);
};

// ── Editar ────────────────────────────────────────────────────────
window.tiposMpEditar = function(id) {
    var item = window.tiposMpData.find(function(x) { return x.id === id; });
    if (!item) return;
    var idEl = document.getElementById('tiposmp-id');
    var nm   = document.getElementById('tiposmp-nombre');
    var dc   = document.getElementById('tiposmp-desc');
    if (idEl) idEl.value = item.id;
    if (nm)   nm.value   = item.nombre || '';
    if (dc)   dc.value   = item.descripcion || '';
    var t = document.getElementById('tiposMpModal-titulo');
    if (t) t.innerHTML = '<i class="bi bi-pencil me-1 text-primary"></i>Editar — ' + _escHtml(item.nombre);
    _tiposBsModal(document.getElementById('tiposMpModal')).show();
};

// ── Guardar ───────────────────────────────────────────────────────
window.tiposMpGuardar = function() {
    var id     = (document.getElementById('tiposmp-id')     || {}).value || '';
    var nombre = ((document.getElementById('tiposmp-nombre') || {}).value || '').trim().toUpperCase();
    var desc   = ((document.getElementById('tiposmp-desc')   || {}).value || '').trim();
    if (!nombre) return window.mostrarToast('El nombre es requerido', 'warning');

    var url    = id ? '/api/tipos-preventivo/' + id : '/api/tipos-preventivo';
    var method = id ? 'PUT' : 'POST';
    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre, descripcion: desc || null })
    })
    .then(function(r) { return r.ok ? r.json() : r.json().then(function(e) { throw new Error(e.error); }); })
    .then(function() {
        _tiposBsModal(document.getElementById('tiposMpModal')).hide();
        window.mostrarToast('Tipo guardado', 'success');
        window.tiposMpCargar();
    })
    .catch(function(e) { window.mostrarToast('Error: ' + e.message, 'error'); });
};

// ── Eliminar ──────────────────────────────────────────────────────
window.tiposMpEliminar = function(id, nombre) {
    if (!confirm('¿Eliminar el tipo "' + nombre + '"?\nSe mantendrán los registros históricos.')) return;
    fetch('/api/tipos-preventivo/' + id, { method: 'DELETE' })
        .then(function(r) { return r.ok ? r.json() : r.json().then(function(e) { throw new Error(e.error); }); })
        .then(function() { window.mostrarToast('Tipo eliminado', 'success'); window.tiposMpCargar(); })
        .catch(function(e) { window.mostrarToast('Error: ' + e.message, 'error'); });
};

// ── Sync desde Frecuencias MP ─────────────────────────────────────
window.tiposMpSyncDesdeFrec = function() {
    if (!confirm('Esto importará todos los tipos de MP que existan en Frecuencias MP (si no están ya en esta lista). ¿Continuar?')) return;
    fetch('/api/tipos-preventivo/sync-desde-frecuencias', { method: 'POST' })
        .then(function(r) { return r.ok ? r.json() : r.json().then(function(e) { throw new Error(e.error); }); })
        .then(function(res) {
            window.mostrarToast('Sincronización: ' + res.insertados + ' tipo(s) importado(s)', 'success');
            window.tiposMpCargar();
        })
        .catch(function(e) { window.mostrarToast('Error: ' + e.message, 'error'); });
};
