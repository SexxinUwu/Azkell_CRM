// ================================================================
// MÓDULO ALMACÉN / ENTRADAS — Lógica SPA Aislada
// ================================================================

// ── _entCbFiltrar: wrapper con position:fixed corregido para modal con transform
window._entCbFiltrar = function(id) {
    window._cbFiltrar(id);
    var dd  = document.getElementById(id + '-dd');
    var txt = document.getElementById(id + '-txt');
    if (!dd || !txt || dd.style.display === 'none') return;
    var r  = txt.getBoundingClientRect();
    // El modal tiene transform, por lo que position:fixed es relativo al modal.
    // Restamos la posición del modal para obtener coordenadas correctas.
    var modal = document.getElementById('modal-entrada');
    var mr = modal ? modal.getBoundingClientRect() : { left: 0, top: 0 };
    dd.style.position = 'fixed';
    dd.style.top      = (r.bottom - mr.top + 2) + 'px';
    dd.style.left     = (r.left - mr.left) + 'px';
    dd.style.width    = r.width + 'px';
    dd.style.maxWidth = r.width + 'px';
    dd.style.zIndex   = '99999';
};

window._entData      = window._entData      || [];
window._entFiltrados = window._entFiltrados || [];
window._entPagActual = window._entPagActual || 1;
window._entTC        = window._entTC        || 3.70;
window._entItemIdx   = window._entItemIdx   || 0;
window._entInvData   = window._entInvData   || [];
window._entProvItems = window._entProvItems || [];
window._entDetalleId = window._entDetalleId || null;
window._entIgvMode   = window._entIgvMode   || 'sin_igv';
var _ENT_POR_PAG = 20;

window.init_entradas = function() {
    window._entDetalleId = null;
    window._entPagActual = 1;
    window.cargarEntradas();
    window._entCargarProveedores();
    window._entCargarPlacas();
    window._entCargarConfig();
    window._entMobileInit();
    if (!window._entInvData.length) window._entCargarInv();
    if (typeof window.initColPicker === 'function') {
        window.initColPicker('col-picker-ent', 'tabla-entradas', [
            {label: 'Fecha',       idx: 1, visible: true},
            {label: 'Proveedor',   idx: 2, visible: true},
            {label: 'Cód. Art.',   idx: 3, visible: true},
            {label: 'Artículo',    idx: 4, visible: true},
            {label: 'Cantidad',    idx: 5, visible: true},
            {label: 'Costo Unit.', idx: 6, visible: true},
            {label: 'Total',       idx: 7, visible: true}
        ], 'fleet_cols_entradas');
    }
};

// ── Mobile Init ───────────────────────────────────────────────────
window._entMobileInit = function() {
    var isMob = window.innerWidth < 768;
    var mHeader = document.getElementById('ent-m-header');
    var fabWrap = document.getElementById('ent-fab-wrap');
    if (mHeader) mHeader.style.display = isMob ? 'flex' : 'none';
    if (fabWrap) fabWrap.style.display = isMob ? 'flex' : 'none';
    // Iniciales del avatar
    var av = document.getElementById('ent-m-avatar');
    if (av) {
        var email = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
        var partes = email.split('@')[0].split(/[._-]/);
        var inits = partes.length >= 2 ? (partes[0][0]+partes[1][0]).toUpperCase() : email.substr(0,2).toUpperCase();
        av.textContent = inits || 'SA';
    }
};

window._entToggleFiltrosMobile = function() {
    var el = document.getElementById('ent-filtros-mobile');
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'flex' : 'none';
};

window.cargarEntradas = function() {
    var tbody = document.getElementById('tbody-entradas');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center py-5"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';
    fetch('/api/almacen/entradas')
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(data) {
            window._entData = data;
            window._entFiltrados = data;
            window._entRenderKPIs(data);
            window.filtrarEntradas();
        })
        .catch(function(err) {
            var t = document.getElementById('tbody-entradas');
            if (t) t.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-danger">Error: '+err.message+'</td></tr>';
        });
};

window._entOnMonedaChange = function() {
    var moneda = (document.getElementById('ent-f-moneda') || {}).value;
    var tcRow = document.getElementById('ent-f-tc-box');
    if (tcRow) tcRow.style.display = moneda === 'USD' ? 'block' : 'none';
    window._entActualizarTotal();
};

window._entCargarConfig = function() {
    fetch('/api/almacen/configuracion')
        .then(function(r) { return r.json(); })
        .then(function(cfg) {
            window._entTC = parseFloat(cfg.tipo_cambio) || 3.4;
            if (window._entTC === 3.7) window._entTC = 3.4;
            var tcEl = document.getElementById('ent-f-tc');
            if (tcEl) tcEl.value = window._entTC;
        }).catch(function() {});
};

window._entCargarPlacas = function() {
    fetch('/api/placas-lista')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var items = data.map(function(v) { return { value: v.placa, label: v.placa }; })
                .filter(function(x) { return x.value; })
                .sort(function(a,b){ return a.label.localeCompare(b.label); });
            window._cbInit('ent-f-placa', items, 'Buscar placa...');
        }).catch(function() {});
};

window._entCargarProveedores = function() {
    var fechaEl = document.getElementById('ent-f-fecha');
    if (fechaEl && !fechaEl.value) fechaEl.value = new Date().toISOString().split('T')[0];
    if (window._entProvItems && window._entProvItems.length) {
        window._cbInit('ent-f-proveedor', window._entProvItems, 'Buscar proveedor…');
    }
    fetch('/api/almacen/proveedores')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._entProvItems = data.map(function(p) {
                var displayName = p.razon_social ? p.razon_social : p.nombre;
                return { value: p.id, label: displayName + (p.numero_documento ? ' (' + p.numero_documento + ')' : '') };
            });
            window._cbInit('ent-f-proveedor', window._entProvItems, 'Buscar proveedor…');
        }).catch(function() {});
};

// ── Grid items (card-based) ───────────────────────────────────────
window._entAgregarItem = function() {
    var container = document.getElementById('ent-items-cards');
    if (!container) return;
    var idx  = window._entItemIdx++;
    var cbId = 'ent-art-' + idx;
    var card = document.createElement('div');
    card.id        = 'ent-item-' + idx;
    card.className = 'ent-item-card';
    var mode = window._entIgvMode || 'incluido';
    var vuRo = (mode === 'incluido' || mode === 'sin_igv') ? 'background:#f8fafc;color:#64748b;' : '';
    var puRo = (mode === 'mas_igv' || mode === 'sin_igv') ? 'background:#f8fafc;color:#64748b;' : '';
    
      var tipoOrden = ((document.getElementById('ent-f-tipo-orden') || {}).value || '').toLowerCase();
      var isServicio = tipoOrden === 'orden de servicio';

      if (isServicio) {
          card.innerHTML =
              '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
                  '<div style="flex:1;position:relative;">' +
                      '<input type="text" id="' + cbId + '-txt" class="ent-input-sm ent-item-desc" data-idx="' + idx + '"' +
                          ' placeholder="Buscar servicio…" autocomplete="off"' +
                          ' oninput="window._entCbFiltrar(\'' + cbId + '\')"' +
                          ' onfocus="window._entCbFiltrar(\'' + cbId + '\')"' +
                          ' onblur="window._cbHide(\'' + cbId + '\')">' +
                      '<input type="hidden" id="' + cbId + '" class="ent-item-inv-id" data-idx="' + idx + '">' +
                      '<div id="' + cbId + '-dd" class="cb-dropdown"></div>' +
                  '</div>' +
                  '<button type="button" onclick="window._entQuitarItem(' + idx + ')"' +
                      ' style="width:32px;height:32px;border-radius:10px;border:none;background:#fee2e2;' +
                      'color:#ef4444;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.8rem;">' +
                      '<i class="bi bi-x-lg"></i>' +
                  '</button>' +
              '</div>' +
              '<div style="display:flex; gap:10px; align-items:center; background:#f8fafc; padding:10px; border-radius:8px;">' +
                  '<div style="flex:1"><div class="ent-field-label">Costo Total (S/)</div>' +
                      '<input type="number" class="ent-input-sm ent-item-imp" data-idx="' + idx + '"' +
                          ' value="0" step="0.01" oninput="window._entSyncServiceCost(' + idx + ', this.value)">' +
                  '</div>' +
              '</div>' +
              // Hidden fields to satisfy the backend
              '<input type="hidden" class="ent-item-cant" data-idx="' + idx + '" value="1">' +
              '<input type="hidden" class="ent-item-vu" data-idx="' + idx + '" value="0">' +
              '<input type="hidden" class="ent-item-pu" data-idx="' + idx + '" value="0">' +
              '<input type="hidden" class="ent-item-igv" data-idx="' + idx + '" value="0">' +
              '<div id="ent-price-alert-' + idx + '" style="display:none;"></div>';
      } else {
          card.innerHTML =
              '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
                  '<div style="flex:1;position:relative;">' +
                      '<input type="text" id="' + cbId + '-txt" class="ent-input-sm ent-item-desc" data-idx="' + idx + '"' +
                          ' placeholder="Buscar artículo…" autocomplete="off"' +
                          ' oninput="window._entCbFiltrar(\'' + cbId + '\')"' +
                          ' onfocus="window._entCbFiltrar(\'' + cbId + '\')"' +
                          ' onblur="window._cbHide(\'' + cbId + '\')">' +
                      '<input type="hidden" id="' + cbId + '" class="ent-item-inv-id" data-idx="' + idx + '">' +
                      '<div id="' + cbId + '-dd" class="cb-dropdown"></div>' +
                  '</div>' +
                  '<button type="button" onclick="window._entAbrirQR(' + idx + ')" title="Escanear QR"' +
                      ' style="width:32px;height:32px;border-radius:10px;border:1.5px solid #2563eb;background:#eff6ff;' +
                      'color:#2563eb;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.82rem;">' +
                      '<i class="bi bi-qr-code-scan"></i>' +
                  '</button>' +
                  '<button type="button" onclick="window._entQuitarItem(' + idx + ')"' +
                      ' style="width:32px;height:32px;border-radius:10px;border:none;background:#fee2e2;' +
                      'color:#ef4444;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.8rem;">' +
                      '<i class="bi bi-x-lg"></i>' +
                  '</button>' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:72px 1fr 1fr 80px 1fr;gap:5px;">' +
                  '<div><div class="ent-field-label">Cant.</div>' +
                      '<input type="number" class="ent-input-sm ent-item-cant" data-idx="' + idx + '"' +
                          ' value="1" min="0.001" step="0.001" oninput="window._entCalcImporte(' + idx + ',\'cant\')">' +
                  '</div>' +
                  '<div><div class="ent-field-label ent-lbl-vu" data-idx="' + idx + '">Valor Unit.</div>' +
                      '<input type="number" class="ent-input-sm ent-item-vu" data-idx="' + idx + '"' +
                          ' value="0" min="0" step="0.0001" oninput="window._entCalcImporte(' + idx + ',\'vu\')"' +
                          ' style="' + vuRo + '">' +
                  '</div>' +
                  '<div><div class="ent-field-label ent-lbl-pu" data-idx="' + idx + '">Precio Unit.</div>' +
                      '<input type="number" class="ent-input-sm ent-item-pu" data-idx="' + idx + '"' +
                          ' value="0" min="0" step="0.0001" oninput="window._entCalcImporte(' + idx + ',\'pu\')"' +
                          ' style="' + puRo + '">' +
                  '</div>' +
                  '<div><div class="ent-field-label">IGV</div>' +
                      '<input type="number" class="ent-input-sm ent-item-igv" data-idx="' + idx + '"' +
                          ' value="0" readonly style="background:#f1f5f9;color:#94a3b8;">' +
                  '</div>' +
                  '<div><div class="ent-field-label">Importe</div>' +
                      '<input type="number" class="ent-input-sm ent-item-imp" data-idx="' + idx + '"' +
                          ' value="0" step="0.01" oninput="window._entCalcImporte(' + idx + ',\'imp\')">' +
                  '</div>' +
              '</div>' +
              '<div id="ent-price-alert-' + idx + '" style="display:none;margin-top:6px;align-items:center;gap:.4rem;"></div>';
      }

    container.appendChild(card);

    if (!window._entInvData.length) {
        window._entCargarInv(function() { window._entInitCbItem(idx, cbId); });
    } else {
        window._entInitCbItem(idx, cbId);
    }
};

