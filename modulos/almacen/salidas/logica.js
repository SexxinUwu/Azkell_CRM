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
    window.salTabActiva = 'desp';
    salSincronizarTabs();
    salCargar();
    _salCargarSelectores();
};

// ── Carga de datos ─────────────────────────────────────────────
window.salCargar = function() {
    var tbody = document.getElementById('sal-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="sal-td-placeholder"><div class="spinner-border spinner-border-sm text-secondary"></div></td></tr>';

    fetch('/api/almacen/salidas')
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
        .then(function(d) {
            window._salConductores = d || [];
            var dl = document.getElementById('sal-list-personal');
            if (dl) dl.innerHTML = (d || []).map(function(c) {
                return '<option value="' + salEsc(c.nombre || '') + '">';
            }).join('');
        })
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
    if (estado === 'Anulado')   return '<span class="sal-badge badge-anulado">Anulado</span>';
    return '<span class="sal-badge badge-pendiente">Pendiente</span>';
}

// ── Badges de tabs ────────────────────────────────────────────
function salActualizarBadges() {
    var pend   = window.salData.filter(function(m) { return m.estado !== 'Despachado' && m.estado !== 'Anulado'; }).length;
    var desp   = window.salData.filter(function(m) { return m.estado === 'Despachado'; }).length;
    var anulado= window.salData.filter(function(m) { return m.estado === 'Anulado'; }).length;
    var bp = document.getElementById('sal-badge-pend');
    var bd = document.getElementById('sal-badge-desp');
    var ba = document.getElementById('sal-badge-anulado');
    if (bp) bp.textContent = pend;
    if (bd) bd.textContent = desp;
    if (ba) ba.textContent = anulado;
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
    ['pend', 'desp', 'anulado'].forEach(function(t) {
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
            if (window.salTabActiva === 'pend'    && (m.estado === 'Despachado' || m.estado === 'Anulado')) return false;
            if (window.salTabActiva === 'desp'    && m.estado !== 'Despachado') return false;
            if (window.salTabActiva === 'anulado' && m.estado !== 'Anulado')    return false;
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
        var msg = window.salTabActiva === 'pend' ? 'Sin solicitudes pendientes'
                : window.salTabActiva === 'anulado' ? 'Sin salidas anuladas'
                : 'Sin salidas registradas';
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
    if (titulo) titulo.textContent = 'Salida ' + (m.id || '');

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
    if (m.estado === 'Anulado' && m.motivo_anulacion) {
        html += '<div class="sal-field" style="background:rgba(220,38,38,0.04);"><div class="sal-field-lbl" style="color:#dc2626;">Motivo anulación</div><div class="sal-field-val" style="color:#dc2626;white-space:normal;font-size:0.78rem;">' + salEsc(m.motivo_anulacion) + '</div></div>';
    }
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
        var eId = salEsc(m.id);
        var puedeEditar   = window.checkPerm('sal_inv', 'e');
        var puedeEliminar = window.checkPerm('sal_inv', 'd');
        var btnDespachar = (puedeEditar && m.estado !== 'Despachado' && m.estado !== 'Anulado')
            ? '<button class="btn btn-sm btn-success flex-fill fw-bold ms-1" onclick="window.salDespachar(\'' + eId + '\')"><i class="bi bi-box-seam me-1"></i>Despachar</button>'
            : '';
        var btnAnular = puedeEliminar
            ? (m.estado !== 'Anulado'
                ? '<button class="btn btn-sm btn-outline-danger ms-auto" onclick="window.salAnular(\'' + eId + '\')"><i class="bi bi-slash-circle me-1"></i>Anular</button>'
                : '<span class="sal-badge badge-anulado ms-auto" style="font-size:0.72rem;padding:5px 10px;">Anulada</span>')
            : (m.estado === 'Anulado' ? '<span class="sal-badge badge-anulado ms-auto" style="font-size:0.72rem;padding:5px 10px;">Anulada</span>' : '');
        footer.innerHTML =
            '<button class="btn btn-sm btn-outline-secondary" onclick="window.salVerPDF(window.salData.find(function(x){return x.id===\'' + eId + '\';}))" style="min-width:70px;"><i class="bi bi-eye me-1"></i>Ver</button>'
          + '<button class="btn btn-sm btn-outline-primary ms-1" onclick="window.salGenerarPDF(window.salData.find(function(x){return x.id===\'' + eId + '\';}))" style="min-width:70px;"><i class="bi bi-filetype-pdf me-1"></i>PDF</button>'
          + (btnDespachar ? btnDespachar : '')
          + btnAnular;
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

// ── Despachar salida ──────────────────────────────────────────────
window.salDespachar = function(id) {
    if (!window.guardAction('sal_inv', 'e')) return;
    if (!confirm('¿Despachar la salida ' + id + '? El stock del inventario será descontado.')) return;
    fetch('/api/almacen/salidas/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'despachar' })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Salida ' + id + ' despachada — stock descontado', 'success');
        window.salDetalleId = null;
        var panel = document.getElementById('sal-panel-detalle');
        if (panel) panel.classList.remove('open');
        salCargar();
    })
    .catch(function(err) {
        console.error('Error despachando salida:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al despachar la salida', 'danger');
    });
};

// ── Anular salida ─────────────────────────────────────────────
window.salAnular = function(id) {
    if (!window.guardAction('sal_inv', 'd')) return;
    var motivo = window.prompt('Motivo de anulación (obligatorio):');
    if (motivo === null) return; // cancelado
    motivo = motivo.trim();
    if (!motivo) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('El motivo es obligatorio para anular', 'warning'); return; }

    fetch('/api/almacen/salidas/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'anular', motivo: motivo })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Salida ' + id + ' anulada — stock restaurado', 'success');
        window.salDetalleId = null;
        var panel = document.getElementById('sal-panel-detalle');
        if (panel) panel.classList.remove('open');
        salCargar();
    })
    .catch(function(err) {
        console.error('Error anulando salida:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al anular la salida', 'danger');
    });
};

