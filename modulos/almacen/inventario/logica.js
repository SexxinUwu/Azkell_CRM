// ================================================================
// MÓDULO ALMACÉN / INVENTARIO — Lógica SPA Aislada v2 (Cards)
// Convención: window.var = window.var || default (no let/const globales)
// ================================================================

window._invData        = window._invData        || [];
window._invFiltrados   = window._invFiltrados   || [];
window._invPagActual   = window._invPagActual   || 1;
window._invProveedores = window._invProveedores || [];
var _INV_POR_PAG = 24; // múltiplo de 4 para grids

window.init_inventario = function() {
    window._invPagActual = 1;
    window.cargarInventario();
    window._cargarProveedoresInv();
};

// ── Cargar datos ─────────────────────────────────────────────────
window.cargarInventario = function() {
    var grid = document.getElementById('inv-grid');
    if (grid) grid.innerHTML = '<div class="col-12 text-center py-5 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Cargando inventario…</div>';
    fetch('/api/almacen/inventario')
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) {
            window._invData = data;
            window._invFiltrados = data;
            window._invPoblarFiltros(data);
            window.filtrarInventario();
        })
        .catch(function(err) {
            var g = document.getElementById('inv-grid');
            if (g) g.innerHTML = '<div class="col-12 text-center py-4 text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Error: ' + err.message + '</div>';
        });
};

window._cargarProveedoresInv = function() {
    fetch('/api/almacen/proveedores')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._invProveedores = data || [];
            var dl = document.getElementById('inv-list-proveedores');
            if (!dl) return;
            dl.innerHTML = '';
            data.forEach(function(p) {
                var opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.nombre;
                dl.appendChild(opt);
            });
        })
        .catch(function() {});
};

window._invPoblarFiltros = function(data) {
    var familias = {}, almacenes = {};
    data.forEach(function(d) {
        if (d.familia) familias[d.familia] = 1;
        if (d.almacen) almacenes[d.almacen] = 1;
    });

    var selF = document.getElementById('inv-fil-familia');
    var selA = document.getElementById('inv-fil-almacen');
    var prevF = selF ? selF.value : '';
    var prevA = selA ? selA.value : '';

    if (selF) {
        selF.innerHTML = '<option value="">Todas las familias</option>' +
            Object.keys(familias).sort().map(function(f) {
                return '<option value="' + _invEsc(f) + '"' + (f === prevF ? ' selected' : '') + '>' + _invEsc(f) + '</option>';
            }).join('');
    }
    if (selA) {
        selA.innerHTML = '<option value="">Todos los almacenes</option>' +
            Object.keys(almacenes).sort().map(function(a) {
                return '<option value="' + _invEsc(a) + '"' + (a === prevA ? ' selected' : '') + '>' + _invEsc(a) + '</option>';
            }).join('');
    }

    var dlF = document.getElementById('inv-list-familias');
    if (dlF) dlF.innerHTML = Object.keys(familias).sort().map(function(f) { return '<option value="' + _invEsc(f) + '">'; }).join('');
    var dlA = document.getElementById('inv-list-almacenes');
    if (dlA) dlA.innerHTML = Object.keys(almacenes).sort().map(function(a) { return '<option value="' + _invEsc(a) + '">'; }).join('');
};

// ── Filtrar ───────────────────────────────────────────────────────
window.filtrarInventario = function() {
    var buscar  = ((document.getElementById('inv-buscar')       || {}).value || '').toLowerCase().trim();
    var filFam  = ((document.getElementById('inv-fil-familia')  || {}).value || '');
    var filSis  = ((document.getElementById('inv-fil-sistema')  || {}).value || '');
    var filAlm  = ((document.getElementById('inv-fil-almacen')  || {}).value || '');
    window._invFiltrados = (window._invData || []).filter(function(d) {
        var matchB = !buscar ||
            (d.id           || '').toLowerCase().includes(buscar) ||
            (d.descripcion  || '').toLowerCase().includes(buscar) ||
            (d.marca        || '').toLowerCase().includes(buscar) ||
            (d.familia      || '').toLowerCase().includes(buscar) ||
            (d.codigo_item  || '').toLowerCase().includes(buscar) ||
            (d.codigo_barras|| '').toLowerCase().includes(buscar);
        var matchF = !filFam || d.familia === filFam;
        var matchS = !filSis || d.sistema === filSis;
        var matchA = !filAlm || d.almacen === filAlm;
        return matchB && matchF && matchS && matchA;
    });
    window._invPagActual = 1;
    window._invRender();
};

