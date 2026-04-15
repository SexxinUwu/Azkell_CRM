// ================================================================
// MÓDULO ALMACÉN / PROVEEDORES — Lógica SPA Aislada
// ================================================================

window._provData      = window._provData      || [];
window._provFiltrados = window._provFiltrados || [];
window._provMarcas    = window._provMarcas    || [];

window.init_proveedores = function() {
    window.cargarProveedores();
};

window.cargarProveedores = function() {
    var tbody = document.getElementById('tbody-proveedores');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';
    fetch('/api/almacen/proveedores')
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(data) {
            window._provData = data;
            window._provFiltrados = data;
            window.filtrarProveedores();
        })
        .catch(function(err) {
            var t = document.getElementById('tbody-proveedores');
            if (t) t.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger">Error: '+err.message+'</td></tr>';
        });
};

window.filtrarProveedores = function() {
    var buscar  = ((document.getElementById('prov-buscar')||{}).value||'').toLowerCase();
    var filEst  = ((document.getElementById('prov-fil-estado')||{}).value||'');
    window._provFiltrados = (window._provData||[]).filter(function(d) {
        var matchB = !buscar ||
            (d.nombre||'').toLowerCase().includes(buscar)||
            (d.numero_documento||'').toLowerCase().includes(buscar)||
            (d.marcas||'').toLowerCase().includes(buscar)||
            (d.email||'').toLowerCase().includes(buscar);
        var matchE = !filEst || d.estado === filEst;
        return matchB && matchE;
    });
    window._provRender();
};

window._provRender = function() {
    var datos = window._provFiltrados || [];
    var cont  = document.getElementById('prov-contador');
    if (cont) cont.textContent = datos.length + ' proveedor' + (datos.length!==1?'es':'');
    var tbody = document.getElementById('tbody-proveedores');
    if (!tbody) return;
    if (!datos.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox me-2"></i>Sin proveedores</td></tr>';
        return;
    }
    tbody.innerHTML = datos.map(function(d) {
        var estadoBadge = d.estado === 'Activo'
            ? '<span class="badge bg-success-subtle text-success">Activo</span>'
            : '<span class="badge bg-secondary">Inactivo</span>';
        var marcasBadges = d.marcas
            ? d.marcas.split(', ').map(function(m) { return '<span class="badge bg-info-subtle text-info border border-info border-opacity-25 ms-1">'+_provEsc(m)+'</span>'; }).join('')
            : '—';
        return '<tr>'+
            '<td><span class="badge bg-secondary fw-normal">'+_provEsc(d.id||'')+'</span></td>'+
            '<td>'+_provEsc(d.nombre||'')+(d.razon_social?'<br><small class="text-muted">'+_provEsc(d.razon_social)+'</small>':'')+'</td>'+
            '<td><span class="badge bg-light text-dark border">'+_provEsc(d.tipo_documento||'—')+'</span></td>'+
            '<td>'+_provEsc(d.numero_documento||'—')+'</td>'+
            '<td><small>'+_provEsc(d.telefono||'—')+'</small></td>'+
            '<td>'+marcasBadges+'</td>'+
            '<td>'+estadoBadge+'</td>'+
            '<td class="text-center"><div class="d-flex gap-1 justify-content-center">'+
                '<button class="btn btn-xs btn-outline-primary" onclick="window.abrirModalProveedor(\''+_provEsc(d.id)+'\')" title="Editar"><i class="bi bi-pencil"></i></button>'+
                '<button class="btn btn-xs btn-outline-danger" onclick="window.eliminarProveedor(\''+_provEsc(d.id)+'\')" title="Eliminar"><i class="bi bi-trash"></i></button>'+
            '</div></td>'+
        '</tr>';
    }).join('');
};

// ── Tags de marca ─────────────────────────────────────────────────
window._provAgregarMarca = function() {
    var input = document.getElementById('prov-f-marca-input');
    if (!input) return;
    var val = input.value.trim().toUpperCase();
    if (!val) return;
    if (!window._provMarcas.includes(val)) {
        window._provMarcas.push(val);
        window._provRenderTags();
    }
    input.value = '';
    input.focus();
};

