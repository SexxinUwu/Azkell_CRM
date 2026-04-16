// ================================================================
// MÓDULO ALMACÉN / PROVEEDORES — Lógica SPA Aislada
// ================================================================

window._provData      = window._provData      || [];
window._provFiltrados = window._provFiltrados || [];
window._provMarcas    = window._provMarcas    || [];

window.init_proveedores = function() {
    if (!window.checkPerm('prov_inv', 'l')) {
        window.showNoPermMsg('mod-proveedores');
        return;
    }
    window.cargarProveedores();
    // Ocultar botones sin permiso
    var btnNuevo = document.querySelector('#mod-proveedores .btn-primary[onclick*="abrirModalProveedor"]');
    if (btnNuevo) btnNuevo.style.display = window.checkPerm('prov_inv','c') ? '' : 'none';
    var btnImportar = document.querySelector('#mod-proveedores .btn-outline-info');
    if (btnImportar) btnImportar.style.display = window.checkPerm('prov_inv','c') ? '' : 'none';
    var btnExportar = document.querySelector('#mod-proveedores .btn-outline-success');
    if (btnExportar) btnExportar.style.display = window.checkPerm('prov_inv','l') ? '' : 'none';
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
                (window.checkPerm('prov_inv','e') ? '<button class="btn btn-xs btn-outline-primary" onclick="window.abrirModalProveedor(\''+_provEsc(d.id)+'\')" title="Editar"><i class="bi bi-pencil"></i></button>' : '')+
                (window.checkPerm('prov_inv','d') ? '<button class="btn btn-xs btn-outline-danger" onclick="window.eliminarProveedor(\''+_provEsc(d.id)+'\')" title="Eliminar"><i class="bi bi-trash"></i></button>' : '')+
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
    if (!window.guardAction('prov_inv', id ? 'e' : 'c')) return;
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
    if (!window.guardAction('prov_inv', 'd')) return;
    if (!confirm('¿Eliminar proveedor '+id+'?')) return;
    fetch('/api/almacen/proveedores/'+encodeURIComponent(id), { method: 'DELETE' })
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function() { window.cargarProveedores(); })
        .catch(function(err) { alert('Error: '+err.message); });
};

// ── Exportar Excel ────────────────────────────────────────────────
window.exportarExcelProveedores = function() {
    var datos = window._provData || [];
    if (!datos.length) { alert('No hay proveedores para exportar.'); return; }
    var wb = XLSX.utils.book_new();
    var filas = [['ID','Nombre','Razón Social','Tipo Doc.','N° Documento','Teléfono','Email','Dirección','Marcas','Estado','Observaciones']];
    datos.forEach(function(d) {
        filas.push([d.id||'', d.nombre||'', d.razon_social||'', d.tipo_documento||'', d.numero_documento||'',
            d.telefono||'', d.email||'', d.direccion||'', d.marcas||'', d.estado||'', d.observaciones||'']);
    });
    var ws = XLSX.utils.aoa_to_sheet(filas);
    XLSX.utils.book_append_sheet(wb, ws, 'Proveedores');
    XLSX.writeFile(wb, 'Proveedores_'+new Date().toISOString().slice(0,10)+'.xlsx');
};

// ── Descargar Plantilla ───────────────────────────────────────────
window.descargarPlantillaProveedores = function() {
    var wb = XLSX.utils.book_new();
    var filas = [
        ['Nombre','Razón Social','Tipo Doc.','N° Documento','Teléfono','Email','Dirección','Marcas','Estado','Observaciones'],
        ['Ejemplo Proveedor SAC','Ejemplo Proveedor S.A.C.','RUC','20123456789','+51 999 999 999','proveedor@email.com','Av. Ejemplo 123','WIX, MOBIL','Activo','Notas opcionales']
    ];
    var ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = [18,24,10,14,16,24,24,18,10,20].map(function(w){ return {wch:w}; });
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, 'Plantilla_Proveedores.xlsx');
};

// ── Importar Excel ────────────────────────────────────────────────
window.importarExcelProveedores = function(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var wb = XLSX.read(e.target.result, { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
            if (!rows.length) { alert('El archivo está vacío.'); return; }
            var payload = rows.map(function(r) {
                return {
                    nombre:           String(r['Nombre']           || r.nombre           || '').trim(),
                    razon_social:     String(r['Razón Social']     || r['Razon Social']  || r.razon_social     || '').trim(),
                    tipo_documento:   String(r['Tipo Doc.']        || r.tipo_documento   || 'RUC').trim(),
                    numero_documento: String(r['N° Documento']     || r.numero_documento || '').trim(),
                    telefono:         String(r['Teléfono']         || r['Telefono']      || r.telefono         || '').trim(),
                    email:            String(r['Email']            || r.email            || '').trim(),
                    direccion:        String(r['Dirección']        || r['Direccion']     || r.direccion        || '').trim(),
                    marcas:           String(r['Marcas']           || r.marcas           || '').trim(),
                    estado:           String(r['Estado']           || r.estado           || 'Activo').trim(),
                    observaciones:    String(r['Observaciones']    || r.observaciones    || '').trim()
                };
            }).filter(function(r) { return r.nombre; });
            if (!payload.length) { alert('No se encontraron filas con Nombre válido.'); return; }
            if (!confirm('Se importarán '+payload.length+' proveedores. ¿Continuar?')) return;
            fetch('/api/almacen/importarProveedoresMasivo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proveedores: payload })
            })
            .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
            .then(function(res) {
                alert('Importados: '+res.insertados+' nuevos, '+res.actualizados+' actualizados.');
                window.cargarProveedores();
            })
            .catch(function(err) { alert('Error: '+err.message); });
        } catch(ex) { alert('Error leyendo Excel: '+ex.message); }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
};