// ── Eliminar salida ───────────────────────────────────────────
window.salEliminar = function(id) {
    if (!confirm('¿Eliminar la salida ' + id + '? El stock volverá a su valor anterior.')) return;
    fetch('/api/almacen/salidas/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function() {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Salida eliminada — stock restaurado', 'success');
            window.salDetalleId = null;
            var panel = document.getElementById('sal-panel-detalle');
            if (panel) panel.classList.remove('open');
            salCargar();
        })
        .catch(function() {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar la salida', 'danger');
        });
};

// ── Construir HTML del comprobante ────────────────────────────
function salBuildPDFHtml(m) {
    var id      = m.id || '—';
    var fecha   = m.fecha ? String(m.fecha).split('T')[0] : '—';
    var totalPen = parseFloat(m.total_pen || 0);
    var itemsHTML = (m.items || []).map(function(it, i) {
        var cant = parseFloat(it.cantidad || 0);
        var cu   = parseFloat(it.costo_unitario || 0);
        var imp  = parseFloat(it.importe || 0) || cant * cu;
        var bgRow = i % 2 === 0 ? '#f9fafb' : '#ffffff';
        return '<tr style="background:' + bgRow + '">'
            + '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">' + salEsc(it.descripcion || it.inventario_id || '—') + '</td>'
            + '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center">' + cant.toLocaleString('es-PE', { maximumFractionDigits: 3 }) + '</td>'
            + '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right">S/ ' + cu.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '</td>'
            + '<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:600">S/ ' + imp.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>'
            + '</tr>';
    }).join('');

    var estadoBadge = m.estado === 'Anulado'
        ? '<span style="display:inline-block;padding:2px 10px;background:#fee2e2;color:#dc2626;border-radius:12px;font-size:11px;font-weight:700;margin-left:8px;">ANULADA</span>'
        : '';
    var motivoHtml = (m.estado === 'Anulado' && m.motivo_anulacion)
        ? '<div style="padding:10px 14px;background:#fee2e2;border-radius:6px;border-left:3px solid #dc2626;font-size:12px;margin-bottom:12px"><b>Motivo anulación: </b>' + salEsc(m.motivo_anulacion) + '</div>'
        : '';

    return '<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:32px;color:#1e293b">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #2563eb">'
            + '<div><div style="font-size:22px;font-weight:700;color:#2563eb">AZKELL FLEET</div><div style="font-size:11px;color:#64748b;margin-top:2px">Sistema de Gestión de Flotas</div></div>'
            + '<div style="text-align:right"><div style="font-size:18px;font-weight:700">COMPROBANTE DE SALIDA' + estadoBadge + '</div>'
            + '<div style="font-size:13px;color:#2563eb;font-weight:600;margin-top:4px">' + salEsc(id) + '</div>'
            + '<div style="font-size:11px;color:#64748b;margin-top:2px">Fecha: ' + fecha + '</div></div>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding:14px 16px;background:#f1f5f9;border-radius:8px">'
            + '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">OT Referencia</div><div style="font-size:13px;font-weight:600">' + salEsc(m.ticket_ot || '—') + '</div></div>'
            + '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Tipo Destino</div><div style="font-size:13px;font-weight:600">' + salEsc(m.tipo_destino || '—') + '</div></div>'
            + '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Placa</div><div style="font-size:13px;font-weight:600">' + salEsc(m.placa || '—') + '</div></div>'
            + '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">Responsable</div><div style="font-size:13px;font-weight:600">' + salEsc(m.responsable || '—') + '</div></div>'
        + '</div>'
        + motivoHtml
        + '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">'
            + '<thead><tr style="background:#2563eb;color:#fff">'
                + '<th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase">Artículo</th>'
                + '<th style="padding:9px 10px;text-align:center;font-size:11px;text-transform:uppercase">Cantidad</th>'
                + '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase">Costo Unit.</th>'
                + '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase">Importe</th>'
            + '</tr></thead>'
            + '<tbody>' + itemsHTML + '</tbody>'
        + '</table>'
        + '<div style="display:flex;justify-content:flex-end;margin-bottom:20px">'
            + '<div style="min-width:220px">'
                + '<div style="display:flex;justify-content:space-between;padding:10px 12px;background:#2563eb;color:#fff;border-radius:6px;font-size:14px;font-weight:700">'
                    + '<span>TOTAL PEN</span><span>S/ ' + totalPen.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span>'
                + '</div>'
            + '</div>'
        + '</div>'
        + (m.observaciones ? '<div style="padding:10px 14px;background:#fef9c3;border-radius:6px;border-left:3px solid #eab308;font-size:12px;margin-bottom:12px"><b>Obs.: </b>' + salEsc(m.observaciones) + '</div>' : '')
        + '<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8">'
            + '<span>Generado: ' + new Date().toLocaleString('es-PE') + '</span>'
            + '<span>Azkell Fleet — Sistema de Gestión de Flotas</span>'
        + '</div>'
    + '</div>';
}

