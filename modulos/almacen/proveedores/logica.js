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
    if (!window.checkPerm('prov_inv', 'l')) {
        var wrap = document.getElementById('mod-proveedores') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    // Inyectar CSS Bento Grid
    if (!document.getElementById('almacen-bento-css')) {
        var lnk = document.createElement('link');
        lnk.id = 'almacen-bento-css';
        lnk.rel = 'stylesheet';
        lnk.href = '/modulos/almacen/almacen-bento.css';
        document.head.appendChild(lnk);
    }
    window.cargarProveedores();
};

window.cargarProveedores = function() {
    var b = document.getElementById('prov-buscar');
    if (b) b.value = '';
    window._provFiltroB = '';
    window._provSeleccionados = [];
    window._provActualizarBtnMasivo();
    var grid = document.getElementById('prov-tbody');
    if (grid) grid.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:3rem;color:#94a3b8;"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';
    var gridMobile = document.getElementById('prov-grid-mobile');
    if (gridMobile) gridMobile.innerHTML = '<div style="text-align:center;padding:3rem;color:#94a3b8;"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</div>';

    fetch('/api/almacen/proveedores')
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(data) {
            window._provData = data || [];
            window._provFiltrados = window._provData;
            window._provRenderKPIs(window._provData);
            window.filtrarProveedores();
        })
        .catch(function(err) {
            var g = document.getElementById('prov-tbody');
            if (g) g.innerHTML = '<tr><td colspan="8" style="padding:2rem;color:#ef4444;text-align:center;">Error: '+err.message+'</td></tr>';
        });
};

