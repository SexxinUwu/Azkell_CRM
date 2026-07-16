// ================================================================
// MÓDULO ALMACÉN / INVENTARIO — Lógica SPA Aislada v2 (Cards)
// Convención: window.var = window.var || default (no let/const globales)
// ================================================================

// ── _invCbFiltrar: wrapper de _cbFiltrar
window._invCbFiltrar = function(id) {
    window._cbFiltrar(id);
    var dd  = document.getElementById(id + '-dd');
    if (dd) {
        dd.style.position = 'absolute';
        dd.style.top = '100%';
        dd.style.left = '0';
        dd.style.width = '100%';
        dd.style.zIndex = '99999';
    }
};

window._invData              = window._invData              || [];
window._invFiltrados         = window._invFiltrados         || [];
window._invPagActual         = window._invPagActual         || 1;
window._invProveedores       = window._invProveedores       || [];
window._invMarcasSeleccionadas = window._invMarcasSeleccionadas || [];
window._invMarcasPlacas      = window._invMarcasPlacas      || [];
var _INV_POR_PAG = 10;

window._invSistemasData = window._invSistemasData || [];
window._invUnidadesData = window._invUnidadesData || [];
window._invFamiliasData = window._invFamiliasData || [];
window._invModoSeleccion = false;
window._invSeleccionados = window._invSeleccionados instanceof Set ? new Set() : new Set();

window.init_inventario = function() {
    // Inyectar CSS Bento Grid
    if (!document.getElementById('almacen-bento-css')) {
        var lnk = document.createElement('link');
        lnk.id = 'almacen-bento-css';
        lnk.rel = 'stylesheet';
        lnk.href = '/modulos/almacen/almacen-bento.css';
        document.head.appendChild(lnk);
    }
    if (!window.checkPerm('inv', 'l')) {
        window.showNoPermMsg('mod-inventario');
        return;
    }
    var btnNuevo = document.querySelector('#mod-inventario .btn-primary[onclick*="abrirModalArticulo"]');
    if (btnNuevo) btnNuevo.style.display = window.checkPerm('inv','c') ? '' : 'none';
    // Mostrar botón seleccionar solo si tiene permiso eliminar
    var btnSel = document.getElementById('inv-btn-sel');
    if (btnSel) btnSel.style.display = window.checkPerm('inv','d') ? '' : 'none';
    // Resetear modo selección al entrar al módulo
    window._invModoSeleccion = false;
    window._invSeleccionados = new Set();
    window._invPagActual = 1;
    // Cargar tipo de cambio para conversión USD→PEN
    window._invTC = window._invTC || 3.70;
    fetch('/api/almacen/configuracion')
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(cfg){ if (cfg && cfg.tipo_cambio) window._invTC = parseFloat(cfg.tipo_cambio) || 3.70; })
        .catch(function(){});
    window.cargarInventario();
    window._invCargarMarcasPlacas();
    window._invCargarUnidades();
    window._invCargarSistemas();
    window._invCargarFamilias();
    window._invCargarMarcasFabricante();
    // Inicializar comboboxes estáticos
    window._cbInit('inv-f-tipo',     ['','Original','Alternativo','Servicio'],        'Buscar tipo...');
    window._cbInit('inv-f-sub-tipo', ['','Nuevo','Reparado'],                 'Buscar sub-tipo…');
    window._cbInit('inv-f-moneda', [
        {value:'PEN', label:'PEN (S/)'},
        {value:'USD', label:'USD ($)'}
    ], 'Moneda…');
    window._cbInit('inv-f-estado-art', [
        {value:'Activo',        label:'Activo'},
        {value:'Inactivo',      label:'Inactivo'},
        {value:'Descontinuado', label:'Descontinuado'}
    ], 'Estado…');
    window._cbInit('inv-f-almacen', [
        {value:'',           label:'— Sin almacén —'},
        {value:'Principal',  label:'Principal'},
        {value:'Lubricantes',label:'Lubricantes'},
        {value:'Neumáticos', label:'Neumáticos'}
    ], 'Buscar almacén…');
    // Al seleccionar moneda → mostrar/ocultar campo T/C
    window._cbOnSelect('inv-f-moneda', function() {
        var m = window._cbGet('inv-f-moneda');
        var row = document.getElementById('inv-tc-row');
        if (row) row.style.display = m === 'USD' ? 'block' : 'none';
        var tcEl = document.getElementById('inv-f-tc');
        if (tcEl && !tcEl.value) tcEl.value = window._invTC || 3.70;
    });
    // Al seleccionar sistema → actualizar opciones de sub-sistema
    window._cbOnSelect('inv-f-sistema', function() { window._invFiltrarSubSistemas(); });
    // ── Inicialización mobile ──────────────────────────────────────
    window._invMobileInit();
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
            window._invRenderKPIs(data);
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

window._invCargarMarcasPlacas = function() {
    fetch('/api/almacen/marcas-placas')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._invMarcasPlacas = data || [];
        })
        .catch(function() {});
};

window._invCargarUnidades = function() {
    fetch('/api/almacen/unidades')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._invUnidadesData = data || [];
            var prev = window._cbGet('inv-f-unidad');
            var items = [{ value: '', label: '— Sin unidad —' }].concat(
                data.map(function(u) {
                    var desc = u.descripcion || u.nombre;
                    return { value: desc, label: desc };
                })
            );
            window._cbInit('inv-f-unidad', items, 'Buscar unidad…');
            if (prev) {
                // prev puede ser código (KG) o descripción (Kilogramos)
                var uObj = data.find(function(u) { return u.nombre === prev || u.descripcion === prev; });
                var uDesc = uObj ? (uObj.descripcion || uObj.nombre) : prev;
                window._cbSet('inv-f-unidad', uDesc, uDesc);
            }
        })
        .catch(function() {});
};

window._invCargarSistemas = function() {
    fetch('/api/almacen/sistemas')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._invSistemasData = data || [];
            var prev = window._cbGet('inv-f-sistema');
            var items = [{ value: '', label: '— Sin sistema —' }].concat(
                data.map(function(s) { return { value: s.nombre, label: s.nombre }; })
            );
            window._cbInit('inv-f-sistema', items, 'Buscar sistema…');
            if (prev) { window._cbSet('inv-f-sistema', prev, prev); window._invFiltrarSubSistemas(); }
            // Poblar filtro barra (select simple, no combobox)
            var filSis = document.getElementById('inv-fil-sistema');
            if (filSis) {
                var prevF = filSis.value;
                filSis.innerHTML = '<option value="">Todos los sistemas</option>' +
                    data.map(function(s) {
                        return '<option value="' + _invEsc(s.nombre) + '"' + (s.nombre === prevF ? ' selected' : '') + '>' + _invEsc(s.nombre) + '</option>';
                    }).join('');
            }
        })
        .catch(function() {});
};

window._invFiltrarSubSistemas = function() {
    var sis  = window._cbGet('inv-f-sistema');
    var prev = window._cbGet('inv-f-sub-sistema');
    var subs = (window._invSistemasData || []).filter(function(s) { return s.nombre === sis; });
    var subsNombres = subs.length && subs[0].sub_sistemas ? subs[0].sub_sistemas : [];
    var items = [{ value: '', label: '— Sin sub-sistema —' }].concat(
        subsNombres.map(function(n) { return { value: n, label: n }; })
    );
    window._cbInit('inv-f-sub-sistema', items, 'Buscar sub-sistema…');
    if (prev && subsNombres.indexOf(prev) >= 0) window._cbSet('inv-f-sub-sistema', prev, prev);
    else window._cbReset('inv-f-sub-sistema');
};

window._invCargarFamilias = function() {
    fetch('/api/almacen/familias')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._invFamiliasData = data || [];
            var prev = window._cbGet('inv-f-familia');
            var items = [{ value: '', label: '— Sin familia —' }].concat(
                data.map(function(f) { return { value: f.nombre, label: f.nombre }; })
            );
            window._cbInit('inv-f-familia', items, 'Buscar familia…');
            if (prev) window._cbSet('inv-f-familia', prev, prev);
            // Poblar filtro barra (select simple)
            var filFam = document.getElementById('inv-fil-familia');
            if (filFam) {
                var prevF = filFam.value;
                filFam.innerHTML = '<option value="">Todas las familias</option>' +
                    data.map(function(f) {
                        return '<option value="' + _invEsc(f.nombre) + '"' + (f.nombre === prevF ? ' selected' : '') + '>' + _invEsc(f.nombre) + '</option>';
                    }).join('');
            }
        })
        .catch(function() {});
};

window._invCargarMarcasFabricante = function() {
    fetch('/api/almacen/marcas')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._invMarcasFabData = data || [];
            var prev = window._cbGet('inv-f-marca');
            var items = [{ value: '', label: '— Sin marca —' }].concat(
                data.map(function(m) { return { value: m.nombre, label: m.nombre }; })
            );
            window._cbInit('inv-f-marca', items, 'Buscar marca…');
            if (prev) window._cbSet('inv-f-marca', prev, prev);
        })
        .catch(function() {});
};

