// ================================================================
// MÓDULO ALMACÉN / KARDEX — Lógica SPA Aislada
// ================================================================

window._kdxInvData      = window._kdxInvData      || [];
window._kdxMovData      = window._kdxMovData      || [];
window._kdxSelId        = window._kdxSelId        || null;
window._kdxStockBase    = window._kdxStockBase    || 0;
window._kdxFechaReg     = window._kdxFechaReg     || null;
window._kdxDropdownIdx  = window._kdxDropdownIdx  !== undefined ? window._kdxDropdownIdx : -1;

window.init_kardex = function() {
    if (!window.checkPerm('kardex', 'l')) {
        var wrap = document.getElementById('mod-kardex') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    if (!window.checkPerm('kardex', 'l')) {
        var wrap = document.getElementById('mod-kardex') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    if (!document.getElementById('almacen-bento-css')) {
        var lnk = document.createElement('link');
        lnk.id = 'almacen-bento-css';
        lnk.rel = 'stylesheet';
        lnk.href = '/modulos/almacen/almacen-bento.css';
        document.head.appendChild(lnk);
    }
    window._kdxCargarInventario();
};

window._kdxCargarInventario = function() {
    fetch('/api/almacen/inventario')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._kdxInvData = data || [];
        })
        .catch(function() {});
};

// ── Dropdown autocomplete moderno ────────────────────────────────
window._kdxFiltrarDropdown = function() {
    var input = document.getElementById('kdx-buscar-art');
    var dd    = document.getElementById('kdx-art-dropdown');
    var clr   = document.getElementById('kdx-buscar-clear');
    if (!input || !dd) return;
    var q = input.value.trim().toLowerCase();
    if (clr) clr.style.display = q ? '' : 'none';
    if (!q) { dd.style.display = 'none'; return; }
    var matches = window._kdxInvData.filter(function(d) {
        return (d.id || '').toLowerCase().includes(q) ||
               (d.descripcion || '').toLowerCase().includes(q) ||
               (d.familia || '').toLowerCase().includes(q);
    }).slice(0, 30);
    if (!matches.length) {
        dd.innerHTML = '<div style="padding:.75rem 1rem;color:#94a3b8;font-size:.8rem;">Sin resultados</div>';
        dd.style.display = '';
        return;
    }
    dd.innerHTML = matches.map(function(d, i) {
        return '<div class="kdx-dd-item" data-idx="' + i + '" data-id="' + _kdxEsc(d.id) + '" ' +
               'onclick="window._kdxSeleccionar(\'' + _kdxEsc(d.id) + '\')" ' +
               'onmouseenter="window._kdxDropdownIdx=' + i + ';window._kdxHighlight()" ' +
               'style="padding:.6rem 1rem;cursor:pointer;display:flex;align-items:center;gap:.6rem;border-bottom:1px solid #f1f5f9;">' +
                 '<span style="font-size:.7rem;font-weight:800;background:#eff6ff;color:#2563eb;padding:.15rem .45rem;border-radius:6px;white-space:nowrap;flex-shrink:0;">' + _kdxEsc(d.id) + '</span>' +
                 '<span style="font-size:.82rem;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _kdxEsc(d.descripcion || '—') + '</span>' +
                 (d.familia ? '<span style="font-size:.65rem;color:#94a3b8;flex-shrink:0;margin-left:auto;">' + _kdxEsc(d.familia) + '</span>' : '') +
               '</div>';
    }).join('');
    window._kdxDropdownIdx = -1;
    dd.style.display = '';
};

window._kdxNavDropdown = function(e) {
    var dd = document.getElementById('kdx-art-dropdown');
    if (!dd || dd.style.display === 'none') return;
    var items = dd.querySelectorAll('.kdx-dd-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        window._kdxDropdownIdx = Math.min(window._kdxDropdownIdx + 1, items.length - 1);
        window._kdxHighlight();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        window._kdxDropdownIdx = Math.max(window._kdxDropdownIdx - 1, 0);
        window._kdxHighlight();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (window._kdxDropdownIdx >= 0 && items[window._kdxDropdownIdx]) {
            items[window._kdxDropdownIdx].click();
        } else {
            window._kdxCargarKardex();
        }
    } else if (e.key === 'Escape') {
        dd.style.display = 'none';
    }
};

window._kdxHighlight = function() {
    var dd = document.getElementById('kdx-art-dropdown');
    if (!dd) return;
    var items = dd.querySelectorAll('.kdx-dd-item');
    items.forEach(function(el, i) {
        el.style.background = (i === window._kdxDropdownIdx) ? '#eff6ff' : '';
    });
    if (window._kdxDropdownIdx >= 0 && items[window._kdxDropdownIdx]) {
        items[window._kdxDropdownIdx].scrollIntoView({ block: 'nearest' });
    }
};

