// ================================================================
// Módulo Almacén OT (Req/Salidas) — Azkell Fleet
// Ruta SPA: mantenimiento/almacen-ot
// Entry point: window.init_almacen_ot()
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.aotData       = window.aotData       || [];
window.aotDatosFil   = window.aotDatosFil   || [];
window.aotTabActiva  = window.aotTabActiva  || 'pend';
window.aotDetalleId  = window.aotDetalleId  || null;
window._aotItemIdx   = window._aotItemIdx   || 0;
window._aotPlacas    = window._aotPlacas    || [];
window._aotConductores = window._aotConductores || [];
window._aotInvData   = window._aotInvData   || [];

// ── Entry point ──────────────────────────────────────────────────
window.init_almacen_ot = function() {
    aotSincronizarTabs();
    aotCargar();
    _aotCargarSelectores();
};

// ── Carga de datos ─────────────────────────────────────────────
window.aotCargar = function() {
    var tbody = document.getElementById('aot-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="td-placeholder"><div class="spinner-border spinner-border-sm text-secondary"></div></td></tr>';

    fetch('/api/ot-materiales')
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) {
            window.aotData = Array.isArray(data) ? data : [];
            aotActualizarBadges();
            aotRenderTabla();
        })
        .catch(function(err) {
            console.error('Error cargando almacén OT:', err);
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al cargar datos de almacén', 'danger');
            var tb = document.getElementById('aot-tbody');
            if (tb) tb.innerHTML = '<tr><td colspan="7" class="td-placeholder">Error al cargar datos</td></tr>';
        });
};

// ── Cargar selectores para el formulario ──────────────────────
function _aotCargarSelectores() {
    fetch('/api/conductores-lista')
        .then(function(r) { return r.json(); })
        .then(function(d) { window._aotConductores = d || []; })
        .catch(function() {});

    fetch('/api/placas-lista')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            window._aotPlacas = d || [];
            var dl = document.getElementById('aot-list-placas');
            if (dl) dl.innerHTML = (d || []).map(function(p) {
                return '<option value="' + aotEsc(p.placa) + '">';
            }).join('');
        })
        .catch(function() {});

    fetch('/api/almacen/inventario')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            window._aotInvData = d || [];
            var dl = document.getElementById('aot-inv-list');
            if (dl) dl.innerHTML = (d || []).map(function(a) {
                return '<option value="' + aotEsc(a.id + ' — ' + a.descripcion) + '">';
            }).join('');
        })
        .catch(function() {});

    var fechaEl = document.getElementById('aot-f-fecha');
    if (fechaEl && !fechaEl.value) fechaEl.value = new Date().toISOString().split('T')[0];
}

// ── Helpers ──────────────────────────────────────────────────
function aotEsc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function aotFmtMoney(val) {
    return 'S/.' + parseFloat(val || 0).toFixed(2);
}

function aotFmtDate(iso) {
    if (!iso) return '—';
    var s = typeof iso === 'string' ? iso.split('T')[0] : String(iso);
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return s || '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' });
}

function aotBadge(estado) {
    if (estado === 'Despachado') return '<span class="aot-badge badge-despachado">Despachado</span>';
    return '<span class="aot-badge badge-pendiente">Pendiente</span>';
}

// ── Badges de tabs ────────────────────────────────────────────
function aotActualizarBadges() {
    var pend = window.aotData.filter(function(m) { return m.estado !== 'Despachado'; }).length;
    var desp = window.aotData.filter(function(m) { return m.estado === 'Despachado'; }).length;
    var bp = document.getElementById('aot-badge-pend');
    var bd = document.getElementById('aot-badge-desp');
    if (bp) bp.textContent = pend;
    if (bd) bd.textContent = desp;
}

// ── Tabs ──────────────────────────────────────────────────────
window.aotCambiarTab = function(tab) {
    window.aotTabActiva = tab;
    aotSincronizarTabs();
    window.aotDetalleId = null;
    var panel = document.getElementById('aot-panel-detalle');
    if (panel) panel.classList.remove('open');
    aotRenderTabla();
};

function aotSincronizarTabs() {
    ['pend', 'desp'].forEach(function(t) {
        var el = document.getElementById('aot-tab-' + t);
        if (el) el.classList.toggle('active', t === window.aotTabActiva);
    });
}

// ── Filtrar ───────────────────────────────────────────────────
window.aotFiltrar = function() { aotRenderTabla(); };

