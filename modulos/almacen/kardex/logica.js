// ================================================================
// MÓDULO ALMACÉN / KARDEX — Lógica SPA Aislada
// ================================================================

window._kdxInvData   = window._kdxInvData   || [];
window._kdxMovData   = window._kdxMovData   || [];
window._kdxSelId     = window._kdxSelId     || null;
window._kdxStockBase = window._kdxStockBase || 0;
window._kdxFechaReg  = window._kdxFechaReg  || null;

window.init_kardex = function() {
    // Inyectar CSS Bento Grid
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
            var dl = document.getElementById('kdx-art-list');
            if (dl) {
                dl.innerHTML = data.map(function(d) {
                    return '<option value="'+_kdxEsc(d.id+' — '+d.descripcion)+'" data-id="'+_kdxEsc(d.id)+'">';
                }).join('');
            }
        })
        .catch(function() {});
};

window._kdxCargarKardex = function() {
    var input = document.getElementById('kdx-buscar-art');
    if (!input) return;
    var val = input.value.trim();
    var invId = val.split(' — ')[0].trim();
    if (!invId) { alert('Ingresa o selecciona un artículo.'); return; }

    // Verificar que el artículo existe
    var item = window._kdxInvData.find(function(d) { return d.id === invId; });
    if (!item) {
        // Intentar búsqueda parcial
        item = window._kdxInvData.find(function(d) {
            return d.descripcion.toLowerCase().includes(val.toLowerCase());
        });
    }
    if (!item) { alert('Artículo no encontrado. Intenta con el código INV-XXXX exacto.'); return; }

    window._kdxSelId = item.id;
    window._kdxStockBase = parseFloat(item.stock_regularizado || 0);

    // Mostrar info básica
    var nombre = document.getElementById('kdx-art-nombre');
    if (nombre) nombre.textContent = item.descripcion || '—';
    var codigo = document.getElementById('kdx-art-codigo');
    if (codigo) codigo.textContent = item.id + (item.familia ? ' · ' + item.familia : '') + (item.almacen ? ' · ' + item.almacen : '');
    var stockBase = document.getElementById('kdx-stock-base');
    if (stockBase) stockBase.textContent = window._kdxStockBase.toFixed(2) + ' ' + (item.unidad||'');
    var fechaReg = document.getElementById('kdx-fecha-reg');
    if (fechaReg) fechaReg.textContent = item.fecha_regularizacion ? 'Desde ' + String(item.fecha_regularizacion).split('T')[0] : 'Stock inicial';

    var infoEl = document.getElementById('kdx-info-art');
    if (infoEl) infoEl.style.display = '';

    var placeholder = document.getElementById('kdx-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    var timeline = document.getElementById('kdx-timeline');
    if (timeline) { timeline.style.display = ''; timeline.innerHTML = '<div style="text-align:center;padding:2.5rem;color:#94a3b8"><div class="spinner-border spinner-border-sm me-2"></div>Cargando movimientos...</div>'; }

    // Encabezado del artículo
    var hdr = document.getElementById('kdx-art-header');
    var hdrNombre = document.getElementById('kdx-art-header-nombre');
    var hdrInfo   = document.getElementById('kdx-art-header-info');
    if (hdr) hdr.style.display = '';
    if (hdrNombre) hdrNombre.textContent = item.descripcion || '—';
    if (hdrInfo) hdrInfo.textContent = item.id + (item.familia ? ' · ' + item.familia : '') + (item.almacen ? ' · ' + item.almacen : '');

    fetch('/api/almacen/kardex/' + encodeURIComponent(item.id))
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(res) {
            window._kdxMovData   = res.movimientos || [];
            window._kdxFechaReg  = res.fecha_regularizacion || null;
            window._kdxRenderKardex(res, item);
        })
        .catch(function(err) {
            var t = document.getElementById('tbody-kardex');
            if (t) t.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger">Error: '+err.message+'</td></tr>';
        });
};