window._kdxSeleccionar = function(id) {
    var item = window._kdxInvData.find(function(d) { return d.id === id; });
    if (!item) return;
    var input = document.getElementById('kdx-buscar-art');
    if (input) input.value = item.id + ' — ' + item.descripcion;
    var clr = document.getElementById('kdx-buscar-clear');
    if (clr) clr.style.display = '';
    var dd = document.getElementById('kdx-art-dropdown');
    if (dd) dd.style.display = 'none';
    window._kdxCargarKardex();
};

window._kdxLimpiarBuscar = function() {
    var input = document.getElementById('kdx-buscar-art');
    if (input) { input.value = ''; input.focus(); }
    var clr = document.getElementById('kdx-buscar-clear');
    if (clr) clr.style.display = 'none';
    var dd = document.getElementById('kdx-art-dropdown');
    if (dd) dd.style.display = 'none';
};

// ── Cargar kardex de artículo ─────────────────────────────────────
window._kdxCargarKardex = function() {
    var input = document.getElementById('kdx-buscar-art');
    if (!input) return;
    var val = input.value.trim();
    var invId = val.split(' — ')[0].trim();
    if (!invId) { alert('Ingresa o selecciona un artículo.'); return; }

    var item = window._kdxInvData.find(function(d) { return d.id === invId; });
    if (!item) {
        item = window._kdxInvData.find(function(d) {
            return (d.descripcion || '').toLowerCase().includes(val.toLowerCase());
        });
    }
    if (!item) { alert('Artículo no encontrado.'); return; }

    window._kdxSelId     = item.id;
    window._kdxStockBase = parseFloat(item.stock_regularizado || 0);

    var placeholder = document.getElementById('kdx-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    var timeline = document.getElementById('kdx-timeline');
    if (timeline) { timeline.style.display = ''; timeline.innerHTML = '<div style="text-align:center;padding:2.5rem;color:#94a3b8"><div class="spinner-border spinner-border-sm me-2"></div>Cargando movimientos...</div>'; }

    var hdr       = document.getElementById('kdx-art-header');
    var hdrNombre = document.getElementById('kdx-art-header-nombre');
    var hdrInfo   = document.getElementById('kdx-art-header-info');
    if (hdr) hdr.style.display = '';
    if (hdrNombre) hdrNombre.textContent = item.descripcion || '—';
    if (hdrInfo) hdrInfo.textContent = item.id + (item.familia ? ' · ' + item.familia : '') + (item.almacen ? ' · ' + item.almacen : '');

    var kpiEl = document.getElementById('kdx-kpi-row');
    if (kpiEl) kpiEl.style.display = 'none';
    var btnExp = document.getElementById('btn-export-kardex');
    if (btnExp) btnExp.style.display = 'none';

    fetch('/api/almacen/kardex/' + encodeURIComponent(item.id))
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(res) {
            window._kdxMovData  = res.movimientos || [];
            window._kdxFechaReg = res.fecha_regularizacion || null;
            window._kdxRenderKardex(res, item);
        })
        .catch(function(err) {
            var t = document.getElementById('kdx-timeline');
            if (t) t.innerHTML = '<div style="padding:2rem;text-align:center;color:#ef4444;">Error: ' + _kdxEsc(err.message) + '</div>';
        });
};