// ── Helpers de stock badge ────────────────────────────────────────
function _invStockBadge(d) {
    var stock   = parseFloat(d.stock_actual != null ? d.stock_actual : 0);
    var stockMin = parseFloat(d.stock_min || 0);
    var cls = stock <= 0
        ? 'bg-danger'
        : (stockMin > 0 && stock <= stockMin)
            ? 'bg-warning text-dark'
            : 'bg-success';
    return '<span class="badge ' + cls + '">' + stock.toLocaleString('es-PE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '</span>';
}

// ── Render Cards ─────────────────────────────────────────────────
window._invRender = function() {
    var datos    = window._invFiltrados || [];
    var total    = datos.length;
    var totalPag = Math.max(1, Math.ceil(total / _INV_POR_PAG));
    var pag      = Math.min(window._invPagActual, totalPag);
    window._invPagActual = pag;
    var desde  = (pag - 1) * _INV_POR_PAG;
    var pagina = datos.slice(desde, desde + _INV_POR_PAG);

    var cont = document.getElementById('inv-contador');
    if (cont) cont.textContent = total + ' artículo' + (total !== 1 ? 's' : '');

    var grid = document.getElementById('inv-grid');
    if (!grid) return;

    if (!pagina.length) {
        grid.innerHTML = '<div class="col-12 text-center py-5 text-muted"><i class="bi bi-inbox fs-3 d-block mb-2"></i>Sin artículos encontrados</div>';
    } else {
        grid.innerHTML = pagina.map(function(d) {
            return _invRenderCard(d);
        }).join('');
    }

    // Paginación
    var paginEl = document.getElementById('inv-paginacion');
    if (paginEl) {
        if (totalPag <= 1) { paginEl.innerHTML = ''; return; }
        var btns = '';
        btns += '<button class="btn btn-sm btn-outline-secondary" ' + (pag <= 1 ? 'disabled' : '') + ' onclick="window._invIrPag(' + (pag - 1) + ')"><i class="bi bi-chevron-left"></i></button>';
        btns += '<span class="small text-muted mx-2">Pág. ' + pag + ' / ' + totalPag + '</span>';
        btns += '<button class="btn btn-sm btn-outline-secondary" ' + (pag >= totalPag ? 'disabled' : '') + ' onclick="window._invIrPag(' + (pag + 1) + ')"><i class="bi bi-chevron-right"></i></button>';
        paginEl.innerHTML = '<div class="d-flex align-items-center gap-1">' + btns + '</div>';
    }
};

function _invRenderCard(d) {
    var hasImg = d.imagen_url && d.imagen_url.length > 0;
    var imgHtml = hasImg
        ? '<img src="' + _invEsc(d.imagen_url) + '" class="card-img-top" style="height:130px;object-fit:cover;" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
          '<div class="d-none align-items-center justify-content-center text-muted" style="height:130px;background:var(--surface);"><i class="bi bi-image fs-3"></i></div>'
        : '<div class="d-flex align-items-center justify-content-center text-muted" style="height:130px;background:var(--surface);"><i class="bi bi-box fs-2"></i></div>';

    var sistemaBadge = d.sistema
        ? '<span class="badge bg-secondary fw-normal" style="font-size:0.6rem;">' + _invEsc(d.sistema) + '</span>'
        : '';

    var id = _invEsc(d.id || '');
    var desc = _invEsc(d.descripcion || '');
    var unid = _invEsc(d.unidad || '');

    return '<div class="col-6 col-sm-4 col-md-3 col-xxl-2">' +
        '<div class="card h-100 border-0 shadow-sm" style="border-radius:10px;overflow:hidden;">' +
            '<div class="position-relative inv-card-img" onclick="window.abrirDetalleInv(\'' + id + '\')" style="cursor:pointer;">' +
                imgHtml +
                '<span class="badge bg-dark bg-opacity-75 position-absolute top-0 start-0 m-1" style="font-size:0.6rem;backdrop-filter:blur(4px);">' + id + '</span>' +
                (d.stock_min > 0 && parseFloat(d.stock_actual || 0) <= parseFloat(d.stock_min) && parseFloat(d.stock_actual || 0) > 0
                    ? '<span class="badge bg-warning text-dark position-absolute top-0 end-0 m-1" style="font-size:0.6rem;" title="Stock bajo mínimo"><i class="bi bi-exclamation-triangle-fill"></i></span>' : '') +
                (parseFloat(d.stock_actual || 0) <= 0
                    ? '<span class="badge bg-danger position-absolute top-0 end-0 m-1" style="font-size:0.6rem;" title="Sin stock"><i class="bi bi-x-circle-fill"></i></span>' : '') +
            '</div>' +
            '<div class="card-body p-2" onclick="window.abrirDetalleInv(\'' + id + '\')" style="cursor:pointer;">' +
                '<div class="fw-semibold small mb-1" style="font-size:0.8rem;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;" title="' + desc + '">' + desc + '</div>' +
                '<div class="d-flex justify-content-between align-items-center gap-1 flex-wrap">' +
                    sistemaBadge +
                    _invStockBadge(d) + (unid ? '<small class="text-muted">' + unid + '</small>' : '') +
                '</div>' +
            '</div>' +
            '<div class="card-footer p-1 bg-transparent border-top d-flex gap-1 justify-content-end">' +
                '<button class="btn btn-xs btn-outline-primary" title="Editar" onclick="window.abrirModalInventario(\'' + id + '\')"><i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-xs btn-outline-danger" title="Eliminar" onclick="window.eliminarArticuloInv(\'' + id + '\')"><i class="bi bi-trash"></i></button>' +
            '</div>' +
        '</div>' +
    '</div>';
}

window._invIrPag = function(n) { window._invPagActual = n; window._invRender(); };
function _invEsc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ── Modal Detalle (Vista Rápida) ──────────────────────────────────
window.abrirDetalleInv = function(id) {
    var item = (window._invData || []).find(function(d) { return d.id === id; });
    if (!item) return;
    var el = document.getElementById('modal-inv-detalle');
    if (!el) return;

    var titulo = document.getElementById('modal-det-titulo');
    if (titulo) titulo.textContent = item.id + ' — ' + (item.descripcion || '');

    var btnEditar = document.getElementById('modal-det-btn-editar');
    if (btnEditar) {
        btnEditar.onclick = function() {
            bootstrap.Modal.getInstance(el).hide();
            setTimeout(function() { window.abrirModalInventario(id); }, 300);
        };
    }

    var hasImg = item.imagen_url && item.imagen_url.length > 0;
    var stock = parseFloat(item.stock_actual != null ? item.stock_actual : 0);
    var stockCls = stock <= 0 ? 'danger' : (item.stock_min > 0 && stock <= parseFloat(item.stock_min || 0) ? 'warning' : 'success');

    var body = document.getElementById('modal-det-body');
    if (body) {
        body.innerHTML =
            '<div class="row g-3">' +
                '<div class="col-md-4 text-center">' +
                    (hasImg
                        ? '<img src="' + _invEsc(item.imagen_url) + '" class="img-fluid rounded mb-2" style="max-height:200px;object-fit:contain;">'
                        : '<div class="d-flex align-items-center justify-content-center rounded mb-2 text-muted" style="height:160px;background:var(--surface);"><i class="bi bi-box fs-1"></i></div>') +
                    '<div><img id="det-qr" src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(item.id) + '" alt="QR" style="width:90px;height:90px;" title="QR: ' + _invEsc(item.id) + '"></div>' +
                '</div>' +
                '<div class="col-md-8">' +
                    '<h6 class="fw-bold mb-2">' + _invEsc(item.descripcion) + '</h6>' +
                    '<div class="row g-2 small">' +
                        _detRow('Código', '<span class="badge bg-secondary">' + _invEsc(item.id) + '</span>') +
                        _detRow('Familia', item.familia) +
                        _detRow('Sistema', item.sistema ? '<span class="badge bg-warning text-dark">' + _invEsc(item.sistema) + '</span>' : '—') +
                        _detRow('Tipo', item.tipo ? _invEsc(item.tipo) + (item.sub_tipo ? ' / ' + _invEsc(item.sub_tipo) : '') : '—') +
                        _detRow('Almacén', item.almacen) +
                        _detRow('Ubicación', item.ubicacion) +
                        _detRow('Unidad', item.unidad) +
                        _detRow('Costo Ref.', (item.moneda === 'USD' ? '$ ' : 'S/ ') + parseFloat(item.costo_referencial || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})) +
                        _detRow('Stock', '<span class="badge bg-' + stockCls + (stockCls === 'warning' ? ' text-dark' : '') + ' fs-6">' + stock.toLocaleString('es-PE', {minimumFractionDigits: 2}) + ' ' + _invEsc(item.unidad || '') + '</span>') +
                        _detRow('Stock Min/Max', parseFloat(item.stock_min || 0) + ' / ' + parseFloat(item.stock_max || 0)) +
                        _detRow('Estado', item.estado_art || 'Activo') +
                        (item.observaciones ? _detRow('Obs.', item.observaciones) : '') +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    bootstrap.Modal.getOrCreateInstance(el).show();
};

function _detRow(lbl, val) {
    return '<div class="col-5 text-muted">' + lbl + ':</div><div class="col-7 fw-semibold">' + (val || '—') + '</div>';
}

// ── Modal Add / Edit ─────────────────────────────────────────────
window.abrirModalInventario = function(id) {
    var titulo = document.getElementById('modal-inv-titulo');
    var form   = document.getElementById('form-inv-articulo');
    if (!form) return;
    form.reset();
    var editId = document.getElementById('inv-edit-id');
    if (editId) editId.value = '';

    // Resetear tab a Datos Básicos
    var firstTab = document.querySelector('#inv-modal-tabs .nav-link');
    if (firstTab) {
        document.querySelectorAll('#inv-modal-tabs .nav-link').forEach(function(t) { t.classList.remove('active'); });
        firstTab.classList.add('active');
        document.querySelectorAll('#modal-inv-articulo .tab-pane').forEach(function(p) { p.classList.remove('show', 'active'); });
        var basico = document.getElementById('inv-tab-basico');
        if (basico) { basico.classList.add('show', 'active'); }
    }

    // Reset imagen UI
    _invResetImageUI(null);

    if (id) {
        var item = (window._invData || []).find(function(d) { return d.id === id; });
        if (!item) return;
        if (titulo) titulo.innerHTML = '<i class="bi bi-pencil-fill me-1"></i>Editar Artículo — ' + id;
        if (editId) editId.value = id;

        // Tab Datos
        _invSetField('inv-f-descripcion', item.descripcion);
        _invSetField('inv-f-familia',     item.familia);
        _invSetField('inv-f-subfamilia',  item.sub_familia);
        _invSetField('inv-f-almacen',     item.almacen);
        _invSetField('inv-f-unidad',      item.unidad);
        _invSetField('inv-f-moneda',      item.moneda || 'PEN');
        _invSetField('inv-f-costo',       item.costo_referencial);
        _invSetField('inv-f-marca',       item.marca);
        _invSetField('inv-f-stock-reg',   item.stock_regularizado);
        _invSetField('inv-f-fecha-reg',   item.fecha_regularizacion ? String(item.fecha_regularizacion).split('T')[0] : '');
        _invSetField('inv-f-proveedor-id', item.proveedor_id);
        _invSetField('inv-f-obs',         item.observaciones);

        // Tab Clasificación
        _invSetField('inv-f-codigo-item',   item.codigo_item);
        _invSetField('inv-f-marca-unidad',  item.marca_unidad);
        _invSetField('inv-f-sistema',       item.sistema);
        _invSetField('inv-f-sub-sistema',   item.sub_sistema);
        _invSetField('inv-f-tipo',          item.tipo);
        _invSetField('inv-f-sub-tipo',      item.sub_tipo);
        _invSetField('inv-f-ubicacion',     item.ubicacion);
        _invSetField('inv-f-anaquel',       item.anaquel);
        _invSetField('inv-f-estado-art',    item.estado_art || 'Activo');
        _invSetField('inv-f-stock-min',     item.stock_min);
        _invSetField('inv-f-stock-max',     item.stock_max);
        _invSetField('inv-f-codigo-barras', item.codigo_barras);

        // Tab Imagen + QR existente
        _invResetImageUI(item);
    } else {
        if (titulo) titulo.innerHTML = '<i class="bi bi-box-fill me-1"></i>Nuevo Artículo';
    }

    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-inv-articulo'));
    modal.show();
};

function _invResetImageUI(item) {
    var aviso   = document.getElementById('inv-img-nuevo-aviso');
    var section = document.getElementById('inv-img-section');
    var preview = document.getElementById('inv-img-preview');
    var placeholder = document.getElementById('inv-img-placeholder');
    var btnQuitar = document.getElementById('inv-img-btn-quitar');
    var qrWrap    = document.getElementById('inv-qr-wrap');
    var qrPlaceholder = document.getElementById('inv-qr-placeholder');
    var qrImg     = document.getElementById('inv-qr-img');
    var qrLabel   = document.getElementById('inv-qr-label');

    if (!item) {
        // Nuevo artículo
        if (aviso)   { aviso.style.display = ''; }
        if (section) { section.style.display = 'none'; }
        return;
    }

    // Artículo existente
    if (aviso)   { aviso.style.display = 'none'; }
    if (section) { section.style.display = ''; }

    if (item.imagen_url) {
        if (preview)     { preview.src = item.imagen_url; preview.style.display = ''; }
        if (placeholder) { placeholder.style.display = 'none'; }
        if (btnQuitar)   { btnQuitar.style.display = ''; }
    } else {
        if (preview)     { preview.src = ''; preview.style.display = 'none'; }
        if (placeholder) { placeholder.style.display = ''; }
        if (btnQuitar)   { btnQuitar.style.display = 'none'; }
    }

    // QR
    if (qrWrap && qrPlaceholder && item.id) {
        qrWrap.style.display = '';
        qrWrap.style.removeProperty('display');
        qrWrap.removeAttribute('style');
        qrWrap.style.display = 'inline-flex';
        if (qrPlaceholder) qrPlaceholder.style.display = 'none';
        if (qrImg) qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent(item.id);
        if (qrLabel) qrLabel.textContent = item.id;
    }
}

function _invSetField(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val != null ? val : '';
}

// ── Image Upload ──────────────────────────────────────────────────
window._invSubirImagen = function(event) {
    var file = event.target.files[0];
    if (!file) return;
    var id = (document.getElementById('inv-edit-id') || {}).value || '';
    if (!id) { alert('Guarda el artículo primero para subir una imagen.'); return; }
    var formData = new FormData();
    formData.append('imagen', file);
    fetch('/api/almacen/inventario/' + encodeURIComponent(id) + '/imagen', {
        method: 'POST',
        body: formData
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) {
        // Actualizar en _invData
        var item = (window._invData || []).find(function(d) { return d.id === id; });
        if (item) item.imagen_url = data.imagen_url;
        // Actualizar preview en modal
        var preview     = document.getElementById('inv-img-preview');
        var placeholder = document.getElementById('inv-img-placeholder');
        var btnQuitar   = document.getElementById('inv-img-btn-quitar');
        if (preview)     { preview.src = data.imagen_url + '?t=' + Date.now(); preview.style.display = ''; }
        if (placeholder) { placeholder.style.display = 'none'; }
        if (btnQuitar)   { btnQuitar.style.display = ''; }
        // Actualizar card en grid sin full reload
        window._invRender();
    })
    .catch(function(err) { alert('Error subiendo imagen: ' + err.message); });
    event.target.value = '';
};

window._invQuitarImagen = function() {
    var id = (document.getElementById('inv-edit-id') || {}).value || '';
    if (!id) return;
    if (!confirm('¿Quitar la imagen de ' + id + '?')) return;
    fetch('/api/almacen/inventario/' + encodeURIComponent(id) + '/imagen', { method: 'DELETE' })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        var item = (window._invData || []).find(function(d) { return d.id === id; });
        if (item) item.imagen_url = null;
        var preview     = document.getElementById('inv-img-preview');
        var placeholder = document.getElementById('inv-img-placeholder');
        var btnQuitar   = document.getElementById('inv-img-btn-quitar');
        if (preview)     { preview.src = ''; preview.style.display = 'none'; }
        if (placeholder) { placeholder.style.display = ''; }
        if (btnQuitar)   { btnQuitar.style.display = 'none'; }
        window._invRender();
    })
    .catch(function(err) { alert('Error: ' + err.message); });
};