window._entInitCbItem = function(idx, cbId) {
    var isServicio = ((document.getElementById('ent-f-tipo-orden') || {}).value || '').toLowerCase() === 'orden de servicio';
    var dataFiltered = (window._entInvData || []).filter(function(d) {
        return isServicio ? (d.tipo === 'Servicio') : (d.tipo !== 'Servicio');
    });
    var items = dataFiltered.map(function(d) {
        return { value: d.id, label: d.id + ' — ' + (d.descripcion || '') };
    });
    window._cbInit(cbId, items, 'Buscar artículo…');
    window._cbOnSelect(cbId, function(val) {
        var item = (window._entInvData || []).find(function(d) { return d.id === val; });
        if (item) {
            var ref = parseFloat(item.costo_referencial || 0);
            var puEl = document.querySelector('.ent-item-pu[data-idx="' + idx + '"]');
            var vuEl = document.querySelector('.ent-item-vu[data-idx="' + idx + '"]');
            var mode = window._entIgvMode || 'incluido';
            if (mode === 'mas_igv') {
                if (vuEl) { vuEl.value = (ref / 1.18).toFixed(4); vuEl.dataset.oldCost = ref; }
                window._entCalcImporte(idx, 'vu');
            } else {
                if (puEl) { puEl.value = ref.toFixed(2); puEl.dataset.oldCost = ref; }
                window._entCalcImporte(idx, 'pu');
            }
        }
    });
};

window._entCargarInv = function(cb) {
    if (window._entInvData.length) { if (cb) cb(); return; }
    fetch('/api/almacen/inventario')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._entInvData = data || [];
            if (cb) cb();
        }).catch(function() { if (cb) cb(); });
};

window._entCalcImporte = function(idx, source) {
    var r2 = function(v) { return Math.round(v * 100) / 100; };
    var r4 = function(v) { return Math.round(v * 10000) / 10000; };
    var mode = window._entIgvMode || 'incluido';
    var cantEl = document.querySelector('.ent-item-cant[data-idx="'+idx+'"]');
    var vuEl   = document.querySelector('.ent-item-vu[data-idx="'+idx+'"]');
    var puEl   = document.querySelector('.ent-item-pu[data-idx="'+idx+'"]');
    var igvEl  = document.querySelector('.ent-item-igv[data-idx="'+idx+'"]');
    var impEl  = document.querySelector('.ent-item-imp[data-idx="'+idx+'"]');
    if (!cantEl || !vuEl || !puEl || !igvEl || !impEl) return;

    var cant = parseFloat(cantEl.value) || 0;
    var vu   = parseFloat(vuEl.value)   || 0;
    var pu   = parseFloat(puEl.value)   || 0;
    var imp  = parseFloat(impEl.value)  || 0;

    if (mode === 'sin_igv') {
        if (source === 'imp')       { pu = r4(cant > 0 ? imp / cant : 0); vu = pu; }
        else if (source === 'pu')   { vu = pu; }
        else if (source === 'vu')   { pu = vu; }
        vuEl.value  = vu.toFixed(4); puEl.value  = pu.toFixed(2);
        igvEl.value = (0).toFixed(2);
        if (source !== 'imp') impEl.value = r2(cant * pu).toFixed(2);

    } else if (mode === 'incluido') {
        if (source === 'imp')       { pu = r4(cant > 0 ? imp / cant : 0); }
        else if (source === 'vu')   { pu = r2(vu * 1.18); }
        vu  = r4(pu / 1.18);
        var igvRow = r2((source === 'imp' ? imp : r2(cant * pu)) - cant * vu);
        vuEl.value  = vu.toFixed(4); puEl.value  = pu.toFixed(2);
        igvEl.value = igvRow.toFixed(2);
        if (source !== 'imp') impEl.value = r2(cant * pu).toFixed(2);

    } else { // mas_igv
        if (source === 'imp')       { pu = r4(cant > 0 ? imp / cant : 0); vu = r4(pu / 1.18); }
        else if (source === 'pu')   { vu = r4(pu / 1.18); }
        else if (source === 'vu')   { pu = r2(vu * 1.18); }
        var igvRow2 = r2((source === 'imp' ? imp : r2(cant * pu)) - cant * vu);
        vuEl.value  = vu.toFixed(4); puEl.value  = pu.toFixed(2);
        igvEl.value = igvRow2.toFixed(2);
        if (source !== 'imp') impEl.value = r2(cant * pu).toFixed(2);
    }

    // Alerta comparación de precio vs referencia
    var alertEl = document.getElementById('ent-price-alert-' + idx);
    var card    = document.getElementById('ent-item-' + idx);
    var oldCost = parseFloat((puEl.dataset && puEl.dataset.oldCost) || (vuEl.dataset && vuEl.dataset.oldCost));
    var compare = pu;
    if (alertEl && !isNaN(oldCost) && oldCost > 0 && Math.abs(compare - oldCost) > 0.001) {
        var diff = compare - oldCost;
        var pct  = (diff / oldCost * 100).toFixed(1);
        var isUp = diff > 0;
        alertEl.style.display = 'flex';
        alertEl.innerHTML =
            '<span style="display:inline-flex;align-items:center;gap:.3rem;padding:.25rem .65rem;border-radius:99px;font-size:.65rem;font-weight:800;' +
            'background:' + (isUp ? '#fee2e2;color:#ef4444' : '#dcfce7;color:#16a34a') + ';">' +
            '<i class="bi bi-arrow-' + (isUp ? 'up' : 'down') + '"></i>' +
            (isUp ? '¡Sube!' : 'Baja') + '</span>' +
            '<span style="font-size:.65rem;color:#94a3b8;font-weight:600;">Ref: S/ ' + oldCost.toFixed(2) + ' → ' + (isUp ? '+' : '') + pct + '%</span>';
        if (card) { card.classList.remove('price-up','price-down'); card.classList.add(isUp ? 'price-up' : 'price-down'); }
    } else if (alertEl) {
        alertEl.style.display = 'none';
        if (card) card.classList.remove('price-up','price-down');
    }
    window._entActualizarTotal();
};

window._entQuitarItem = function(idx) {
    var tr = document.getElementById('ent-item-'+idx);
    if (tr) tr.remove();
    window._entActualizarTotal();
};

// ── QR Scanner — usa el scanner global de la app ──────────────────
window._entQrScanner   = window._entQrScanner   || null;
window._entQrTargetIdx = window._entQrTargetIdx || null;

window._entAbrirQR = function(idx) {
    window._entQrTargetIdx = (idx !== undefined) ? idx : null;
    var targetIdx = window._entQrTargetIdx;
    window._abrirEscaner(function(text) {
        window._entSeleccionarItemPorQR(text, targetIdx);
    }, 'Escanear Artículo');
};

window._entCerrarQR = function() {
    window._cerrarEscaner();
    window._entQrTargetIdx = null;
};

// Rellena el artículo en el card correspondiente al idx dado
window._entSeleccionarItemPorQR = function(invId, idx) {
    var doSelect = function() {
        var item = (window._entInvData || []).find(function(d) {
            return d.id === invId || (d.codigo_barras && d.codigo_barras.trim() === invId);
        });
        if (!item) {
            alert('Artículo no encontrado: ' + invId);
            return;
        }
        var cbId = 'ent-art-' + idx;
        var lbl  = item.id + ' — ' + (item.descripcion || '');
        window._cbSet(cbId, item.id, lbl);
        if (window._cbCallbacks && window._cbCallbacks[cbId]) {
            window._cbCallbacks[cbId](item.id, lbl);
        }
        // Enfocar el campo de cantidad para agilizar el ingreso
        var cantEl = document.querySelector('.ent-item-cant[data-idx="' + idx + '"]');
        if (cantEl) { cantEl.focus(); cantEl.select(); }
    };
    if (!(window._entInvData || []).length) {
        window._entCargarInv(doSelect);
    } else {
        doSelect();
    }
};

// Función legacy mantenida por compatibilidad
window._entAgregarItemPorQR = function(invId) {
    var doAdd = function() {
        var item = (window._entInvData || []).find(function(d) { return d.id === invId; });
        if (!item) { alert('Artículo no encontrado: ' + invId); return; }
        var futureIdx = window._entItemIdx;
        var futureCbId = 'ent-art-' + futureIdx;
        window._entAgregarItem();
        var lbl = item.id + ' — ' + (item.descripcion || '');
        window._cbSet(futureCbId, item.id, lbl);
        if (window._cbCallbacks && window._cbCallbacks[futureCbId]) {
            window._cbCallbacks[futureCbId](item.id, lbl);
        }
    };
    if (!(window._entInvData || []).length) {
        window._entCargarInv(doAdd);
    } else {
        doAdd();
    }
};

