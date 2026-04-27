// ================================================================
// MÓDULO ALMACÉN / INVENTARIO — Lógica SPA Aislada v2 (Cards)
// Convención: window.var = window.var || default (no let/const globales)
// ================================================================

window._invData              = window._invData              || [];
window._invFiltrados         = window._invFiltrados         || [];
window._invPagActual         = window._invPagActual         || 1;
window._invProveedores       = window._invProveedores       || [];
window._invMarcasSeleccionadas = window._invMarcasSeleccionadas || [];
window._invMarcasPlacas      = window._invMarcasPlacas      || [];
var _INV_POR_PAG = 24;

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
    window.cargarInventario();
    window._invCargarMarcasPlacas();
    window._invCargarUnidades();
    window._invCargarSistemas();
    window._invCargarFamilias();
    window._invCargarMarcasFabricante();
    // Inicializar comboboxes estáticos
    window._cbInit('inv-f-tipo',     ['','Original','Alternativo'],           'Buscar tipo…');
    window._cbInit('inv-f-sub-tipo', ['','Nuevo','Reparado'],                 'Buscar sub-tipo…');
    // Al seleccionar sistema → actualizar opciones de sub-sistema
    window._cbOnSelect('inv-f-sistema', function() { window._invFiltrarSubSistemas(); });
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
                data.map(function(u) { return { value: u.nombre, label: u.descripcion || u.nombre }; })
            );
            window._cbInit('inv-f-unidad', items, 'Buscar unidad…');
            if (prev) {
                var uObj = data.find(function(u) { return u.nombre === prev; });
                window._cbSet('inv-f-unidad', prev, uObj ? (uObj.descripcion || prev) : prev);
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

// ── Multi-select chips: Marca de Unidad ──────────────────────────
window._invRenderChips = function() {
    var cont = document.getElementById('inv-marcas-chips');
    if (!cont) return;
    cont.innerHTML = (window._invMarcasSeleccionadas || []).map(function(m, i) {
        return '<span class="badge d-inline-flex align-items-center gap-1 px-2 py-1" style="background:var(--crm-accent,#007aff);color:#fff;font-size:0.78rem;border-radius:20px;">' +
            _invEsc(m) +
            '<button type="button" onclick="window._invQuitarMarca(' + i + ')" style="background:none;border:none;color:#fff;padding:0;line-height:1;cursor:pointer;font-size:0.9rem;">&times;</button>' +
        '</span>';
    }).join('');
};

window._invAgregarMarca = function(marca) {
    var m = (marca || '').trim();
    if (!m) return;
    if ((window._invMarcasSeleccionadas || []).indexOf(m) >= 0) return; // evitar duplicados
    window._invMarcasSeleccionadas = window._invMarcasSeleccionadas || [];
    window._invMarcasSeleccionadas.push(m);
    window._invRenderChips();
    window._invActualizarPreview();
    var inp = document.getElementById('inv-marcas-input');
    if (inp) inp.value = '';
    var dd = document.getElementById('inv-marcas-dropdown');
    if (dd) dd.style.display = 'none';
};

window._invQuitarMarca = function(idx) {
    if (!window._invMarcasSeleccionadas) return;
    window._invMarcasSeleccionadas.splice(idx, 1);
    window._invRenderChips();
    window._invActualizarPreview();
};

window._invFiltrarMarcas = function() {
    var inp = document.getElementById('inv-marcas-input');
    var dd  = document.getElementById('inv-marcas-dropdown');
    if (!inp || !dd) return;
    var q = inp.value.toLowerCase().trim();
    var lista = (window._invMarcasPlacas || []).filter(function(m) {
        return (!q || m.toLowerCase().includes(q)) &&
               (window._invMarcasSeleccionadas || []).indexOf(m) < 0;
    });
    if (!lista.length || !q && !inp.value) { dd.style.display = 'none'; return; }
    dd.innerHTML = lista.slice(0, 12).map(function(m) {
        return '<button type="button" class="list-group-item list-group-item-action py-1 px-3 small" onclick="window._invAgregarMarca(\'' + _invEsc(m) + '\')">' + _invEsc(m) + '</button>';
    }).join('');
    dd.style.display = '';
};

window._invMarcasKeydown = function(event) {
    if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        var inp = document.getElementById('inv-marcas-input');
        if (inp && inp.value.trim()) window._invAgregarMarca(inp.value);
    }
    if (event.key === 'Escape') {
        var dd = document.getElementById('inv-marcas-dropdown');
        if (dd) dd.style.display = 'none';
    }
};

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
    var valorPEN = data.reduce(function(s, d) {
        var moneda = (d.moneda || 'PEN').toUpperCase();
        return moneda !== 'USD' ? s + (parseFloat(d.stock_actual || 0) * parseFloat(d.costo_referencial || 0)) : s;
    }, 0);
    var valorUSD = data.reduce(function(s, d) {
        return (d.moneda || '').toUpperCase() === 'USD' ? s + (parseFloat(d.stock_actual || 0) * parseFloat(d.costo_referencial || 0)) : s;
    }, 0);
    function fmtV(v, pre) {
        return v >= 1000000 ? pre + (v/1000000).toFixed(1) + 'M'
             : v >= 1000    ? pre + (v/1000).toFixed(1) + 'k'
             :                pre + v.toFixed(0);
    }
    var el = document.getElementById('inv-kpi-row');
    if (!el) return;
    el.innerHTML =
        '<div class="bento-kpi">' +
          '<div><div class="bento-kpi-label">Total Artículos</div><div class="bento-kpi-num">' + total.toLocaleString() + '</div></div>' +
          '<div class="bento-kpi-icon" style="background:#eff6ff;color:#2563eb"><i class="bi bi-boxes fs-4"></i></div>' +
        '</div>' +
        '<div class="bento-kpi" style="background:#fffbeb;border-color:#fde68a">' +
          '<div><div class="bento-kpi-label" style="color:#92400e">Stock Bajo</div><div class="bento-kpi-num" style="color:#d97706">' + advertencia + '</div></div>' +
          '<div class="bento-kpi-icon" style="background:#fef3c7;color:#d97706"><i class="bi bi-exclamation-triangle-fill fs-4"></i></div>' +
        '</div>' +
        '<div class="bento-kpi accent-red">' +
          '<div><div class="bento-kpi-label">Stock Crítico</div><div class="bento-kpi-num">' + criticos + '</div></div>' +
          '<div class="bento-kpi-icon"><i class="bi bi-exclamation-circle-fill fs-4"></i></div>' +
        '</div>' +
        '<div class="bento-kpi accent-dark">' +
          '<div><div class="bento-kpi-label">Valor S/ (PEN)</div><div class="bento-kpi-num" style="font-size:1.4rem">' + fmtV(valorPEN, 'S/ ') + '</div></div>' +
          '<div class="bento-kpi-icon"><i class="bi bi-coin fs-4" style="color:#fbbf24"></i></div>' +
        '</div>' +
        '<div class="bento-kpi accent-dark">' +
          '<div><div class="bento-kpi-label">Valor $ (USD)</div><div class="bento-kpi-num" style="font-size:1.4rem">' + fmtV(valorUSD, '$ ') + '</div></div>' +
          '<div class="bento-kpi-icon"><i class="bi bi-currency-dollar fs-4" style="color:#60a5fa"></i></div>' +
        '</div>';
};