window._invDescargarQR = function() {
    var id = (document.getElementById('inv-edit-id') || {}).value || '';
    if (!id) return;
    var url = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&format=png&data=' + encodeURIComponent(id);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'QR_' + id + '.png';
    a.target = '_blank';
    a.click();
};

// ── Guardar ───────────────────────────────────────────────────────
window.guardarArticuloInv = function(event) {
    if (event) event.preventDefault();
    var id = (document.getElementById('inv-edit-id') || {}).value || '';

    var g = function(elId) { return (document.getElementById(elId) || {}).value || ''; };
    var gN = function(elId) { return parseFloat(g(elId)) || 0; };

    var payload = {
        // Básicos
        descripcion:          g('inv-f-descripcion'),
        familia:              g('inv-f-familia'),
        sub_familia:          g('inv-f-subfamilia'),
        almacen:              g('inv-f-almacen'),
        unidad:               g('inv-f-unidad'),
        moneda:               g('inv-f-moneda') || 'PEN',
        costo_referencial:    gN('inv-f-costo'),
        marca:                g('inv-f-marca'),
        stock_regularizado:   gN('inv-f-stock-reg'),
        fecha_regularizacion: g('inv-f-fecha-reg') || null,
        proveedor_id:         g('inv-f-proveedor-id') || null,
        observaciones:        g('inv-f-obs'),
        // Clasificación
        codigo_item:   g('inv-f-codigo-item') || null,
        marca_unidad:  g('inv-f-marca-unidad') || null,
        sistema:       g('inv-f-sistema') || null,
        sub_sistema:   g('inv-f-sub-sistema') || null,
        tipo:          g('inv-f-tipo') || null,
        sub_tipo:      g('inv-f-sub-tipo') || null,
        ubicacion:     g('inv-f-ubicacion') || null,
        anaquel:       g('inv-f-anaquel') ? gN('inv-f-anaquel') : null,
        estado_art:    g('inv-f-estado-art') || 'Activo',
        stock_min:     gN('inv-f-stock-min'),
        stock_max:     gN('inv-f-stock-max'),
        codigo_barras: g('inv-f-codigo-barras') || null
    };

    if (!payload.descripcion) { alert('La descripción es obligatoria.'); return; }

    var url    = id ? '/api/almacen/inventario/' + encodeURIComponent(id) : '/api/almacen/inventario';
    var method = id ? 'PUT' : 'POST';

    fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function() {
            var m = bootstrap.Modal.getInstance(document.getElementById('modal-inv-articulo'));
            if (m) m.hide();
            window.cargarInventario();
        })
        .catch(function(err) { alert('Error al guardar: ' + err.message); });
};