window._entActualizarTotal = function() {
    var totalImp = 0, totalIgv = 0;
    document.querySelectorAll('.ent-item-imp').forEach(function(el) { totalImp += parseFloat(el.value) || 0; });
    document.querySelectorAll('.ent-item-igv').forEach(function(el) { totalIgv += parseFloat(el.value) || 0; });
    var totalGravado = totalImp - totalIgv;
    var moneda = (document.getElementById('ent-f-moneda') || {}).value || 'PEN';
    var mode   = window._entIgvMode || 'incluido';
    var mon    = moneda === 'USD' ? '$' : 'S/';
    var el     = document.getElementById('ent-total-display');
    if (!el) return;

    var desglose = document.getElementById('ent-igv-desglose');
    if (mode !== 'sin_igv') {
        var gravEl = document.getElementById('ent-total-gravado');
        var igvEl  = document.getElementById('ent-total-igv');
        if (gravEl) gravEl.textContent = mon + ' ' + totalGravado.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
        if (igvEl)  igvEl.textContent  = mon + ' ' + totalIgv.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
        if (desglose) desglose.style.display = 'block';
    } else {
        if (desglose) desglose.style.display = 'none';
    }

    if (moneda === 'USD') {
        var tc = parseFloat((document.getElementById('ent-f-tc')||{}).value) || window._entTC || 3.70;
        var pen = totalImp * tc;
        el.innerHTML = '<span style="font-weight:900;">$ ' + totalImp.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) +
            '</span><span style="font-size:.75rem;color:var(--subtext);margin-left:.4rem;">\u2248 S/ ' + pen.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span>';
    } else {
        el.textContent = 'S/ ' + totalImp.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
    }
};

window._entActualizarTC = function() {
    var moneda = (document.getElementById('ent-f-moneda') || {}).value || 'PEN';
    var mon = moneda === 'USD' ? '$' : 'S/';
    var el = document.getElementById('ent-total-display');
    if (el) { var old = el.textContent.replace(/^[S\$\/\s\.]+/,''); el.textContent = mon + ' ' + (old || '0.00'); }
};

window._entSetIgvMode = function(mode) {
    var prevMode = window._entIgvMode || 'incluido';
    window._entIgvMode = mode;
    var cfg = { 'sin_igv': 'ent-igv-btn-sin', 'incluido': 'ent-igv-btn-inc', 'mas_igv': 'ent-igv-btn-mas' };
    Object.keys(cfg).forEach(function(m) {
        var btn = document.getElementById(cfg[m]);
        if (!btn) return;
        if (m === mode) { btn.style.background = '#16a34a'; btn.style.color = '#fff'; btn.style.borderColor = '#16a34a'; }
        else { btn.style.background = '#f1f5f9'; btn.style.color = '#64748b'; btn.style.borderColor = '#e2e8f0'; }
    });
    document.querySelectorAll('.ent-item-cant').forEach(function(el) {
        var idx = parseInt(el.dataset.idx);
        var vuEl = document.querySelector('.ent-item-vu[data-idx="'+idx+'"]');
        var puEl = document.querySelector('.ent-item-pu[data-idx="'+idx+'"]');
        if (vuEl && puEl && prevMode !== mode) {
            if (mode === 'mas_igv') {
                // PU actual pasa a ser el nuevo VU (base)
                vuEl.value = puEl.value;
            } else if (mode === 'incluido' && prevMode === 'mas_igv') {
                // VU actual pasa a ser el nuevo PU (precio inclusive)
                puEl.value = vuEl.value;
            }
        }
        if (vuEl) {
            var vuRo = (mode === 'incluido' || mode === 'sin_igv');
            vuEl.readOnly = vuRo; vuEl.style.background = vuRo ? '#f8fafc' : ''; vuEl.style.color = vuRo ? '#64748b' : '';
        }
        if (puEl) {
            var puRo = (mode === 'mas_igv' || mode === 'sin_igv');
            puEl.readOnly = puRo; puEl.style.background = puRo ? '#f8fafc' : ''; puEl.style.color = puRo ? '#64748b' : '';
        }
        var src = mode === 'mas_igv' ? 'vu' : mode === 'sin_igv' ? 'pu' : 'pu';
        window._entCalcImporte(idx, src);
    });
};

