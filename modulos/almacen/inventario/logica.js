// ================================================================
// MÓDULO ALMACÉN / INVENTARIO — Lógica SPA Aislada
// Convención: window.var = window.var || default (no let/const globales)
// ================================================================

window._invData       = window._invData       || [];
window._invFiltrados  = window._invFiltrados  || [];
window._invPagActual  = window._invPagActual  || 1;
window._invProveedores = window._invProveedores || [];
var _INV_POR_PAG = 20;

window.init_inventario = function() {
    window._invPagActual = 1;
    window.cargarInventario();
    window._cargarProveedoresInv();
};

// ── Cargar datos ─────────────────────────────────────────────────
window.cargarInventario = function() {
    var tbody = document.getElementById('tbody-inventario');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';
    fetch('/api/almacen/inventario')
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) {
            window._invData = data;
            window._invFiltrados = data;
            window._invPoblarFiltros(data);
            window.filtrarInventario();
        })
        .catch(function(err) {
            var tbody2 = document.getElementById('tbody-inventario');
            if (tbody2) tbody2.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Error: ' + err.message + '</td></tr>';
        });
};

window._cargarProveedoresInv = function() {
    fetch('/api/almacen/proveedores')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._invProveedores = data || [];
            var dl = document.getElementById('inv-list-proveedores');
            if (dl) {
                dl.innerHTML = '';
                data.forEach(function(p) {
                    var opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.nombre;
                    dl.appendChild(opt);
                });
            }
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
            Object.keys(familias).sort().map(function(f) { return '<option value="' + f + '"' + (f === prevF ? ' selected' : '') + '>' + f + '</option>'; }).join('');
    }
    if (selA) {
        selA.innerHTML = '<option value="">Todos los almacenes</option>' +
            Object.keys(almacenes).sort().map(function(a) { return '<option value="' + a + '"' + (a === prevA ? ' selected' : '') + '>' + a + '</option>'; }).join('');
    }

    // Poblar datalists para el modal
    var dlF = document.getElementById('inv-list-familias');
    if (dlF) dlF.innerHTML = Object.keys(familias).sort().map(function(f) { return '<option value="' + f + '">'; }).join('');
    var dlA = document.getElementById('inv-list-almacenes');
    if (dlA) dlA.innerHTML = Object.keys(almacenes).sort().map(function(a) { return '<option value="' + a + '">'; }).join('');
};

// ── Filtrar ───────────────────────────────────────────────────────
window.filtrarInventario = function() {
    var buscar = ((document.getElementById('inv-buscar') || {}).value || '').toLowerCase().trim();
    var filFam = ((document.getElementById('inv-fil-familia') || {}).value || '');
    var filAlm = ((document.getElementById('inv-fil-almacen') || {}).value || '');
    window._invFiltrados = (window._invData || []).filter(function(d) {
        var matchBuscar = !buscar ||
            (d.id        || '').toLowerCase().includes(buscar) ||
            (d.descripcion || '').toLowerCase().includes(buscar) ||
            (d.marca     || '').toLowerCase().includes(buscar) ||
            (d.familia   || '').toLowerCase().includes(buscar);
        var matchFam = !filFam || d.familia === filFam;
        var matchAlm = !filAlm || d.almacen === filAlm;
        return matchBuscar && matchFam && matchAlm;
    });
    window._invPagActual = 1;
    window._invRender();
};