// ── Poblar / Multiselect Marcas (Unidades Compatibles) ────────────────────────────
window._invMarcasLista = window._invMarcasLista || [];
window._invMarcasSeleccionadas = window._invMarcasSeleccionadas || [];

window.invMsInit = function(valorActual) {
    var arr = [];
    if (typeof valorActual === 'string' && valorActual.trim().startsWith('[')) {
        try { arr = JSON.parse(valorActual); } catch(e) {}
    } else if (typeof valorActual === 'string' && valorActual) {
        arr = valorActual.split(',').map(function(m){ return m.trim(); });
    } else if (Array.isArray(valorActual)) {
        arr = valorActual;
    }
    window._invMarcasSeleccionadas = arr.filter(Boolean);
    window.invMsRenderBox();
    
    var dd = document.getElementById('inv-ms-dropdown');
    if (dd) dd.style.display = 'none';
    var s = document.getElementById('inv-ms-search');
    if (s) s.value = '';

    var doRender = function() { window.invMsRenderOptions(''); };
    if (window._invMarcasLista.length > 0) { doRender(); return; }
    
    fetch('/api/placas-lista')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(data) {
            var marcasSet = {};
            data.forEach(function(p) {
                if (p.marca) marcasSet[p.marca.trim().toUpperCase()] = true;
            });
            window._invMarcasLista = Object.keys(marcasSet).sort();
            doRender();
        })
        .catch(function() {});
};

window.invMsToggle = function() {
    var dd = document.getElementById('inv-ms-dropdown');
    var box = document.getElementById('inv-ms-box');
    if (!dd) return;
    var isOpen = dd.style.display !== 'none';
    if (isOpen) {
        dd.style.display = 'none';
        if (box) box.style.borderColor = 'rgba(229,231,235,0.6)';
    } else {
        dd.style.display = 'block';
        if (box) box.style.borderColor = '#2563eb';
        var search = document.getElementById('inv-ms-search');
        if (search) { search.value = ''; search.focus(); }
        window.invMsRenderOptions('');
    }
};

window.invMsSearch = function() {
    var s = document.getElementById('inv-ms-search');
    if (s) window.invMsRenderOptions(s.value.toLowerCase());
};

window.invMsRenderOptions = function(filtro) {
    var cont = document.getElementById('inv-ms-options');
    if (!cont) return;
    var html = '';
    window._invMarcasLista.forEach(function(m) {
        if (filtro && m.toLowerCase().indexOf(filtro) === -1) return;
        var checked = window._invMarcasSeleccionadas.includes(m) ? 'checked' : '';
        html += '<div style="padding:6px 16px;display:flex;align-items:center;cursor:pointer;transition:background .2s;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'transparent\'" onclick="window.invMsToggleOption(\'' + m + '\')">';
        html += '<input type="checkbox" class="form-check-input mt-0 me-2 shadow-none" style="cursor:pointer;" ' + checked + ' onclick="event.stopPropagation(); window.invMsToggleOption(\'' + m + '\')">';
        html += '<span style="font-size:0.9rem;color:#334155;">' + m + '</span>';
        html += '</div>';
    });
    if (html === '') html = '<div style="padding:10px 16px;font-size:0.85rem;color:#94a3b8;text-align:center;">No hay coincidencias</div>';
    cont.innerHTML = html;
};

window.invMsToggleOption = function(m) {
    var idx = window._invMarcasSeleccionadas.indexOf(m);
    if (idx > -1) window._invMarcasSeleccionadas.splice(idx, 1);
    else window._invMarcasSeleccionadas.push(m);
    window.invMsRenderBox();
    var s = document.getElementById('inv-ms-search');
    window.invMsRenderOptions(s ? s.value.toLowerCase() : '');
    window._invActualizarPreview();
};

window.invMsClear = function() {
    window._invMarcasSeleccionadas = [];
    window.invMsRenderBox();
    var s = document.getElementById('inv-ms-search');
    window.invMsRenderOptions(s ? s.value.toLowerCase() : '');
    window._invActualizarPreview();
};

window.invMsRenderBox = function() {
    var count = document.getElementById('inv-ms-count');
    if (!count) return;
    var sel = window._invMarcasSeleccionadas.length;
    if (sel === 0) {
        count.textContent = '0 seleccionados';
        count.style.color = '#94a3b8';
    } else if (sel === 1) {
        count.textContent = window._invMarcasSeleccionadas[0];
        count.style.color = '#1e293b';
    } else {
        count.textContent = sel + ' seleccionados';
        count.style.color = '#1e293b';
    }
};

// Close dropdown on click outside
document.addEventListener('click', function(e) {
    var dd = document.getElementById('inv-ms-dropdown');
    var box = document.getElementById('inv-ms-box');
    if (!dd || !box) return;
    if (dd.style.display === 'none') return;
    if (!box.contains(e.target) && !dd.contains(e.target)) {
        dd.style.display = 'none';
        box.style.borderColor = 'rgba(229,231,235,0.6)';
    }
});


// ── Preview nombre generado ──────────────────────────────────────
window._invActualizarPreview = function() {
    var articulo  = ((document.getElementById('inv-f-articulo')        || {}).value || '').trim();
    var codigo    = ((document.getElementById('inv-f-codigo-articulo') || {}).value || '').trim();
    var marca     = ((document.getElementById('inv-f-marca')           || {}).value || '').trim();
    var marcasU   = (window._invMarcasSeleccionadas || []).join(', ');

    var nombre = articulo;
    if (codigo)  nombre += ' ' + codigo;
    if (marcasU) nombre += ' - ' + marcasU;
    if (marca)   nombre += ' / ' + marca;

    var prev = document.getElementById('inv-nombre-preview');
    if (prev) {
        if (nombre.trim()) {
            prev.innerHTML = '<strong>' + _invEsc(nombre) + '</strong>';
        } else {
            prev.innerHTML = '<span class="text-muted fst-italic" style="font-size:0.85rem;font-weight:400;">Completa los campos para generar el nombre…</span>';
        }
    }
};

window._invPoblarFiltros = function(data) {
    // Familia y Sistema se cargan desde BD via _invCargarFamilias / _invCargarSistemas
    // Esta función es un stub para mantener compatibilidad
};

// ── KPI Row Bento ─────────────────────────────────────────────────
window._invSetKpiFiltro = function(tipo) {
    if (window._invKpiFiltro === tipo) {
        window._invKpiFiltro = 'todos'; // toggle off
    } else {
        window._invKpiFiltro = tipo;
    }
    window.filtrarInventario();
    window._invRenderKPIs(window._invData || []);
};