// ── Guardar ───────────────────────────────────────────────────────
window.guardarEntrada = function() {
    if (!window.guardAction('ent_inv', 'c')) return;
    var fecha      = (document.getElementById('ent-f-fecha')  || {}).value || '';
    var provId     = window._cbGet('ent-f-proveedor');
    var provNombre = window._cbGetText('ent-f-proveedor');
    var docRef = (document.getElementById('ent-f-doc-ref') || {}).value || '';
    var moneda = (document.getElementById('ent-f-moneda')  || {}).value || 'PEN';
    var obs    = (document.getElementById('ent-f-obs')     || {}).value || '';
    var tipo_orden = (document.getElementById('ent-f-tipo-orden') || {}).value || 'Orden de compra';
    var condicion_pago = (document.getElementById('ent-f-condicion-pago') || {}).value || 'Al contado';
    var dias_credito = parseInt((document.getElementById('ent-f-dias-credito') || {}).value, 10) || 30;
    var motivo = (document.getElementById('ent-f-motivo')  || {}).value || '';
    var placa  = window._cbGet('ent-f-placa') || '';

    if (!fecha)  { alert('Falta la fecha.'); return; }
    if (!provId) { alert('Selecciona un proveedor.'); return; }
    if (window._entProvItems && !window._entProvItems.find(function(p) { return p.value === provId; })) {
        alert('El proveedor ingresado no existe en la lista. Por favor, regístrelo primero.');
        return;
    }

    var invIds = document.querySelectorAll('.ent-item-inv-id');
    var descs  = document.querySelectorAll('.ent-item-desc');
    var cants  = document.querySelectorAll('.ent-item-cant');
    var pus    = document.querySelectorAll('.ent-item-pu');
    var imps   = document.querySelectorAll('.ent-item-imp');
    var items  = [];
    for (var i = 0; i < cants.length; i++) {
        var invId = invIds[i] ? invIds[i].value : '';
        var desc  = descs[i]  ? descs[i].value  : '';
        if (!invId && !desc) continue;
        
        var validItem = window._entInvData && window._entInvData.find(function(it) { return it.id === invId; });
        var expectedLabel = validItem ? (validItem.id + ' — ' + (validItem.descripcion || '')) : '';
        if (!validItem || desc.trim() !== expectedLabel.trim()) { 
            alert('El artículo "' + desc + '" en la fila ' + (i+1) + ' no es válido o fue modificado. Seleccione uno correcto de la lista desplegable.'); 
            return; 
        }
        
        var cant = parseFloat(cants[i].value) || 0;
        var pu   = parseFloat(pus[i] ? pus[i].value : 0) || 0;
        var imp  = parseFloat(imps[i].value) || cant * pu;
        if (cant <= 0) { alert('Cantidad inválida en fila '+(i+1)); return; }
        // costo_unitario = precio unitario final (con IGV incluido)
        items.push({ inventario_id: invId||null, descripcion: desc, cantidad: cant, costo_unitario: pu, moneda: moneda, importe: imp });
    }
    if (!items.length) { alert('Agrega al menos un artículo.'); return; }

    var payload = { fecha, proveedor_id: provId||null, proveedor_nombre: provNombre||null,
        documento_referencia: docRef||null, moneda,
        tipo_igv: window._entIgvMode || 'sin_igv',
        tipo_cambio: moneda === 'USD'
            ? (parseFloat((document.getElementById('ent-f-tc')||{}).value) || window._entTC || 3.40)
            : 1,
        observaciones: obs,
        motivo_entrada: motivo,
        placa: placa,
        tipo_orden: tipo_orden,
        condicion_pago: condicion_pago,
        dias_credito: dias_credito,
        creado_por: localStorage.getItem('fleet_user')||'', items };

    var method = window._entEditId ? 'PUT' : 'POST';
    var url = window._entEditId ? '/api/almacen/entradas/' + window._entEditId : '/api/almacen/entradas';

    fetch(url, { method: method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(async function(r) {
            var entId = window._entEditId || r.id;
            var fVoucher = document.getElementById('ent-f-voucher') ? document.getElementById('ent-f-voucher').files[0] : null;
            var fCotizacion = document.getElementById('ent-f-cotizacion') ? document.getElementById('ent-f-cotizacion').files[0] : null;
            var fFactura = document.getElementById('ent-f-factura') ? document.getElementById('ent-f-factura').files[0] : null;

            var uploadFile = async function(file, tipo) {
                var fd = new FormData();
                fd.append('archivo', file);
                try {
                    var res = await fetch('/api/almacen/entradas/'+entId+'/archivo/'+tipo, { method: 'POST', body: fd });
                    if (!res.ok) {
                        var text = await res.text();
                        alert('Error al subir ' + tipo + ': ' + text);
                        throw new Error('Upload error: ' + text);
                    }
                } catch (err) {
                    alert('Fallo de conexión o subida para ' + tipo + ': ' + err.message);
                    throw err;
                }
            };

            try {
                if (fVoucher) await uploadFile(fVoucher, 'voucher');
                if (fCotizacion) await uploadFile(fCotizacion, 'cotizacion');
                if (fFactura) await uploadFile(fFactura, 'factura');
            } catch (e) {
                console.error("Error subiendo archivos", e);
            }

            window._entCerrarModal();
            alert('📦 Orden de Compra ' + (window._entEditId ? 'actualizada' : 'registrada') + ': '+entId);
            window._entEditId = null;
            window.cargarEntradas();
        })
        .catch(function(err) { alert('Error: '+err.message); });
};

// ── Abrir panel ───────────────────────────────────────────────────
window.abrirModalEntrada = function() {
    window._entEditId = null;
    var cards = document.getElementById('ent-items-cards');
    if (cards) cards.innerHTML = '';
    window._entItemIdx = 0;
    var totalEl = document.getElementById('ent-total-display');
    if (totalEl) totalEl.textContent = 'S/ 0.00';

    ['ent-f-doc-ref','ent-f-obs', 'ent-f-placa-txt', 'ent-f-placa', 'ent-f-motivo'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
    });
    
    var tipoOrden = document.getElementById('ent-f-tipo-orden');
    if (tipoOrden) tipoOrden.value = 'Orden de compra';
    var condPago = document.getElementById('ent-f-condicion-pago');
    setTimeout(window._entToggleTipoOrden, 50);
    setTimeout(window._entToggleTipoOrden, 50);
    if (condPago) { condPago.value = 'Al contado'; var dcb = document.getElementById('ent-f-dias-credito-box'); if(dcb) dcb.style.display = 'none'; }
    var dias = document.getElementById('ent-f-dias-credito');
    if (dias) dias.value = '30';
    
    ['ent-f-voucher', 'ent-f-cotizacion', 'ent-f-factura'].forEach(function(id) {
        var el = document.getElementById(id);
        if(el) {
            el.value = '';
            if(el.nextElementSibling) el.nextElementSibling.textContent = 'Ningún archivo';
            if(el.parentElement) {
                el.parentElement.style.borderColor = 'var(--border)';
                el.parentElement.style.background = 'var(--bg)';
                el.parentElement.style.borderStyle = 'dashed';
            }
        }
    });

    var obsRow = document.getElementById('ent-obs-row');
    var obsBtn = document.getElementById('ent-obs-toggle');
    if (obsRow) obsRow.style.display = 'none';
    if (obsBtn) { obsBtn.style.background = 'transparent'; obsBtn.style.color = '#94a3b8'; }
    window._cbReset('ent-f-proveedor');
    var fecha = document.getElementById('ent-f-fecha');
    if (fecha) fecha.value = new Date().toISOString().split('T')[0];
    var mon = document.getElementById('ent-f-moneda');
    if (mon) mon.value = 'PEN';
    window._entOnMonedaChange();

    window._entAgregarItem();

    window._entSetIgvMode('incluido');

    var panel = document.getElementById('modal-entrada');
    var bd    = document.getElementById('ent-entrada-bd');
    if (panel) panel.classList.add('open');
    if (bd)    bd.style.display = 'block';
};

window.abrirModalEditarEntrada = function(id) {
    var entrada = (window._entData || []).find(function(e) { return e.id === id; });
    if (!entrada) return alert('No se encontró la entrada');
    
    window.abrirModalEntrada(); // Resetea y abre el panel
    window._entEditId = id; // Sobrescribimos el reset

    var fFecha = document.getElementById('ent-f-fecha');
    if (fFecha && entrada.fecha) fFecha.value = String(entrada.fecha).split('T')[0];

    var docRef = document.getElementById('ent-f-doc-ref');
    if (docRef) docRef.value = entrada.documento_referencia || '';

    var fTipoOrden = document.getElementById('ent-f-tipo-orden');
    if (fTipoOrden) fTipoOrden.value = entrada.tipo_orden || 'Orden de compra';
    window._cbSet('ent-f-ot', entrada.ot_id || '', entrada.ot_id || '');
    setTimeout(window._entToggleTipoOrden, 50);
    window._cbSet('ent-f-ot', entrada.ot_id || '', entrada.ot_id || '');
    setTimeout(window._entToggleTipoOrden, 50);

    var fCondPago = document.getElementById('ent-f-condicion-pago');
    if (fCondPago) {
        fCondPago.value = entrada.condicion_pago || 'Al contado';
        document.getElementById('ent-f-dias-credito-box').style.display = fCondPago.value === 'A crédito' ? 'block' : 'none';
    }

    var fDiasCredito = document.getElementById('ent-f-dias-credito');
    if (fDiasCredito) fDiasCredito.value = entrada.dias_credito || 30;

    var fObs = document.getElementById('ent-f-obs');
    if (fObs) {
        fObs.value = entrada.observaciones || '';
        var obsRow = document.getElementById('ent-obs-row');
        if (obsRow && entrada.observaciones) obsRow.style.display = 'flex';
        var obsBtn = document.getElementById('ent-obs-toggle');
        if (obsBtn && entrada.observaciones) {
            obsBtn.style.background = '#e0e7ff';
            obsBtn.style.color = '#4338ca';
        }
    }

    var fMotivo = document.getElementById('ent-f-motivo');
    if (fMotivo) fMotivo.value = entrada.motivo_entrada || '';
    
    if (entrada.placa) {
        window._cbSet('ent-f-placa', entrada.placa, entrada.placa);
    }

    if (entrada.proveedor_id) {
        window._cbSet('ent-f-proveedor', entrada.proveedor_id, entrada.proveedor_nombre);
    } else if (entrada.proveedor_nombre) {
        var el = document.getElementById('ent-f-proveedor-txt');
        if (el) el.value = entrada.proveedor_nombre;
    }

    var mon = document.getElementById('ent-f-moneda');
    if (mon && entrada.moneda) mon.value = entrada.moneda;
    window._entOnMonedaChange();

    window._entSetIgvMode(entrada.tipo_igv || 'sin_igv');

    var cards = document.getElementById('ent-items-cards');
    if (cards) cards.innerHTML = '';
    window._entItemIdx = 0;

    var items = entrada.items || [];
    items.forEach(function(it) {
        window._entAgregarItem();
        var idx = window._entItemIdx - 1;
        var cbId = 'ent-art-' + idx;
        
        setTimeout(function() {
            if (it.inventario_id) {
                window._cbSet(cbId, it.inventario_id, it.inventario_id + ' — ' + (it.descripcion || ''));
            } else {
                var txt = document.getElementById(cbId + '-txt');
                if (txt) txt.value = it.descripcion || '';
            }
            
            var cantEl = document.querySelector('.ent-item-cant[data-idx="'+idx+'"]');
            var puEl   = document.querySelector('.ent-item-pu[data-idx="'+idx+'"]');
            
            if (cantEl) cantEl.value = it.cantidad || 0;
            if (puEl) {
                puEl.value = it.costo_unitario || 0;
                puEl.dataset.oldCost = it.costo_unitario || 0;
            }
            window._entCalcImporte(idx, 'pu');
        }, 150);
    });
};

// ── Cerrar panel ──────────────────────────────────────────────────
window._entCerrarModal = function() {
    if (window._entQrScanner) window._entCerrarQR();
    var panel = document.getElementById('modal-entrada');
    var bd    = document.getElementById('ent-entrada-bd');
    if (panel) panel.classList.remove('open');
    if (bd)    bd.style.display = 'none';

    var f1 = document.getElementById('ent-f-voucher'); if (f1) f1.value = '';
    var f2 = document.getElementById('ent-f-cotizacion'); if (f2) f2.value = '';
    var f3 = document.getElementById('ent-f-factura'); if (f3) f3.value = '';
};

// ── Eliminar ──────────────────────────────────────────────────────
window.eliminarEntrada = function(id) {
    if (!window.guardAction('ent_inv', 'd')) return;
    if (!confirm('¿Eliminar entrada '+id+'? Se eliminarán sus detalles.')) return;
    fetch('/api/almacen/entradas/'+encodeURIComponent(id), {method:'DELETE'})
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function() {
            if (window._entDetalleId === id) window._entCerrarDetalle();
            window.cargarEntradas();
        })
        .catch(function(err) { alert('Error: '+err.message); });
};

window.anularEntrada = function(id) {
    if (!window.checkPerm('ent_inv', 'd')) return;
    var motivo = prompt('Motivo de anulación para la entrada ' + id + ':');
    if (motivo === null) return;
    if (!motivo.trim()) return alert('Debe ingresar un motivo para anular.');
    fetch('/api/almacen/entradas/' + encodeURIComponent(id) + '/anular', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ motivo: motivo })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(r) {
        if (window._entDetalleId === id) window._entCerrarDetalle();
        window.cargarEntradas();
    })
    .catch(function(err) { alert('Error: ' + err.message); });
};

// ── Filtrar + Render ──────────────────────────────────────────────
window.filtrarEntradas = function() {
    var buscar  = ((document.getElementById('ent-buscar')     ||{}).value||'').toLowerCase();
    var desde   = ((document.getElementById('ent-fil-desde')  ||{}).value||'');
    var hasta   = ((document.getElementById('ent-fil-hasta')  ||{}).value||'');
    window._entFiltrados = (window._entData||[]).filter(function(d) {
        var matchB = !buscar||
            (d.id||'').toLowerCase().includes(buscar)||
            (d.proveedor_nombre||'').toLowerCase().includes(buscar)||
            (d.documento_referencia||'').toLowerCase().includes(buscar)||
            (d.creado_por||'').toLowerCase().includes(buscar)||
            (d.items||[]).some(function(it) {
                return (it.inventario_id||'').toLowerCase().includes(buscar) ||
                       (it.descripcion||'').toLowerCase().includes(buscar);
            });
        var fecha = d.fecha ? String(d.fecha).split('T')[0] : '';
        var matchD = !desde || fecha >= desde;
        var matchH = !hasta || fecha <= hasta;
        // Si solo hay una fecha: filtro exacto por ese día
        if (desde && !hasta) { matchD = fecha === desde; matchH = true; }
        if (!desde && hasta) { matchD = true; matchH = fecha === hasta; }
        return matchB && matchD && matchH;
    });
    window._entPagActual = 1;
    window._entRender();
};

window._entLimpiarFechas = function() {
    var d = document.getElementById('ent-fil-desde');
    var h = document.getElementById('ent-fil-hasta');
    if (d) d.value = '';
    if (h) h.value = '';
    window.filtrarEntradas();
};