// ── Filtrar ───────────────────────────────────────────────────────
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
        return matchB && matchF && matchS;
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
        btns += '<button class="btn btn-sm btn-outline-secondary" ' + (pag <= 1 ? 'disabled' : '') + ' onclick="window._invIrPag(' + (pag - 1) + ')"><i class="bi bi-chevron-left"></i></button>';
        btns += '<span class="small text-muted mx-2">Pág. ' + pag + ' / ' + totalPag + '</span>';
        btns += '<button class="btn btn-sm btn-outline-secondary" ' + (pag >= totalPag ? 'disabled' : '') + ' onclick="window._invIrPag(' + (pag + 1) + ')"><i class="bi bi-chevron-right"></i></button>';
        paginEl.innerHTML = '<div class="d-flex align-items-center gap-1">' + btns + '</div>';
    }
};

function _invRenderCard(d) {
    var id = _invEsc(d.id || '');

    // Semáforo de stock
    var stockActual = parseFloat(d.stock_actual != null ? d.stock_actual : 0);
    var stockMin    = parseFloat(d.stock_min || 0);
    var stockMax    = parseFloat(d.stock_max || 0);
    if (stockMax <= 0) stockMax = stockMin > 0 ? stockMin * 4 : Math.max(stockActual * 1.5, 1);
    var pct = Math.min(100, stockMax > 0 ? Math.round((stockActual / stockMax) * 100) : 0);
    var estado = stockActual <= stockMin ? 'critical'
               : stockMin > 0 && stockActual <= stockMin * 1.5 ? 'warning'
               : 'ok';
    var badgeTxt = estado === 'critical' ? '¡Reponer Ya!'
                 : estado === 'warning'  ? 'Stock Bajo'
                 : 'Stock OK';

    // Icono según familia
    var iconMap = {
        'LUBRICANTES':'bi-droplet-fill','Lubricantes':'bi-droplet-fill',
        'FRENOS':'bi-disc','Frenos':'bi-disc',
        'NEUMÁTICOS':'bi-circle','Neumáticos':'bi-circle',
        'FILTROS':'bi-funnel-fill','Filtros':'bi-funnel-fill',
        'ELÉCTRICO':'bi-lightning-fill','Eléctrico':'bi-lightning-fill',
        'MOTOR':'bi-gear-fill','Motor':'bi-gear-fill'
    };
    var iconClass = iconMap[d.familia] || 'bi-box-seam';

    // Checkbox modo selección
    var chkHtml = window._invModoSeleccion
        ? '<input type="checkbox" class="form-check-input position-absolute" '
          + 'style="top:10px;right:10px;width:18px;height:18px;z-index:5;cursor:pointer;" '
          + 'onchange="window._invToggleCheck(\'' + id + '\',this.checked)" onclick="event.stopPropagation()">'
        : '';

    var clickAttr = window._invModoSeleccion
        ? 'onclick="var cb=this.querySelector(\'input[type=checkbox]\');if(cb){cb.checked=!cb.checked;window._invToggleCheck(\'' + id + '\',cb.checked);}"'
        : 'onclick="window.abrirDetalleInv(\'' + id + '\')"';

    var familia = _invEsc(d.familia || '—');
    var sistema = _invEsc(d.sistema || '—');
    var desc    = _invEsc(d.descripcion || d.articulo || '');
    var unidad  = _invEsc(d.unidad || '');
    var moneda  = d.moneda === 'USD' ? '$' : 'S/.';
    var costo   = parseFloat(d.costo_referencial || 0).toFixed(2);

    return '<div class="card-bento ' + estado + '" data-id="' + id + '" ' + clickAttr + '>' +
        chkHtml +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.85rem">' +
            '<div style="width:44px;height:44px;background:#eff6ff;color:#2563eb;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:1.15rem;flex-shrink:0">' +
                '<i class="bi ' + iconClass + '"></i>' +
            '</div>' +
            '<span class="bento-badge ' + estado + '">' + badgeTxt + '</span>' +
        '</div>' +
        '<div style="font-weight:700;font-size:.9rem;line-height:1.3;margin-bottom:.2rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden" title="' + desc + '">' + desc + '</div>' +
        '<div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#94a3b8;margin-bottom:.85rem;font-style:italic">' + familia + ' / ' + sistema + '</div>' +
        '<div style="margin-top:auto">' +
            '<div style="margin-bottom:.4rem">' +
                '<div>' +
                    '<div style="font-size:.58rem;font-weight:700;text-transform:uppercase;color:#cbd5e1">Cantidad</div>' +
                    '<div style="font-size:1.75rem;font-weight:900;line-height:1;color:' + (estado === 'critical' ? '#ef4444' : 'inherit') + '">' +
                        stockActual.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}) +
                        (unidad ? ' <span style="font-size:.65rem;font-weight:700;color:#94a3b8">' + unidad + '</span>' : '') +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="stock-bar-bg"><div class="stock-bar-fill ' + estado + '" style="width:' + pct + '%"></div></div>' +
            '<div style="font-size:.58rem;color:#94a3b8;margin-top:.25rem;display:flex;justify-content:space-between">' +
                '<span>' + _invEsc(d.id) + '</span>' +
                '<span>' + pct + '% capacidad</span>' +
            '</div>' +
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
    var drawer = document.getElementById('inv-form-drawer');
    if (drawer) drawer.style.right = '-500px';
    var bd = document.getElementById('inv-drawer-backdrop');
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

    var btnReg = document.getElementById('modal-det-btn-regularizar');
    if (btnReg) {
        btnReg.onclick = function() {
            bootstrap.Modal.getInstance(el).hide();
            setTimeout(function() { window.abrirRegularizarStock(id); }, 300);
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

    // Reset chips
    window._invMarcasSeleccionadas = [];
    window._invRenderChips();

    // Resetear tab a Artículo
    var firstTab = document.querySelector('#inv-modal-tabs .nav-link');
    if (firstTab) {
        document.querySelectorAll('#inv-modal-tabs .nav-link').forEach(function(t) { t.classList.remove('active'); });
        firstTab.classList.add('active');
        document.querySelectorAll('#inv-form-drawer .tab-pane').forEach(function(p) { p.classList.remove('show', 'active'); });
        var basico = document.getElementById('inv-tab-articulo');
        if (basico) basico.classList.add('show', 'active');
    }

    // Reset preview
    window._invActualizarPreview();
    // Reset imagen UI
    _invResetImageUI(null);

    if (id) {
        var item = (window._invData || []).find(function(d) { return d.id === id; });
        if (!item) return;
        if (titulo) titulo.innerHTML = '<i class="bi bi-pencil-fill me-1"></i>Editar Artículo — ' + id;
        if (editId) editId.value = id;

        // Tab Artículo
        _invSetField('inv-f-articulo',          item.articulo);
        _invSetField('inv-f-codigo-articulo',   item.codigo_articulo);
        _invSetField('inv-f-marca',             item.marca);
        _invSetField('inv-f-familia',           item.familia);
        _invSetField('inv-f-unidad',            item.unidad);
        _invSetField('inv-f-moneda',            item.moneda || 'PEN');
        _invSetField('inv-f-costo',             item.costo_referencial);
        _invSetField('inv-f-estado-art',        item.estado_art || 'Activo');
        _invSetField('inv-f-obs',               item.observaciones);

        // Chips marca_unidad
        try {
            window._invMarcasSeleccionadas = JSON.parse(item.marca_unidad || '[]');
        } catch(e) {
            window._invMarcasSeleccionadas = item.marca_unidad ? [item.marca_unidad] : [];
        }
        window._invRenderChips();
        window._invActualizarPreview();

        // Clasificación
        _invSetField('inv-f-sistema',       item.sistema);
        window._invFiltrarSubSistemas();
        _invSetField('inv-f-sub-sistema',   item.sub_sistema);
        _invSetField('inv-f-tipo',          item.tipo);
        _invSetField('inv-f-sub-tipo',      item.sub_tipo);
        _invSetField('inv-f-almacen',       item.almacen);
        _invSetField('inv-f-ubicacion',     item.ubicacion);
        _invSetField('inv-f-anaquel',       item.anaquel);
        _invSetField('inv-f-stock-min',     item.stock_min);
        _invSetField('inv-f-stock-max',     item.stock_max);
        _invSetField('inv-f-codigo-barras', item.codigo_barras);

        // Tab Imagen + QR
        _invResetImageUI(item);
    } else {
        if (titulo) titulo.innerHTML = '<i class="bi bi-box-fill me-1"></i>Nuevo Artículo';
    }

    var modal = document.getElementById('inv-form-drawer');
    if (modal) { modal.style.right = '0'; }
    var bd = document.getElementById('inv-drawer-backdrop');
    if (bd) bd.style.display = 'block';
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
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
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
    var unidadList  = (window._invUnidadesData  || []).map(function(u) { return u.nombre; }).join(',');
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