window._invRenderKPIs = function(data) {
    var total = data.filter(function(d) {
        return parseFloat(d.stock_actual || 0) > 0.1;
    }).length;
    var criticos = data.filter(function(d) {
        var sa = parseFloat(d.stock_actual || 0);
        var sm = parseFloat(d.stock_min || 0);
        return sm > 0 && sa < sm;
    }).length;
    var advertencia = data.filter(function(d) {
        var sa = parseFloat(d.stock_actual || 0);
        var sm = parseFloat(d.stock_min || 0);
        var sx = parseFloat(d.stock_max || 0);
        return sm > 0 && sx > 0 && sa >= sm && sa < sx;
    }).length;
    var valorSoles = data.reduce(function(s, d) {
        var stock = parseFloat(d.stock_actual || 0);
        if (stock <= 0.1) return s;
        var cs = parseFloat(d.costo_soles != null ? d.costo_soles : d.costo_referencial || 0);
        return s + stock * cs;
    }, 0);
    function fmtV(v, pre) {
        return pre + v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    var elMobile = document.getElementById('inv-kpi-row');
    var elDesktop = document.getElementById('inv-kpi-row-desktop');

    var f = window._invKpiFiltro || 'todos';
    var opT = (f === 'todos' || f === 'total') ? '1' : '0.5';
    var opB = (f === 'bajo') ? '1' : (f === 'todos' ? '1' : '0.5');
    var opC = (f === 'critico') ? '1' : (f === 'todos' ? '1' : '0.5');
    var baseTrans = 'cursor:pointer; transition: opacity 0.2s, transform 0.1s;';

    // 1) Render para Mobile (iOS Style)
    if (elMobile) {
        elMobile.innerHTML =
            '<div onclick="window._invSetKpiFiltro(\'total\')" style="' + baseTrans + ' opacity:' + opT + '; background-color:white; border-radius:1rem; padding:0.75rem; box-shadow:0 1px 2px 0 rgba(0,0,0,0.05); display:flex; flex-direction:column; justify-content:space-between;">' +
              '<div class="d-flex justify-content-between align-items-start mb-2">' +
                '<span style="font-size:10px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em; line-height:1.1;">Total<br/>Artículos</span>' +
                '<div style="background-color:#eff6ff; color:#3b82f6; padding:6px; border-radius:8px; display:flex; align-items:center; justify-content:center;">' +
                  '<i class="bi bi-box-seam"></i>' +
                '</div>' +
              '</div>' +
              '<span style="font-size:1.5rem; font-weight:700; color:#111827; letter-spacing:-0.025em;">' + total.toLocaleString() + '</span>' +
            '</div>' +

            '<div onclick="window._invSetKpiFiltro(\'bajo\')" style="' + baseTrans + ' opacity:' + opB + '; background-color:white; border-radius:1rem; padding:0.75rem; box-shadow:0 1px 2px 0 rgba(0,0,0,0.05); display:flex; flex-direction:column; justify-content:space-between;">' +
              '<div class="d-flex justify-content-between align-items-start mb-2">' +
                '<span style="font-size:10px; font-weight:700; color:#f59e0b; text-transform:uppercase; letter-spacing:0.05em; line-height:1.1;">Stock<br/>Bajo</span>' +
                '<div style="background-color:#fffbeb; color:#f59e0b; padding:6px; border-radius:8px; display:flex; align-items:center; justify-content:center;">' +
                  '<i class="bi bi-exclamation-triangle"></i>' +
                '</div>' +
              '</div>' +
              '<span style="font-size:1.5rem; font-weight:700; color:#f59e0b; letter-spacing:-0.025em;">' + advertencia + '</span>' +
            '</div>' +

            '<div onclick="window._invSetKpiFiltro(\'critico\')" style="' + baseTrans + ' opacity:' + opC + '; background-color:#ef4444; border-radius:1rem; padding:0.75rem; box-shadow:0 1px 2px 0 rgba(0,0,0,0.05); display:flex; flex-direction:column; justify-content:space-between; color:white;">' +
              '<div class="d-flex justify-content-between align-items-start mb-2">' +
                '<span style="font-size:10px; font-weight:700; color:#fee2e2; text-transform:uppercase; letter-spacing:0.05em; line-height:1.1;">Stock<br/>Crítico</span>' +
                '<div style="background-color:rgba(248,113,113,0.5); color:white; padding:6px; border-radius:8px; display:flex; align-items:center; justify-content:center;">' +
                  '<i class="bi bi-exclamation-circle"></i>' +
                '</div>' +
              '</div>' +
              '<span style="font-size:1.5rem; font-weight:700; letter-spacing:-0.025em;">' + criticos + '</span>' +
            '</div>';
    }

    // 2) Render para Escritorio (Bento Old Style)
    if (elDesktop) {
        elDesktop.innerHTML =
            '<div onclick="window._invSetKpiFiltro(\'total\')" class="bento-kpi" style="' + baseTrans + ' opacity:' + opT + ';">' +
              '<div><div class="bento-kpi-label">Total Artículos</div><div class="bento-kpi-num">' + total.toLocaleString() + '</div></div>' +
              '<div class="bento-kpi-icon" style="background:#eff6ff;color:#2563eb"><i class="bi bi-boxes fs-4"></i></div>' +
            '</div>' +
            '<div onclick="window._invSetKpiFiltro(\'bajo\')" class="bento-kpi" style="' + baseTrans + ' opacity:' + opB + '; background:#fffbeb;border-color:#fde68a">' +
              '<div><div class="bento-kpi-label" style="color:#92400e">Stock Bajo</div><div class="bento-kpi-num" style="color:#d97706">' + advertencia + '</div></div>' +
              '<div class="bento-kpi-icon" style="background:#fef3c7;color:#d97706"><i class="bi bi-exclamation-triangle-fill fs-4"></i></div>' +
            '</div>' +
            '<div onclick="window._invSetKpiFiltro(\'critico\')" class="bento-kpi accent-red" style="' + baseTrans + ' opacity:' + opC + ';">' +
              '<div><div class="bento-kpi-label">Stock Crítico</div><div class="bento-kpi-num">' + criticos + '</div></div>' +
              '<div class="bento-kpi-icon"><i class="bi bi-exclamation-circle-fill fs-4"></i></div>' +
            '</div>' +
            '<div class="bento-kpi accent-dark" style="grid-column:span 1">' +
              '<div><div class="bento-kpi-label">Valorizado S/</div><div class="bento-kpi-num" style="font-size:1.4rem">' + fmtV(valorSoles, 'S/ ') + '</div></div>' +
              '<div class="bento-kpi-icon"><i class="bi bi-coin fs-4" style="color:#fbbf24"></i></div>' +
            '</div>';
    }
};

// ── Filtrar ───────────────────────────────────────────────────────

window._invActiveTab = 'fisicos';

window._invSwitchTab = function(tab) {
    window._invActiveTab = tab;
    var btnFisicos = document.getElementById('inv-tab-fisicos');
    var btnServicios = document.getElementById('inv-tab-servicios');
    if (!btnFisicos || !btnServicios) return;
    
    if (tab === 'fisicos') {
        btnFisicos.className = 'inv-tab-btn active';
        btnFisicos.style.background = '#0ea5e9';
        btnFisicos.style.color = '#fff';
        btnServicios.className = 'inv-tab-btn';
        btnServicios.style.background = 'transparent';
        btnServicios.style.color = '#0ea5e9';
        document.getElementById('inv-fil-familia').style.display = 'inline-block';
        document.getElementById('inv-fil-sistema').style.display = 'inline-block';
    } else {
        btnServicios.className = 'inv-tab-btn active';
        btnServicios.style.background = '#0ea5e9';
        btnServicios.style.color = '#fff';
        btnFisicos.className = 'inv-tab-btn';
        btnFisicos.style.background = 'transparent';
        btnFisicos.style.color = '#0ea5e9';
        document.getElementById('inv-fil-familia').style.display = 'none';
        document.getElementById('inv-fil-sistema').style.display = 'none';
    }
    window.filtrarInventario();
};

window.filtrarInventario = function() {
    var buscar  = ((document.getElementById('inv-buscar')       || {}).value || '').toLowerCase().trim();
    var filFam  = ((document.getElementById('inv-fil-familia')  || {}).value || '');
    var filSis  = ((document.getElementById('inv-fil-sistema')  || {}).value || '');
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
          var matchC = (window._invActiveTab === 'servicios') ? (d.tipo === 'Servicio') : (d.tipo !== 'Servicio');
        
        var f = window._invKpiFiltro || 'todos';
        if (f === 'bajo') {
            var sa = parseFloat(d.stock_actual || 0);
            var sm = parseFloat(d.stock_min || 0);
            var sx = parseFloat(d.stock_max || 0);
            if (!(sm > 0 && sx > 0 && sa >= sm && sa < sx)) return false;
        } else if (f === 'critico') {
            var sa = parseFloat(d.stock_actual || 0);
            var sm = parseFloat(d.stock_min || 0);
            if (!(sm > 0 && sa < sm)) return false;
        }

        return matchB && matchF && matchS && matchC;
    });

    window._invFiltrados.sort(function(a, b) {
        var minA = parseFloat(a.stock_min || 0);
        var minB = parseFloat(b.stock_min || 0);
        window._invRenderStockBadge = function(actual, min, tipo) {
    if (tipo === 'Servicio') return '-';
    var st = parseFloat(actual||0);
    var mn = parseFloat(min||0);
    if(st <= 0) return '<span class="badge bg-danger">Sin Stock</span>';
    if(st <= mn) return '<span class="badge bg-warning text-dark">Stock Bajo</span>';
    return '<span class="badge bg-success">Óptimo</span>';
};     if (minA === 0 && minB !== 0) return 1;
        if (minA !== 0 && minB === 0) return -1;
        return 0;
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
        // Restaurar clases de selección tras re-render
        if (window._invModoSeleccion && window._invSeleccionados.size > 0) {
            window._invSeleccionados.forEach(function(sid) {
                var cardEl = document.querySelector('.card-bento[data-id="' + sid + '"]');
                if (cardEl) {
                    cardEl.classList.add('card-selected');
                    var cb = cardEl.querySelector('input[type=checkbox]');
                    if (cb) cb.checked = true;
                }
            });
        }
    }

    // Paginación
    var paginEl = document.getElementById('inv-paginacion');
    if (paginEl) {
        if (totalPag <= 1) { paginEl.innerHTML = ''; return; }
        var btns = '';
        btns += '<button style="width:38px;height:38px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:' + (pag<=1?'0.35':'1') + ';" ' + (pag<=1?'disabled':'') + ' onclick="window._invIrPag(' + (pag-1) + ')"><i class="bi bi-chevron-left"></i></button>';
        btns += '<span style="font-size:.8rem;font-weight:700;color:var(--subtext);">Pág. <b style="color:var(--text)">' + pag + '</b> / ' + totalPag + '</span>';
        btns += '<button style="width:38px;height:38px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:' + (pag>=totalPag?'0.35':'1') + ';" ' + (pag>=totalPag?'disabled':'') + ' onclick="window._invIrPag(' + (pag+1) + ')"><i class="bi bi-chevron-right"></i></button>';
        paginEl.innerHTML = '<div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .75rem .75rem;">' + btns + '</div>';
    }
};