// ── Render kardex con soporte pre-regularización ─────────────────
window._kdxRenderKardex = function(res, item) {
    var movs      = res.movimientos || [];
    var stockBase = parseFloat(res.stock_base || 0);
    var fechaReg  = res.fecha_regularizacion || null;
    var fechaRegStr = fechaReg ? _kdxFmtISO(fechaReg) : null;

    // Separar pre y post regularización usando la fecha del movimiento
    var movsPreReg  = fechaRegStr ? movs.filter(function(m) {
        var mFecha = _kdxFmtISO(m.fecha);
        return mFecha < fechaRegStr;
    }) : [];
    var movsPostReg = fechaRegStr ? movs.filter(function(m) {
        var mFecha = _kdxFmtISO(m.fecha);
        return mFecha >= fechaRegStr;
    }) : movs;

    // KPIs: solo movimientos post-regularización (o todos si no hay reg)
    var totalEntradas = 0, totalSalidas = 0;
    movsPostReg.forEach(function(m) {
        if (m.tipo === 'Entrada') totalEntradas += parseFloat(m.cantidad) || 0;
        else totalSalidas += parseFloat(m.cantidad) || 0;
    });
    var stockActual = stockBase + totalEntradas - totalSalidas;

    // KPI row
    var kpiEl = document.getElementById('kdx-kpi-row');
    if (kpiEl) {
        kpiEl.style.display = '';
        kpiEl.innerHTML =
            '<div class="bento-kpi">' +
              '<div><div class="bento-kpi-label">Entradas Totales</div><div class="bento-kpi-num" style="color:#16a34a">+' + totalEntradas.toFixed(2) + '</div></div>' +
              '<div class="bento-kpi-icon" style="background:#dcfce7;color:#16a34a"><i class="bi bi-box-arrow-in-down fs-4"></i></div>' +
            '</div>' +
            '<div class="bento-kpi">' +
              '<div><div class="bento-kpi-label">Salidas Totales</div><div class="bento-kpi-num" style="color:#ef4444">−' + totalSalidas.toFixed(2) + '</div></div>' +
              '<div class="bento-kpi-icon" style="background:#fee2e2;color:#ef4444"><i class="bi bi-wrench-adjustable fs-4"></i></div>' +
            '</div>' +
            '<div class="bento-kpi accent-dark" style="background:linear-gradient(135deg,#1e40af,#3730a3)">' +
              '<div><div class="bento-kpi-label">Stock Actual</div><div class="bento-kpi-num" style="font-size:2rem;font-style:italic">' + stockActual.toFixed(2) + ' <span style="font-size:.8rem;font-weight:700;opacity:.7">' + _kdxEsc(item.unidad || '') + '</span></div></div>' +
              '<div class="bento-kpi-icon"><span style="width:8px;height:8px;background:#4ade80;border-radius:50%;display:inline-block;box-shadow:0 0 6px #4ade80"></span></div>' +
            '</div>';
    }

    var totalMovDisplay = movs.length + (fechaReg ? 1 : 0);
    var btnExp = document.getElementById('btn-export-kardex');
    if (btnExp) btnExp.style.display = totalMovDisplay ? '' : 'none';

    var timeline = document.getElementById('kdx-timeline');
    if (!timeline) return;

    if (!movs.length && !fechaReg) {
        timeline.innerHTML = '<div style="text-align:center;padding:3rem;color:#94a3b8"><i class="bi bi-inbox fs-2 d-block mb-2"></i>Sin movimientos registrados para este artículo</div>';
        return;
    }

    var headerHtml = '<div style="padding:.75rem 1.25rem;background:#f8fafc;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#64748b">Registro Maestro de Flujos</span>' +
        '<span style="font-size:.7rem;color:#94a3b8;font-weight:600">' + totalMovDisplay + ' movimiento' + (totalMovDisplay !== 1 ? 's' : '') + '</span>' +
    '</div>';

    // ── Movimientos PRE-regularización (alta legibilidad) ────────
    var preRegHtml = '';
    if (movsPreReg.length) {
        var saldoPre = 0;
        preRegHtml = '<div style="padding:.6rem 1.25rem;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:.5rem;">' +
            '<i class="bi bi-clock-history" style="font-size:.85rem;color:#0f172a;font-weight:800;"></i>' +
            '<span style="font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#0f172a;">Histórico pre-regularización</span>' +
        '</div>';
        preRegHtml += movsPreReg.map(function(m) {
            var esEntrada = m.tipo === 'Entrada';
            var cant = parseFloat(m.cantidad || 0);
            saldoPre += esEntrada ? cant : -cant;
            var fecha = _kdxFmtFecha(m.fecha || m.created_at);
            var titulo = esEntrada ? 'Entrada por Compra' : (m.contraparte && m.contraparte.includes('Ajuste') ? 'Ajuste de Inventario (Resta)' : 'Salida a Taller');
            return '<div class="kdx-item" style="border-bottom:1px solid #e2e8f0;background:#ffffff;">' +
                '<div class="kdx-icon ' + (esEntrada ? 'entrada' : 'salida') + '">' +
                    '<i class="bi ' + (esEntrada ? 'bi-file-arrow-down' : 'bi-wrench-adjustable') + '"></i>' +
                '</div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">' +
                        '<span style="font-size:.88rem;font-weight:800;color:#0f172a;">' + _kdxEsc(titulo) + '</span>' +
                        '<span style="background:#e2e8f0;color:#0f172a;font-size:.68rem;font-weight:800;padding:.15rem .55rem;border-radius:6px">' + _kdxEsc(m.doc_id || '—') + '</span>' +
                    '</div>' +
                    '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#1e293b;margin-top:.2rem">' + _kdxEsc(m.contraparte || '—') + '</div>' +
                '</div>' +
                '<div style="text-align:center;min-width:120px">' +
                    '<div style="font-size:1.2rem;font-weight:900;color:' + (esEntrada ? '#15803d' : '#dc2626') + '">' + (esEntrada ? '+' : '−') + cant.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</div>' +
                    '<div style="font-size:.68rem;font-weight:700;color:#0f172a;">' + fecha + '</div>' +
                '</div>' +
                '<div class="kdx-saldo" style="color:#0f172a;font-weight:900;">' + saldoPre.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</div>' +
            '</div>';
        }).join('');
    }

    // ── Fila de regularización ────────────────────────────────────
    var regHtml = '';
    if (fechaReg) {
        var fechaRegFmt = _kdxFmtFecha(fechaReg);
        regHtml =
            '<div class="kdx-item" style="background:#f0fdf4;border-left:5px solid #16a34a;border-bottom:1px solid #bbf7d0;">' +
                '<div class="kdx-icon" style="background:#dcfce7;color:#15803d;">' +
                    '<i class="bi bi-clipboard2-check-fill" style="font-size:1.2rem;"></i>' +
                '</div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">' +
                        '<span style="font-size:.9rem;font-weight:800;color:#14532d">Regularización de Inventario</span>' +
                        '<span style="background:#bbf7d0;color:#14532d;font-size:.68rem;font-weight:800;padding:.15rem .55rem;border-radius:6px">REG</span>' +
                    '</div>' +
                    '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#166534;margin-top:.2rem">Saldo de apertura — stock físico verificado</div>' +
                '</div>' +
                '<div style="text-align:center;min-width:120px">' +
                    '<div style="font-size:1.2rem;font-weight:900;color:#15803d;">⊙ ' + stockBase.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</div>' +
                    '<div style="font-size:.68rem;font-weight:700;color:#0f172a;">' + fechaRegFmt + '</div>' +
                '</div>' +
                '<div class="kdx-saldo" style="color:#14532d;font-weight:900;">' + stockBase.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</div>' +
            '</div>';
    }

    // ── Movimientos POST-regularización (o todos si no hay reg) ───
    var saldoAcum = stockBase;
    var postRegHtml = movsPostReg.map(function(m) {
        var esEntrada = m.tipo === 'Entrada' || m.tipo === 'Carga Inicial';
        var cant = parseFloat(m.cantidad || 0);
        var fecha = _kdxFmtFecha(m.fecha || m.created_at);

        if (m.tipo === 'Carga Inicial') {
            return '<div class="kdx-item" style="background:#eff6ff;border-left:5px solid #2563eb;border-bottom:1px solid #bfdbfe;">' +
                '<div class="kdx-icon" style="background:#dbeafe;color:#1d4ed8;">' +
                    '<i class="bi bi-box-seam-fill" style="font-size:1.2rem;"></i>' +
                '</div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">' +
                        '<span style="font-size:.9rem;font-weight:800;color:#1e3a8a">Carga Masiva de Inventario</span>' +
                        '<span style="background:#bfdbfe;color:#1e3a8a;font-size:.68rem;font-weight:800;padding:.15rem .55rem;border-radius:6px">APERTURA / EXCEL</span>' +
                    '</div>' +
                    '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#1d4ed8;margin-top:.2rem">Stock Inicial de Importación — Registro Maestro</div>' +
                '</div>' +
                '<div style="text-align:center;min-width:120px">' +
                    '<div style="font-size:1.2rem;font-weight:900;color:#1d4ed8;">+ ' + cant.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</div>' +
                    '<div style="font-size:.68rem;font-weight:700;color:#0f172a;">' + fecha + '</div>' +
                '</div>' +
                '<div class="kdx-saldo" style="color:#1e3a8a;font-weight:900;">' + (m.saldo !== undefined ? m.saldo : cant).toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</div>' +
            '</div>';
        }

        saldoAcum += m.tipo === 'Entrada' ? cant : -cant;
        var titulo = esEntrada ? 'Entrada por Compra' : (m.contraparte && m.contraparte.includes('Ajuste') ? 'Ajuste de Inventario (Resta)' : 'Salida a Taller');
        return '<div class="kdx-item" style="border-bottom:1px solid #f1f5f9;">' +
            '<div class="kdx-icon ' + (esEntrada ? 'entrada' : 'salida') + '">' +
                '<i class="bi ' + (esEntrada ? 'bi-file-arrow-down' : 'bi-wrench-adjustable') + '"></i>' +
            '</div>' +
            '<div style="flex:1;min-width:0">' +
                '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">' +
                    '<span style="font-size:.88rem;font-weight:800;color:#0f172a;">' + _kdxEsc(titulo) + '</span>' +
                    '<span style="background:#f1f5f9;color:#0f172a;font-size:.68rem;font-weight:800;padding:.15rem .55rem;border-radius:6px">' + _kdxEsc(m.doc_id || '—') + '</span>' +
                '</div>' +
                '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#1e293b;margin-top:.2rem">' + _kdxEsc(m.contraparte || '—') + '</div>' +
            '</div>' +
            '<div style="text-align:center;min-width:120px">' +
                '<div style="font-size:1.2rem;font-weight:900;color:' + (esEntrada ? '#15803d' : '#dc2626') + '">' + (esEntrada ? '+' : '−') + cant.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</div>' +
                '<div style="font-size:.68rem;font-weight:700;color:#0f172a;">' + fecha + '</div>' +
            '</div>' +
            '<div class="kdx-saldo" style="color:#0f172a;font-weight:900;">' + (m.saldo !== undefined ? m.saldo : saldoAcum).toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</div>' +
        '</div>';
    }).join('');

    timeline.innerHTML = headerHtml + preRegHtml + regHtml + postRegHtml;
};