window._entRender = function() {
    var datos = window._entFiltrados || [];
    var total = datos.length;
    var totalPag = Math.max(1, Math.ceil(total / _ENT_POR_PAG));
    var pag = Math.min(window._entPagActual, totalPag);
    window._entPagActual = pag;
    var pagina = datos.slice((pag - 1) * _ENT_POR_PAG, pag * _ENT_POR_PAG);
    var canDelete = window.checkPerm('ent_inv', 'd');
    var canEdit = window.checkPerm('ent_inv', 'u');
    var isAdmin = localStorage.getItem('fleet_role') === 'Administrador';
    var todayStr = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Lima'});

    var cont = document.getElementById('ent-contador');
    if (cont) cont.textContent = total + ' registro' + (total !== 1 ? 's' : '');

    var tbody = document.getElementById('tbody-entradas');
    if (!tbody) return;
    if (!pagina.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="td-placeholder"><i class="bi bi-inbox" style="font-size:1.5rem;opacity:0.3"></i><br>Sin entradas encontradas</td></tr>';
        var paginEl2 = document.getElementById('ent-paginacion');
        if (paginEl2) paginEl2.innerHTML = '';
        return;
    }

    tbody.innerHTML = '';
    pagina.forEach(function(d) {
        var fecha = d.fecha ? String(d.fecha).split('T')[0] : '—';
        var isAnulado = d.estado === 'Anulado';
        var dCreated = d.created_at ? String(d.created_at).split('T')[0] : fecha;
        var canEditRow = canEdit && !isAnulado && (isAdmin || dCreated === todayStr);

        var tp = parseFloat(d.total_pen || 0);
        var totalFmt = '<strong style="color:#16a34a;">S/ ' + tp.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</strong>';
        var estadoHtml = isAnulado ? '<span class="badge bg-danger">ANULADA</span>' : '<span class="badge" style="background-color:#16a34a;">REGISTRADA</span>';
          var tipoOrdBadge = (d.tipo_orden && d.tipo_orden.toLowerCase() === 'orden de servicio') 
                ? '<div class="badge bg-warning text-dark" style="font-size:0.6rem; letter-spacing:0.04em; margin-bottom:4px;">SERVICIO</div><br>' 
                : '<div class="badge bg-primary" style="font-size:0.6rem; letter-spacing:0.04em; margin-bottom:4px;">COMPRA</div><br>';
        var placaHtml = d.placa ? '<span class="badge bg-secondary fw-normal">' + _entEsc(d.placa) + '</span>' : '<span class="text-muted small">—</span>';
        var motivoHtml = d.motivo_entrada ? '<span style="font-size:0.75rem;">' + _entEsc(d.motivo_entrada) + '</span>' : '<span class="text-muted small">—</span>';
        
        var vHTML = d.url_voucher_presigned ? '<a href="'+_entEsc(d.url_voucher_presigned)+'" target="_blank" class="text-danger text-decoration-none" style="font-size:0.75rem;"><i class="bi bi-download"></i> Ver/Descargar</a>' : '<span class="text-muted" style="font-size:0.75rem;">—</span>';
        var cHTML = d.url_cotizacion_presigned ? '<a href="'+_entEsc(d.url_cotizacion_presigned)+'" target="_blank" class="text-danger text-decoration-none" style="font-size:0.75rem;"><i class="bi bi-download"></i> Ver/Descargar</a>' : '<span class="text-muted" style="font-size:0.75rem;">—</span>';
        var fHTML = d.url_factura_presigned ? '<a href="'+_entEsc(d.url_factura_presigned)+'" target="_blank" class="text-danger text-decoration-none" style="font-size:0.75rem;"><i class="bi bi-download"></i> Ver/Descargar</a>' : '<span class="text-muted" style="font-size:0.75rem;">—</span>';

        var items = d.items || [];
        var isActive = d.id === window._entDetalleId;
        var activeCls = isActive ? ' ent-row-active' : '';
        if (isAnulado) activeCls += ' text-muted opacity-75';

        if (!items.length) {
            var tr0 = document.createElement('tr');
            tr0.className = activeCls.trim();
            tr0.innerHTML =
                '<td class="text-center">' + tipoOrdBadge + '<span class="badge bg-secondary fw-normal" style="font-size:0.72rem;">' + _entEsc(d.id || '') + '</span></td>' +
                '<td style="white-space:nowrap;font-size:.80rem;">' + fecha + '</td>' +
                '<td class="text-center col-hide-mob">' + estadoHtml + '</td>' +
                '<td class="col-hide-mob">' + placaHtml + '</td>' +
                '<td class="col-hide-mob">' + motivoHtml + '</td>' +
                '<td class="col-hide-mob">' + (d.proveedor_nombre ? '<span style="font-size:.8rem;">' + _entEsc(d.proveedor_nombre) + '</span>' : '<span class="text-muted small">—</span>') + '</td>' +
                '<td class="col-hide-mob" style="color:var(--subtext);font-size:.78rem;"></td>' +
                '<td class="col-articulo" style="color:var(--subtext);font-size:.78rem;">Sin artículos</td>' +
                '<td class="text-end"></td>' +
                '<td class="text-end col-hide-mob"></td>' +
                '<td class="text-end col-hide-mob">' + totalFmt + '</td>' +
                '<td class="text-center col-hide-mob">' + vHTML + '</td>' +
                '<td class="text-center col-hide-mob">' + cHTML + '</td>' +
                '<td class="text-center col-hide-mob">' + fHTML + '</td>' +
                '<td class="text-center" style="white-space:nowrap;" onclick="event.stopPropagation();">' +
                    '<div class="d-flex gap-1 justify-content-center">' +
                        '<button class="btn btn-xs btn-outline-secondary" onclick="event.stopPropagation(); window.previsualizarComprobanteEntrada(\'' + _entEsc(d.id) + '\')" title="Ver" style="display:none;"><i class="bi bi-eye"></i></button>' +
                        '<button class="btn btn-xs btn-outline-primary" onclick="event.stopPropagation(); window.generarComprobanteEntrada(\'' + _entEsc(d.id) + '\')" title="Ver PDF"><i class="bi bi-eye"></i></button>' +
                        (canEditRow ? '<button class="btn btn-xs btn-outline-warning" onclick="window.abrirModalEditarEntrada(\'' + _entEsc(d.id) + '\')" title="Editar"><i class="bi bi-pencil"></i></button>' : '<button class="btn btn-xs" style="visibility:hidden"><i class="bi bi-pencil"></i></button>') +
                        (canDelete && !isAnulado ? '<button class="btn btn-xs btn-outline-danger" onclick="window.anularEntrada(\'' + _entEsc(d.id) + '\')" title="Anular"><i class="bi bi-x-circle"></i></button>' : '<button class="btn btn-xs" style="visibility:hidden"><i class="bi bi-x-circle"></i></button>') +
                        (canDelete ? '<button class="btn btn-xs btn-outline-secondary" onclick="window.eliminarEntrada(\'' + _entEsc(d.id) + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>' : '<button class="btn btn-xs" style="visibility:hidden"><i class="bi bi-trash"></i></button>') +
                    '</div>' +
                '</td>';
            tr0.onclick = (function(row) { return function() { window._entAbrirDetalle(row.id); }; })(d);
            tbody.appendChild(tr0);
            return;
        }

        // Si la búsqueda no coincide con la cabecera, filtrar solo los items que coincidan
        var buscar = ((document.getElementById('ent-buscar') || {}).value || '').toLowerCase().trim();
        var itemsFiltrados = items;
        if (buscar) {
            var cabText = [d.id, d.proveedor_nombre, d.documento_referencia].join(' ').toLowerCase();
            if (cabText.indexOf(buscar) === -1) {
                itemsFiltrados = items.filter(function(it) {
                    return [(it.inventario_id || ''), (it.descripcion || '')].join(' ').toLowerCase().indexOf(buscar) !== -1;
                });
            }
        }

        itemsFiltrados.forEach(function(it, idx) {
            var isFirst = idx === 0;
            var isLast  = idx === itemsFiltrados.length - 1;
            var tr = document.createElement('tr');
            var cls = activeCls;
            if (!isFirst) cls += ' ent-item-sub';
            if (isLast && itemsFiltrados.length > 1) cls += ' ent-item-last';
            tr.className = cls.trim();

            var cant  = parseFloat(it.cantidad || 0);
            var cu    = parseFloat(it.costo_unitario || 0);
            var nombre = _entEsc(_entDescLimpia(it.descripcion, it.inventario_id));
            var invId  = _entEsc(it.inventario_id || '—');
            var provHtml = d.proveedor_nombre ? '<span style="font-size:.78rem;">' + _entEsc(d.proveedor_nombre) + '</span>' : '<span class="text-muted small">—</span>';

            tr.innerHTML =
                 '<td class="text-center" style="vertical-align:middle;">' + (isFirst ? tipoOrdBadge : '') + '<span class="badge bg-secondary fw-normal" style="font-size:0.72rem;">' + _entEsc(d.id || '') + '</span></td>' +
                '<td style="white-space:nowrap;font-size:.80rem;">' + fecha + '</td>' +
                '<td class="text-center">' + estadoHtml + '</td>' +
                '<td>' + placaHtml + '</td>' +
                '<td>' + motivoHtml + '</td>' +
                '<td>' + provHtml + '</td>' +
                '<td class="col-hide-mob" style="font-size:.73rem;color:var(--subtext);font-family:monospace;white-space:nowrap;">' + invId + '</td>' +
                '<td class="col-articulo" style="font-size:.80rem;">' + nombre + '</td>' +
                '<td class="text-end" style="font-size:.80rem;">' + cant.toLocaleString('es-PE', {maximumFractionDigits:3}) + '</td>' +
                '<td class="text-end col-hide-mob" style="font-size:.80rem;">' + (d.moneda === 'USD' ? '$ ' : 'S/ ') + cu.toLocaleString('es-PE', {minimumFractionDigits:2,maximumFractionDigits:2}) + '</td>' +
                '<td class="text-end col-hide-mob">' + (isFirst ? totalFmt : '') + '</td>' +
                '<td class="text-center col-hide-mob">' + (isFirst ? vHTML : '') + '</td>' +
                '<td class="text-center col-hide-mob">' + (isFirst ? cHTML : '') + '</td>' +
                '<td class="text-center col-hide-mob">' + (isFirst ? fHTML : '') + '</td>' +
                '<td class="text-center" style="white-space:nowrap;" onclick="event.stopPropagation();">' +
                    (isFirst ?
                        '<div class="d-flex gap-1 justify-content-center">' +
                            '<button class="btn btn-xs btn-outline-secondary" onclick="event.stopPropagation(); window.previsualizarComprobanteEntrada(\'' + _entEsc(d.id) + '\')" title="Ver" style="display:none;"><i class="bi bi-eye"></i></button>' +
                            '<button class="btn btn-xs btn-outline-primary" onclick="event.stopPropagation(); window.generarComprobanteEntrada(\'' + _entEsc(d.id) + '\')" title="Ver PDF"><i class="bi bi-eye"></i></button>' +
                            (canEditRow ? '<button class="btn btn-xs btn-outline-warning" onclick="window.abrirModalEditarEntrada(\'' + _entEsc(d.id) + '\')" title="Editar"><i class="bi bi-pencil"></i></button>' : '<button class="btn btn-xs" style="visibility:hidden"><i class="bi bi-pencil"></i></button>') +
                            (canDelete && !isAnulado ? '<button class="btn btn-xs btn-outline-danger" onclick="window.anularEntrada(\'' + _entEsc(d.id) + '\')" title="Anular"><i class="bi bi-x-circle"></i></button>' : '<button class="btn btn-xs" style="visibility:hidden"><i class="bi bi-x-circle"></i></button>') +
                            (canDelete ? '<button class="btn btn-xs btn-outline-secondary" onclick="window.eliminarEntrada(\'' + _entEsc(d.id) + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>' : '<button class="btn btn-xs" style="visibility:hidden"><i class="bi bi-trash"></i></button>') +
                        '</div>'
                    : '') +
                '</td>';
            tr.onclick = (function(row) { return function() { window._entAbrirDetalle(row.id); }; })(d);
            tbody.appendChild(tr);
        });
    });

    var paginEl = document.getElementById('ent-paginacion');
    if (paginEl) {
        if (totalPag <= 1) { paginEl.innerHTML = ''; return; }
        var btns = '';
        btns += '<button style="width:38px;height:38px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:' + (pag<=1?'0.35':'1') + ';" ' + (pag<=1?'disabled':'') + ' onclick="window._entIrPag(' + (pag-1) + ')"><i class="bi bi-chevron-left"></i></button>';
        btns += '<span style="font-size:.8rem;font-weight:700;color:var(--subtext);">Pág. <b style="color:var(--text)">' + pag + '</b> / ' + totalPag + '</span>';
        btns += '<button style="width:38px;height:38px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:' + (pag>=totalPag?'0.35':'1') + ';" ' + (pag>=totalPag?'disabled':'') + ' onclick="window._entIrPag(' + (pag+1) + ')"><i class="bi bi-chevron-right"></i></button>';
        paginEl.innerHTML = '<div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .75rem .75rem;">' + btns + '</div>';
    }
};

window._entIrPag = function(n) { window._entPagActual = n; window._entRender(); };

// ── Panel detalle ──────────────────────────────────────────────────
window._entAbrirDetalle = function(id) {
    window._entDetalleId = id;
    window._entRender();

    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) return;

    var titulo = document.getElementById('ent-detalle-titulo');
    if (titulo) titulo.textContent = 'Entrada ' + id;

    var fecha = d.fecha ? String(d.fecha).split('T')[0] : '—';
    var tp = parseFloat(d.total_pen || 0);
    var monSim = d.moneda === 'USD' ? 'USD' : 'PEN';
    var items = d.items || [];

    var html = '';
    html += '<div style="font-size:1.2rem; font-weight:800; color:var(--text); margin-bottom:0.25rem;">' + _entEsc(id) + '</div>';
    html += '<div style="font-size:0.82rem; color:var(--subtext); margin-bottom:1rem;">' + fecha + '</div>';

    html += '<div class="ent-sec">';
    html += '<div class="ent-sec-hd">Información General</div>';
    html += '<div class="ent-field"><div class="ent-field-lbl">Placa</div><div class="ent-field-val">' + _entEsc(d.placa || '-') + '</div></div>';
    html += '<div class="ent-field"><div class="ent-field-lbl">Motivo</div><div class="ent-field-val">' + _entEsc(d.motivo_entrada || '-') + '</div></div>';
    html += '<div class="ent-field"><div class="ent-field-lbl">Proveedor</div><div class="ent-field-val">' + _entEsc(d.proveedor_nombre || '-') + '</div></div>';
    html += '<div class="ent-field"><div class="ent-field-lbl">Nº Factura</div><div class="ent-field-val">' + _entEsc(d.documento_referencia || '-') + '</div></div>';
    html += '<div class="ent-field"><div class="ent-field-lbl">Tipo de Orden</div><div class="ent-field-val">' + _entEsc(d.tipo_orden || 'Orden de compra') + '</div></div>';
    html += '<div class="ent-field"><div class="ent-field-lbl">Condición de Pago</div><div class="ent-field-val">' + _entEsc(d.condicion_pago || 'Al contado') + (d.condicion_pago === 'A crédito' ? ' (' + (d.dias_credito || 30) + ' días)' : '') + '</div></div>';
    html += '<div class="ent-field"><div class="ent-field-lbl">Moneda</div><div class="ent-field-val">' + monSim + (d.moneda === 'USD' && d.tipo_cambio ? ' (T/C: ' + parseFloat(d.tipo_cambio).toFixed(3) + ')' : '') + '</div></div>';
    html += '<div class="ent-field"><div class="ent-field-lbl">Total PEN</div><div class="ent-field-val"><span style="font-size:1.05rem; color:#16a34a; font-weight:800;">S/ ' + tp.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span></div></div>';
    // Desglose IGV
    var igvMode = d.tipo_igv || 'sin_igv';
    var igvLabel = igvMode === 'incluido' ? 'Incluido IGV' : igvMode === 'mas_igv' ? '+ IGV 18%' : 'Sin IGV';
    html += '<div class="ent-field"><div class="ent-field-lbl">Tipo IGV</div><div class="ent-field-val"><span style="font-size:.75rem;font-weight:700;padding:2px 8px;border-radius:99px;background:' + (igvMode==='sin_igv'?'#f1f5f9;color:#64748b':'#fef3c7;color:#92400e') + ';">' + igvLabel + '</span></div></div>';
    if (igvMode !== 'sin_igv') {
        var gravado = tp / 1.18;
        var igvMonto = tp - gravado;
        html += '<div class="ent-field" style="background:#fffbeb;"><div class="ent-field-lbl" style="color:#92400e;">Gravado</div><div class="ent-field-val" style="color:#92400e;font-weight:700;">S/ ' + gravado.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</div></div>';
        html += '<div class="ent-field" style="background:#fffbeb;"><div class="ent-field-lbl" style="color:#92400e;">IGV 18%</div><div class="ent-field-val" style="color:#d97706;font-weight:700;">S/ ' + igvMonto.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</div></div>';
    }
    if (d.observaciones) {
        html += '<div class="ent-field"><div class="ent-field-lbl">Observaciones</div><div class="ent-field-val" style="font-size:0.78rem; white-space:normal;">' + _entEsc(d.observaciones) + '</div></div>';
    }
    if (d.creado_por) {
        html += '<div class="ent-field"><div class="ent-field-lbl">Registrado por</div><div class="ent-field-val" style="font-size:0.75rem;">' + _entEsc(d.creado_por) + '</div></div>';
    }
    html += '</div>';

    if (items.length) {
        html += '<div class="ent-sec" style="margin-top:1rem;">';
        html += '<div class="ent-sec-hd">Artículos (' + items.length + ')</div>';
        items.forEach(function(it) {
            var cant = parseFloat(it.cantidad || 0);
            var cu   = parseFloat(it.costo_unitario || 0);
            var imp  = parseFloat(it.importe || cant * cu || 0);
            var mon  = d.moneda === 'USD' ? '$' : 'S/';
            html += '<div class="ent-field" style="flex-direction:column; gap:2px;">';
            html += '<div style="display:flex; justify-content:space-between;">';
            html += '<span style="font-size:0.8rem; font-weight:700; color:var(--text);">' + _entEsc(it.descripcion || it.inventario_id || '—') + '</span>';
            html += '<span style="font-size:0.78rem; font-weight:800; color:#16a34a;">' + mon + ' ' + imp.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span>';
            html += '</div>';
            if (it.inventario_id) {
                html += '<span style="font-size:0.65rem; color:var(--subtext);">' + _entEsc(it.inventario_id) + ' — ' + cant.toLocaleString('es-PE', { maximumFractionDigits: 3 }) + ' × ' + mon + ' ' + cu.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '</span>';
            }
            html += '</div>';
        });
        html += '</div>';
    }

    var scroll = document.getElementById('ent-detalle-scroll');
    if (scroll) scroll.innerHTML = html;

    var footer = document.getElementById('ent-detalle-footer');
    if (footer) {
        footer.style.display = 'flex';
        footer.innerHTML =
            '<button class="btn btn-sm btn-outline-secondary flex-fill" onclick="window.previsualizarComprobanteEntrada(\'' + _entEsc(id) + '\')" style="display:none;">' +
            '<i class="bi bi-eye me-1"></i>Ver</button>' +
            '<button class="btn btn-sm btn-outline-primary flex-fill" onclick="window.generarComprobanteEntrada(\'' + _entEsc(id) + '\')" style="display:none;">' +
            '<i class="bi bi-file-earmark-pdf me-1"></i>PDF</button>' +
            '<button class="btn btn-sm btn-outline-danger" onclick="window.eliminarEntrada(\'' + _entEsc(id) + '\')">' +
            '<i class="bi bi-trash"></i></button>';
    }

    var panel = document.getElementById('ent-panel-detalle');
    if (panel) panel.classList.add('open');
    var bd = document.getElementById('ent-det-backdrop');
    if (bd && window.innerWidth < 768) bd.style.display = 'block';
};

window._entCerrarDetalle = function() {
    var panel = document.getElementById('ent-panel-detalle');
    if (panel) panel.classList.remove('open');
    var bd = document.getElementById('ent-det-backdrop');
    if (bd) bd.style.display = 'none';
    window._entDetalleId = null;
    window._entRender();
};


function _entEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _entDescLimpia(desc, invId) {
    if (!desc) return '—';
    if (invId && desc.indexOf(invId + ' — ') === 0) return desc.slice(invId.length + 3);
    var sep = desc.indexOf(' — ');
    return sep !== -1 ? desc.slice(sep + 3) : desc;
}

// ── Comprobante PDF ───────────────────────────────────────────────


window._entGenerarHtmlPDF = function(d) {
    var fecha = d.fecha ? String(d.fecha).split('T')[0] : '-';
    // Use the original total, not the PEN converted total
    
    var subtotalItems = 0;
    (d.items || []).forEach(function(it) {
        var cant = parseFloat(it.cantidad || 0);
        var cu   = parseFloat(it.costo_unitario || 0);
        subtotalItems += (cant * cu);
    });
    
    var totalReal = subtotalItems;
    if (d.tipo_igv === 'mas_igv') {
        totalReal = subtotalItems * 1.18;
    }
    
    // Fallback if no items for some reason
    if (totalReal === 0 && d.total_pen) {
        totalReal = parseFloat(d.total_pen);
        if (d.moneda === 'USD') {
            var tc = parseFloat(d.tipo_cambio || 3.4);
            if (tc > 0) totalReal = totalReal / tc;
        }
    }
    
    var monSimbolo = d.moneda === 'USD' ? 'USD' : 'PEN';


    function numeroALetras(num) {
        var data = { enteros: Math.floor(num), centavos: Math.round(num * 100) - Math.floor(num) * 100 };
        function Unidades(num){ switch(num) { case 1: return 'UN'; case 2: return 'DOS'; case 3: return 'TRES'; case 4: return 'CUATRO'; case 5: return 'CINCO'; case 6: return 'SEIS'; case 7: return 'SIETE'; case 8: return 'OCHO'; case 9: return 'NUEVE'; } return ''; }
        function Decenas(num){ var decena = Math.floor(num/10); var unidad = num - (decena * 10); switch(decena) { case 1: switch(unidad) { case 0: return 'DIEZ'; case 1: return 'ONCE'; case 2: return 'DOCE'; case 3: return 'TRECE'; case 4: return 'CATORCE'; case 5: return 'QUINCE'; default: return 'DIECI' + Unidades(unidad); } case 2: switch(unidad) { case 0: return 'VEINTE'; default: return 'VEINTI' + Unidades(unidad); } case 3: return DecenasY('TREINTA', unidad); case 4: return DecenasY('CUARENTA', unidad); case 5: return DecenasY('CINCUENTA', unidad); case 6: return DecenasY('SESENTA', unidad); case 7: return DecenasY('SETENTA', unidad); case 8: return DecenasY('OCHENTA', unidad); case 9: return DecenasY('NOVENTA', unidad); case 0: return Unidades(unidad); } return Unidades(num); }
        function DecenasY(strSin, numUnidades) { if (numUnidades > 0) return strSin + ' Y ' + Unidades(numUnidades); return strSin; }
        function Centenas(num) { var centenas = Math.floor(num / 100); var decenas = num - (centenas * 100); switch(centenas){ case 1: if (decenas > 0) return 'CIENTO ' + Decenas(decenas); return 'CIEN'; case 2: return 'DOSCIENTOS ' + Decenas(decenas); case 3: return 'TRESCIENTOS ' + Decenas(decenas); case 4: return 'CUATROCIENTOS ' + Decenas(decenas); case 5: return 'QUINIENTOS ' + Decenas(decenas); case 6: return 'SEISCIENTOS ' + Decenas(decenas); case 7: return 'SETECIENTOS ' + Decenas(decenas); case 8: return 'OCHOCIENTOS ' + Decenas(decenas); case 9: return 'NOVECIENTOS ' + Decenas(decenas); } return Decenas(decenas); }
        function Seccion(num, divisor, strSingular, strPlural) { var cientos = Math.floor(num / divisor); var resto = num - (cientos * divisor); var letras = ''; if (cientos > 0) if (cientos > 1) letras = Centenas(cientos) + ' ' + strPlural; else letras = strSingular; if (resto > 0) letras += ''; return letras; }
        function Miles(num) { var divisor = 1000; var cientos = Math.floor(num / divisor); var resto = num - (cientos * divisor); var strMiles = Seccion(num, divisor, 'UN MIL', 'MIL'); var strCentenas = Centenas(resto); if(strMiles == '') return strCentenas; return strMiles + ' ' + strCentenas; }
        function Millones(num) { var divisor = 1000000; var cientos = Math.floor(num / divisor); var resto = num - (cientos * divisor); var strMillones = Seccion(num, divisor, 'UN MILLON', 'MILLONES'); var strMiles = Miles(resto); if(strMillones == '') return strMiles; return strMillones + ' ' + strMiles; }
        if(data.enteros == 0) return 'CERO CON ' + (data.centavos<10?'0':'') + data.centavos + '/100'; return Millones(data.enteros) + ' CON ' + (data.centavos<10?'0':'') + data.centavos + '/100';
    }

    var itemsHTML = (d.items || []).map(function(it, i) {
        var cant = parseFloat(it.cantidad || 0);
        var cu   = parseFloat(it.costo_unitario || 0);
        var imp  = parseFloat(it.importe || cant * cu || 0);
        var bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
        return '<tr style="background-color: ' + bg + ';">' +
            '<td style="padding:12px;text-align:center;border-bottom:1px solid #e2e8f0;color:#475569;">' + cant.toLocaleString('es-PE', {maximumFractionDigits:3}) + '</td>' +
            '<td style="padding:12px;text-transform:uppercase;border-bottom:1px solid #e2e8f0;font-weight:500;color:#0f172a;">' + (it.descripcion || it.inventario_id || '-') + '</td>' +
            '<td style="padding:12px;text-align:right;border-bottom:1px solid #e2e8f0;color:#475569;">' + cu.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</td>' +
            '<td style="padding:12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;">' + imp.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>' +
        '</tr>';
    }).join('');

    var txtMoneda = monSimbolo === 'USD' ? 'DÓLARES' : 'SOLES';
    var txtMonedaS = monSimbolo === 'USD' ? 'US$' : 'S/';
    var totalText = totalReal.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});

    var condPagoText = (d.condicion_pago || 'AL CONTADO').toUpperCase();
    if (d.condicion_pago && d.condicion_pago.toLowerCase() === 'a crédito') {
        condPagoText = 'CRÉDITO / ' + (d.dias_credito||0) + ' DÍAS';
    }

    var numDisplay = (d.id || '').replace(/^ENT-/, '');
    var tipoDocTitle = (d.tipo_orden || 'ORDEN DE COMPRA').toUpperCase();

    var obsBlock = '';
    if (d.observaciones && d.observaciones.trim() !== '') {
        obsBlock = '<!-- OBSERVACIONES -->' +
        '<div style="background:#fffbeb;border:1px solid #fef3c7;border-left:4px solid #f59e0b;border-radius:4px;padding:15px;font-size:12px;color:#92400e;">' +
            '<b style="display:block;margin-bottom:5px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#b45309;">Observaciones Adicionales</b>' +
            d.observaciones +
        '</div>';
    }

    return '' +
    '<div style="font-family:\'Inter\', Arial, sans-serif;width:100%;margin:0 auto;padding:40px;color:#0f172a;box-sizing:border-box;">' +

        '<!-- HEADER -->' +
        '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1e293b;padding-bottom:20px;margin-bottom:30px;">' +
            '<div>' +
                '<div style="font-size:36px;font-weight:900;color:#0f172a;letter-spacing:-1px;">' +
                    'AZKELL <span style="color:#2563eb;">FLEET</span>' +
                '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
                '<div style="font-size:24px;font-weight:800;color:#1e293b;letter-spacing:-0.5px;text-transform:uppercase;">' + tipoDocTitle + '</div>' +
                '<div style="font-size:16px;font-weight:700;color:#2563eb;margin-top:5px;">N° ' + numDisplay + '</div>' +
            '</div>' +
        '</div>' +

        '<!-- SUMMARY CARDS -->' +
        '<div style="display:flex;gap:15px;margin-bottom:25px;">' +
            '<div style="flex:0 0 30%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:15px;">' +
                '<div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px;margin-bottom:5px;">Fecha de Emisión</div>' +
                '<div style="font-size:14px;font-weight:700;color:#0f172a;">' + fecha.split('-').reverse().join('/') + '</div>' +
            '</div>' +
            '<div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:15px;">' +
                '<div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px;margin-bottom:5px;">Proveedor</div>' +
                '<div style="font-size:14px;font-weight:700;color:#0f172a;text-transform:uppercase;">' + (d.proveedor_nombre || '-') + '</div>' +
            '</div>' +
        '</div>' +

        '<!-- ORDER DETAILS -->' +
        '<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:30px;overflow:hidden;">' +
            '<div style="background:#f1f5f9;padding:10px 15px;font-size:12px;font-weight:700;color:#334155;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:0.5px;">Detalles de la Orden</div>' +
            '<div style="display:flex;flex-wrap:wrap;padding:15px;">' +
                '<div style="width:50%;margin-bottom:12px;">' +
                    '<span style="font-size:11px;color:#64748b;display:block;margin-bottom:2px;">TIPO DE ORDEN</span>' +
                    '<span style="font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;">' + (d.tipo_orden || 'ORDEN DE COMPRA') + '</span>' +
                '</div>' +
                '<div style="width:50%;margin-bottom:12px;">' +
                    '<span style="font-size:11px;color:#64748b;display:block;margin-bottom:2px;">CONDICIÓN DE PAGO</span>' +
                    '<span style="font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;">' + condPagoText + '</span>' +
                '</div>' +
                '<div style="width:50%;margin-bottom:12px;">' +
                    '<span style="font-size:11px;color:#64748b;display:block;margin-bottom:2px;">MONEDA</span>' +
                    '<span style="font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;">' + txtMoneda + (d.moneda === "USD" ? " (T/C: " + parseFloat(d.tipo_cambio||3.4).toFixed(3) + ")" : "") + '</span>' +
                '</div>' +
                '<div style="width:50%;margin-bottom:12px;">' +
                    '<span style="font-size:11px;color:#64748b;display:block;margin-bottom:2px;">PLACA / VEHÍCULO</span>' +
                    '<span style="font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;">' + (d.placa || 'N/A') + '</span>' +
                '</div>' +
                '<div style="width:100%;margin-bottom:0;">' +
                    '<span style="font-size:11px;color:#64748b;display:block;margin-bottom:2px;">MOTIVO</span>' +
                    '<span style="font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;">' + (d.motivo_entrada || 'SIN ESPECIFICAR') + '</span>' +
                '</div>' +
            '</div>' +
        '</div>' +

        '<!-- TABLE -->' +
        '<div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">' +
            '<table style="width:100%;font-size:12px;border-collapse:collapse;">' +
                '<thead>' +
                    '<tr style="background:#1e293b;color:#ffffff;">' +
                        '<th style="padding:12px;text-align:center;width:60px;font-weight:600;letter-spacing:0.5px;">CANT</th>' +
                        '<th style="padding:12px;text-align:left;font-weight:600;letter-spacing:0.5px;">DESCRIPCIÓN</th>' +
                        '<th style="padding:12px;text-align:right;width:100px;font-weight:600;letter-spacing:0.5px;">P. UNIT</th>' +
                        '<th style="padding:12px;text-align:right;width:120px;font-weight:600;letter-spacing:0.5px;">IMPORTE</th>' +
                    '</tr>' +
                '</thead>' +
                '<tbody>' +
                    itemsHTML +
                '</tbody>' +
            '</table>' +
            '<div style="background:#f8fafc;padding:15px;display:flex;justify-content:space-between;align-items:center;border-top:2px solid #e2e8f0;">' +
                '<div style="font-size:11px;color:#64748b;max-width:350px;">' +
                    '<b>SON:</b> ' + numeroALetras(totalReal) + ' ' + txtMoneda +
                '</div>' +
                '<div style="font-size:18px;color:#0f172a;">' +
                    '<span style="font-weight:600;font-size:14px;color:#64748b;margin-right:15px;">TOTAL GENERAL</span>' +
                    '<b>' + txtMonedaS + ' ' + totalText + '</b>' +
                '</div>' +
            '</div>' +
        '</div>' +

        obsBlock +

    '</div>';
};