function aotGetFiltros() {
    return {
        search: ((document.getElementById('aot-search') || {}).value || '').toLowerCase().trim(),
        ot:     ((document.getElementById('aot-fil-ot') || {}).value || '').trim().toLowerCase(),
        placa:  ((document.getElementById('aot-fil-placa') || {}).value || '').trim().toUpperCase(),
        mes:    ((document.getElementById('aot-fil-mes') || {}).value || '').trim(),
        desde:  ((document.getElementById('aot-fil-desde') || {}).value || '').trim(),
        hasta:  ((document.getElementById('aot-fil-hasta') || {}).value || '').trim(),
        estado: ((document.getElementById('aot-fil-estado') || {}).value || '').trim()
    };
}

// ── Render tabla ──────────────────────────────────────────────
window.aotRenderTabla = function() {
    var tbody = document.getElementById('aot-tbody');
    if (!tbody) return;

    var f = aotGetFiltros();

    var datos = window.aotData.filter(function(m) {
        if (!f.estado) {
            if (window.aotTabActiva === 'pend' && m.estado === 'Despachado') return false;
            if (window.aotTabActiva === 'desp' && m.estado !== 'Despachado') return false;
        } else {
            if (m.estado !== f.estado) return false;
        }
        if (f.ot && String(m.ticket_ot || '').toLowerCase().indexOf(f.ot) === -1) return false;
        if (f.placa && String(m.placa || '').toUpperCase().indexOf(f.placa) === -1) return false;
        if (f.mes) {
            var fechaStr = m.fecha ? String(m.fecha).split('T')[0] : '';
            if (!fechaStr.startsWith(f.mes)) return false;
        }
        if (f.desde || f.hasta) {
            var fechaStr2 = m.fecha ? String(m.fecha).split('T')[0] : '';
            if (f.desde && fechaStr2 < f.desde) return false;
            if (f.hasta && fechaStr2 > f.hasta) return false;
        }
        if (f.search) {
            var artDesc = (m.items || []).map(function(it) { return it.descripcion || ''; }).join(' ');
            var s = [m.id, m.ticket_ot, m.placa, m.responsable, artDesc].join(' ').toLowerCase();
            if (s.indexOf(f.search) === -1) return false;
        }
        return true;
    });

    window.aotDatosFil = datos;

    if (datos.length === 0) {
        var msg = window.aotTabActiva === 'pend' ? 'Sin solicitudes pendientes' : 'Sin salidas registradas';
        tbody.innerHTML = '<tr><td colspan="7" class="td-placeholder"><i class="bi bi-box" style="font-size:1.5rem; opacity:0.3"></i><br>' + msg + '</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    datos.forEach(function(m) {
        var artResumen = (m.items || []).map(function(it) { return aotEsc(it.descripcion || ''); }).filter(Boolean).join(', ') || '—';
        var nItems = (m.items || []).length;
        var tr = document.createElement('tr');
        if (m.id === window.aotDetalleId) tr.classList.add('aot-row-active');
        tr.innerHTML =
            '<td><span class="fw-bold" style="color:var(--primary,#5865F2);">' + aotEsc(m.id || '—') + '</span></td>'
            + '<td><strong>' + aotEsc(m.ticket_ot || '—') + '</strong></td>'
            + '<td>' + aotEsc(m.placa || '—') + '</td>'
            + '<td>' + aotEsc(m.responsable || '—') + '</td>'
            + '<td style="max-width:200px; font-size:0.79rem; white-space:normal;">'
                + artResumen
                + (nItems > 1 ? ' <span style="color:var(--subtext);font-size:0.72rem;">(' + nItems + ' art.)</span>' : '')
            + '</td>'
            + '<td><strong style="color:#16a34a;">' + aotFmtMoney(m.total_pen) + '</strong></td>'
            + '<td>' + aotBadge(m.estado) + '</td>';
        tr.onclick = (function(row) { return function() { aotAbrirDetalle(row); }; })(m);
        tbody.appendChild(tr);
    });
};

