// ================================================================
// MÓDULO ALMACÉN / PROVEEDORES — Lógica SPA Aislada
// ================================================================

window._provData          = window._provData          || [];
window._provFiltrados     = window._provFiltrados     || [];
window._provMarcas        = window._provMarcas        || [];
window._provSeleccionados = window._provSeleccionados || [];
window._provPagina        = window._provPagina        || 1;
window._provPorPagina     = 25;

window.init_proveedores = function() {
    // Inyectar CSS Bento Grid
    if (!document.getElementById('almacen-bento-css')) {
        var lnk = document.createElement('link');
        lnk.id = 'almacen-bento-css';
        lnk.rel = 'stylesheet';
        lnk.href = '/modulos/almacen/almacen-bento.css';
        document.head.appendChild(lnk);
    }
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
    window._provSeleccionados = [];
    window._provActualizarBtnMasivo();
    var grid = document.getElementById('prov-grid');
    if (grid) grid.innerHTML = '<div style="text-align:center;padding:3rem;color:#94a3b8;"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</div>';
    fetch('/api/almacen/proveedores')
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(data) {
            window._provData = data;
            window._provFiltrados = data;
            window._provRenderKPIs(data);
            window.filtrarProveedores();
        })
        .catch(function(err) {
            var g = document.getElementById('prov-grid');
            if (g) g.innerHTML = '<div style="padding:2rem;color:#ef4444">Error: '+err.message+'</div>';
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
    window._provPagina = 1;
    window._provRender();
};

// ── KPI Row Bento ─────────────────────────────────────────────────
window._provRenderKPIs = function(data) {
    var total   = data.length;
    var activos = data.filter(function(d) { return d.estado === 'Activo'; }).length;
    var el = document.getElementById('prov-kpi-row');
    if (!el) return;
    el.innerHTML =
        '<div class="bento-kpi">' +
          '<div><div class="bento-kpi-label">Total Proveedores</div><div class="bento-kpi-num">' + total + '</div></div>' +
          '<div class="bento-kpi-icon" style="background:#eff6ff;color:#2563eb"><i class="bi bi-truck fs-4"></i></div>' +
        '</div>' +
        '<div class="bento-kpi">' +
          '<div><div class="bento-kpi-label">Activos</div><div class="bento-kpi-num" style="color:#16a34a">' + activos + '</div></div>' +
          '<div class="bento-kpi-icon" style="background:#dcfce7;color:#16a34a"><i class="bi bi-check-circle-fill fs-4"></i></div>' +
        '</div>' +
        '<div class="bento-kpi accent-dark">' +
          '<div><div class="bento-kpi-label">Inactivos</div><div class="bento-kpi-num">' + (total - activos) + '</div></div>' +
          '<div class="bento-kpi-icon"><i class="bi bi-pause-circle fs-4" style="color:#94a3b8"></i></div>' +
        '</div>';
};

window._provRender = function() {
    var todos = window._provFiltrados || [];
    var total = todos.length;
    var porPag = window._provPorPagina || 25;
    var paginas = Math.max(1, Math.ceil(total / porPag));
    if (window._provPagina > paginas) window._provPagina = paginas;
    var inicio = (window._provPagina - 1) * porPag;
    var datos = todos.slice(inicio, inicio + porPag);

    var cont = document.getElementById('prov-contador');
    if (cont) cont.textContent = total + ' proveedor' + (total !== 1 ? 'es' : '');

    var grid = document.getElementById('prov-tbody');
    if (!grid) return;

    if (!datos.length) {
        grid.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:3rem;color:#94a3b8;"><i class="bi bi-inbox fs-2 d-block mb-2"></i>Sin proveedores encontrados</td></tr>';
        window._provRenderPaginador(0, 1, 0);
        return;
    }

    var canEdit = window.checkPerm('prov_inv', 'e');
    var canDel  = window.checkPerm('prov_inv', 'd');

    grid.innerHTML = datos.map(function(d) {
        // Initials (no longer used in table, but keeping logic just in case)
        var initials = (d.nombre || '?').split(' ').slice(0, 2).map(function(w) { return (w[0] || ''); }).join('').toUpperCase();

        // Marcas
        var marcasHtml = '';
        if (d.marcas) {
            marcasHtml = d.marcas.split(',').filter(Boolean).map(function(m) {
                return '<span class="prov-marca-tag" style="font-size:0.7rem; padding:0.15rem 0.4rem; margin-right:0.2rem; margin-bottom:0.2rem; display:inline-block; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text);">' + _provEsc(m.trim()) + '</span>';
            }).join('');
        }
        if (!marcasHtml) marcasHtml = '<span style="font-size:0.75rem;color:#94a3b8;">Sin marcas</span>';

        // Documento badge
        var docHtml = '<div style="font-weight:600;font-size:0.85rem;color:var(--text);">' + _provEsc(d.numero_documento || '—') + '</div>' + 
                      '<div style="font-size:0.7rem;color:var(--subtext);">' + _provEsc(d.tipo_documento || '—') + '</div>';

        // Razón Social y Asesor
        var razon = d.razon_social ? _provEsc(d.razon_social) : '<span class="text-muted" style="font-weight:400;font-size:0.75rem;">Sin Razón Social</span>';
        var razonHtml = '<div style="font-weight:700;font-size:0.85rem;color:var(--text);">' + razon + '</div>';
        
        var nombreHtml = '<div style="font-weight:600;font-size:0.8rem;color:var(--subtext);">' + _provEsc(d.nombre || '—') + '</div>';

        // Contacto
        var contactoHtml = '<div style="font-size:0.8rem;color:var(--text);"><i class="bi bi-telephone text-muted me-1"></i>' + _provEsc(d.telefono || 'Sin tel.') + '</div>' +
                           '<div style="font-size:0.75rem;color:var(--subtext);"><i class="bi bi-envelope text-muted me-1"></i>' + _provEsc(d.email || 'Sin email') + '</div>';

        // Estado
        var estadoHtml = d.estado === 'Activo'
            ? '<span style="font-size:0.7rem;font-weight:700;color:#16a34a;background:#dcfce7;padding:0.2rem 0.5rem;border-radius:12px;">Activo</span>'
            : '<span style="font-size:0.7rem;font-weight:700;color:#475569;background:#e2e8f0;padding:0.2rem 0.5rem;border-radius:12px;">Inactivo</span>';

        // Acciones
        var cleanTel = (d.telefono || '').replace(/[^0-9+]/g, '');
        var btnLlamar = cleanTel ? '<a href="tel:' + cleanTel + '" class="btn btn-sm btn-light" title="Llamar" style="color:#0ea5e9; border:1px solid #e0f2fe; background:#f0f9ff;"><i class="bi bi-telephone-fill"></i></a>' 
                                 : '<button class="btn btn-sm btn-light" disabled style="opacity:0.5;"><i class="bi bi-telephone-fill"></i></button>';
        var btnWsp = cleanTel ? '<a href="https://wa.me/' + cleanTel.replace('+', '') + '" target="_blank" class="btn btn-sm btn-light" title="WhatsApp" style="color:#16a34a; border:1px solid #dcfce7; background:#f0fdf4;"><i class="bi bi-whatsapp"></i></a>' 
                              : '<button class="btn btn-sm btn-light" disabled style="opacity:0.5;"><i class="bi bi-whatsapp"></i></button>';
                              
        var btnEdit = canEdit ? '<button class="btn btn-sm btn-light" onclick="window.abrirModalProveedor(\'' + _provEsc(d.id) + '\')" title="Editar" style="color:#64748b; border:1px solid #e2e8f0;"><i class="bi bi-pencil-fill"></i></button>' : '';
        var btnDel  = canDel  ? '<button class="btn btn-sm btn-light" onclick="window.eliminarProveedor(\'' + _provEsc(d.id) + '\')" title="Eliminar" style="color:#ef4444; border:1px solid #fee2e2; background:#fef2f2;"><i class="bi bi-trash-fill"></i></button>' : '';

        return '<tr style="border-bottom: 1px solid var(--border); transition: background 0.2s;" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'transparent\'">' +
            '<td style="text-align:center; padding:0.75rem 0.5rem;">' +
                '<input type="checkbox" class="form-check-input m-0" style="cursor: pointer;" ' + 
                ((window._provSeleccionados || []).includes(String(d.id)) ? 'checked' : '') +
                ' onchange="window._provToggleSel(\'' + _provEsc(d.id) + '\', this.checked)">' +
            '</td>' +
            '<td style="padding:0.75rem 0.5rem;">' + razonHtml + '</td>' +
            '<td style="padding:0.75rem 0.5rem;">' + nombreHtml + '</td>' +
            '<td style="padding:0.75rem 0.5rem;">' + docHtml + '</td>' +
            '<td style="padding:0.75rem 0.5rem;" class="d-none d-md-table-cell">' + contactoHtml + '</td>' +
            '<td style="padding:0.75rem 0.5rem;">' + marcasHtml + '</td>' +
            '<td style="padding:0.75rem 0.5rem; text-align:center;">' + estadoHtml + '</td>' +
            '<td style="padding:0.75rem 0.5rem; text-align:right;">' +
                '<div style="display:flex; gap:0.3rem; justify-content:flex-end;">' +
                    btnLlamar + btnWsp + btnEdit + btnDel +
                '</div>' +
            '</td>' +
        '</tr>';
    }).join('');

    window._provRenderPaginador(total, paginas, inicio + datos.length);
    window._provActualizarBtnMasivo();
};

window._provRenderPaginador = function(total, paginas, hasta) {
    var cont = document.getElementById('prov-paginador');
    if (!cont) return;
    if (paginas <= 1) { cont.innerHTML = ''; return; }
    var pag = window._provPagina;
    var btns = '';
    btns += '<button class="btn btn-xs btn-outline-secondary" onclick="window._provIrPagina('+pag+'- 1)" '+(pag<=1?'disabled':'')+'>‹ Ant</button>';
    // Números de página (máx 5 visibles)
    var start = Math.max(1, pag - 2), end = Math.min(paginas, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (var i = start; i <= end; i++) {
        btns += '<button class="btn btn-xs '+(i===pag?'btn-primary':'btn-outline-secondary')+'" onclick="window._provIrPagina('+i+')">'+i+'</button>';
    }
    btns += '<button class="btn btn-xs btn-outline-secondary" onclick="window._provIrPagina('+pag+'+ 1)" '+(pag>=paginas?'disabled':'')+'>Sig ›</button>';
    btns += '<span class="text-muted small ms-2">Pág '+pag+' de '+paginas+' ('+total+' total)</span>';
    cont.innerHTML = btns;
};

window._provIrPagina = function(pag) {
    var paginas = Math.max(1, Math.ceil((window._provFiltrados||[]).length / (window._provPorPagina||25)));
    window._provPagina = Math.max(1, Math.min(paginas, pag));
    window._provRender();
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
        .then(function(r) {
            if (!r.ok) return r.json().catch(function(){ return {}; }).then(function(body) { throw new Error('HTTP '+r.status+(body.error ? ': '+body.error : '')); });
            return r.json();
        })
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

// ── Selección masiva ──────────────────────────────────────────────
window._provToggleSel = function(id, checked) {
    var arr = window._provSeleccionados || [];
    if (checked) { if (arr.indexOf(id) === -1) arr.push(id); }
    else { window._provSeleccionados = arr.filter(function(x) { return x !== id; }); return window._provActualizarBtnMasivo(); }
    window._provSeleccionados = arr;
    window._provActualizarBtnMasivo();
};

window._provToggleSelAll = function(checked) {
    window._provSeleccionados = checked ? (window._provFiltrados||[]).map(function(d){ return d.id; }) : [];
    window._provRender();
};

window._provActualizarBtnMasivo = function() {
    var btn = document.getElementById('prov-btn-eliminar-masivo');
    var n = (window._provSeleccionados||[]).length;
    if (!btn) return;
    btn.style.display = n > 0 ? '' : 'none';
    btn.innerHTML = '<i class="bi bi-trash me-1"></i>Eliminar ' + n + ' seleccionado' + (n!==1?'s':'');
};

window.eliminarMasivoProveedores = function() {
    if (!window.guardAction('prov_inv', 'd')) return;
    var ids = window._provSeleccionados || [];
    if (!ids.length) return;
    if (!confirm('¿Eliminar ' + ids.length + ' proveedor' + (ids.length!==1?'es':'') + '? Esta acción no se puede deshacer.')) return;
    fetch('/api/almacen/proveedores/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(res) {
        window._provSeleccionados = [];
        window.cargarProveedores();
    })
    .catch(function(err) { alert('Error: '+err.message); });
};

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

window.consultarDocProveedor = async function() {
    let numInput = document.getElementById('prov-f-num-doc');
    let tipoSel = document.getElementById('prov-f-tipo-doc');
    if (!numInput || !tipoSel) return;
    
    let numero = numInput.value.trim();
    let tipo = tipoSel.value;
    
    if (!numero) {
        if(typeof window.rotToast === 'function') window.rotToast("Ingrese un nÃºmero de documento.", "bg-warning");
        else alert("Ingrese un nÃºmero de documento.");
        return;
    }
    
    let btnIcon = document.querySelector('button[onclick="window.consultarDocProveedor()"] i');
    if(btnIcon) btnIcon.className = "spinner-border spinner-border-sm";
    
    try {
        let url = '';
        if (tipo === 'RUC' || tipo === 'DNI') {
            url = '/api/proxy/documento?tipo=' + tipo + '&numero=' + numero;
        } else {
            throw new Error("La consulta automÃ¡tica solo estÃ¡ disponible para RUC y DNI.");
        }
        
        let res = await fetch(url);
        if (!res.ok) {
            throw new Error("No se encontrÃ³ informaciÃ³n o hubo un error en la consulta.");
        }
        let data = await res.json();
        
        if (tipo === 'RUC') {
            let razon = document.getElementById('prov-f-razon');
            let nombre = document.getElementById('prov-f-nombre');
            let dir = document.getElementById('prov-f-dir');
            
            if (razon) razon.value = data.nombre || '';
            if (nombre && !nombre.value) nombre.value = data.nombre || '';
            if (dir) dir.value = data.direccion || '';
            
            if(typeof window.rotToast === 'function') window.rotToast("Datos RUC consultados con Ã©xito.", "bg-success");
        } else if (tipo === 'DNI') {
            let razon = document.getElementById('prov-f-razon');
            let nombre = document.getElementById('prov-f-nombre');
            let nombreCompleto = (data.nombres + " " + data.apellidoPaterno + " " + data.apellidoMaterno).trim();
            
            if (razon) razon.value = nombreCompleto;
            if (nombre && !nombre.value) nombre.value = nombreCompleto;
            
            if(typeof window.rotToast === 'function') window.rotToast("Datos DNI consultados con Ã©xito.", "bg-success");
        }
    } catch(err) {
        if(typeof window.rotToast === 'function') window.rotToast(err.message, "bg-danger");
        else alert(err.message);
    } finally {
        if(btnIcon) btnIcon.className = "bi bi-search";
    }
};

