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
window._entDetalleId = window._entDetalleId || null;
window._entIgvMode   = window._entIgvMode   || 'sin_igv';
var _ENT_POR_PAG = 20;

window.init_entradas = function() {
    window._entDetalleId = null;
    window._entPagActual = 1;
    window.cargarEntradas();
    window._entCargarProveedores();
    window._entCargarConfig();
    window._entMobileInit();
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
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';
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
            if (t) t.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-danger">Error: '+err.message+'</td></tr>';
        });
};

window._entOnMonedaChange = function() {
    var moneda = (document.getElementById('ent-f-moneda') || {}).value;
    var tcRow = document.getElementById('ent-tc-row');
    if (tcRow) tcRow.style.display = moneda === 'USD' ? 'block' : 'none';
    window._entActualizarTotal();
};

window._entCargarConfig = function() {
    fetch('/api/almacen/configuracion')
        .then(function(r) { return r.json(); })
        .then(function(cfg) {
            window._entTC = parseFloat(cfg.tipo_cambio) || 3.70;
            var tcEl = document.getElementById('ent-f-tc');
            if (tcEl) tcEl.value = window._entTC.toFixed(3);
        }).catch(function() {});
};

window._entCargarProveedores = function() {
    fetch('/api/almacen/proveedores')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var items = data.map(function(p) {
                return {
                    value: p.id,
                    label: p.nombre + (p.numero_documento ? ' (' + p.numero_documento + ')' : '')
                };
            });
            window._cbInit('ent-f-proveedor', items, 'Buscar proveedor…');
        }).catch(function() {});
    var fechaEl = document.getElementById('ent-f-fecha');
    if (fechaEl && !fechaEl.value) fechaEl.value = new Date().toISOString().split('T')[0];
};

window._entActualizarTC = function() {
    var moneda = (document.getElementById('ent-f-moneda') || {}).value || 'PEN';
    var mon = moneda === 'USD' ? '$' : 'S/';
    var el = document.getElementById('ent-total-display');
    if (el) { var old = el.textContent.replace(/^[S\$\/\s\.]+/,''); el.textContent = mon + ' ' + (old || '0.00'); }
};

window._entSetIgvMode = function(mode) {
    window._entIgvMode = mode;
    var cfg = {
        'sin_igv': 'ent-igv-btn-sin',
        'incluido': 'ent-igv-btn-inc',
        'mas_igv':  'ent-igv-btn-mas'
    };
    Object.keys(cfg).forEach(function(m) {
        var btn = document.getElementById(cfg[m]);
        if (!btn) return;
        if (m === mode) {
            btn.style.background   = '#16a34a';
            btn.style.color        = '#fff';
            btn.style.borderColor  = '#16a34a';
        } else {
            btn.style.background   = '#f1f5f9';
            btn.style.color        = '#64748b';
            btn.style.borderColor  = '#e2e8f0';
        }
    });
    document.querySelectorAll('.ent-item-cant').forEach(function(el) {
        window._entCalcImporte(parseInt(el.dataset.idx));
    });
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
    card.innerHTML =
        // Fila 1: búsqueda artículo + botón QR + botón eliminar
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
            '<button type="button" onclick="window._entAbrirQR(' + idx + ')"' +
                ' title="Escanear QR"' +
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
        // Fila 2: Cant / Costo / Importe
        '<div style="display:grid;grid-template-columns:80px 1fr 1fr;gap:8px;">' +
            '<div>' +
                '<div class="ent-field-label">Cant.</div>' +
                '<input type="number" class="ent-input-sm ent-item-cant" data-idx="' + idx + '"' +
                    ' value="1" min="0.001" step="0.001" oninput="window._entCalcImporte(' + idx + ')">' +
            '</div>' +
            '<div>' +
                '<div class="ent-field-label">Costo Unit.</div>' +
                '<input type="number" class="ent-input-sm ent-item-cu" data-idx="' + idx + '"' +
                    ' value="0" min="0" step="0.0001" oninput="window._entCalcImporte(' + idx + ')">' +
            '</div>' +
            '<div>' +
                '<div class="ent-field-label">Importe</div>' +
                '<input type="number" class="ent-input-sm ent-item-imp" data-idx="' + idx + '"' +
                    ' value="0" readonly style="background:#f1f5f9;color:#64748b;">' +
            '</div>' +
        '</div>' +
        // Fila 3: alerta de precio (oculta por defecto)
        '<div id="ent-price-alert-' + idx + '" style="display:none;margin-top:6px;align-items:center;gap:.4rem;"></div>';
    container.appendChild(card);

    if (!window._entInvData.length) {
        window._entCargarInv(function() { window._entInitCbItem(idx, cbId); });
    } else {
        window._entInitCbItem(idx, cbId);
    }
};