function _invRenderCard(d) {
    var id = _invEsc(d.id || '');

    // Semáforo de stock
    var stockActual = parseFloat(d.stock_actual != null ? d.stock_actual : 0);
    var stockMin    = parseFloat(d.stock_min || 0);
        var estadoType = 'ok';
    if (stockMin > 0) {
        if (stockActual < stockMin) estadoType = 'critical';
        else if (stockActual >= stockMin && stockActual < stockMin * 1.5) estadoType = 'warning';
    } else {
        if (stockActual === 0) estadoType = 'empty';
    }

    var badgeTxt = estadoType === 'critical' ? '¡REPONER!' : 
                   estadoType === 'warning' ? 'STOCK BAJO' : 
                   estadoType === 'empty' ? 'SIN STOCK' : 'STOCK OK';

    // Badge Classes
    var badgeClass = estadoType === 'ok' ? 'background-color:#dcfce7; color:#15803d;' :
                     estadoType === 'warning' ? 'background-color:#fef3c7; color:#b45309;' :
                     estadoType === 'empty' ? 'background-color:#f1f5f9; color:#64748b;' :
                     'background-color:#fee2e2; color:#b91c1c;';

    // Icon Classes
    var iconMap = {
        'LUBRICANTES':'bi-droplet-fill','Lubricantes':'bi-droplet-fill',
        'FRENOS':'bi-disc','Frenos':'bi-disc',
        'NEUMÁTICOS':'bi-circle','Neumáticos':'bi-circle',
        'FILTROS':'bi-funnel-fill','Filtros':'bi-funnel-fill',
        'ELÉCTRICO':'bi-lightning-fill','Eléctrico':'bi-lightning-fill',
        'MOTOR':'bi-gear-fill','Motor':'bi-gear-fill'
    };
    var iconClass = iconMap[d.familia] || 'bi-box-seam';
        var iconBoxClass = estadoType === 'ok' ? 'background-color:#eff6ff; color:#3b82f6;' :
                       estadoType === 'warning' ? 'background-color:#fef9c3; color:#d97706;' :
                       estadoType === 'empty' ? 'background-color:#f8fafc; color:#94a3b8;' :
                       'background-color:#fef2f2; color:#ef4444;';

    // Checkbox modo selección
    var chkHtml = window._invModoSeleccion
        ? '<input type="checkbox" class="form-check-input" '
          + 'style="position:absolute;top:12px;left:12px;width:18px;height:18px;z-index:5;cursor:pointer;" '
          + 'onchange="window._invToggleCheck(\'' + id + '\',this.checked)" onclick="event.stopPropagation()">'
        : '';

    var clickAttr = window._invModoSeleccion
        ? 'onclick="var cb=this.querySelector(\'input[type=checkbox]\');if(cb){cb.checked=!cb.checked;window._invToggleCheck(\'' + id + '\',cb.checked);}"'
        : 'onclick="window.abrirDetalleInv(\'' + id + '\')"';

    var desc   = _invEsc(d.descripcion || d.articulo || '');
    var familia= _invEsc(d.familia || '—');
    var unidad = _invEsc(d.unidad || 'ud.');
    var costo  = parseFloat(d.costo_soles != null ? d.costo_soles : d.costo_referencial || 0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
    var stockFmt = stockActual.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
    
    var imageOrIcon = (d.imagen_url && d.imagen_url.length > 0)
        ? '<img src="' + _invEsc(d.imagen_url) + '" style="width:100%;height:100%;object-fit:cover;border-radius:0.75rem;">'
        : '<i class="bi ' + iconClass + '" style="font-size:1.5rem;"></i>';

    // React/Tailwind to Inline CSS Translation
    return '<div data-id="' + id + '" ' + clickAttr + ' style="position:relative; background-color:white; border-radius:1rem; padding:1rem; box-shadow:0 1px 2px 0 rgba(0,0,0,0.05); border:1px solid rgba(243,244,246,0.5); display:flex; align-items:center; gap:1rem; margin-bottom:0.75rem; cursor:pointer;">' +
        chkHtml +
        '<div style="width:3rem; height:3rem; border-radius:0.75rem; display:flex; align-items:center; justify-content:center; flex-shrink:0; ' + ((d.imagen_url && d.imagen_url.length > 0) ? 'background-color:transparent;' : iconBoxClass) + '">' +
            imageOrIcon +
        '</div>' +

        '<div style="flex:1; min-width:0;">' +
            '<h3 style="font-weight:600; font-size:0.9375rem; color:#111827; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + desc + '</h3>' +
            '<p style="font-size:0.6875rem; font-weight:500; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em; margin:0.125rem 0 0.5rem 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' +
                familia + ' • ' + id +
            '</p>' +
            '<span style="display:inline-flex; padding:0.125rem 0.5rem; border-radius:0.375rem; font-size:0.625rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; ' + badgeClass + '">' +
                badgeTxt +
            '</span>' +
        '</div>' +

        '<div style="text-align:right; flex-shrink:0;">' +
            '<div style="display:flex; align-items:baseline; justify-content:flex-end; gap:0.25rem;">' +
                '<span style="font-weight:700; font-size:1.125rem; letter-spacing:-0.025em; color:' + (stockActual === 0 ? '#ef4444' : '#111827') + ';">' +
                    stockFmt +
                '</span>' +
                '<span style="font-size:0.625rem; font-weight:600; color:#9ca3af; text-transform:uppercase;">' + unidad + '</span>' +
            '</div>' +
            '<p style="font-size:0.75rem; font-weight:600; color:#9ca3af; margin:0.25rem 0 0 0;">' +
                'S/ ' + costo +
            '</p>' +
            '<p style="font-size:0.625rem; font-weight:600; color:#6b7280; margin:0.25rem 0 0 0;">' +
                'MIN: ' + parseFloat(d.stock_min||0) + ' | MÁX: ' + parseFloat(d.stock_max||0) +
            '</p>' +
        '</div>' +
    '</div>';
}

window._invIrPag = function(n) { window._invPagActual = n; window._invRender(); };

// ── Selección masiva ──────────────────────────────────────────────
window._invToggleSeleccion = function() {
    window._invModoSeleccion = !window._invModoSeleccion;
    window._invSeleccionados.clear();
    var btn = document.getElementById('inv-btn-sel');
    if (btn) {
        btn.classList.toggle('btn-outline-secondary', !window._invModoSeleccion);
        btn.classList.toggle('btn-primary', window._invModoSeleccion);
    }
    var btnAll = document.getElementById('inv-btn-sel-all');
    if (btnAll) btnAll.classList.toggle('d-none', !window._invModoSeleccion);
    var bdel = document.getElementById('inv-btn-bulk-del');
    if (bdel) bdel.classList.add('d-none');
    var cnt = document.getElementById('inv-bulk-cnt');
    if (cnt) cnt.textContent = '0';
    window._invRender();
};

window._invToggleCheck = function(id, checked) {
    if (checked) window._invSeleccionados.add(id);
    else window._invSeleccionados.delete(id);
    var cnt = window._invSeleccionados.size;
    var bdel = document.getElementById('inv-btn-bulk-del');
    if (bdel) bdel.classList.toggle('d-none', cnt === 0);
    var c = document.getElementById('inv-bulk-cnt');
    if (c) c.textContent = cnt;
    // Feedback visual en la card
    var cardEl = document.querySelector('.card-bento[data-id="' + id + '"]');
    if (cardEl) cardEl.classList.toggle('card-selected', checked);
};

window._invCerrarDrawer = function() {
    var d = document.getElementById('inv-form-drawer');
    var bd = document.getElementById('inv-drawer-backdrop');
    if (d) {
        d.classList.remove('open');
        setTimeout(function(){ d.style.display = 'none'; }, 300);
    }
    if (bd) bd.style.display = 'none';
};

window._invSeleccionarTodos = function() {
    var todos = window._invFiltrados || [];
    var todasSeleccionadas = todos.length > 0 && todos.every(function(d) { return window._invSeleccionados.has(d.id); });
    todos.forEach(function(d) {
        if (todasSeleccionadas) window._invSeleccionados.delete(d.id);
        else window._invSeleccionados.add(d.id);
    });
    var cnt = window._invSeleccionados.size;
    var bdel = document.getElementById('inv-btn-bulk-del');
    if (bdel) bdel.classList.toggle('d-none', cnt === 0);
    var c = document.getElementById('inv-bulk-cnt');
    if (c) c.textContent = cnt;
    window._invRender();
};

window._invEliminarMasivo = function() {
    var ids = Array.from(window._invSeleccionados);
    if (!ids.length) return;
    if (!confirm('¿Eliminar ' + ids.length + ' artículo(s) seleccionados? Esta acción los desactivará.')) return;
    fetch('/api/almacen/inventario/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        window._invModoSeleccion = false;
        window._invSeleccionados.clear();
        var btn = document.getElementById('inv-btn-sel');
        if (btn) { btn.classList.add('btn-outline-secondary'); btn.classList.remove('btn-primary'); }
        var btnAll = document.getElementById('inv-btn-sel-all');
        if (btnAll) btnAll.classList.add('d-none');
        var bdel = document.getElementById('inv-btn-bulk-del');
        if (bdel) bdel.classList.add('d-none');
        window.cargarInventario();
    })
    .catch(function(err) { alert('Error: ' + err.message); });
};
function _invEsc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ── Modal Detalle (Vista Rápida) ──────────────────────────────────
window.abrirDetalleInv = function(id) {
    var item = (window._invData || []).find(function(d) { return d.id === id; });
    if (!item) return;
    var drawer = document.getElementById('inv-det-drawer');
    var bd     = document.getElementById('inv-det-backdrop');
    if (!drawer) return;

    // Header
    var elCod  = document.getElementById('inv-det-codigo');
    var elNom  = document.getElementById('inv-det-nombre');
    if (elCod) elCod.textContent = item.id || '';
    if (elNom) elNom.textContent = item.descripcion || '';

    // Botones
    var btnEditar = document.getElementById('inv-det-btn-editar');
    var btnReg    = document.getElementById('inv-det-btn-reg');
    if (btnEditar) btnEditar.onclick = function() {
        window._invCerrarDetalle();
        setTimeout(function() { window.abrirModalInventario(id); }, 320);
    };
    if (btnReg) btnReg.onclick = function() {
        window._invCerrarDetalle();
        setTimeout(function() { window.abrirRegularizarStock(id); }, 320);
    };

    // Datos
    var hasImg  = item.imagen_url && item.imagen_url.length > 0;
    var stock   = parseFloat(item.stock_actual != null ? item.stock_actual : 0);
    var stockMin = parseFloat(item.stock_min || 0);
    var stockMax = parseFloat(item.stock_max || 0);
    var pct     = stockMax > 0 ? Math.min(100, Math.round((stock / stockMax) * 100)) : 0;
    var isCrit  = stockMin > 0 && stock < stockMin;
    var isWarn  = !isCrit && stockMin > 0 && stock < stockMax;
    var stockColor = isCrit ? '#ef4444' : (isWarn ? '#f59e0b' : '#22c55e');
    var stockBg    = isCrit ? '#fef2f2' : (isWarn ? '#fffbeb' : '#f0fdf4');
    var barColor   = isCrit ? '#ef4444' : (isWarn ? '#f59e0b' : '#22c55e');

    var body = document.getElementById('inv-det-body');
    if (!body) return;

    // Imagen — solo si existe
    var imgHtml = hasImg
        ? '<img src="' + _invEsc(item.imagen_url) + '" style="width:100%;max-height:200px;object-fit:contain;border-radius:16px;margin-bottom:1.25rem;">'
        : '';

    // Función fila moderna
    function row(lbl, val, full) {
        if (!val || val === '—' || val === '' || val === 'undefined') return '';
        if (full) {
            return '<div style="padding:.6rem 0;border-bottom:1px solid var(--border);">' +
                   '<div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--subtext);margin-bottom:.3rem;">' + lbl + '</div>' +
                   '<div style="font-size:.85rem;font-weight:600;color:var(--text);">' + val + '</div>' +
                   '</div>';
        }
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:.55rem 0;border-bottom:1px solid var(--border);">' +
               '<span style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--subtext);">' + lbl + '</span>' +
               '<span style="font-size:.88rem;font-weight:700;color:var(--text);text-align:right;max-width:60%;">' + val + '</span>' +
               '</div>';
    }

    var costoHtml = (function() {
        var moneda = (item.moneda || 'PEN').toUpperCase();
        var costoRef  = parseFloat(item.costo_referencial || 0);
        var costoSoles = parseFloat(item.costo_soles != null ? item.costo_soles : costoRef);
        var tc = parseFloat(item.tipo_cambio || 0);
        if (moneda === 'USD' || tc > 0) {
            return '$ ' + costoRef.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:4}) +
                   (tc ? ' &nbsp;<span style="color:var(--subtext);font-size:.78rem">(T/C: ' + tc.toFixed(4) + ')</span>' : '') +
                   '<br><span style="font-size:.82rem;color:#16a34a;font-weight:800">= S/ ' +
                   costoSoles.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span>';
        }
        return 'S/ ' + costoSoles.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
    })();

    body.innerHTML =
        imgHtml +

        // Stock — bloque prominente
        '<div style="background:' + stockBg + ';border-radius:18px;padding:1.1rem 1.25rem;margin-bottom:1.1rem;border:1.5px solid ' + stockColor + '20;">' +
            '<div style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:' + stockColor + ';margin-bottom:.4rem;">Stock Actual</div>' +
            '<div style="font-size:2.4rem;font-weight:900;color:' + stockColor + ';line-height:1;">' +
                stock.toLocaleString('es-PE', {minimumFractionDigits: 2}) +
                '<span style="font-size:.9rem;font-weight:700;margin-left:.4rem;opacity:.75;">' + _invEsc(item.unidad || '') + '</span>' +
            '</div>' +
            (stockMax > 0 ? '<div style="height:6px;background:rgba(0,0,0,.08);border-radius:99px;overflow:hidden;margin-top:.65rem;">' +
                '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:99px;"></div>' +
            '</div>' +
            '<div style="font-size:.65rem;font-weight:700;color:' + stockColor + ';opacity:.8;margin-top:.3rem;">' + pct + '% de capacidad</div>' : '') +
        '</div>' +

        // Filas de datos
        '<div style="margin-bottom:.5rem;">' +
            row('Código', '<span style="background:#f1f5f9;color:#475569;font-size:.72rem;font-weight:800;padding:.2rem .6rem;border-radius:8px;font-family:monospace;">' + _invEsc(item.id) + '</span>') +
            row('Familia', item.familia) +
            row('Almacén', item.almacen) +
            row('Ubicación', item.ubicacion) +
            row('Unidad', item.unidad) +
            row('Costo', costoHtml) +
            row('Stock Min / Max', stockMin + ' / ' + stockMax + (item.unidad ? ' ' + _invEsc(item.unidad) : '')) +
            row('Estado', '<span style="background:' + (item.estado_art === 'Inactivo' ? '#fee2e2' : '#dcfce7') + ';color:' + (item.estado_art === 'Inactivo' ? '#dc2626' : '#16a34a') + ';font-size:.7rem;font-weight:800;padding:.2rem .65rem;border-radius:99px;">' + _invEsc(item.estado_art || 'Activo') + '</span>') +
            (function() {
                if (!item.observaciones) return '';
                var escaped = _invEsc(item.observaciones);
                var parts = escaped.split(/(?=\[REG \d{4}-\d{2}-\d{2}\])/);
                var formatted = escaped;
                if (parts.length > 1) {
                    formatted = '<div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">' +
                        parts.map(function(p) { 
                            return p.trim() ? '<div style="background:rgba(0,0,0,0.02); padding:8px 12px; border-radius:8px; border:1px solid var(--border); font-size:0.8rem; line-height:1.4;">' + p.trim() + '</div>' : ''; 
                        }).join('') +
                        '</div>';
                }
                return row('Observaciones', formatted, true);
            })() +
        '</div>';

    // Abrir
    drawer.classList.add('open');
    if (bd) bd.style.display = 'block';
};