window.generarComprobanteEntrada = function(id) {
    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) { alert('No se encontró la entrada ' + id); return; }

    var htmlContent = window._entGenerarHtmlPDF(d);
    
    var htmlCompleto = '<!DOCTYPE html><html><head><title>Orden de Compra ' + d.id + '</title>' +
        '<style>' +
        'body { background-color: #cbd5e1; margin: 0; padding: 40px 20px; font-family: "Inter", Arial, sans-serif; }' +
        '#btnPrint { position: fixed; top: 20px; right: 20px; background-color: #0f172a; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.3); z-index: 1000; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }' +
        '#btnPrint:hover { background-color: #1e293b; transform: translateY(-2px); box-shadow: 0 6px 12px rgba(0,0,0,0.4); }' +
        '.page-container { background: #fff; padding: 0; box-shadow: 0 10px 30px rgba(0,0,0,0.15); margin: 0 auto; width: 210mm; min-height: 297mm; box-sizing: border-box; }' +
        '@media print { ' +
        '  @page { size: A4 portrait; margin: 0; }' +
        '  body { background: none; padding: 0; margin: 0; }' +
        '  #btnPrint { display: none; }' +
        '  .page-container { box-shadow: none; width: 100%; height: auto; margin: 0; }' +
        '}' +
        '</style>' +
        '</head><body>' +
        '<button id="btnPrint" onclick="window.print()"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5 1a2 2 0 0 0-2 2v1h10V3a2 2 0 0 0-2-2H5zm6 8H5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1z"/><path d="M0 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v-2a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2H2a2 2 0 0 1-2-2V7zm2.5 1a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/></svg> Imprimir / Guardar PDF</button>' +
        '<div class="page-container">' + htmlContent + '</div>' +
        '</body></html>';

    var win = window.open('', '_blank');
    if (win) {
        win.document.open();
        win.document.write(htmlCompleto);
        win.document.close();
    } else {
        alert("Por favor habilite las ventanas emergentes (pop-ups) para ver el PDF.");
    }
};