window._entInitCbItem = function(idx, cbId) {
    var items = (window._entInvData || []).map(function(d) {
        return { value: d.id, label: d.id + ' — ' + (d.descripcion || '') };
    });
    window._cbInit(cbId, items, 'Buscar artículo…');
    window._cbOnSelect(cbId, function(val) {
        var item = (window._entInvData || []).find(function(d) { return d.id === val; });
        if (item) {
            var oldCost = parseFloat(item.costo_referencial || 0);
            var cuEl = document.querySelector('.ent-item-cu[data-idx="' + idx + '"]');
            if (cuEl) {
                cuEl.value = oldCost.toFixed(2);
                cuEl.dataset.oldCost = oldCost;
                window._entCalcImporte(idx);
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

window._entCalcImporte = function(idx) {
    var cant  = parseFloat((document.querySelector('.ent-item-cant[data-idx="'+idx+'"]') || {}).value) || 0;
    var cuEl  = document.querySelector('.ent-item-cu[data-idx="'+idx+'"]');
    var cu    = parseFloat((cuEl || {}).value) || 0;
    var impEl = document.querySelector('.ent-item-imp[data-idx="'+idx+'"]');
    var mode  = window._entIgvMode || 'sin_igv';
    var importe;
    if (mode === 'mas_igv') {
        importe = cant * cu * 1.18;
    } else {
        importe = cant * cu;
    }
    if (impEl) impEl.value = importe.toFixed(2);

    // Alerta comparación de precio
    var alertEl = document.getElementById('ent-price-alert-' + idx);
    var card    = document.getElementById('ent-item-' + idx);
    var oldCost = parseFloat((cuEl || {}).dataset && (cuEl || {}).dataset.oldCost);
    if (alertEl && !isNaN(oldCost) && oldCost > 0 && Math.abs(cu - oldCost) > 0.001) {
        var diff = cu - oldCost;
        var pct  = (diff / oldCost * 100).toFixed(1);
        var isUp = diff > 0;
        alertEl.style.display   = 'flex';
        alertEl.style.alignItems = 'center';
        alertEl.style.gap       = '.4rem';
        alertEl.innerHTML =
            '<span style="display:inline-flex;align-items:center;gap:.3rem;padding:.25rem .65rem;' +
            'border-radius:99px;font-size:.65rem;font-weight:800;' +
            'background:' + (isUp ? '#fee2e2;color:#ef4444' : '#dcfce7;color:#16a34a') + ';">' +
            '<i class="bi bi-arrow-' + (isUp ? 'up' : 'down') + '"></i>' +
            (isUp ? '¡Sube Precio!' : 'Baja Precio') + '</span>' +
            '<span style="font-size:.65rem;color:#94a3b8;font-weight:600;">' +
            'Ref: S/ ' + oldCost.toFixed(2) + ' → ' + (isUp ? '+' : '') + pct + '%</span>';
        if (card) {
            card.classList.remove('price-up', 'price-down');
            card.classList.add(isUp ? 'price-up' : 'price-down');
        }
    } else if (alertEl) {
        alertEl.style.display = 'none';
        if (card) card.classList.remove('price-up', 'price-down');
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
    var imps = document.querySelectorAll('.ent-item-imp');
    var total = 0;
    imps.forEach(function(el) { total += parseFloat(el.value) || 0; });
    var moneda = (document.getElementById('ent-f-moneda') || {}).value;
    var mode   = window._entIgvMode || 'sin_igv';
    var mon    = moneda === 'USD' ? '$' : 'S/';
    var el     = document.getElementById('ent-total-display');
    if (!el) return;

    // Mostrar desglose IGV
    var desglose = document.getElementById('ent-igv-desglose');
    if (mode !== 'sin_igv') {
        var gravado = total / 1.18;
        var igv     = total - gravado;
        var gravEl  = document.getElementById('ent-total-gravado');
        var igvEl   = document.getElementById('ent-total-igv');
        if (gravEl) gravEl.textContent = mon + ' ' + gravado.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
        if (igvEl)  igvEl.textContent  = mon + ' ' + igv.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
        if (desglose) desglose.style.display = 'block';
    } else {
        if (desglose) desglose.style.display = 'none';
    }

    if (moneda === 'USD') {
        var tc = parseFloat((document.getElementById('ent-f-tc')||{}).value) || window._entTC || 3.70;
        var pen = total * tc;
        el.innerHTML = '<span style="font-weight:900;">$ ' +
            total.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) +
            '</span><span style="font-size:.75rem;color:var(--subtext);margin-left:.4rem;">\u2248 S/ ' +
            pen.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span>';
    } else {
        el.textContent = 'S/ ' + total.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
    }
};

window._entActualizarTC = function() {
    var moneda = (document.getElementById('ent-f-moneda') || {}).value || 'PEN';
    var mon = moneda === 'USD' ? '$' : 'S/';
    var el = document.getElementById('ent-total-display');
    if (el) { var old = el.textContent.replace(/^[S\$\/\s\.]+/,''); el.textContent = mon + ' ' + (old || '0.00'); }
};

window._entSetIgvMode = function(mode) {
    window._entIgvMode = mode;
    var cfg = { 'sin_igv': 'ent-igv-btn-sin', 'incluido': 'ent-igv-btn-inc', 'mas_igv': 'ent-igv-btn-mas' };
    Object.keys(cfg).forEach(function(m) {
        var btn = document.getElementById(cfg[m]);
        if (!btn) return;
        if (m === mode) { btn.style.background = '#16a34a'; btn.style.color = '#fff'; btn.style.borderColor = '#16a34a'; }
        else { btn.style.background = '#f1f5f9'; btn.style.color = '#64748b'; btn.style.borderColor = '#e2e8f0'; }
    });
    document.querySelectorAll('.ent-item-cant').forEach(function(el) {
        window._entCalcImporte(parseInt(el.dataset.idx));
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

    if (!fecha)  { alert('Falta la fecha.'); return; }
    if (!provId) { alert('Selecciona un proveedor.'); return; }

    var invIds = document.querySelectorAll('.ent-item-inv-id');
    var descs  = document.querySelectorAll('.ent-item-desc');
    var cants  = document.querySelectorAll('.ent-item-cant');
    var cus    = document.querySelectorAll('.ent-item-cu');
    var imps   = document.querySelectorAll('.ent-item-imp');
    var items  = [];
    for (var i = 0; i < cants.length; i++) {
        var invId = invIds[i] ? invIds[i].value : '';
        var desc  = descs[i]  ? descs[i].value  : '';
        if (!invId && !desc) continue;
        var cant = parseFloat(cants[i].value) || 0;
        var cu   = parseFloat(cus[i].value)   || 0;
        var imp  = parseFloat(imps[i].value)  || cant * cu;
        if (cant <= 0) { alert('Cantidad inválida en fila '+(i+1)); return; }
        // Guardar costo final (con IGV) para que Mantenimiento vea el costo real pagado
        var cuBase = cu;
        if (window._entIgvMode === 'mas_igv') cuBase = parseFloat((cu * 1.18).toFixed(4));
        items.push({ inventario_id: invId||null, descripcion: desc, cantidad: cant, costo_unitario: cuBase, moneda: moneda, importe: imp });
    }
    if (!items.length) { alert('Agrega al menos un artículo.'); return; }

    var payload = { fecha, proveedor_id: provId||null, proveedor_nombre: provNombre||null,
        documento_referencia: docRef||null, moneda,
        tipo_igv: window._entIgvMode || 'sin_igv',
        tipo_cambio: moneda === 'USD'
            ? (parseFloat((document.getElementById('ent-f-tc')||{}).value) || window._entTC || 3.70)
            : 1,
        observaciones: obs,
        creado_por: localStorage.getItem('fleet_user')||'', items };

    fetch('/api/almacen/entradas', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(r) {
            window._entCerrarModal();
            alert('✅ Entrada registrada: '+r.id);
            window.cargarEntradas();
        })
        .catch(function(err) { alert('Error: '+err.message); });
};

// ── Abrir panel ───────────────────────────────────────────────────
window.abrirModalEntrada = function() {
    var cards = document.getElementById('ent-items-cards');
    if (cards) cards.innerHTML = '';
    window._entItemIdx = 0;
    var totalEl = document.getElementById('ent-total-display');
    if (totalEl) totalEl.textContent = 'S/ 0.00';

    ['ent-f-doc-ref','ent-f-obs'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
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

    window._entSetIgvMode('sin_igv');

    var panel = document.getElementById('modal-entrada');
    var bd    = document.getElementById('ent-entrada-bd');
    if (panel) panel.classList.add('open');
    if (bd)    bd.style.display = 'block';
};

// ── Cerrar panel ──────────────────────────────────────────────────
window._entCerrarModal = function() {
    if (window._entQrScanner) window._entCerrarQR();
    var panel = document.getElementById('modal-entrada');
    var bd    = document.getElementById('ent-entrada-bd');
    if (panel) panel.classList.remove('open');
    if (bd)    bd.style.display = 'none';
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

    var cont = document.getElementById('ent-contador');
    if (cont) cont.textContent = total + ' registro' + (total !== 1 ? 's' : '');

    var tbody = document.getElementById('tbody-entradas');
    if (!tbody) return;
    if (!pagina.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="td-placeholder"><i class="bi bi-inbox" style="font-size:1.5rem;opacity:0.3"></i><br>Sin entradas encontradas</td></tr>';
    } else {
        tbody.innerHTML = pagina.map(function(d) {
            var fecha = d.fecha ? String(d.fecha).split('T')[0] : '—';
            var tp = parseFloat(d.total_pen || 0);
            var totalFmt = 'S/ ' + tp.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            var nitems = (d.items || []).length;
            var isActive = d.id === window._entDetalleId;
            return '<tr' + (isActive ? ' class="ent-row-active"' : '') + ' onclick="window._entAbrirDetalle(\'' + _entEsc(d.id) + '\')" style="cursor:pointer;">' +
                '<td><span class="badge bg-secondary fw-normal" style="font-size:0.72rem;">' + _entEsc(d.id || '') + '</span></td>' +
                '<td style="font-size:0.82rem;">' + fecha + '</td>' +
                '<td>' + (d.proveedor_nombre ? '<span style="font-size:0.8rem;">' + _entEsc(d.proveedor_nombre) + '</span>' : '<span class="text-muted small">—</span>') + '</td>' +
                '<td><small class="text-muted">' + _entEsc(d.documento_referencia || '—') + '</small></td>' +
                '<td class="text-center"><span class="badge bg-secondary fw-normal" style="font-size:0.68rem;">' + nitems + ' art.</span></td>' +
                '<td class="text-end fw-semibold" style="color:#16a34a;">' + totalFmt + '</td>' +
                '<td class="text-center" style="white-space:nowrap;" onclick="event.stopPropagation();">' +
                    '<div class="d-flex gap-1 justify-content-center">' +
                        '<button class="btn btn-xs btn-outline-secondary" onclick="window.previsualizarComprobanteEntrada(\'' + _entEsc(d.id) + '\')" title="Previsualizar"><i class="bi bi-eye"></i></button>' +
                        '<button class="btn btn-xs btn-outline-primary" onclick="window.generarComprobanteEntrada(\'' + _entEsc(d.id) + '\')" title="Descargar PDF"><i class="bi bi-file-earmark-pdf"></i></button>' +
                        (canDelete ? '<button class="btn btn-xs btn-outline-danger" onclick="window.eliminarEntrada(\'' + _entEsc(d.id) + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>' : '') +
                    '</div>' +
                '</td></tr>';
        }).join('');
    }

    var paginEl = document.getElementById('ent-paginacion');
    if (paginEl) {
        if (totalPag <= 1) { paginEl.innerHTML = ''; return; }
        paginEl.innerHTML = '<button class="btn btn-xs btn-outline-secondary" ' + (pag <= 1 ? 'disabled' : '') + ' onclick="window._entIrPag(' + (pag - 1) + ')"><i class="bi bi-chevron-left"></i></button>' +
            '<span class="small text-muted mx-2">Pág. ' + pag + ' / ' + totalPag + '</span>' +
            '<button class="btn btn-xs btn-outline-secondary" ' + (pag >= totalPag ? 'disabled' : '') + ' onclick="window._entIrPag(' + (pag + 1) + ')"><i class="bi bi-chevron-right"></i></button>';
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
    html += '<div class="ent-field"><div class="ent-field-lbl">Proveedor</div><div class="ent-field-val">' + _entEsc(d.proveedor_nombre || '—') + '</div></div>';
    html += '<div class="ent-field"><div class="ent-field-lbl">Doc. Referencia</div><div class="ent-field-val">' + _entEsc(d.documento_referencia || '—') + '</div></div>';
    html += '<div class="ent-field"><div class="ent-field-lbl">Moneda</div><div class="ent-field-val">' + monSim + (d.moneda === 'USD' && d.tipo_cambio ? ' (T/C: ' + parseFloat(d.tipo_cambio).toFixed(3) + ')' : '') + '</div></div>';
    html += '<div class="ent-field"><div class="ent-field-lbl">Total PEN</div><div class="ent-field-val"><span style="font-size:1.05rem; color:#16a34a; font-weight:800;">S/ ' + tp.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span></div></div>';
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
            '<button class="btn btn-sm btn-outline-secondary flex-fill" onclick="window.previsualizarComprobanteEntrada(\'' + _entEsc(id) + '\')">' +
            '<i class="bi bi-eye me-1"></i>Ver</button>' +
            '<button class="btn btn-sm btn-outline-primary flex-fill" onclick="window.generarComprobanteEntrada(\'' + _entEsc(id) + '\')">' +
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

// ── Comprobante PDF ───────────────────────────────────────────────
window.generarComprobanteEntrada = function(id) {
    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) { alert('No se encontró la entrada ' + id); return; }

    var fecha = d.fecha ? String(d.fecha).split('T')[0] : '—';
    var totalPen = parseFloat(d.total_pen || 0);
    var monSimbolo = d.moneda === 'USD' ? 'USD' : 'PEN';

    var itemsHTML = (d.items || []).map(function(it, i) {
        var cant = parseFloat(it.cantidad || 0);
        var cu   = parseFloat(it.costo_unitario || 0);
        var imp  = parseFloat(it.importe || cant * cu || 0);
        var bgRow = i % 2 === 0 ? '#f9fafb' : '#ffffff';
        return '<tr style="background:' + bgRow + '">' +
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">' + (it.descripcion || it.inventario_id || '—') + '</td>' +
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center">' + cant.toLocaleString('es-PE', {maximumFractionDigits:3}) + '</td>' +
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right">' + monSimbolo + ' ' + cu.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</td>' +
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:600">' + monSimbolo + ' ' + imp.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>' +
        '</tr>';
    }).join('');

    var html = '' +
    '<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:32px;color:#1e293b">' +

        // Encabezado
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #2563eb">' +
            '<div>' +
                '<div style="font-size:22px;font-weight:700;color:#2563eb;letter-spacing:-0.5px">AZKELL FLEET</div>' +
                '<div style="font-size:11px;color:#64748b;margin-top:2px">Sistema de Gestión de Flotas</div>' +
            '</div>' +
            '<div style="text-align:right">' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b">COMPROBANTE DE ENTRADA</div>' +
                '<div style="font-size:13px;color:#2563eb;font-weight:600;margin-top:4px">' + id + '</div>' +
                '<div style="font-size:11px;color:#64748b;margin-top:2px">Fecha: ' + fecha + '</div>' +
            '</div>' +
        '</div>' +

        // Datos proveedor
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding:14px 16px;background:#f1f5f9;border-radius:8px">' +
            '<div>' +
                '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Proveedor</div>' +
                '<div style="font-size:13px;font-weight:600">' + (d.proveedor_nombre || '—') + '</div>' +
            '</div>' +
            '<div>' +
                '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Doc. Referencia</div>' +
                '<div style="font-size:13px;font-weight:600">' + (d.documento_referencia || '—') + '</div>' +
            '</div>' +
            '<div>' +
                '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Moneda</div>' +
                '<div style="font-size:13px;font-weight:600">' + monSimbolo + (d.moneda === 'USD' && d.tipo_cambio ? ' (T/C: ' + parseFloat(d.tipo_cambio).toFixed(3) + ')' : '') + '</div>' +
            '</div>' +
            '<div>' +
                '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Registrado por</div>' +
                '<div style="font-size:13px;font-weight:600">' + (d.creado_por || '—') + '</div>' +
            '</div>' +
        '</div>' +

        // Tabla de artículos
        '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">' +
            '<thead>' +
                '<tr style="background:#2563eb;color:#fff">' +
                    '<th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Artículo / Descripción</th>' +
                    '<th style="padding:9px 10px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Cantidad</th>' +
                    '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Costo Unit.</th>' +
                    '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Importe</th>' +
                '</tr>' +
            '</thead>' +
            '<tbody>' + itemsHTML + '</tbody>' +
        '</table>' +

        // Total
        '<div style="display:flex;justify-content:flex-end;margin-bottom:20px">' +
            '<div style="min-width:220px">' +
                '<div style="display:flex;justify-content:space-between;padding:6px 12px;font-size:12px;color:#64748b">' +
                    '<span>Subtotal (' + (d.items||[]).length + ' art.)</span>' +
                    '<span>' + monSimbolo + ' ' + totalPen.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;padding:10px 12px;background:#2563eb;color:#fff;border-radius:6px;font-size:14px;font-weight:700">' +
                    '<span>TOTAL PEN</span>' +
                    '<span>S/ ' + totalPen.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span>' +
                '</div>' +
            '</div>' +
        '</div>' +

        // Observaciones
        (d.observaciones ? '<div style="padding:10px 14px;background:#fef9c3;border-radius:6px;border-left:3px solid #eab308;font-size:12px;margin-bottom:20px"><span style="font-weight:600;color:#854d0e">Observaciones: </span>' + d.observaciones + '</div>' : '') +

        // Footer
        '<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8">' +
            '<span>Generado: ' + new Date().toLocaleString('es-PE') + '</span>' +
            '<span>Azkell Fleet — Sistema de Gestión de Flotas</span>' +
        '</div>' +

    '</div>';

    var opt = {
        margin: [8, 8, 8, 8],
        filename: 'Entrada_' + id + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:700px';
    document.body.appendChild(wrapper);

    html2pdf().set(opt).from(wrapper.firstChild).save().then(function() {
        document.body.removeChild(wrapper);
    });
};

// ── Previsualizar comprobante (nueva pestaña) ─────────────────────
window.previsualizarComprobanteEntrada = function(id) {
    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) { alert('No se encontró la entrada ' + id); return; }
    var opt = { margin:[8,8,8,8], filename:'Entrada_'+id+'.pdf',
        image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2,useCORS:true},
        jsPDF:{unit:'mm',format:'a4',orientation:'portrait'} };
    // Reutiliza la misma lógica de generarComprobanteEntrada pero abre en pestaña
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:700px';
    // Construir el mismo HTML del comprobante llamando a la función existente
    // Temporalmente redireccionamos .save() → .outputPdf('bloburl')
    var fecha = d.fecha ? String(d.fecha).split('T')[0] : '—';
    var totalPen = parseFloat(d.total_pen || 0);
    var monSimbolo = d.moneda === 'USD' ? 'USD' : 'PEN';
    var itemsHTML = (d.items || []).map(function(it, i) {
        var cant = parseFloat(it.cantidad || 0);
        var cu   = parseFloat(it.costo_unitario || 0);
        var imp  = parseFloat(it.importe || cant * cu || 0);
        var bgRow = i % 2 === 0 ? '#f9fafb' : '#ffffff';
        return '<tr style="background:'+bgRow+'">'+
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">'+(it.descripcion||it.inventario_id||'—')+'</td>'+
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center">'+cant.toLocaleString('es-PE',{maximumFractionDigits:3})+'</td>'+
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right">'+monSimbolo+' '+cu.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:4})+'</td>'+
            '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:600">'+monSimbolo+' '+imp.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})+'</td>'+
        '</tr>';
    }).join('');
    wrapper.innerHTML = '<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:32px;color:#1e293b">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #2563eb">'+
            '<div><div style="font-size:22px;font-weight:700;color:#2563eb">AZKELL FLEET</div><div style="font-size:11px;color:#64748b;margin-top:2px">Sistema de Gestión de Flotas</div></div>'+
            '<div style="text-align:right"><div style="font-size:18px;font-weight:700">COMPROBANTE DE ENTRADA</div>'+
            '<div style="font-size:13px;color:#2563eb;font-weight:600;margin-top:4px">'+id+'</div>'+
            '<div style="font-size:11px;color:#64748b;margin-top:2px">Fecha: '+fecha+'</div></div>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding:14px 16px;background:#f1f5f9;border-radius:8px">'+
            '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Proveedor</div><div style="font-size:13px;font-weight:600">'+(d.proveedor_nombre||'—')+'</div></div>'+
            '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Doc. Referencia</div><div style="font-size:13px;font-weight:600">'+(d.documento_referencia||'—')+'</div></div>'+
            '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Moneda</div><div style="font-size:13px;font-weight:600">'+monSimbolo+'</div></div>'+
            '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Registrado por</div><div style="font-size:13px;font-weight:600">'+(d.creado_por||'—')+'</div></div>'+
        '</div>'+
        '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">'+
            '<thead><tr style="background:#2563eb;color:#fff">'+
                '<th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase">Artículo</th>'+
                '<th style="padding:9px 10px;text-align:center;font-size:11px;text-transform:uppercase">Cantidad</th>'+
                '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase">Costo Unit.</th>'+
                '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase">Importe</th>'+
            '</tr></thead>'+
            '<tbody>'+itemsHTML+'</tbody>'+
        '</table>'+
        '<div style="display:flex;justify-content:flex-end;margin-bottom:20px">'+
            '<div style="min-width:220px">'+
                '<div style="display:flex;justify-content:space-between;padding:10px 12px;background:#2563eb;color:#fff;border-radius:6px;font-size:14px;font-weight:700">'+
                    '<span>TOTAL PEN</span><span>S/ '+totalPen.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})+'</span>'+
                '</div>'+
            '</div>'+
        '</div>'+
        (d.observaciones ? '<div style="padding:10px 14px;background:#fef9c3;border-radius:6px;border-left:3px solid #eab308;font-size:12px"><b>Obs.: </b>'+d.observaciones+'</div>' : '')+
    '</div>';
    document.body.appendChild(wrapper);
    html2pdf().set(opt).from(wrapper.firstChild).outputPdf('bloburl').then(function(url) {
        document.body.removeChild(wrapper);
        window.open(url, '_blank');
    });
};

// ── Export / Import Excel ─────────────────────────────────────────
window.exportarEntradasExcel = function() {
    var datos = window._entFiltrados || window._entData || [];
    if (!datos.length) { alert('No hay datos para exportar.'); return; }

    // Una fila por artículo (detalle completo)
    var cab = ['Código Entrada','Fecha','Proveedor','Doc. Referencia','Moneda',
               'Código Artículo','Descripción Artículo','Cantidad','Costo Unit.','Importe','Total Entrada PEN','Observaciones'];
    var filas = [];
    datos.forEach(function(d) {
        var items = d.items || [];
        if (!items.length) {
            filas.push([d.id, d.fecha?String(d.fecha).split('T')[0]:'', d.proveedor_nombre||'',
                d.documento_referencia||'', d.moneda||'PEN',
                '','', 0, 0, 0, parseFloat(d.total_pen||0), d.observaciones||'']);
        } else {
            items.forEach(function(it, i) {
                filas.push([
                    i===0 ? d.id : '',
                    i===0 ? (d.fecha?String(d.fecha).split('T')[0]:'') : '',
                    i===0 ? (d.proveedor_nombre||'') : '',
                    i===0 ? (d.documento_referencia||'') : '',
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