// ── Export Excel ──────────────────────────────────────────────────
window.exportarKardexExcel = function() {
    var movs    = window._kdxMovData  || [];
    var fechaReg = window._kdxFechaReg || null;
    var stockBase = window._kdxStockBase || 0;

    if (!movs.length && !fechaReg) { alert('No hay movimientos para exportar.'); return; }

    var fechaRegStr = fechaReg ? _kdxFmtISO(fechaReg) : null;
    var cab = ['Fecha','Tipo','Documento','Contraparte','Cantidad','Costo Unit.','Importe','Saldo','Nota'];

    var filas = [];

    // Movimientos pre-regularización
    var saldoPre = 0;
    var movsPreReg = fechaRegStr ? movs.filter(function(m){
        var mFecha = _kdxFmtISO(m.fecha);
        return mFecha < fechaRegStr;
    }) : [];
    movsPreReg.forEach(function(m) {
        var cant = parseFloat(m.cantidad || 0);
        saldoPre += m.tipo === 'Entrada' ? cant : -cant;
        filas.push([_kdxFmtISO(m.fecha), m.tipo, m.doc_id || '', m.contraparte || '',
                    cant, parseFloat(m.costo_unitario || 0), parseFloat(m.importe || 0),
                    parseFloat(saldoPre.toFixed(4)), 'Pre-regularización']);
    });

    // Fila de regularización
    if (fechaReg) {
        filas.push([fechaRegStr, 'Regularización', '', 'Stock físico verificado',
                    stockBase, '', '', stockBase, 'Saldo de apertura']);
    }

    // Movimientos post-regularización
    var saldoPost = stockBase;
    var movsPostReg = fechaRegStr ? movs.filter(function(m){
        var mFecha = _kdxFmtISO(m.fecha);
        return mFecha >= fechaRegStr;
    }) : movs;
    movsPostReg.forEach(function(m) {
        var cant = parseFloat(m.cantidad || 0);
        saldoPost += m.tipo === 'Entrada' ? cant : -cant;
        filas.push([_kdxFmtISO(m.fecha), m.tipo, m.doc_id || '', m.contraparte || '',
                    cant, parseFloat(m.costo_unitario || 0), parseFloat(m.importe || 0),
                    parseFloat(saldoPost.toFixed(4)), '']);
    });

    var ws = XLSX.utils.aoa_to_sheet([cab].concat(filas));
    var wb = XLSX.utils.book_new();
    var sheet = 'Kardex_' + (window._kdxSelId || 'articulo');
    XLSX.utils.book_append_sheet(wb, ws, sheet.substring(0, 31));
    XLSX.writeFile(wb, 'Kardex_' + sheet + '.xlsx');
};

// ── Helpers ───────────────────────────────────────────────────────
function _kdxFmtISO(f) {
    if (!f) return '';
    if (f instanceof Date) return f.toISOString().split('T')[0];
    var s = String(f);
    if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    return s.split('T')[0] || s;
}

function _kdxFmtFecha(f) {
    if (!f) return '';
    try {
        var s = String(f);
        var d;
        if (s.includes('T') || s.includes(' ')) {
            d = new Date(s.replace(' ', 'T'));
        } else {
            d = new Date(s + 'T00:00:00');
        }
        if (isNaN(d.getTime())) return String(f);
        var dateStr = d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
        var timeStr = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
            return dateStr;
        }
        return dateStr + ' • ' + timeStr;
    } catch(e) { return String(f); }
}

function _kdxEsc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