// ── Eliminar ──────────────────────────────────────────────────────
window.eliminarArticuloInv = function(id) {
    if (!confirm('¿Eliminar artículo ' + id + '?\n(Se desactivará — no se borrará físicamente)')) return;
    fetch('/api/almacen/inventario/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function() { window.cargarInventario(); })
        .catch(function(err) { alert('Error al eliminar: ' + err.message); });
};

// ── Export Excel ──────────────────────────────────────────────────
window.exportarInventarioExcel = function() {
    var datos = window._invData || [];
    if (!datos.length) { alert('No hay datos para exportar.'); return; }
    var cabeceras = [
        'Código','Descripción','Familia','Sub-Familia','Almacén','Unidad','Moneda','Costo Ref.',
        'Stock Reg.','Fecha Reg.','Stock Actual','Marca','Sistema','Tipo','Sub-Tipo',
        'Ubicación','Stock Min','Stock Max','Estado','Proveedor ID','Observaciones'
    ];
    var filas = datos.map(function(d) {
        return [
            d.id, d.descripcion, d.familia || '', d.sub_familia || '', d.almacen || '',
            d.unidad || '', d.moneda, parseFloat(d.costo_referencial || 0),
            parseFloat(d.stock_regularizado || 0),
            d.fecha_regularizacion ? String(d.fecha_regularizacion).split('T')[0] : '',
            parseFloat(d.stock_actual || 0), d.marca || '', d.sistema || '', d.tipo || '',
            d.sub_tipo || '', d.ubicacion || '', parseFloat(d.stock_min || 0),
            parseFloat(d.stock_max || 0), d.estado_art || '', d.proveedor_id || '', d.observaciones || ''
        ];
    });
    var ws = XLSX.utils.aoa_to_sheet([cabeceras].concat(filas));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, 'Inventario_Azkell.xlsx');
};