window.previsualizarComprobanteEntrada = window.generarComprobanteEntrada;


window.exportarEntradasExcel = function() {
    var datos = window._entFiltrados || window._entData || [];
    if (!datos.length) { alert('No hay datos para exportar.'); return; }

    // Una fila por artículo (detalle completo)
    var cab = ['Código Entrada','Fecha','Proveedor','Nº Factura','Tipo de Orden','Condición Pago','Días Crédito','Moneda',
               'Código Artículo','Descripción Artículo','Cantidad','Costo Unit.','Importe','Total Entrada PEN','Observaciones'];
    var filas = [];
    datos.forEach(function(d) {
        var items = d.items || [];
        if (!items.length) {
            filas.push([d.id, d.fecha?String(d.fecha).split('T')[0]:'', d.proveedor_nombre||'',
                d.documento_referencia||'', d.tipo_orden||'Orden de compra', d.condicion_pago||'Al contado', d.condicion_pago === 'A crédito' ? (d.dias_credito||30) : '', d.moneda||'PEN',
                '','', 0, 0, 0, parseFloat(d.total_pen||0), d.observaciones||'']);
        } else {
            items.forEach(function(it, i) {
                filas.push([
                    i===0 ? d.id : '',
                    i===0 ? (d.fecha?String(d.fecha).split('T')[0]:'') : '',
                    i===0 ? (d.proveedor_nombre||'') : '',
                    i===0 ? (d.documento_referencia||'') : '',
                    i===0 ? (d.tipo_orden||'Orden de compra') : '',
                    i===0 ? (d.condicion_pago||'Al contado') : '',
                    i===0 ? (d.condicion_pago === 'A crédito' ? (d.dias_credito||30) : '') : '',
                    d.moneda||'PEN',
                    it.inventario_id||'',
                    it.descripcion||'',
                    parseFloat(it.cantidad||0),
                    parseFloat(it.costo_unitario||0),
                    parseFloat(it.importe||0),
                    i===0 ? parseFloat(d.total_pen||0) : '',
                    i===0 ? (d.observaciones||'') : ''
                ]);
            });
        }
    });

    var ws = XLSX.utils.aoa_to_sheet([cab].concat(filas));
    ws['!cols'] = [12,12,22,18,8,14,28,10,12,12,14,24].map(function(w){return{wch:w};});
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Entradas');
    XLSX.writeFile(wb, 'Entradas_Almacen.xlsx');
};