window._kdxRenderKardex = function(res, item) {
    var movs      = res.movimientos || [];
    var stockBase = parseFloat(res.stock_base || 0);
    var fechaReg  = res.fecha_regularizacion || null;

    // Totales (solo movimientos reales, sin contar la regularización)
    var totalEntradas = 0, totalSalidas = 0;
    movs.forEach(function(m) {
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
              '<div><div class="bento-kpi-label">Stock Final</div><div class="bento-kpi-num" style="font-size:2rem;font-style:italic">' + stockActual.toFixed(2) + ' <span style="font-size:.8rem;font-weight:700;opacity:.7">' + _kdxEsc(item.unidad || '') + '</span></div></div>' +
              '<div class="bento-kpi-icon"><span style="width:8px;height:8px;background:#4ade80;border-radius:50%;display:inline-block;box-shadow:0 0 6px #4ade80"></span></div>' +
            '</div>';
    }

    var elEnt = document.getElementById('kdx-total-entradas');
    if (elEnt) elEnt.textContent = '+' + totalEntradas.toFixed(2) + ' / −' + totalSalidas.toFixed(2);
    var elAct = document.getElementById('kdx-stock-actual');
    if (elAct) elAct.textContent = stockActual.toFixed(2) + ' ' + (item.unidad || '');

    var totalMovDisplay = movs.length + (fechaReg ? 1 : 0);
    var btnExp = document.getElementById('btn-export-kardex');
    if (btnExp) btnExp.style.display = totalMovDisplay ? '' : 'none';

    var timeline = document.getElementById('kdx-timeline');
    if (!timeline) return;

    // ── Fila de regularización (saldo de apertura) ─────────────────
    var regHtml = '';
    if (fechaReg) {
        var fechaRegFmt = '';
        try { fechaRegFmt = new Date(String(fechaReg).split('T')[0] + 'T00:00').toLocaleDateString('es-PE', {day:'2-digit', month:'short', year:'numeric'}); }
        catch(e) { fechaRegFmt = String(fechaReg).split('T')[0]; }
        regHtml =
            '<div class="kdx-item" style="background:linear-gradient(90deg,rgba(99,102,241,0.07),transparent);border-left:3px solid #6366f1;">' +
                '<div class="kdx-icon" style="background:rgba(99,102,241,0.12);color:#6366f1;">' +
                    '<i class="bi bi-clipboard2-check"></i>' +
                '</div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">' +
                        '<span style="font-size:.85rem;font-weight:700;color:#6366f1">Regularización de Inventario</span>' +
                        '<span style="background:rgba(99,102,241,0.12);color:#6366f1;font-size:.62rem;font-weight:700;padding:.12rem .5rem;border-radius:6px">REG</span>' +
                    '</div>' +
                    '<div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin-top:.15rem">Saldo de apertura — stock físico verificado</div>' +
                '</div>' +
                '<div style="text-align:center;min-width:80px">' +
                    '<div style="font-size:1.2rem;font-weight:900;color:#6366f1;">⊙ ' + stockBase.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</div>' +
                    '<div style="font-size:.6rem;color:#94a3b8">' + fechaRegFmt + '</div>' +
                '</div>' +
                '<div class="kdx-saldo" style="color:#6366f1;">' + stockBase.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</div>' +
            '</div>';
    }

    if (!totalMovDisplay) {
        timeline.innerHTML = '<div style="text-align:center;padding:3rem;color:#94a3b8"><i class="bi bi-inbox fs-2 d-block mb-2"></i>Sin movimientos registrados para este artículo</div>';
        return;
    }

    var headerHtml = '<div style="padding:.75rem 1.25rem;background:#f8fafc;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#64748b">Registro Maestro de Flujos</span>' +
        '<span style="font-size:.7rem;color:#94a3b8;font-weight:600">' + totalMovDisplay + ' movimiento' + (totalMovDisplay !== 1 ? 's' : '') + '</span>' +
    '</div>';

    var saldoAcum = stockBase;
    var timelineHtml = movs.map(function(m) {
        var esEntrada = m.tipo === 'Entrada';
        var cant = parseFloat(m.cantidad || 0);
        saldoAcum += esEntrada ? cant : -cant;
        var fecha = '';
        if (m.fecha) {
            try { fecha = new Date(String(m.fecha).split('T')[0] + 'T00:00').toLocaleDateString('es-PE', {day:'2-digit', month:'short', year:'numeric'}); }
            catch(e) { fecha = String(m.fecha).split('T')[0]; }
        }
        return '<div class="kdx-item">' +
            '<div class="kdx-icon ' + (esEntrada ? 'entrada' : 'salida') + '">' +
                '<i class="bi ' + (esEntrada ? 'bi-file-arrow-down' : 'bi-wrench-adjustable') + '"></i>' +
            '</div>' +
            '<div style="flex:1;min-width:0">' +
                '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">' +
                    '<span style="font-size:.85rem;font-weight:700">' + (esEntrada ? 'Entrada por Compra' : 'Salida a Taller') + '</span>' +
                    '<span style="background:#f1f5f9;color:#64748b;font-size:.62rem;font-weight:700;padding:.12rem .5rem;border-radius:6px">' + _kdxEsc(m.doc_id || '—') + '</span>' +
                '</div>' +
                '<div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin-top:.15rem">' + _kdxEsc(m.contraparte || '—') + '</div>' +
            '</div>' +
            '<div style="text-align:center;min-width:80px">' +
                '<div style="font-size:1.2rem;font-weight:900;color:' + (esEntrada ? '#16a34a' : '#ef4444') + '">' + (esEntrada ? '+' : '−') + cant.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</div>' +
                '<div style="font-size:.6rem;color:#94a3b8">' + fecha + '</div>' +
            '</div>' +
            '<div class="kdx-saldo">' + saldoAcum.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</div>' +
        '</div>';
    }).join('');

    timeline.innerHTML = headerHtml + regHtml + timelineHtml;
};

// ── Export Excel ──────────────────────────────────────────────────
window.exportarKardexExcel = function() {
    var movs = window._kdxMovData || [];
    if (!movs.length) { alert('No hay movimientos para exportar.'); return; }
    var cab = ['Fecha','Tipo','Documento','Contraparte','Cantidad','Costo Unit.','Importe','Saldo'];
    var filas = movs.map(function(m) {
        return [m.fecha?String(m.fecha).split('T')[0]:'', m.tipo, m.doc_id||'', m.contraparte||'',
                parseFloat(m.cantidad||0), parseFloat(m.costo_unitario||0),
                parseFloat(m.importe||0), m.saldo!=null?m.saldo:''];
    });
    var ws = XLSX.utils.aoa_to_sheet([cab].concat(filas));
    var wb = XLSX.utils.book_new();
    var sheet = 'Kardex_'+(window._kdxSelId||'artículo');
    XLSX.utils.book_append_sheet(wb, ws, sheet.substring(0,31));
    XLSX.writeFile(wb, 'Kardex_'+sheet+'.xlsx');
};

function _kdxEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