window._invCerrarDetalle = function() {
    var drawer = document.getElementById('inv-det-drawer');
    var bd     = document.getElementById('inv-det-backdrop');
    if (drawer) drawer.classList.remove('open');
    if (bd) bd.style.display = 'none';
};

// ── Modal Add / Edit ─────────────────────────────────────────────
window.abrirModalInventario = function(id) {
    var titulo = document.getElementById('modal-inv-titulo');
    var form   = document.getElementById('form-inv-articulo');
    if (!form) return;
    form.reset();
    var editId = document.getElementById('inv-edit-id');
    if (editId) editId.value = '';

    // Reset chips
    window.invMsInit('');

      // Aislamiento Servicios en el modal
      var isServicio = window._invActiveTab === 'servicios';
        
        var f = document.getElementById('form-inv-articulo');
        if (f) {
            if (isServicio) {
                f.classList.add('form-servicio-mode');
            } else {
                f.classList.remove('form-servicio-mode');
            }
        }
        
        if (isServicio && !id) {
          window._cbSet('inv-f-tipo', 'Servicio', 'Servicio');
          window._cbSet('inv-f-unidad', 'Servicio', 'Servicio');
      }


    // Tabs removidos

    // Reset preview
    window._invActualizarPreview();
    // Reset imagen UI
    _invResetImageUI(null);

    if (id) {
        var item = (window._invData || []).find(function(d) { return d.id === id; });
        if (!item) return;
        if (titulo) titulo.innerHTML = '<i class="bi bi-pencil-fill me-1"></i>Editar Artículo — ' + id;
        if (editId) editId.value = id;

        var btnEliminar = document.getElementById('inv-btn-eliminar-art');
        if (btnEliminar) btnEliminar.style.display = 'inline-block';

        // Tab Artículo
        _invSetField('inv-f-articulo',          item.articulo);
        _invSetField('inv-f-codigo-articulo',   item.codigo_articulo);
        _invSetField('inv-f-marca',             item.marca);
        _invSetField('inv-f-familia',           item.familia);
        // Unidad: mostrar descripción aunque en BD esté el código
        (function() {
            var uObjE = (window._invUnidadesData || []).find(function(u) {
                return u.nombre === item.unidad || u.descripcion === item.unidad;
            });
            var uDescE = uObjE ? (uObjE.descripcion || uObjE.nombre) : (item.unidad || '');
            window._cbSet('inv-f-unidad', uDescE, uDescE);
        })();
        var monedaLabels = {'PEN':'PEN (S/)','USD':'USD ($)'};
        var monVal = item.moneda || 'PEN';
        window._cbSet('inv-f-moneda',     monVal, monedaLabels[monVal] || monVal);
        // Mostrar/ocultar T/C según moneda
        var tcRowE = document.getElementById('inv-tc-row');
        if (tcRowE) tcRowE.style.display = monVal === 'USD' ? 'block' : 'none';
        var tcElE = document.getElementById('inv-f-tc');
        if (tcElE && monVal === 'USD') tcElE.value = item.tipo_cambio || window._invTC || 3.70;
        _invSetField('inv-f-costo',             item.costo_referencial);
        window._cbSet('inv-f-estado-art', item.estado_art || 'Activo', item.estado_art || 'Activo');
        _invSetField('inv-f-obs',               item.observaciones);

        // Chips marca_unidad
        window.invMsInit(item.marca_unidad);
        window._invActualizarPreview();

        // Clasificación
        _invSetField('inv-f-sistema',       item.sistema);
        window._invFiltrarSubSistemas();
        _invSetField('inv-f-sub-sistema',   item.sub_sistema);
        _invSetField('inv-f-tipo',          item.tipo);
        _invSetField('inv-f-sub-tipo',      item.sub_tipo);
        window._cbSet('inv-f-almacen', item.almacen || '', item.almacen || '');
        _invSetField('inv-f-ubicacion',     item.ubicacion);
        _invSetField('inv-f-anaquel',       item.anaquel);
        _invSetField('inv-f-stock-min',     item.stock_min);
        _invSetField('inv-f-stock-max',     item.stock_max);
        _invSetField('inv-f-codigo-barras', item.codigo_barras);

        // Tab Imagen + QR
        _invResetImageUI(item);
    } else {
        if (titulo) titulo.innerHTML = '<i class="bi bi-box-fill me-1"></i>Nuevo Artículo';
        
        var btnEliminar = document.getElementById('inv-btn-eliminar-art');
        if (btnEliminar) btnEliminar.style.display = 'none';

        // Default: moneda PEN → ocultar T/C
        window._cbSet('inv-f-moneda', 'PEN', 'PEN (S/)');
        var tcRow0 = document.getElementById('inv-tc-row');
        if (tcRow0) tcRow0.style.display = 'none';
        // Default unidad = Unidades
        window._cbSet('inv-f-unidad', 'Unidades', 'Unidades');
        window.invMsInit('');
    }

    var modal = document.getElementById('inv-form-drawer');
    if (modal) { 
        modal.style.display = 'flex'; 
        void modal.offsetWidth; 
        modal.classList.add('open'); 
    }
    var bd = document.getElementById('inv-drawer-backdrop');
    if (bd) bd.style.display = 'block';
};