window.descargarPlantillaEntradas = function() {
    var wsData = [
        ['fecha','proveedor_nombre','documento_referencia','inventario_id','descripcion','cantidad','costo_unitario','moneda'],
        ['2025-01-15','PROVEEDOR EJEMPLO','FACTURA F001-12345','INV-0001','FILTRO ACEITE MOTOR','5','45.00','PEN'],
        ['2025-01-15','PROVEEDOR EJEMPLO','FACTURA F001-12345','INV-0002','ACEITE MOTOR 15W40','20','12.50','PEN']
    ];
    var ws = XLSX.utils.aoa_to_sheet(wsData);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, 'Plantilla_Entradas.xlsx');
};

window.importarExcelEntradas = function(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var rawJson = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rawJson.length) { alert('Archivo sin datos.'); return; }

        // Agrupar por fecha+proveedor+documento (una entrada por grupo)
        var grupos = {};
        rawJson.forEach(function(row) {
            var norm = {};
            Object.keys(row).forEach(function(k) { norm[k.toLowerCase().trim()] = row[k]; });
            var key = (norm['fecha']||'')+'|'+(norm['proveedor_nombre']||norm['proveedor']||'')+'|'+(norm['documento_referencia']||norm['doc. referencia']||'');
            if (!grupos[key]) grupos[key] = { fecha: norm['fecha']||new Date().toISOString().split('T')[0],
                proveedor_nombre: norm['proveedor_nombre']||norm['proveedor']||null,
                documento_referencia: norm['documento_referencia']||norm['doc. referencia']||null,
                moneda: (norm['moneda']||'PEN').toUpperCase(), items: [] };
            grupos[key].items.push({
                inventario_id: norm['inventario_id']||norm['codigo']||null,
                descripcion: norm['descripcion']||'',
                cantidad: parseFloat(norm['cantidad'])||0,
                costo_unitario: parseFloat(norm['costo_unitario']||norm['costo'])||0,
                moneda: (norm['moneda']||'PEN').toUpperCase(),
                importe: (parseFloat(norm['cantidad'])||0) * (parseFloat(norm['costo_unitario']||norm['costo'])||0)
            });
        });

        var entradas = Object.values(grupos).filter(function(e) { return e.items.length > 0; });
        if (!confirm('Se crearán '+entradas.length+' entradas con '+rawJson.length+' líneas totales. ¿Continuar?')) { event.target.value=''; return; }

        document.body.style.cursor='wait';
        var promises = entradas.map(function(ent) {
            return fetch('/api/almacen/entradas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ent)}).then(function(r){return r.json();});
        });
        Promise.allSettled(promises).then(function(res) {
            document.body.style.cursor='default';
            event.target.value='';
            var ok = res.filter(function(r){return r.status==='fulfilled';}).length;
            var err = res.filter(function(r){return r.status==='rejected';}).length;
            alert('✅ Importadas: '+ok+' entradas.'+(err?' ❌ Errores: '+err:''));
            window.cargarEntradas();
        });
    };
    reader.readAsArrayBuffer(file);
};

// ── KPI Row ───────────────────────────────────────────────────────
window._entRenderKPIs = function(data) {
    var el = document.getElementById('ent-kpi-row');
    if (!el) return;
    var total = data.length;
    var hoy = new Date();
    var mesActual = hoy.getFullYear() + '-' + String(hoy.getMonth()+1).padStart(2,'0');
    var esteMes = data.filter(function(d) {
        return (d.fecha || '').slice(0, 7) === mesActual;
    }).length;
    var totalPEN = data.reduce(function(s, d) { return s + parseFloat(d.total_pen || 0); }, 0);
    var card = 'flex:0 0 auto;min-width:130px;display:flex;justify-content:space-between;align-items:center;' +
               'padding:.85rem 1rem;border-radius:18px;border:1.5px solid;gap:.6rem;';
    var lbl  = 'font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.2rem;';
    var num  = 'font-size:1.6rem;font-weight:900;line-height:1;';
    var ico  = 'width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;';
    el.innerHTML =
        '<div style="' + card + 'background:var(--surface,#fff);border-color:var(--border,#e2e8f0);">' +
          '<div><div style="' + lbl + 'color:var(--subtext,#64748b);">Total Entradas</div><div style="' + num + 'color:var(--text,#0f172a);">' + total + '</div></div>' +
          '<div style="' + ico + 'background:#dcfce7;color:#16a34a;"><i class="bi bi-arrow-down-circle-fill" style="font-size:1.2rem;"></i></div>' +
        '</div>' +
        '<div style="' + card + 'background:#1e293b;border-color:#1e293b;">' +
          '<div><div style="' + lbl + 'color:#94a3b8;">Este Mes</div><div style="' + num + 'color:#fff;">' + esteMes + '</div></div>' +
          '<div style="' + ico + 'background:rgba(255,255,255,.12);color:#fff;"><i class="bi bi-calendar-check" style="font-size:1.2rem;"></i></div>' +
        '</div>' +
        '<div style="' + card + 'background:#fffbeb;border-color:#fde68a;">' +
          '<div><div style="' + lbl + 'color:#92400e;">Valor Total S/</div>' +
          '<div style="' + num + 'color:#d97706;font-size:1.25rem;">S/ ' +
          totalPEN.toLocaleString('es-PE', {minimumFractionDigits:0, maximumFractionDigits:0}) + '</div></div>' +
          '<div style="' + ico + 'background:#fef3c7;color:#d97706;"><i class="bi bi-coin" style="font-size:1.2rem;"></i></div>' +
        '</div>';
};

window._entToggleTipoOrden = function() { var tipo = document.getElementById('ent-f-tipo-orden').value; var elPlaca = document.getElementById('ent-placa-container'); var elOt = document.getElementById('ent-ot-container'); if (!elPlaca || !elOt) return; if (tipo.toLowerCase() === 'orden de servicio') { elPlaca.style.display = 'none'; elOt.style.display = 'block'; } else { elPlaca.style.display = 'block'; elOt.style.display = 'none'; } };

window._entSyncServiceCost = function(idx, val) {
    var v = parseFloat(val) || 0;
    var mode = window._entIgvMode || 'incluido';
    var pu = v, vu = v;
    if (mode === 'mas_igv') {
        pu = v * 1.18;
        vu = v;
    } else if (mode === 'sin_igv') {
        pu = v;
        vu = v;
    } else {
        pu = v;
        vu = v / 1.18;
    }
    var puEl = document.querySelector('.ent-item-pu[data-idx="'+idx+'"]');
    var vuEl = document.querySelector('.ent-item-vu[data-idx="'+idx+'"]');
    var igvEl = document.querySelector('.ent-item-igv[data-idx="'+idx+'"]');
    if (puEl) puEl.value = pu.toFixed(4);
    if (vuEl) vuEl.value = vu.toFixed(4);
    if (igvEl) igvEl.value = (pu - vu).toFixed(2);
    window._entCalcTotales();
};