// ── Detalle lateral ───────────────────────────────────────────
function aotAbrirDetalle(m) {
    window.aotDetalleId = m.id;
    aotRenderTabla();

    var titulo = document.getElementById('aot-detalle-titulo');
    if (titulo) titulo.textContent = 'Solicitud ' + (m.id || '');

    var html = '';
    html += '<div style="font-size:1.2rem; font-weight:800; color:var(--text); margin-bottom:0.3rem;">' + aotEsc(m.id || '—') + '</div>';
    html += '<div style="font-size:0.83rem; color:var(--subtext); margin-bottom:1rem;">OT: <strong>' + aotEsc(m.ticket_ot || '—') + '</strong></div>';

    html += '<div class="aot-sec">';
    html += '<div class="aot-sec-hd">Cabecera</div>';
    html += '<div class="aot-field"><div class="aot-field-lbl">Estado</div><div class="aot-field-val">' + aotBadge(m.estado) + '</div></div>';
    html += '<div class="aot-field"><div class="aot-field-lbl">Fecha</div><div class="aot-field-val">' + aotFmtDate(m.fecha) + '</div></div>';
    html += '<div class="aot-field"><div class="aot-field-lbl">Placa</div><div class="aot-field-val"><strong>' + aotEsc(m.placa || '—') + '</strong></div></div>';
    html += '<div class="aot-field"><div class="aot-field-lbl">Responsable</div><div class="aot-field-val">' + aotEsc(m.responsable || '—') + '</div></div>';
    if (m.observaciones) html += '<div class="aot-field"><div class="aot-field-lbl">Observaciones</div><div class="aot-field-val" style="white-space:normal;font-size:0.78rem;">' + aotEsc(m.observaciones) + '</div></div>';
    html += '</div>';

    if (m.items && m.items.length) {
        html += '<div class="aot-sec">';
        html += '<div class="aot-sec-hd">Artículos</div>';
        m.items.forEach(function(it) {
            var imp = parseFloat(it.importe) || (parseFloat(it.cantidad) * parseFloat(it.costo_unitario));
            html += '<div class="aot-field" style="display:block;">'
                + '<div style="font-weight:700;color:var(--text);font-size:0.82rem;">' + aotEsc(it.descripcion || it.inventario_id || '—') + '</div>'
                + '<div style="font-size:0.78rem;color:var(--subtext);">'
                + parseFloat(it.cantidad || 0).toLocaleString('es-PE', {maximumFractionDigits:3}) + ' u. · S/.' + parseFloat(it.costo_unitario || 0).toFixed(2) + ' c/u'
                + ' = <strong style="color:var(--text);">S/.' + imp.toFixed(2) + '</strong>'
                + '</div>'
                + '</div>';
        });
        html += '<div style="padding:8px 12px;font-weight:800;text-align:right;color:#16a34a;">Total: ' + aotFmtMoney(m.total_pen) + '</div>';
        html += '</div>';
    }

    var scroll = document.getElementById('aot-detalle-scroll');
    if (scroll) scroll.innerHTML = html;

    var footer = document.getElementById('aot-detalle-footer');
    if (footer) {
        footer.style.display = 'flex';
        if (m.estado !== 'Despachado') {
            footer.innerHTML =
                '<button class="btn btn-sm btn-outline-danger fw-bold" onclick="window.aotAnular(' + JSON.stringify(m.id) + ')" style="min-width:90px;"><i class="bi bi-x-circle me-1"></i>Anular</button>'
              + '<button class="btn btn-sm btn-success flex-fill fw-bold ms-2" onclick="window.aotDespachar(' + JSON.stringify(m.id) + ')"><i class="bi bi-box-seam me-1"></i>Aprobar y Despachar</button>';
        } else {
            footer.innerHTML = '<span style="font-size:0.8rem; color:var(--subtext); padding:4px;">Material ya despachado — stock descontado</span>';
        }
    }

    var panel = document.getElementById('aot-panel-detalle');
    if (panel) panel.classList.add('open');
}

window.aotCerrarDetalle = function() {
    var panel = document.getElementById('aot-panel-detalle');
    if (panel) panel.classList.remove('open');
    window.aotDetalleId = null;
    aotRenderTabla();
};

// ── Anular ────────────────────────────────────────────────────
window.aotAnular = function(id) {
    if (!confirm('¿Anular la solicitud ' + id + '? Se eliminará definitivamente.')) return;
    fetch('/api/ot-materiales/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function() {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Solicitud anulada', 'success');
            window.aotDetalleId = null;
            var panel = document.getElementById('aot-panel-detalle');
            if (panel) panel.classList.remove('open');
            aotCargar();
        })
        .catch(function() {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al anular la solicitud', 'danger');
        });
};

// ── Despachar ─────────────────────────────────────────────────
window.aotDespachar = function(id) {
    if (!confirm('¿Aprobar y despachar? El stock del inventario será descontado.')) return;
    fetch('/api/ot-materiales/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'despachar' })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Material despachado — stock actualizado', 'success');
        window.aotDetalleId = null;
        var panel = document.getElementById('aot-panel-detalle');
        if (panel) panel.classList.remove('open');
        aotCargar();
    })
    .catch(function(err) {
        console.error('Error despachando:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al despachar', 'danger');
    });
};