// ── Render tabla + paginación ────────────────────────────────────
window._invRender = function() {
    var datos = window._invFiltrados || [];
    var total = datos.length;
    var totalPag = Math.max(1, Math.ceil(total / _INV_POR_PAG));
    var pag = Math.min(window._invPagActual, totalPag);
    window._invPagActual = pag;
    var desde = (pag - 1) * _INV_POR_PAG;
    var pagina = datos.slice(desde, desde + _INV_POR_PAG);

    var cont = document.getElementById('inv-contador');
    if (cont) cont.textContent = total + ' artículo' + (total !== 1 ? 's' : '');

    var tbody = document.getElementById('tbody-inventario');
    if (!tbody) return;
    if (!pagina.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox me-2"></i>Sin artículos encontrados</td></tr>';
    } else {
        tbody.innerHTML = pagina.map(function(d) {
            var stock = parseFloat(d.stock_actual != null ? d.stock_actual : 0);
            var stockBadge = stock <= 0
                ? '<span class="badge bg-danger">' + stock.toFixed(2) + '</span>'
                : stock < 5
                    ? '<span class="badge bg-warning text-dark">' + stock.toFixed(2) + '</span>'
                    : '<span class="badge bg-success">' + stock.toFixed(2) + '</span>';
            var moneda = d.moneda === 'USD' ? '$' : 'S/';
            var costo = parseFloat(d.costo_referencial || 0).toLocaleString('es-PE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            return '<tr>' +
                '<td><span class="badge bg-secondary fw-normal">' + (d.id || '') + '</span></td>' +
                '<td>' + _invEsc(d.descripcion || '') + (d.marca ? '<br><small class="text-muted">' + _invEsc(d.marca) + '</small>' : '') + '</td>' +
                '<td>' + (d.familia ? '<span class="text-muted small">' + _invEsc(d.familia) + '</span>' : '—') + '</td>' +
                '<td><small class="text-muted">' + _invEsc(d.almacen || '—') + '</small></td>' +
                '<td><small>' + _invEsc(d.unidad || '—') + '</small></td>' +
                '<td class="text-end"><small>' + moneda + ' ' + costo + '</small></td>' +
                '<td class="text-center">' + stockBadge + '<br><small class="text-muted">' + _invEsc(d.unidad || '') + '</small></td>' +
                '<td class="text-center"><div class="d-flex gap-1 justify-content-center">' +
                    '<button class="btn btn-xs btn-outline-primary" title="Editar" onclick="window.abrirModalInventario(\'' + _invEsc(d.id) + '\')"><i class="bi bi-pencil"></i></button>' +
                    '<button class="btn btn-xs btn-outline-danger" title="Eliminar" onclick="window.eliminarArticuloInv(\'' + _invEsc(d.id) + '\')"><i class="bi bi-trash"></i></button>' +
                '</div></td>' +
            '</tr>';
        }).join('');
    }

    // Paginación
    var paginEl = document.getElementById('inv-paginacion');
    if (paginEl) {
        if (totalPag <= 1) { paginEl.innerHTML = ''; return; }
        var btns = '';
        btns += '<button class="btn btn-xs btn-outline-secondary" ' + (pag <= 1 ? 'disabled' : '') + ' onclick="window._invIrPag(' + (pag-1) + ')"><i class="bi bi-chevron-left"></i></button>';
        btns += '<span class="small text-muted mx-2">Pág. ' + pag + ' / ' + totalPag + '</span>';
        btns += '<button class="btn btn-xs btn-outline-secondary" ' + (pag >= totalPag ? 'disabled' : '') + ' onclick="window._invIrPag(' + (pag+1) + ')"><i class="bi bi-chevron-right"></i></button>';
        paginEl.innerHTML = '<div class="d-flex align-items-center gap-1">' + btns + '</div>';
    }
};

window._invIrPag = function(n) { window._invPagActual = n; window._invRender(); };
function _invEsc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Modal Add / Edit ─────────────────────────────────────────────
window.abrirModalInventario = function(id) {
    var titulo = document.getElementById('modal-inv-titulo');
    var form   = document.getElementById('form-inv-articulo');
    if (!form) return;
    form.reset();
    var editId = document.getElementById('inv-edit-id');
    if (editId) editId.value = '';

    if (id) {
        var item = (window._invData || []).find(function(d) { return d.id === id; });
        if (!item) return;
        if (titulo) titulo.innerHTML = '<i class="bi bi-pencil-fill me-1"></i>Editar Artículo — ' + id;
        if (editId) editId.value = id;
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
    } else {
        if (titulo) titulo.innerHTML = '<i class="bi bi-box-fill me-1"></i>Nuevo Artículo';
    }
    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-inv-articulo'));
    modal.show();
};

function _invSetField(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val != null ? val : '';
}

// ── Guardar ───────────────────────────────────────────────────────
window.guardarArticuloInv = function(event) {
    if (event) event.preventDefault();
    var id = (document.getElementById('inv-edit-id') || {}).value || '';
    var payload = {
        descripcion:          (document.getElementById('inv-f-descripcion') || {}).value || '',
        familia:              (document.getElementById('inv-f-familia')      || {}).value || '',
        sub_familia:          (document.getElementById('inv-f-subfamilia')   || {}).value || '',
        almacen:              (document.getElementById('inv-f-almacen')      || {}).value || '',
        unidad:               (document.getElementById('inv-f-unidad')       || {}).value || '',
        moneda:               (document.getElementById('inv-f-moneda')       || {}).value || 'PEN',
        costo_referencial:    parseFloat((document.getElementById('inv-f-costo') || {}).value) || 0,
        marca:                (document.getElementById('inv-f-marca')        || {}).value || '',
        stock_regularizado:   parseFloat((document.getElementById('inv-f-stock-reg') || {}).value) || 0,
        fecha_regularizacion: (document.getElementById('inv-f-fecha-reg')   || {}).value || null,
        proveedor_id:         (document.getElementById('inv-f-proveedor-id') || {}).value || null,
        observaciones:        (document.getElementById('inv-f-obs')          || {}).value || ''
    };
    if (!payload.descripcion) { alert('La descripción es obligatoria.'); return; }

    var url    = id ? '/api/almacen/inventario/' + encodeURIComponent(id) : '/api/almacen/inventario';
    var method = id ? 'PUT' : 'POST';
    fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function() {
            bootstrap.Modal.getInstance(document.getElementById('modal-inv-articulo'))?.hide();
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
    var cabeceras = ['Código','Descripción','Familia','Sub-Familia','Almacén','Unidad','Moneda','Costo Ref.','Stock Regularizado','Fecha Reg.','Stock Actual','Marca','Proveedor ID','Observaciones'];
    var filas = datos.map(function(d) {
        return [d.id, d.descripcion, d.familia||'', d.sub_familia||'', d.almacen||'', d.unidad||'',
                d.moneda, parseFloat(d.costo_referencial||0), parseFloat(d.stock_regularizado||0),
                d.fecha_regularizacion ? String(d.fecha_regularizacion).split('T')[0] : '',
                parseFloat(d.stock_actual||0), d.marca||'', d.proveedor_id||'', d.observaciones||''];
    });
    var wsData = [cabeceras].concat(filas);
    var ws = XLSX.utils.aoa_to_sheet(wsData);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, 'Inventario_Azkell.xlsx');
};

// ── Descargar Plantilla ───────────────────────────────────────────
window.descargarPlantillaInventario = function() {
    var wsData = [
        ['descripcion','familia','sub_familia','almacen','unidad','moneda','costo_referencial','stock_regularizado','fecha_regularizacion','marca','observaciones'],
        ['FILTRO ACEITE MOTOR','FILTROS','ACEITE MOTOR','ALMACÉN PRINCIPAL','UND','PEN','45.00','10','2025-01-01','WIX','Filtro estándar'],
        ['ACEITE MOTOR 15W40 GL-5','LUBRICANTES','ACEITES','ALMACÉN PRINCIPAL','LT','PEN','12.50','20','','MOBIL','']
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
            event.target.value = '';
            return;
        }

        // Normalizar columnas (case-insensitive)
        var filas = rawJson.map(function(row) {
            var normalized = {};
            Object.keys(row).forEach(function(k) { normalized[k.toLowerCase().trim()] = row[k]; });
            return {
                descripcion:          normalized['descripcion'] || normalized['descripción'] || '',
                familia:              normalized['familia'] || '',
                sub_familia:          normalized['sub_familia'] || normalized['sub-familia'] || normalized['subfamilia'] || '',
                almacen:              normalized['almacen'] || normalized['almacén'] || '',
                unidad:               normalized['unidad'] || '',
                moneda:               (normalized['moneda'] || 'PEN').toUpperCase(),
                costo_referencial:    parseFloat(normalized['costo_referencial'] || normalized['costo ref.'] || 0) || 0,
                stock_regularizado:   parseFloat(normalized['stock_regularizado'] || normalized['stock'] || 0) || 0,
                fecha_regularizacion: normalized['fecha_regularizacion'] || normalized['fecha reg.'] || null,
                marca:                normalized['marca'] || '',
                observaciones:        normalized['observaciones'] || ''
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
            if (r.errores && r.errores.length) msg += '\n❌ Errores: ' + r.errores.slice(0,5).join('\n');
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
