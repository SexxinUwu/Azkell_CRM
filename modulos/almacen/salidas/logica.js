// ================================================================
// Módulo Almacén / Salidas — Azkell Fleet
// Ruta SPA: almacen/salidas
// Entry point: window.init_salidas()
// Copia funcional de almacen-ot con prefijo 'sal'
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.salData       = window.salData       || [];
window.salDatosFil   = window.salDatosFil   || [];
window.salTabActiva  = window.salTabActiva  || 'pend';
window.salDetalleId  = window.salDetalleId  || null;
window._salItemIdx   = window._salItemIdx   || 0;
window._salPlacas    = window._salPlacas    || [];
window._salConductores = window._salConductores || [];
window._salInvData   = window._salInvData   || [];

// ── Entry point ──────────────────────────────────────────────────
window.init_salidas = function() {
    salSincronizarTabs();
    salCargar();
    _salCargarSelectores();
};

// ── Carga de datos ─────────────────────────────────────────────
window.salCargar = function() {
    var tbody = document.getElementById('sal-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="sal-td-placeholder"><div class="spinner-border spinner-border-sm text-secondary"></div></td></tr>';

    fetch('/api/ot-materiales')
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) {
            window.salData = Array.isArray(data) ? data : [];
            salActualizarBadges();
            salRenderTabla();
        })
        .catch(function(err) {
            console.error('Error cargando almacén salidas:', err);
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al cargar datos de almacén', 'danger');
            var tb = document.getElementById('sal-tbody');
            if (tb) tb.innerHTML = '<tr><td colspan="7" class="sal-td-placeholder">Error al cargar datos</td></tr>';
        });
};

// ── Cargar selectores para el formulario ──────────────────────
function _salCargarSelectores() {
    fetch('/api/conductores-lista')
        .then(function(r) { return r.json(); })
        .then(function(d) { window._salConductores = d || []; })
        .catch(function() {});

    fetch('/api/placas-lista')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            window._salPlacas = d || [];
            var dl = document.getElementById('sal-list-placas');
            if (dl) dl.innerHTML = (d || []).map(function(p) {
                return '<option value="' + salEsc(p.placa) + '">';
            }).join('');
        })
        .catch(function() {});

    fetch('/api/almacen/inventario')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            window._salInvData = d || [];
            var dl = document.getElementById('sal-inv-list');
            if (dl) dl.innerHTML = (d || []).map(function(a) {
                return '<option value="' + salEsc(a.id + ' — ' + a.descripcion) + '">';
            }).join('');
        })
        .catch(function() {});

    var fechaEl = document.getElementById('sal-f-fecha');
    if (fechaEl && !fechaEl.value) fechaEl.value = new Date().toISOString().split('T')[0];
}

// ── Helpers ──────────────────────────────────────────────────
function salEsc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function salFmtMoney(val) {
    return 'S/.' + parseFloat(val || 0).toFixed(2);
}

function salFmtDate(iso) {
    if (!iso) return '—';
    var s = typeof iso === 'string' ? iso.split('T')[0] : String(iso);
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return s || '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' });
}

function salBadge(estado) {
    if (estado === 'Despachado') return '<span class="sal-badge badge-despachado">Despachado</span>';
    return '<span class="sal-badge badge-pendiente">Pendiente</span>';
}

// ── Badges de tabs ────────────────────────────────────────────
function salActualizarBadges() {
    var pend = window.salData.filter(function(m) { return m.estado !== 'Despachado'; }).length;
    var desp = window.salData.filter(function(m) { return m.estado === 'Despachado'; }).length;
    var bp = document.getElementById('sal-badge-pend');
    var bd = document.getElementById('sal-badge-desp');
    if (bp) bp.textContent = pend;
    if (bd) bd.textContent = desp;
}

// ── Tabs ──────────────────────────────────────────────────────
window.salCambiarTab = function(tab) {
    window.salTabActiva = tab;
    salSincronizarTabs();
    window.salDetalleId = null;
    var panel = document.getElementById('sal-panel-detalle');
    if (panel) panel.classList.remove('open');
    salRenderTabla();
};

function salSincronizarTabs() {
    ['pend', 'desp'].forEach(function(t) {
        var el = document.getElementById('sal-tab-' + t);
        if (el) el.classList.toggle('active', t === window.salTabActiva);
    });
}

// ── Filtrar ───────────────────────────────────────────────────
window.salFiltrar = function() { salRenderTabla(); };

