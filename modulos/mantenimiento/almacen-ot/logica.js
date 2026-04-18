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

// ── Entry point ──────────────────────────────────────────────────
window.init_almacen_ot = function() {
    // Asegurar tab inicial activa
    aotSincronizarTabs();
    aotCargar();
};

// ── Carga de datos ────────────────────────────────────────────────
window.aotCargar = function() {
    var tbody = document.getElementById('aot-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="td-placeholder"><div class="spinner-border spinner-border-sm text-secondary"></div></td></tr>';

    fetch('/api/ot-materiales')
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function(data) {
            window.aotData = Array.isArray(data) ? data : [];
            aotActualizarBadges();
            aotRenderTabla();
        })
        .catch(function(err) {
            console.error('Error cargando almacén OT:', err);
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('Error al cargar datos de almacén', 'danger');
            }
            var tb = document.getElementById('aot-tbody');
            if (tb) tb.innerHTML = '<tr><td colspan="8" class="td-placeholder">Error al cargar datos</td></tr>';
        });
};

// ── Helpers ───────────────────────────────────────────────────────
function aotFmtMoney(val) {
    return 'S/.' + parseFloat(val || 0).toFixed(2);
}

function aotFmtDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).split('T')[0] || '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' })
        + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function aotBadge(estado) {
    if (estado === 'Despachado') {
        return '<span class="aot-badge badge-despachado">Despachado</span>';
    }
    return '<span class="aot-badge badge-pendiente">Pendiente</span>';
}

// ── Badges de tabs ────────────────────────────────────────────────
function aotActualizarBadges() {
    var pend = window.aotData.filter(function(m) { return m.estado !== 'Despachado'; }).length;
    var desp = window.aotData.filter(function(m) { return m.estado === 'Despachado'; }).length;
    var bp = document.getElementById('aot-badge-pend');
    var bd = document.getElementById('aot-badge-desp');
    if (bp) bp.textContent = pend;
    if (bd) bd.textContent = desp;
}

// ── Tabs ──────────────────────────────────────────────────────────
window.aotCambiarTab = function(tab) {
    window.aotTabActiva = tab;
    aotSincronizarTabs();
    window.aotDetalleId = null;
    var panel = document.getElementById('aot-panel-detalle');
    if (panel) panel.classList.remove('open');
    aotRenderTabla();
};

function aotSincronizarTabs() {
    var tabs = ['pend', 'desp'];
    tabs.forEach(function(t) {
        var el = document.getElementById('aot-tab-' + t);
        if (el) el.classList.toggle('active', t === window.aotTabActiva);
    });
    // Sincronizar select de estado con el tab activo
    var selEstado = document.getElementById('aot-fil-estado');
    if (selEstado && selEstado.value === '') {
        // No sobreescribir si el usuario ya eligió algo
    }
}

// ── Filtrar ───────────────────────────────────────────────────────
window.aotFiltrar = function() {
    aotRenderTabla();
};

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