window._invEliminarArticuloActual = function() {
    var editId = document.getElementById('inv-edit-id');
    var id = editId ? editId.value : '';
    if (!id) return;
    
    if (!confirm('¿Estás seguro de que deseas eliminar el artículo ' + id + '? Esta acción lo desactivará o eliminará del sistema.')) return;
    
    fetch('/api/almacen/inventario/' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function(r) {
        if (!r.ok) throw new Error('Error HTTP: ' + r.status);
        return r.json();
    })
    .then(function(res) {
        window._invCerrarDrawer();
        window.cargarInventario();
    })
    .catch(function(err) {
        alert('Error al eliminar: ' + err.message);
    });
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
    var v = val != null ? val : '';
    if (typeof v === 'string' && /^-?\d+[.,]\d+$/.test(v)) {
        v = v.replace(/([.,]\d*?[1-9])0+$/, '$1').replace(/[.,]0+$/, '');
    } else if (typeof v === 'number') {
        v = v.toString();
    }
    var el = document.getElementById(id);
    if (el) el.value = v;
    // Si el campo tiene combobox, actualizar también el input de texto
    var txt = document.getElementById(id + '-txt');
    if (txt) txt.value = v;
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
        if (preview)     { preview.src = data.imagen_url + '?t=' + Date.now(); preview.style.display = ''; }        if (placeholder) { placeholder.style.display = 'none'; }
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

// ── Quick-add Familia / Marca (mini-modal bottom sheet) ──────────
window._invQuickTarget = window._invQuickTarget || null; // 'familia' | 'marca'

window._invQuickOpen = function(tipo) {
    window._invQuickTarget = tipo;
    var panel = document.getElementById('inv-quick-panel');
    var bd    = document.getElementById('inv-quick-bd');
    var titulo= document.getElementById('inv-quick-titulo');
    var input = document.getElementById('inv-quick-input');
    if (!panel || !bd) return;
    if (titulo) titulo.innerHTML = tipo === 'familia'
        ? '<i class="bi bi-tags-fill me-1" style="color:#7c3aed;"></i>Nueva Familia'
        : '<i class="bi bi-award-fill me-1" style="color:#db2777;"></i>Nueva Marca';
    if (input) { input.placeholder = tipo === 'familia' ? 'Ej: LUBRICANTES, FILTROS…' : 'Ej: SHELL, MOBIL…'; input.value = ''; }
    panel.style.display = 'block';
    bd.style.display = 'block';
    setTimeout(function(){ if (input) input.focus(); }, 100);
};

window._invQuickClose = function() {
    var panel = document.getElementById('inv-quick-panel');
    var bd    = document.getElementById('inv-quick-bd');
    if (panel) panel.style.display = 'none';
    if (bd)    bd.style.display = 'none';
    window._invQuickTarget = null;
};

window._invQuickGuardar = function() {
    var input = document.getElementById('inv-quick-input');
    var nombre = input ? input.value.trim() : '';
    if (!nombre) { if (input) input.focus(); return; }
    var tipo = window._invQuickTarget;
    var url  = tipo === 'familia' ? '/api/almacen/familias' : '/api/almacen/marcas';
    window._invQuickClose();
    fetch(url, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({nombre: nombre})
    })
    .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(){
        if (tipo === 'familia') {
            window._invCargarFamilias();
            setTimeout(function(){ window._cbSet('inv-f-familia', nombre, nombre); }, 600);
        } else {
            window._invCargarMarcasFabricante();
            setTimeout(function(){ window._cbSet('inv-f-marca', nombre, nombre); }, 600);
        }
    })
    .catch(function(err){ alert('Error al guardar: ' + err.message); });
};

window._invQuickAddFamilia = function() { window._invQuickOpen('familia'); };
window._invQuickAddMarca   = function() { window._invQuickOpen('marca'); };

// ── Guardar ───────────────────────────────────────────────────────
window.guardarArticuloInv = function(event) {
    if (event) event.preventDefault();
    var id = (document.getElementById('inv-edit-id') || {}).value || '';
    if (!window.guardAction('inv', id ? 'e' : 'c')) return;

    var g  = function(elId) { return (document.getElementById(elId) || {}).value || ''; };
    var gN = function(elId) { return parseFloat(g(elId)) || 0; };

    var articulo       = g('inv-f-articulo').trim();
    var codigoArticulo = g('inv-f-codigo-articulo').trim();
    var marca          = g('inv-f-marca').trim();

    if (!articulo) { alert('El campo "Artículo" es obligatorio.'); return; }

    var payload = {
        articulo:       articulo,
        codigo_articulo: codigoArticulo || null,
        // descripcion se genera en el servidor a partir de los campos anteriores
        familia:        g('inv-f-familia') || null,
        unidad:         g('inv-f-unidad') || null,
        moneda:         g('inv-f-moneda') || 'PEN',
        costo_referencial: gN('inv-f-costo'),
        tipo_cambio: (function(){
            var moneda = g('inv-f-moneda') || 'PEN';
            if (moneda !== 'USD') return null;
            return parseFloat((document.getElementById('inv-f-tc')||{}).value) || window._invTC || 3.70;
        })(),
        marca:          marca || null,
        marca_unidad:   JSON.stringify(window._invMarcasSeleccionadas || []),
        estado_art:     g('inv-f-estado-art') || 'Activo',
        observaciones:  g('inv-f-obs') || null,
        // Clasificación
        sistema:       g('inv-f-sistema') || null,
        sub_sistema:   g('inv-f-sub-sistema') || null,
        tipo:          g('inv-f-tipo') || null,
        sub_tipo:      g('inv-f-sub-tipo') || null,
        almacen:       g('inv-f-almacen') || null,
        ubicacion:     g('inv-f-ubicacion') || null,
        anaquel:       g('inv-f-anaquel') ? gN('inv-f-anaquel') : null,
        stock_min:     gN('inv-f-stock-min'),
        stock_max:     gN('inv-f-stock-max'),
        codigo_barras: g('inv-f-codigo-barras') || null
    };

    var url    = id ? '/api/almacen/inventario/' + encodeURIComponent(id) : '/api/almacen/inventario';
    var method = id ? 'PUT' : 'POST';

    fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function(r) {
            return r.json().then(function(data) {
                if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
                return data;
            });
        })
        .then(function() {
            window._invCerrarDrawer();
            window.cargarInventario();
        })
        .catch(function(err) { alert('Error al guardar: ' + err.message); });
};