function salGetFiltros() {
    return {
        search: ((document.getElementById('sal-search') || {}).value || '').toLowerCase().trim(),
        ot:     ((document.getElementById('sal-fil-ot') || {}).value || '').trim().toLowerCase(),
        placa:  ((document.getElementById('sal-fil-placa') || {}).value || '').trim().toUpperCase(),
        mes:    ((document.getElementById('sal-fil-mes') || {}).value || '').trim(),
        desde:  ((document.getElementById('sal-fil-desde') || {}).value || '').trim(),
        hasta:  ((document.getElementById('sal-fil-hasta') || {}).value || '').trim(),
        estado: ((document.getElementById('sal-fil-estado') || {}).value || '').trim()
    };
}

// ── Render tabla ──────────────────────────────────────────────
window.salRenderTabla = function() {
    var tbody = document.getElementById('sal-tbody');
    if (!tbody) return;

    var f = salGetFiltros();

    var datos = window.salData.filter(function(m) {
        if (!f.estado) {
            if (window.salTabActiva === 'pend' && m.estado === 'Despachado') return false;
            if (window.salTabActiva === 'desp' && m.estado !== 'Despachado') return false;
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

    window.salDatosFil = datos;

    if (datos.length === 0) {
        var msg = window.salTabActiva === 'pend' ? 'Sin solicitudes pendientes' : 'Sin salidas registradas';
        tbody.innerHTML = '<tr><td colspan="7" class="sal-td-placeholder"><i class="bi bi-box" style="font-size:1.5rem; opacity:0.3"></i><br>' + msg + '</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    datos.forEach(function(m) {
        var artResumen = (m.items || []).map(function(it) { return salEsc(it.descripcion || ''); }).filter(Boolean).join(', ') || '—';
        var nItems = (m.items || []).length;
        var tr = document.createElement('tr');
        if (m.id === window.salDetalleId) tr.classList.add('sal-row-active');
        tr.innerHTML =
            '<td><span class="fw-bold" style="color:var(--primary,#5865F2);">' + salEsc(m.id || '—') + '</span></td>'
            + '<td><strong>' + salEsc(m.ticket_ot || '—') + '</strong></td>'
            + '<td>' + salEsc(m.placa || '—') + '</td>'
            + '<td>' + salEsc(m.responsable || '—') + '</td>'
            + '<td style="max-width:200px; font-size:0.79rem; white-space:normal;">'
                + artResumen
                + (nItems > 1 ? ' <span style="color:var(--subtext);font-size:0.72rem;">(' + nItems + ' art.)</span>' : '')
            + '</td>'
            + '<td><strong style="color:#16a34a;">' + salFmtMoney(m.total_pen) + '</strong></td>'
            + '<td>' + salBadge(m.estado) + '</td>';
        tr.onclick = (function(row) { return function() { salAbrirDetalle(row); }; })(m);
        tbody.appendChild(tr);
    });
};

// ── Detalle lateral ───────────────────────────────────────────
function salAbrirDetalle(m) {
    window.salDetalleId = m.id;
    salRenderTabla();

    var titulo = document.getElementById('sal-detalle-titulo');
    if (titulo) titulo.textContent = 'Solicitud ' + (m.id || '');

    var html = '';
    html += '<div style="font-size:1.2rem; font-weight:800; color:var(--text); margin-bottom:0.3rem;">' + salEsc(m.id || '—') + '</div>';
    html += '<div style="font-size:0.83rem; color:var(--subtext); margin-bottom:1rem;">OT: <strong>' + salEsc(m.ticket_ot || '—') + '</strong></div>';

    html += '<div class="sal-sec">';
    html += '<div class="sal-sec-hd">Cabecera</div>';
    html += '<div class="sal-field"><div class="sal-field-lbl">Estado</div><div class="sal-field-val">' + salBadge(m.estado) + '</div></div>';
    html += '<div class="sal-field"><div class="sal-field-lbl">Fecha</div><div class="sal-field-val">' + salFmtDate(m.fecha) + '</div></div>';
    html += '<div class="sal-field"><div class="sal-field-lbl">Placa</div><div class="sal-field-val"><strong>' + salEsc(m.placa || '—') + '</strong></div></div>';
    html += '<div class="sal-field"><div class="sal-field-lbl">Responsable</div><div class="sal-field-val">' + salEsc(m.responsable || '—') + '</div></div>';
    if (m.observaciones) html += '<div class="sal-field"><div class="sal-field-lbl">Observaciones</div><div class="sal-field-val" style="white-space:normal;font-size:0.78rem;">' + salEsc(m.observaciones) + '</div></div>';
    html += '</div>';

    if (m.items && m.items.length) {
        html += '<div class="sal-sec">';
        html += '<div class="sal-sec-hd">Artículos</div>';
        m.items.forEach(function(it) {
            var imp = parseFloat(it.importe) || (parseFloat(it.cantidad) * parseFloat(it.costo_unitario));
            html += '<div class="sal-field" style="display:block;">'
                + '<div style="font-weight:700;color:var(--text);font-size:0.82rem;">' + salEsc(it.descripcion || it.inventario_id || '—') + '</div>'
                + '<div style="font-size:0.78rem;color:var(--subtext);">'
                + parseFloat(it.cantidad || 0).toLocaleString('es-PE', {maximumFractionDigits:3}) + ' u. · S/.' + parseFloat(it.costo_unitario || 0).toFixed(2) + ' c/u'
                + ' = <strong style="color:var(--text);">S/.' + imp.toFixed(2) + '</strong>'
                + '</div>'
                + '</div>';
        });
        html += '<div style="padding:8px 12px;font-weight:800;text-align:right;color:#16a34a;">Total: ' + salFmtMoney(m.total_pen) + '</div>';
        html += '</div>';
    }

    var scroll = document.getElementById('sal-detalle-scroll');
    if (scroll) scroll.innerHTML = html;

    var footer = document.getElementById('sal-detalle-footer');
    if (footer) {
        footer.style.display = 'flex';
        if (m.estado !== 'Despachado') {
            footer.innerHTML =
                '<button class="btn btn-sm btn-outline-danger fw-bold" onclick="window.salAnular(' + JSON.stringify(m.id) + ')" style="min-width:90px;"><i class="bi bi-x-circle me-1"></i>Anular</button>'
              + '<button class="btn btn-sm btn-success flex-fill fw-bold ms-2" onclick="window.salDespachar(' + JSON.stringify(m.id) + ')"><i class="bi bi-box-seam me-1"></i>Aprobar y Despachar</button>';
        } else {
            footer.innerHTML = '<span style="font-size:0.8rem; color:var(--subtext); padding:4px;">Material ya despachado — stock descontado</span>';
        }
    }

    var panel = document.getElementById('sal-panel-detalle');
    if (panel) panel.classList.add('open');
}

window.salCerrarDetalle = function() {
    var panel = document.getElementById('sal-panel-detalle');
    if (panel) panel.classList.remove('open');
    window.salDetalleId = null;
    salRenderTabla();
};

// ── Anular ────────────────────────────────────────────────────
window.salAnular = function(id) {
    if (!confirm('¿Anular la solicitud ' + id + '? Se eliminará definitivamente.')) return;
    fetch('/api/ot-materiales/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function() {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Solicitud anulada', 'success');
            window.salDetalleId = null;
            var panel = document.getElementById('sal-panel-detalle');
            if (panel) panel.classList.remove('open');
            salCargar();
        })
        .catch(function() {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al anular la solicitud', 'danger');
        });
};