// ── Generar PDF de salida (descarga) ─────────────────────────
window.salGenerarPDF = function(m) {
    if (!m) return;
    if (typeof html2pdf === 'undefined') {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Librería html2pdf no cargada', 'danger');
        return;
    }
    var opt = {
        margin: [8, 8, 8, 8],
        filename: 'Salida_' + (m.id || 'sin-id') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    var wrapper = document.createElement('div');
    wrapper.innerHTML = salBuildPDFHtml(m);
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:700px';
    document.body.appendChild(wrapper);
    html2pdf().set(opt).from(wrapper.firstChild).save().then(function() {
        document.body.removeChild(wrapper);
    });
};

// ── Previsualizar comprobante en nueva pestaña ────────────────
window.salVerPDF = function(m) {
    if (!m) return;
    if (typeof html2pdf === 'undefined') {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Librería html2pdf no cargada', 'danger');
        return;
    }
    var opt = {
        margin: [8, 8, 8, 8],
        filename: 'Salida_' + (m.id || '') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    var wrapper = document.createElement('div');
    wrapper.innerHTML = salBuildPDFHtml(m);
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:700px';
    document.body.appendChild(wrapper);
    html2pdf().set(opt).from(wrapper.firstChild).outputPdf('bloburl').then(function(url) {
        document.body.removeChild(wrapper);
        window.open(url, '_blank');
    });
};

// ── Nueva Solicitud: Abrir / Cerrar ───────────────────────────
window.salAbrirNuevo = function() {
    if (!window.guardAction('sal_inv', 'c')) return;
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

    fetch('/api/almacen/salidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(d) {
        window.salCerrarNuevo();
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Salida ' + (d.id || '') + ' registrada', 'success');
        salCargar();
    })
    .catch(function(err) {
        console.error('Error guardando salida:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar la salida', 'danger');
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