// ── Descargar Plantilla ───────────────────────────────────────────
window.descargarPlantillaInventario = function() {
    var wsData = [
        ['descripcion','familia','sub_familia','almacen','unidad','moneda','costo_referencial',
         'stock_regularizado','fecha_regularizacion','marca','sistema','tipo','ubicacion','stock_min','stock_max','observaciones'],
        ['FILTRO ACEITE MOTOR','FILTROS','ACEITE MOTOR','Almacén de Filtros','UND','PEN','45.00','10','2025-01-01','WIX','MOTOR','Original','Almacén de Filtros','3','30','Filtro estándar'],
        ['ACEITE MOTOR 15W40 GL-5','LUBRICANTES','ACEITES','Almacén Principal','LT','PEN','12.50','20','','MOBIL','MOTOR','','Almacén Principal','5','50','']
    ];
    var ws = XLSX.utils.aoa_to_sheet(wsData);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, 'Plantilla_Inventario.xlsx');
};

// ── Importar Excel ────────────────────────────────────────────────
window.importarExcelInventario = function(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var data = new Uint8Array(e.target.result);
        var workbook = XLSX.read(data, { type: 'array' });
        var ws = workbook.Sheets[workbook.SheetNames[0]];
        var rawJson = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rawJson.length) { alert('El archivo Excel está vacío o sin datos válidos.'); return; }
        if (!confirm('Se importarán ' + rawJson.length + ' artículos al inventario. ¿Continuar?')) {
            event.target.value = ''; return;
        }
        var filas = rawJson.map(function(row) {
            var N = {};
            Object.keys(row).forEach(function(k) { N[k.toLowerCase().trim()] = row[k]; });
            return {
                descripcion:          N['descripcion'] || N['descripción'] || '',
                familia:              N['familia'] || '',
                sub_familia:          N['sub_familia'] || N['sub-familia'] || N['subfamilia'] || '',
                almacen:              N['almacen'] || N['almacén'] || '',
                unidad:               N['unidad'] || '',
                moneda:               (N['moneda'] || 'PEN').toUpperCase(),
                costo_referencial:    parseFloat(N['costo_referencial'] || N['costo ref.'] || 0) || 0,
                stock_regularizado:   parseFloat(N['stock_regularizado'] || N['stock'] || 0) || 0,
                fecha_regularizacion: N['fecha_regularizacion'] || N['fecha reg.'] || null,
                marca:                N['marca'] || '',
                sistema:              N['sistema'] || null,
                tipo:                 N['tipo'] || null,
                ubicacion:            N['ubicacion'] || N['ubicación'] || null,
                stock_min:            parseFloat(N['stock_min'] || 0) || 0,
                stock_max:            parseFloat(N['stock_max'] || 0) || 0,
                observaciones:        N['observaciones'] || ''
            };
        });
        document.body.style.cursor = 'wait';
        fetch('/api/almacen/inventario/importar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filas: filas })
        })
        .then(function(r) { return r.json(); })
        .then(function(r) {
            document.body.style.cursor = 'default';
            event.target.value = '';
            var msg = '✅ Importación completada.\nInsertados: ' + r.insertados;
            if (r.errores && r.errores.length) msg += '\nErrores: ' + r.errores.slice(0, 5).join('\n');
            alert(msg);
            window.cargarInventario();
        })
        .catch(function(err) {
            document.body.style.cursor = 'default';
            event.target.value = '';
            alert('Error importando: ' + err.message);
        });
    };
    reader.readAsArrayBuffer(file);
};