window.filtrarProveedores = function() {
    var buscar  = ((document.getElementById('prov-buscar')||{}).value||'').toLowerCase();
    var filEst  = ((document.getElementById('prov-fil-estado')||{}).value||'');
    window._provFiltrados = (window._provData||[]).filter(function(d) {
        var matchB = !buscar ||
            (d.nombre||'').toLowerCase().includes(buscar)||
            (d.razon_social||'').toLowerCase().includes(buscar)||
            (d.numero_documento||'').toLowerCase().includes(buscar)||
            (d.telefono||'').toLowerCase().includes(buscar)||
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
    var list = data || window._provData || [];
    var total = list.length;
    var activos = 0;
    var inactivos = 0;
    var marcasSet = {};

    list.forEach(function(d) {
        if (d.estado === 'Activo') activos++;
        else inactivos++;

        if (d.marcas) {
            d.marcas.split(',').forEach(function(m) {
                var mTrim = m.trim();
                if (mTrim) marcasSet[mTrim.toLowerCase()] = true;
            });
        }
    });

    var setKpi = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    setKpi('kpi-prov-total', total);
    setKpi('kpi-prov-activos', activos);
    setKpi('kpi-prov-inactivos', inactivos);
    setKpi('kpi-prov-marcas', Object.keys(marcasSet).length);
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
    var gridMobile = document.getElementById('prov-grid-mobile');
    if (!grid) return;

    if (!datos.length) {
        grid.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:3rem;color:#94a3b8;"><i class="bi bi-inbox fs-2 d-block mb-2"></i>Sin proveedores encontrados</td></tr>';
        if (gridMobile) gridMobile.innerHTML = '<div style="text-align:center;padding:3rem;color:#94a3b8;"><i class="bi bi-inbox fs-2 d-block mb-2"></i>Sin proveedores encontrados</div>';
        window._provRenderPaginador(0, 1, 0);
        return;
    }

    var canEdit = window.checkPerm('prov_inv', 'e');
    var canDel  = window.checkPerm('prov_inv', 'd');

    grid.innerHTML = datos.map(function(d) {
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
        var razonHtml = '<div style="font-weight:600;font-size:0.85rem;color:var(--text);">' + razon + '</div>';
        
        var nombreHtml = '<div style="font-weight:700;font-size:0.85rem;color:var(--text);">' + _provEsc(d.nombre || '—') + '</div>';

        // Contacto
        var contactoHtml = '<div style="font-size:0.8rem;color:var(--text);"><i class="bi bi-telephone text-muted me-1"></i>' + _provEsc(d.telefono || 'Sin tel.') + '</div>' +
                           '<div style="font-size:0.75rem;color:var(--subtext);"><i class="bi bi-envelope text-muted me-1"></i>' + _provEsc(d.email || 'Sin email') + '</div>';

        // Estado
        var estadoHtml = d.estado === 'Activo'
            ? '<span style="font-size:0.7rem;font-weight:700;color:#16a34a;background:#dcfce7;padding:0.2rem 0.5rem;border-radius:12px;">Activo</span>'
            : '<span style="font-size:0.7rem;font-weight:700;color:#475569;background:#e2e8f0;padding:0.2rem 0.5rem;border-radius:12px;">Inactivo</span>';

        // Acciones
        var cleanTel = (d.telefono || '').replace(/[^0-9+]/g, '');
        var wspTel = cleanTel.replace('+', '');
        if (wspTel.length === 9 && wspTel.startsWith('9')) wspTel = '51' + wspTel;

        var menuItems = '';
        if (cleanTel) menuItems += '<li><a class="dropdown-item py-2 fw-semibold" href="tel:' + cleanTel + '"><i class="bi bi-telephone-fill me-2 text-info"></i>Llamar</a></li>';
        if (wspTel) menuItems += '<li><a class="dropdown-item py-2 fw-semibold" href="https://api.whatsapp.com/send?phone=' + wspTel + '" target="_blank"><i class="bi bi-whatsapp me-2 text-success"></i>WhatsApp</a></li>';
        if (menuItems && (canEdit || canDel)) menuItems += '<li><hr class="dropdown-divider my-1"></li>';
        if (canEdit) menuItems += '<li><a class="dropdown-item py-2 fw-semibold" href="#" onclick="window.abrirModalProveedor(\'' + _provEsc(d.id) + '\'); return false;"><i class="bi bi-pencil-fill me-2 text-primary"></i>Editar</a></li>';
        if (canDel) menuItems += '<li><a class="dropdown-item py-2 fw-semibold text-danger" href="#" onclick="window.eliminarProveedor(\'' + _provEsc(d.id) + '\'); return false;"><i class="bi bi-trash-fill me-2"></i>Eliminar</a></li>';

        var accionesDropdown = '<div class="dropdown text-end" onclick="event.stopPropagation();">' +
            '<button class="btn btn-sm btn-light rounded-circle shadow-none p-0 d-inline-flex align-items-center justify-content-center" type="button" data-bs-toggle="dropdown" style="width: 32px; height: 32px; border: 1px solid #e2e8f0; background: #fff;" title="Acciones">' +
                '<i class="bi bi-three-dots-vertical text-secondary"></i>' +
            '</button>' +
            '<ul class="dropdown-menu dropdown-menu-end shadow border" style="border-radius:12px; font-size:0.83rem;">' +
                menuItems +
            '</ul>' +
        '</div>';

        return '<tr style="border-bottom: 1px solid var(--border); transition: background 0.2s;" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'transparent\'">' +
            '<td style="text-align:center; padding:0.75rem 0.5rem;">' +
                '<input type="checkbox" class="form-check-input m-0" style="cursor: pointer;" ' + 
                ((window._provSeleccionados || []).includes(String(d.id)) ? 'checked' : '') +
                ' onchange="window._provToggleSel(\'' + _provEsc(d.id) + '\', this.checked)">' +
            '</td>' +
            '<td style="padding:0.75rem 0.5rem;">' + nombreHtml + '</td>' +
            '<td style="padding:0.75rem 0.5rem;">' + razonHtml + '</td>' +
            '<td style="padding:0.75rem 0.5rem;">' + docHtml + '</td>' +
            '<td style="padding:0.75rem 0.5rem;" class="d-none d-md-table-cell">' + contactoHtml + '</td>' +
            '<td style="padding:0.75rem 0.5rem;">' + marcasHtml + '</td>' +
            '<td style="padding:0.75rem 0.5rem; text-align:center;">' + estadoHtml + '</td>' +
            '<td style="padding:0.75rem 0.5rem; text-align:right;">' +
                accionesDropdown +
            '</td>' +
        '</tr>';
    }).join('');

    if (gridMobile) {
        gridMobile.innerHTML = datos.map(function(d) {
            var initials = (d.nombre || '?').split(' ').slice(0, 2).map(function(w) { return (w[0] || ''); }).join('').toUpperCase();
            var docSub = (d.razon_social ? _provEsc(d.razon_social) + ' - ' : '') + _provEsc(d.tipo_documento || '') + ' ' + _provEsc(d.numero_documento || '');
            
            var cleanTel = (d.telefono || '').replace(/[^0-9+]/g, '');
            var wspTel = cleanTel.replace('+', '');
            if (wspTel.length === 9 && wspTel.startsWith('9')) wspTel = '51' + wspTel;

            var btnLlamar = cleanTel ? '<a href="tel:' + cleanTel + '" class="prov-btn" style="background:#eff6ff; color:#2563eb;"><i class="bi bi-telephone-fill"></i></a>' 
                                     : '<button class="prov-btn" disabled style="background:#f1f5f9; color:#94a3b8;"><i class="bi bi-telephone-fill"></i></button>';
            var btnWsp = wspTel ? '<a href="https://api.whatsapp.com/send?phone=' + wspTel + '" target="_blank" class="prov-btn" style="background:#f0fdf4; color:#16a34a;"><i class="bi bi-whatsapp"></i></a>' 
                                  : '<button class="prov-btn" disabled style="background:#f1f5f9; color:#94a3b8;"><i class="bi bi-whatsapp"></i></button>';
            
            return '<div class="prov-card" onclick="window.abrirModalProveedor(\'' + _provEsc(d.id) + '\', true)">' +
                '<div class="prov-avatar">' + initials + '</div>' +
                '<div class="prov-info">' +
                    '<div class="prov-name">' + _provEsc(d.nombre || 'Sin Nombre') + '</div>' +
                    '<div class="prov-sub">' + docSub + '</div>' +
                    (d.estado === 'Activo' ? '<div class="prov-lic">Activo</div>' : '<div class="prov-lic" style="background:#f1f5f9; color:#64748b;">Inactivo</div>') +
                '</div>' +
                '<div class="prov-actions" onclick="event.stopPropagation()">' +
                    btnLlamar + btnWsp +
                '</div>' +
            '</div>';
        }).join('');
    }

    window._provRenderPaginador(total, paginas, inicio + datos.length);
    window._provActualizarBtnMasivo();
};

window._provRenderPaginador = function(total, paginas, hasta) {
    var cont = document.getElementById('prov-paginador');
    if (!cont) return;
    var pag = window._provPagina;
    var btns = '';
    btns += '<button class="btn btn-xs btn-outline-secondary" onclick="window._provIrPagina('+ (pag - 1) + ')" ' + (pag <= 1 ? 'disabled' : '') + '>‹ Ant</button>';
    // Números de página (máx 5 visibles)
    var start = Math.max(1, pag - 2), end = Math.min(paginas, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (var i = start; i <= end; i++) {
        btns += '<button class="btn btn-xs ' + (i === pag ? 'btn-primary' : 'btn-outline-secondary') + '" onclick="window._provIrPagina(' + i + ')">' + i + '</button>';
    }
    btns += '<button class="btn btn-xs btn-outline-secondary" onclick="window._provIrPagina(' + (pag + 1) + ')" ' + (pag >= paginas ? 'disabled' : '') + '>Sig ›</button>';
    btns += '<span class="text-muted small ms-2">Pág ' + pag + ' de ' + paginas + ' (' + total + ' total)</span>';
    cont.innerHTML = btns;
};

window._provIrPagina = function(pag) {
    var paginas = Math.max(1, Math.ceil((window._provFiltrados||[]).length / (window._provPorPagina||25)));
    window._provPagina = Math.max(1, Math.min(paginas, pag));
    window._provRender();
};

// ── Tags de marca ─────────────────────────────────────────────────
window._provRenderTags = function() {
    var cont = document.getElementById('prov-marcas-tags');
    if (!cont) return;
    cont.innerHTML = (window._provMarcas||[]).map(function(m) {
        return '<span class="badge bg-secondary d-flex align-items-center gap-1">' + _provEsc(m) +
               '<i class="bi bi-x-circle" style="cursor:pointer;" onclick="window._provQuitarMarca(\''+m.replace(/'/g,"\\'")+'\')"></i></span>';
    }).join('');
};

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

window._provCuentas = window._provCuentas || [];

// Lista estándar de Bancos y Cajas en el Perú
window.BANCOS_PERU = [
    'BCP (Banco de Crédito del Perú)',
    'BBVA',
    'Interbank',
    'Scotiabank',
    'Banco de la Nación',
    'BanBif',
    'Banco Pichincha',
    'Banco GNB',
    'Banco de Comercio',
    'Banco Santander',
    'Banco Ripley',
    'Banco Falabella',
    'Banco Alfin',
    'MiBanco',
    'Caja Arequipa',
    'Caja Huancayo',
    'Caja Piura',
    'Caja Cusco',
    'Caja Trujillo',
    'Caja Sullana',
    'Caja Ica',
    'Caja Tacna',
    'Otro'
];

window.TIPOS_CUENTA_PERU = [
    'CUENTA CORRIENTE',
    'CUENTA DE AHORROS',
    'CUENTA REMUNERADA'
];

window._provCambiarTab = function(tab) {
    var btnDatos = document.getElementById('tab-prov-btn-datos');
    var btnCuentas = document.getElementById('tab-prov-btn-cuentas');
    var tabDatos = document.getElementById('tab-prov-datos');
    var tabCuentas = document.getElementById('tab-prov-cuentas');

    if (tab === 'cuentas') {
        if (tabDatos) tabDatos.style.display = 'none';
        if (tabCuentas) tabCuentas.style.display = 'block';
        if (btnDatos) {
            btnDatos.classList.remove('active');
            btnDatos.style.background = 'transparent';
            btnDatos.style.borderBottomColor = 'transparent';
            btnDatos.style.color = '#64748b';
        }
        if (btnCuentas) {
            btnCuentas.classList.add('active');
            btnCuentas.style.background = '#fff';
            btnCuentas.style.borderBottomColor = '#0284c7';
            btnCuentas.style.color = '#0284c7';
        }
        window._provRenderTablaCuentas();
    } else {
        if (tabDatos) tabDatos.style.display = 'block';
        if (tabCuentas) tabCuentas.style.display = 'none';
        if (btnDatos) {
            btnDatos.classList.add('active');
            btnDatos.style.background = '#fff';
            btnDatos.style.borderBottomColor = '#0284c7';
            btnDatos.style.color = '#0284c7';
        }
        if (btnCuentas) {
            btnCuentas.classList.remove('active');
            btnCuentas.style.background = 'transparent';
            btnCuentas.style.borderBottomColor = 'transparent';
            btnCuentas.style.color = '#64748b';
        }
    }
};

window._provRenderTablaCuentas = function() {
    var tbody = document.getElementById('prov-tbody-cuentas');
    var emptyBox = document.getElementById('prov-cuentas-vacio');
    var badge = document.getElementById('prov-cuentas-count-badge');
    if (badge) badge.textContent = (window._provCuentas || []).length;

    if (!tbody) return;
    if (!window._provCuentas || !window._provCuentas.length) {
        tbody.innerHTML = '';
        if (emptyBox) emptyBox.style.display = 'block';
        return;
    }
    if (emptyBox) emptyBox.style.display = 'none';

    tbody.innerHTML = window._provCuentas.map(function(c, idx) {
        var optBancos = window.BANCOS_PERU.map(function(b) {
            var sel = (c.banco === b) ? 'selected' : '';
            return '<option value="' + _provEsc(b) + '" ' + sel + '>' + _provEsc(b) + '</option>';
        }).join('');

        var optTipos = window.TIPOS_CUENTA_PERU.map(function(t) {
            var sel = (c.tipo_cuenta === t) ? 'selected' : '';
            return '<option value="' + _provEsc(t) + '" ' + sel + '>' + _provEsc(t) + '</option>';
        }).join('');

        var chkDetraccion = (c.detraccion === 1 || c.detraccion === true || c.detraccion === '1') ? 'checked' : '';
        var chkEstado = (c.estado === 1 || c.estado === true || c.estado === '1' || c.estado === undefined) ? 'checked' : '';

        return '<tr>' +
            '<td style="padding:6px 8px;">' +
                '<select class="form-select form-select-sm fw-semibold" onchange="window._provActualizarCuenta(' + idx + ', \'banco\', this.value)" style="font-size:0.8rem;border-radius:8px;">' +
                    '<option value="">Seleccione Banco...</option>' + optBancos +
                '</select>' +
            '</td>' +
            '<td style="padding:6px 8px;">' +
                '<select class="form-select form-select-sm fw-semibold" onchange="window._provActualizarCuenta(' + idx + ', \'tipo_cuenta\', this.value)" style="font-size:0.8rem;border-radius:8px;">' +
                    optTipos +
                '</select>' +
            '</td>' +
            '<td style="padding:6px 8px;">' +
                '<input type="text" class="form-control form-control-sm fw-bold" placeholder="N° de cuenta o CCI" value="' + _provEsc(c.numero_cuenta || '') + '" oninput="window._provActualizarCuenta(' + idx + ', \'numero_cuenta\', this.value)" style="font-size:0.8rem;border-radius:8px;">' +
            '</td>' +
            '<td style="text-align:center;padding:6px 8px;">' +
                '<input type="checkbox" class="form-check-input" ' + chkDetraccion + ' onchange="window._provActualizarCuenta(' + idx + ', \'detraccion\', this.checked ? 1 : 0)" style="cursor:pointer;width:1.2em;height:1.2em;">' +
            '</td>' +
            '<td style="text-align:center;padding:6px 8px;">' +
                '<input type="checkbox" class="form-check-input" ' + chkEstado + ' onchange="window._provActualizarCuenta(' + idx + ', \'estado\', this.checked ? 1 : 0)" style="cursor:pointer;width:1.2em;height:1.2em;">' +
            '</td>' +
            '<td style="text-align:center;padding:6px 8px;">' +
                '<button type="button" class="btn btn-sm btn-outline-danger border-0 p-1" onclick="window._provEliminarFilaCuenta(' + idx + ')" title="Eliminar cuenta">' +
                    '<i class="bi bi-trash-fill"></i>' +
                '</button>' +
            '</td>' +
        '</tr>';
    }).join('');
};

window._provAgregarFilaCuenta = function() {
    window._provCuentas = window._provCuentas || [];
    window._provCuentas.push({
        banco: 'BCP (Banco de Crédito del Perú)',
        tipo_cuenta: 'CUENTA CORRIENTE',
        numero_cuenta: '',
        detraccion: 0,
        estado: 1
    });
    window._provRenderTablaCuentas();
};

window._provEliminarFilaCuenta = function(idx) {
    window._provCuentas.splice(idx, 1);
    window._provRenderTablaCuentas();
};

window._provActualizarCuenta = function(idx, campo, valor) {
    if (window._provCuentas && window._provCuentas[idx]) {
        window._provCuentas[idx][campo] = valor;
    }
};

// ── Modal ─────────────────────────────────────────────────────────
window.abrirModalProveedor = function(id, soloDetalle) {
    var titulo = document.getElementById('modal-prov-titulo');
    var editId = document.getElementById('prov-edit-id');
    var form   = document.getElementById('form-proveedor');
    var footer = document.getElementById('prov-modal-footer');
    if (!form) return;
    form.reset();
    if (editId) editId.value = '';
    window._provMarcas = [];
    window._provCuentas = [];
    window._provCambiarTab('datos');

    var inputs = form.querySelectorAll('input, select, textarea, button:not(#prov-modal-footer button)');
    inputs.forEach(function(el) { el.disabled = false; });

    if (id) {
        var item = (window._provData||[]).find(function(d) { return d.id === id; });
        if (!item) return;
        if (titulo) titulo.innerHTML = soloDetalle ? '<i class="bi bi-eye-fill me-1"></i>Detalle de Proveedor — '+id : '<i class="bi bi-pencil-fill me-1"></i>Editar Proveedor — '+id;
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
        window._provCuentas = item.cuentas ? JSON.parse(JSON.stringify(item.cuentas)) : [];

        var badge = document.getElementById('prov-cuentas-count-badge');
        if (badge) badge.textContent = window._provCuentas.length;
        
        if (soloDetalle) {
            inputs.forEach(function(el) { el.disabled = true; });
            if (footer) {
                footer.innerHTML = '<button type="button" class="btn btn-secondary rounded-3" onclick="window._provCerrarModal()">Cerrar</button>' +
                                   '<button type="button" class="btn btn-primary rounded-3" onclick="window.abrirModalProveedor(\''+id+'\', false)"><i class="bi bi-pencil-fill me-1"></i>Editar</button>';
            }
        } else {
            if (footer) {
                footer.innerHTML = '<button type="button" class="btn btn-secondary rounded-3" onclick="window._provCerrarModal()">Cancelar</button>' +
                                   '<button type="submit" class="btn btn-primary rounded-3" style="background:#0284c7;border-color:#0284c7;"><i class="bi bi-save me-1"></i>Guardar</button>';
            }
        }
    } else {
        if (titulo) titulo.innerHTML = '<i class="bi bi-building-fill me-1"></i>Nuevo Proveedor';
        if (footer) {
            footer.innerHTML = '<button type="button" class="btn btn-secondary rounded-3" onclick="window._provCerrarModal()">Cancelar</button>' +
                               '<button type="submit" class="btn btn-primary rounded-3" style="background:#0284c7;border-color:#0284c7;"><i class="bi bi-save me-1"></i>Guardar</button>';
        }
    }
    window._provRenderTags();
    var mEl = document.getElementById('modal-proveedor');
    if (mEl) {
        mEl.style.zIndex = '1080';
        mEl.classList.add('open');
    }
    var b = document.getElementById('prov-backdrop');
    if (b) {
        b.style.zIndex = '1075';
        b.style.display = 'block';
    }
};

window._provCerrarModal = function() {
    var modal = document.getElementById('modal-proveedor');
    var backdrop = document.getElementById('prov-backdrop');
    if (modal) modal.classList.remove('open');
    if (backdrop) backdrop.style.display = 'none';
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
        marcas:          window._provMarcas || [],
        cuentas:         window._provCuentas || []
    };
    if (!payload.nombre) { alert('El nombre es obligatorio.'); return; }
    var url    = id ? '/api/almacen/proveedores/'+encodeURIComponent(id) : '/api/almacen/proveedores';
    var method = id ? 'PUT' : 'POST';
    fetch(url, { method: method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        .then(function(r) {
            if (!r.ok) return r.json().catch(function(){ return {}; }).then(function(body) { throw new Error('HTTP '+r.status+(body.error ? ': '+body.error : '')); });
            return r.json();
        })
        .then(function(res) {
            window._provCerrarModal();
            if (typeof window.cargarProveedores === 'function') window.cargarProveedores();
            if (typeof window._onProveedorCreado === 'function') {
                var cb = window._onProveedorCreado;
                window._onProveedorCreado = null;
                var newId = (res && res.id) ? res.id : id;
                var nombreProv = payload.razon_social || payload.nombre;
                cb(newId, nombreProv, payload.numero_documento);
            }
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
        if(typeof window.rotToast === 'function') window.rotToast("Ingrese un número de documento.", "bg-warning");
        else alert("Ingrese un número de documento.");
        return;
    }
    
    let btnIcon = document.querySelector('button[onclick="window.consultarDocProveedor()"] i');
    if(btnIcon) btnIcon.className = "spinner-border spinner-border-sm";
    
    try {
        let url = '';
        if (tipo === 'RUC' || tipo === 'DNI') {
            url = '/api/proxy/documento?tipo=' + tipo + '&numero=' + numero;
        } else {
            throw new Error("La consulta automática solo está disponible para RUC y DNI.");
        }
        
        let res = await fetch(url);
        if (!res.ok) {
            throw new Error("No se encontró información o hubo un error en la consulta.");
        }
        let data = await res.json();
        
        if (tipo === 'RUC') {
            let razon = document.getElementById('prov-f-razon');
            let nombre = document.getElementById('prov-f-nombre');
            let dir = document.getElementById('prov-f-dir');
            
            if (razon) razon.value = data.nombre || '';
            if (nombre && !nombre.value) nombre.value = data.nombre || '';
            if (dir) dir.value = data.direccion || '';
            
            if(typeof window.rotToast === 'function') window.rotToast("Datos RUC consultados con éxito.", "bg-success");
        } else if (tipo === 'DNI') {
            let razon = document.getElementById('prov-f-razon');
            let nombre = document.getElementById('prov-f-nombre');
            let nombreCompleto = (data.nombres + " " + data.apellidoPaterno + " " + data.apellidoMaterno).trim();
            
            if (razon) razon.value = nombreCompleto;
            if (nombre && !nombre.value) nombre.value = nombreCompleto;
            
            if(typeof window.rotToast === 'function') window.rotToast("Datos DNI consultados con éxito.", "bg-success");
        }
    } catch(err) {
        if(typeof window.rotToast === 'function') window.rotToast(err.message, "bg-danger");
        else alert(err.message);
    } finally {
        if(btnIcon) btnIcon.className = "bi bi-search";
    }
};