// ── Render tabla ──────────────────────────────────────────────────
window.aotRenderTabla = function() {
    var tbody = document.getElementById('aot-tbody');
    if (!tbody) return;

    var f = aotGetFiltros();

    // Filtro por tab activa (si no hay filtro manual de estado)
    var datos = window.aotData.filter(function(m) {
        // Tab activa como filtro base (si no hay filtro manual)
        if (!f.estado) {
            if (window.aotTabActiva === 'pend' && m.estado === 'Despachado') return false;
            if (window.aotTabActiva === 'desp' && m.estado !== 'Despachado') return false;
        } else {
            if (m.estado !== f.estado) return false;
        }
        // N° OT
        if (f.ot && String(m.ticket_ot || '').toLowerCase().indexOf(f.ot) === -1) return false;
        // Placa — solo si el campo placa viene en el objeto (puede venir o no del API)
        if (f.placa && String(m.placa || '').toUpperCase().indexOf(f.placa) === -1) return false;
        // Mes
        if (f.mes) {
            var fechaStr = m.creado_en ? String(m.creado_en).split('T')[0] : '';
            if (!fechaStr.startsWith(f.mes)) return false;
        }
        // Desde/hasta
        if (f.desde || f.hasta) {
            var fechaStr2 = m.creado_en ? String(m.creado_en).split('T')[0] : '';
            if (f.desde && fechaStr2 < f.desde) return false;
            if (f.hasta && fechaStr2 > f.hasta) return false;
        }
        // Búsqueda libre
        if (f.search) {
            var s = [m.id_solicitud, m.ticket_ot, m.producto, m.personal_solicitante].join(' ').toLowerCase();
            if (s.indexOf(f.search) === -1) return false;
        }
        return true;
    });

    window.aotDatosFil = datos;

    if (datos.length === 0) {
        var msg = window.aotTabActiva === 'pend' ? 'Sin solicitudes pendientes' : 'Sin salidas registradas';
        tbody.innerHTML = '<tr><td colspan="8" class="td-placeholder"><i class="bi bi-box" style="font-size:1.5rem; opacity:0.3"></i><br>' + msg + '</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    datos.forEach(function(m) {
        var tr = document.createElement('tr');
        if (m.id_solicitud === window.aotDetalleId) tr.classList.add('aot-row-active');
        tr.innerHTML =
            '<td><span class="fw-bold" style="color:var(--primary,#5865F2);">' + (m.id_solicitud || '—') + '</span></td>'
            + '<td><strong>' + (m.ticket_ot || '—') + '</strong></td>'
            + '<td>' + (m.producto || '—') + '</td>'
            + '<td>' + (m.cantidad || '—') + (m.unidad_medida ? ' <small style="color:var(--subtext);">' + m.unidad_medida + '</small>' : '') + '</td>'
            + '<td>' + aotFmtMoney(m.costo_unit) + '</td>'
            + '<td><strong style="color:#16a34a;">' + aotFmtMoney(m.costo_total) + '</strong></td>'
            + '<td>' + (m.personal_solicitante || '—') + '</td>'
            + '<td>' + aotBadge(m.estado) + '</td>';
        tr.onclick = (function(row) {
            return function() { aotAbrirDetalle(row); };
        })(m);
        tbody.appendChild(tr);
    });
};

// ── Detalle lateral ───────────────────────────────────────────────
function aotAbrirDetalle(m) {
    window.aotDetalleId = m.id_solicitud;
    aotRenderTabla();

    var titulo = document.getElementById('aot-detalle-titulo');
    if (titulo) titulo.textContent = 'Solicitud ' + (m.id_solicitud || '');

    var html = '';
    html += '<div style="font-size:1.3rem; font-weight:800; color:var(--text); margin-bottom:0.4rem;">' + (m.id_solicitud || '—') + '</div>';
    html += '<div style="font-size:0.83rem; color:var(--subtext); margin-bottom:1rem;">N° OT: <strong>' + (m.ticket_ot || '—') + '</strong></div>';

    html += '<div class="aot-sec">';
    html += '<div class="aot-sec-hd">Detalle de la Solicitud</div>';
    html += '<div class="aot-field"><div class="aot-field-lbl">Estado</div><div class="aot-field-val">' + aotBadge(m.estado) + '</div></div>';
    html += '<div class="aot-field"><div class="aot-field-lbl">Producto</div><div class="aot-field-val"><strong>' + (m.producto || '—') + '</strong></div></div>';
    html += '<div class="aot-field"><div class="aot-field-lbl">Cantidad</div><div class="aot-field-val">' + (m.cantidad || '—') + ' ' + (m.unidad_medida || '') + '</div></div>';
    html += '<div class="aot-field"><div class="aot-field-lbl">Costo Unit.</div><div class="aot-field-val">' + aotFmtMoney(m.costo_unit) + '</div></div>';
    html += '<div class="aot-field"><div class="aot-field-lbl">Costo Total</div><div class="aot-field-val"><span style="font-size:1.05rem; color:#16a34a; font-weight:800;">' + aotFmtMoney(m.costo_total) + '</span></div></div>';
    html += '<div class="aot-field"><div class="aot-field-lbl">Personal</div><div class="aot-field-val" style="white-space:normal;">' + (m.personal_solicitante || '—') + '</div></div>';
    if (m.creado_en) {
        html += '<div class="aot-field"><div class="aot-field-lbl">Registrado</div><div class="aot-field-val" style="font-size:0.75rem;">' + aotFmtDateTime(m.creado_en) + '</div></div>';
    }
    html += '</div>';

    var scroll = document.getElementById('aot-detalle-scroll');
    if (scroll) scroll.innerHTML = html;

    var footer = document.getElementById('aot-detalle-footer');
    if (footer) {
        footer.style.display = 'flex';
        if (m.estado === 'Pendiente') {
            footer.innerHTML = '<button class="btn btn-sm btn-success flex-fill fw-bold" onclick="window.aotDespachar(' + JSON.stringify(m.id_solicitud) + ')"><i class="bi bi-box-seam me-1"></i>Aprobar y Despachar</button>';
        } else {
            footer.innerHTML = '<span style="font-size:0.8rem; color:var(--subtext); padding:4px;">Material ya despachado</span>';
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

// ── Despachar material ────────────────────────────────────────────
window.aotDespachar = function(idSolicitud) {
    if (!confirm('¿Aprobar y despachar este material? Se registrará como salida de almacén.')) return;

    fetch('/api/ot-materiales/' + encodeURIComponent(idSolicitud), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            accion: 'despachar',
            usuario: localStorage.getItem('fleet_correo') || ''
        })
    })
    .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Material despachado exitosamente', 'success');
        }
        window.aotDetalleId = null;
        var panel = document.getElementById('aot-panel-detalle');
        if (panel) panel.classList.remove('open');
        aotCargar();
    })
    .catch(function(err) {
        console.error('Error despachando material:', err);
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Error al despachar el material', 'danger');
        }
    });
};