// ── Eliminar ──────────────────────────────────────────────────────
window.eliminarArticuloInv = function(id) {
    if (!window.guardAction('inv', 'd')) return;
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
    var headers = [
        'articulo','codigo_articulo','marca','marca_unidad',
        'familia','unidad','moneda','costo','estado_art',
        'almacen','sistema','sub_sistema','tipo','sub_tipo',
        'ubicacion','anaquel','stock_min','stock_max',
        'cantidad_inicial','codigo_barras','observaciones'
    ];
    var ejemplo = [
        'Filtro Aceite Motor','LF3000','WIX','VOLVO,SCANIA',
        'FILTROS','UND','PEN','45.00','Activo',
        'Principal','MOTOR','LUBRICACION','Original','Nuevo',
        'Estante B3','2',3,30,
        10,'7501234567890','Stock apertura'
    ];
    var wsData = [headers, ejemplo];
    var ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = headers.map(function(h) {
        var w = {articulo:22,codigo_articulo:16,marca:12,marca_unidad:20,familia:14,unidad:8,
                  moneda:8,costo:9,estado_art:12,almacen:14,sistema:14,sub_sistema:16,tipo:12,
                  sub_tipo:10,ubicacion:16,anaquel:9,stock_min:10,stock_max:10,
                  cantidad_inicial:14,codigo_barras:16,observaciones:24};
        return { wch: w[h] || 14 };
    });

    var marcasList  = (window._invMarcasFabData || []).map(function(m) { return m.nombre; }).join(',');
    var familiaList = (window._invFamiliasData  || []).map(function(f) { return f.nombre; }).join(',');
    var unidadList  = (window._invUnidadesData  || []).map(function(u) { return u.descripcion || u.nombre; }).join(',');
    var sistList    = (window._invSistemasData  || []).map(function(s) { return s.nombre; }).join(',');

    ws['!dataValidation'] = {};
    if (marcasList)  ws['!dataValidation']['C2:C500'] = { type:'list', formula1: '"' + marcasList  + '"' };
    if (familiaList) ws['!dataValidation']['E2:E500'] = { type:'list', formula1: '"' + familiaList + '"' };
    if (unidadList)  ws['!dataValidation']['F2:F500'] = { type:'list', formula1: '"' + unidadList  + '"' };
    ws['!dataValidation']['G2:G500'] = { type:'list', formula1: '"PEN,USD"' };
    ws['!dataValidation']['I2:I500'] = { type:'list', formula1: '"Activo,Inactivo,Descontinuado"' };
    ws['!dataValidation']['J2:J500'] = { type:'list', formula1: '"Principal,Neumáticos,Llantas,Lubricantes,Filtros"' };
    if (sistList)    ws['!dataValidation']['K2:K500'] = { type:'list', formula1: '"' + sistList    + '"' };
    ws['!dataValidation']['M2:M500'] = { type:'list', formula1: '"Original,Alternativo"' };
    ws['!dataValidation']['N2:N500'] = { type:'list', formula1: '"Nuevo,Reparado"' };

    var famArr  = (window._invFamiliasData  || []).map(function(f) { return f.nombre; });
    var undArr  = (window._invUnidadesData  || []).map(function(u) { return u.nombre; });
    var mrcArr  = (window._invMarcasFabData || []).map(function(m) { return m.nombre; });
    var sisArr  = (window._invSistemasData  || []).map(function(s) { return s.nombre; });
    var maxRows = Math.max(famArr.length, undArr.length, mrcArr.length, sisArr.length, 1);
    var listasData = [['Familia','Unidad','Marca','Sistema','Almacén','Instrucciones']];
    var instrucciones = [
        'cantidad_inicial: stock al inicio (0 si es nuevo)',
        'almacen: Principal / Neumáticos / Llantas',
        'ubicacion: Estante, anaquel, zona',
        'marca_unidad: marcas separadas por coma',
        'Si cantidad_inicial > 0 → se crea regularización automática'
    ];
    for (var i = 0; i < maxRows; i++) {
        listasData.push([famArr[i]||'', undArr[i]||'', mrcArr[i]||'', sisArr[i]||'',
            i===0?'Principal':i===1?'Neumáticos':i===2?'Llantas':'',
            instrucciones[i]||'']);
    }
    var wsListas = XLSX.utils.aoa_to_sheet(listasData);
    wsListas['!cols'] = [{wch:16},{wch:10},{wch:14},{wch:16},{wch:14},{wch:40}];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.utils.book_append_sheet(wb, wsListas, 'Listas');
    XLSX.writeFile(wb, 'Plantilla_Inventario.xlsx');
};

// ── Regularizador de Stock ────────────────────────────────────────
window.abrirRegularizarStock = function(id) {
    var item = (window._invData || []).find(function(d) { return d.id === id; });
    if (!item) return;
    var modal = document.getElementById('modal-inv-regularizar');
    if (!modal) return;

    var elId   = document.getElementById('reg-item-id');
    var elDesc = document.getElementById('reg-item-desc');
    var elVirt = document.getElementById('reg-stock-virtual');
    var elFis  = document.getElementById('reg-stock-fisico');
    var elMot  = document.getElementById('reg-motivo');

    if (elId)   elId.value   = id;
    if (elDesc) elDesc.textContent = item.descripcion || id;
    if (elVirt) {
        var stock = parseFloat(item.stock_actual != null ? item.stock_actual : 0);
        elVirt.textContent = stock.toLocaleString('es-PE', {minimumFractionDigits: 2}) + ' ' + (item.unidad || '');
        elVirt.style.color = stock <= 0 ? 'var(--bs-danger)' : 'var(--bs-success)';
    }
    if (elFis)  { elFis.value = ''; }
    if (elMot)  { elMot.value = ''; }

    bootstrap.Modal.getOrCreateInstance(modal).show();
};

window.guardarRegularizacion = function(event) {
    if (event) event.preventDefault();
    var id        = (document.getElementById('reg-item-id')      || {}).value || '';
    var stockFis  = parseFloat((document.getElementById('reg-stock-fisico') || {}).value);
    var motivo    = ((document.getElementById('reg-motivo')       || {}).value || '').trim();

    if (!id || isNaN(stockFis) || stockFis < 0) {
        alert('Ingresa un stock físico válido (número ≥ 0).');
        return;
    }

    var usuario = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || 'sistema';

    fetch('/api/almacen/inventario/' + encodeURIComponent(id) + '/regularizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_fisico: stockFis, motivo: motivo, usuario: usuario })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(res) {
        var modal = bootstrap.Modal.getInstance(document.getElementById('modal-inv-regularizar'));
        if (modal) modal.hide();
        var item = (window._invData || []).find(function(d) { return d.id === id; });
        if (item) {
            item.stock_regularizado   = stockFis;
            item.fecha_regularizacion = res.fecha_regularizacion;
            item.stock_actual         = stockFis;
        }
        window._invRender();
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('Stock regularizado a ' + stockFis + ' unidades', 'success');
        } else {
            alert('✅ Stock regularizado correctamente a ' + stockFis + ' unidades.');
        }
    })
    .catch(function(err) { alert('Error al regularizar: ' + err.message); });
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
                articulo:          (N['articulo'] || '').toString().trim(),
                codigo_articulo:   (N['codigo_articulo'] || N['codigo articulo'] || '').toString().trim(),
                marca:             (N['marca'] || '').toString().trim().toUpperCase(),
                marca_unidad:      (N['marca_unidad'] || N['marca unidad'] || '').toString().trim(),
                familia:           (N['familia'] || '').toString().trim().toUpperCase(),
                unidad:            (N['unidad'] || '').toString().trim().toUpperCase(),
                moneda:            ((N['moneda'] || 'PEN').toString().toUpperCase()),
                costo_referencial: parseFloat(N['costo'] || N['costo_referencial'] || 0) || 0,
                estado_art:        (N['estado_art'] || N['estado'] || 'Activo').toString().trim(),
                almacen:           (N['almacen'] || N['almacén'] || null),
                sistema:           (N['sistema'] || null),
                sub_sistema:       (N['sub_sistema'] || N['sub sistema'] || null),
                tipo:              (N['tipo'] || null),
                sub_tipo:          (N['sub_tipo'] || N['sub tipo'] || null),
                ubicacion:         (N['ubicacion'] || N['ubicación'] || null),
                anaquel:           parseFloat(N['anaquel'] || 0) || null,
                stock_min:         parseFloat(N['stock_min'] || 0) || 0,
                stock_max:         parseFloat(N['stock_max'] || 0) || 0,
                cantidad_inicial:  parseFloat(N['cantidad_inicial'] || N['cantidad inicial'] || 0) || 0,
                codigo_barras:     (N['codigo_barras'] || N['codigo barras'] || null),
                observaciones:     (N['observaciones'] || '')
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

