// ================================================================
// Módulo Situaciones — Azkell Fleet
// Gestión del catálogo de situaciones (cat_situaciones)
// ================================================================

window.sitDatos     = window.sitDatos     || [];
window.sitFiltrados = window.sitFiltrados || [];

// ── Entry point ─────────────────────────────────────────────────
window.init_situaciones = function() {
    if (!window.checkPerm('ot', 'l') && !window.checkPerm('cfg_mant', 'l')) {
        window.showNoPermMsg('root-dinamico');
        return;
    }
    var btnNuevo = document.querySelector('[onclick*="sitNueva"]');
    if (btnNuevo) btnNuevo.style.display = window.checkPerm('ot', 'c') ? '' : 'none';
    sitCargar();
};

// ── Carga situaciones desde API ──────────────────────────────────
function sitCargar() {
    var tbody = document.getElementById('sit-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="sit-empty"><i class="bi bi-arrow-repeat me-2"></i>Cargando...</td></tr>';

    fetch('/api/catalogos_taller')
        .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function(d) {
            window.sitDatos = (d && d.situaciones) ? d.situaciones : [];
            window.sitFiltrados = window.sitDatos.slice();
            sitRenderizar();
        })
        .catch(function(e) {
            var tbody = document.getElementById('sit-tbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="sit-empty text-danger"><i class="bi bi-exclamation-circle me-2"></i>Error al cargar situaciones</td></tr>';
            console.error('sitCargar error:', e);
        });
}

// ── Render tabla ─────────────────────────────────────────────────
function sitRenderizar() {
    var tbody = document.getElementById('sit-tbody');
    if (!tbody) return;

    if (!window.sitFiltrados.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="sit-empty">No hay situaciones registradas</td></tr>';
        return;
    }

    var html = '';
    window.sitFiltrados.forEach(function(s, i) {
        var label = s.descripcion || s.nombre || '';
        html += '<tr>';
        html += '<td style="color:var(--subtext); font-size:0.78rem;">' + (i + 1) + '</td>';
        html += '<td><strong>' + _sitEsc(label) + '</strong></td>';
        html += '<td><span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;color:#6366f1;background:#6366f120;">'
              + '<span style="width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;"></span>'
              + _sitEsc(label)
              + '</span></td>';
        html += '<td style="text-align:right;">' +
            (window.checkPerm('ot','e') ? '<button class="btn btn-sm btn-outline-secondary me-1" onclick="window.sitEditar(' + s.id + ')" title="Editar"><i class="bi bi-pencil"></i></button>' : '') +
            (window.checkPerm('ot','d') ? '<button class="btn btn-sm btn-outline-danger" onclick="window.sitEliminar(' + s.id + ',\'' + _sitEsc(label) + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>' : '') +
            '</td>';
        html += '</tr>';
    });
    tbody.innerHTML = html;
}

// ── Búsqueda ─────────────────────────────────────────────────────
window.sitBuscar = function() {
    var q = (document.getElementById('sit-buscador') || {}).value || '';
    q = q.trim().toLowerCase();
    if (!q) {
        window.sitFiltrados = window.sitDatos.slice();
    } else {
        window.sitFiltrados = window.sitDatos.filter(function(s) {
            return (s.descripcion || s.nombre || '').toLowerCase().includes(q);
        });
    }
    sitRenderizar();
};

// ── Abrir drawer nueva ───────────────────────────────────────────
window.sitNueva = function() {
    var el;
    el = document.getElementById('sit-f-id');    if (el) el.value = '';
    el = document.getElementById('sit-f-nombre'); if (el) el.value = '';
    el = document.getElementById('sit-f-color');  if (el) el.value = '#6366f1';
    el = document.getElementById('sit-drawer-titulo'); if (el) el.textContent = 'Nueva Situación';
    sitActualizarPreview();
    sitAbrirDrawer();
};

// ── Abrir drawer editar ──────────────────────────────────────────
window.sitEditar = function(id) {
    var s = window.sitDatos.find(function(x) { return x.id == id; });
    if (!s) return;
    var el;
    el = document.getElementById('sit-f-id');    if (el) el.value = s.id;
    el = document.getElementById('sit-f-nombre'); if (el) el.value = s.descripcion || s.nombre || '';
    el = document.getElementById('sit-drawer-titulo'); if (el) el.textContent = 'Editar Situación';
    sitActualizarPreview();
    sitAbrirDrawer();
};

// ── Guardar (crear o editar) ─────────────────────────────────────
window.sitGuardar = function() {
    var idEl     = document.getElementById('sit-f-id');
    var nombreEl = document.getElementById('sit-f-nombre');
    var colorEl  = document.getElementById('sit-f-color');

    var nombre = nombreEl ? nombreEl.value.trim() : '';
    var color  = colorEl  ? colorEl.value  : '#94a3b8';
    var id     = idEl     ? idEl.value     : '';

    if (!window.guardAction('ot', id ? 'e' : 'c')) return;

    if (!nombre) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('El nombre es requerido', 'danger');
        if (nombreEl) nombreEl.focus();
        return;
    }

    var url    = id ? ('/api/cat-situaciones/' + id) : '/api/cat-situaciones';
    var method = id ? 'PUT' : 'POST';

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre, color: color })
    })
        .then(function(r) { return r.ok ? r.json() : r.json().then(function(e) { throw new Error(e.error || r.status); }); })
        .then(function() {
            sitCerrarDrawer();
            sitCargar();
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Situación guardada', 'success');
        })
        .catch(function(e) {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error: ' + e.message, 'danger');
        });
};