// ── Exportar a Excel ──────────────────────────────────────────────
window.aotExportar = function() {
    var datos = window.aotDatosFil.length > 0 ? window.aotDatosFil : window.aotData;
    if (datos.length === 0) {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('No hay datos para exportar', 'warning');
        }
        return;
    }

    if (typeof window.descargarExcelDinamico === 'function') {
        var tmpId = 'aot-export-tmp';
        var existing = document.getElementById(tmpId);
        if (existing) existing.remove();

        var tbl = document.createElement('table');
        tbl.id = tmpId;
        tbl.style.display = 'none';
        var thead = '<thead><tr><th>ID Salida</th><th>N° OT</th><th>Producto</th><th>Cant.</th><th>U.M.</th><th>Costo Unit.</th><th>Costo Total</th><th>Personal</th><th>Estado</th></tr></thead>';
        var tbodyHtml = '<tbody>' + datos.map(function(m) {
            return '<tr>'
                + '<td>' + (m.id_solicitud || '') + '</td>'
                + '<td>' + (m.ticket_ot || '') + '</td>'
                + '<td>' + (m.producto || '') + '</td>'
                + '<td>' + (m.cantidad || '') + '</td>'
                + '<td>' + (m.unidad_medida || '') + '</td>'
                + '<td>' + aotFmtMoney(m.costo_unit) + '</td>'
                + '<td>' + aotFmtMoney(m.costo_total) + '</td>'
                + '<td>' + (m.personal_solicitante || '') + '</td>'
                + '<td>' + (m.estado || '') + '</td>'
                + '</tr>';
        }).join('') + '</tbody>';
        tbl.innerHTML = thead + tbodyHtml;
        document.body.appendChild(tbl);
        window.descargarExcelDinamico(tmpId, 'Almacen_OT');
        setTimeout(function() { var el = document.getElementById(tmpId); if (el) el.remove(); }, 1000);
        return;
    }

    // Fallback CSV
    var rows = [['ID Salida','N° OT','Producto','Cant.','U.M.','Costo Unit.','Costo Total','Personal','Estado']];
    datos.forEach(function(m) {
        rows.push([
            m.id_solicitud || '',
            m.ticket_ot || '',
            m.producto || '',
            m.cantidad || '',
            m.unidad_medida || '',
            aotFmtMoney(m.costo_unit),
            aotFmtMoney(m.costo_total),
            m.personal_solicitante || '',
            m.estado || ''
        ]);
    });
    var csv = rows.map(function(r) { return r.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'Almacen_OT.csv'; a.click();
    URL.revokeObjectURL(url);
};