// ── Nueva Solicitud: Abrir / Cerrar ───────────────────────────
window.aotAbrirNuevo = function() {
    var ids = ['aot-f-ot','aot-f-placa','aot-f-responsable','aot-f-obs'];
    ids.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
    var fechaEl = document.getElementById('aot-f-fecha');
    if (fechaEl) fechaEl.value = new Date().toISOString().split('T')[0];
    var tipoEl = document.getElementById('aot-f-tipo');
    if (tipoEl) tipoEl.value = 'Vehiculo';
    // Limpiar artículos
    var tbody = document.getElementById('aot-items-tbody');
    if (tbody) tbody.innerHTML = '';
    window._aotItemIdx = 0;
    var totalEl = document.getElementById('aot-items-total');
    if (totalEl) totalEl.textContent = 'S/. 0.00';
    _aotAgregarItem(); // Primera fila vacía

    var drawer = document.getElementById('aot-drawer-nuevo');
    if (drawer) drawer.classList.add('open');
    var bd = document.getElementById('aotNuevoBackdrop');
    if (bd) bd.classList.add('open');
};

window.aotCerrarNuevo = function() {
    var drawer = document.getElementById('aot-drawer-nuevo');
    if (drawer) drawer.classList.remove('open');
    var bd = document.getElementById('aotNuevoBackdrop');
    if (bd) bd.classList.remove('open');
};

// ── Items del formulario ──────────────────────────────────────
window._aotAgregarItem = function() {
    var tbody = document.getElementById('aot-items-tbody');
    if (!tbody) return;
    var idx = window._aotItemIdx++;
    var tr = document.createElement('tr');
    tr.id = 'aot-item-' + idx;
    tr.innerHTML =
        '<td>' +
            '<input type="text" class="form-control form-control-sm aot-item-desc" list="aot-inv-list" placeholder="Buscar artículo…" ' +
                'data-idx="' + idx + '" oninput="window._aotBuscarArt(this,' + idx + ')">' +
            '<input type="hidden" class="aot-item-inv-id" data-idx="' + idx + '">' +
            '<input type="hidden" class="aot-item-stock" data-idx="' + idx + '" value="">' +
            '<div class="aot-item-stock-lbl" data-idx="' + idx + '" style="font-size:0.71rem;margin-top:2px;display:none;"></div>' +
        '</td>' +
        '<td><input type="number" class="form-control form-control-sm aot-item-cant" data-idx="' + idx + '" value="1" min="0.001" step="0.001" oninput="window._aotCalcItem(' + idx + ')"></td>' +
        '<td><input type="number" class="form-control form-control-sm aot-item-cu" data-idx="' + idx + '" value="0" min="0" step="0.01" oninput="window._aotCalcItem(' + idx + ')"></td>' +
        '<td><input type="number" class="form-control form-control-sm aot-item-imp" data-idx="' + idx + '" value="0" readonly></td>' +
        '<td><button type="button" class="btn btn-sm btn-outline-danger" onclick="window._aotQuitarItem(' + idx + ')"><i class="bi bi-x"></i></button></td>';
    tbody.appendChild(tr);
};

window._aotBuscarArt = function(input, idx) {
    var val = input.value || '';
    var invId = val.split(' — ')[0].trim();
    var item = (window._aotInvData || []).find(function(d) { return d.id === invId; });
    var stockEl = document.querySelector('.aot-item-stock[data-idx="' + idx + '"]');
    var lblEl   = document.querySelector('.aot-item-stock-lbl[data-idx="' + idx + '"]');
    if (item) {
        var hidEl = document.querySelector('.aot-item-inv-id[data-idx="' + idx + '"]');
        if (hidEl) hidEl.value = item.id;
        var cuEl = document.querySelector('.aot-item-cu[data-idx="' + idx + '"]');
        if (cuEl) { cuEl.value = parseFloat(item.costo_referencial || 0).toFixed(2); window._aotCalcItem(idx); }
        var stock = parseFloat(item.stock_actual != null ? item.stock_actual : -1);
        if (stockEl) stockEl.value = stock;
        if (lblEl) {
            lblEl.style.display = '';
            if (stock <= 0) {
                lblEl.innerHTML = '<span style="color:#dc2626;font-weight:700;">⚠ Sin stock disponible</span>';
            } else {
                lblEl.innerHTML = '<span style="color:#16a34a;">Stock disponible: <strong>' + stock + '</strong> ' + (item.unidad || 'und') + '</span>';
            }
        }
    } else {
        if (stockEl) stockEl.value = '';
        if (lblEl) lblEl.style.display = 'none';
    }
};