// ── Despachar ─────────────────────────────────────────────────
window.salDespachar = function(id) {
    if (!confirm('¿Aprobar y despachar? El stock del inventario será descontado.')) return;
    fetch('/api/ot-materiales/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'despachar' })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Material despachado — stock actualizado', 'success');
        window.salDetalleId = null;
        var panel = document.getElementById('sal-panel-detalle');
        if (panel) panel.classList.remove('open');
        salCargar();
    })
    .catch(function(err) {
        console.error('Error despachando:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al despachar', 'danger');
    });
};

// ── Nueva Solicitud: Abrir / Cerrar ───────────────────────────
window.salAbrirNuevo = function() {
    var ids = ['sal-f-ot','sal-f-placa','sal-f-responsable','sal-f-obs'];
    ids.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
    var fechaEl = document.getElementById('sal-f-fecha');
    if (fechaEl) fechaEl.value = new Date().toISOString().split('T')[0];
    var tipoEl = document.getElementById('sal-f-tipo');
    if (tipoEl) tipoEl.value = 'Vehiculo';
    var tbody = document.getElementById('sal-items-tbody');
    if (tbody) tbody.innerHTML = '';
    window._salItemIdx = 0;
    var totalEl = document.getElementById('sal-items-total');
    if (totalEl) totalEl.textContent = 'S/. 0.00';
    _salAgregarItem();

    var drawer = document.getElementById('sal-drawer-nuevo');
    if (drawer) drawer.classList.add('open');
    var bd = document.getElementById('salNuevoBackdrop');
    if (bd) bd.classList.add('open');
};