window._provQuitarMarca = function(marca) {
    window._provMarcas = (window._provMarcas||[]).filter(function(m) { return m !== marca; });
    window._provRenderTags();
};

window._provRenderTags = function() {
    var cont = document.getElementById('prov-marcas-tags');
    if (!cont) return;
    cont.innerHTML = (window._provMarcas||[]).map(function(m) {
        return '<span class="badge bg-primary d-inline-flex align-items-center gap-1">'+_provEsc(m)+
            '<button type="button" class="btn-close btn-close-white btn-sm" onclick="window._provQuitarMarca(\''+_provEsc(m)+'\')" style="font-size:0.55rem;"></button></span>';
    }).join('');
};

// ── Modal ─────────────────────────────────────────────────────────
window.abrirModalProveedor = function(id) {
    var titulo = document.getElementById('modal-prov-titulo');
    var editId = document.getElementById('prov-edit-id');
    var form   = document.getElementById('form-proveedor');
    if (!form) return;
    form.reset();
    if (editId) editId.value = '';
    window._provMarcas = [];

    if (id) {
        var item = (window._provData||[]).find(function(d) { return d.id === id; });
        if (!item) return;
        if (titulo) titulo.innerHTML = '<i class="bi bi-pencil-fill me-1"></i>Editar Proveedor — '+id;
        if (editId) editId.value = id;
        _pSet('prov-f-nombre',   item.nombre);
        _pSet('prov-f-razon',    item.razon_social);
        _pSet('prov-f-tipo-doc', item.tipo_documento || 'RUC');
        _pSet('prov-f-num-doc',  item.numero_documento);
        _pSet('prov-f-telefono', item.telefono);
        _pSet('prov-f-email',    item.email);
        _pSet('prov-f-dir',      item.direccion);
        _pSet('prov-f-estado',   item.estado || 'Activo');
        _pSet('prov-f-obs',      item.observaciones);
        window._provMarcas = item.marcas ? item.marcas.split(', ').filter(Boolean) : [];
    } else {
        if (titulo) titulo.innerHTML = '<i class="bi bi-building-fill me-1"></i>Nuevo Proveedor';
    }
    window._provRenderTags();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-proveedor')).show();
};

function _pSet(id, val) { var el = document.getElementById(id); if(el) el.value = val != null ? val : ''; }
function _provEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Guardar ───────────────────────────────────────────────────────
window.guardarProveedor = function(event) {
    if (event) event.preventDefault();
    var id = (document.getElementById('prov-edit-id')||{}).value || '';
    var payload = {
        nombre:          (document.getElementById('prov-f-nombre')   ||{}).value || '',
        razon_social:    (document.getElementById('prov-f-razon')    ||{}).value || '',
        tipo_documento:  (document.getElementById('prov-f-tipo-doc') ||{}).value || 'RUC',
        numero_documento:(document.getElementById('prov-f-num-doc')  ||{}).value || '',
        telefono:        (document.getElementById('prov-f-telefono') ||{}).value || '',
        email:           (document.getElementById('prov-f-email')    ||{}).value || '',
        direccion:       (document.getElementById('prov-f-dir')      ||{}).value || '',
        estado:          (document.getElementById('prov-f-estado')   ||{}).value || 'Activo',
        observaciones:   (document.getElementById('prov-f-obs')      ||{}).value || '',
        marcas:          window._provMarcas || []
    };
    if (!payload.nombre) { alert('El nombre es obligatorio.'); return; }
    var url    = id ? '/api/almacen/proveedores/'+encodeURIComponent(id) : '/api/almacen/proveedores';
    var method = id ? 'PUT' : 'POST';
    fetch(url, { method: method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function() {
            bootstrap.Modal.getInstance(document.getElementById('modal-proveedor'))?.hide();
            window.cargarProveedores();
        })
        .catch(function(err) { alert('Error: '+err.message); });
};

// ── Eliminar ──────────────────────────────────────────────────────
window.eliminarProveedor = function(id) {
    if (!confirm('¿Eliminar proveedor '+id+'?')) return;
    fetch('/api/almacen/proveedores/'+encodeURIComponent(id), { method: 'DELETE' })
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function() { window.cargarProveedores(); })
        .catch(function(err) { alert('Error: '+err.message); });
};