window._aotCalcItem = function(idx) {
    var cant = parseFloat((document.querySelector('.aot-item-cant[data-idx="' + idx + '"]') || {}).value) || 0;
    var cu   = parseFloat((document.querySelector('.aot-item-cu[data-idx="' + idx + '"]')   || {}).value) || 0;
    var impEl = document.querySelector('.aot-item-imp[data-idx="' + idx + '"]');
    if (impEl) impEl.value = (cant * cu).toFixed(2);
    _aotActualizarTotal();
};

window._aotQuitarItem = function(idx) {
    var tr = document.getElementById('aot-item-' + idx);
    if (tr) tr.remove();
    _aotActualizarTotal();
};

function _aotActualizarTotal() {
    var imps = document.querySelectorAll('.aot-item-imp');
    var total = 0;
    imps.forEach(function(el) { total += parseFloat(el.value) || 0; });
    var el = document.getElementById('aot-items-total');
    if (el) el.textContent = 'S/. ' + total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Guardar nueva solicitud ───────────────────────────────────
window.aotGuardarNuevo = function() {
    var get = function(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    var idOt    = get('aot-f-ot');
    var fecha   = get('aot-f-fecha');
    var tipo    = get('aot-f-tipo');
    var placa   = get('aot-f-placa').toUpperCase();
    var resp    = get('aot-f-responsable');
    var obs     = get('aot-f-obs');

    if (!idOt)  { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('El N° de OT es requerido', 'danger'); return; }
    if (!fecha) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La fecha es requerida', 'danger'); return; }

    // Recoger items
    var invIds = document.querySelectorAll('.aot-item-inv-id');
    var descs  = document.querySelectorAll('.aot-item-desc');
    var cants  = document.querySelectorAll('.aot-item-cant');
    var cus    = document.querySelectorAll('.aot-item-cu');
    var imps   = document.querySelectorAll('.aot-item-imp');
    var items  = [];
    for (var i = 0; i < cants.length; i++) {
        var desc = descs[i] ? descs[i].value.trim() : '';
        var invId = invIds[i] ? invIds[i].value : '';
        if (!desc && !invId) continue;
        var cant = parseFloat(cants[i].value) || 0;
        var cu   = parseFloat(cus[i].value)   || 0;
        var imp  = parseFloat(imps[i].value)  || cant * cu;
        if (cant <= 0) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Cantidad inválida en fila ' + (i + 1), 'danger'); return; }
        items.push({ inventario_id: invId || null, descripcion: desc, cantidad: cant, costo_unitario: cu, importe: imp });
    }
    if (!items.length) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Agrega al menos un artículo', 'danger'); return; }

    // Validar stock antes de guardar
    var sinStock = [];
    items.forEach(function(it) {
        if (it.inventario_id) {
            var inv = (window._aotInvData || []).find(function(d) { return d.id === it.inventario_id; });
            if (inv) {
                var stockDisp = parseFloat(inv.stock_actual != null ? inv.stock_actual : 0);
                if (it.cantidad > stockDisp) {
                    sinStock.push('"' + it.descripcion + '" — solicitado: ' + it.cantidad + ', disponible: ' + (stockDisp <= 0 ? 'Sin stock' : stockDisp));
                }
            }
        }
    });
    if (sinStock.length) {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Stock insuficiente para:\n• ' + sinStock.join('\n• '), 'danger');
        }
        return;
    }
        ticket_ot:    idOt,
        fecha:        fecha,
        tipo_destino: tipo || 'Vehiculo',
        placa:        tipo === 'Vehiculo' ? placa : null,
        responsable:  resp,
        observaciones: obs,
        creado_por:   localStorage.getItem('fleet_correo') || '',
        items:        items
    };

    fetch('/api/ot-materiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(d) {
        window.aotCerrarNuevo();
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Solicitud ' + (d.id || '') + ' registrada', 'success');
        aotCargar();
    })
    .catch(function(err) {
        console.error('Error guardando solicitud:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar la solicitud', 'danger');
    });
};