window.salCerrarNuevo = function() {
    var drawer = document.getElementById('sal-drawer-nuevo');
    if (drawer) drawer.classList.remove('open');
    var bd = document.getElementById('salNuevoBackdrop');
    if (bd) bd.classList.remove('open');
};

// ── Items del formulario ──────────────────────────────────────
window._salAgregarItem = function() {
    var tbody = document.getElementById('sal-items-tbody');
    if (!tbody) return;
    var idx = window._salItemIdx++;
    var tr = document.createElement('tr');
    tr.id = 'sal-item-' + idx;
    tr.innerHTML =
        '<td>' +
            '<input type="text" class="form-control form-control-sm sal-item-desc" list="sal-inv-list" placeholder="Buscar artículo…" ' +
                'data-idx="' + idx + '" oninput="window._salBuscarArt(this,' + idx + ')">' +
            '<input type="hidden" class="sal-item-inv-id" data-idx="' + idx + '">' +
        '</td>' +
        '<td><input type="number" class="form-control form-control-sm sal-item-cant" data-idx="' + idx + '" value="1" min="0.001" step="0.001" oninput="window._salCalcItem(' + idx + ')"></td>' +
        '<td><input type="number" class="form-control form-control-sm sal-item-cu" data-idx="' + idx + '" value="0" min="0" step="0.01" oninput="window._salCalcItem(' + idx + ')"></td>' +
        '<td><input type="number" class="form-control form-control-sm sal-item-imp" data-idx="' + idx + '" value="0" readonly></td>' +
        '<td><button type="button" class="btn btn-sm btn-outline-danger" onclick="window._salQuitarItem(' + idx + ')"><i class="bi bi-x"></i></button></td>';
    tbody.appendChild(tr);
};

window._salBuscarArt = function(input, idx) {
    var val = input.value || '';
    var invId = val.split(' — ')[0].trim();
    var item = (window._salInvData || []).find(function(d) { return d.id === invId; });
    if (item) {
        var hidEl = document.querySelector('.sal-item-inv-id[data-idx="' + idx + '"]');
        if (hidEl) hidEl.value = item.id;
        var cuEl = document.querySelector('.sal-item-cu[data-idx="' + idx + '"]');
        if (cuEl) { cuEl.value = parseFloat(item.costo_referencial || 0).toFixed(2); window._salCalcItem(idx); }
    }
};

window._salCalcItem = function(idx) {
    var cant = parseFloat((document.querySelector('.sal-item-cant[data-idx="' + idx + '"]') || {}).value) || 0;
    var cu   = parseFloat((document.querySelector('.sal-item-cu[data-idx="' + idx + '"]')   || {}).value) || 0;
    var impEl = document.querySelector('.sal-item-imp[data-idx="' + idx + '"]');
    if (impEl) impEl.value = (cant * cu).toFixed(2);
    _salActualizarTotal();
};

window._salQuitarItem = function(idx) {
    var tr = document.getElementById('sal-item-' + idx);
    if (tr) tr.remove();
    _salActualizarTotal();
};