// ── Eliminar ─────────────────────────────────────────────────────
window.sitEliminar = function(id, nombre) {
    if (!window.guardAction('ot', 'd')) return;
    if (!confirm('¿Eliminar la situación "' + nombre + '"?\nEsta acción no se puede deshacer.')) return;

    fetch('/api/cat-situaciones/' + id, { method: 'DELETE' })
        .then(function(r) { return r.ok ? r.json() : r.json().then(function(e) { throw new Error(e.error || r.status); }); })
        .then(function() {
            sitCargar();
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Situación eliminada', 'success');
        })
        .catch(function(e) {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error: ' + e.message, 'danger');
        });
};

// ── Preview en tiempo real ───────────────────────────────────────
window.sitActualizarPreview = function() {
    var nombreEl = document.getElementById('sit-f-nombre');
    var colorEl  = document.getElementById('sit-f-color');
    var badge    = document.getElementById('sit-preview-badge');
    var dot      = document.getElementById('sit-preview-dot');
    var text     = document.getElementById('sit-preview-text');
    if (!badge) return;

    var nombre = (nombreEl && nombreEl.value.trim()) ? nombreEl.value.trim() : 'Nombre';
    var color  = (colorEl  && colorEl.value)         ? colorEl.value        : '#94a3b8';
    var bg     = color + '20';

    if (text)  text.textContent     = nombre;
    if (badge) badge.style.color    = color;
    if (badge) badge.style.background = bg;
};

// Listeners en tiempo real — adjuntados una vez en carga del módulo
(function() {
    function onReady() {
        var n = document.getElementById('sit-f-nombre');
        var c = document.getElementById('sit-f-color');
        if (n) n.addEventListener('input',  window.sitActualizarPreview);
        if (c) c.addEventListener('input',  window.sitActualizarPreview);
        if (c) c.addEventListener('change', window.sitActualizarPreview);
    }
    // El drawer ya existe en el DOM al cargar el módulo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        onReady();
    }
})();

// ── Drawer helpers ───────────────────────────────────────────────
function sitAbrirDrawer() {
    var bd = document.getElementById('sitDrawerBackdrop');
    var dr = document.getElementById('sit-drawer');
    if (bd) bd.classList.add('open');
    if (dr) dr.classList.add('open');
}

window.sitCerrarDrawer = function() {
    var bd = document.getElementById('sitDrawerBackdrop');
    var dr = document.getElementById('sit-drawer');
    if (bd) bd.classList.remove('open');
    if (dr) dr.classList.remove('open');
};

// ── Utilidad: escape HTML ─────────────────────────────────────────
function _sitEsc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