// ══════════════════════════════════════════════════════════════════
// Mobile-First: FAB, Bottom Nav, Search, Avatar
// ══════════════════════════════════════════════════════════════════
window._invMobileInit = function() {
    // Avatar desde sesión
    var email = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
    var av = document.getElementById('inv-m-avatar');
    if (av && email) {
        var parts = email.split('@')[0].split(/[._-]/);
        var initials = parts.length >= 2
            ? (parts[0][0] + parts[1][0]).toUpperCase()
            : email.substring(0, 2).toUpperCase();
        av.textContent = initials;
    }
    // Renderizar bottom nav dinámico
    window._invRenderBottomNav();
    // MutationObserver: limpiar al salir del módulo
    var rootEl = document.getElementById('root-dinamico');
    if (rootEl && !window._invMobileObserver) {
        window._invMobileObserver = new MutationObserver(function() {
            if (!document.getElementById('mod-inventario')) {
                document.querySelectorAll('.topbar').forEach(function(el) {
                    el.style.removeProperty('display');
                });
                window._invCerrarScanner();
                if (window._invMobileObserver) {
                    window._invMobileObserver.disconnect();
                    window._invMobileObserver = null;
                }
            }
        });
        window._invMobileObserver.observe(rootEl, { childList: true });
    }
};

// ── Bottom Nav dinámico por permisos ─────────────────────────────
window._invRenderBottomNav = function() {
    var nav = document.getElementById('inv-bottom-nav');
    if (!nav) return;
    var perms = {};
    try { perms = JSON.parse(localStorage.getItem('fleet_permisos') || '{}'); } catch(e) {}
    var isAdmin = perms.admin === true;
    var TABS = [
        { id: 'dashboard',  icon: 'bi-house-fill',            label: 'Inicio',  ruta: 'dashboard',                   perm: null    },
        { id: 'inventario', icon: 'bi-box-seam-fill',         label: 'Stock',   ruta: 'almacen/inventario',           perm: 'inv'   },
        { id: 'insp',       icon: 'bi-clipboard2-check-fill', label: 'Insp.',   ruta: 'Mantenimiento/inspecciones',   perm: 'insp'  },
        { id: 'flota',      icon: 'bi-truck-flatbed',         label: 'Flota',   ruta: 'flota/status',                 perm: 'status'},
        { id: 'gps',        icon: 'bi-geo-alt-fill',          label: 'GPS',     ruta: 'flota/ubicacion',              perm: 'gps'   },
        { id: 'mas',        icon: 'bi-grid-3x3-gap-fill',     label: 'Más',     ruta: null,                           perm: null    }
    ];
    var visibles = TABS.filter(function(t) {
        if (!t.perm) return true;
        if (isAdmin) return true;
        var p = perms[t.perm];
        return p && (p.l === 1 || p === true);
    });
    if (visibles.length > 5) visibles = visibles.slice(0, 4).concat([visibles[visibles.length - 1]]);
    nav.innerHTML = visibles.map(function(t) {
        var isActive = t.id === 'inventario';
        var color = isActive ? '#2563eb' : 'var(--subtext)';
        var onclick = t.ruta
            ? 'cargarModuloAislado(\'' + t.ruta + '\')'
            : 'window._invBottomNavMas()';
        return '<button onclick="' + onclick + '" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;background:transparent;border:none;padding:.5rem 0;color:' + color + ';">' +
               '<i class="bi ' + t.icon + '" style="font-size:1.3rem;"></i>' +
               '<span style="font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">' + t.label + '</span>' +
               '</button>';
    }).join('');
};

window._invBottomNavMas = function() {
    var toggle = document.querySelector('[data-action="sidebar-toggle"], #sidebar-toggle, .sidebar-toggle, [onclick*="toggleSidebar"]');
    if (toggle) toggle.click();
};

// ── Avatar popup mobile ───────────────────────────────────────────
window._invAvatarPopup = function() {
    var popup = document.getElementById('inv-avatar-popup');
    var bd    = document.getElementById('inv-avatar-popup-bd');
    if (!popup) return;
    var email  = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
    var rol    = localStorage.getItem('fleet_rol') || 'Usuario';
    var partes = email.split('@')[0].split(/[._-]/);
    var inits  = partes.length >= 2 ? (partes[0][0] + partes[1][0]).toUpperCase() : email.substr(0, 2).toUpperCase();
    var nombre = partes.map(function(p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(' ');
    var elAv = document.getElementById('iap-avatar'); if (elAv) elAv.textContent = inits;
    var elNm = document.getElementById('iap-nombre'); if (elNm) elNm.textContent = nombre;
    var elRl = document.getElementById('iap-rol');    if (elRl) elRl.textContent = rol.charAt(0).toUpperCase() + rol.slice(1);
    var elEm = document.getElementById('iap-email');  if (elEm) elEm.textContent = email;
    popup.style.display = 'block';
    if (bd) bd.style.display = 'block';
};
window._invAvatarPopupClose = function() {
    var popup = document.getElementById('inv-avatar-popup');
    var bd    = document.getElementById('inv-avatar-popup-bd');
    if (popup) popup.style.display = 'none';
    if (bd)    bd.style.display = 'none';
};

// ── Scanner QR / Código de Barras — usa el scanner global ────────
window._invScannerTarget = window._invScannerTarget || null;
window._invScannerStream = window._invScannerStream || null;
window._invScannerRAF    = window._invScannerRAF    || null;

window._invAbrirScanner = function(target) {
    window._invScannerTarget = target;
    var titulo = target === 'form' ? 'Escanear Código de Barras' : 'Buscar por código';
    window._abrirEscaner(function(valor) {
        window._invOnScanResult(valor);
    }, titulo);
};

window._invOnScanResult = function(valor) {
    if (window._invScannerTarget === 'form') {
        // En el formulario: solo rellenar el campo de código de barras
        var campo = document.getElementById('inv-f-codigo-barras');
        if (campo) { campo.value = valor; campo.dispatchEvent(new Event('input')); }
        return;
    }

    // En la lista: buscar artículo por ID o código de barras
    var found = (window._invData || []).find(function(d) {
        return String(d.id).trim() === valor ||
               (d.codigo_barras && d.codigo_barras.trim() === valor);
    });

    if (found) {
        // Abrir directamente el detalle del artículo encontrado
        window.abrirDetalleInv(found.id);
        // Toast breve con el nombre
        if (typeof window.mostrarToast === 'function') window.mostrarToast('Artículo: ' + (found.descripcion || found.articulo || found.id), 'success');
    } else {
        // Intentar búsqueda parcial en el buscador por si el código es parcial
        var inv     = document.getElementById('inv-buscar');
        var mob     = document.getElementById('inv-m-buscar');
        var compact = document.getElementById('inv-search-input');
        if (inv)     inv.value     = valor;
        if (mob)     mob.value     = valor;
        if (compact) compact.value = valor;
        window.filtrarInventario();

        // Si tras filtrar no hay resultados, mostrar mensaje
        setTimeout(function() {
            if (!(window._invFiltrados || []).length) {
                if (typeof window.mostrarToast === 'function') window.mostrarToast('Código no encontrado: ' + valor, 'danger');
            }
        }, 100);
    }
};

// Alias de compatibilidad (se llama desde MutationObserver al desmontar módulo)
window._invCerrarScanner = function() {
    window._cerrarEscaner();
};

window._invFABToggle = function() {
    var menu = document.getElementById('inv-fab-menu');
    var btn  = document.getElementById('inv-fab-btn');
    var bd   = document.getElementById('inv-fab-backdrop');
    if (!menu) return;
    var isOpen = menu.classList.contains('fab-menu-open');
    if (isOpen) {
        menu.classList.remove('fab-menu-open');
        if (btn) btn.classList.remove('fab-open');
        if (bd)  bd.style.display = 'none';
    } else {
        menu.style.display = 'flex'; // necesario para que transition funcione
        requestAnimationFrame(function() {
            menu.classList.add('fab-menu-open');
        });
        if (btn) btn.classList.add('fab-open');
        if (bd)  bd.style.display = 'block';
    }
};

window._invFABClose = function() {
    var menu = document.getElementById('inv-fab-menu');
    var btn  = document.getElementById('inv-fab-btn');
    var bd   = document.getElementById('inv-fab-backdrop');
    if (menu) menu.classList.remove('fab-menu-open');
    if (btn)  btn.classList.remove('fab-open');
    if (bd)   bd.style.display = 'none';
};

window._invMobileSearchToggle = function() {
    var bar = document.getElementById('inv-m-search-bar');
    if (!bar) return;
    var isOpen = bar.style.display === 'flex';
    bar.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen) {
        var inp = document.getElementById('inv-m-buscar');
        if (inp) setTimeout(function() { inp.focus(); }, 100);
    }
};

// _invBottomNav reemplazado por _invRenderBottomNav (dinámico por permisos)