function _salActualizarTotal() {
    var imps = document.querySelectorAll('.sal-item-imp');
    var total = 0;
    imps.forEach(function(el) { total += parseFloat(el.value) || 0; });
    var el = document.getElementById('sal-items-total');
    if (el) el.textContent = 'S/. ' + total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Guardar nueva solicitud ───────────────────────────────────
window.salGuardarNuevo = function() {
    var get = function(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    var idOt    = get('sal-f-ot');
    var fecha   = get('sal-f-fecha');
    var tipo    = get('sal-f-tipo');
    var placa   = get('sal-f-placa').toUpperCase();
    var resp    = get('sal-f-responsable');
    var obs     = get('sal-f-obs');

    if (!idOt)  { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('El N° de OT es requerido', 'danger'); return; }
    if (!fecha) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La fecha es requerida', 'danger'); return; }

    var invIds = document.querySelectorAll('.sal-item-inv-id');
    var descs  = document.querySelectorAll('.sal-item-desc');
    var cants  = document.querySelectorAll('.sal-item-cant');
    var cus    = document.querySelectorAll('.sal-item-cu');
    var imps   = document.querySelectorAll('.sal-item-imp');
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

    var body = {
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
        window.salCerrarNuevo();
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Solicitud ' + (d.id || '') + ' registrada', 'success');
        salCargar();
    })
    .catch(function(err) {
        console.error('Error guardando solicitud:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar la solicitud', 'danger');
    });
};

// ── Toggle tipo destino ───────────────────────────────────────
window.salToggleTipo = function() {
    var tipo = (document.getElementById('sal-f-tipo') || {}).value || '';
    var rowPlaca = document.getElementById('sal-row-placa');
    if (rowPlaca) rowPlaca.style.display = tipo === 'Vehiculo' ? '' : 'none';
    if (tipo !== 'Vehiculo') {
        var p = document.getElementById('sal-f-placa'); if (p) p.value = '';
    }
};

// ── Exportar a Excel ─────────────────────────────────────────
window.salExportar = function() {
    var datos = window.salDatosFil.length > 0 ? window.salDatosFil : window.salData;
    if (!datos.length) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('No hay datos para exportar', 'warning');
        return;
    }

    if (typeof window.descargarExcelDinamico === 'function') {
        var tmpId = 'sal-export-tmp';
        var ex = document.getElementById(tmpId); if (ex) ex.remove();
        var tbl = document.createElement('table');
        tbl.id = tmpId; tbl.style.display = 'none';
        var thead = '<thead><tr><th>ID</th><th>N° OT</th><th>Fecha</th><th>Placa</th><th>Responsable</th><th>Artículo</th><th>Cantidad</th><th>Costo Unit.</th><th>Importe</th><th>Total</th><th>Estado</th></tr></thead>';
        var rows = [];
        datos.forEach(function(m) {
            var items = m.items || [];
            if (!items.length) {
                rows.push('<tr><td>' + salEsc(m.id||'') + '</td><td>' + salEsc(m.ticket_ot||'') + '</td><td>' + salFmtDate(m.fecha) + '</td><td>' + salEsc(m.placa||'') + '</td><td>' + salEsc(m.responsable||'') + '</td><td>—</td><td></td><td></td><td></td><td>' + salFmtMoney(m.total_pen) + '</td><td>' + salEsc(m.estado||'') + '</td></tr>');
            } else {
                items.forEach(function(it, idx) {
                    rows.push('<tr>'
                        + '<td>' + (idx===0 ? salEsc(m.id||'') : '') + '</td>'
                        + '<td>' + (idx===0 ? salEsc(m.ticket_ot||'') : '') + '</td>'
                        + '<td>' + (idx===0 ? salFmtDate(m.fecha) : '') + '</td>'
                        + '<td>' + (idx===0 ? salEsc(m.placa||'') : '') + '</td>'
                        + '<td>' + (idx===0 ? salEsc(m.responsable||'') : '') + '</td>'
                        + '<td>' + salEsc(it.descripcion||it.inventario_id||'') + '</td>'
                        + '<td>' + (it.cantidad||0) + '</td>'
                        + '<td>' + salFmtMoney(it.costo_unitario) + '</td>'
                        + '<td>' + salFmtMoney(it.importe) + '</td>'
                        + '<td>' + (idx===0 ? salFmtMoney(m.total_pen) : '') + '</td>'
                        + '<td>' + (idx===0 ? salEsc(m.estado||'') : '') + '</td>'
                        + '</tr>');
                });
            }
        });
        tbl.innerHTML = thead + '<tbody>' + rows.join('') + '</tbody>';
        document.body.appendChild(tbl);
        window.descargarExcelDinamico(tmpId, 'Almacen_Salidas');
        setTimeout(function() { var el = document.getElementById(tmpId); if (el) el.remove(); }, 1000);
        return;
    }

    var cabecera = ['ID','N° OT','Fecha','Placa','Responsable','Artículo','Cantidad','Costo Unit.','Importe','Total','Estado'];
    var csvRows = [cabecera];
    datos.forEach(function(m) {
        var items = m.items || [];
        if (!items.length) {
            csvRows.push([m.id||'', m.ticket_ot||'', salFmtDate(m.fecha), m.placa||'', m.responsable||'', '', '', '', '', salFmtMoney(m.total_pen), m.estado||'']);
        } else {
            items.forEach(function(it, idx) {
                csvRows.push([idx===0?m.id||'':'', idx===0?m.ticket_ot||'':'', idx===0?salFmtDate(m.fecha):'',
                    idx===0?m.placa||'':'', idx===0?m.responsable||'':'',
                    it.descripcion||it.inventario_id||'', it.cantidad||0, salFmtMoney(it.costo_unitario),
                    salFmtMoney(it.importe), idx===0?salFmtMoney(m.total_pen):'', idx===0?m.estado||'':'']);
            });
        }
    });
    var csv = csvRows.map(function(r) { return r.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'Almacen_Salidas.csv'; a.click();
    URL.revokeObjectURL(url);
};