// ── Toggle tipo destino ───────────────────────────────────────
window.aotToggleTipo = function() {
    var tipo = (document.getElementById('aot-f-tipo') || {}).value || '';
    var rowPlaca = document.getElementById('aot-row-placa');
    if (rowPlaca) rowPlaca.style.display = tipo === 'Vehiculo' ? '' : 'none';
    if (tipo !== 'Vehiculo') {
        var p = document.getElementById('aot-f-placa'); if (p) p.value = '';
    }
};

// ── Exportar a Excel ─────────────────────────────────────────
window.aotExportar = function() {
    var datos = window.aotDatosFil.length > 0 ? window.aotDatosFil : window.aotData;
    if (!datos.length) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('No hay datos para exportar', 'warning');
        return;
    }

    if (typeof window.descargarExcelDinamico === 'function') {
        var tmpId = 'aot-export-tmp';
        var ex = document.getElementById(tmpId); if (ex) ex.remove();
        var tbl = document.createElement('table');
        tbl.id = tmpId; tbl.style.display = 'none';
        var thead = '<thead><tr><th>ID</th><th>N° OT</th><th>Fecha</th><th>Placa</th><th>Responsable</th><th>Artículo</th><th>Cantidad</th><th>Costo Unit.</th><th>Importe</th><th>Total</th><th>Estado</th></tr></thead>';
        var rows = [];
        datos.forEach(function(m) {
            var items = m.items || [];
            if (!items.length) {
                rows.push('<tr><td>' + aotEsc(m.id||'') + '</td><td>' + aotEsc(m.ticket_ot||'') + '</td><td>' + aotFmtDate(m.fecha) + '</td><td>' + aotEsc(m.placa||'') + '</td><td>' + aotEsc(m.responsable||'') + '</td><td>—</td><td></td><td></td><td></td><td>' + aotFmtMoney(m.total_pen) + '</td><td>' + aotEsc(m.estado||'') + '</td></tr>');
            } else {
                items.forEach(function(it, idx) {
                    rows.push('<tr>'
                        + '<td>' + (idx===0 ? aotEsc(m.id||'') : '') + '</td>'
                        + '<td>' + (idx===0 ? aotEsc(m.ticket_ot||'') : '') + '</td>'
                        + '<td>' + (idx===0 ? aotFmtDate(m.fecha) : '') + '</td>'
                        + '<td>' + (idx===0 ? aotEsc(m.placa||'') : '') + '</td>'
                        + '<td>' + (idx===0 ? aotEsc(m.responsable||'') : '') + '</td>'
                        + '<td>' + aotEsc(it.descripcion||it.inventario_id||'') + '</td>'
                        + '<td>' + (it.cantidad||0) + '</td>'
                        + '<td>' + aotFmtMoney(it.costo_unitario) + '</td>'
                        + '<td>' + aotFmtMoney(it.importe) + '</td>'
                        + '<td>' + (idx===0 ? aotFmtMoney(m.total_pen) : '') + '</td>'
                        + '<td>' + (idx===0 ? aotEsc(m.estado||'') : '') + '</td>'
                        + '</tr>');
                });
            }
        });
        tbl.innerHTML = thead + '<tbody>' + rows.join('') + '</tbody>';
        document.body.appendChild(tbl);
        window.descargarExcelDinamico(tmpId, 'Almacen_OT');
        setTimeout(function() { var el = document.getElementById(tmpId); if (el) el.remove(); }, 1000);
        return;
    }

    // Fallback CSV (una fila por artículo)
    var cabecera = ['ID','N° OT','Fecha','Placa','Responsable','Artículo','Cantidad','Costo Unit.','Importe','Total','Estado'];
    var csvRows = [cabecera];
    datos.forEach(function(m) {
        var items = m.items || [];
        if (!items.length) {
            csvRows.push([m.id||'', m.ticket_ot||'', aotFmtDate(m.fecha), m.placa||'', m.responsable||'', '', '', '', '', aotFmtMoney(m.total_pen), m.estado||'']);
        } else {
            items.forEach(function(it, idx) {
                csvRows.push([idx===0?m.id||'':'', idx===0?m.ticket_ot||'':'', idx===0?aotFmtDate(m.fecha):'',
                    idx===0?m.placa||'':'', idx===0?m.responsable||'':'',
                    it.descripcion||it.inventario_id||'', it.cantidad||0, aotFmtMoney(it.costo_unitario),
                    aotFmtMoney(it.importe), idx===0?aotFmtMoney(m.total_pen):'', idx===0?m.estado||'':'']);
            });
        }
    });
    var csv = csvRows.map(function(r) { return r.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'Almacen_OT.csv'; a.click();
    URL.revokeObjectURL(url);
};
